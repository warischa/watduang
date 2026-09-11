// "เสี่ยงเซียมซี" — one person, one draw, four screens: "ตั้งจิต", "เขย่า", "ไม้ติ้วตก", "ใบเซียมซี" (gh#97).
// ADR-0040 fixed this page at [1, 1]: the shell mounts it with an empty roster and a session that
// persists nothing, so every party path (turn order, holder, summary, checkpoint resume) is
// unreachable and is gone. Nothing here reads the roster and nothing here asks who is playing.
//
// The release is no longer one kick. A shake has to ACCUMULATE to SHAKE_TARGET before a "ติ้ว" comes
// out, and the button is a press-and-hold that feeds the same accumulator — one jolt and one tap
// both leave the meter short. That is the whole difference from the shipped version's single kick.
// The number gets its own screen before the "คำทำนาย" does, so it is read first.
//
// The .ts extension on the import path is required for `node --test` (Node does not guess extensions) — Vite/tsc both accept it
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons, ARM_DELAY_MS } from './_arm-gate.ts';
import { el } from './_el.ts';
import { announceRoundStarted } from './_round-start.ts';
import {
  INTENT_ORDER,
  INTENT_LABEL,
  ASPECT_LABEL,
  SLIPS,
  drawSlip,
  readingOrder,
  thaiNumeral,
} from './_siamsi-deck.ts';
import type { Intent, Slip } from './_siamsi-deck.ts';

// The deck itself lives in _siamsi-deck.ts (gh#98): 28 slips in the grade proportions of a real
// "ชุด", with its own distribution test. Re-exported so a caller that only wants the data does not
// have to import a module that touches the DOM.
export { SLIPS, drawSlip, readingOrder, thaiNumeral } from './_siamsi-deck.ts';

// ---- Copy. Every string a reader sees on this page, in one place ----
// Values come from design/SiamsiIntent, SiamsiShake, SiamsiStick and SiamsiSlip (ADR-0033).

export const TITLE_INTENT = 'เซียมซี';
export const LEAD_INTENT = 'ตั้งจิตให้นิ่ง แล้วนึกถึงเรื่องที่อยากรู้ให้ชัดในใจ';
export const LABEL_INTENT_GROUP = 'เรื่องที่อยากถาม';
export const BTN_INTENT_DONE = 'ตั้งจิตแล้ว';

export const TITLE_SHAKE = 'เขย่าให้ไม้หลุด';
export const BTN_HOLD = 'หรือกดปุ่มนี้ค้างไว้';
export const NOTE_SHAKE = 'ของจริงต้องเขย่าจนไม้หลุดออกมาดอกเดียว ที่นี่ก็เหมือนกัน';

export const TITLE_STICK = 'ไม้ติ้วหลุดแล้ว';
export const BTN_OPEN_SLIP = 'เปิดใบเซียมซี';

export const BTN_KEEP = 'เก็บใบนี้ไว้';
export const BTN_TIE = 'ผูกทิ้งไว้ที่นี่';
export const NOTE_SLIP = 'ใบดีเก็บไว้เป็นกำลังใจ ใบที่ไม่ถูกใจฝากทิ้งไว้ที่นี่ ไม่ต้องเอากลับบ้าน';
// The two closing lines have no painted source — the canvas says only that the panel is replaced by
// one line of copy plus the restart, no third screen. Written here and flagged for the owner's eye.
export const DONE_KEEP = 'เก็บใบนี้ไว้แล้ว ขอให้เป็นกำลังใจไปทั้งวัน';
export const DONE_TIE = 'ผูกใบนี้ทิ้งไว้ที่นี่แล้ว ไม่ต้องเอากลับบ้าน';
export const BTN_AGAIN = 'เสี่ยงใหม่';

/** Rider copy per device. HINT_SHAKE is the canvas line; HINT_TAP_ONLY replaces it wherever no
 *  motion sensor exists or the iOS opt-in was refused; HINT_ENABLE_SHAKE is the opt-in itself. */
export const HINT_SHAKE = 'เขย่าเครื่องต่อไปเรื่อยๆ';
export const HINT_TAP_ONLY = 'กดปุ่มด้านล่างค้างไว้แทนการเขย่า';
export const HINT_ENABLE_SHAKE = 'แตะตรงนี้เพื่อเปิดการเขย่าเครื่อง';

// ---- The accumulator: pure, and the reason one jolt does nothing ----

