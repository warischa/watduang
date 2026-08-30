// Short Stick — one hidden stick per player, the phone passes, each player draws one.
// The round ends the instant the short stick surfaces, not after everyone has drawn.
// No checkpoint by design: the bundle derives from ctx.session.players at mount, lives in this
// closure, and dies on refresh and on dispose(). siamsi stays the sole checkpoint writer
// (ADR-0010) — the only session write here is markPlayed at round end, like timebomb/pick-loser.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { pickLoser } from './_pick-index.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

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
// taken[i] = the stick at panel index i has been drawn — so it keeps its slot, spent, and the row
// never reflows mid-round (gh#79's headline criterion).
let taken: boolean[] = [];

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// The hint chip's info icon, byte-exact from design/GameShortStick.dc.html (circle + stem + dot).
// stroke resolves a token by name, the same way pick-loser's burst star does.
const INFO_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-line-strong)" ' +
  'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16h.01"></path></svg>';

// ---- Screens ----
// gh#79 — the draw screen is the approved design (design/GameShortStick.dc.html). Shared controls
// reuse the .stage-screen / .game-btn / .game-btn-primary shell vocabulary from
// src/pages/game/[id].astro's is:global sheet. The stage ground is var(--page-accent), resolved by
// the shell's .play-area — the canvas's own per-game accent hex is a colour the site does not
// define. No animation on purpose: the canvas has none, which is the whole prefers-reduced-motion
// story.
//
// gh#146 — the `st-` prefixed classes below had their sheet at src/styles/games/short-stick.css.
// That sheet and its import are DELETED: once this game declared a playRoute, [id].astro stopped
// building /game/short-stick/, so no page rendered them. Nothing styles them today.
//
// This module is NOT the play route's engine — unlike timebomb, where src/play/timebomb/main.ts
// imports src/games/timebomb.ts as-is, src/play/short-stick/main.js runs the mockup's own markup
// and sheets and imports nothing from this directory. What still needs this file is the manifest
// registration, which src/pages/game/short-stick/play.astro reads via byId('short-stick') and the
// home and category pages read to render the card. Retiring it is therefore a manifest question,
// not a dead-code deletion, and it is not gh#146's to answer.

function renderDraw(): void {
  const stage = stageEl;
  const r = round;
  if (!stage || !r) return;
  stage.replaceChildren();

  const holder = el('div');
  holder.className = 'st-holder';
  const kicker = el('span', 'คนที่ถือมือถือ');
  kicker.className = 'st-holder-kicker';
  const name = el('span', `ตาของ ${r.order[turn]}`);
  name.className = 'st-holder-name';
  holder.appendChild(kicker);
  holder.appendChild(name);
  stage.appendChild(holder);

  const instruction = el('span', 'แตะจับไม้ 1 อัน');
  instruction.className = 'st-instruction';
  stage.appendChild(instruction);

  // The stick box: every stick is rendered every turn. A taken one is a spent <div> in the same
  // slot, never removed — that is what keeps the row from reflowing.
  const panel = el('div');
  panel.className = 'st-stick-panel';
  for (let i = 0; i < r.order.length; i++) {
    if (taken[i]) {
      const spent = el('div');
      spent.className = 'st-stick st-stick--spent';
      panel.appendChild(spent);
    } else {
      const stick = el('button');
      stick.type = 'button';
      stick.className = 'st-stick';
      stick.setAttribute('aria-label', 'จับไม้');
      on(stick, 'click', () => drawOne(i));
      panel.appendChild(stick);
    }
  }
  stage.appendChild(panel);

  const closing = el('p', 'จับปุ๊บรู้ปั๊บ — ใครได้ไม้สั้น คนนั้นโดน จบรอบทันที');
  closing.className = 'st-closing';
  stage.appendChild(closing);

  const hint = el('div');
  hint.className = 'st-hint';
  const icon = el('span');
  icon.className = 'st-hint-icon';
  icon.innerHTML = INFO_SVG;
  const hintText = el('span', 'ไม้ที่จับไปแล้วจะจางลง แต่ไม่หายไป แถวจะได้ไม่ขยับ');
  hintText.className = 'st-hint-text';
  hint.appendChild(icon);
  hint.appendChild(hintText);
  stage.appendChild(hint);
  // No outbound link here — #stage must hold no navigation target (a tap-transition would drop it under
  // the finger that just tapped). The crawlable one is static chrome in src/layouts/GameLayout.astro.

  // Every way into this screen replaces one the finger was already aiming at — the "ส่งต่อ" tap, the
  // mount out of PlayerSetup, and the "เล่นอีกรอบ" remount. Gating here covers all three at once: the
  // bundle arms only after the stage goes quiet, so a ghost tap cannot draw for the next player.
  // There is no checkpoint in this game, so a stolen draw takes the whole round with it.
  cleanup.push(armAllButtons(stage));
}

