// The site-side glue for the croc-bite play route. main.js is the lifted engine and is owned by
// scripts/extract-mockup.mjs, so everything this site adds to the route lives here: the shared muted
// state, the ghost-tap gate on every reveal, the reset-to-cast control, and the round that keeps
// playing when the 3D context is taken away mid-match.
//
// It reaches the engine through the one handle the engine publishes on `window`, and holds no copy of
// any value the engine owns: the seat list, the phase, the round token and the tooth map are read at
// use time. A second copy of the phase here would be a second state machine writing the same HUD.
import { armAllButtons } from '../../games/_arm-gate.ts';
// gh#227: the device's muted state, one slot for the whole site. This file is the only writer on this
// route — the engine deliberately stores no sound preference of its own.
import { isMuted, setMuted } from '../../shell/audio.ts';
// The wipe behind the reset control. It reads only the array's length, which is what makes a typed
// name unable to survive a reset whatever is passed in.
import { resetCastNames } from '../_mascots.ts';

// ---- the engine handle -------------------------------------------------------------------------

type Tooth = { id: string; state: string; isLosing: boolean };
type PressPayload = { token: number; isLosing: boolean };

/** Only the members this file actually uses, declared locally rather than as a global `Window`
 *  augmentation: two files augmenting the same interface is a tsc conflict waiting for the next
 *  route, and nothing outside this file needs the type. */
type KhengApp = {
  animationFrameId: number | null;
  audio: { setMuted(muted: boolean): void };
  state: {
    phase: string;
    resolutionToken: number;
    players: readonly unknown[];
    teeth: Map<string, Tooth>;
    setAudioEnabled(enabled: boolean): void;
    updatePlayerName(index: number, rawName: string): void;
    pressTooth(toothId: string): PressPayload | null;
    completeSafeResolution(token: number): void;
    completeLosingResolution(token: number): void;
    beginPlayerTurn(): void;
    on(event: string, fn: () => void): () => void;
  };
  ui: { renderMascotInputs(): void };
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
  { id: 'modal-reset-names', cls: 'open', visibleWhenPresent: true, modal: true },
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
 *  and disabling its own close button there would eat the contact that closes it. */
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
}

/** Every control that closes, cancels or confirms a modal on this route. */
const CLOSE_CONTROLS =
  '#btn-close-how, #btn-close-settings, #btn-reset-cancel, #btn-reset-confirm, ' +
  '#btn-reset-names-cancel, #btn-reset-names-confirm';

// ---- the reset-to-cast control ------------------------------------------------------------------

// The trigger and its confirm step, injected because markup.html is the lifted engine's file. The
// trigger's id is literal text in a real opening tag, which is what src/play/reset-control-pin.test.mjs
// reads. Classes are the engine's own, so the control is styled by the lifted stylesheet and adds no
// rule of its own; the confirm reuses the same overlay shape the engine's three modals use.
const RESET_TRIGGER_HTML =
  '<button class="btnBase secondaryBtn" id="btn-reset-names" type="button">รีเซ็ตเป็นชื่อสัตว์</button>';

const RESET_MODAL_HTML = `
<div id="modal-reset-names" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-names-title">
  <div class="glassPanel modal-box" style="text-align:center">
    <h2 id="reset-names-title" style="justify-content:center">รีเซ็ตเป็นชื่อสัตว์</h2>
    <p style="margin-bottom:18px">ชื่อที่พิมพ์ไว้ทั้งหมดจะหายไป และกลับไปเป็นชื่อสัตว์ประจำที่นั่ง จำนวนผู้เล่นยังเท่าเดิม</p>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="btn-reset-names-cancel" class="btnBase secondaryBtn" type="button">ไม่รีเซ็ต</button>
      <button id="btn-reset-names-confirm" class="btnBase primaryBtn" type="button">รีเซ็ตเลย</button>
    </div>
  </div>
</div>`;

/** Owner ruling 2026-08-31: reset restores the animal names, keeps the group, and wipes typed names
 *  behind a confirm. The wipe is resetCastNames and the confirm is the modal above.
 *
 *  Written back through the engine's own updatePlayerName, one seat at a time, so the engine's stored
 *  raw name is what changes — writing the fields instead would be undone by the next rebuild, which
 *  reads every field back from that stored value. */
function resetToCast(app: KhengApp): void {
  const cast = resetCastNames(app.state.players);
  cast.forEach((name, i) => app.state.updatePlayerName(i, name));
  app.ui.renderMascotInputs();
}

function wireReset(app: KhengApp): void {
  const overlay = $('modal-reset-names');
  $('btn-reset-names')?.addEventListener('click', () => overlay?.classList.add('open'));
  $('btn-reset-names-cancel')?.addEventListener('click', () => overlay?.classList.remove('open'));
  $('btn-reset-names-confirm')?.addEventListener('click', () => {
    resetToCast(app);
    overlay?.classList.remove('open');
  });
}

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
 *  inside the play surface, and leaving both would centre a panel over the seat list nobody could
 *  then read. The engine hid every screen when it showed that notice, so the setup screen is put back
 *  — only while the round has not begun, since from the first phase change the engine's own updateUI
 *  owns which screen is on display. */
function bootWithout3D(app: KhengApp): void {
  $('webglUnsupportedNotice')?.classList.add('hidden');
  if (app.state.phase === PHASE_SETUP) $('screen-setup')?.classList.remove('hidden');
  cutTo2D(app);
}

// ---- mount -------------------------------------------------------------------------------------

function mount(): void {
  const app = engine();
  if (!app) return;

  const card = $('setup-mascots-list');
  card?.insertAdjacentHTML('afterend', RESET_TRIGGER_HTML);
  $('game-ui-container')?.insertAdjacentHTML('beforeend', RESET_MODAL_HTML);

  wireSound(app);
  wireReset(app);

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
  // Ahead of BOTH the observer install and the arming block on purpose — putting the setup
  // screen back is a reveal, and running first means the observer's baseline reads that screen as
  // already on display, so the block below is its one and only arm rather than one of two.
  if (app.animationFrameId === null) bootWithout3D(app);

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

  // gh#215. The engine's canvas, not the container: `webglcontextlost` is dispatched at the canvas.
  // Optional chaining is load-bearing rather than defensive habit — with no context at all the engine
  // never created a canvas, and a route with no context to lose cannot lose one. `once`, because the
  // canvas is gone by the end of the handler.
  document
    .querySelector('#canvas-container canvas')
    ?.addEventListener('webglcontextlost', () => cutTo2D(app), { once: true });

  // The setup screen is up already, so no reveal will ever be observed for it — every other screen on
  // this route is armed by watchEngineReveals when the engine reveals it.
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