/** How much accumulated shake releases a "ติ้ว". Above one so a single kick can never reach it — that
 *  is the invariant, not the exact number. */
export const SHAKE_TARGET = 6;

/** One unit of charge per this many ms of holding the button, so the hold reaches SHAKE_TARGET in
 *  roughly the time a real shake takes. */
export const HOLD_STEP_MS = 220;

/** Fraction of the meter that is filled, clamped — the meter is what tells the reader the wait is
 *  the mechanic and not a broken button. */
export function chargeRatio(charge: number): number {
  return Math.min(1, Math.max(0, charge / SHAKE_TARGET));
}

/** A "ติ้ว" comes out only once the charge has accumulated all the way. */
export function isReleased(charge: number): boolean {
  return charge >= SHAKE_TARGET;
}

// ---- Current round state (one draw per page) ----

type Phase = 'intent' | 'shake' | 'stick' | 'slip';

let cleanup: Array<() => void> = [];
let phase: Phase = 'intent';
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let intent: Intent = 'any';
let charge = 0;
let drawn: Slip | null = null;
let meterFill: HTMLElement | null = null;
let holdTimer: ReturnType<typeof setInterval> | undefined;

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// The barrel is vector art only — inline SVG, no raster asset (gh#78). The accent-coloured body path
// fills var(--page-accent), a presentation attribute referencing a custom property; it resolves
// because the shell defines --page-accent on <main> above the stage (GameLayout.astro). The stick
// wood #f7e6c4 and the marked tip #d6336c are literals with no token, as the canvas has them. Every
// coordinate below is the canvas value.

/** The barrel at rest, upright, no stick raised — design/SiamsiIntent.dc.html. */
const BARREL_REST_SVG =
  '<svg width="200" height="200" viewBox="0 0 200 200" fill="none" aria-hidden="true">' +
  '<rect x="66" y="52" width="9" height="80" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="84" y="46" width="9" height="86" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="102" y="50" width="9" height="82" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="120" y="48" width="9" height="84" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<path d="M56 72 h84 l-9 126 h-66 z" fill="var(--page-accent)" stroke="var(--color-line-strong)" stroke-width="3" stroke-linejoin="round"></path>' +
  '<ellipse cx="98" cy="72" rx="42" ry="13" fill="var(--color-ground-warm)" stroke="var(--color-line-strong)" stroke-width="3"></ellipse>' +
  '<path d="M70 112 h56" stroke="var(--color-line-strong)" stroke-width="2.5" stroke-linecap="round" opacity="0.35"></path>' +
  '<path d="M72 134 h52" stroke="var(--color-line-strong)" stroke-width="2.5" stroke-linecap="round" opacity="0.35"></path>' +
  '</svg>';

/** The barrel mid-shake, with the marked "ติ้ว" riding clear of the rim — design/SiamsiShake.dc.html.
 *  The sticks carry the rattle class; the whole drawing carries the sensor-driven lean. */
const BARREL_SHAKE_SVG =
  '<svg width="200" height="240" viewBox="0 0 200 240" fill="none" aria-hidden="true">' +
  '<g class="sm-sticks">' +
  '<rect x="66" y="26" width="9" height="112" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="84" y="14" width="9" height="124" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="102" y="32" width="9" height="106" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="120" y="20" width="9" height="118" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="86" y="-14" width="11" height="150" rx="5.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="86" y="-14" width="11" height="22" rx="5.5" fill="#d6336c" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '</g>' +
  '<path d="M56 110 h84 l-9 128 h-66 z" fill="var(--page-accent)" stroke="var(--color-line-strong)" stroke-width="3" stroke-linejoin="round"></path>' +
  '<ellipse cx="98" cy="110" rx="42" ry="13" fill="var(--color-ground-warm)" stroke="var(--color-line-strong)" stroke-width="3"></ellipse>' +
  '<path d="M70 150 h56" stroke="var(--color-line-strong)" stroke-width="2.5" stroke-linecap="round" opacity="0.35"></path>' +
  '<path d="M72 172 h52" stroke="var(--color-line-strong)" stroke-width="2.5" stroke-linecap="round" opacity="0.35"></path>' +
  '</svg>';

/** The landing — design/SiamsiStick.dc.html. The barrel has tipped back and the "ติ้ว" lies across the
 *  ground, number side up. No ground line is drawn: nothing else on this site draws a floor. */
