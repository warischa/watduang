// The own page of each prize-draw 3D game (gh#305, gh#306, gh#307, gh#319): a fixed, clearly labelled DEMO
// of the game, run in memory. Nothing is stored, no event is read or replaced, and a refresh replays the same demo.
//
// The outcome is a real one. The fixtures walk the event domain itself (src/prize-event/event.ts: createEvent,
// prepareCards, drawNext) over 200 synthetic names with a fixed seed, so every outcome the host receives is
// exactly the shape the prize-draw projector commits -- an elimination round, a card round's deal then its
// drawn rule, or the final with its prizes -- and never a hand-built record. The fireworks game shows both
// of its modes (an elimination round and the final); the final modes take 1 to 5 prizes.
//
// The reveal runs through the one shared host (game-host.ts startReveal), so fallback, the render hold and
// disposal are the projector's own. The host draws the committed 2D view on its first exit (reveal.ts), the
// same frame the projector falls back to. A hold game (game-registry.ts settleFor) settles with its picture
// still up over that frame: the demo retains its handle and disposes it on the replay, a prize-count change
// and leaving, as the stage does. While a reveal plays the bar holds only the demo label, so nothing
// restarts it mid-play; its exit brings the controls back.
//
// Before the press each phase-2 game idles on its own picture (gh#319): the zones and marbles rounds draw
// their idle frames (zones-idle.ts, marbles-idle.ts), a pick final draws its objects with the demo's five
// picks placed (final-picks.ts). Phase-1 games keep the shared standby.
//
// Every reveal of a control goes through show(), which arms the region it shows (ADR-0017). The controls are
// rebuilt on each change and re-armed with them. No anchor element anywhere here (ADR-0014, ADR-0055): the
// way out is the page chrome's exit control, outside src/play/.

import { armAllButtons } from '../../games/_arm-gate.ts';
import {
  advance,
  createEvent,
  drawNext,
  liveIds,
  MAX_PRIZES,
  MIN_PRIZES,
  prepareCards,
  revealDrawn,
  type EventState,
  type Person,
  type Rng,
} from '../../prize-event/event.ts';
import { isPickFinal, type CutGame, type FinalGame, type GameChoices, type PickFinal } from '../../prize-event/game-contract.ts';
import { ELIMINATION_ROUNDS, proposeSchedule } from '../../prize-draw/schedule.ts';
import { renderObjects } from '../prize-draw/final-picks.ts';
import { idleZones, renderZonesIdle } from '../prize-draw/zones-idle.ts';
import { idleMarbles, renderMarblesIdle } from '../prize-draw/marbles-idle.ts';
import { screenView, type ScreenView } from '../../prize-event/view.ts';
import type { CommittedOutcome, GameId } from './game-contract.ts';
import { startReveal, type HostOptions, type RevealHost } from './game-host.ts';
import { settleFor } from './game-registry.ts';
import { fitAll, writeName } from './names-dom.ts';
import { announce, fitFrame, prizeLine, renderScreen } from './reveal.ts';

export type DemoMode = 'round' | 'final';

/** The screens that draw a name field (the projector route's own set, stage.ts markField). The zones idle
 *  joins them: its field is .pd-zfield, which the phone rules stack one panel per row (demo.css). */
const FIELD_SCREENS = new Set(['round', 'reveal', 'final', 'zones']);

/** Which steps each game plays (game-registry.ts eligibility), in the order its page offers them. */
export const DEMO_MODES: Record<GameId, readonly DemoMode[]> = {
  fireworks: ['round', 'final'],
  cards: ['round'],
  ladder: ['final'],
  zones: ['round'],
  marbles: ['round'],
  envelopes: ['final'],
  flipcards: ['final'],
};

/** 200 also keeps the cards demo legal: its proposed schedule cuts round 1 from 200 to exactly 100, and cards
 *  play only a round that cuts exactly in half (event.ts cutsInHalf; createEvent refuses any other). */
