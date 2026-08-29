// Power Meter — the phone passes around the group. On your turn a vertical gauge climbs from 0.00
// toward 10.00, accelerating; you tap once to freeze it and that value is your score. Three attempts
// each, summed out of 30.00, and the lowest total is the one who "โดน". A tie at the bottom sends
// only the tied players to a fresh 3-attempt round; everyone above the minimum is safe for good.
//
// A PORTED game: ADR-0033 exempts a port from the design-canvas requirement, so every tuning number
// here is the mockup's own and playtested there. Two are this port's — STOP_GUARD_MS and
// PERFECT_WINDOW_MS — and both carry their reasoning at the declaration.
// No checkpoint by design: the round lives in this closure and dies on refresh and on dispose().
// ADR-0010 keeps siamsi as the sole checkpoint writer, so a refresh restarts from the setup panel.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { unlockAudio } from '../shell/audio.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

// ---- Meter engine: pure and calculable, testable with no DOM (see power-meter.test.mjs) ----
// Do NOT re-tune. The mockup's own engine comment claims the top of the climb is "hyper fast" and it
// is not: EASE_UP_POW = 2 gives a 1.37x slope ramp across the whole climb. The fall has a soft
// shoulder for the same reason (EASE_DOWN_POW > 1 makes the reversal rate exactly 0, so a two-frame
// overshoot costs about 0.15). The curve is the playtested artifact; the comments about it were not.
export const DURATION_UP_MS = 1460;
export const DURATION_DOWN_MS = 560;
export const EASE_UP_POW = 2.0;
export const EASE_DOWN_POW = 1.25;
export const MAX_HUNDREDTHS = 1000; // one attempt's ceiling: 10.00
export const ATTEMPTS_PER_PLAYER = 3; // round ceiling 3000 = 30.00

/** Start and stop are the same physical surface, so the second contact of a double-tap would stop
 *  the meter a few frames in and score ~0.00 for a tap nobody made. ARM_DELAY_MS cannot be used
 *  here — 400 of a 1460 ms climb held inert is an unplayable game — so the guard applies to the STOP
 *  action only, and 250 is the repo's existing coarse-cadence constant, not a new number. Its cost
 *  is exact and identical for everyone: the floor rises from 0.00 to LOCK_FLOOR_HUNDREDTHS of 3000. */
export const STOP_GUARD_MS = 250;
/** Derived: round((STOP_GUARD_MS / PLATEAU_START_MS) ** EASE_UP_POW * MAX_HUNDREDTHS). Named because
 *  the uncapped tiebreak rests on it being > 0 — a no-tap attempt is exactly 0, so one tap by any
 *  tied player breaks an all-zero tie, and a cap would need a rule nobody has decided.
 *  29 until the peak was flattened: the climb now spans PLATEAU_START_MS, not DURATION_UP_MS, so the
 *  same 250 ms is a slightly later fraction of it. Re-derived, not bumped — the test asserts this
 *  equals meterValueAt(STOP_GUARD_MS), so a stale value here goes red rather than silently drifting. */
export const LOCK_FLOOR_HUNDREDTHS = 31;

export const PEAK_GLOW_MIN = 980;
export const SCORE_PERFECT = 1000, SCORE_HIGH_MIN = 900, SCORE_GOOD_MIN = 700, SCORE_MID_MIN = 400;
// The audio tiers are DIFFERENT cut points from the visual tiers above. That is what the mockup
// does: the sound marks "near the top" at 800 where the copy marks "excellent" at 900.
const AUDIO_PERFECT = 1000, AUDIO_HIGH_MIN = 800, AUDIO_MID_MIN = 500;
const MIN_PLAYERS = 2;


/** The shipped window, centred on DURATION_UP_MS: the meter HOLDS MAX_HUNDREDTHS across it. 60 ms is
 *  3.6 frames at 60 Hz and 7.2 at 120 Hz, so three or more sampled frames always land inside it and
 *  the perfect score becomes something to aim at rather than be handed. Hit probability, so a later
 *  reader can retune: a blind tap hits it 60/2050 = 2.9% of attempts, up from 0.08%.
 *  THE WINDOW IS IN THE CURVE, NOT BESIDE IT. An earlier version widened the score with a second
 *  function that overrode meterValueAt after the fact, so the bar painted 9.59 while 10.00 was
 *  recorded — up to 0.41 of visible disagreement, and worse under reduce where the static target band
 *  is the only target channel. There is now exactly ONE scoring function: the climb is compressed into
 *  PLATEAU_START_MS, the meter sits at MAX across the window, and the fall starts at PLATEAU_END_MS.
 *  Paint and score agree by construction and there is nothing to keep in sync. The cost is exact and
 *  recorded: the cycle is 2050 ms rather than 2020, and the climb runs 2% faster. */
export const PERFECT_WINDOW_MS = 60;

/** The flat top, derived so the window stays centred on DURATION_UP_MS. Sampling at 0.05 ms shows the
 *  largest adjacent step anywhere in the cycle is 1 hundredth, so compressing the climb introduces no
 *  cliff at either edge — the plateau is a flattening, not a splice. */
export const PLATEAU_START_MS = DURATION_UP_MS - PERFECT_WINDOW_MS / 2;
export const PLATEAU_END_MS = DURATION_UP_MS + PERFECT_WINDOW_MS / 2;

/** The instant the gauge is back to exactly 0, and the ONLY expression of the cycle's end. The
 *  auto-lock used to spell it `elapsed - DURATION_UP_MS >= DURATION_DOWN_MS`, which was the end only
 *  while the peak was a single point. Flattening moved the end 30 ms later, and that literal kept
 *  firing 30 ms early — a no-tap attempt recorded 0.40 while its comment still said "at exactly 0".
 *  That is the same defect class as the old second scoring path: a copy of the curve's shape, stored
 *  somewhere the curve cannot reach. Derive the end here or the drift comes back. */
export const CYCLE_MS = PLATEAU_END_MS + DURATION_DOWN_MS;

