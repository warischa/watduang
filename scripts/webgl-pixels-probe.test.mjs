// The verdict classifier, tested without a browser (ADR-0051's pixel readback for a WebGL route).
//
// The whole point of this probe is the THREE-way split: a two-way probe cannot tell "the feature is
// broken" from "the run was void", and on every lane this repo runs today the honest answer is
// UNMEASURED. So the mapping from (context live?, pixels non-blank?) to a verdict is a pure function
// and it is pinned here, where no GPU, no Chrome and no served dist can make it green by accident.
//
//   node --test 'scripts/webgl-pixels-probe.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { classify, exitCodeFor, aggregate, resolveGLContext, judgeHold, RECORDER, measureRoute } from './webgl-pixels-probe.mjs';

// A mock canvas modelling the ONE browser behaviour this resolution logic depends on: a canvas locks
// to the first context type it is ever handed and returns null for every other type after that
// (measured against a live headless Chrome running the lane's own flags -- see webgl-pixels-probe.mjs).
// 'webgl' and 'experimental-webgl' are the same family: a canvas that locked to one answers the other.
function mockCanvas(lockedType = null) {
  let locked = lockedType === 'experimental-webgl' ? 'webgl' : lockedType;
  return {
    getContext(type) {
      const family = type === 'experimental-webgl' ? 'webgl' : type;
      if (locked === null) { locked = family; return { family }; }
      return family === locked ? { family } : null;
    },
  };
}
// The readback's ORIGINAL resolution, before webgl2 was added -- kept here only to prove leg 1 red.
const originalResolve = (canvas) => canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

test('calibration leg 1 (red before the fix): a webgl2 canvas was invisible to the original resolution', () => {
  const canvas = mockCanvas('webgl2');
  assert.equal(originalResolve(canvas), null);
  // Which is exactly what fed contextLive: false into classify, and classify calls that UNMEASURED.
  assert.equal(classify({ contextLive: !!originalResolve(canvas), nonBlank: null }).verdict, 'UNMEASURED');
});

test('calibration leg 2 (green after the fix): resolveGLContext finds the same webgl2 canvas', () => {
  const canvas = mockCanvas('webgl2');
  const ctx = resolveGLContext(canvas);
  assert.notEqual(ctx, null);
  assert.equal(classify({ contextLive: !!ctx, nonBlank: null }).verdict, 'UNMEASURED'); // no frame read yet
  assert.equal(classify({ contextLive: !!ctx, nonBlank: true }).verdict, 'PASS'); // once a frame is read
});

test('calibration leg 3: a plain webgl canvas resolves the same before and after the fix', () => {
  for (const lockedType of ['webgl', 'experimental-webgl']) {
    const before = mockCanvas(lockedType);
    const after = mockCanvas(lockedType);
    assert.notEqual(originalResolve(before), null);
    assert.notEqual(resolveGLContext(after), null);
  }
});

test('calibration leg 4 (must-red unmoved): a canvas with no context at all still resolves to null', () => {
  const canvas = { getContext: () => null }; // no context of any type, ever
  assert.equal(resolveGLContext(canvas), null);
  assert.equal(classify({ contextLive: !!resolveGLContext(canvas), nonBlank: null }).verdict, 'UNMEASURED');
});

test('no live context is UNMEASURED, never a pass and never a failure', () => {
  assert.equal(classify({ contextLive: false, nonBlank: null }).verdict, 'UNMEASURED');
  // A dead context cannot be overruled by a pixel reading, whatever that reading claims.
  assert.equal(classify({ contextLive: false, nonBlank: true }).verdict, 'UNMEASURED');
  assert.equal(classify({ contextLive: false, nonBlank: false }).verdict, 'UNMEASURED');
});

// A readback that never answered at all — the CDP evaluate came back with no result envelope,
// which is what Chrome sends when a navigation destroys the execution context mid-read. The verdict
// is the same void it always was; the REASON is the thing under test. Blaming the runner's GPU for
// a destroyed context names a cause that is not there, and the next reader goes hunting a lane
// difference instead of a race.
test('an unanswered readback is UNMEASURED for its own reason, not for an absent GPU', () => {
  const r = classify({ contextLive: null, nonBlank: null, readError: 'Cannot find context with specified id' });
  assert.equal(r.verdict, 'UNMEASURED');
  assert.match(r.reason, /Cannot find context with specified id/);
  assert.doesNotMatch(r.reason, /no live WebGL context/, 'a failed read must not be reported as a measured absence');
});