export const DEMO_HEADS = 200;
/** Fixed, so every load plays the same demo: the page is a demonstration, never a draw. */
export const DEMO_SEED = 2570;
export const DEMO_PRIZES = 3;

/** The boards' sample prize names, verbatim and in order (PRIZES in
 *  docs/verification/evidence/gh302-boards-2026-11-11/make-boards.mjs): the fixture's prizes, so the result
 *  names a prize instead of repeating its label (gh#319 PD-317-05 a, owner accepted for the phase-1 demos too). */
export const DEMO_PRIZE_NAMES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'ลำโพงไร้สาย', 'หูฟังไร้สาย'];

/** No board draws this page, so every label here but the reveal button is owner-approved copy (2026-11-13). The
 *  reveal button reuses the projector MC button's label (src/play/prize-draw/stage.ts), the same action. */
export const COPY = {
  badge: 'ตัวอย่าง ไม่ใช่งานจริง',
  eventName: 'งานเลี้ยงปีใหม่ (ตัวอย่าง)',
  mode: {
    round: 'รอบคัดออก',
    final: 'รอบชิง',
  } as Record<DemoMode, string>,
  prizeCount: 'จำนวนรางวัล',
  deal: 'แจกไพ่',
  reveal: 'เปิดผล',
  replay: 'ดูอีกครั้ง',
};

/** A seeded source in [0, 1) (mulberry32), shaped as the event's Rng. Never cryptographic: the demo's
 *  outcome is meant to be the same on every load. */
export function demoRng(seed: number): Rng {
  let a = seed >>> 0;
  const float = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float,
    int: (n) => Math.floor(float() * n),
    hex: (bytes) => Array.from({ length: bytes }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join(''),
  };
}

/** The synthetic room: numbered names, so no invented person is shown. */
export function demoNames(n = DEMO_HEADS): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1).padStart(3, '0'));
}

export type DemoOutcome = CommittedOutcome & { game: GameId };
export type DemoStep = {
  /** The reveal's key, built as the projector builds it, so cosmetic randomness is seeded the same way. */
  key: string;
  outcome: DemoOutcome;
  /** The step's participants, in roster order: the round's live field, or the five finalists. */
  people: Person[];
  /** The event once this step is shown: its 2D view is what the host falls back to and settles on. */
  after: EventState;
};
export type DemoRun = { start: EventState; steps: DemoStep[] };

const clampPrizes = (n: number): number => Math.min(MAX_PRIZES, Math.max(MIN_PRIZES, Math.round(n)));

/** The demo's committed steps for `game` in `mode`, from the event domain's own walk. */
export function demoRun(game: GameId, mode: DemoMode, prizeCount = DEMO_PRIZES): DemoRun {
  if (!DEMO_MODES[game].includes(mode)) throw new RangeError(`${game} has no ${mode} demo`);
  const rng = demoRng(DEMO_SEED);
  const games: GameChoices =
    mode === 'round'
      ? { rounds: [game as Exclude<CutGame, null>, null, null, null], final: null }
      : { rounds: [null, null, null, null], final: game as Exclude<FinalGame, null> };
  const prizes = DEMO_PRIZE_NAMES.slice(0, clampPrizes(prizeCount));
  let s = createEvent(
    { eventName: COPY.eventName, names: demoNames(), schedule: proposeSchedule(DEMO_HEADS), prizes, games },
    rng,
  );
  const byId = new Map(s.setup.people.map((p) => [p.id, p]));
  const people = (state: EventState): Person[] => liveIds(state).map((id) => byId.get(id)!);
  const steps: DemoStep[] = [];
  const push = (after: EventState, outcome: CommittedOutcome): void => {
    if (outcome.game !== game) throw new Error(`the demo committed a ${String(outcome.game)} step for ${game}`);
    const step = outcome.kind === 'final' ? 'final' : `${outcome.kind}${outcome.round}:${outcome.code}`;
    steps.push({ key: `demo:${after.eventKey}:${step}`, outcome: outcome as DemoOutcome, people: people(after), after });
  };

  if (mode === 'round') {
    const start = s;
    if (game === 'cards') {
      s = prepareCards(s, rng);
      const prepared = s.prepared;
      if (prepared?.game !== 'cards') throw new Error('the cards demo stored no deal');
      push(s, { kind: 'deal', ...prepared });
    }
    const drawn = revealDrawn(drawNext(s, rng));
    push(drawn, { kind: 'round', ...drawn.rounds[0]! });
    return { start, steps };
  }
  // The final: the four elimination rounds are drawn in plain 2D first, so the finalists are real survivors.
  // The step into a ladder final draws its slot layout from the same source (event.ts advance).
  for (let round = 0; round < ELIMINATION_ROUNDS; round++) s = advance(revealDrawn(drawNext(s, rng)), rng);
  const start = s;
  const picks = game === 'ladder' || isPickFinal(game) ? liveIds(s) : undefined;
  const drawn = revealDrawn(drawNext(s, rng, picks));
  push(drawn, { kind: 'final', prizes: drawn.setup.prizes, ...drawn.final! });
  return { start, steps };
}