/** The gauge's value at `elapsedMs`, integer hundredths — never a float score. THE ONE scoring
 *  function: what the bar paints and what a lock records are the same call, so they cannot disagree.
 *  Climbs to PLATEAU_START_MS, holds MAX_HUNDREDTHS to PLATEAU_END_MS, then falls; at
 *  PLATEAU_END_MS + DURATION_DOWN_MS it is exactly 0. */
export function meterValueAt(elapsedMs: number): number {
  if (elapsedMs <= PLATEAU_START_MS) {
    const progress = Math.min(1, Math.max(0, elapsedMs) / PLATEAU_START_MS);
    return Math.min(MAX_HUNDREDTHS, Math.round(progress ** EASE_UP_POW * MAX_HUNDREDTHS));
  }
  if (elapsedMs <= PLATEAU_END_MS) return MAX_HUNDREDTHS;
  const down = Math.min(1, (elapsedMs - PLATEAU_END_MS) / DURATION_DOWN_MS);
  return Math.max(0, Math.round((1 - down ** EASE_DOWN_POW) * MAX_HUNDREDTHS));
}

export function sumAttempts(hundredths: readonly number[]): number {
  return hundredths.reduce((a, b) => a + b, 0);
}

export function formatScore(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

export interface RoundVerdict {
  /** The one player at the bottom, as an index into `totals` — null when 2+ are tied there */
  loserIdx: number | null;
  /** The indices tied at the minimum, empty when the minimum is unique */
  tiedIdx: number[];
  minTotal: number;
}

/** Decides a round from its totals. Takes and returns INDICES, never names — duplicate names are
 *  legal, and a name-keyed map collapses two players into one entry. Everyone tied is a legal
 *  tiebreak, not a no-loser end state. */
export function evaluateRound(totals: readonly number[]): RoundVerdict {
  if (totals.length === 0) {
    throw new Error('power-meter: ยังไม่มีคะแนนให้ตัดสิน — ต้องมีผู้เล่นอย่างน้อย 1 คนในรอบนี้');
  }
  const minTotal = Math.min(...totals);
  const tied: number[] = [];
  for (let i = 0; i < totals.length; i++) if (totals[i] === minTotal) tied.push(i);
  return tied.length === 1
    ? { loserIdx: tied[0], tiedIdx: [], minTotal }
    : { loserIdx: null, tiedIdx: tied, minTotal };
}

/** The five tier lines. The mockup initialises this to a sixth value that all five branches then
 *  overwrite — a dead initialiser, deliberately not ported. */
export function scoreComment(hundredths: number): string {
  if (hundredths >= SCORE_PERFECT) return '🌟 PERFECT 10.00 เต็มหลอด!';
  if (hundredths >= SCORE_HIGH_MIN) return '🔥 พลังสูงมาก สุดยอด!';
  if (hundredths >= SCORE_GOOD_MIN) return '👍 ยอดเยี่ยม!';
  if (hundredths >= SCORE_MID_MIN) return '⚡ ปานกลาง';
  return '💥 วืดไปนิด สู้ต่อ!';
}

// ---- Effects: every number below is the mockup's own ----
const TRAUMA_PERFECT = 0.9, TRAUMA_HIGH = 0.5, TRAUMA_LOW = 0.6, TRAUMA_DEFAULT = 0.3;
const TRAUMA_LOSER = 0.8;
const TRAUMA_LOW_MAX = 200; // the mockup's "<= 200" branch: a bad score shakes too
const TRAUMA_DECAY_PER_S = 2.5, SHAKE_MAX_PX = 16, FRAME_DT_CAP_S = 0.05;
const SPARK_COUNT_PERFECT = 40, SPARK_COUNT_HIGH = 25;
const SPARK_SPEED_MIN = 1.5, SPARK_SPEED_SPREAD = 4.5;
const SPARK_DECAY_MIN = 0.02, SPARK_DECAY_SPREAD = 0.03;
const SPARK_SIZE_MIN = 3, SPARK_SIZE_SPREAD = 4;
const SPARK_GRAVITY = 0.08;
/** The mockup's spark decay and gravity are per FRAME; scaling by dt against this keeps the burst
 *  frame-rate independent up to FRAME_DT_CAP_S. */
const FX_REFERENCE_FPS = 60;
const VIBRATE_MS = 35, VIBRATE_STRONG_MS = [40, 30, 80], VIBRATE_STRONG_MIN_TRAUMA = 0.7;
// Sustained hum: a sawtooth through a lowpass, on the mockup's own frequency curve.
const HUM_BASE_HZ = 180, HUM_CLIMB_HZ = 670, HUM_CLIMB_POW = 2.2;
const HUM_FALL_HZ = 750, HUM_FALL_MIN_HZ = 120, HUM_FILTER_HZ = 1200, HUM_GAIN = 0.06;
const AUDIO_KEY = 'watduang:power-meter-audio';

type Spark = { x: number; y: number; vx: number; vy: number; size: number; life: number; decay: number };

// ---- Current round state (one game per page) ----

type Phase =
  | 'need-more'
  | 'handoff'
  | 'ready'
  | 'running'
  | 'locked'
  | 'player-total'
  | 'summary'
  | 'tiebreak'
  | 'result';

// Two scopes, not one. Everything registered while building a screen dies with that screen; only
// listeners on targets that OUTLIVE the screen (document, the media query list) may survive it.
// A single array meant ~4 closures plus a detached screen accumulated per render — about 40 over a
// 10-player game, which pick-loser's 2 renders never exposed. Draining ALL of it per render is the
// other obvious fix and it is wrong: it would tear off the visibility and reduced-motion listeners
// the mount depends on.
let screenCleanup: Array<() => void> = [];
let mountCleanup: Array<() => void> = [];
let phase: Phase = 'handoff';
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let players: string[] = [];
/** Indices into `players` still in play. Safe players are dropped here and never return. */
let activeIdx: number[] = [];
let seat = 0; // position within activeIdx whose turn it is
let roundTotals: number[] = []; // parallel to activeIdx
let attempts: number[] = [];
let attempt = 1, roundNo = 1, lockedValue = 0, loserPlayerIdx = -1, finalTotal = 0;
let isTiebreak = false;
let notice = '';
let startedAt = 0, rafId = 0;
/** Invalidates any in-flight frame. rAF is paused while the tab is hidden, so a resumed loop would
 *  compute an elapsed past the whole cycle and auto-lock 0.00 — a player punished for taking a phone
 *  call. This token is what makes the reset-on-hide actually stick. */
let runToken = 0;
// Live nodes the loop and the effect layer mutate, held so no frame ever re-queries the tree.
let gaugeFillEl: HTMLElement | null = null;
let gaugeTrackEl: HTMLElement | null = null;
let tapBtn: HTMLButtonElement | null = null;
let tapHintEl: HTMLElement | null = null;
let shakeEl: HTMLElement | null = null;
let sparkHost: HTMLElement | null = null;
let audioOn = false;
let audioCtx: AudioContext | null = null;
let hum: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
let sparks: Spark[] = [];
let trauma = 0, fxRaf = 0, fxLastFrame = 0, fxW = 0, fxH = 0;
let fxCtx: CanvasRenderingContext2D | null = null;
let fxInk = '';
let prefersReducedMotion = false;
let reducedMotionMql: MediaQueryList | null = null;

const clock = (): number => performance.now();

function on(
  target: EventTarget,
  type: string,
  handler: EventListener,
  scope: 'screen' | 'mount' = 'screen',
): void {
  target.addEventListener(type, handler);
  const off = (): void => target.removeEventListener(type, handler);
  (scope === 'mount' ? mountCleanup : screenCleanup).push(off);
}

/** el() plus the class and the append that always follow it. Eight screens are built out of this;
 *  buttons stay spelled out inline, because scripts/arm-gate-coverage-check.mjs reads each render
 *  function for a literal el('button' and a helper would hide every button from it. */
function add<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = el(tag, text);
  if (cls) node.className = cls;
  parent.appendChild(node);
  return node;
}

