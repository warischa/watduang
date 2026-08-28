// Siamsi — one person, one draw. ADR-0040 fixed this page at [1, 1]: the shell mounts it with an
// empty roster and a session that persists nothing, so every party path (turn order, holder,
// summary, checkpoint resume) was unreachable code and is gone.
// The .ts extension on the import path is required for `node --test` (Node does not guess extensions) — Vite/tsc both accept it
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons, ARM_DELAY_MS } from './_arm-gate.ts';
import { el } from './_el.ts';
import { announceRoundStarted } from './_round-start.ts';

// ---- Fortunes + deck: pure and calculable, testable with no DOM (see siamsi.test.mjs) ----

export interface Fortune {
  number: number;
  text: string;
  prompt: string;
}

// Fixed 24-card deck — no reference to alcohol/gambling/lucky numbers that could read as a money-prediction number
export const FORTUNES: readonly Fortune[] = [
  { number: 1, text: 'วันนี้ดวงเฮง ยิ้มไว้เดี๋ยวโชคตามมาเอง', prompt: 'ให้คนทางซ้ายทายว่าจริงไหม' },
  { number: 2, text: 'มีคนแอบชื่นชมคุณอยู่เงียบๆ', prompt: 'ให้ทุกคนช่วยกันเดาว่าใคร' },
  { number: 3, text: 'วันนี้เหมาะกับการเริ่มอะไรใหม่ๆ', prompt: 'บอกวงว่าอยากเริ่มอะไร' },
  { number: 4, text: 'โชคดีเรื่องเพื่อนฝูง มีคนคอยช่วยเสมอ', prompt: 'ชี้คนในวงที่ช่วยคุณบ่อยที่สุด' },
  { number: 5, text: 'ระวังลืมของ วันนี้ใจลอยหน่อย', prompt: 'เช็กกระเป๋าตัวเองตอนนี้เลย' },
  { number: 6, text: 'พูดอะไรวันนี้มีคนฟังเป็นพิเศษ', prompt: 'พูดประโยคเด็ดให้วงฟังหนึ่งประโยค' },
  { number: 7, text: 'ดวงเรื่องกินดี วันนี้ได้กินของอร่อยแน่นอน', prompt: 'บอกวงว่าอยากกินอะไรที่สุดตอนนี้' },
  { number: 8, text: 'มีเรื่องเซอร์ไพรส์เล็กๆ รอคุณอยู่', prompt: 'ให้คนทางขวาทายว่าเซอร์ไพรส์อะไร' },
  { number: 9, text: 'วันนี้เหมาะกับการขอโทษหรือขอบคุณใครสักคน', prompt: 'พูดขอบคุณคนในวงหนึ่งคนตอนนี้' },
  { number: 10, text: 'ดวงเดินทางดี ไปไหนก็ราบรื่น', prompt: 'บอกที่ที่อยากไปที่สุดตอนนี้' },
  { number: 11, text: 'จะได้ยินข่าวดีในไม่ช้า', prompt: 'ให้วงช่วยกันเดาว่าข่าวดีเรื่องอะไร' },
  { number: 12, text: 'วันนี้ควรพักผ่อนให้เต็มที่ อย่าฝืนตัวเอง', prompt: 'บอกวงว่าจะพักผ่อนยังไงคืนนี้' },
  { number: 13, text: 'มีโอกาสได้เจอเพื่อนเก่า', prompt: 'เอ่ยชื่อเพื่อนเก่าที่คิดถึงที่สุด' },
  { number: 14, text: 'ดวงความคิดสร้างสรรค์พุ่งแรง', prompt: 'เล่าไอเดียล่าสุดที่คิดได้ให้วงฟัง' },
  { number: 15, text: 'วันนี้เหมาะกับการเคลียร์ใจกับใครสักคน', prompt: 'ชี้คนที่อยากเคลียร์ใจด้วยที่สุด' },
  { number: 16, text: 'จะมีคนชวนไปทำกิจกรรมสนุกๆ', prompt: 'บอกกิจกรรมที่อยากชวนวงไปทำ' },
  { number: 17, text: 'ดวงเรื่องงาน/เรียนกำลังไปได้สวย', prompt: 'บอกวงว่ากำลังทำอะไรอยู่ตอนนี้' },
  { number: 18, text: 'วันนี้ใจดีเป็นพิเศษ ใครขออะไรก็ใจอ่อน', prompt: 'ให้คนข้างๆ ขออะไรสักอย่างจากคุณ' },
  { number: 19, text: 'มีเรื่องตลกรอให้เล่าในวันนี้', prompt: 'เล่าเรื่องตลกล่าสุดที่เจอมาให้วงฟัง' },
  { number: 20, text: 'ดวงเฮงเรื่องของหาย จะเจอของที่ตามหาอยู่', prompt: 'บอกของที่หาไม่เจอมานานที่สุด' },
  { number: 21, text: 'วันนี้เหมาะกับการชมคนรอบตัว', prompt: 'ชมคนทางขวามือหนึ่งคำ' },
  { number: 22, text: 'จะได้ทำอะไรที่ไม่เคยทำมาก่อน', prompt: 'บอกวงว่าอยากลองอะไรใหม่' },
  { number: 23, text: 'ดวงความสัมพันธ์กำลังดี รักษาไว้ให้ดี', prompt: 'บอกคนที่อยากดูแลความสัมพันธ์ด้วยมากที่สุด' },
  { number: 24, text: 'วันนี้โชคเข้าข้าง ลองอะไรใหม่ๆ ได้เลย', prompt: 'ให้วงโหวตว่าคุณควรลองอะไรต่อ' },
];

