// The site-side glue for the croc-bite play route. main.js is the lifted engine and is owned by
// scripts/extract-mockup.mjs, so everything this site adds to the route lives here: the shared muted
// state, the ghost-tap gate on every reveal, and the round that keeps playing when the 3D context is
// taken away mid-match. The reset-to-cast control that also lived here moved into the shared player
// screen with the seat count and the names (ADR-0071, gh#264); main.js mounts that screen.
//
// It reaches the engine through the one handle the engine publishes on `window`, and holds no copy of
// any value the engine owns: the seat list, the phase, the round token and the tooth map are read at
// use time. A second copy of the phase here would be a second state machine writing the same HUD.
import { armAllButtons, inputClockGate, lastInputStamp } from '../../games/_arm-gate.ts';
// gh#227: the device's muted state, one slot for the whole site. This file is the only writer on this
// route — the engine deliberately stores no sound preference of its own.
import { isMuted, setMuted } from '../../shell/audio.ts';

// ---- the engine handle -------------------------------------------------------------------------

type Tooth = { id: string; state: string; isLosing: boolean };
type PressPayload = { token: number; isLosing: boolean };

/** Only the members this file actually uses, declared locally rather than as a global `Window`
 *  augmentation: two files augmenting the same interface is a tsc conflict waiting for the next
 *  route, and nothing outside this file needs the type. */
type KhengApp = {
  animationFrameId: number | null;
  /** gh#272: main.js's 3D state. 'deferred' = the first boot waits for the player screen's handover,
   *  which a null frame id must not be read as a failed boot. */
  render3D: 'deferred' | 'live' | 'off';
  /** Called by main.js once a deferred first boot has run, whichever way it ended. */
  after3DBoot?: () => void;
  /** The shared player screen's handle, set by main.js's mountPlayers (gh#264). */
  players?: { arm(): void };
  audio: { setMuted(muted: boolean): void };
  state: {
    phase: string;
    resolutionToken: number;
    players: readonly unknown[];
    teeth: Map<string, Tooth>;
    setAudioEnabled(enabled: boolean): void;
    pressTooth(toothId: string): PressPayload | null;
    completeSafeResolution(token: number): void;
    completeLosingResolution(token: number): void;
    beginPlayerTurn(): void;
    on(event: string, fn: () => void): () => void;
  };
};

const engine = (): KhengApp | undefined =>
  (window as unknown as { __khengApp?: KhengApp }).__khengApp;

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

// The engine's phase names, as strings: PHASES is private to main.js, so comparing against the
// literal is the only reading available from here.
const PHASE_SETUP = 'SETUP';
const PHASE_TURN_TRANSITION = 'TURN_TRANSITION';
const PHASE_RESOLVING_SAFE = 'RESOLVING_SAFE';
const PHASE_RESOLVING_LOSS = 'RESOLVING_LOSS';

// ---- the shared muted state --------------------------------------------------------------------

/** Pushes the DEVICE's stored preference into the engine, which keeps sound as an in-memory flag and
 *  stores nothing. setAudioEnabled emits, and the engine repaints both controls off that event, so
 *  nothing here writes a class or a glyph — one owner for the paint, one owner for the state. */
function paintSound(app: KhengApp): void {
  app.state.setAudioEnabled(!isMuted());
  app.audio.setMuted(isMuted());
}

/** gh#227. Both of the engine's sound controls read and write the site-wide slot in
 *  src/shell/audio.ts, so muting here is still muted on the next route the player opens.
 *
 *  The engine has its own listener on each of these controls, registered at boot and therefore ahead
 *  of these; it flips its in-memory flag and calls its own mixer. That is not a conflict to remove but
 *  the reason this handler is written as an assignment rather than a toggle: it recomputes the state
 *  from storage and pushes the result down, so whatever the engine just flipped is overwritten with
 *  the device's answer and any drift between the two is corrected on the next tap.
 *
 *  Painted BEFORE either listener attaches, because the device may already be muted when the route
 *  opens. No migration off any older per-route value: ADR-0064. */