/** The five lines that always follow el('button', ...). The el('button' call itself stays at every
 *  render site on purpose — that literal is what arm-gate-coverage-check.mjs reads to decide the
 *  function has a control to gate, and a helper that created the button would hide all twelve. */
function wire(
  stage: HTMLElement,
  btn: HTMLButtonElement,
  id: string,
  cls: string,
  handler: () => void,
): HTMLButtonElement {
  btn.id = id;
  btn.type = 'button';
  btn.className = `game-btn ${cls}`;
  on(btn, 'click', handler);
  stage.appendChild(btn);
  return btn;
}

// ---- Reduced motion ----
// ADR-0046: reduce, never remove. This game MEASURES performance, so the mechanic is untouched — the
// gauge fill updates once per animation frame at full fidelity with DURATION_UP_MS and
// DURATION_DOWN_MS unchanged in both modes. Coarsening it to the 250 ms cadence timebomb uses for
// its decorative fuse would leave a reduced-motion player aiming at a bar up to 3.4 points stale,
// which is a harder game than everyone else in the same group is playing.
// Removed under reduce: the screen shake, the spark burst and the PEAK_GLOW_MIN class toggle — three
// real behaviour changes, none of which carries information. The non-motion channel that replaces
// them: the static target band on the track and the 10.00 tick in the alarm colour, both painted
// before the attempt starts, plus the locked score, which is text and an aria-live announcement and
// is byte-identical in both modes. Same target, same timing, same result — just no shaking.
function onReducedMotionChange(ev: Event): void {
  prefersReducedMotion = (ev as MediaQueryListEvent).matches;
  if (!prefersReducedMotion) return;
  if (shakeEl) shakeEl.style.transform = 'none'; // a flip mid-decay must settle the box
  sparks = [];
  trauma = 0;
}

function watchReducedMotion(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  reducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion = reducedMotionMql.matches;
  if (typeof reducedMotionMql.addEventListener === 'function') {
    on(reducedMotionMql, 'change', onReducedMotionChange, 'mount');
  }
}