test('the absent-GPU reason still belongs to a read that actually answered', () => {
  // The existing reading this must not weaken: the page answered, and its answer was "no context".
  assert.match(classify({ contextLive: false, nonBlank: null }).reason, /no live WebGL context/);
});

test('a live context that drew is PASS', () => {
  assert.equal(classify({ contextLive: true, nonBlank: true }).verdict, 'PASS');
});

test('a live context that stayed blank is FAIL', () => {
  assert.equal(classify({ contextLive: true, nonBlank: false }).verdict, 'FAIL');
});

test('a live context whose readback never happened is UNMEASURED, not PASS', () => {
  // The readback can be unavailable on a live context -- a lost context, or no animation frame ever
  // fired. That is a void reading, so it takes the void verdict rather than being read either way.
  assert.equal(classify({ contextLive: true, nonBlank: null }).verdict, 'UNMEASURED');
  assert.equal(classify({ contextLive: true }).verdict, 'UNMEASURED');
});

test('every verdict carries a reason', () => {
  for (const input of [
    { contextLive: false, nonBlank: null },
    { contextLive: true, nonBlank: true },
    { contextLive: true, nonBlank: false },
    { contextLive: true, nonBlank: null },
  ]) {
    assert.match(classify(input).reason, /\S/);
  }
});

test('exit codes keep the three states apart', () => {
  assert.equal(exitCodeFor('PASS'), 0);
  assert.equal(exitCodeFor('FAIL'), 1);
  assert.equal(exitCodeFor('UNMEASURED'), 2);
});

test('aggregate: a failure outranks a void reading, and a void reading outranks a pass', () => {
  assert.equal(aggregate(['PASS', 'PASS']), 'PASS');
  assert.equal(aggregate(['PASS', 'UNMEASURED']), 'UNMEASURED');
  assert.equal(aggregate(['UNMEASURED', 'FAIL']), 'FAIL');
  assert.equal(aggregate(['PASS', 'FAIL', 'UNMEASURED']), 'FAIL');
  // No route measured at all is UNMEASURED, not a pass by absence -- the same shape as a gate that
  // classifies nothing (ADR-0016), which is the one way this probe could go green measuring nothing.
  assert.equal(aggregate([]), 'UNMEASURED');
});

// ---- the render hold, gh#272 REFUTE round 1 -------------------------------------------------------
// The recorder is the page script itself, run in a vm over a fake page whose <html> attribute this
// file flips, so every counter-example the refute ran is replayed against the real text.

function hookedPage() {
  const attrs = new Map();
  const observers = [];
  const native = { draws: 0 };
  // Native-shaped extension objects: methods on a prototype, one object per name per context, so a
  // second request returns the SAME object, as getExtension does.
  class AngleInstancedArrays {
    drawArraysInstancedANGLE(mode, first, count, n) { native.draws += 1; return `drew ${n}`; }
    vertexAttribDivisorANGLE() { return 'divisor'; }
  }
  class MultiDraw { multiDrawArraysWEBGL() { native.draws += 1; } }
  const SUPPORTED = { angle_instanced_arrays: AngleInstancedArrays, webgl_multi_draw: MultiDraw, oes_texture_float: class {} };
  function getExtension(name) {
    const key = String(name).toLowerCase();
    const K = SUPPORTED[key];
    if (!K) return null;
    this.exts ??= new Map();
    if (!this.exts.has(key)) this.exts.set(key, new K());
    return this.exts.get(key);
  }
  class GL { drawArrays() { native.draws += 1; return 'core'; } }
  GL.prototype.getExtension = getExtension;
  class GL2 { drawElements() { native.draws += 1; } }
  GL2.prototype.getExtension = getExtension;
  class Canvas {
    constructor(kind) { this.kind = kind; this.ctx = null; }
    getContext(type) {
      if (this.ctx) return this.ctx.type === type ? this.ctx : null;
      if (type === 'webgl' || type === 'experimental-webgl') this.ctx = Object.assign(new GL(), { type });
      else if (type === 'webgl2') this.ctx = Object.assign(new GL2(), { type });
      else if (type === '2d') this.ctx = { type };
      return this.ctx;
    }
  }
  const documentElement = { getAttribute: (k) => attrs.get(k) ?? null };
  class MutationObserver {
    constructor(fn) { this.fn = fn; }
    observe() { observers.push(this); }
  }
  const gpuRequests = [];
  const gpu = { requestAdapter: async () => { gpuRequests.push(1); return null; } };
  const workers = [];
  class Worker { constructor(url) { this.url = url; workers.push(url); } }
  const box = {
    WebGLRenderingContext: GL, WebGL2RenderingContext: GL2, HTMLCanvasElement: Canvas, MutationObserver,
    document: { documentElement }, navigator: { gpu }, Worker,
  };
  box.window = box;
  box.self = box;
  vm.runInContext(RECORDER, vm.createContext(box));
  /** One attribute write, delivered to the observer as the browser does: a record with the OLD value. */
  const setHold = (value) => {
    const oldValue = attrs.get('data-render-hold') ?? null;
    attrs.set('data-render-hold', value);
    for (const o of observers) o.fn([{ target: documentElement, oldValue }]);
  };
  /** Several writes in one task, delivered as ONE batch, as an observer sees them. */
  const setHoldBatch = (values) => {
    const recs = values.map((value) => {
      const oldValue = attrs.get('data-render-hold') ?? null;
      attrs.set('data-render-hold', value);
      return { target: documentElement, oldValue };
    });
    for (const o of observers) o.fn(recs);
  };
  return { rec: box.__holdRec, box, Canvas, setHold, setHoldBatch, native, gpuRequests, workers };
}

