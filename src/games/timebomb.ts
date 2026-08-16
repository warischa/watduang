// Time Bomb — the phone passes around the circle, whoever holds it when it detonates loses.
// This game's clock is the absolute deadline only — every frame recomputes fresh from
// Date.now(). Never accumulate from setTimeout/rAF: the browser throttles timers on tab switch,
// which would drift the clock.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { boom, tick, unlockAudio } from '../shell/audio.ts';
import { requestWakeLock, type WakeLockHandle } from '../shell/wake-lock.ts';

// ---- Time: pure and calculable, testable with no DOM (see timebomb.test.mjs) ----

/** Shortest/longest fuse — random within this range, players must not be able to guess it */
export const FUSE_MIN_MS = 15_000;
export const FUSE_MAX_MS = 45_000;

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

const TICK_SLOW_MS = 900;
const TICK_FAST_MS = 120;

/** Tick sound spacing — used to pace the sound only, not a timer */
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
let pulseLevel = 1;
let pulseEl: HTMLElement | null = null;
let wakeWarned = false;
let wasHidden = false;
let players: string[] = [];
let holder = 0;

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

/** One-line warning when the wake lock request fails — the game still plays normally */
function paintWakeWarning(): void {
  const warn = stageEl?.querySelector('#tb-warn') as HTMLElement | null;
  if (warn) warn.hidden = !wakeWarned;
}

function renderIdle(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const names = gameCtx?.session.players ?? [];
  stage.appendChild(el('p', `วง ${names.length || '-'} คน — ส่งมือถือวนไปเรื่อยๆ`));
  stage.appendChild(el('p', 'กดเริ่มแล้วฟิวส์จะเดิน ไม่มีใครรู้ว่าจะระเบิดตอนไหน'));

  const startBtn = el('button', 'เริ่มจับเวลา');
  startBtn.id = 'tb-start';
  startBtn.type = 'button';
  on(startBtn, 'click', arm); // must be a real user gesture — iOS only unlocks audio right here
  stage.appendChild(startBtn);
}

function renderTicking(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const pulse = el('p', 'ฟิวส์กำลังเดิน', 'font-size:1.5rem;font-weight:700');
  pulse.id = 'tb-pulse';
  pulseEl = pulse;
  stage.appendChild(pulse);

  const warn = el('p', 'อย่าปล่อยให้จอดับ', 'font-weight:600');
  warn.id = 'tb-warn';
  warn.hidden = true;
  stage.appendChild(warn);

  const who = el('p', '');
  who.id = 'tb-holder';
  stage.appendChild(who);

  const passBtn = el('button', 'ส่งต่อ');
  passBtn.id = 'tb-pass';
  passBtn.type = 'button';
  on(passBtn, 'click', () => {
    if (phase !== 'ticking') return;
    holder = (holder + 1) % players.length;
    who.textContent = `ตอนนี้อยู่ที่ ${players[holder]}`;
  });
  stage.appendChild(passBtn);

  who.textContent = `ตอนนี้อยู่ที่ ${players[holder]}`;
  paintWakeWarning();
}

function renderBoom(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  pulseEl = null;

  stage.appendChild(el('p', 'ตูม!', 'font-size:2rem;font-weight:700'));
  stage.appendChild(el('p', `${players[holder]} ถือมือถืออยู่ตอนระเบิด — แพ้รอบนี้`));

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'tb-again';
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
}

// ---- Round lifecycle ----

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
  pulseLevel = 1;
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
      pulseLevel = 1;
    }
    // matchMedia read here, not module scope — node --test imports this file, no `window` there.
    // ponytail: per-frame on purpose — it honours an OS toggle flipped mid-round, and detonation
    // timing measured within 21ms of the unguarded path. Cache it only if a frame budget says to.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (pulseEl) pulseEl.style.opacity = '1';
    } else {
      pulseLevel = Math.max(0.3, pulseLevel - 0.04);
      if (pulseEl) pulseEl.style.opacity = pulseLevel.toFixed(2);
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
  renderIdle();
}

function teardown(): void {
  round += 1; // any pending callback from this round will know it is now stale
  phase = 'idle';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  cleanup.forEach((fn) => fn());
  cleanup = [];
  releaseWake();
  audioCtx?.close().catch(() => {}); // closing the context closes every oscillator/gain audio.ts made
  audioCtx = null;
  pulseEl = null;
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
  keywords: ['ระเบิดเวลา', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
  needs: [],
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
  ads: false, // play screen = never an ad slot

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
