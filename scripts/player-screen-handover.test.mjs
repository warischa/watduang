// gh#272: the handover walk the pixel probe takes before it reads a play surface. Every way the walk
// can stop must come back as a named reason -- never as a silent success -- and the walk ends only on
// the ROUTE's acknowledgement, never on the screen closing (REFUTE round 1: a screen closes before it
// calls onStart, so an onStart that throws used to read as a handover).
import test from 'node:test';
import assert from 'node:assert/strict';
import { walkHandover, START_STATE, ACK_COUNT, HANDED_OVER } from './player-screen-handover.mjs';

/** A fake page: START_STATE and the handover read answer the next scripted state; ACK_COUNT answers
 *  `acks`. A string 'error:x' answers a failed read. */
function page({ start, handover, acks = 0 }) {
  const taps = [];
  const startQ = [...start];
  const handQ = [...handover];
  const handoverPrefix = HANDED_OVER(acks).slice(0, 40);
  const answer = (q) => {
    const next = q.length > 1 ? q.shift() : q[0];
    return typeof next === 'string' ? { error: next.slice(6) } : { value: next };
  };
  const evaluate = async (expr) => {
    if (expr === START_STATE) return answer(startQ);
    if (expr === ACK_COUNT) return typeof acks === 'string' ? { error: acks.slice(6) } : { value: acks };
    assert.equal(expr.slice(0, 40), handoverPrefix, 'the walk read something this fake page does not answer');
    return answer(handQ);
  };
  let t = 0;
  return { evaluate, tap: async (x, y) => { taps.push([x, y]); }, taps, wait: async (ms) => { t += ms; }, now: () => t };
}

const run = (p, capMs = 1000) => walkHandover({ evaluate: p.evaluate, tap: p.tap, armDelayMs: 400, capMs, wait: p.wait, now: p.now });

test('gh#272: a screen that arms, then a route that acknowledges, walks clean -- one touch at start', async () => {
  const p = page({ start: [{ state: 'start disabled' }, { state: 'ready', x: 10, y: 20 }], handover: [{ state: 'screen closed, handover not acknowledged' }, { state: 'ready' }] });
  assert.equal(await run(p), null);
  assert.deepEqual(p.taps, [[10, 20]]);
});

test('gh#272: every way the walk stops is a reason naming the step and the last state', async () => {
  for (const [what, start, handover, re, acks] of [
    ['screen never opened', [{ state: 'screen closed' }], [{ state: 'ready' }], /start becoming pressable never happened.*screen closed/],
    ['start stays held', [{ state: 'start disabled' }], [{ state: 'ready' }], /start becoming pressable.*start disabled/],
    ['start covered', [{ state: 'start covered by DIALOG' }], [{ state: 'ready' }], /covered by DIALOG/],
    ['the read fails', ['error:boom'], [{ state: 'ready' }], /the read failed \(boom\)/],
    ['the count cannot be read', [{ state: 'ready', x: 1, y: 1 }], [{ state: 'ready' }], /handover count could not be read \(gone\)/, 'error:gone'],
    // REFUTE round 1: the screen closed and the route never took the players.
    ['closed, never acknowledged', [{ state: 'ready', x: 1, y: 1 }], [{ state: 'screen closed, handover not acknowledged' }], /route acknowledging the players after start never happened.*screen closed, handover not acknowledged/],
  ]) {
    const p = page({ start, handover, acks });
    assert.match(await run(p) ?? 'NULL -- a silent success', re, what);
  }
  const p = page({ start: [{ state: 'ready', x: 1, y: 1 }], handover: [{ state: 'ready' }] });
  assert.match(await walkHandover({ evaluate: p.evaluate, tap: p.tap, armDelayMs: undefined, wait: p.wait, now: p.now }), /no usable arm delay/);
  assert.deepEqual(p.taps, [], 'a walk with no arm delay pressed anyway');
});

test('gh#272 REFUTE r1: on the REAL screen, an onStart that throws fails the walk by name -- both page reads run for real', async () => {
  const { makePage, installStorage, settle } = await import('../src/play/_player-screen/screen-harness.mjs');
  const ps = await import('../src/play/_player-screen/player-screen.ts');
  installStorage();
  const doc = makePage('<div id="app"><section id="root" hidden></section></div>');
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 390, innerHeight: 844 };
  const root = doc.getElementById('root');
  const outcomes = [];
  for (const [label, onStart] of [['accepts', () => {}], ['throws', () => { throw new Error('engine failed before accepting players'); }]]) {
    const screen = ps.mountPlayerScreen({ root, range: [2, 10], onStart, roundActive: () => false, abortRound() {} });
    await screen.open();
    const button = [...root.querySelectorAll('[data-ps="start"]')].at(-1);
    button.getBoundingClientRect = () => ({ left: 0, top: 0, width: 40, height: 40 });
    button.checkVisibility = () => !root.hidden;
    button.scrollIntoView = () => {};
    doc.elementFromPoint = () => button;
    const seen = [];
    const runner = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (e) => seen.push(e.message));
    try {
      const result = await walkHandover({
        armDelayMs: 400,
        capMs: 600,
        tap: async () => { assert.equal(button.click(), true, 'start was not live'); await settle(); },
        evaluate: async (body) => ({ value: await new Function('document', 'window', 'requestAnimationFrame',
          `return (async () => { ${body} })();`)(doc, globalThis.window, (fn) => setImmediate(fn)) }),
      });
      await settle();
      outcomes.push({ label, result, seen });
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const l of runner) process.on('unhandledRejection', l);
    }
    root.replaceChildren();
  }
  assert.equal(outcomes[0].result, null, 'POSITIVE CONTROL: a route that took its players did not walk clean');
  assert.match(outcomes[1].result ?? 'NULL -- a silent success', /never happened.*handover not acknowledged/, 'a throwing onStart read as a handover');
  assert.deepEqual(outcomes[1].seen, ['engine failed before accepting players'], 'the route failure was swallowed');
});
