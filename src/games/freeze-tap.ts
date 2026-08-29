// Freeze Tap — one signal is drawn for the whole pass, the phone goes round, and each player taps
// the instant that signal lights. Tapping before it ("มือลั่น") loses the round on the spot;
// otherwise the slowest reaction in the group is the one who gets it.
// No checkpoint by design: the round derives from ctx.session.players at mount, lives in this
// closure, and dies on refresh and on dispose(). A refresh restarts the pass at turn 1 with a fresh
// signal — siamsi stays the sole checkpoint writer (ADR-0010). The only session write here is
// markPlayed at round end, like timebomb/short-stick/pick-loser.
//
// This file DOES move: the pad carries the mockup's particle burst and its screen shake, because a
// reaction game needs a signal you can feel. Both are JS-driven (a rAF loop, a `.style.transform`
// write), which prefers-reduced-motion does not reach on its own — so the literal
// matchMedia('(prefers-reduced-motion: reduce)') is read in this file, in code, and gates the loop
// (scripts/js-motion-guard-check.mjs proves presence, the two tests below prove it is not inert).
// The trigger paint itself stays instant and is unchanged in both modes: `triggerAt` is stamped
// before any paint, so no effect frame ever lands inside a measured reaction time.
// ponytail: a guard read through a helper or another module would not count — the gate needs the
// literal call here.
//
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons, ARM_DELAY_MS } from './_arm-gate.ts';
import { el } from './_el.ts';

// ---- The round: pure and calculable, testable with no DOM (see freeze-tap.test.mjs) ----

/** One trigger channel: a symbol and a Thai word, drawn identically for the trigger and for every
 *  decoy. Telling them apart means reading the rule, which is the whole game. The mockup's four
 *  COLOR conditions are dropped — they need six new hexes each, and its own handoff notes say not
 *  to rest the signal on colour alone. */
export interface Signal {
  readonly word: string;
  readonly symbol: string;
}

// Word and symbol are the mockup's own, kept paired exactly as its TEXT_GO / TEXT_TAP / TEXT_NOW
// conditions pair them (targetText with targetSymbol) — the exclamation mark included. All three
// symbols are single-codepoint emoji (U+1F680, U+26A1, U+1F3AF) with no variation selector and no
// ZWJ, so they are written literally; anything carrying an invisible codepoint is escaped instead.
export const SIGNALS: readonly Signal[] = [
  { symbol: '🚀', word: 'ลุยเลย!' },
  { symbol: '⚡', word: 'กดเลย!' },
  { symbol: '🎯', word: 'เดี๋ยวนี้!' },
];

export const WAIT_MIN_MS = 1500;
export const WAIT_MAX_MS = 6000;
/** No decoy before this — a player needs time to read the pad before anything changes on it. */
export const DECOY_LEAD_MS = 400;
/** How long a decoy stays lit before the pad returns to resting. */
export const DECOY_HOLD_MS = 350;
/** The pad is resting for at least this long before the trigger, so the trigger is always a
 *  resting-to-lit transition rather than one token swapping for another. */
export const DECOY_CLEAR_MS = 350;
export const MAX_DECOYS = 4;
/** The longest a valid reaction can be recorded as. The mockup has no cap, so a triggered attempt
 *  nobody taps sits forever with no timer and no button. A capped attempt is an ordinary slow time
 *  and ties like any other: it is the same number for everyone, so it grants nobody an advantage. */
export const REACT_CAP_MS = 3000;

export interface Round {
  /** The pass order. The index IS the turn, so duplicate names stay distinguishable. */
  readonly order: readonly string[];
  /** Index into SIGNALS — one signal for the whole pass, so every reaction time is comparable. */
  readonly signal: number;
}

export function startRound(players: readonly string[], rand: () => number = Math.random): Round {
  if (players.length === 0) {
    throw new Error('freeze-tap: ผู้เล่นว่างเปล่า — ต้องมีอย่างน้อย 1 คนถึงจะเริ่มรอบได้');
  }
  return { order: [...players], signal: pickSignal(rand) };
}

export function pickSignal(rand: () => number = Math.random): number {
  return Math.floor(rand() * SIGNALS.length);
}

/** Uniform over every index EXCEPT `trigger`, so a decoy can never satisfy the active rule by
 *  construction — rather than by a hand-maintained per-condition decoy list that has to be checked
 *  against the trigger every time someone adds a signal. */
export function pickDecoy(trigger: number, rand: () => number = Math.random): number {
  const i = Math.floor(rand() * (SIGNALS.length - 1));
  return i >= trigger ? i + 1 : i;
}

