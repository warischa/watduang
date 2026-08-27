// Pick the loser — one button, randomly picks one person from the group.
// The drinking-framing keyword was dropped S2026-08-15#4: ticket 09's §32/1 gate is still open
// (lawyer review required before launch, or drop the angle). Do not reintroduce it without that.
// Zero content, no timer, no checkpoint — a single-shot pick has no mid-round state to survive a
// refresh (unlike siamsi's multi-turn round). See ADR-0010: siamsi stays the sole checkpoint writer.
// The .ts extension in the import path is required for `node --test` (Node does not guess extensions) — Vite/tsc accept both
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

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

// ---- Screens ----
// gh#76 — the result screen is the approved design (design/GamePickLoser.dc.html) and the pattern the
// five other games will follow. The class names (.stage-screen, .game-btn, .pl-*) are styled from
// src/pages/game/[id].astro's global stylesheet — game modules create their DOM at runtime, so Astro
// scoping never reaches it, which is why that sheet is is:global. Every colour there is a token from
// src/styles/tokens.css; every size is verbatim from the canvas. If a copy string here disagrees with
// the design, the repo's shipped string wins (see GameLayout.astro).

// The burst star, byte-exact from the canvas (12-point starburst, viewBox 200). Drawn, never an image.
// fill/stroke reference tokens by name — presentation attributes can resolve var().
const BURST_SVG =
  '<svg width="290" height="290" viewBox="0 0 200 200" fill="none" aria-hidden="true">' +
  '<path d="M100 6 l10 22 22-12 -3 25 25 3 -14 21 21 14 -23 10 12 22 -25-3 -3 25 -21-14 -14 21 -10-23 -22 12 3-25 -25-3 14-21 -21-14 23-10 -12-22 25 3 3-25 21 14z" ' +
  'fill="var(--color-ground-warm)" stroke="var(--color-line-strong)" stroke-width="3" stroke-linejoin="round"></path></svg>';

function renderIdle(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const names = gameCtx?.session.players ?? [];
  stage.appendChild(el('p', `วง ${names.length || '-'} คน`));
  stage.appendChild(el('p', 'กดปุ่มแล้วสุ่มคนโดนหนึ่งคนจากวงทันที'));

  const pickBtn = el('button', 'สุ่มคนโดน');
  pickBtn.id = 'pl-pick';
  pickBtn.type = 'button';
  pickBtn.className = 'game-btn game-btn-primary';
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
  stage.className = 'stage-screen';

  // Direct children in canvas order — the #42 gate test reads stage.children[1] as the picked name.
  const label = el('span', 'คนโดนคือ');
  label.className = 'pl-label';
  stage.appendChild(label);

  const burst = document.createElement('div');
  burst.className = 'pl-burst';
  burst.innerHTML = BURST_SVG;
  const name = el('span', players[loserIdx]);
  name.className = 'pl-name';
  burst.appendChild(name);
  stage.appendChild(burst);

  const foot = el('p', 'วงตกลงกันเองว่าคนโดนต้องทำอะไร');
  foot.className = 'pl-foot';
  stage.appendChild(foot);

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'pl-again';
  again.type = 'button';
  again.className = 'game-btn game-btn-primary';
  on(again, 'click', () => {
    const stageRef = stageEl;
    const ctxRef = gameCtx;
    teardown();
    if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
  });
  stage.appendChild(again);

  // The secondary control (gh#76): back to the setup panel so the group can re-tick. It is NOT wired
  // to the panel DOM directly — the game tears itself down and dispatches watduang:change-players on
  // document, and src/pages/game/[id].astro is the one place that owns putting the panel back (the
  // same split gh#54's failed-mount path uses). No checkpoint exists to strand.
  const change = el('button', 'เปลี่ยนคนเล่น');
  change.id = 'pl-change';
  change.type = 'button';
  change.className = 'game-btn game-btn-secondary';
  on(change, 'click', () => {
    teardown();
    document.dispatchEvent(new CustomEvent('watduang:change-players', { bubbles: true }));
  });
  stage.appendChild(change);

  const hint = el('span', 'ปุ่มรองจะกดได้หลังผลออก 0.4 วินาที กันนิ้วลั่น');
  hint.className = 'pl-hint';
  stage.appendChild(hint);
  // No outbound link here — #stage must hold no navigation target (a tap-transition would drop it under
  // the finger that just tapped). The crawlable one is static chrome in src/layouts/GameLayout.astro.

  // The tap that revealed the pick swaps this screen in under the same finger, so a ghost second
  // contact would land on "เล่นอีกรอบ" and restart the round before anyone read who was picked.
  // armAllButtons walks the stage, so the new pl-change is gated by this same call with no list to
  // remember (ADR-0017) and no second timer.
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
  // Party page — the setup panel carries the live-round bit for the leave-confirm (gh#121).
  startsRound: true,
  keywords: ['สุ่มคนโดน', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
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
  // gh#82 — false here is NOT the layout rule the other games follow; it is a content decision.
  // This page is AdSense restricted content per issue #10, so it carries an
  // Auto ads page exclusion and must place no manual slot: the page generates no ad request at all.
  // scripts/validate-games.mjs hard-fails a true here. Changing it is an owner decision, not a tidy-up.
  ads: false,

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
