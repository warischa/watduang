// Time Bomb — the phone passes around the group, whoever holds it when it detonates loses.
// This game's clock is the absolute deadline only — every frame recomputes fresh from
// Date.now(). Never accumulate from setTimeout/rAF: the browser throttles timers on tab switch,
// which would drift the clock.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { boom, tick, unlockAudio } from '../shell/audio.ts';
import { requestWakeLock, type WakeLockHandle } from '../shell/wake-lock.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

// ---- Time: pure and calculable, testable with no DOM (see timebomb.test.mjs) ----

/** Shortest/longest fuse — random within this range, players must not be able to guess it.
 *  30-90s (gh#151, owner ruling 2026-08-30): wide enough that "it has been a while" tells you
 *  nothing, and paired with the rule below that no observable channel may narrow it down. */
export const FUSE_MIN_MS = 30_000;
export const FUSE_MAX_MS = 90_000;

/** Returns the "detonation time" as an absolute timestamp, not a duration */
export function pickDeadline(now: number, rand: () => number = Math.random): number {
  return now + FUSE_MIN_MS + Math.floor(rand() * (FUSE_MAX_MS - FUSE_MIN_MS + 1));
}

/** 0 at start → 1 at the deadline, and "stuck at 1" once past it (the long-tab-switch-away case) */
export function urgencyAt(now: number, startedAt: number, deadline: number): number {
  const total = deadline - startedAt;
  if (total <= 0) return 1;
  const ratio = (now - startedAt) / total;
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
}

/** The fuse bar's animation, and the only thing written to it. A fixed-period triangle wave off the
 *  ABSOLUTE clock: it reads neither the deadline nor the round's start, so a player watching the bar
 *  learns what time it is and nothing else. Returns a width percentage.
 *  gh#151: any value derived from the deadline — a bar length, a number, an attribute — is a ratio of
 *  elapsed to total, and a player who counts elapsed seconds can solve it for the remaining time. So
 *  the ticking screen carries no such value at all; this shimmer only says "the fuse is lit". */
export const SHIMMER_PERIOD_MS = 1200;
const SHIMMER_FLOOR_PCT = 88;
const SHIMMER_SWING_PCT = 12;
/** ADR-0046 is "reduce, not remove", and throttling the WRITE RATE alone does not reduce anything a
 *  viewer perceives — a browser capture of the reduce query measured this bar still cycling the full
 *  88.8-99.8% range, just in coarser steps. That is a loop that pulses forever, and it is new: before
 *  gh#151 the bar shrank monotonically toward the deadline, so under the reduce query it was nearly
 *  static. Amplitude is therefore reduced too. NOT to zero: a still bar would say the round had
 *  stopped, and this shimmer is the only remaining signal that the fuse is lit. */
const SHIMMER_SWING_REDUCED_PCT = 3;