export function pickDelay(rand: () => number = Math.random): number {
  return Math.round(WAIT_MIN_MS + rand() * (WAIT_MAX_MS - WAIT_MIN_MS));
}

/** `signal: null` means the pad goes back to resting. */
export type PadEvent = { readonly at: number; readonly signal: number | null };

/** The whole pad timeline for one attempt, ascending by `at`, shows and hides alternating. Every
 *  event satisfies `at <= delayMs - DECOY_CLEAR_MS`.
 *
 *  Slot-based, and that is the point: the mockup generates times then post-filters them
 *  (its decoy generator picks times first and drops the ones out of range), so at a short delay a
 *  share of its decoys silently vanish and a run can end up with none at all. Here the slots are in range by construction, so nothing is dropped —
 *  `count` slots of width `W` over the usable span, one hold placed at random inside each. */
export function padSchedule(
  delayMs: number,
  trigger: number,
  rand: () => number = Math.random,
): readonly PadEvent[] {
  const span = delayMs - DECOY_LEAD_MS - DECOY_HOLD_MS - DECOY_CLEAR_MS;
  const cap = Math.floor((span + DECOY_HOLD_MS) / DECOY_HOLD_MS);
  if (cap < 1) return []; // the delay is too short to hold even one decoy inside the bounds above
  const count = Math.min(1 + Math.floor(rand() * MAX_DECOYS), cap);
  const width = (span + DECOY_HOLD_MS) / count;

  const events: PadEvent[] = [];
  for (let i = 0; i < count; i++) {
    // Integer ms on purpose: setTimeout takes whole milliseconds anyway, and it keeps the hold
    // exactly DECOY_HOLD_MS instead of a float subtraction that lands a hair off it.
    const at = Math.round(DECOY_LEAD_MS + i * width + rand() * (width - DECOY_HOLD_MS));
    events.push({ at, signal: pickDecoy(trigger, rand) });
    events.push({ at: at + DECOY_HOLD_MS, signal: null });
  }
  return events;
}

/** The number the player is shown AND the number the loss rule compares — one function so the two
 *  can never disagree. The mockup's tie test is exactly that disagreement: it compares raw
 *  performance.now() floats within the tie tolerance of its result comparison, so two rows both
 *  printing "380 ms"
 *  resolve as a unique loser and its sudden-death path is unreachable. */
export function displayMs(raw: number): number {
  return Math.max(1, Math.round(raw));
}

/** `ms === null` means a false start. Keyed on `turn`, never on the name — two players entering the
 *  same name is legal (short-stick's rule). */
export interface Attempt {
  readonly player: string;
  readonly turn: number;
  readonly ms: number | null;
}

export type Verdict =
  | { readonly kind: 'false-start'; readonly turn: number }
  | { readonly kind: 'loser'; readonly turn: number }
  | { readonly kind: 'tie'; readonly turns: readonly number[] };

type ValidAttempt = Attempt & { readonly ms: number };
const isValid = (a: Attempt): a is ValidAttempt => a.ms !== null;

/** Loss priority, in one place: (1) a false start loses whatever anyone else scored; (2) otherwise
 *  the slowest displayed ms loses; (3) two or more sharing the slowest displayed ms is a tie. */
export function verdict(attempts: readonly Attempt[]): Verdict {
  if (attempts.length === 0) {
    throw new Error('freeze-tap: รายการตาที่เล่นว่างเปล่า');
  }
  const foul = attempts.find((a) => a.ms === null);
  if (foul) return { kind: 'false-start', turn: foul.turn };

  const valid = attempts.filter(isValid);
  const slowest = Math.max(...valid.map((a) => displayMs(a.ms)));
  const tied = valid.filter((a) => displayMs(a.ms) === slowest);
  if (tied.length > 1) return { kind: 'tie', turns: tied.map((a) => a.turn) };
  return { kind: 'loser', turn: tied[0].turn };
}

/** Valid attempts ascending by displayed ms, false starts last. Stable within equal times. */
export function ranking(attempts: readonly Attempt[]): readonly Attempt[] {
  const valid = attempts.filter(isValid).sort((a, b) => displayMs(a.ms) - displayMs(b.ms));
  return [...valid, ...attempts.filter((a) => a.ms === null)];
}

/** The signal token, built once and shown on the rule block and on the pad — so what the rule
 *  promises and what the pad paints cannot drift apart. */
export function signalToken(signal: Signal): string {
  return `${signal.symbol} ${signal.word}`;
}

// ---- Current round state (one game per page) ----

