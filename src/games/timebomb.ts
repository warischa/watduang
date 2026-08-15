// ระเบิดเวลา — ส่งมือถือวนกัน ใครถืออยู่ตอนระเบิดคนนั้นแพ้
// นาฬิกาของเกมนี้คือ "เวลาสิ้นสุดแบบสัมบูรณ์" (deadline) เท่านั้น — ทุก frame คำนวณใหม่จาก
// Date.now() ห้ามบวกสะสมจาก setTimeout/rAF เพราะ browser หรี่ timer ตอนสลับแท็บ แล้วนาฬิกาจะเพี้ยน
// นามสกุล .ts ในเส้นทาง import จำเป็นสำหรับ `node --test` (Node ไม่เดานามสกุลให้) — Vite/tsc รับได้ทั้งคู่
import type { GameContext, GameModule } from './types.ts';
import { boom, tick, unlockAudio } from '../shell/audio.ts';
import { requestWakeLock, type WakeLockHandle } from '../shell/wake-lock.ts';

// ---- เวลา: ส่วนที่คำนวณได้ล้วน ทดสอบได้โดยไม่ต้องมี DOM (ดู timebomb.test.mjs) ----

/** ฟิวส์สั้นสุด/ยาวสุด — สุ่มในช่วงนี้ ผู้เล่นต้องเดาไม่ออก */
export const FUSE_MIN_MS = 15_000;
export const FUSE_MAX_MS = 45_000;

/** คืน "เวลาที่จะระเบิด" เป็น timestamp สัมบูรณ์ ไม่ใช่ระยะเวลา */
export function pickDeadline(now: number, rand: () => number = Math.random): number {
  return now + FUSE_MIN_MS + Math.floor(rand() * (FUSE_MAX_MS - FUSE_MIN_MS + 1));
}

/** 0 ตอนเริ่ม → 1 ตอนถึงกำหนด และ "ค้างที่ 1" เมื่อเลยกำหนดไปแล้ว (เคสสลับแท็บออกไปนาน) */
export function urgencyAt(now: number, startedAt: number, deadline: number): number {
  const total = deadline - startedAt;
  if (total <= 0) return 1;
  const ratio = (now - startedAt) / total;
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
}

const TICK_SLOW_MS = 900;
const TICK_FAST_MS = 120;

/** ระยะห่างของเสียงติ๊ก — ใช้จัดจังหวะเสียงเท่านั้น ไม่ใช่ตัวนับเวลา */
function tickIntervalMs(urgency: number): number {
  return TICK_SLOW_MS - (TICK_SLOW_MS - TICK_FAST_MS) * urgency;
}

// ---- สถานะรอบปัจจุบัน (มีเกมเดียวต่อหนึ่งหน้า) ----

type Phase = 'idle' | 'ticking' | 'boom';

let cleanup: Array<() => void> = [];
let phase: Phase = 'idle';
let round = 0; // token กัน callback ของรอบเก่ายิงใส่รอบใหม่
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

// ---- หน้าจอ ----

/** คำเตือนบรรทัดเดียวตอนขอ wake lock ไม่ผ่าน — เกมยังเล่นได้ตามปกติ */
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
  on(startBtn, 'click', arm); // ต้องอยู่ใน user gesture จริง — iOS ปลดล็อกเสียงให้เฉพาะตรงนี้
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

// ---- วงจรของรอบ ----

function arm(): void {
  if (phase !== 'idle') return;
  const myRound = round;

  // 1) เสียง — ต้องเรียกแบบ sync ใน gesture เดียวกัน
  audioCtx = unlockAudio();

  // 2) กันจอดับ — ยิงคำขอใน gesture เดียวกัน ผลลัพธ์มาทีหลังได้
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

  // 3) เวลาระเบิดแบบสัมบูรณ์
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

// rAF = ตัวสุ่มตัวอย่างเวลา ไม่ใช่ตัวนับเวลา — เวลาที่เหลือมาจาก deadline - Date.now() ทุกครั้ง
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
      nextTickAt = now + tickIntervalMs(urgency); // ตั้งจากเวลาปัจจุบัน ไม่ใช่บวกสะสม
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
  navigator.vibrate?.([300, 120, 300]); // iOS ไม่มี Vibration API — ตรวจที่ตัวฟีเจอร์ ไม่ดู UA
  gameCtx?.session.markPlayed('timebomb');
  releaseWake();
  renderBoom();
}

/** ทางเข้าเดียวของการสลับ visible/hidden — เรียกซ้ำได้ ทั้งจาก DOM event และ hook ของ shell */
function handleVisibility(hidden: boolean): void {
  if (phase !== 'ticking') return;
  if (hidden) {
    wasHidden = true; // rAF หยุดเองตอนแท็บถูกซ่อน = ไม่มีเสียงถูกตั้งคิวไว้
    return;
  }
  if (!wasHidden) return;
  wasHidden = false;
  wake?.reacquire().catch(() => {});
  if (Date.now() >= deadline) {
    detonate(); // หมดเวลาไปแล้วตอนอยู่หลังฉาก — ระเบิดทันที ห้ามนับต่อ
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
  round += 1; // callback ที่ค้างอยู่ของรอบนี้จะรู้ตัวว่าตกรุ่นแล้ว
  phase = 'idle';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  cleanup.forEach((fn) => fn());
  cleanup = [];
  releaseWake();
  audioCtx?.close().catch(() => {}); // ปิด context = ปิด oscillator/gain ทุกตัวที่ audio.ts สร้าง
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
  ads: false, // จอเล่น = ห้ามมี ad slot เสมอ

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