export function shimmerAt(now: number, reduced = false): number {
  const phase = (((now % SHIMMER_PERIOD_MS) + SHIMMER_PERIOD_MS) % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  const swing = reduced ? SHIMMER_SWING_REDUCED_PCT : SHIMMER_SWING_PCT;
  return SHIMMER_FLOOR_PCT + triangle * swing;
}

const TICK_SLOW_MS = 900;
const TICK_FAST_MS = 120;

/** Tick sound spacing — used to pace the sound only, not a timer.
 *  ponytail: audio is the one urgency-carrying channel left after gh#151, and it leaks MORE than
 *  spacing. tick() in src/shell/audio.ts derives all three of its parameters from the same urgency:
 *  frequency `440 + u * 660`, duration `0.15 - u * 0.1`, and the interval below. So a single tick's
 *  PITCH is an instantaneous readout of the fraction elapsed — a player does not have to count
 *  anything, and two ticks solve for the deadline. Kept on purpose: the accelerating tick is the
 *  game's tension mechanic, the ticking screen's own copy advertises it, and gh#151 enumerates
 *  screen, announcements and drawing only. Removing it is an owner decision — and it means changing
 *  tick()'s frequency and duration terms too, not just this interval. */
function tickIntervalMs(urgency: number): number {
  return TICK_SLOW_MS - (TICK_SLOW_MS - TICK_FAST_MS) * urgency;
}

// ---- Current round state (one game per page) ----

type Phase = 'idle' | 'ticking' | 'boom';

let cleanup: Array<() => void> = [];
let phase: Phase = 'idle';
let round = 0; // token guarding against a stale round's callback firing into the new round
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let audioCtx: AudioContext | null = null;
let wake: WakeLockHandle | null = null;
let rafId = 0;
let startedAt = 0;
let deadline = 0;
let nextTickAt = 0;
// gh#77 box7 — prefers-reduced-motion holds off the CSS side trivially (this game declares no
// animation/transition), but the fuse's per-frame style.width write is JS-driven and CSS media
// features do not reach it on their own; frame() has to read the query and act on it itself.
const FUSE_STEP_MS = 250; // reduced-motion cadence: a few coarse steps a second, not every frame
let prefersReducedMotion = false;
let reducedMotionMql: MediaQueryList | null = null;
let nextFuseUpdateAt = 0;
// The ticking screen's shimmer bar — the one live node frame() mutates. Held so frame() never
// re-queries; cleared on teardown and on the boom screen swap (the fill dies with the ticking screen).
let fuseFillEl: HTMLElement | null = null;
let wakeWarned = false;
let wasHidden = false;
let players: string[] = [];
let holder = 0;
// Survives teardown/remount on purpose — a ghost tap on "เล่นอีกรอบ" must not erase who just lost.
let lastLoser: string | null = null;

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// The bomb — byte-exact from design/GameTimebomb.dc.html (ADR-0033). Drawn, never an image (vector
// art only). fill/stroke reference tokens by name — SVG presentation attributes resolve var(). The
// spark's fill is var(--page-accent): the canvas's {{accent}} prop, which this site resolves through
// the category manifest; the canvas's own per-game accent hex is not a colour this site defines.
const BOMB_SVG =
  '<svg width="150" height="150" viewBox="0 0 120 120" fill="none" aria-hidden="true">' +
  '<circle cx="54" cy="72" r="34" fill="var(--color-line-strong)"></circle>' +
  '<rect x="62" y="30" width="12" height="12" rx="2" fill="var(--color-line-strong)" transform="rotate(20 68 36)"></rect>' +
  '<path d="M72 32 C 84 20, 92 26, 96 16" stroke="var(--color-line-strong)" stroke-width="5" stroke-linecap="round" stroke-dasharray="46" stroke-dashoffset="17"></path>' +
  '<circle cx="97" cy="15" r="8" fill="var(--page-accent)" stroke="var(--color-line-strong)" stroke-width="2.5"></circle>' +
  '<circle cx="97" cy="15" r="3.5" fill="var(--color-line-strong)"></circle>' +
  '<ellipse cx="43" cy="60" rx="8" ry="5" fill="var(--color-ground-warm)" opacity="0.5" transform="rotate(-25 43 60)"></ellipse>' +
  '</svg>';

// ---- Screens ----

/** One-line warning when the wake lock request fails — the game still plays normally */
function paintWakeWarning(): void {
  const warn = stageEl?.querySelector('#tb-warn') as HTMLElement | null;
  if (warn) warn.hidden = !wakeWarned;
}

function renderIdle(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const names = gameCtx?.session.players ?? [];
  stage.appendChild(el('p', `วง ${names.length || '-'} คน — ส่งมือถือวนไปเรื่อยๆ`));
  stage.appendChild(el('p', 'กดเริ่มแล้วฟิวส์จะเดิน ไม่มีใครรู้ว่าจะระเบิดตอนไหน'));
  // A ghost tap on "เล่นอีกรอบ" remounts straight into this screen — still say who just lost.
  if (lastLoser) stage.appendChild(el('p', `รอบที่แล้ว ${lastLoser} แพ้ — ถือมือถืออยู่ตอนระเบิด`));

  const startBtn = el('button', 'เริ่มจับเวลา');
  startBtn.id = 'tb-start';
  startBtn.type = 'button';
  startBtn.className = 'game-btn game-btn-primary';
  on(startBtn, 'click', arm); // must be a real user gesture — iOS only unlocks audio right here
  stage.appendChild(startBtn);

  // renderBoom swaps the stage with no warning and "เล่นอีกรอบ" remounts straight into this screen, so
  // this button can land under a finger that is still mid-double-tap. arm() accepts any gesture and
  // a fuse nobody knows about is already running by the time anyone notices — gate it until the
  // stage goes quiet. Still a real user gesture when it fires, so iOS audio unlock is unaffected.
  cleanup.push(armAllButtons(stage));
}

function renderTicking(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  // Holder block — the static label above the holder's name, both byte-exact from the canvas.
  const holderBlock = document.createElement('div');
  holderBlock.className = 'tb-holder';
  const label = el('span', 'คนที่ถือมือถือ');
  label.className = 'tb-holder-label';
  holderBlock.appendChild(label);
  const who = document.createElement('span');
  who.className = 'tb-holder-name';
  who.textContent = `ตอนนี้อยู่ที่ ${players[holder]}`;
  holderBlock.appendChild(who);
  stage.appendChild(holderBlock);

  // The bomb — the drawn 210px ground circle, filled with the inline vector. No raster asset.
  const bomb = document.createElement('div');
  bomb.className = 'tb-bomb';
  bomb.innerHTML = BOMB_SVG;
  stage.appendChild(bomb);

  // Fuse block — caption, the shimmer bar, hint. The bar says the fuse is LIT; it does not say how
  // much is left (gh#151), so its width comes from shimmerAt(now) and never from the deadline.
  // The id stays `tb-fuse`: it is how the play route's canvas renderer and the arm-gate probe
  // recognise the ticking screen, and it now carries phase only — no time value.
  const fuseBlock = document.createElement('div');
  fuseBlock.className = 'tb-fuse';
  const caption = el('span', 'ฟิวส์กำลังเดิน');
  caption.className = 'tb-fuse-caption';
  fuseBlock.appendChild(caption);
  const track = document.createElement('div');
  track.className = 'tb-fuse-track';
  const fill = document.createElement('div');
  fill.className = 'tb-fuse-fill';
  fill.id = 'tb-fuse';
  fill.style.width = '100%';
  track.appendChild(fill);
  fuseBlock.appendChild(track);
  const hint = el('span', 'เสียงติ๊กจะถี่ขึ้นเรื่อยๆ เมื่อใกล้ระเบิด');
  hint.className = 'tb-fuse-hint';
  fuseBlock.appendChild(hint);
  stage.appendChild(fuseBlock);
  fuseFillEl = fill;

  const warn = el('p', 'อย่าปล่อยให้จอดับ');
  warn.id = 'tb-warn';
  warn.className = 'tb-warn';
  warn.hidden = true;
  stage.appendChild(warn);

  const passBtn = el('button', 'ส่งต่อ');
  passBtn.id = 'tb-pass';
  passBtn.type = 'button';
  passBtn.className = 'game-btn game-btn-primary';
  on(passBtn, 'click', () => {
    if (phase !== 'ticking') return;
    holder = (holder + 1) % players.length;
    who.textContent = `ตอนนี้อยู่ที่ ${players[holder]}`;
  });
  stage.appendChild(passBtn);

  const foot = el('p', 'กดปุ่ม "ส่งต่อ" แล้วส่งมือถือให้คนถัดไปทันที ห้ามถือค้างไว้');
  foot.className = 'tb-foot';
  stage.appendChild(foot);

  paintWakeWarning();
}

function renderBoom(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';
  fuseFillEl = null;

  lastLoser = players[holder];
  stage.appendChild(el('p', 'ตูม!', 'font-size:2rem;font-weight:700'));
  stage.appendChild(el('p', `${lastLoser} ถือมือถืออยู่ตอนระเบิด — แพ้รอบนี้`));

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'tb-again';
  again.type = 'button';
  again.className = 'game-btn game-btn-primary';
  on(again, 'click', () => {
    const stageRef = stageEl;
    const ctxRef = gameCtx;
    teardown();
    if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
  });
  stage.appendChild(again);
  // No outbound link here — #stage must hold no navigation target (a tap-transition would drop it under
  // the finger that just tapped). The crawlable one is static chrome in src/layouts/GameLayout.astro.
}

// ---- Round lifecycle ----

function onReducedMotionChange(e: MediaQueryListEvent): void {
  prefersReducedMotion = e.matches;
}

/** Reads the query once at mount and keeps listening for the rest of the page's life — a player who
 *  flips the OS setting mid-round gets the coarse cadence without a reload. Guarded with `?.` because
 *  `MediaQueryList.addEventListener` is real-browser-only (the test harness's fake window carries no
 *  such method); this is a nice-to-have, not a reachability guard, so failing to attach just means no
 *  live update, never a wrong read of `.matches` itself. */
function watchReducedMotion(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  reducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion = reducedMotionMql.matches;
  reducedMotionMql.addEventListener?.('change', onReducedMotionChange);
}

function arm(): void {
  if (phase !== 'idle') return;
  const myRound = round;

  // 1) Audio — must be called sync within the same gesture
  audioCtx = unlockAudio();

  // 2) Wake lock — fire the request within the same gesture, the result can arrive later
  requestWakeLock()
    .then((handle) => {
      if (myRound !== round) {
        handle?.release();
        return;
      }
      wake = handle;
      wakeWarned = handle === null;
      paintWakeWarning();
    })
    .catch(() => {});

  // 3) Absolute detonation time
  const now = Date.now();
  startedAt = now;
  deadline = pickDeadline(now);
  nextTickAt = now;
  nextFuseUpdateAt = now; // first frame always writes; later frames throttle under reduced motion
  wakeWarned = false;
  wasHidden = document.hidden;

  const roster = gameCtx?.session.players ?? [];
  players = roster.length > 0 ? [...roster] : ['คนที่ถือมือถือ'];
  holder = 0;

  phase = 'ticking';
  renderTicking();
  rafId = requestAnimationFrame(frame);
}

// rAF is a time sampler, not a timer — remaining time comes from deadline - Date.now() every time
function frame(): void {
  rafId = 0;
  if (phase !== 'ticking') return;

  const now = Date.now();
  if (now >= deadline) {
    detonate();
    return;
  }

  if (!document.hidden) {
    const urgency = urgencyAt(now, startedAt, deadline);
    if (now >= nextTickAt) {
      nextTickAt = now + tickIntervalMs(urgency); // set from the current time, never accumulated
      if (audioCtx) tick(audioCtx, urgency);
    }
    // The fuse bar shows that the round is LIVE, not how much of it is left (gh#151). Its width is
    // shimmerAt(now) — a fixed cycle of the wall clock — so it is identical at the same moment
    // whether the fuse drawn was 30s or 90s. This is a per-frame style write from script, not CSS
    // animation — prefers-reduced-motion does not apply to it on its own (unlike gh#76's canvas,
    // which declares none), so under the reduce query the write is throttled to coarse steps rather
    // than removed: the "round is running" signal must survive (gh#77 box7, ADR-0046).
    if (fuseFillEl && now >= nextFuseUpdateAt) {
      if (prefersReducedMotion) nextFuseUpdateAt = now + FUSE_STEP_MS;
      // Both levers move under the query: coarser steps AND a smaller swing. Throttling alone left
      // the full 12% cycle visible, which a browser capture caught.
      fuseFillEl.style.width = `${shimmerAt(now, prefersReducedMotion).toFixed(1)}%`;
    }
  }

  rafId = requestAnimationFrame(frame);
}

function detonate(): void {
  if (phase !== 'ticking') return;
  phase = 'boom';
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (audioCtx) boom(audioCtx);
  navigator.vibrate?.([300, 120, 300]); // iOS has no Vibration API — feature-detect it, never sniff UA
  gameCtx?.session.markPlayed('timebomb');
  releaseWake();
  renderBoom();
}

/** Single entry point for the visible/hidden switch — safe to call repeatedly, from both the DOM
 *  event and the shell's hook */
function handleVisibility(hidden: boolean): void {
  if (phase !== 'ticking') return;
  if (hidden) {
    wasHidden = true; // rAF stops on its own when the tab hides = no sound stays queued
    return;
  }
  if (!wasHidden) return;
  wasHidden = false;
  wake?.reacquire().catch(() => {});
  if (Date.now() >= deadline) {
    detonate(); // time already ran out while backgrounded — detonate now, never keep counting
    return;
  }
  nextTickAt = Date.now();
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function releaseWake(): void {
  wake?.release();
  wake = null;
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  phase = 'idle';
  on(document, 'visibilitychange', () => handleVisibility(document.hidden));
  watchReducedMotion();
  renderIdle();
}

function teardown(): void {
  round += 1; // any pending callback from this round will know it is now stale
  phase = 'idle';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  cleanup.forEach((fn) => fn());
  cleanup = [];
  reducedMotionMql?.removeEventListener?.('change', onReducedMotionChange);
  reducedMotionMql = null;
  releaseWake();
  audioCtx?.close().catch(() => {}); // closing the context closes every oscillator/gain audio.ts made
  audioCtx = null;
  fuseFillEl = null;
  wakeWarned = false;
  wasHidden = false;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'timebomb',
  names: { th: 'ระเบิดเวลา', en: 'Time Bomb' },
  category: 'party',
  players: [2, 10],
  // A party page: the setup panel starts the round, so the shell reads its `hidden` bit and no
  // announcement is needed here (gh#121).
  startsRound: true,
  keywords: ['ระเบิดเวลา', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
  tagline: 'ส่งมือถือวนรอบวง ใครถืออยู่ตอนระเบิด คนนั้นแพ้',
  seo: {
    title: 'ระเบิดเวลา — เกมส่งมือถือวนกัน เล่นฟรีบนเครื่องเดียว',
    description:
      'ตั้งฟิวส์แบบสุ่มแล้วส่งมือถือวนไปรอบวง ใครถืออยู่ตอนระเบิดคนนั้นแพ้ เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'นั่งเป็นวง เลือกจำนวนคนเล่นหรือเลือกชื่อจากกลุ่มเดิม แล้วกดเริ่มจับเวลา',
      'ฟิวส์จะเดินแบบสุ่ม เสียงติ๊กจะถี่ขึ้นเรื่อยๆ เมื่อใกล้ระเบิด',
      'กดปุ่ม "ส่งต่อ" แล้วส่งมือถือให้คนถัดไปทันที ห้ามถือค้างไว้',
      'พอระเบิดดัง คนที่ถือมือถืออยู่คือคนแพ้ กด "เล่นอีกรอบ" เพื่อเริ่มใหม่',
    ],
  },
  og: 'timebomb.png',
  // gh#82 — the how-to-play prose below the stage is ad inventory, per issue #13's amendment 8:
  // the decision was no slot on the PLAY SCREEN, never no slot on the page.
  ads: true,
  // The full-screen route this page hands off to (gh#145). GameLayout.astro turns it into the chrome
  // link, and the game card flips to it. mount() below is still the live entry point on BOTH surfaces:
  // the play route mounts this same module rather than reimplementing it, so the fuse, the wake lock
  // and the arm gate have one implementation.
  playRoute: '/game/timebomb/play/',

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },

  onVisibility(hidden: boolean) {
    handleVisibility(hidden);
  },
};

export default game;