type Phase = 'handoff' | 'waiting' | 'triggered' | 'attempt' | 'showdown' | 'void' | 'results';

let cleanup: Array<() => void> = [];
let timers: Array<ReturnType<typeof setTimeout>> = [];
let phase: Phase = 'handoff';
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let round: Round | null = null;
let turn = 0;
let attempts: Attempt[] = [];
let isShowdown = false;
let padEl: HTMLElement | null = null;
let padTokenEl: HTMLElement | null = null;
let generation = 0; // token guarding against a torn-down attempt's callback firing into a new one
let triggerAt = 0;
// The ghost-tap window for the pad. The ready tap swaps the pad in under the same finger, so the
// hand-off's own second contact would otherwise land on the attempt surface and cost that player
// the round before they ever saw it. Same constant as every gated button (_arm-gate.ts), so there
// is one 400ms in the repo rather than a second number to keep in step.
let armedAt = 0;
let handled = false; // one attempt per player, even if two input events arrive

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

function clearTimers(): void {
  timers.forEach((id) => clearTimeout(id));
  timers = [];
}

const clock = (): number => performance.now();

// ---- The feel layer: one canvas burst and one screen shake, fired on EVERY pad light ----
//
// Ported from the mockup's particle/trauma engine — ADR-0033 exempts a ported game from the
// design-canvas requirement, so every number below is the mockup's own (its `particleLoop` for the
// decay rate, the 18px offset, the trauma-squared magnitude and the 0.1s frame clamp; the non-hazard
// branch of its `spawnShockParticles` for the count, speed, size and per-particle life decay; its
// `activateTrigger` for the 0.4 trauma of one light).
//
// Fired on every light, DECOY INCLUDED, never on the trigger alone. A burst reserved for the real
// signal would tell a player when to tap without reading the word, which is the whole skill this
// game tests (the same invariant paintPad carries). The mockup adds trauma only at its trigger; that
// is the one value not taken from it.
const TRAUMA_PER_LIGHT = 0.4;
const TRAUMA_DECAY_PER_S = 2.8;
const SHAKE_MAX_PX = 18;
const FRAME_DT_CAP_S = 0.1;
const SPARK_COUNT = 30;
/** Reduced-motion redraw cadence — the same coarse step timebomb.ts steps its fuse on (ADR-0046). */
const FX_STEP_MS = 250;
/** The mockup's per-frame life decay is per FRAME; scaling by dt against this makes the burst
 *  frame-rate independent up to FRAME_DT_CAP_S. Beyond it the cap bites: a reduced FX_STEP_MS step
 *  advances decay by 0.1s per 0.25s of wall clock, so the burst lingers ~2.5x longer under reduce.
 *  Accepted — it fires on decoys too, so a longer burst is no trigger tell and no fairness delta. */
const FX_REFERENCE_FPS = 60;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  decay: number;
}

let sparks: Spark[] = [];
let trauma = 0;
let fxRaf = 0;
let fxLastFrame = 0;
let fxNextStepAt = 0;
let fxPad: HTMLElement | null = null;
let fxCtx: CanvasRenderingContext2D | null = null;
let fxW = 0;
let fxH = 0;
let fxInk = '';
let prefersReducedMotion = false;
let reducedMotionMql: MediaQueryList | null = null;

function onReducedMotionChange(ev: Event): void {
  prefersReducedMotion = (ev as MediaQueryListEvent).matches;
  // A flip mid-decay must settle the pad: the reduce branch below never writes transform again.
  if (prefersReducedMotion && fxPad) fxPad.style.transform = 'none';
}

/** Read at mount and watched after, so a player who flips the OS setting mid-round gets the reduced
 *  treatment without a reload. The listener goes through on() so teardown() drops it with the rest —
 *  guarded because a MediaQueryList without addEventListener (old Safari, and the unit tests' fake
 *  window) must still yield a usable `matches`. */
function watchReducedMotion(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  reducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion = reducedMotionMql.matches;
  if (typeof reducedMotionMql.addEventListener === 'function') {
    on(reducedMotionMql, 'change', onReducedMotionChange);
  }
}

/** The canvas is a child of the pad, not of the stage: every screen render calls
 *  stage.replaceChildren(), and the burst only ever has to outlive a paint of the pad itself. */