export type DemoDeps = {
  doc: Document;
  root: HTMLElement;
  live: HTMLElement;
  game: GameId;
  /** Starts a step's reveal (game-host.ts startReveal, on the browser by default). Tests pass a fake. */
  startReveal?: (options: HostOptions<GameId>) => RevealHost;
  whenBoldLoaded?: (cb: () => void) => void;
};

export type DemoHandle = {
  /** Place the bar and scale the frame to the screen again (a resize, the site faces loading). */
  refit(): void;
  dispose(): void;
};

export function mountDemo(deps: DemoDeps): DemoHandle {
  const { doc, root, live, game } = deps;
  const begin = deps.startReveal ?? ((options: HostOptions<GameId>): RevealHost => startReveal(options));
  const modes = DEMO_MODES[game];
  let mode: DemoMode = modes[0]!;
  let prizes = DEMO_PRIZES;
  let run = demoRun(game, mode, prizes);
  /** The next step the go button plays; past the last one it replays. */
  let next = 0;
  let active: RevealHost | null = null;
  /** Numbers reveals: a callback from a reveal that is no longer the current one is dropped. */
  let seq = 0;

  const viewport = doc.createElement('div');
  viewport.className = 'pr-viewport';
  // The frame is fitted to this box, not to the viewport: under 640px the bar flows below the box (demo.css).
  const stagebox = doc.createElement('div');
  stagebox.className = 'pr-stagebox';
  const scaled = doc.createElement('div');
  scaled.className = 'pd-scaled';
  const frame = doc.createElement('div');
  frame.className = 'pd-frame';
  scaled.appendChild(frame);
  // The held-picture overlay (gh#319): inside the frame box, at the frame's own geometry and transform, so a
  // node lifted into it keeps its place but paints above the 3D layer (the scaled frame's transform is a
  // stacking context that would trap it under the canvas). Empty unless a hold game's picture is up.
  const over = doc.createElement('div');
  over.className = 'pd-over';
  stagebox.append(scaled, over);
  // The host fills this layer over the frame while a step presents, and empties it on exit.
  const layer3d = doc.createElement('div');
  layer3d.className = 'pr-3d';
  const bar = doc.createElement('div');
  bar.className = 'pr-bar';
  viewport.append(stagebox, layer3d, bar);
  root.replaceChildren(viewport);

  /** The one way a control becomes visible here: un-hide the region, then arm it. */
  const show = (region: HTMLElement): void => {
    region.hidden = false;
    armAllButtons(region);
  };

  const badge = (): HTMLElement => {
    const p = doc.createElement('p');
    p.className = 'pr-badge';
    p.textContent = COPY.badge;
    return p;
  };

  const button = (text: string, className: string, onClick: () => void, pressed?: boolean): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    return b;
  };

  const group = (label: string, children: HTMLElement[]): HTMLElement => {
    const g = doc.createElement('div');
    g.className = 'pr-group';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', label);
    g.append(...children);
    return g;
  };

  /** The state's people in roster order: the round's live field, or the five finalists (the stage's own helper). */
  const people = (s: EventState): Person[] => {
    const byId = new Map(s.setup.people.map((p) => [p.id, p]));
    return liveIds(s).map((id) => byId.get(id)!);
  };

  /** A zones round before its draw (PD-315-01 a): the zones the room stands in, from the event key, the round
   *  and the live field alone (zones-idle.ts), the picture the projector idles on. */
  const paintZonesIdle = (s: EventState, view: ScreenView & { kind: 'round' }): void => {
    const zones = idleZones(s.eventKey, view.round, people(s)).map((zone) => zone.map((p) => p.name));
    renderZonesIdle(frame, { eventName: view.eventName, round: view.round, rounds: view.rounds, dots: view.dots, zones }, doc);
  };

  /** A marbles round before its draw (PD-316-02 a): the round's first heat at the gate (marbles-idle.ts). The
   *  band counts the whole field, not the heat. */
  const paintMarblesIdle = (s: EventState, view: ScreenView & { kind: 'round' }): void => {
    const field = people(s);
    const names = idleMarbles(s.eventKey, view.round, field).map((p) => p.name);
    renderMarblesIdle(frame, { eventName: view.eventName, round: view.round, rounds: view.rounds, dots: view.dots, names, count: field.length }, doc);
  };

  /** A pick final before its draw (PD-317-04 a, PD-318-03 a): the board's idle with the demo's five picks
   *  placed in roster order -- the demo places nothing by hand, so every plate is filled and none is next.
   *  The band counts the prizes the stepper selects, never the five finalists. */
  const paintObjectsIdle = (s: EventState, view: ScreenView & { kind: 'final' }, pick: PickFinal): void => {
    const names = people(s).map((p) => p.name);
    renderObjects(
      frame,
      {
        game: pick,
        eventName: view.eventName,
        dots: view.dots,
        prizeCount: prizes,
        names,
        plates: names.map((_, i) => i),
        next: null,
        objectLabel: (n) => String(n),
      },
      doc,
    );
  };

  /** A hold game's picture is actually up: settled, and the host's layer still in the 3D box. The host
   *  releases a held picture on dispose, reduced motion, narrowing, a lost context or a throw and stays
   *  settled, telling this page through onRelease; the state alone cannot say whether the canvas is still
   *  there, so the mark reads the layer too (gh#319). */
  const heldUp = (): boolean => active !== null && active.state === 'settled' && layer3d.children.length > 0;

  /** Mark the viewport and lift the overlay-bound nodes (veil, code card) out of the scaled frame while a
   *  held picture is up (gh#319): the mark turns the frame's paint off (reveal.css), because the 2D frame
   *  behind the canvas shows through its transparent regions. The overlay carries the frame's own transform
   *  above the canvas, so the lifted nodes keep their place and stay readable. The claim line stays in the
   *  frame: the hold finals' renderers paint their own claim into the picture, so a DOM copy over it would
   *  double the line (the stage's own rule). Cleared first on every pass: a stale lifted node never doubles,
   *  and a release paints the frame back in the same pass. */
  const syncHeld = (): void => {
    over.replaceChildren();
    if (!heldUp()) {
      viewport.removeAttribute('data-held');
      return;
    }
    viewport.setAttribute('data-held', '');
    for (const sel of ['.pd-veil', '.pd-codebox']) {
      const node = frame.querySelector<HTMLElement>(sel);
      if (node) over.appendChild(node);
    }
    // The persistent final code lifts too once its card is closed (the stage's own rule, gh#319). The demo
    // event is never QR mode, so there is no code to lift here; the branch keeps the two screens' lift one rule.
    if (!over.querySelector('.pd-codebox')) {
      const kept = frame.querySelector<HTMLElement>('.pd-fcode');
      if (kept) over.appendChild(kept);
    }
  };

  /** The state the frame last drew: a release with no screen change repaints it, lifting nothing. */
  let paintedState: EventState | null = null;

  /** Draw the screen. `announceIt` is false only for the repaint a held picture's release triggers: the
   *  result was already announced when it settled, so that one repaint must not re-announce it (gh#319).
   *  Every other repaint announces, as always. */
  const paint2D = (state: EventState, announceIt = true): void => {
    paintedState = state;
    const view = screenView(state);
    // Each phase-2 game idles on its own picture; phase-1 games keep the shared standby (gh#319).
    if (view.kind === 'round' && view.game === 'zones') paintZonesIdle(state, view);
    else if (view.kind === 'round' && view.game === 'marbles') paintMarblesIdle(state, view);
    else if (view.kind === 'final' && isPickFinal(game)) paintObjectsIdle(state, view, game);
    else renderScreen(frame, view, doc);
    if (announceIt) announce(live, view, doc);
    // A screen with a name field takes the phone field layout under 640px; the result takes the phone result
    // layout (demo.css and the shared reveal.css rules), exactly as the projector's markField marks them.
    const screen = frame.getAttribute('data-screen');
    if (screen !== null && FIELD_SCREENS.has(screen)) viewport.setAttribute('data-field', '');
    else viewport.removeAttribute('data-field');
    if (screen === 'result') viewport.setAttribute('data-result', '');
    else viewport.removeAttribute('data-result');
    deps.whenBoldLoaded?.(() => fitAll(frame));
    fitFrame(scaled, stagebox);
    // The overlay carries the frame's own scale and offset, so a lifted node keeps its place (gh#319).
    fitFrame(over, stagebox);
    syncHeld();
  };

  /** Where the bar stands, decided by measuring, never by a screen width: in the play band's right end
   *  (design/Gh314Frames.dc.html 1a B) only when it fits there -- one row (demo.css forbids a wrap), entirely
   *  right of the exit control's box, inside the band -- and below the frame otherwise. The band is tried
   *  first, then kept or given up; both happen before the browser paints. Under 640px demo.css ignores the
   *  attribute. Without layout (no box to measure) the band stays. */
  const placeBar = (): void => {
    viewport.setAttribute('data-bar', 'band');
    if (typeof bar.getBoundingClientRect === 'function') {
      const box = bar.getBoundingClientRect();
      const exitRight = doc.getElementById('play-exit')?.getBoundingClientRect().right ?? 0;
      const bandBottom = viewport.getBoundingClientRect().top;
      const oneRowLeft = box.right - bar.scrollWidth;
      if (oneRowLeft < exitRight || box.bottom > bandBottom) viewport.setAttribute('data-bar', 'below');
    }
    fitFrame(scaled, stagebox);
    fitFrame(over, stagebox);
  };

  const paintControls = (): void => {
    const parts: HTMLElement[] = [badge()];
    if (modes.length > 1) {
      parts.push(
        group(
          COPY.mode.round,
          modes.map((m) => button(COPY.mode[m], 'pr-chip', () => restart(m, prizes), m === mode)),
        ),
      );
    }
    if (mode === 'final') {
      const counts = Array.from({ length: MAX_PRIZES - MIN_PRIZES + 1 }, (_, i) => MIN_PRIZES + i);
      parts.push(group(COPY.prizeCount, counts.map((n) => button(String(n), 'pr-chip', () => restart(mode, n), n === prizes))));
    }
    const step = run.steps[next];
    const label = !step ? COPY.replay : step.outcome.kind === 'deal' ? COPY.deal : COPY.reveal;
    parts.push(button(label, 'pr-go', step ? () => present(step) : () => restart(mode, prizes)));
    bar.replaceChildren(...parts);
    show(bar);
    placeBar();
  };

  const stopReveal = (): void => {
    seq++;
    const host = active;
    active = null;
    host?.dispose();
    // The picture (if one was held) is gone: the frame paints again from here, no repaint needed for it.
    syncHeld();
  };

  /** Back to the start of a demo: a mode or a prize count picked, or the replay. */
  const restart = (m: DemoMode, n: number): void => {
    stopReveal();
    mode = m;
    prizes = n;
    run = demoRun(game, mode, prizes);
    next = 0;
    paint2D(run.start);
    paintControls();
  };

  /** Play one committed step. The bar keeps only the label while it plays; the host's first exit draws the
   *  step's 2D view and brings the controls back, armed. A hold game settles with its picture still up over
   *  that view: its handle is retained so the replay, a prize-count change and leaving dispose it (stopReveal),
   *  and its prize beats write one live line each (gh#319, the stage's own pattern). */
  const present = (step: DemoStep): void => {
    stopReveal();
    const mine = ++seq;
    next = run.steps.indexOf(step) + 1;
    bar.replaceChildren(badge());
    let exited = false;
    // Assigned before begin so a synchronous exit's render2D reads null, never an uninitialized handle.
    let host: RevealHost | null = null;
    host = begin({
      container: layer3d,
      game,
      // The demo has no phones: its picture never paints the claim line (gh#319).
      input: { key: step.key, eventName: step.after.setup.eventName, outcome: step.outcome, people: step.people, claim: false },
      render2D: () => {
        if (mine !== seq || exited) return;
        exited = true;
        // A hold game's settled picture stays up over the 2D frame: retain its handle so every later screen
        // change disposes it. Any other exit (a handback settle, a fallback) hands the screen back with none.
        active = host && host.state === 'settled' && settleFor(game) === 'hold' ? host : null;
        paint2D(step.after);
        paintControls();
      },
      onEvent: (event) => {
        // One live line per opened envelope / turned card (PD-317-10 a, PD-318-10 a): the result's prize-line
        // words, then the finalist through the name sink. The beat's index is the drawn rank.
        if (mine !== seq || event.type !== 'beat' || event.beat !== 'prize') return;
        const outcome = step.outcome;
        if (outcome.kind !== 'final') return;
        const rank = event.index;
        const person = step.people.find((p) => p.id === outcome.order[rank]);
        if (!person) return;
        const prize = rank < outcome.prizes.length ? outcome.prizes[rank]! : null;
        const nameRun = doc.createElement('span');
        writeName(nameRun, person.name);
        live.replaceChildren(doc.createTextNode(`${prizeLine(rank + 1, prize)} · `), nameRun);
      },
      onRelease: () => {
        // The host released the held picture and detached the canvas. A dispose this page asked for has
        // already moved seq on and cleared the mark (stopReveal), so only a release of the CURRENT picture,
        // with the mark still up, repaints the frame here -- one pass, no timer wait, and no re-announce: the
        // result was announced when it settled, so this repaint skips the live region (gh#319).
        if (mine !== seq) return;
        if (viewport.hasAttribute('data-held') && !heldUp() && paintedState) paint2D(paintedState, false);
      },
    });
    if (mine === seq && !exited) active = host;
  };

  // Leaving the page (the exit control, a refresh, a back-forward cache freeze) disposes the reveal so its
  // WebGL context never outlives the page. A persisted restore restarts the demo cleanly from its idle screen
  // with the bar and its controls -- the state a fresh load gives -- whatever phase it was hidden in: a reveal
  // still LOADING when the page froze had its result callback suppressed by the dispose, so repainting the old
  // board would leave the bar empty for good (gh#319). The host's release triggers call onRelease themselves.
  const win = doc.defaultView;
  if (win) {
    win.addEventListener('pagehide', () => stopReveal());
    win.addEventListener('pageshow', (ev) => {
      if ((ev as PageTransitionEvent).persisted) restart(mode, prizes);
    });
  }

  paint2D(run.start);
  paintControls();

  return {
    refit() {
      placeBar();
      fitAll(frame);
    },
    dispose() {
      stopReveal();
    },
  };
}