// ---- Audio ----
// Default MUTED, and the AudioContext is created lazily inside a click handler — never at mount and
// never from a frame — so nothing can play unprompted on a phone being passed around a group. The
// preference persists in localStorage (allowed in a game module; what is forbidden is
// session.saveCheckpoint), and every access is wrapped because Safari private mode and a full quota
// both throw.
function readAudioPref(): boolean {
  try {
    return localStorage.getItem(AUDIO_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeAudioPref(value: boolean): void {
  try {
    localStorage.setItem(AUDIO_KEY, value ? 'on' : 'off');
  } catch {
    /* private mode or a full quota — the preference is a nicety, never a blocker */
  }
}

function ensureAudio(): AudioContext | null {
  if (!audioOn) return null;
  if (!audioCtx) audioCtx = unlockAudio();
  return audioCtx;
}

/** One scheduled note sequence. The lock fanfare, the tiebreak alert, the defeat run and the UI
 *  click are all this call with a different table, so four routines collapse into one. */
function notes(freqs: readonly number[], stepS: number, durS: number, type: OscillatorType): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain).connect(ctx.destination);
    const at = ctx.currentTime + i * stepS;
    gain.gain.setValueAtTime(0.18, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + durS);
    osc.start(at);
    osc.stop(at + durS);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
}

const uiClick = (): void => notes([660], 0, 0.05, 'square');
const tiebreakAlert = (): void => notes([392, 466, 587], 0.11, 0.2, 'sawtooth');
const defeatRun = (): void => notes([440, 370, 311, 233], 0.16, 0.3, 'sawtooth');

function playLockScore(value: number): void {
  if (value >= AUDIO_PERFECT) notes([523, 659, 784, 1047, 1319], 0.09, 0.18, 'square');
  else if (value >= AUDIO_HIGH_MIN) notes([523, 659, 784], 0.08, 0.16, 'square');
  else if (value >= AUDIO_MID_MIN) notes([440, 330], 0.1, 0.2, 'triangle');
  else notes([150], 0, 0.25, 'square');
}

function startHum(): void {
  const ctx = ensureAudio();
  if (!ctx || hum) return;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  filter.type = 'lowpass';
  filter.frequency.value = HUM_FILTER_HZ;
  gain.gain.value = HUM_GAIN;
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start();
  hum = { osc, filter, gain };
}

function updateHum(elapsedMs: number): void {
  if (!hum) return;
  if (elapsedMs <= DURATION_UP_MS) {
    const progress = Math.min(1, Math.max(0, elapsedMs) / DURATION_UP_MS);
    hum.osc.frequency.value = HUM_BASE_HZ + progress ** HUM_CLIMB_POW * HUM_CLIMB_HZ;
    return;
  }
  const remaining = Math.max(0, 1 - (elapsedMs - DURATION_UP_MS) / DURATION_DOWN_MS);
  hum.osc.frequency.value = Math.max(HUM_FALL_MIN_HZ, HUM_FALL_HZ * remaining);
}

/** Called from the lock path, from the hide path and from teardown. An oscillator left running past
 *  dispose() is audible on the NEXT page, which is the worst failure mode in this file. */
function stopHum(): void {
  const live = hum;
  hum = null;
  if (!live) return;
  try {
    live.osc.stop();
  } catch {
    /* stopping twice throws in some engines */
  }
  live.osc.disconnect();
  live.filter.disconnect();
  live.gain.disconnect();
}

// ---- Screen shake and the spark burst ----

function traumaFor(value: number): number {
  if (value >= SCORE_PERFECT) return TRAUMA_PERFECT;
  if (value >= AUDIO_HIGH_MIN) return TRAUMA_HIGH;
  if (value <= TRAUMA_LOW_MAX) return TRAUMA_LOW;
  return TRAUMA_DEFAULT;
}

const sparkCountFor = (value: number): number =>
  value >= SCORE_PERFECT ? SPARK_COUNT_PERFECT : value >= AUDIO_HIGH_MIN ? SPARK_COUNT_HIGH : 0;

/** ADR-0047: a canvas audit is element-scoped, so the canvas is a child of a pm- element and is
 *  sized from that element's own box, never from the stage. No laid-out box (the unit tests' fake
 *  DOM, a node not yet in the document) means no burst: the burst is decoration, never signal. */
function attachSparkCanvas(): void {
  const host = sparkHost;
  if (fxCtx || !host) return;
  const w = host.clientWidth ?? 0;
  const h = host.clientHeight ?? 0;
  if (!w || !h) return;
  const canvas = el('canvas');
  canvas.className = 'pm-fx';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx2d) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx2d.scale(dpr, dpr);
  // The spark colour is read off the host by TOKEN NAME. The mockup's gold and cyan are hex values
  // this site does not own, and no hex literal from it belongs anywhere in this module.
  fxInk =
    typeof getComputedStyle === 'function'
      ? getComputedStyle(host).getPropertyValue('--color-line-strong').trim()
      : '';
  if (!fxInk) return;
  host.appendChild(canvas);
  fxCtx = ctx2d;
  fxW = w;
  fxH = h;
}

function scheduleFx(): void {
  if (fxRaf || typeof requestAnimationFrame !== 'function') return;
  fxRaf = requestAnimationFrame(fxFrame);
}

function fxFrame(now: number): void {
  fxRaf = 0;
  if (prefersReducedMotion) return;
  const dt = Math.min((now - fxLastFrame) / 1000, FRAME_DT_CAP_S);
  fxLastFrame = now;
  trauma = Math.max(0, trauma - dt * TRAUMA_DECAY_PER_S);
  const target = shakeEl;
  if (target) {
    // Scoped to a pm- element on purpose: the mockup shakes its whole app container, which here
    // would shake the page chrome and the ad slot below the stage.
    const magnitude = trauma * trauma;
    const dx = (Math.random() - 0.5) * SHAKE_MAX_PX * magnitude;
    const dy = (Math.random() - 0.5) * SHAKE_MAX_PX * magnitude;
    target.style.transform = trauma > 0 ? `translate(${dx}px, ${dy}px)` : 'none';
  }
  const ctx2d = fxCtx;
  if (ctx2d) {
    const step = dt * FX_REFERENCE_FPS;
    ctx2d.clearRect(0, 0, fxW, fxH);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= p.decay * step;
      if (p.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      p.vy += SPARK_GRAVITY * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      ctx2d.globalAlpha = Math.max(0, p.life);
      ctx2d.fillStyle = fxInk;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
      ctx2d.fill();
    }
  } else {
    sparks = [];
  }
  if (trauma > 0 || sparks.length > 0) scheduleFx();
}

/** The whole feel layer for one transition, fired FROM the transition and never from a render — the
 *  mockup replays its sound and its shake on every re-render of the same screen. */
function fireFx(amount: number, count: number, rand: () => number = Math.random): void {
  navigator.vibrate?.(amount >= VIBRATE_STRONG_MIN_TRAUMA ? VIBRATE_STRONG_MS : VIBRATE_MS);
  if (prefersReducedMotion) return;
  trauma = Math.min(1, trauma + amount);
  if (count > 0) attachSparkCanvas();
  if (count > 0 && fxCtx) {
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const speed = SPARK_SPEED_MIN + rand() * SPARK_SPEED_SPREAD;
      const size = SPARK_SIZE_MIN + rand() * SPARK_SIZE_SPREAD;
      const decay = SPARK_DECAY_MIN + rand() * SPARK_DECAY_SPREAD;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      sparks.push({ x: fxW / 2, y: fxH / 2, vx, vy, size, life: 1, decay });
    }
  }
  fxLastFrame = clock();
  scheduleFx();
}