function attachFx(pad: HTMLElement): void {
  fxPad = pad;
  sparks = [];
  trauma = 0;
  fxCtx = null;
  fxW = 0;
  fxH = 0;
  const w = pad.clientWidth ?? 0;
  const h = pad.clientHeight ?? 0;
  // No laid-out box to draw into (the unit tests' fake DOM, or a pad not yet in the document): the
  // shake still runs, and the burst is the decoration, never the signal.
  if (!w || !h) return;
  const canvas = el('canvas');
  canvas.className = 'ft-fx';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx2d) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx2d.scale(dpr, dpr);
  // The spark colour is the shell's own ink token, read by NAME off the pad — the lit pad is
  // var(--page-accent), so a spark in the accent would be invisible on it, and no hex belongs here.
  fxInk = typeof getComputedStyle === 'function'
    ? getComputedStyle(pad).getPropertyValue('--color-line-strong').trim()
    : '';
  if (!fxInk) return;
  pad.appendChild(canvas);
  fxCtx = ctx2d;
  fxW = w;
  fxH = h;
}

function scheduleFxFrame(): void {
  if (fxRaf || typeof requestAnimationFrame !== 'function') return;
  fxRaf = requestAnimationFrame(fxFrame);
}

/** One light's worth of feedback: trauma for the shake, a ring of sparks from the pad's centre. */
function fireFx(): void {
  if (!fxPad) return;
  trauma = Math.min(1, trauma + TRAUMA_PER_LIGHT);
  if (fxCtx) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5;
      sparks.push({
        x: fxW / 2,
        y: fxH / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
      });
    }
  }
  fxLastFrame = clock();
  fxNextStepAt = 0; // the first frame after a light always draws, in both modes
  scheduleFxFrame();
}

// ADR-0046 — reduce, never remove. What still changes under `(prefers-reduced-motion: reduce)`:
// the pad's lit background, its token text, and the burst itself, which still appears and still
// fades out (~2.5x slower — see FX_REFERENCE_FPS). What is reduced: the redraw drops from once a
// frame to once every FX_STEP_MS, and the sparks stop travelling. What is removed: only the shake, which is pure
// translation carrying no information no other channel already carries.
// That is enough for a reaction game, because the trigger a player reacts to is the pad's lit
// background plus its token — painted synchronously, identically, and at the same instant in both
// modes. The effect layer never gates, delays or reports the trigger, so a player who sees none of
// it reacts to exactly what everyone else reacts to and is not at a disadvantage.
function fxFrame(now: number): void {
  fxRaf = 0;
  const pad = fxPad;
  if (!pad) return;
  if (prefersReducedMotion && now < fxNextStepAt) {
    scheduleFxFrame();
    return;
  }
  const dt = Math.min((now - fxLastFrame) / 1000, FRAME_DT_CAP_S);
  fxLastFrame = now;
  if (prefersReducedMotion) fxNextStepAt = now + FX_STEP_MS;

  trauma = Math.max(0, trauma - dt * TRAUMA_DECAY_PER_S);
  if (!prefersReducedMotion) {
    const magnitude = trauma * trauma;
    const dx = (Math.random() - 0.5) * SHAKE_MAX_PX * magnitude;
    const dy = (Math.random() - 0.5) * SHAKE_MAX_PX * magnitude;
    // Moving the pad does not move the tap target: the input listener sits on the stage (see
    // mountInto), so a tap anywhere on the attempt screen counts wherever the pad has been shifted to.
    pad.style.transform = trauma > 0 ? `translate(${dx}px, ${dy}px)` : 'none';
  }

  drawSparks(dt);
  if (trauma > 0 || sparks.length > 0) scheduleFxFrame();
}

function drawSparks(dt: number): void {
  const ctx2d = fxCtx;
  if (!ctx2d) {
    sparks = [];
    return;
  }
  const step = dt * FX_REFERENCE_FPS;
  ctx2d.clearRect(0, 0, fxW, fxH);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.life -= p.decay * step;
    if (p.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }
    if (!prefersReducedMotion) {
      p.x += p.vx * step;
      p.y += p.vy * step;
    }
    ctx2d.save();
    ctx2d.globalAlpha = Math.max(0, p.life);
    ctx2d.fillStyle = fxInk;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();
  }
}