const ADAPTER = { suspends: 'adapter' };
const NONE = { suspends: 'none', reason: 'draws with Canvas2D only' };
const judge = (page, declaration = ADAPTER, spanError = null) => judgeHold({ route: 'r', declaration, rec: JSON.parse(JSON.stringify(page.rec)), spanError });

test('gh#272: POSITIVE CONTROL -- held, no draw while held, observed free: an adapter goes on to its readback, a 2D route passes', () => {
  const page = hookedPage();
  const gl = new page.Canvas().getContext('webgl');
  gl.drawArrays();
  page.setHold('held');
  page.setHold('free');
  gl.drawArrays();
  assert.equal(page.rec.draws, 2);
  assert.equal(judge(page), null);
  const flat = hookedPage();
  flat.setHold('held');
  flat.setHold('free');
  assert.equal(judge(flat, NONE).verdict, 'PASS');
});

test('gh#272 REFUTE r1: a draw while held FAILS -- before any window would have opened, and on frame 31 alike', () => {
  const early = hookedPage();
  const gl = new early.Canvas().getContext('webgl');
  early.setHold('held');
  gl.drawArrays(); // the first thing after the hold, before any counting window
  early.setHold('free');
  assert.match(judge(early).reason, /1 WebGL draw call\(s\) while the page read held/);
  const late = hookedPage();
  const gl2 = new late.Canvas().getContext('webgl2');
  late.setHold('held');
  for (let frame = 1; frame <= 31; frame += 1) if (frame === 31) gl2.drawElements();
  late.setHold('free');
  assert.equal(judge(late).verdict, 'FAIL', 'a draw resumed on frame 31 while still held was missed');
});

test('gh#272 REFUTE r1: a hold never read held, or never seen to end, is UNMEASURED -- two absent readings are not evidence', () => {
  assert.equal(judge(hookedPage()).verdict, 'UNMEASURED', 'a page that never read held passed');
  assert.match(judge(hookedPage()).reason, /never read held/);
  const stuck = hookedPage();
  stuck.setHold('held');
  assert.match(judge(stuck).reason, /never seen to end in free/);
  const timedOut = hookedPage();
  timedOut.setHold('held');
  timedOut.setHold('free');
  assert.equal(judge(timedOut, ADAPTER, 'the held span did not end in an observed free within 15000ms').verdict, 'UNMEASURED', 'a span that ended by timeout counted as evidence');
  // One observer batch holding held then free still reads as a hold that was seen and ended.
  const batched = hookedPage();
  batched.setHoldBatch(['held', 'free']);
  assert.deepEqual([...batched.rec.transitions], ['held', 'free']);
  assert.equal(judge(batched), null);
  assert.equal(judgeHold({ route: 'r', declaration: ADAPTER, rec: null }).verdict, 'UNMEASURED');
  assert.equal(judgeHold({ route: 'r', declaration: ADAPTER, rec: { installed: false } }).verdict, 'UNMEASURED');
});