function wireSound(app: KhengApp): void {
  paintSound(app);
  for (const id of ['btn-hud-sound', 'toggle-audio']) {
    $(id)?.addEventListener('click', () => {
      setMuted(!isMuted());
      paintSound(app);
    });
  }
}

// ---- the ghost-tap gate ------------------------------------------------------------------------

/** The engine's screens and the class each one is hidden or shown by. Two spellings, read off the
 *  engine rather than normalised: the three screens carry `hidden` while they are away, and the
 *  modals carry `open` while they are present. */
const REVEAL_CONTAINERS: ReadonlyArray<{
  id: string;
  cls: string;
  visibleWhenPresent: boolean;
  modal?: true;
}> = [
  { id: 'screen-setup', cls: 'hidden', visibleWhenPresent: false },
  { id: 'screen-hud', cls: 'hidden', visibleWhenPresent: false },
  { id: 'screen-result', cls: 'hidden', visibleWhenPresent: false },
  { id: 'modal-how', cls: 'open', visibleWhenPresent: true, modal: true },
  { id: 'modal-settings', cls: 'open', visibleWhenPresent: true, modal: true },
  { id: 'modal-reset', cls: 'open', visibleWhenPresent: true, modal: true },
];

/** ADR-0014's gate on screens this file cannot reach any other way. Every reveal inside the engine is
 *  a class flip in a closure with no hook, and the reveal that matters most — the result card, which
 *  puts the next-round button under the finger that just pressed the losing tooth — lands well after
 *  the tap that caused it. So the reveal is OBSERVED rather than called: one attribute observer per
 *  screen arms whatever became visible, which needs no call site inside the engine to maintain.
 *
 *  ponytail: an observer, not a list of engine functions to shadow. If the engine ever stops hiding a
 *  screen with a class, the upgrade path is a second predicate here, not a second mechanism. */