function stopFx(): void {
  if (fxRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(fxRaf);
  fxRaf = 0;
  sparks = [];
  trauma = 0;
  fxPad = null;
  fxCtx = null;
  fxInk = '';
}

// ---- Screens ----
// Class names carry the `ft-` prefix and are styled from src/styles/games/freeze-tap.css; the shared
// controls reuse the .stage-screen / .game-btn / .game-btn-primary / .game-btn-secondary shell
// vocabulary from src/pages/game/[id].astro's is:global sheet, which this game never redeclares.
// Text is set through el()'s textContent, never innerHTML, so a player-typed name can never be
// markup — the mockup needs an escapeHtml(); this port needs none.
// No outbound link on any screen — #stage must hold no navigation target (a tap-transition would
// drop it under the finger that just tapped). The crawlable one is static chrome in GameLayout.astro.

/** The rule block: label, the signal token, and what to do with it. Shown on the hand-off and again
 *  on the attempt surface — a player who forgot the word must be able to read it while waiting. */
function ruleBlock(signal: Signal): HTMLElement {
  const box = el('div');
  box.className = 'ft-rule';
  const label = el('span', 'กฎรอบนี้');
  label.className = 'ft-rule-label';
  const token = el('span', signalToken(signal));
  token.className = 'ft-rule-token';
  // The mockup's prompt shape, with the word interpolated so the rule and the pad cannot drift.
  const text = el('span', `แตะเฉพาะเมื่อปุ่มขึ้นคำว่า ${signal.word}`);
  text.className = 'ft-rule-text';
  box.appendChild(label);
  box.appendChild(token);
  box.appendChild(text);
  return box;
}

function renderHandoff(): void {
  const stage = stageEl;
  const r = round;
  if (!stage || !r) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const label = isShowdown ? 'รอบดวลตัดสิน — ตาที่ ' : 'ตาที่ ';
  const heading = el('span', `${label}${turn + 1} จาก ${r.order.length}`);
  heading.className = 'ft-turn';
  stage.appendChild(heading);

  // The hand-off prompt is built here, in-stage, rather than through src/shell/PassPhone.astro:
  // that file is a hidden 7-line stub with no show API which no shipped game uses, and the ready
  // button has to sit inside #stage for armAllButtons(stage) to reach it at all.
  const holder = el('div');
  holder.className = 'ft-holder';
  const kicker = el('span', 'ส่งมือถือให้');
  kicker.className = 'ft-holder-kicker';
  const name = el('span', r.order[turn]);
  name.className = 'ft-holder-name';
  holder.appendChild(kicker);
  holder.appendChild(name);
  stage.appendChild(holder);

  stage.appendChild(ruleBlock(SIGNALS[r.signal]));

  // The mockup's own decoy warning, verbatim. Its leading glyph is U+26A0 WARNING SIGN followed by
  // U+FE0F VARIATION SELECTOR-16 — the selector is invisible in a diff and any whitespace or
  // formatting cleaner would silently drop it, leaving a monochrome glyph, so it is escaped here.
  const foot = el('p', '\u26A0\uFE0F ระวังสัญญาณหลอก!');
  foot.className = 'ft-foot';
  stage.appendChild(foot);

  const ready = el('button', 'พร้อมแล้ว เริ่มตาของคุณ');
  ready.id = 'ft-ready';
  ready.type = 'button';
  ready.className = 'game-btn game-btn-primary';
  on(ready, 'click', beginAttempt);
  stage.appendChild(ready);

  cleanup.push(armAllButtons(stage));
}

/** The attempt surface. Repainted in place for the triggered phase — a re-render between the logical
 *  trigger and the visible one would put DOM work inside every measured reaction. */
function renderWaiting(): void {
  const stage = stageEl;
  const r = round;
  if (!stage || !r) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const heading = el('span', `ตาของ ${r.order[turn]}`);
  heading.className = 'ft-turn';
  stage.appendChild(heading);

  stage.appendChild(ruleBlock(SIGNALS[r.signal]));

  // A div[role=button], not a <button>. The input listener lives on the stage (see mountInto), so
  // nothing here depends on whether a `disabled` element dispatches pointerdown, and this screen
  // builds no button at all — which is why it needs no armAllButtons call and no recorded
  // `except` exception for one (ADR-0016 owns that decision, not this file).
  const pad = el('div');
  pad.className = 'ft-pad';
  pad.setAttribute('role', 'button');
  pad.setAttribute('tabindex', '0');
  pad.setAttribute('aria-label', 'ปุ่มแตะสัญญาณ');
  const token = el('span', 'รอสัญญาณ');
  token.className = 'ft-pad-token';
  pad.appendChild(token);
  stage.appendChild(pad);
  padEl = pad;
  padTokenEl = token;
  attachFx(pad); // after the append, so the pad has a laid-out box to size the canvas from

  const foot = el('p', 'ห้ามแตะก่อนสัญญาณจริง');
  foot.className = 'ft-foot';
  stage.appendChild(foot);
}

function renderAttempt(player: string, ms: number, next: string | null): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const holder = el('div');
  holder.className = 'ft-holder';
  const kicker = el('span', 'เวลาตอบสนองของ');
  kicker.className = 'ft-holder-kicker';
  const name = el('span', player);
  name.className = 'ft-holder-name';
  holder.appendChild(kicker);
  holder.appendChild(name);
  stage.appendChild(holder);

  const shout = el('span', `${displayMs(ms)} ms`);
  shout.className = 'ft-shout';
  stage.appendChild(shout);

  const foot = el('p', 'ยังไม่บอกว่าใครช้าสุด รอครบทุกคนก่อน');
  foot.className = 'ft-foot';
  stage.appendChild(foot);

  const nextBtn = el('button', next === null ? 'ดูผลสรุปทั้งวง' : `ส่งมือถือให้ ${next}`);
  nextBtn.id = 'ft-next';
  nextBtn.type = 'button';
  nextBtn.className = 'game-btn game-btn-primary';
  on(nextBtn, 'click', advanceTurn);
  stage.appendChild(nextBtn);

  cleanup.push(armAllButtons(stage));
}