test('gh#272 REFUTE r1: a WebGL context on a route declared none FAILS by name, whatever expression asked for it', () => {
  const page = hookedPage();
  const kind = ['web', 'gl'].join('');
  new page.Canvas().getContext(kind);
  new page.Canvas().getContext('2d');
  page.setHold('held');
  page.setHold('free');
  assert.equal(page.rec.webglContexts, 1, 'a context asked for through an expression was not counted, or a 2d one was');
  const r = judge(page, NONE);
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.reason, /r created 1 WebGL context\(s\) but is declared "none"/);
  assert.equal(judge(page, ADAPTER), null, 'the same context on a declared adapter is that route\'s business');
  assert.match(judgeHold({ route: 'x', declaration: undefined, rec: page.rec }).reason, /x has no entry/);
});

// ---- gh#272 REFUTE round 2 ---------------------------------------------------------------------------

test('gh#272 REFUTE r2 F3: an extension draw while held is counted, natively, once per call -- identity and return values kept', () => {
  const page = hookedPage();
  const gl = new page.Canvas().getContext('webgl');
  const ext = gl.getExtension('ANGLE_instanced_arrays');
  assert.equal(gl.getExtension('angle_instanced_arrays'), ext, 'a second request no longer returns the same object');
  page.setHold('held');
  assert.equal(ext.drawArraysInstancedANGLE(4, 0, 3, 2), 'drew 2', 'the native return value was lost');
  assert.equal(ext.vertexAttribDivisorANGLE(), 'divisor', 'a non-draw method was disturbed');
  page.setHold('free');
  ext.drawArraysInstancedANGLE(4, 0, 3, 1);
  assert.equal(page.native.draws, 2, 'the native draw did not run, or ran twice');
  assert.equal(page.rec.draws, 2, 'an extension draw was counted other than once -- double-wrapped, or not at all');
  assert.equal(page.rec.heldDraws, 1);
  const r = judge(page, { suspends: 'adapter', extensions: ['angle_instanced_arrays'] });
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.reason, /1 WebGL draw call\(s\) while the page read held/);
  const multi = hookedPage();
  const md = new multi.Canvas().getContext('webgl2').getExtension('WEBGL_multi_draw');
  multi.setHold('held');
  md.multiDrawArraysWEBGL();
  assert.equal(multi.rec.heldDraws, 1, 'a multi-draw while held was missed');
});

test('gh#272 REFUTE r2 F3: under STUB_DRAW an extension draw is silenced like a core one, and still counted', () => {
  const page = hookedPage();
  const gl = new page.Canvas().getContext('webgl');
  const ext = gl.getExtension('ANGLE_instanced_arrays');
  page.rec.stubDraw = true;
  ext.drawArraysInstancedANGLE(4, 0, 3, 1);
  gl.drawArrays();
  assert.equal(page.native.draws, 0, 'a stubbed draw still reached the native method');
  assert.equal(page.rec.draws, 2);
});

test('gh#272 REFUTE r2 F3: an extension the policy does not list FAILS by name -- requested in any case, supported or not, caught or not', () => {
  const page = hookedPage();
  const gl = new page.Canvas().getContext('webgl');
  page.setHold('held');
  page.setHold('free');
  gl.getExtension('OES_texture_float');
  try { gl.getExtension('EXT_does_not_exist'); } catch { /* a route that swallows the answer */ }
  const policy = { suspends: 'adapter', extensions: ['oes_texture_float'] };
  assert.equal(judge(page, policy).verdict, 'FAIL');
  assert.match(judge(page, policy).reason, /requested WebGL extension\(s\) its policy does not list: ext_does_not_exist/);
  assert.equal(judge(page, { suspends: 'adapter', extensions: ['oes_texture_float', 'ext_does_not_exist'] }), null, 'POSITIVE CONTROL: the same requests, all listed');
  // The probe's own request is booked apart, never charged.
  const probe = hookedPage();
  const pgl = new probe.Canvas().getContext('webgl');
  probe.setHold('held');
  probe.setHold('free');
  probe.rec.probeDepth += 1;
  pgl.getExtension('WEBGL_debug_renderer_info');
  probe.rec.probeDepth -= 1;
  assert.deepEqual(Object.keys(probe.rec.probeExtensionRequests), ['webgl_debug_renderer_info']);
  assert.equal(judge(probe, { suspends: 'adapter', extensions: [] }), null, 'the probe was charged for its own request');
});