function watchEngineReveals(): void {
  if (typeof MutationObserver !== 'function') return;
  for (const { id, cls, visibleWhenPresent } of REVEAL_CONTAINERS) {
    const el = $(id);
    if (!el) continue;
    const visible = (): boolean => el.classList.contains(cls) === visibleWhenPresent;
    let wasVisible = visible();
    new MutationObserver(() => {
      const now = visible();
      if (now && !wasVisible) armAllButtons(el);
      wasVisible = now;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
}

/** ADR-0057: closing a modal is itself a reveal. The controls the modal was covering are enabled and
 *  their arm window expired long ago, which is exactly why the second contact of the double-tap that
 *  closed the modal fires one. No class changes on the screen BEHIND the modal, so the observer above
 *  cannot see this reveal and it is armed explicitly.
 *
 *  The modal being closed is deliberately NOT in the set: on the pointerdown pass it is still open,
 *  and disabling its own close button there would eat the contact that closes it. Nor is any gate
 *  whose region CONTAINS that modal -- the player screen's, below. */
function armWhatTheModalCovered(): void {
  for (const { id, cls, visibleWhenPresent, modal } of REVEAL_CONTAINERS) {
    const el = modal ? null : $(id);
    if (el && el.classList.contains(cls) === visibleWhenPresent) armAllButtons(el);
  }
  // The no-3D board, which no entry above can hold: it is this file's own DOM rather than one of the
  // engine's screens. It is armed on every rebuild and on nothing else, so a modal opened mid-round
  // would otherwise leave every tooth behind it enabled with its window long expired.
  const board = $(BOARD_ID);
  if (board) armAllButtons(board);
  armToothInput();
  // gh#264: the open shared player screen is a region a modal can cover too. Its own arm() runs the
  // screen's surface gate, which re-applies start's validity when the window closes; a bare
  // armAllButtons here would hand start back even with two rows showing one name.
  // Only once NO modal is open. That gate spans the whole of #app, the modals inside it, so on the
  // pointerdown pass it would disable the very close control being pressed and the click that closes
  // the modal would never fire (gh#264 REFUTE round 5). The click leg runs after the engine's own
  // close on the button, so the screen is armed there, anchored to that press's release (ADR-0059).
  const covered = REVEAL_CONTAINERS.some(
    ({ id, cls, visibleWhenPresent, modal }) => modal && $(id)?.classList.contains(cls) === visibleWhenPresent,
  );
  const players = $('croc-players');
  if (players && !players.hidden && !covered) engine()?.players?.arm();
}

/** The 3D board, which no entry above can hold either: it has no <button> to disable. The engine's
 *  input controller takes a tooth off a raycast on the canvas container's own pointer events, and two
 *  closes leave its lock open at the instant the modal goes — the reset confirm's cancel hands the
 *  turn back inside its click, and settings opened from the HUD never took the turn away. So the
 *  same window every other control on this route gets is enforced on the canvas at the press, on the
 *  input clock (ADR-0059), anchored to the later end of the press that closed the modal.
 *
 *  Stamp-only, with no timer: nothing here draws a disabled state, so there is nothing for a timer to
 *  own. An in-window contact extends the window, as it does on every armed stage. */
const toothWindow = inputClockGate();
let heldPointer: number | undefined;

function armToothInput(): void {
  toothWindow.anchor(lastInputStamp());
}

/** Stops the press before the engine sees it. The release is stopped ONLY when its own press was:
 *  a release swallowed after the engine saw the press would strand the engine's one-active-pointer
 *  latch, and every later touch (a new pointer id each time) would then be refused for good. */
const guardToothInput = (ev: PointerEvent): void => {
  // The canvas, never the container: the no-3D board is appended inside the same container, and
  // swallowing its contacts here would blind the in-window restart of the board's own gate.
  if (!(ev.target as Element | null)?.closest?.('#canvas-container canvas')) return;
  if (ev.type === 'pointerdown') {
    heldPointer = toothWindow.isOpen(ev) ? undefined : ev.pointerId;
    if (heldPointer === undefined) return;
    toothWindow.hold(ev);
  } else {
    if (ev.pointerId !== heldPointer) return;
    heldPointer = undefined;
  }
  ev.stopPropagation();
};

/** Every control that closes, cancels or confirms one of the engine's modals. The shared player
 *  screen's own dialogs arm what they cover themselves (ADR-0071, ADR-0057). */
const CLOSE_CONTROLS = '#btn-close-how, #btn-close-settings, #btn-reset-cancel, #btn-reset-confirm';

// ---- the no-3D board ---------------------------------------------------------------------------

const BOARD_ID = 'croc-fallback-board';
// The engine's own gap between a safe tooth settling and the next player's turn beginning. Mirrored
// rather than shortened: this board is the same party game, and the pause is when the phone is passed.
const TURN_HANDOFF_MS = 700;
let disarmBoard: (() => void) | null = null;

/** One row of tooth buttons for one jaw. Digits, not emoji: a glyph-only control would be an
 *  icon-only button with no label, and the board is built by createElement, which no gate reads. */
function toothRow(label: string, ids: readonly string[], resolved: (id: string) => boolean): HTMLElement {
  const row = document.createElement('div');
  row.className = 'player-count-pills';
  // Inline, because the lifted stylesheet is the engine's file and a jaw of ten pills does not fit
  // one 320px line. The two properties are the whole difference from the seat grid this class styles.
  row.style.flexWrap = 'wrap';
  row.style.justifyContent = 'center';

  const caption = document.createElement('strong');
  caption.textContent = label;
  row.appendChild(caption);

  ids.forEach((id, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'count-pill';
    btn.dataset.tooth = id;
    btn.textContent = String(i + 1);
    // Set BEFORE armAllButtons walks the board: the gate reads an already-disabled control it did not
    // disable itself as the caller's own intent, so a pressed tooth is not handed back enabled.
    btn.disabled = resolved(id);
    row.appendChild(btn);
  });
  return row;
}

/** Repaints the board from the engine's tooth map. The HUD around it — whose turn it is, the round
 *  number, the live odds, the result card — is the engine's own and keeps working: those are DOM
 *  writes driven by state events, and only the 3D half of the route died. */
function renderBoard(app: KhengApp): void {
  const host = $(BOARD_ID);
  if (!host) return;
  const teeth = [...app.state.teeth.values()];
  const resolved = (id: string): boolean => app.state.teeth.get(id)?.state !== 'unresolved';

  const card = document.createElement('div');
  card.className = 'glassPanel modal-box';
  const notice = document.createElement('p');
  notice.textContent = 'ไม่สามารถเปิด 3D ได้';
  const heading = document.createElement('h2');
  heading.textContent = 'ฟันปริศนา';
  card.append(notice, heading);
  card.appendChild(toothRow('บน', teeth.filter((t) => t.id.startsWith('upper_')).map((t) => t.id), resolved));
  card.appendChild(toothRow('ล่าง', teeth.filter((t) => t.id.startsWith('lower_')).map((t) => t.id), resolved));
  host.replaceChildren(card);

  // ADR-0014 and ADR-0057: the board is rebuilt under the finger that pressed the last tooth, so the
  // release of that same press must not open a second one. Disarmed first, or the previous gate's
  // timer would still be holding a set of nodes this rebuild has already detached.
  disarmBoard?.();
  disarmBoard = armAllButtons(host);
}

// gh#264: the class main.js's markup puts on the setup screen until the players are handed over. The
// board wears the same name, under its own rule in overrides.css.
const HELD = 'held-for-players';

/** gh#264, ADR-0071 ruling 1: the shared player screen is the first screen. With no context the board
 *  goes up at mount, before that screen has opened, so the board is held hidden from insertion until
 *  the players are handed over, and armed as it comes back (a release is a reveal, ADR-0057).
 *
 *  The release follows the setup screen's own hold rather than a second signal: main.js lifts that on
 *  exactly the paths that end the wait -- the screen's start (GameApp.startWithPlayers), a mount that
 *  throws, an open that fails later, a page with no players root. Releasing on the OPEN instead would
 *  show a pressable board behind a screen that has handed nobody over yet. No hold when setup is not
 *  held (a context lost after the handover), and none where no observer could ever release it. */
function holdUntilHandover(host: HTMLElement): void {
  const setup = $('screen-setup');
  if (!setup?.classList.contains(HELD) || typeof MutationObserver !== 'function') return;
  host.classList.add(HELD);
  const watch = new MutationObserver(() => {
    if (setup.classList.contains(HELD)) return;
    watch.disconnect();
    host.classList.remove(HELD);
    disarmBoard?.();
    disarmBoard = armAllButtons(host);
  });
  watch.observe(setup, { attributes: true, attributeFilter: ['class'] });
}

/** Plays one press through the engine's own state machine, then settles it.
 *
 *  Settling is this file's job on this path and not a shortcut: the engine completes a press from the
 *  callbacks of the 3D hand animation, and those are driven by the render loop the context loss just
 *  ended. Without this, the round stops on the first tooth with the HUD still live. */
function settle(app: KhengApp, token: number, isLosing: boolean): void {
  if (isLosing) {
    app.state.completeLosingResolution(token);
    return;
  }
  app.state.completeSafeResolution(token);
  window.setTimeout(() => {
    // The token moves on a new round and on a return to setup, so a handoff scheduled by a round the
    // player has since left cannot start a turn in the round that replaced it.
    if (token !== app.state.resolutionToken) return;
    if (app.state.phase === PHASE_TURN_TRANSITION) app.state.beginPlayerTurn();
  }, TURN_HANDOFF_MS);
}

/** ADR-0051 and ADR-0060: a route that draws with WebGL keeps the page usable when the context goes
 *  away. The engine has no handler for that at all and its render loop reschedules unconditionally, so
 *  a lost context leaves a live HUD naming whose turn it is over a board nobody can see, with the
 *  tooth input path still taking presses into an undrawn scene.
 *
 *  So the 3D half is cut and the round continues on real buttons. The alternative considered was
 *  one-bomb's halt panel — discard the round behind a labelled restart. Rejected here because it is a
 *  strictly worse outcome for the same amount of code: this engine's state machine is reachable
 *  (window.__khengApp), it holds the whole round, and every projection the players read is already
 *  painted from state events, so the round the context loss interrupted can simply be finished. No
 *  round is discarded and ADR-0008 has nothing to forgive.
 *
 *  preventDefault() is deliberately NOT called: the programs and geometry were built inside the
 *  engine, so a `webglcontextrestored` this file cannot act on would be worse than none. */
function cutTo2D(app: KhengApp): void {
  // The loop first: it reschedules at the top of every frame, so the id always holds a pending
  // request, and a frame that runs after the container below is gone reads a null clientWidth.
  // Marked off as well, so the player screen's render hold releasing later never restarts it
  // (gh#272, main.js applyRenderHold).
  app.render3D = 'off';
  if (app.animationFrameId !== null) cancelAnimationFrame(app.animationFrameId);

  // A SHALLOW clone, which is what severs the tooth input path: the engine's pointer and keyboard
  // listeners sit on the CONTAINER, not on the canvas, so removing the canvas alone would leave every
  // press still raycasting into a scene that is no longer drawn — the raycast is CPU-side and keeps
  // answering. Cloning without children drops the listeners and the dead canvas in one move, and
  // keeps the id and the box the stylesheet positions.
  const dead = $('canvas-container');
  if (!dead) return;
  const container = dead.cloneNode(false) as HTMLElement;
  dead.replaceWith(container);

  const host = document.createElement('div');
  host.id = BOARD_ID;
  host.className = 'ui-screen';
  holdUntilHandover(host);
  container.appendChild(host);
  host.addEventListener('click', (ev) => {
    const btn = (ev.target as Element | null)?.closest<HTMLButtonElement>('[data-tooth]');
    const toothId = btn?.dataset.tooth;
    if (toothId === undefined) return;
    const payload = app.state.pressTooth(toothId);
    if (!payload) return;
    settle(app, payload.token, payload.isLosing);
    renderBoard(app);
  });

  app.state.on('phaseChange', () => renderBoard(app));
  app.state.on('roundReset', () => renderBoard(app));
  renderBoard(app);

  // A loss can land BETWEEN a press and its resolution, and that press's completion was waiting on an
  // animation callback the cancelled loop will never deliver. Finishing it here is what keeps the
  // round from opening on a board where nothing is pressable.
  // A loss during the round's own INTRO needs nothing by contrast: the engine's roundReset handler
  // already scheduled the first turn on a plain timer, and that timer survives the loss.
  if (app.state.phase === PHASE_RESOLVING_SAFE) settle(app, app.state.resolutionToken, false);
  else if (app.state.phase === PHASE_RESOLVING_LOSS) settle(app, app.state.resolutionToken, true);
}

/** ADR-0051 again, for the device that never had a context at all rather than the one that lost it.
 *  The engine's boot throws on a null context and reveals its notice, which is readable but is not a
 *  round: nothing on that page can be played. The condition the ADR does not move asks for the round
 *  to stay reachable, so this path takes the SAME fallback the mid-match loss takes — the DOM board —
 *  rather than a second mechanism written for it (the alternative was a 2D canvas, which is strictly
 *  more code for a worse board: no seats, no arm gate, nothing the engine already paints).
 *
 *  The engine's notice is dismissed as the board goes up because the board carries the same message
 *  inside the play surface, and leaving both would centre a panel over the screen nobody could then
 *  read. The engine hid every screen when it showed that notice, and the setup screen is NOT put back
 *  here: since ADR-0071 the first screen is the shared player screen, and its start is what brings
 *  the setup screen up (GameApp.startWithPlayers). Putting it back here would raise it over the
 *  player screen, which has usually opened by now. */
function bootWithout3D(app: KhengApp): void {
  $('webglUnsupportedNotice')?.classList.add('hidden');
  cutTo2D(app);
}

// ---- mount -------------------------------------------------------------------------------------

/** gh#215. The engine's canvas, not the container: `webglcontextlost` is dispatched at the canvas.
 *  Optional chaining is load-bearing rather than defensive habit -- with no context at all the engine
 *  never created a canvas, and a route with no context to lose cannot lose one. `once`, because the
 *  canvas is gone by the end of the handler. */
function watchContextLoss(app: KhengApp): void {
  document
    .querySelector('#canvas-container canvas')
    ?.addEventListener('webglcontextlost', () => cutTo2D(app), { once: true });
}

/** gh#272: the first 3D boot ran at the player screen's handover rather than before mount, so the two
 *  things mount does with its outcome happen here instead: a boot that never reached its first frame
 *  takes the no-3D board, and one that did gets its loss handler. It runs inside the screen's close,
 *  before the handover reaches the engine, so the board is inserted while the setup screen is still
 *  held and comes up with it -- the same order as the no-context path at mount. */
function afterDeferredBoot(app: KhengApp): void {
  if (app.animationFrameId === null) bootWithout3D(app);
  else watchContextLoss(app);
}

function mount(): void {
  const app = engine();
  if (!app) return;

  wireSound(app);

  // The engine's own fact, not a canvas in the container. The scene appends its canvas partway
  // through its setup, so a throw after that point leaves the canvas sitting on a page with no board:
  // a canvas test reads that as a working 3D boot, skips this fallback, and leaves a live interface
  // raycasting into a scene that never started its loop: no board, no round, and ADR-0051's condition
  // broken. The frame id is the last thing the engine's guarded block assigns, and it is assigned
  // synchronously, so it is null when that block failed BEFORE its first frame. Stated that
  // narrowly on purpose: the id is assigned on the frame callback's first line and a whole frame
  // body then runs inside the same guarded block, so a throw in that body would set the id, reach
  // the notice, and skip this fallback. No realistic first-frame throw was identified, which is why
  // the predicate stands and only the claim about it was narrowed.
  // The context-loss registration below needs no companion test of its own: on this path the
  // fallback replaces the container with a childless clone, so the query down there finds no canvas
  // and its optional chain registers nothing.
  // Ahead of BOTH the observer install and the arming block, so the observer's baseline and the
  // block below read the screens as the fallback leaves them.
  // gh#272: a boot still DEFERRED to the player screen's handover is not a failed one.
  if (app.animationFrameId === null && app.render3D !== 'deferred') bootWithout3D(app);

  watchEngineReveals();

  // The engine closes a modal from a button on CLICK, and both clocks have to be covered.
  // ADR-0059: a gate built at pointerdown anchors its window to the PRESS, one built at click anchors
  // to the RELEASE, and on a long press the pointerdown-anchored window is already over by the time
  // the finger lifts. Capture on the pointerdown leg, so this runs ahead of the engine's own close
  // and can still disable what is behind the modal before the release is dispatched.
  const armBehindModal = (ev: Event): void => {
    if ((ev.target as Element | null)?.closest(CLOSE_CONTROLS)) armWhatTheModalCovered();
  };
  document.addEventListener('pointerdown', armBehindModal, true);
  document.addEventListener('click', armBehindModal);
  // Capture on document, so the 3D board's guard runs before the engine's listeners on the container.
  document.addEventListener('pointerdown', guardToothInput, true);
  document.addEventListener('pointerup', guardToothInput, true);

  // gh#215, on the canvas a boot at construction made. A deferred boot has no canvas yet: its
  // registration, or its fallback, waits for the boot (afterDeferredBoot).
  watchContextLoss(app);
  app.after3DBoot = (): void => afterDeferredBoot(app);

  // A setup screen already up at mount was never revealed, so no observer will arm it. Since ADR-0071
  // it is normally hidden here -- the player screen comes first and its start reveals setup, which the
  // observer arms -- and it is up only when no player screen was mounted. Every other screen on this
  // route is armed by watchEngineReveals when the engine reveals it.
  if (app.state.phase === PHASE_SETUP) {
    const setup = $('screen-setup');
    if (setup) armAllButtons(setup);
  }
}

// WINDOW's DOMContentLoaded, never `document`'s: the engine registers its boot on `window` and
// main.js is imported first, so its listener runs first and `__khengApp` exists by the time this one
// does. A `document` listener runs before ANY window listener and would find no engine to wire.
if (engine() !== undefined) {
  mount();
} else {
  window.addEventListener('DOMContentLoaded', mount, { once: true });
}