function renderShowdown(names: readonly string[]): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const shout = el('span', 'เวลาช้าสุดเท่ากัน');
  shout.className = 'ft-shout';
  stage.appendChild(shout);

  const remark = el('p', `${names.join(' กับ ')} ต้องดวลกันอีกรอบ ใครช้ากว่าหรือมือลั่นก่อนคนนั้นโดน`);
  remark.className = 'ft-remark';
  stage.appendChild(remark);

  const start = el('button', 'เริ่มรอบดวลตัดสิน');
  start.id = 'ft-showdown';
  start.type = 'button';
  start.className = 'game-btn game-btn-primary';
  on(start, 'click', beginShowdown);
  stage.appendChild(start);

  cleanup.push(armAllButtons(stage));
}

/** The interrupted attempt. The mockup's interruption modal becomes a phase, not a modal: the shell
 *  owns no game-level modal, and a phase is covered by the arm gate for free. */
function renderVoid(player: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const shout = el('span', 'หลุดการโฟกัสเกม');
  shout.className = 'ft-shout';
  stage.appendChild(shout);

  const remark = el('p', 'เบราว์เซอร์ถูกสลับหน้าต่างระหว่างรอบ กรุณาเปิดหน้าจอเกมค้างไว้ระหว่างเล่น!');
  remark.className = 'ft-remark';
  stage.appendChild(remark);

  const retry = el('button', `เล่นตาของ ${player} ใหม่`);
  retry.id = 'ft-retry';
  retry.type = 'button';
  retry.className = 'game-btn game-btn-primary';
  on(retry, 'click', () => {
    if (phase !== 'void') return;
    toHandoff();
  });
  stage.appendChild(retry);

  cleanup.push(armAllButtons(stage));
}

function renderResults(v: Verdict): void {
  const stage = stageEl;
  if (!stage || v.kind === 'tie') return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const loser = attempts.find((a) => a.turn === v.turn);
  const rows = ranking(attempts);

  const label = el('span', 'คนโดนคือ');
  label.className = 'ft-label';
  stage.appendChild(label);

  const shout = el('span', loser?.player ?? '');
  shout.className = 'ft-shout';
  stage.appendChild(shout);

  const reason = el(
    'p',
    v.kind === 'false-start'
      ? 'มือลั่น — แตะก่อนสัญญาณจริง'
      : `ช้าสุดในวง ${displayMs(loser?.ms ?? 0)} ms`,
  );
  reason.className = 'ft-remark';
  stage.appendChild(reason);

  // The whole pass, fastest first, with the false start last — the false-start branch ends the pass
  // at once, so this table also says who never got to play. The mockup's separate false-start screen
  // is deleted: it is one extra screen and one extra tap to say what this one already says.
  const rank = el('div');
  rank.className = 'ft-rank';
  rows.forEach((a, i) => {
    const row = el('div');
    row.className = a.turn === v.turn ? 'ft-rank-row ft-rank-row--loser' : 'ft-rank-row';
    const pos = el('span', String(i + 1));
    pos.className = 'ft-rank-pos';
    const name = el('span', a.player);
    name.className = 'ft-rank-name';
    const time = el('span', a.ms === null ? 'มือลั่น' : `${displayMs(a.ms)} ms`);
    time.className = 'ft-rank-ms';
    row.appendChild(pos);
    row.appendChild(name);
    row.appendChild(time);
    rank.appendChild(row);
  });
  stage.appendChild(rank);

  const foot = el('p', 'วงตกลงกันเองว่าคนโดนต้องทำอะไร');
  foot.className = 'ft-foot';
  stage.appendChild(foot);

  const again = el('button', 'เล่นอีกรอบ');
  again.id = 'ft-again';
  again.type = 'button';
  again.className = 'game-btn game-btn-primary';
  on(again, 'click', () => {
    const stageRef = stageEl;
    const ctxRef = gameCtx;
    teardown();
    if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
  });
  stage.appendChild(again);

  // The secondary control: back to the setup panel so the group can re-tick. Not wired to the panel
  // DOM — the game tears itself down and dispatches watduang:change-players on document, and
  // src/pages/game/[id].astro is the one place that owns putting the panel back.
  const change = el('button', 'เปลี่ยนคนเล่น');
  change.id = 'ft-change';
  change.type = 'button';
  change.className = 'game-btn game-btn-secondary';
  on(change, 'click', () => {
    teardown();
    document.dispatchEvent(new CustomEvent('watduang:change-players', { bubbles: true }));
  });
  stage.appendChild(change);

  const hint = el('span', 'ปุ่มรองจะกดได้หลังผลออก 0.4 วินาที กันนิ้วลั่น');
  hint.className = 'ft-hint';
  stage.appendChild(hint);

  // The tap that revealed the result swaps this screen in under the same finger, so a ghost second
  // contact would land on "เล่นอีกรอบ" and restart the round before anyone read who got it. Nothing
  // here is checkpointed, so an erased round is an erased round.
  cleanup.push(armAllButtons(stage));
}