function stickSvg(numeral: string): string {
  return (
    '<svg width="240" height="240" viewBox="0 0 240 240" fill="none" aria-hidden="true">' +
    '<g style="transform: rotate(-12deg); transform-origin: 150px 180px;">' +
    '<rect x="118" y="66" width="9" height="60" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
    '<rect x="136" y="60" width="9" height="66" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
    '<rect x="154" y="64" width="9" height="62" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
    '<path d="M108 86 h84 l-9 112 h-66 z" fill="var(--page-accent)" stroke="var(--color-line-strong)" stroke-width="3" stroke-linejoin="round"></path>' +
    '<ellipse cx="150" cy="86" rx="42" ry="13" fill="var(--color-ground-warm)" stroke="var(--color-line-strong)" stroke-width="3"></ellipse>' +
    '<path d="M122 124 h56" stroke="var(--color-line-strong)" stroke-width="2.5" stroke-linecap="round" opacity="0.35"></path>' +
    '</g>' +
    '<g class="sm-fallen" style="transform: rotate(-7deg); transform-origin: 100px 196px;">' +
    '<rect x="16" y="182" width="150" height="13" rx="6.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
    '<rect x="16" y="182" width="24" height="13" rx="6.5" fill="#d6336c" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
    `<text x="118" y="193" font-family="var(--font-display)" font-size="13" font-weight="500" fill="var(--color-line-strong)" text-anchor="middle">${numeral}</text>` +
    '</g>' +
    '</svg>'
  );
}

// ---- gh#83: shake-to-draw (device-motion sensor path), carried forward ----
// The shake is a second activation path for the same accumulator the hold button feeds, never a
// requirement — a device with no sensor reaches the identical result through the hold.
//
// The hazard: armAllButtons gates taps only, and a shake walks straight past it (the mis-tap family
// of gh#37/gh#39/gh#42 arriving through a channel the gate does not watch). The sensor path
// therefore arms itself on the same ARM_DELAY_MS, and a kick while disarmed re-defers that arming —
// jostle while the phone is picked up keeps the path closed, matching the tap gate's fail-closed
// premise in docs/adr/0016. Adding charge is the only effect an armed shake can have; the phase and
// presence guards swallow everything else.

/** Minimum kick to count as a shake: the magnitude of change between two consecutive motion
 *  samples, in m/s^2. Resting drift stays a fraction of one; a deliberate shake spikes well past it. */
export const SHAKE_KICK = 12;

export interface MotionSample {
  x: number;
  y: number;
  z: number;
}

/** Size of the kick between two consecutive motion samples (pure — testable with no DOM). */
export function shakeKick(prev: MotionSample, next: MotionSample): number {
  return Math.hypot(next.x - prev.x, next.y - prev.y, next.z - prev.z);
}

/** A kick at or past SHAKE_KICK reads as a shake — one unit of charge, not a release. */
export function isShake(prev: MotionSample, next: MotionSample): boolean {
  return shakeKick(prev, next) >= SHAKE_KICK;
}

type SensorStatus = 'none' | 'needs-permission' | 'ready';

// Feature detection, never user-agent sniffing. Both checks live inside functions so a non-browser
// test process (no window at all) takes the 'none' path untouched.
function detectSensor(): SensorStatus {
  if (typeof window === 'undefined') return 'none';
  if (!('DeviceMotionEvent' in window)) return 'none';
  const DME = window.DeviceMotionEvent as unknown as { requestPermission?: unknown };
  if (typeof DME.requestPermission === 'function') return 'needs-permission';
  return 'ready';
}

type MotionPermissionState = 'granted' | 'denied';

/** The iOS requestPermission static, capability-guarded. Returns null unless the exact check the
 *  ticket names passes — an optional-chain guard on a missing container would read as permitted. */