function stopFx(): void {
  if (fxRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(fxRaf);
  fxRaf = 0;
  sparks = [];
  trauma = 0;
  fxCtx = null;
  fxInk = '';
  fxW = 0;
  fxH = 0;
}


// ---- Screens ----
// Every selector carries the `pm-` prefix and is styled from src/styles/games/power-meter.css. The
// shared controls reuse the .stage-screen / .game-btn / .game-btn-primary / .game-btn-secondary
// shell vocabulary, which this module never redeclares. Render functions are PURE DOM: no sound, no
// shake, no vibration, no storage write.

// The loser motif, drawn in the house pattern (compare pick-loser's burst star): a power gauge whose
// bar has sunk to the bottom, with a chevron pointing down at it. Not the mockup's emoji — an emoji
// renders in the platform's palette, not this site's — and neither a drinking nor a money motif.
const EMPTY_GAUGE_SVG =
  '<svg width="104" height="150" viewBox="0 0 104 150" fill="none" aria-hidden="true">' +
  '<rect x="26" y="6" width="52" height="112" rx="26" fill="var(--color-ground-warm)" ' +
  'stroke="var(--color-line-strong)" stroke-width="3"></rect>' +
  '<rect x="34" y="86" width="36" height="24" rx="12" fill="var(--color-line-strong)"></rect>' +
  '<path d="M14 62h-8M98 62h-8M14 34h-8M98 34h-8" stroke="var(--color-line-strong)" ' +
  'stroke-width="3" stroke-linecap="round"></path>' +
  '<path d="M34 128l18 16 18-16" stroke="var(--color-line-strong)" stroke-width="3" ' +
  'stroke-linecap="round" stroke-linejoin="round"></path></svg>';

const roundLabel = (): string => (isTiebreak ? `รอบ Tiebreak ที่ ${roundNo}` : `รอบที่ ${roundNo}`);
const currentName = (): string => players[activeIdx[seat]] ?? '';
const nextName = (): string => players[activeIdx[seat + 1]] ?? '';
const HINT_ARM = 'ปุ่มรองจะกดได้หลังผลออก 0.4 วินาที กันนิ้วลั่น';

function paintKicker(stage: HTMLElement): void {
  add(stage, 'span', 'pm-round-kicker', roundLabel());
  if (isTiebreak) add(stage, 'span', 'pm-tiebreak-badge', '⚡ รอบ Tiebreak');
}

/** The attempt-reset notice and the screen-reader announcement, both in flow inside the stage. Never
 *  a fixed overlay: a floating layer over the stage is a tap surface neither the arm gate nor the
 *  no-nav probe accounts for. No auto-hide either — it stays until the next render replaces it. */
function paintLive(stage: HTMLElement, announcement: string): void {
  if (notice) add(stage, 'p', 'pm-notice', notice).setAttribute('aria-live', 'polite');
  add(stage, 'p', 'pm-live', announcement).setAttribute('aria-live', 'polite');
}

function paintDots(stage: HTMLElement): void {
  const row = add(stage, 'div', 'pm-attempt-dots');
  for (let i = 1; i <= ATTEMPTS_PER_PLAYER; i++) {
    const state = i < attempt ? 'done' : i === attempt ? 'active' : 'todo';
    add(row, 'span', `pm-dot pm-dot--${state}`).setAttribute('aria-label', `ครั้งที่ ${i}`);
  }
}

function paintGauge(stage: HTMLElement): void {
  const wrap = add(stage, 'div', 'pm-gauge-wrapper');
  const ticks = add(wrap, 'div', 'pm-ticks');
  add(ticks, 'span', 'pm-tick pm-tick--peak', '10.00 (PEAK)');
  add(ticks, 'span', 'pm-tick', '5.00');
  add(ticks, 'span', 'pm-tick', '0.00');
  const track = add(wrap, 'div', 'pm-gauge-track');
  // The static band marks SCORE_HIGH_MIN..MAX_HUNDREDTHS. It is what makes the target legible under
  // reduced motion and to anyone who cannot read a colour ramp: painted before the attempt, never moves.
  add(track, 'div', 'pm-target-band').setAttribute('aria-hidden', 'true');
  gaugeFillEl = add(track, 'div', 'pm-gauge-fill');
  gaugeFillEl.style.height = '0%';
  gaugeTrackEl = track;
}

/** Every screen starts here: the live nodes of the screen being replaced must not outlive it. It
 *  deliberately does NOT call stage.replaceChildren() — that line is spelled out in each render
 *  function instead, because arm-gate-coverage-check.mjs uses it to decide a function renders a
 *  screen at all. Hiding it here left every render function unchecked while the gate printed clean
 *  (measured: removing renderResult's armAllButtons kept the gate at exit 0). */
function beginScreen(): HTMLElement | null {
  const stage = stageEl;
  if (!stage) return null;
  // The outgoing screen's nodes are about to be detached by the caller's replaceChildren(). Release
  // what pointed at them FIRST, or the pointers outlive the nodes: stopFx() drops fxCtx, which
  // otherwise keeps a detached canvas alive and makes attachSparkCanvas() bail on every later lock —
  // the burst then paints once per mount and draws into nothing after that.
  screenCleanup.forEach((fn) => fn());
  screenCleanup = [];
  stopFx();
  stage.className = 'stage-screen';
  gaugeFillEl = null;
  gaugeTrackEl = null;
  tapBtn = null;
  tapHintEl = null;
  shakeEl = null;
  sparkHost = null;
  return stage;
}

function renderNeedMore(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  add(stage, 'p', '', 'เกมนี้ต้องมีคนในวงอย่างน้อย 2 คน');
  add(stage, 'p', '', 'กลับไปใส่ชื่อเพิ่มอีกคนก่อน แล้วเริ่มรอบใหม่ได้เลย');

  wire(stage, el('button', 'เปลี่ยนคนเล่น'), 'pm-change', 'game-btn-secondary', changePlayers);
  paintLive(stage, 'วงยังไม่ครบ ต้องมีอย่างน้อย 2 คน');
  screenCleanup.push(armAllButtons(stage));
}

function renderHandoff(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  paintKicker(stage);
  const holder = add(stage, 'div', 'pm-holder');
  add(holder, 'span', 'pm-holder-kicker', 'คนที่ถือมือถือ');
  add(holder, 'span', 'pm-holder-name', `ตาของ ${currentName()}`);
  // No previous player's scores here: the phone is in transit and the next player must not read
  // what they are chasing.
  add(stage, 'p', 'pm-score-comment', 'คุณจะได้รับโอกาสวัดพลัง 3 ครั้ง เพื่อสะสมคะแนนเต็ม 30.00');

  wire(stage, el('button', 'แตะเพื่อเริ่มตาของฉัน ➔'), 'pm-start', 'game-btn-primary', beginTurn);
  const sound = el('button', audioOn ? 'เปิดเสียงแล้ว' : 'ปิดเสียงแล้ว');
  sound.setAttribute('aria-label', 'เปิด/ปิดเสียง');
  wire(stage, sound, 'pm-sound', 'game-btn-secondary pm-sound', () => toggleAudio(sound));

  add(stage, 'span', 'pm-hint', HINT_ARM);
  paintLive(stage, `ส่งมือถือให้ ${currentName()}`);
  screenCleanup.push(armAllButtons(stage));
}

/** `ready` and `running` are ONE rendered screen whose button label and class swap in place, and
 *  that is load-bearing: a separate `running` render would call the arm gate again and hold the stop
 *  control inert for 400 of the 1460 ms climb, so every score would be unreachably low while every
 *  CI gate stayed green. The gate arms this button once, at `ready`, and the tap that starts the
 *  meter leaves the same already-armed button in place to stop it. */
function renderPlay(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  paintKicker(stage);
  paintDots(stage);
  paintGauge(stage);

  const tap = el('button', '🚀 แตะเพื่อเริ่ม');
  tap.setAttribute('aria-label', 'แตะเพื่อเริ่มปล่อยเกจ');
  tapBtn = wire(stage, tap, 'pm-tap', 'game-btn-primary pm-tap', onTap);

  tapHintEl = add(stage, 'p', 'pm-score-comment', 'แตะเพื่อปล่อยเกจวัดพลัง');
  paintLive(stage, `${currentName()} ครั้งที่ ${attempt}`);
  screenCleanup.push(armAllButtons(stage));
}

function renderLocked(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  paintKicker(stage);
  const box = add(stage, 'div', 'pm-score-box');
  add(box, 'span', 'pm-round-kicker', `ผลครั้งที่ ${attempt}`);
  // The number is always var(--color-line-strong): the tier is carried by the comment line below,
  // never by the number's colour, because the mockup's gold and amber cannot hold text.
  add(box, 'span', 'pm-score', formatScore(lockedValue));
  shakeEl = box;
  sparkHost = box;
  add(stage, 'p', 'pm-score-comment', scoreComment(lockedValue));
  paintDots(stage);

  const last = attempt >= ATTEMPTS_PER_PLAYER;
  const nextLabel = last ? 'ดูผลคะแนนรวม ➔' : `ไปต่อครั้งที่ ${attempt + 1} ➔`;
  wire(stage, el('button', nextLabel), 'pm-next', 'game-btn-primary', afterLocked);

  paintLive(stage, `ผลครั้งที่ ${attempt}: ได้ ${formatScore(lockedValue)} คะแนน`);
  screenCleanup.push(armAllButtons(stage));
}

function renderPlayerTotal(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  paintKicker(stage);
  add(stage, 'span', 'pm-holder-name', 'สรุปผลคะแนน 3 ครั้งของคุณ');
  const grid = add(stage, 'div', 'pm-attempt-grid');
  for (let i = 0; i < ATTEMPTS_PER_PLAYER; i++) {
    const cell = add(grid, 'div', 'pm-attempt-cell');
    add(cell, 'span', 'pm-round-kicker', `ครั้งที่ ${i + 1}`);
    add(cell, 'span', 'pm-attempt-value', formatScore(attempts[i] ?? 0));
  }
  const total = add(stage, 'div', 'pm-total');
  add(total, 'span', 'pm-round-kicker', 'คะแนนรวม (เต็ม 30.00)');
  add(total, 'span', 'pm-score', formatScore(sumAttempts(attempts)));
  shakeEl = total;

  // House wording wins on the pass control: it NAMES the next player instead of hiding who is next.
  const isLast = seat + 1 >= activeIdx.length;
  const passLabel = isLast ? '📊 ดูผลสรุปของรอบนี้ ➔' : `ส่งต่อให้ ${nextName()}`;
  wire(stage, el('button', passLabel), 'pm-after-total', 'game-btn-primary', afterPlayerTotal);

  paintLive(stage, `${currentName()} ได้คะแนนรวม ${formatScore(sumAttempts(attempts))} จาก 30.00`);
  screenCleanup.push(armAllButtons(stage));
}

function renderSummary(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  paintKicker(stage);
  const verdict = evaluateRound(roundTotals);
  add(stage, 'span', 'pm-holder-name', '📊 สรุปคะแนน');

  for (let i = 0; i < activeIdx.length; i++) {
    const lowest = roundTotals[i] === verdict.minTotal;
    const row = add(stage, 'div', `pm-row${lowest ? ' pm-row--lowest' : ' pm-row--safe'}`);
    add(row, 'span', 'pm-row-name', players[activeIdx[i]]);
    add(row, 'span', 'pm-row-total', formatScore(roundTotals[i]));
    const badge = lowest ? (verdict.loserIdx === null ? '⚡ เข้า Tiebreak' : '💀 โดน') : '🛡️ รอด';
    add(row, 'span', `pm-badge pm-badge--${lowest ? 'danger' : 'safe'}`, badge);
  }

  const tie = verdict.loserIdx === null;
  const line = tie
    ? `⚡ คะแนนต่ำสุดเท่ากัน (${formatScore(verdict.minTotal)}) ${verdict.tiedIdx.length} คน!`
    : '🚨 ได้ตัวคนโดนแล้ว!';
  add(stage, 'p', 'pm-score-comment', line);

  const goLabel = tie ? 'เข้าสู่รอบ Tiebreak ตัดสิน ➔' : 'ดูประกาศคนโดน ➔';
  wire(stage, el('button', goLabel), 'pm-after-summary', 'game-btn-primary', afterSummary);

  paintLive(stage, 'หน้าสรุปคะแนนประจำรอบ');
  screenCleanup.push(armAllButtons(stage));
}

function renderTiebreak(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  const verdict = evaluateRound(roundTotals);
  add(stage, 'span', 'pm-holder-name', '⚡ รอบ Tiebreak ตัดสิน');
  add(stage, 'p', 'pm-score-comment', 'ศึกชิงหนีความพ่ายแพ้!');
  for (const i of verdict.tiedIdx) {
    const row = add(stage, 'div', 'pm-row pm-row--lowest');
    add(row, 'span', 'pm-row-name', players[activeIdx[i]]);
    add(row, 'span', 'pm-row-total', formatScore(roundTotals[i]));
  }
  const min = formatScore(verdict.minTotal);
  add(stage, 'p', 'pm-foot', `ผู้เล่นต่อไปนี้มีคะแนนรวมต่ำสุดเท่ากัน (${min}) จึงต้องแข่งขันใหม่คนละ 3 ครั้ง`);
  // Load-bearing rule copy: the "safe players never come back" rule is invisible without it.
  add(stage, 'p', 'pm-foot', '🛡️ ผู้เล่นคนอื่นที่คะแนนสูงกว่า ปลอดภัยแล้ว ไม่ต้องแข่งรอบนี้');

  wire(stage, el('button', 'เริ่มรอบ Tiebreak ➔'), 'pm-start-tiebreak', 'game-btn-primary', startTiebreak);

  paintLive(stage, 'รอบ Tiebreak ตัดสินผู้เล่นที่เสมอกัน');
  screenCleanup.push(armAllButtons(stage));
}

function renderResult(): void {
  const stage = beginScreen();
  if (!stage) return;
  stage.replaceChildren();
  const name = players[loserPlayerIdx] ?? '';
  const card = add(stage, 'div', 'pm-loser-card');
  add(card, 'span', 'pm-round-kicker', 'คนโดนประจำเกมนี้คือ');
  add(card, 'div', 'pm-loser-motif').innerHTML = EMPTY_GAUGE_SVG;
  add(card, 'span', 'pm-holder-name', name);
  add(card, 'span', 'pm-row-total', `คะแนนรอบสุดท้าย: ${formatScore(finalTotal)} / 30.00`);
  shakeEl = card;
  add(stage, 'p', 'pm-foot', 'วงตกลงกันเองว่าคนโดนต้องทำอะไร');

  wire(stage, el('button', 'เล่นอีกรอบ'), 'pm-again', 'game-btn-primary', replay);
  wire(stage, el('button', 'เปลี่ยนคนเล่น'), 'pm-change-result', 'game-btn-secondary', changePlayers);

  add(stage, 'span', 'pm-hint', HINT_ARM);
  // No outbound link here — #stage must hold no navigation target (a tap-transition would drop it
  // under the finger that just tapped). The crawlable one is static chrome in the game layout.
  paintLive(stage, `คนโดนคือ ${name}`);
  screenCleanup.push(armAllButtons(stage));
}

// ---- Round lifecycle ----

function toggleAudio(button: HTMLButtonElement): void {
  audioOn = !audioOn;
  writeAudioPref(audioOn);
  if (!audioOn) {
    stopHum();
    audioCtx?.close().catch(() => {});
    audioCtx = null;
  }
  button.textContent = audioOn ? 'เปิดเสียงแล้ว' : 'ปิดเสียงแล้ว';
  uiClick(); // this tap is the gesture that unlocks the context, so nothing ever plays unprompted
}

function changePlayers(): void {
  teardown();
  document.dispatchEvent(new CustomEvent('watduang:change-players', { bubbles: true }));
}

function replay(): void {
  const stageRef = stageEl;
  const ctxRef = gameCtx;
  teardown();
  if (stageRef && ctxRef) mountInto(stageRef, ctxRef);
}

function beginTurn(): void {
  if (phase !== 'handoff') return;
  uiClick();
  phase = 'ready';
  renderPlay();
}

function onTap(): void {
  if (phase === 'ready') startMeter();
  else if (phase === 'running') stopMeter();
}

function cancelFrame(): void {
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
  rafId = 0;
}

function startMeter(): void {
  const tap = tapBtn;
  if (phase !== 'ready' || !tap) return;
  notice = '';
  phase = 'running';
  startedAt = clock();
  const token = ++runToken;
  tap.textContent = '🛑 แตะเพื่อหยุด!';
  tap.setAttribute('aria-label', 'แตะเพื่อหยุดเกจ');
  tap.classList.add('pm-tap--running');
  if (tapHintEl) tapHintEl.textContent = 'หยุดที่จุดสูงสุด 10.00 ให้ได้!';
  startHum();

  const step = (): void => {
    rafId = 0;
    if (phase !== 'running' || token !== runToken) return;
    const elapsed = clock() - startedAt;
    if (elapsed >= CYCLE_MS) {
      lockAttempt(elapsed); // the gauge reached 0 on the way down: auto-lock at exactly 0
      return;
    }
    paintMeter(elapsed);
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function paintMeter(elapsedMs: number): void {
  const value = meterValueAt(elapsedMs);
  // The fill's HEIGHT is the score, so it is written every frame in both motion modes.
  if (gaugeFillEl) gaugeFillEl.style.height = `${value / 10}%`;
  updateHum(elapsedMs);
  if (!prefersReducedMotion && gaugeTrackEl) {
    gaugeTrackEl.classList.toggle('pm-gauge-peak', value >= PEAK_GLOW_MIN);
  }
}

function stopMeter(): void {
  if (phase !== 'running') return;
  const elapsed = clock() - startedAt;
  if (elapsed < STOP_GUARD_MS) return; // the ghost second contact of the tap that started the meter
  lockAttempt(elapsed);
}

function lockAttempt(elapsedMs: number): void {
  if (phase !== 'running') return;
  cancelFrame();
  stopHum();
  runToken += 1;
  lockedValue = meterValueAt(elapsedMs);
  attempts[attempt - 1] = lockedValue;
  phase = 'locked';
  renderLocked();
  playLockScore(lockedValue);
  fireFx(traumaFor(lockedValue), sparkCountFor(lockedValue));
}

function afterLocked(): void {
  if (phase !== 'locked') return;
  uiClick();
  if (attempt < ATTEMPTS_PER_PLAYER) {
    attempt += 1;
    phase = 'ready';
    renderPlay();
    return;
  }
  roundTotals[seat] = sumAttempts(attempts);
  phase = 'player-total';
  renderPlayerTotal();
}

function afterPlayerTotal(): void {
  if (phase !== 'player-total') return;
  uiClick();
  if (seat + 1 < activeIdx.length) {
    seat += 1;
    attempt = 1;
    attempts = new Array(ATTEMPTS_PER_PLAYER).fill(0);
    phase = 'handoff';
    renderHandoff();
    return;
  }
  phase = 'summary';
  renderSummary();
}

function afterSummary(): void {
  if (phase !== 'summary') return;
  const verdict = evaluateRound(roundTotals);
  if (verdict.loserIdx === null) {
    phase = 'tiebreak';
    renderTiebreak();
    tiebreakAlert();
    return;
  }
  loserPlayerIdx = activeIdx[verdict.loserIdx];
  finalTotal = roundTotals[verdict.loserIdx];
  phase = 'result';
  gameCtx?.session.markPlayed('power-meter');
  renderResult();
  defeatRun();
  fireFx(TRAUMA_LOSER, 0);
}

/** A fresh round among the tied only. Scores are zeroed, never accumulated: tied players carry equal
 *  history, so accumulating would add the same constant to each — the loser identity would be right
 *  and every displayed total wrong. Uncapped on purpose (see LOCK_FLOOR_HUNDREDTHS). */
function startTiebreak(): void {
  if (phase !== 'tiebreak') return;
  uiClick();
  activeIdx = evaluateRound(roundTotals).tiedIdx.map((i) => activeIdx[i]);
  roundTotals = new Array(activeIdx.length).fill(0);
  attempts = new Array(ATTEMPTS_PER_PLAYER).fill(0);
  seat = 0;
  attempt = 1;
  roundNo += 1;
  isTiebreak = true;
  phase = 'handoff';
  renderHandoff();
}

/** The tab-switch guard. onVisibility, never a window 'blur' listener: this page carries an AdSense
 *  slot below the stage, and an ad iframe taking focus fires blur on the parent window — a live
 *  attempt would be thrown away because an ad loaded. The attempt is replayed at the SAME attempt
 *  number and nothing is recorded. */
function handleVisibility(hidden: boolean): void {
  if (!hidden || phase !== 'running') return;
  runToken += 1; // any frame still in flight is now stale and returns without locking
  cancelFrame();
  stopHum();
  phase = 'ready';
  notice = '⚠️ สลับหน้าจอ: รีเซ็ตครั้งนี้ใหม่เพื่อความยุติธรรม ครั้งนี้ยังไม่ถูกบันทึกคะแนน';
  renderPlay();
}

/** Everything a game owns, back to its start value. Shared by mount and teardown so the two cannot
 *  drift: a field zeroed in one and not the other is how a remount inherits the last round. */
function zeroRound(): void {
  activeIdx = players.map((_, i) => i);
  roundTotals = new Array(activeIdx.length).fill(0);
  attempts = new Array(ATTEMPTS_PER_PLAYER).fill(0);
  seat = 0;
  attempt = 1;
  roundNo = 1;
  isTiebreak = false;
  lockedValue = 0;
  loserPlayerIdx = -1;
  finalTotal = 0;
  notice = '';
  startedAt = 0;
}


function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  stage.className = 'stage-screen';
  audioOn = readAudioPref();
  watchReducedMotion();
  on(document, 'visibilitychange', () => handleVisibility(document.hidden), 'mount');
  // The shell owns names; this module reads the roster once and never asks again. A solo mount would
  // name the only player the loser, which is nonsense — hence need-more, whose only exit is the shell.
  players = (ctx.session.players ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
  if (players.length < MIN_PLAYERS) {
    phase = 'need-more';
    renderNeedMore();
    return;
  }
  zeroRound();
  phase = 'handoff';
  renderHandoff();
}

function teardown(): void {
  runToken += 1;
  phase = 'handoff';
  cancelFrame();
  stopFx();
  stopHum();
  screenCleanup.forEach((fn) => fn());
  screenCleanup = [];
  mountCleanup.forEach((fn) => fn());
  mountCleanup = [];
  reducedMotionMql = null;
  audioCtx?.close().catch(() => {}); // closing the context kills every oscillator and gain it made
  audioCtx = null;
  gaugeFillEl = null;
  gaugeTrackEl = null;
  tapBtn = null;
  tapHintEl = null;
  shakeEl = null;
  sparkHost = null;
  players = [];
  zeroRound();
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'power-meter',
  names: { th: 'วัดพลัง', en: 'Power Meter' },
  category: 'party',
  players: [2, 10],
  // Party page — the setup panel carries the live-round bit for the leave-confirm.
  startsRound: true,
  keywords: ['วัดพลัง', 'เกมส่งมือถือ', 'เกมปาร์ตี้', 'เกมกลุ่มเล่นฟรี', 'เกมเล่นบนเครื่องเดียว'],
  tagline: 'แตะหยุดเกจพลังคนละ 3 ครั้ง ใครคะแนนรวมน้อยที่สุดคนนั้นโดน',
  seo: {
    title: 'วัดพลัง — เกมส่งมือถือแตะหยุดเกจพลัง เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนทีละคน แตะปล่อยเกจพลังแล้วแตะหยุดให้ใกล้ 10.00 ที่สุด คนละ 3 ครั้ง รวมเต็ม 30.00 ใครคะแนนรวมน้อยที่สุดคนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อผู้เล่นทุกคน (2–10 คน) แล้วส่งมือถือวนทีละคน',
      'แตะปล่อยเกจแล้วแตะหยุด ยิ่งใกล้ 10.00 ยิ่งได้คะแนนสูง เลย 10.00 เกจจะร่วงลงมาอย่างรวดเร็ว',
      'คนละ 3 ครั้ง รวมเต็ม 30.00 ใครคะแนนรวมน้อยที่สุดคนนั้นโดน เสมอกันแข่งใหม่เฉพาะคนที่เสมอกัน',
    ],
  },
  og: 'power-meter.png',
  // The how-to-play prose below the stage is ad inventory: the decision was no slot on the PLAY
  // SCREEN, never no slot on the page.
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