test('gh#272 REFUTE r2 F3: a WebGPU request on any route, and a worker on an adapter route, FAIL unless the policy permits them', () => {
  const page = hookedPage();
  page.setHold('held');
  page.setHold('free');
  new page.Canvas().getContext('webgpu');
  page.box.navigator.gpu.requestAdapter();
  assert.equal(page.gpuRequests.length, 1, 'the native requestAdapter did not run');
  assert.equal(page.rec.webgpuRequests, 2);
  assert.match(judge(page, NONE).reason, /asked for WebGPU 2 time\(s\)/);
  assert.equal(judge(page, { ...NONE, webgpu: true }).verdict, 'PASS', 'POSITIVE CONTROL: a permitted WebGPU route');
  const w = hookedPage();
  w.setHold('held');
  w.setHold('free');
  const worker = new w.box.Worker('render.js');
  assert.equal(worker.url, 'render.js', 'the native Worker was not constructed');
  assert.equal(w.rec.workers, 1);
  assert.match(judge(w, ADAPTER).reason, /created 1 worker\(s\) on an adapter route/);
  assert.equal(judge(w, { ...ADAPTER, workers: true }), null, 'POSITIVE CONTROL: a permitted worker');
  assert.equal(judge(w, NONE).verdict, 'PASS', 'a worker on a 2D route is not this policy');
});

test('gh#272 REFUTE r2 F1: held, free, held again with no final free is UNMEASURED -- an earlier free proves nothing', () => {
  const page = hookedPage();
  page.setHold('held');
  page.setHold('free');
  page.setHold('held');
  const r = judge(page);
  assert.equal(r.verdict, 'UNMEASURED');
  assert.match(r.reason, /latest held span was never seen to end in free \(transitions: held>free>held\)/);
  page.setHold('free');
  assert.equal(judge(page), null, 'POSITIVE CONTROL: the second span ended');
});

// measureRoute over a scripted page: the order, and the snapshot it judges.
function scriptedRoute({ rec, onReadback = () => {}, hold = 'free' }) {
  const calls = [];
  const evaluate = async (body) => {
    if (body.includes('window.__holdRec; return r ?')) { calls.push('record'); return { value: JSON.parse(JSON.stringify(rec)) }; }
    if (body.includes("getAttribute('data-render-hold')")) return { value: hold };
    if (body.includes('const canvases =')) { calls.push('readback'); onReadback(rec); return { value: { contextLive: true, nonBlank: true } }; }
    throw new Error(`unscripted read: ${body.slice(0, 80)}`);
  };
  let t = 0;
  return { calls, evaluate, wait: async (ms) => { t += ms; }, now: () => t };
}
const measure = (page, extra = {}) => measureRoute({
  route: 'r', url: 'u', declaration: ADAPTER, evaluate: page.evaluate, tap: async () => {}, armDelayMs: 400,
  settle: async () => null, wait: page.wait, now: page.now, spanCapMs: 1000, ...extra,
});
const settledRec = () => ({ installed: true, seenHeld: true, heldEnded: true, transitions: ['held', 'free'], draws: 0, heldDraws: 0, webglContexts: 1, contextArgs: ['webgl'], extensionRequests: {}, probeExtensionRequests: {}, webgpuRequests: 0, workers: 0 });

test('gh#272 REFUTE r2 F2: a held draw during the readback is in the FINAL snapshot and FAILS the row', async () => {
  const clean = scriptedRoute({ rec: settledRec() });
  assert.equal((await measure(clean)).verdict, 'PASS', 'POSITIVE CONTROL: a clean adapter row');
  const page = scriptedRoute({
    rec: settledRec(),
    onReadback: (rec) => { rec.transitions.push('held'); rec.heldDraws += 1; rec.draws += 1; rec.transitions.push('free'); },
  });
  const row = await measure(page);
  assert.deepEqual(page.calls, ['record', 'readback', 'record'], 'the snapshot was not re-read after the readback');
  assert.equal(row.verdict, 'FAIL');
  assert.equal(row.hold.heldDraws, 1, 'the row reports the snapshot from before the readback');
  const unlisted = scriptedRoute({ rec: settledRec(), onReadback: (rec) => { rec.extensionRequests.oes_texture_float = 1; } });
  assert.match((await measure(unlisted)).reason, /does not list: oes_texture_float/, 'a request made during the measurement escaped the final judgement');
});

test('gh#272 REFUTE r2 F1: measureRoute waits for the LATEST span and reports UNMEASURED when it never ends', async () => {
  const rec = { ...settledRec(), heldEnded: false, transitions: ['held', 'free', 'held'] };
  const page = scriptedRoute({ rec });
  const row = await measure(page);
  assert.equal(row.verdict, 'UNMEASURED');
  assert.match(row.reason, /latest held span did not end in an observed free within 1000ms/);
  assert.ok(!page.calls.includes('readback'), 'the surface was read with a hold still up');
});