function motionPermissionRequest(): (() => Promise<MotionPermissionState>) | null {
  if (typeof window === 'undefined') return null;
  if (!('DeviceMotionEvent' in window)) return null;
  const DME = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  const request = DME.requestPermission;
  if (typeof request !== 'function') return null;
  return () =>
    Promise.resolve(request.call(DME)).then((state) => (state === 'granted' ? 'granted' : 'denied'));
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---- sensor-path state (one round per page) ----

interface ShakeTurnState {
  armed: boolean;
  last: MotionSample | null;
  sway: { x: number; y: number };
  svg: SVGElement | null;
  reduced: boolean;
}

let shake: ShakeTurnState | null = null;
let armTimer: ReturnType<typeof setTimeout> | undefined;
let motionListening = false;
// The iOS answers are page-lifetime, not round-lifetime: a restart (teardown + mount) must not
// re-ask. A reload resets the module, which is correct — iOS requires a per-page-load re-ask.
let motionGranted = false;
let motionDeclined = false;

// wobble tuning: how far the barrel may lean (degrees) and how much of the distance to that lean
// each event covers — the lerp is what turns raw accelerometer noise into a sway
const LEAN_MAX_DEG = 14;
const WOBBLE_SMOOTH = 0.18;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Attaches the single per-round devicemotion listener through on(), so dispose() removes it via
 *  the module's existing cleanup list — never an ad-hoc removeEventListener, because a leaked
 *  listener would survive the round and fire for whatever game mounts next. */
function attachMotionListener(): void {
  if (motionListening) return;
  motionListening = true;
  on(window, 'devicemotion', handleMotion);
}

/** Arms the shake path after ARM_DELAY_MS of quiet. Every kick while disarmed calls this again, so
 *  the window is exactly what the tap gate gives its buttons, and the identity check keeps a stale
 *  timer from arming a later round's state. */
function startArmDelay(): void {
  if (armTimer !== undefined) clearTimeout(armTimer);
  const turn = shake;
  armTimer = setTimeout(() => {
    armTimer = undefined;
    if (phase === 'shake' && shake !== null && shake === turn) shake.armed = true;
  }, ARM_DELAY_MS);
}

function handleMotion(event: Event): void {
  const turn = shake;
  if (!turn) return;
  if (phase !== 'shake') return;
  const e = event as DeviceMotionEvent;

  // the tilt source drives the wobble only when motion is acceptable and the svg exists
  const g = e.accelerationIncludingGravity;
  if (!turn.reduced && turn.svg && g && g.x !== null && g.y !== null && g.z !== null) {
    wobble(turn, { x: g.x, y: g.y, z: g.z });
  }

  // the kick source: raw acceleration excludes gravity on every platform that offers it, so a
  // resting hand reads ~zero and a shake spikes; the fallback keeps devices that omit it working
  const kickSrc = e.acceleration ?? e.accelerationIncludingGravity;
  if (!kickSrc || kickSrc.x === null || kickSrc.y === null || kickSrc.z === null) return;
  const sample: MotionSample = { x: kickSrc.x, y: kickSrc.y, z: kickSrc.z };
  const prev = turn.last;
  turn.last = sample;
  if (!prev) return; // the first sample only seeds the delta — a fresh round never kicks on arrival

  if (!isShake(prev, sample)) return;
  // fail closed, like the tap gate: while disarmed a kick re-defers arming instead of charging
  if (!turn.armed) {
    startArmDelay();
    return;
  }
  addCharge();
}

/** Tilts the barrel svg with the phone: gravity scaled and clamped into degrees, then lerped per
 *  event, written as the inline rotate3d the preserve-3d stylesheet rule gives depth to. */
function wobble(turn: ShakeTurnState, g: MotionSample): void {
  const node = turn.svg;
  if (!node) return;
  turn.sway.x += (clamp((g.x / 9.81) * LEAN_MAX_DEG, -LEAN_MAX_DEG, LEAN_MAX_DEG) - turn.sway.x) * WOBBLE_SMOOTH;
  turn.sway.y += (clamp((g.y / 9.81) * LEAN_MAX_DEG, -LEAN_MAX_DEG, LEAN_MAX_DEG) - turn.sway.y) * WOBBLE_SMOOTH;
  node.style.transform =
    `rotate3d(1, 0, 0, ${turn.sway.y.toFixed(1)}deg) rotate3d(0, 1, 0, ${turn.sway.x.toFixed(1)}deg)`;
}

/** The hint line under the barrel, shaped per device: span + HINT_SHAKE where a sensor is live,
 *  button + HINT_ENABLE_SHAKE where iOS still needs the opt-in, span + HINT_TAP_ONLY everywhere
 *  else. Every transition is silent — this feature carries no error copy at all. The opt-in is a
 *  real button because buttons are the only clickable idiom these games use, and the screen's
 *  armAllButtons then gates it like every other button. */
function shakeHint(barrel: HTMLElement): HTMLElement {
  const sensor = detectSensor();
  if (sensor === 'none' || (sensor === 'needs-permission' && motionDeclined)) {
    shake = null;
    const hint = el('span', HINT_TAP_ONLY);
    hint.className = 'sm-hint';
    return hint;
  }
  if (sensor === 'needs-permission' && !motionGranted) {
    shake = null;
    const hint = el('button', HINT_ENABLE_SHAKE);
    hint.type = 'button';
    hint.className = 'sm-hint sm-hint--tap';
    wireOptIn(hint);
    return hint;
  }
  const hint = el('span', HINT_SHAKE);
  hint.className = 'sm-hint';
  activateShake(barrel, hint);
  return hint;
}

function activateShake(barrel: HTMLElement, hint: HTMLElement): void {
  const svg = barrel.querySelector('svg') as SVGElement | null;
  shake = { armed: false, last: null, sway: { x: 0, y: 0 }, svg, reduced: prefersReducedMotion() };
  hint.textContent = HINT_SHAKE;
  hint.className = 'sm-hint';
  attachMotionListener();
  startArmDelay();
}

/** The iOS opt-in. requestPermission must run synchronously inside the user gesture (a click), so
 *  the settle-and-re-render below happens on a later microtask; settled flips first so a rapid
 *  second tap cannot double-ask. Either answer silently re-renders the screen: granted swaps the
 *  opt-in line for the live shake path, any other outcome swaps in the tap-only line and never
 *  asks again for the rest of the page load. */
function wireOptIn(hint: HTMLButtonElement): void {
  let settled = false;
  const click = (): void => {
    if (settled) return;
    const request = motionPermissionRequest();
    if (!request) {
      // capability gone between the feature-detect and the tap — take the silent tap-only path
      settled = true;
      motionDeclined = true;
      if (phase === 'shake') renderShake();
      return;
    }
    let answer: Promise<MotionPermissionState>;
    try {
      answer = request();
    } catch {
      settled = true;
      motionDeclined = true;
      if (phase === 'shake') renderShake();
      return;
    }
    settled = true; // marked before the answer lands so a second tap cannot double-ask
    void answer.then(
      (state) => {
        if (state === 'granted') motionGranted = true;
        else motionDeclined = true;
        if (phase === 'shake') renderShake();
      },
      () => {
        motionDeclined = true;
        if (phase === 'shake') renderShake();
      },
    );
  };
  on(hint, 'click', click);
}

// ---- The accumulator, wired ----

/** One unit of charge, from either activation path. The meter is the only thing that moves until
 *  the charge is full; at full it releases the "ติ้ว" and the screen changes under whatever finger or
 *  hand caused it, which is why the hold interval is cleared inside the transition and not on
 *  pointerup — a screen replaced under the finger may never deliver a pointerup at all. */
function addCharge(): void {
  if (phase !== 'shake') return;
  charge += 1;
  if (meterFill) meterFill.style.width = `${Math.round(chargeRatio(charge) * 100)}%`;
  if (isReleased(charge)) releaseStick();
}

function stopHold(): void {
  if (holdTimer !== undefined) clearInterval(holdTimer);
  holdTimer = undefined;
}

/** The press-and-hold fallback. It feeds addCharge() on a cadence, so a device with no motion
 *  sensor reaches exactly the same release the shake does, and a single tap — press and let go —
 *  never gets there. */
function startHold(hold: HTMLButtonElement): void {
  if (phase !== 'shake') return;
  stopHold();
  holdTimer = setInterval(() => {
    // ADR-0059 — the gate decides from the browser's input stamp, never from when a handler ran, so
    // a contact stamped inside the arm window can be DISPATCHED after the timer has already armed:
    // the pointerdown check below sees an enabled control and lets the hold start. The stage's own
    // stamp guard re-disables the region a moment later, and this is the point where that
    // re-disable can still take effect — an interval already running is out of its reach otherwise.
    if (hold.disabled) {
      stopHold();
      return;
    }
    addCharge();
  }, HOLD_STEP_MS);
}

// ---- Screens ----

/** "ตั้งจิต" — the reader settles their mind and names the subject. No roster, no player count, no
 *  question about who is playing: this page never asks (ADR-0040). */
function renderIntent(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const title = el('span', TITLE_INTENT);
  title.className = 'sm-title';
  stage.appendChild(title);
  stage.appendChild(el('p', LEAD_INTENT));

  const group = document.createElement('div');
  group.className = 'sm-intent';
  const groupLabel = el('span', LABEL_INTENT_GROUP);
  groupLabel.className = 'sm-intent-label';
  group.appendChild(groupLabel);

  const chipRow = document.createElement('div');
  chipRow.className = 'sm-chips';
  // The chips toggle a class rather than re-rendering the screen: a re-render would rebuild every
  // button and re-open a fresh arm window under the finger that just picked, which is the gh#42
  // hazard the gate exists for.
  const chips: HTMLButtonElement[] = [];
  for (const option of INTENT_ORDER) {
    const chip = el('button', INTENT_LABEL[option]);
    chip.type = 'button';
    chip.className = option === intent ? 'sm-chip sm-chip--on' : 'sm-chip';
    on(chip, 'click', () => {
      intent = option;
      for (const other of chips) other.className = 'sm-chip';
      chip.className = 'sm-chip sm-chip--on';
    });
    chips.push(chip);
    chipRow.appendChild(chip);
  }
  group.appendChild(chipRow);
  stage.appendChild(group);

  const barrel = document.createElement('div');
  barrel.className = 'sm-barrel';
  barrel.innerHTML = BARREL_REST_SVG;
  stage.appendChild(barrel);

  const go = el('button', BTN_INTENT_DONE);
  go.id = 'ss-intent-done';
  go.type = 'button';
  go.className = 'game-btn game-btn-primary';
  on(go, 'click', startRound);
  stage.appendChild(go);

  // The restart on the slip screen remounts straight into this screen under the same finger — gate
  // it so a ghost second contact cannot leave "ตั้งจิต" before anyone chose to.
  cleanup.push(armAllButtons(stage));
}

/** "เขย่า" — the meter is the screen. Nothing advances until the charge is full. */
function renderShake(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const title = el('span', TITLE_SHAKE);
  title.className = 'sm-subtitle';
  stage.appendChild(title);

  const barrel = document.createElement('div');
  barrel.className = 'sm-barrel';
  barrel.innerHTML = BARREL_SHAKE_SVG;
  stage.appendChild(barrel);

  // The meter. Its width is a direct style write, and it keeps updating under reduced motion on
  // purpose: it is the mechanic, not decoration, so reducing means keeping the meter and dropping
  // the rattle and the fall, which are CSS animations the media query in siamsi.css switches off
  // (ADR-0046 — reduce, not remove).
  const meter = document.createElement('div');
  meter.className = 'sm-meter';
  const fill = document.createElement('div');
  fill.className = 'sm-meter-fill';
  fill.style.width = `${Math.round(chargeRatio(charge) * 100)}%`;
  meter.appendChild(fill);
  meterFill = fill;
  stage.appendChild(meter);

  // gh#83 — the hint line doubles as the shake affordance: a live sensor keeps HINT_SHAKE, the iOS
  // pre-permission opt-in renders HINT_ENABLE_SHAKE as a real control, and no sensor (or a refusal)
  // renders HINT_TAP_ONLY. All three are silent — no error copy exists in this feature.
  stage.appendChild(shakeHint(barrel));

  const hold = el('button', BTN_HOLD);
  hold.id = 'ss-hold';
  hold.type = 'button';
  hold.className = 'game-btn game-btn-primary sm-hold';
  // pointerdown/up rather than click, because the control is a hold. cancel and leave are both
  // wired: a finger that slides off the button never sends pointerup.
  //
  // The disabled check is the arm gate for THIS channel and is not redundant. armAllButtons gates by
  // setting `disabled`, and `disabled` is only known to swallow activation (click) — whether a
  // browser delivers pointerdown to a disabled button's own listener is a runtime fact nothing in
  // this repo measures. Without the check a ghost contact that lands and stays down runs the
  // interval to a full release, and the gate re-disabling the button mid-window cannot stop an
  // interval that has already started. Same fail-closed premise the sensor path takes.
  on(hold, 'pointerdown', () => {
    if (!hold.disabled) startHold(hold);
  });
  on(hold, 'pointerup', stopHold);
  on(hold, 'pointercancel', stopHold);
  on(hold, 'pointerleave', stopHold);
  stage.appendChild(hold);

  stage.appendChild(el('p', NOTE_SHAKE));

  // Reached from the "ตั้งจิต" button, which swaps the stage under the finger that just tapped it.
  cleanup.push(armAllButtons(stage));
}

/** "ไม้ติ้วตก" — the number, alone, before any "คำทำนาย". This screen exists so the number is read
 *  first; folding it into the slip screen is what the ticket's separation forbids. */
function renderStick(): void {
  const stage = stageEl;
  if (!stage || !drawn) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const title = el('span', TITLE_STICK);
  title.className = 'sm-subtitle';
  stage.appendChild(title);

  const panel = document.createElement('div');
  panel.className = 'sm-barrel sm-barrel--landed';
  panel.innerHTML = stickSvg(thaiNumeral(drawn.number));
  stage.appendChild(panel);

  const readout = document.createElement('div');
  readout.className = 'sm-number';
  const numeral = el('span', thaiNumeral(drawn.number));
  numeral.className = 'sm-number-thai';
  readout.appendChild(numeral);
  // Thai numerals are what a real "ติ้ว" carries; the Arabic number sits under it so nobody has to
  // decode it. This is the one place a digit is allowed on this page — it is the "ติ้ว"'s number, not
  // fortune text (the deck's own test bans digits everywhere else).
  readout.appendChild(el('span', `ไม้ติ้วเบอร์ ${drawn.number}`));
  stage.appendChild(readout);

  const open = el('button', BTN_OPEN_SLIP);
  open.id = 'ss-open-slip';
  open.type = 'button';
  open.className = 'game-btn game-btn-primary';
  on(open, 'click', openSlip);
  stage.appendChild(open);

  // The release swapped this screen in under the hand that was shaking or the finger that was
  // holding — gate it so the momentum cannot open the slip before the number has been read.
  cleanup.push(armAllButtons(stage));
}

/** "ใบเซียมซี" — the slip itself, one paper panel, so a screenshot of it is the whole fortune. */
function renderSlip(): void {
  const stage = stageEl;
  if (!stage || !drawn) return;
  const slip = drawn;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const panel = document.createElement('div');
  panel.className = 'sm-slip';

  const head = document.createElement('div');
  head.className = 'sm-slip-head';
  const numeral = el('span', thaiNumeral(slip.number));
  numeral.className = 'sm-slip-number';
  head.appendChild(numeral);
  const grade = el('span', slip.grade);
  grade.className = 'sm-grade';
  head.appendChild(grade);
  panel.appendChild(head);

  const verse = document.createElement('p');
  verse.className = 'sm-verse';
  slip.verse.forEach((line, i) => {
    if (i > 0) verse.appendChild(document.createElement('br'));
    verse.appendChild(el('span', line));
  });
  panel.appendChild(verse);

  const rows = document.createElement('div');
  rows.className = 'sm-rows';
  // The subject the reader set their mind on reads first and carries the accent bar; the rest keep
  // their fixed order below it, so the slip reads the same way every time.
  readingOrder(intent).forEach((aspect, i) => {
    const row = document.createElement('div');
    row.className = i === 0 && intent !== 'any' ? 'sm-row sm-row--asked' : 'sm-row';
    const bar = document.createElement('span');
    bar.className = 'sm-row-bar';
    row.appendChild(bar);
    const body = document.createElement('div');
    const label = el('span', ASPECT_LABEL[aspect]);
    label.className = 'sm-row-label';
    body.appendChild(label);
    body.appendChild(el('p', slip.readings[aspect]));
    row.appendChild(body);
    rows.appendChild(row);
  });
  panel.appendChild(rows);

  const closing = el('p', slip.closing);
  closing.className = 'sm-closing';
  panel.appendChild(closing);
  stage.appendChild(panel);

  // The real custom, as the two closing actions: keep a good slip, tie away a bad one. Whichever is
  // tapped, the panel is replaced in place by one line plus the restart — there is no fifth screen.
  const keep = el('button', BTN_KEEP);
  keep.id = 'ss-keep';
  keep.type = 'button';
  keep.className = 'game-btn game-btn-primary';
  on(keep, 'click', () => renderDone(DONE_KEEP));
  stage.appendChild(keep);

  const tie = el('button', BTN_TIE);
  tie.id = 'ss-tie';
  tie.type = 'button';
  tie.className = 'game-btn game-btn-secondary';
  on(tie, 'click', () => renderDone(DONE_TIE));
  stage.appendChild(tie);

  stage.appendChild(el('p', NOTE_SLIP));
  // No outbound link here — #stage must hold no navigation target (a tap-transition would drop it
  // under the finger that just tapped). The crawlable one is static chrome in GameLayout.astro.

  // Opening the slip swapped this screen in under the same finger — gate both closing actions so a
  // ghost second contact cannot throw the slip away before it was read.
  cleanup.push(armAllButtons(stage));
}

/** The end state of the slip screen, not a screen of its own: one line plus the restart. */
function renderDone(line: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  stage.appendChild(el('p', line));

  const again = el('button', BTN_AGAIN);
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

  // This screen replaced the slip under the finger that kept or tied it — gate the restart, or that
  // same contact starts a round nobody chose to start.
  cleanup.push(armAllButtons(stage));
}

// ---- Round lifecycle ----

// gh#106 / gh#121 — the shell's leave-confirm (src/shell/LeaveConfirm.astro) arms on "a round was
// started on this page". On a party page the setup panel's `hidden` carries that bit; ADR-0040's
// [1, 1] pages render no panel, so this page is the only thing that knows, and announceRoundStarted()
// is how it says so, on leaving "ตั้งจิต". Nothing is persisted any more, but the unread slip is still
// something a stray back-swipe would lose. The reasoning lives in _round-start.ts.

function startRound(): void {
  if (phase !== 'intent') return;
  phase = 'shake';
  charge = 0;
  announceRoundStarted();
  renderShake();
}

/** The charge reached SHAKE_TARGET: one "ติ้ว" comes out, and the slip behind it is drawn now so the
 *  number on the stick and the number on the slip cannot disagree. Random per draw on purpose —
 *  determinism is what separates "ดวงวันนี้" from this page (ADR-0002). */
function releaseStick(): void {
  if (phase !== 'shake') return;
  stopHold();
  meterFill = null;
  shake = null;
  drawn = drawSlip();
  phase = 'stick';
  gameCtx?.session.markPlayed('siamsi');
  renderStick();
}

function openSlip(): void {
  if (phase !== 'stick') return;
  phase = 'slip';
  renderSlip();
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  phase = 'intent';
  intent = 'any';
  charge = 0;
  drawn = null;
  renderIntent();
}

function teardown(): void {
  phase = 'intent';
  // sensor path: cancel the pending arm timer and reset its per-round state. The iOS answers stay.
  if (armTimer !== undefined) clearTimeout(armTimer);
  armTimer = undefined;
  shake = null;
  motionListening = false;
  stopHold();
  meterFill = null;
  cleanup.forEach((fn) => fn());
  cleanup = [];
  charge = 0;
  drawn = null;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'siamsi',
  names: { th: 'เสี่ยงเซียมซี', en: 'Siamsi Fortune' },
  category: 'fortune',
  // gh#96 / ADR-0040 — the cross-binding makes [1, 1] the only shape a fortune page may declare.
  players: [1, 1],
  renderer: 'dom',
  // A [1, 1] page renders no #player-setup, so the shell has no bit to read: this module announces
  // the round itself via announceRoundStarted() (gh#121).
  startsRound: true,
  keywords: ['เสี่ยงเซียมซี', 'เซียมซี', 'เซียมซีออนไลน์', 'ดูดวง', 'ดูดวงออนไลน์', 'เซียมซีฟรี'],
  // UNCHANGED ON PURPOSE. scripts/og-cards.lock.json pins the rendered OG card to the game's Thai
  // name plus this exact line, so editing it reds og-card-check until the card is re-rendered — and
  // the shipped wording (shake, open your slip) still describes the page after this rewrite, so
  // there is nothing to buy with that re-render.
  tagline: 'เขย่ามือถือเสี่ยงเซียมซี เปิดดูใบทำนายของคุณ',
  // ADR-0002 keeps this page and "ดวงวันนี้" on different search intents, and the split lives entirely
  // in these strings: this one is the ritual (set your mind, shake, read the slip), that one is the
  // once-a-day check. Write them loosely and the split disappears with nothing breaking to show it.
  seo: {
    title: 'เสี่ยงเซียมซีออนไลน์ — ตั้งจิต เขย่ามือถือ เปิดใบทำนายฟรี',
    description:
      'เสี่ยงเซียมซีออนไลน์ ตั้งจิตถามเรื่องที่อยากรู้ เขย่ามือถือจนไม้ติ้วหลุด แล้วเปิดอ่านใบเซียมซีพร้อมคำทำนายสี่ด้าน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ตั้งจิตให้นิ่ง แล้วเลือกเรื่องที่อยากถาม',
      'เขย่าเครื่องต่อเนื่อง หรือกดปุ่มค้างไว้ จนไม้ติ้วหลุดออกมา',
      'ดูเบอร์ไม้ติ้วก่อน แล้วค่อยเปิดอ่านใบเซียมซี',
    ],
  },
  og: 'siamsi.png',
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
