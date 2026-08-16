// Short Stick — one hidden stick per player, the phone passes, each player draws one.
// The round ends the instant the short stick surfaces, not after everyone has drawn.
// No checkpoint by design: the bundle derives from ctx.session.players at mount, lives in this
// closure, and dies on refresh and on dispose(). siamsi stays the sole checkpoint writer
// (ADR-0010) — the only session write here is markPlayed at round end, like timebomb/pick-loser.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { pickLoser } from './pick-loser.ts';

// ---- The round: pure and calculable, testable with no DOM (see short-stick.test.mjs) ----

export interface Round {
  /** The pass order — one hidden stick per player. The index IS the turn they draw on. */
  readonly order: readonly string[];
  /** The turn the short stick surfaces on. The round ends there; nobody after it draws. */
  readonly shortAt: number;
}

/** Bundles one stick per player and decides, once, which turn the short one lands on.
 *  Uniform over turns = uniform over players, so which stick a player taps changes nothing. */
export function startRound(players: readonly string[], rand: () => number = Math.random): Round {
  const order = [...players];
  return { order, shortAt: pickLoser(order, rand) }; // throws on an empty roster
}

/** One tap = one stick. Keyed on the turn, never on the name — duplicate names are legal. */
export function draw(round: Round, turn: number): { player: string; isShort: boolean } {
  if (turn < 0 || turn >= round.order.length) {
    throw new Error(`short-stick: จับไม้นอกกำ — ไม้ที่ ${turn + 1} ไม่มีอยู่ในรอบนี้`);
  }
  return { player: round.order[turn], isShort: turn === round.shortAt };
}

// ---- Current round state (one game per page) ----

type Phase = 'draw' | 'passing' | 'done';

let cleanup: Array<() => void> = [];
let phase: Phase = 'draw';
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let round: Round | null = null;
let turn = 0;
let reveal: Animation | null = null;

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  style?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (style) node.setAttribute('style', style);
  return node;
}

/** matchMedia is read here, never at module scope — this file is imported by `node --test`,
 *  where `window` does not exist. Motion is decoration only: the result is already on screen. */
function animateReveal(node: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  reveal = node.animate(
    [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
    160,
  );
}

// ---- Screens ----

/** 320px: sticks size off viewport width, never constants, and wrap instead of overflowing sideways. */
const BUNDLE_STYLE = 'display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0';
const STICK_STYLE = 'width:min(44px,13vw);height:min(112px,32vw);border-radius:999px;padding:0';

function renderDraw(): void {
  const stage = stageEl;
  const r = round;
  if (!stage || !r) return;
  stage.replaceChildren();

  stage.appendChild(el('p', `ตาของ ${r.order[turn]}`, 'font-size:1.5rem;font-weight:700'));
  stage.appendChild(el('p', `แตะไม้อันไหนก็ได้ 1 อัน — เหลือ ${r.order.length - turn} อัน`));

  const bundle = el('div', undefined, BUNDLE_STYLE);
  for (let i = 0; i < r.order.length - turn; i++) {
    const stick = el('button', undefined, STICK_STYLE);
    stick.type = 'button';
    stick.setAttribute('aria-label', 'จับไม้');
    on(stick, 'click', drawOne);
    bundle.appendChild(stick);
  }
  stage.appendChild(bundle);
}

function renderPassing(player: string, next: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const line = el('p', 'ไม้ยาว — รอด', 'font-size:1.8rem;font-weight:700');
  stage.appendChild(line);
  stage.appendChild(el('p', `${player} รอดไปได้ ส่งมือถือให้ ${next} ต่อเลย`));

  const pass = el('button', `ส่งต่อให้ ${next}`);
  pass.id = 'ss-pass';
  pass.type = 'button';
  on(pass, 'click', () => {
    if (phase !== 'passing') return;
    phase = 'draw';
    renderDraw();
  });
  stage.appendChild(pass);

  animateReveal(line);
}

function renderResult(player: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const line = el('p', 'ไม้สั้น!', 'font-size:2rem;font-weight:700');
  stage.appendChild(line);
  stage.appendChild(el('p', `${player} โดน`, 'font-size:1.8rem;font-weight:700'));
  stage.appendChild(el('p', 'วงตกลงกันเองว่าคนโดนต้องทำอะไร'));

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'ss-again';
  again.type = 'button';
  on(again, 'click', () => {
    const stageRef = stageEl;
    const ctxRef = gameCtx;
    teardown();
    if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
  });
  stage.appendChild(again);

  const hub = el('a', 'กลับไปหน้ารวมเกม');
  hub.href = '/games/';
  stage.appendChild(hub);

  animateReveal(line);
}

// ---- Round lifecycle ----

function drawOne(): void {
  if (phase !== 'draw' || !round) return; // guards draw()'s throw out of reach of a stray tap
  const { player, isShort } = draw(round, turn);

  if (isShort) {
    phase = 'done';
    gameCtx?.session.markPlayed('short-stick');
    renderResult(player);
    return;
  }

  const next = round.order[turn + 1];
  turn += 1;
  phase = 'passing';
  renderPassing(player, next);
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  turn = 0;
  phase = 'draw';

  const roster = ctx.session.players ?? [];
  round = startRound(roster.length > 0 ? roster : ['คนที่ถือมือถือ']);

  renderDraw();
}

function teardown(): void {
  phase = 'draw';
  cleanup.forEach((fn) => fn());
  cleanup = [];
  reveal?.cancel();
  reveal = null;
  round = null;
  turn = 0;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'short-stick',
  names: { th: 'จับไม้สั้น', en: 'Short Stick' },
  category: 'party',
  players: [2, 10],
  keywords: ['จับไม้สั้น', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
  needs: [],
  tagline: 'ส่งมือถือวนจับไม้ทีละคน ใครได้ไม้สั้นคนนั้นโดน',
  seo: {
    title: 'จับไม้สั้น — เกมส่งมือถือจับไม้ทีละคน เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนจับไม้ทีละคน แตะจับไม้คนละ 1 อัน จับปุ๊บรู้ปั๊บ ใครได้ไม้สั้นคนนั้นโดน จบรอบทันที เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อผู้เล่นทุกคน (2–10 คน)',
      'ส่งมือถือวนทีละคน แตะจับไม้คนละ 1 อัน',
      'จับปุ๊บรู้ปั๊บ — ใครได้ไม้สั้น คนนั้นโดน จบรอบทันที',
    ],
  },
  og: 'short-stick.png',
  ads: false, // play screen = never an ad slot

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
