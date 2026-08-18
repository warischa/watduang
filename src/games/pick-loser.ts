// Pick the loser — one button, randomly picks one person from the group.
// The drinking-framing keyword was dropped S2026-08-15#4: ticket 09's §32/1 gate is still open
// (lawyer review required before launch, or drop the angle). Do not reintroduce it without that.
// Zero content, no timer, no checkpoint — a single-shot pick has no mid-round state to survive a
// refresh (unlike siamsi's multi-turn round). See ADR-0010: siamsi stays the sole checkpoint writer.
// The .ts extension in the import path is required for `node --test` (Node does not guess extensions) — Vite/tsc accept both
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons } from './_arm-gate.ts';

// ---- Picking: pure and calculable, testable with no DOM (see pick-loser.test.mjs) ----

/** Picks one index out of the roster — returns the index, never a name, so callers stay safe
 *  against duplicate names in the roster */
export function pickLoser(players: readonly string[], rand: () => number = Math.random): number {
  if (players.length === 0) {
    throw new Error('pick-loser: ผู้เล่นว่างเปล่า — ต้องมีอย่างน้อย 1 คนถึงจะสุ่มได้');
  }
  return Math.floor(rand() * players.length);
}

// ---- Current round state (one game per page) ----

type Phase = 'idle' | 'result';

let cleanup: Array<() => void> = [];
let phase: Phase = 'idle';
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let players: string[] = [];
let loserIdx = 0;

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

// ---- Screens ----

function renderIdle(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const names = gameCtx?.session.players ?? [];
  stage.appendChild(el('p', `วง ${names.length || '-'} คน`));
  stage.appendChild(el('p', 'กดปุ่มแล้วสุ่มคนโดนหนึ่งคนจากวงทันที'));

  const pickBtn = el('button', 'สุ่มคนโดน');
  pickBtn.id = 'pl-pick';
  pickBtn.type = 'button';
  on(pickBtn, 'click', pick);
  stage.appendChild(pickBtn);
  // Exception (owner's call): pl-pick is deliberately NOT gated. No hand-off exists in the
  // pl-again → pl-pick flow — the same hand that tapped "เล่นอีกรอบ" taps this button next, so gating
  // it would delay a real, single-user action rather than block a ghost tap.
}

function renderResult(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  stage.appendChild(el('p', 'คนโดนคือ', 'font-weight:700'));
  stage.appendChild(el('p', players[loserIdx], 'font-size:1.8rem;font-weight:700'));
  stage.appendChild(el('p', 'วงตกลงกันเองว่าคนโดนต้องทำอะไร'));

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'pl-again';
  again.type = 'button';
  on(again, 'click', () => {
    const stageRef = stageEl;
    const ctxRef = gameCtx;
    teardown();
    if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
  });
  stage.appendChild(again);
  // No /games/ link here — #stage must hold no navigation target (a tap-transition would drop it under
  // the finger that just tapped). The crawlable one is static chrome in src/layouts/GameLayout.astro.

  // The tap that revealed the pick swaps this screen in under the same finger, so a ghost second
  // contact would land on "เล่นอีกรอบ" and restart the round before anyone read who was picked.
  cleanup.push(armAllButtons(stage));
}

// ---- Round lifecycle ----

function pick(): void {
  if (phase !== 'idle') return;
  loserIdx = pickLoser(players);
  phase = 'result';
  gameCtx?.session.markPlayed('pick-loser');
  renderResult();
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  phase = 'idle';

  const roster = ctx.session.players ?? [];
  players = roster.length > 0 ? [...roster] : ['คนที่ถือมือถือ'];

  renderIdle();
}

function teardown(): void {
  phase = 'idle';
  cleanup.forEach((fn) => fn());
  cleanup = [];
  players = [];
  loserIdx = 0;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'pick-loser',
  names: { th: 'สุ่มคนโดน', en: 'Pick the Loser' },
  category: 'party',
  players: [2, 10],
  keywords: ['สุ่มคนโดน', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
  needs: [],
  tagline: 'กดปุ่มเดียว สุ่มคนโดนในวงทันที',
  seo: {
    title: 'สุ่มคนโดน — เกมสุ่มเลือกคนโดนในวง เล่นฟรีบนเครื่องเดียว',
    description:
      'กดปุ่มเดียว สุ่มเลือกคนโดนหนึ่งคนจากวงทันที ใช้เป็นเกมลงโทษท้ายปาร์ตี้ก็ได้ วงตกลงกันเองว่าคนโดนต้องทำอะไร เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนคนเล่นหรือเลือกชื่อจากกลุ่มเดิม',
      'กดปุ่มสุ่ม ระบบจะเลือกคนโดนหนึ่งคนจากวงทันที',
      'วงตกลงกันเองว่าคนโดนต้องทำอะไร แล้วกด "เล่นอีกรอบ" เพื่อสุ่มใหม่',
    ],
  },
  og: 'pick-loser.png',
  ads: false, // play screen = never an ad slot

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