/** Every pad paint goes through here: the token text is the only channel, and a decoy lights the pad
 *  exactly like the trigger does. A flash reserved for the trigger would give the answer away to
 *  someone not reading the rule, which is the whole skill the game tests. */
function paintPad(signal: number | null): void {
  if (!padEl || !padTokenEl) return;
  padTokenEl.textContent = signal === null ? 'รอสัญญาณ' : signalToken(SIGNALS[signal]);
  padEl.className = signal === null ? 'ft-pad' : 'ft-pad ft-pad--flash';
  // The paint above lands first, always: the effect is decoration on top of a signal that is already
  // on screen, and it runs for a decoy exactly as it runs for the trigger.
  if (signal !== null) fireFx();
}

// ---- Round lifecycle ----

function toHandoff(): void {
  phase = 'handoff';
  renderHandoff();
}

function beginAttempt(): void {
  const r = round;
  if (!r || phase !== 'handoff') return;
  clearTimers();
  generation += 1;
  const gen = generation;

  phase = 'waiting';
  handled = false;
  armedAt = clock() + ARM_DELAY_MS;
  renderWaiting();

  const delay = pickDelay();
  for (const event of padSchedule(delay, r.signal)) {
    timers.push(setTimeout(() => {
      if (gen !== generation || phase !== 'waiting') return;
      paintPad(event.signal);
    }, event.at));
  }
  timers.push(setTimeout(() => {
    if (gen !== generation || phase !== 'waiting') return;
    fire(gen);
  }, delay));
}

function fire(gen: number): void {
  const r = round;
  if (!r) return;
  phase = 'triggered';
  triggerAt = clock();
  paintPad(r.signal);
  // Closes the branch the mockup leaves hanging: triggered with nobody tapping, forever.
  timers.push(setTimeout(() => {
    if (gen !== generation || phase !== 'triggered' || handled) return;
    handled = true;
    recordAttempt(REACT_CAP_MS);
  }, REACT_CAP_MS));
}

function recordAttempt(ms: number | null): void {
  const r = round;
  if (!r) return;
  clearTimers();
  attempts.push({ player: r.order[turn], turn, ms });

  if (ms === null) {
    // A false start ends the pass at once — the players after this one never get a turn.
    finish(verdict(attempts));
    return;
  }
  phase = 'attempt';
  const next = turn + 1 < r.order.length ? r.order[turn + 1] : null;
  renderAttempt(r.order[turn], ms, next);
}

function advanceTurn(): void {
  const r = round;
  if (!r || phase !== 'attempt') return;
  turn += 1;
  if (turn < r.order.length) {
    toHandoff();
    return;
  }
  const v = verdict(attempts);
  if (v.kind === 'tie') {
    phase = 'showdown';
    renderShowdown(v.turns.map((t) => r.order[t]));
    return;
  }
  finish(v);
}

/** The tied players re-run the same phases over the SAME signal, so the second pass is comparable
 *  with the first. ponytail: uncapped on purpose — a tie inside a showdown starts another showdown.
 *  Capping it would mean breaking the remaining tie at random, which is the one thing the game must
 *  not do; a group that keeps tying to the millisecond can keep duelling. */