function renderPassing(player: string, next: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const line = el('span', 'ไม้ยาว — รอด');
  line.className = 'st-shout';
  stage.appendChild(line);

  const remark = el('p', `${player} รอดไปได้ ส่งมือถือให้ ${next} ต่อเลย`);
  remark.className = 'st-remark';
  stage.appendChild(remark);

  const pass = el('button', `ส่งต่อให้ ${next}`);
  pass.id = 'ss-pass';
  pass.type = 'button';
  pass.className = 'game-btn game-btn-primary';
  on(pass, 'click', () => {
    if (phase !== 'passing') return;
    phase = 'draw';
    renderDraw();
  });
  stage.appendChild(pass);
}

function renderResult(player: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const line = el('span', 'ไม้สั้น!');
  line.className = 'st-shout';
  stage.appendChild(line);

  const loser = el('span', `${player} โดน`);
  loser.className = 'st-shout';
  stage.appendChild(loser);

  const foot = el('p', 'วงตกลงกันเองว่าคนโดนต้องทำอะไร');
  foot.className = 'st-remark';
  stage.appendChild(foot);

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'ss-again';
  again.type = 'button';
  again.className = 'game-btn game-btn-primary';
  on(again, 'click', () => {
    const stageRef = stageEl;
    const ctxRef = gameCtx;
    teardown();
    if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
  });
  stage.appendChild(again);

  // The mirror of the gate in renderDraw, and the reason both exist: the tap that draws the short
  // stick swaps this screen in under its own finger, so the second contact lands on "เล่นอีกรอบ" and
  // remounts. That destroys the only copy of the result — nothing here is checkpointed (see the top
  // of this file), so an erased round is an erased round.
  cleanup.push(armAllButtons(stage));
}

// ---- Round lifecycle ----

function drawOne(index: number): void {
  if (phase !== 'draw' || !round || taken[index]) return; // guards draw()'s throw out of reach of a stray tap
  const { player, isShort } = draw(round, turn);
  taken[index] = true;

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
  stage.className = 'stage-screen';
  turn = 0;
  phase = 'draw';

  const roster = ctx.session.players ?? [];
  round = startRound(roster.length > 0 ? roster : ['คนที่ถือมือถือ']);
  taken = new Array(round.order.length).fill(false);

  renderDraw();
}

function teardown(): void {
  phase = 'draw';
  cleanup.forEach((fn) => fn());
  cleanup = [];
  round = null;
  taken = [];
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
  // Party page — the setup panel carries the live-round bit for the leave-confirm (gh#121).
  startsRound: true,
  keywords: ['จับไม้สั้น', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
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
  // The full-screen route this page hands off to. GameLayout.astro turns it into the chrome link.
  playRoute: '/game/short-stick/play/',
  // gh#82 — the how-to-play prose below the stage is ad inventory, per issue #13's amendment 8:
  // the decision was no slot on the PLAY SCREEN, never no slot on the page.
  ads: true,

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
