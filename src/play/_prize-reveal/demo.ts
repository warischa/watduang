// The own page of each prize-draw 3D game (gh#305, gh#306, gh#307): a fixed, clearly labelled DEMO of the
// game, run in memory. Nothing is stored, no event is read or replaced, and a refresh replays the same demo.
//
// The outcome is a real one. The fixtures walk the event domain itself (src/prize-event/event.ts: createEvent,
// prepareCards, drawNext) over 200 synthetic names with a fixed seed, so every outcome the host receives is
// exactly the shape the prize-draw projector commits -- an elimination round, a card round's deal then its
// drawn rule, or the final with its prizes -- and never a hand-built record. The fireworks game shows both
// of its modes (an elimination round and the final); the final modes take 1 to 5 prizes.
//
// The reveal runs through the one shared host (game-host.ts startReveal), so fallback, the render hold and
// disposal are the projector's own. The host draws the committed 2D view on its first exit (reveal.ts), the
// same frame the projector falls back to. While a reveal plays the bar holds only the demo label, so nothing
// restarts it mid-play; its exit brings the controls back.
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
import type { CutGame, FinalGame, GameChoices } from '../../prize-event/game-contract.ts';
import { ELIMINATION_ROUNDS, proposeSchedule } from '../../prize-draw/schedule.ts';
import { screenView } from '../../prize-event/view.ts';
import type { CommittedOutcome, GameId } from './game-contract.ts';
import { startReveal, type HostOptions, type RevealHost } from './game-host.ts';
import { fitAll } from './names-dom.ts';
import { announce, fitFrame, renderScreen } from './reveal.ts';

export type DemoMode = 'round' | 'final';

/** Which steps each game plays (game-registry.ts eligibility), in the order its page offers them. */
export const DEMO_MODES: Record<GameId, readonly DemoMode[]> = {
  fireworks: ['round', 'final'],
  cards: ['round'],
  ladder: ['final'],
};

/** 200 also keeps the cards demo legal: its proposed schedule cuts round 1 from 200 to exactly 100, and cards
 *  play only a round that cuts exactly in half (event.ts cutsInHalf; createEvent refuses any other). */
export const DEMO_HEADS = 200;
/** Fixed, so every load plays the same demo: the page is a demonstration, never a draw. */
export const DEMO_SEED = 2570;
export const DEMO_PRIZES = 3;

/** No board draws this page, so every label here but the reveal button is owner-approved copy (2026-11-13). The
 *  reveal button reuses the projector MC button's label (src/play/prize-draw/stage.ts), the same action. */
export const COPY = {
  badge: 'ตัวอย่าง ไม่ใช่งานจริง',
  eventName: 'งานเลี้ยงปีใหม่ (ตัวอย่าง)',
  prize: (n: number): string => `รางวัลที่ ${n}`,
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
  const prizes = Array.from({ length: clampPrizes(prizeCount) }, (_, i) => COPY.prize(i + 1));
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
  const picks = game === 'ladder' ? liveIds(s) : undefined;
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
  /** Scale the frame to the screen again (a resize, the site faces loading). */
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
  const scaled = doc.createElement('div');
  scaled.className = 'pd-scaled';
  const frame = doc.createElement('div');
  frame.className = 'pd-frame';
  scaled.appendChild(frame);
  // The host fills this layer over the frame while a step presents, and empties it on exit.
  const layer3d = doc.createElement('div');
  layer3d.className = 'pr-3d';
  const bar = doc.createElement('div');
  bar.className = 'pr-bar';
  viewport.append(scaled, layer3d, bar);
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

  const paint2D = (state: EventState): void => {
    const view = screenView(state);
    renderScreen(frame, view, doc);
    announce(live, view, doc);
    deps.whenBoldLoaded?.(() => fitAll(frame));
    fitFrame(scaled, viewport);
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
  };

  const stopReveal = (): void => {
    seq++;
    const host = active;
    active = null;
    host?.dispose();
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
   *  step's 2D view and brings the controls back, armed. */
  const present = (step: DemoStep): void => {
    stopReveal();
    const mine = ++seq;
    next = run.steps.indexOf(step) + 1;
    bar.replaceChildren(badge());
    let exited = false;
    const host = begin({
      container: layer3d,
      game,
      input: { key: step.key, eventName: step.after.setup.eventName, outcome: step.outcome, people: step.people },
      render2D: () => {
        if (mine !== seq || exited) return;
        exited = true;
        active = null;
        paint2D(step.after);
        paintControls();
      },
    });
    if (mine === seq && !exited) active = host;
  };

  paint2D(run.start);
  paintControls();

  return {
    refit() {
      fitFrame(scaled, viewport);
      fitAll(frame);
    },
    dispose() {
      stopReveal();
    },
  };
}