function beginShowdown(): void {
  const r = round;
  if (!r || phase !== 'showdown') return;
  const tied = verdict(attempts);
  if (tied.kind !== 'tie') return;
  round = { order: tied.turns.map((t) => r.order[t]), signal: r.signal };
  isShowdown = true;
  turn = 0;
  attempts = [];
  toHandoff();
}

function finish(v: Verdict): void {
  phase = 'results';
  gameCtx?.session.markPlayed('freeze-tap');
  renderResults(v);
}

/** One pointerdown listener on the stage rather than on the pad, so nothing depends on whether a
 *  `disabled` element dispatches pointerdown (the one fact _arm-gate.ts says is proven only by a
 *  manual probe). preventDefault() suppresses the synthetic click, the long-press menu and
 *  Space-scrolling — but only in the two phases that own the input, or it would swallow the
 *  activation of every button on every other screen. */
function onPadInput(ev: Event): void {
  if (phase !== 'waiting' && phase !== 'triggered') return;
  ev.preventDefault();
  if (handled) return;
  const now = clock();

  if (phase === 'waiting') {
    if (now < armedAt) return; // the hand-off's own ghost contact, not a decision to tap
    handled = true;
    recordAttempt(null);
    return;
  }
  handled = true;
  recordAttempt(Math.min(now - triggerAt, REACT_CAP_MS));
}

function onPadKey(ev: Event): void {
  const key = (ev as KeyboardEvent).key;
  if (key !== ' ' && key !== 'Enter') return;
  onPadInput(ev);
}

/** Hiding the tab voids the attempt instead of losing it. The browser throttles timers on a hidden
 *  tab, so a pause-and-resume would record the trigger's delayed paint as that player's reaction and
 *  hand them the round for a notification arriving. */
function handleVisibility(hidden: boolean): void {
  if (!hidden || !round) return;
  if (phase !== 'waiting' && phase !== 'triggered') return;
  clearTimers();
  generation += 1;
  phase = 'void';
  renderVoid(round.order[turn]);
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  stage.className = 'stage-screen';
  turn = 0;
  attempts = [];
  isShowdown = false;

  const roster = ctx.session.players ?? [];
  round = startRound(roster.length > 0 ? roster : ['คนที่ถือมือถือ']);

  watchReducedMotion();
  on(stage, 'pointerdown', onPadInput);
  on(stage, 'keydown', onPadKey);
  on(document, 'visibilitychange', () => handleVisibility(document.hidden));

  toHandoff();
}

function teardown(): void {
  generation += 1; // any pending callback from this attempt will know it is now stale
  phase = 'handoff';
  clearTimers();
  stopFx(); // the rAF chain and the sparks; the mql `change` listener goes with cleanup below
  cleanup.forEach((fn) => fn());
  cleanup = [];
  reducedMotionMql = null;
  round = null;
  turn = 0;
  attempts = [];
  isShowdown = false;
  padEl = null;
  padTokenEl = null;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'freeze-tap',
  names: { th: 'มือลั่น', en: 'Freeze Tap' },
  category: 'party',
  // Clamped from the mockup's 2-20: the party category's own copy claims 2-10 (categories.ts).
  players: [2, 10],
  // Party page — the setup panel carries the live-round bit for the leave-confirm (gh#121).
  startsRound: true,
  keywords: [
    'มือลั่น',
    'เกมวัดปฏิกิริยา',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'แตะให้ไวที่สุด แตะก่อนสัญญาณคือแพ้ทันที',
  seo: {
    title: 'มือลั่น — เกมวัดปฏิกิริยาส่งมือถือ เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนกันทีละคน รอสัญญาณจริงแล้วแตะให้ไวที่สุด แตะก่อนสัญญาณคือมือลั่นแพ้ทันที ใครช้าสุดในวงคนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อผู้เล่นทุกคน (2–10 คน) แล้วดูกฎสัญญาณของรอบนี้',
      'ส่งมือถือวนทีละคน กดพร้อมแล้วก่อนเริ่มตาของตัวเอง',
      'จะมีสัญญาณหลอกโผล่มาก่อน แตะก่อนสัญญาณจริง = มือลั่น แพ้ทันที',
      'ครบทุกคนแล้วดูผล ใครช้าสุดคนนั้นโดน เท่ากันให้ดวลตัดสินอีกรอบ',
    ],
  },
  og: 'freeze-tap.png',
  // gh#82 — the how-to-play prose below the stage is ad inventory, per issue #13's amendment 8:
  // the decision was no slot on the PLAY SCREEN, never no slot on the page.
  ads: true,

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