/** Shuffles every deck index — the whole deck, because one person draws its top card and the round
 *  is over. No player count and no short-deck case can exist on a [1, 1] page. */
export function buildDeck(rand: () => number = Math.random): number[] {
  const order = FORTUNES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Draws the top card of the deck — returns the drawn fortune and the remaining deck (does not mutate the original array) */
export function draw(deck: readonly number[]): { fortune: Fortune; remaining: number[] } {
  if (deck.length === 0) throw new Error('deck is empty — reshuffle before drawing');
  const [next, ...remaining] = deck;
  return { fortune: FORTUNES[next], remaining };
}

// ---- Current round state (one game per page) ----

type Phase = 'idle' | 'turn' | 'drawn';

let cleanup: Array<() => void> = [];
let phase: Phase = 'idle';
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let drawn: Fortune | null = null;

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// The barrel is vector art only — inline SVG, no raster asset (gh#78). The accent-coloured body path
// fills var(--page-accent), a presentation attribute referencing a custom property; it resolves
// because the shell defines --page-accent on <main> above the stage (GameLayout.astro). The stick
// wood #f7e6c4 and the marked tip #d6336c are literals with no token, as the brief allows. The
// ellipse uses the warm ground token and every outline uses the strong line token, exactly as
// pick-loser's burst does (gh#76). The 3D wobble that moves this drawing is the sensor path
// further down (gh#83) — this string only draws it.
const BARREL_SVG =
  '<svg width="200" height="240" viewBox="0 0 200 240" fill="none" aria-hidden="true">' +
  '<rect x="66" y="18" width="9" height="120" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="84" y="4" width="9" height="134" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="102" y="24" width="9" height="114" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="120" y="12" width="9" height="126" rx="4.5" fill="#f7e6c4" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<rect x="88" y="0" width="9" height="18" rx="4.5" fill="#d6336c" stroke="var(--color-line-strong)" stroke-width="2.5"></rect>' +
  '<path d="M56 110 h84 l-9 128 h-66 z" fill="var(--page-accent)" stroke="var(--color-line-strong)" stroke-width="3" stroke-linejoin="round"></path>' +
  '<ellipse cx="98" cy="110" rx="42" ry="13" fill="var(--color-ground-warm)" stroke="var(--color-line-strong)" stroke-width="3"></ellipse>' +
  '<path d="M70 150 h56" stroke="var(--color-line-strong)" stroke-width="2.5" stroke-linecap="round" opacity="0.35"></path>' +
  '<path d="M72 172 h52" stroke="var(--color-line-strong)" stroke-width="2.5" stroke-linecap="round" opacity="0.35"></path>' +
  '</svg>';

// ---- gh#83: shake-to-draw (device-motion sensor path) ----
// The shake is a second activation path for the draw control, never a requirement — the tap-only
// round stays pinned by the gh#78 tests. It drives 3D CSS transforms on the inline SVG above: no
// 3D library and no model file (owner's ruling — the barrel is a 200x240 drawing, a mesh would be
// cost without surface). Everything here lives inside this module, which the game page
// lazy-imports, so none of it reaches the shared bundle or any other page.
//
// The hazard: armAllButtons gates taps only, and a shake walks straight past it (the mis-tap
// family of gh#37/gh#39/gh#42 arriving through a channel the gate does not watch). The sensor
// path therefore arms itself on the same ARM_DELAY_MS, and a kick while disarmed re-defers that
// arming — jostle while the phone is picked up keeps the path closed, matching the tap gate's
// fail-closed premise in docs/adr/0016. drawFortune is the only effect an armed shake can have;
// the phase and presence guards swallow everything else.

/** Rider copy per device. HINT_SHAKE is the shipped canvas line, byte-identical; HINT_TAP_ONLY
 *  replaces it wherever no motion sensor exists or the iOS opt-in was refused; HINT_ENABLE_SHAKE
 *  is the iOS pre-permission opt-in itself. */
export const HINT_SHAKE = 'เขย่าเครื่อง หรือกดปุ่มด้านล่างก็ได้';
export const HINT_TAP_ONLY = 'กดปุ่มด้านล่างเพื่อจั่วดวง';
export const HINT_ENABLE_SHAKE = 'แตะตรงนี้เพื่อเปิดการเขย่าเครื่อง';

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

/** A kick at or past SHAKE_KICK reads as a shake. */
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

// ---- sensor-path round state (one game per page) ----

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
// The iOS answers are page-lifetime, not round-lifetime: a "เล่นอีกรอบ" (teardown + mount) must not
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
 *  timer from arming a later turn's state. */
function startArmDelay(): void {
  if (armTimer !== undefined) clearTimeout(armTimer);
  const turn = shake;
  armTimer = setTimeout(() => {
    armTimer = undefined;
    if (phase === 'turn' && shake !== null && shake === turn) shake.armed = true;
  }, ARM_DELAY_MS);
}

function handleMotion(event: Event): void {
  const turn = shake;
  if (!turn) return;
  if (phase !== 'turn') return;
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
  if (!prev) return; // the first sample only seeds the delta — a fresh turn never kicks on arrival

  if (!isShake(prev, sample)) return;
  // fail closed, like the tap gate: while disarmed a kick re-defers arming instead of drawing
  if (!turn.armed) {
    startArmDelay();
    return;
  }
  drawFortune();
}

/** Tilts the barrel svg with the phone: gravity scaled and clamped into degrees, then lerped per
 *  event, written as the inline rotate3d the preserve-3d stylesheet rule gives depth to. */
function wobble(turn: ShakeTurnState, g: MotionSample): void {
  const el = turn.svg;
  if (!el) return;
  turn.sway.x += (clamp((g.x / 9.81) * LEAN_MAX_DEG, -LEAN_MAX_DEG, LEAN_MAX_DEG) - turn.sway.x) * WOBBLE_SMOOTH;
  turn.sway.y += (clamp((g.y / 9.81) * LEAN_MAX_DEG, -LEAN_MAX_DEG, LEAN_MAX_DEG) - turn.sway.y) * WOBBLE_SMOOTH;
  el.style.transform =
    `rotate3d(1, 0, 0, ${turn.sway.y.toFixed(1)}deg) rotate3d(0, 1, 0, ${turn.sway.x.toFixed(1)}deg)`;
}

/** The hint line under the barrel, shaped per device: span + HINT_SHAKE where a sensor is live,
 *  button + HINT_ENABLE_SHAKE where iOS still needs the opt-in, span + HINT_TAP_ONLY everywhere
 *  else. Every transition is silent — this feature carries no error copy at all. The opt-in is a
 *  real button because buttons are the only clickable idiom these games use, and renderTurn's
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
 *  second tap cannot double-ask. Either answer silently re-renders the turn: granted swaps the
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
      if (phase === 'turn') renderTurn();
      return;
    }
    let answer: Promise<MotionPermissionState>;
    try {
      answer = request();
    } catch {
      settled = true;
      motionDeclined = true;
      if (phase === 'turn') renderTurn();
      return;
    }
    settled = true; // marked before the answer lands so a second tap cannot double-ask
    void answer.then(
      (state) => {
        if (state === 'granted') motionGranted = true;
        else motionDeclined = true;
        if (phase === 'turn') renderTurn();
      },
      () => {
        motionDeclined = true;
        if (phase === 'turn') renderTurn();
      },
    );
  };
  on(hint, 'click', click);
}

// ---- Screens ----

function renderIdle(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const startBtn = el('button', 'เริ่มจั่วดวง');
  startBtn.id = 'ss-start';
  startBtn.type = 'button';
  startBtn.className = 'game-btn game-btn-primary';
  on(startBtn, 'click', startRound);
  stage.appendChild(startBtn);

  // renderDrawn's "เล่นอีกรอบ" remounts straight into this screen under the same finger — gate it so
  // a ghost second contact cannot arm a fresh round nobody chose to start.
  cleanup.push(armAllButtons(stage));
}

function renderTurn(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  // Hero motif: the barrel. Inline SVG (BARREL_SVG), vector only — no raster asset (gh#78). gh#83
  // tilts the drawing via 3D transforms fed by the motion sensor — shakeHint owns that path below.
  const barrel = document.createElement('div');
  barrel.className = 'sm-barrel';
  barrel.innerHTML = BARREL_SVG;
  stage.appendChild(barrel);

  // gh#83 — the hint line doubles as the shake affordance: a live sensor keeps HINT_SHAKE, the iOS
  // pre-permission opt-in renders HINT_ENABLE_SHAKE as a real control, and no sensor (or a refusal)
  // renders HINT_TAP_ONLY. All three are silent — no error copy exists in this feature.
  stage.appendChild(shakeHint(barrel));

  const drawBtn = el('button', 'จั่วดวง');
  drawBtn.id = 'ss-draw';
  drawBtn.type = 'button';
  drawBtn.className = 'game-btn game-btn-primary';
  on(drawBtn, 'click', drawFortune);
  stage.appendChild(drawBtn);

  // Reached from startRound(), which swaps the stage under the finger that just tapped "เริ่มจั่วดวง".
  // Gate it so a ghost second contact cannot draw the card before the barrel is even on screen.
  cleanup.push(armAllButtons(stage));
}

function renderDrawn(): void {
  const stage = stageEl;
  if (!stage || !drawn) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  stage.appendChild(el('p', `ดวงที่ ${drawn.number}`, 'font-weight:700'));
  stage.appendChild(el('p', drawn.text, 'font-size:1.3rem;font-weight:700'));
  stage.appendChild(el('p', drawn.prompt));

  // The card is the end of the round — the only way on is a fresh one, so this screen carries the
  // restart the summary screen used to. Teardown + remount, because the module's own state is what
  // has to be cleared.
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
  // No outbound link here — #stage must hold no navigation target (a tap-transition would drop it under
  // the finger that just tapped). The crawlable one is static chrome in src/layouts/GameLayout.astro.

  // The draw that revealed this screen swaps it in under the same finger — gate the restart so a
  // ghost second contact cannot throw the card away before it was read.
  cleanup.push(armAllButtons(stage));
}

// ---- Round lifecycle ----

// gh#106 / gh#121 — the shell's leave-confirm (src/shell/LeaveConfirm.astro) arms on "a round was
// started on this page". On a party page the setup panel's `hidden` carries that bit; ADR-0040's
// [1, 1] pages render no panel, so this page is the only thing that knows, and announceRoundStarted()
// is how it says so, on entering a live round. It must keep firing even though nothing is persisted
// any more: the unread slip on the drawn screen is still something a stray back-swipe would lose.
// The reasoning that made this event exist at all lives in _round-start.ts.

function startRound(): void {
  if (phase !== 'idle') return;
  phase = 'turn';
  announceRoundStarted();
  renderTurn();
}

// One draw ends the round: the deck is shuffled here and only its top card is ever taken, so the
// remainder is discarded and "เล่นอีกรอบ" reshuffles from scratch. No checkpoint is written — the
// shell hands this page a session that persists nothing (src/pages/game/[id].astro), so there is
// nothing to resume and nothing to clear.
function drawFortune(): void {
  if (phase !== 'turn') return;
  drawn = draw(buildDeck()).fortune;
  phase = 'drawn';
  gameCtx?.session.markPlayed('siamsi');
  renderDrawn();
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  phase = 'idle';
  renderIdle();
}

function teardown(): void {
  phase = 'idle';
  // sensor path: cancel the pending arm timer and reset its per-round state. The iOS answers stay.
  if (armTimer !== undefined) clearTimeout(armTimer);
  armTimer = undefined;
  shake = null;
  motionListening = false;
  cleanup.forEach((fn) => fn());
  cleanup = [];
  drawn = null;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'siamsi',
  names: { th: 'เสี่ยงเซียมซี', en: 'Siamsi Fortune' },
  category: 'fortune',
  // gh#96 / ADR-0040 — the cross-binding makes [1, 1] the only shape a fortune page may declare, and
  // the round above is now shaped to match: one person, one draw, no roster read anywhere.
  players: [1, 1],
  // A [1, 1] page renders no #player-setup, so the shell has no bit to read: this module announces
  // the round itself via announceRoundStarted() (gh#121).
  startsRound: true,
  keywords: ['เสี่ยงเซียมซี', 'เซียมซี', 'เซียมซีออนไลน์', 'ดูดวง', 'ดูดวงออนไลน์', 'เซียมซีฟรี'],
  tagline: 'เขย่ามือถือเสี่ยงเซียมซี เปิดดูใบทำนายของคุณ',
  // ADR-0040 renamed this page off the party shape, and the strings below describe the MECHANIC
  // (shake, draw, read) rather than claiming a solo experience. That distinction is deliberate: the
  // slip prompts in FORTUNES still address a group, so copy promising one person alone would be
  // contradicted by the deck itself. Rewriting the deck belongs to the 28-slip content ticket.
  seo: {
    title: 'เสี่ยงเซียมซีออนไลน์ — เขย่ามือถือ เปิดใบทำนาย ดูดวงฟรีบนเครื่องเดียว',
    description:
      'เสี่ยงเซียมซีออนไลน์ เขย่ามือถือแล้วเปิดใบทำนายพร้อมโจทย์สนุกๆ ดูได้ทันทีบนมือถือ ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'กด "เริ่มจั่วดวง" แล้วตั้งจิตถามเรื่องที่อยากรู้',
      'เขย่าเครื่อง หรือกดปุ่ม "จั่วดวง" ก็ได้',
      'เปิดอ่านใบเซียมซีที่ได้ พร้อมโจทย์ท้ายใบ',
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
