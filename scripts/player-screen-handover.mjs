// gh#272 -- walks the shared player screen's HANDOVER, so a probe that reads a play surface reads the
// play surface and not the screen in front of it.
//
// WHY THIS EXISTS. Since gh#272 the player screen holds rendering while it is up (player-screen.ts
// isRenderHeld): the WebGL routes draw nothing until its start hands the players over, and croc-bite
// does not even build its scene until then. Owner ruling 2026-10-17: a frozen background is
// acceptable. So a pixel read taken right after awaitPlayerScreenSettled reads a held surface -- blank,
// or no context at all -- and that is the intended behaviour, not a regression. A probe that means to
// measure the PLAY surface walks this handover first, the way a player does: first visit, the default
// players, the screen's own start control, pressed with a real touch at its centre.
//
// FAIL-LOUD. Every way the walk can stop -- the screen is not open, start never becomes pressable, the
// route never acknowledges the players -- returns a reason naming the step and the last state seen. The
// caller reports it against the route; a walk that fails is never a skipped row and never a pass.
//
// THE END OF THE WALK IS THE ROUTE'S ACKNOWLEDGEMENT, not the screen closing (gh#272 REFUTE round 1).
// The screen closes BEFORE it calls the route's onStart, so a closed screen says nothing about whether
// the route took the players: an onStart that throws leaves the screen closed and the round never
// started. The screen writes HANDOVER_ATTR only after onStart returned, as a count, so the walk waits
// for that count to move past the value it read before the touch.
//
// The attribute names are imported from the screen's own module, so they cannot drift from it.
import { HANDOVER_ATTR, SCREEN_ATTR } from '../src/play/_player-screen/player-screen.ts';

export const START_SELECTOR = '[data-ps="start"]';

/** The start control's readiness, read in the page. 'ready' means: the screen is open, start exists,
 *  is rendered, is not disabled (the arm gate owns `disabled`), and is the topmost thing at its own
 *  centre -- so the touch lands on it and not on a toast or a dialog. */
export const START_STATE = `
  const screen = document.documentElement.getAttribute('${SCREEN_ATTR}');
  if (screen !== 'open') return { state: 'screen ' + (screen ?? 'not mounted') };
  const el = document.querySelector('${START_SELECTOR}');
  if (!el) return { state: 'start missing' };
  const r0 = el.getBoundingClientRect();
  if (!(r0.width > 0.5 && r0.height > 0.5) || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
    return { state: 'start not visible' };
  }
  if (el.disabled) return { state: 'start disabled' };
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return { state: 'start off viewport' };
  const hit = document.elementFromPoint(x, y);
  if (!hit || !(hit === el || el.contains(hit))) return { state: 'start covered by ' + (hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : 'nothing') };
  return { state: 'ready', x, y };
`;

/** The handover count as it stands, before the touch. */
export const ACK_COUNT = `return Number(document.documentElement.getAttribute('${HANDOVER_ATTR}')) || 0;`;

/** Handed over: the route acknowledged a handover past `before`. */
export const HANDED_OVER = (before) => `
  const de = document.documentElement;
  const acks = Number(de.getAttribute('${HANDOVER_ATTR}')) || 0;
  if (acks > ${Number(before)}) return { state: 'ready' };
  return { state: 'screen ' + (de.getAttribute('${SCREEN_ATTR}') ?? 'not mounted') + ', handover not acknowledged' };
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `expr` until it reports 'ready'. Returns the ready value, or a reason naming `what`. */
async function until(evaluate, expr, what, { capMs, pollMs, wait, now }) {
  const deadline = now() + capMs;
  for (;;) {
    const res = await evaluate(expr);
    const v = res.error ? { state: `the read failed (${res.error})` } : (res.value ?? { state: 'no value' });
    if (v.state === 'ready') return { value: v };
    if (now() >= deadline) return { reason: `${what} never happened within ${capMs}ms (last state: ${v.state})` };
    await wait(pollMs);
  }
}

/** Walks the handover: waits out the arm window the open put on start, touches start, waits for the
 *  screen to close. null on success; otherwise the reason, naming the step that stopped. */
export async function walkHandover({ evaluate, tap, armDelayMs, capMs = 15000, pollMs = 100, wait = sleep, now = Date.now }) {
  if (!Number.isFinite(armDelayMs) || armDelayMs <= 0) {
    return `handover walk: no usable arm delay (got ${String(armDelayMs)}) -- it cannot know how long start stays held`;
  }
  const opts = { capMs, pollMs, wait, now };
  await wait(armDelayMs + 100);
  const start = await until(evaluate, START_STATE, 'handover walk: start becoming pressable', opts);
  if (start.reason) return start.reason;
  const counted = await evaluate(ACK_COUNT);
  if (counted.error) return `handover walk: the handover count could not be read (${counted.error})`;
  await tap(start.value.x, start.value.y);
  const acked = await until(evaluate, HANDED_OVER(counted.value), 'handover walk: the route acknowledging the players after start', opts);
  return acked.reason ?? null;
}
