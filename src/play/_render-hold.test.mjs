// The render hold, extracted from the shared player screen so a reveal that never mounts that screen can
// subscribe to it (gh#305). The player screen's own behaviour stays covered by its render-hold tests; this
// file proves the primitive alone, and that the screen re-exports the SAME functions, so every existing
// importer still reads one hold.
import test from 'node:test';
import assert from 'node:assert/strict';

function installHtml() {
  const attrs = new Map();
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
    // The player screen arms its gameplay roots on a release; this page has none.
    querySelectorAll: () => [],
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    },
  };
  return attrs;
}

test('acquire holds, release frees, and the listener sees each change once', async (t) => {
  const attrs = installHtml();
  const hold = await import('./_render-hold.ts');
  assert.equal(hold.isRenderHeld(), false, 'precondition: no holder yet');
  const seen = [];
  t.after(hold.onRenderHold((held) => seen.push(held)));
  const release = hold.acquireRenderHold();
  assert.equal(hold.isRenderHeld(), true);
  assert.equal(attrs.get(hold.RENDER_HOLD_ATTR), 'held');
  release();
  assert.equal(hold.isRenderHeld(), false);
  assert.equal(attrs.get(hold.RENDER_HOLD_ATTR), 'free');
  release();
  assert.deepEqual(seen, [true, false], 'a second release of the same hold reported a change');
});

test('two holders: one release cannot end the other hold', async (t) => {
  installHtml();
  const hold = await import('./_render-hold.ts');
  const seen = [];
  t.after(hold.onRenderHold((held) => seen.push(held)));
  const a = hold.acquireRenderHold();
  const b = hold.acquireRenderHold();
  a();
  a();
  assert.equal(hold.isRenderHeld(), true, 'releasing one holder twice ended the other hold');
  b();
  assert.equal(hold.isRenderHeld(), false);
  assert.deepEqual(seen, [true, false]);
});

test('an unsubscribed listener hears nothing more; a throwing listener does not stop the others', async () => {
  installHtml();
  const hold = await import('./_render-hold.ts');
  const seen = [];
  // The rethrow is queued on its own job: capture the queued jobs instead of letting them escape.
  const queued = [];
  const realQueue = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (job) => queued.push(job);
  const stopBad = hold.onRenderHold(() => {
    throw new Error('listener failed');
  });
  const stop = hold.onRenderHold((held) => seen.push(held));
  const release = hold.acquireRenderHold();
  stop();
  release();
  stopBad();
  globalThis.queueMicrotask = realQueue;
  const thrown = queued.map((job) => assert.throws(job, /listener failed/));
  assert.deepEqual(seen, [true], 'the listener after a throwing one was skipped, or heard after unsubscribe');
  assert.equal(thrown.length, 2, 'a listener failure was swallowed instead of rethrown on its own job');
});

test('the edge hook runs on every change, before the listeners', async (t) => {
  installHtml();
  const hold = await import('./_render-hold.ts');
  const order = [];
  hold.bindRenderHoldEdge((held) => order.push(`edge:${held}`));
  t.after(() => hold.bindRenderHoldEdge(null));
  t.after(hold.onRenderHold((held) => order.push(`listener:${held}`)));
  const release = hold.acquireRenderHold();
  release();
  assert.deepEqual(order, ['edge:true', 'listener:true', 'edge:false', 'listener:false']);
});

test('the player screen re-exports the very same hold, so every existing importer reads one state', async () => {
  installHtml();
  const hold = await import('./_render-hold.ts');
  const ps = await import('./_player-screen/player-screen.ts');
  assert.equal(ps.isRenderHeld, hold.isRenderHeld);
  assert.equal(ps.onRenderHold, hold.onRenderHold);
  assert.equal(ps.acquireRenderHold, hold.acquireRenderHold);
  assert.equal(ps.RENDER_HOLD_ATTR, hold.RENDER_HOLD_ATTR);
  const release = hold.acquireRenderHold();
  assert.equal(ps.isRenderHeld(), true, 'a hold taken outside the screen is invisible through the screen');
  release();
  await new Promise((r) => setTimeout(r, 0));
});

// ---- diagnostics (gh#305 REFUTE round 2): what the real module holds, for the browser probe ------------

test('diagnostics: each active registration with its instance, removed on unsubscribe', async () => {
  installHtml();
  const hold = await import('./_render-hold.ts');
  const base = hold.renderHoldDiagnostics().registrations.length;
  const offA = hold.onRenderHold(() => {}, 'host:a');
  const offB = hold.onRenderHold(() => {});
  let d = hold.renderHoldDiagnostics();
  assert.deepEqual(d.registrations.slice(base), [{ instance: 'host:a' }, { instance: null }]);
  offA();
  d = hold.renderHoldDiagnostics();
  assert.deepEqual(d.registrations.slice(base), [{ instance: null }], 'an unsubscribed registration is still reported');
  offB();
  assert.equal(hold.renderHoldDiagnostics().registrations.length, base);
  const release = hold.acquireRenderHold();
  assert.deepEqual([hold.renderHoldDiagnostics().held, hold.renderHoldDiagnostics().holders], [true, 1]);
  release();
  assert.deepEqual([hold.renderHoldDiagnostics().held, hold.renderHoldDiagnostics().holders], [false, 0]);
});

test('diagnostics are read-only: a snapshot is a copy, never the module state', async () => {
  installHtml();
  const hold = await import('./_render-hold.ts');
  const off = hold.onRenderHold(() => {}, 'host:x');
  const snap = hold.renderHoldDiagnostics();
  snap.registrations.length = 0;
  snap.registrations.push({ instance: 'forged' });
  snap.held = true;
  const again = hold.renderHoldDiagnostics();
  assert.ok(again.registrations.some((r) => r.instance === 'host:x'), 'editing a snapshot changed what the module reports');
  assert.ok(!again.registrations.some((r) => r.instance === 'forged'));
  assert.equal(again.held, false);
  off();
});

test('probe hooks: only an opted-in page object gets them, read-only, and they drive the real hold', async () => {
  installHtml();
  const hold = await import('./_render-hold.ts');
  const plain = {};
  hold.installProbeHooks(plain);
  assert.equal(plain[hold.RENDER_HOLD_PROBE_GLOBAL], undefined, 'hooks appeared on a page that never opted in');
  const optedOut = { [hold.RENDER_HOLD_PROBE_GLOBAL]: { enabled: false } };
  hold.installProbeHooks(optedOut);
  assert.equal(optedOut[hold.RENDER_HOLD_PROBE_GLOBAL].snapshot, undefined);
  const page = { [hold.RENDER_HOLD_PROBE_GLOBAL]: { enabled: true } };
  hold.installProbeHooks(page);
  const probe = page[hold.RENDER_HOLD_PROBE_GLOBAL];
  assert.equal(typeof probe.snapshot, 'function');
  assert.equal(typeof probe.acquire, 'function');
  assert.throws(() => { 'use strict'; probe.snapshot = () => ({ registrations: [{ instance: 'forged' }] }); }, TypeError, 'a page script could replace the snapshot');
  assert.throws(() => { 'use strict'; probe.acquire = () => () => {}; }, TypeError, 'a page script could replace acquire');
  const seen = [];
  const off = hold.onRenderHold((h) => seen.push(h), 'host:p');
  const release = probe.acquire();
  assert.equal(hold.isRenderHeld(), true, 'the probe acquire is not the real hold');
  assert.ok(probe.snapshot().registrations.some((r) => r.instance === 'host:p'));
  release();
  off();
  assert.deepEqual(seen, [true, false]);
});
