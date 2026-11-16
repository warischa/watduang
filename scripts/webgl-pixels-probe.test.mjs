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
import { classify, exitCodeFor, aggregate, resolveGLContext, judgeHold, RECORDER, measureRoute, REVEAL_DRIVERS, HOLD_EXERCISE, judgeHoldExercise, viewportFor, PHONE_VIEWPORT, WIDE_VIEWPORT, runRoute } from './webgl-pixels-probe.mjs';
import * as hold from '../src/play/_render-hold.ts';
import { loadDeclarations, renderPlayRoutes } from './render-suspension-check.mjs';
import { screenlessPlayPaths } from './play-screen-fit-probe.mjs';

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
const EXERCISE_MARK = '/* hold-exercise */';
const cleanExercise = (instance = null) => ({
  diagnostics: true, instance, phase: 'done', layerDuring: instance !== null, layerAfter: instance !== null,
  during: { held: true, holders: 1, registrations: [{ instance }] }, after: { held: false, holders: 0, registrations: [{ instance }] },
  drawsBefore: 6, heldDraws: 0, drawsAfter: 6,
});
function scriptedRoute({ rec, onReadback = () => {}, hold = 'free', exercise = null }) {
  const calls = [];
  const evaluate = async (body) => {
    if (body.includes('window.__holdRec; return r ?')) { calls.push('record'); return { value: JSON.parse(JSON.stringify(rec)) }; }
    if (body.includes("getAttribute('data-render-hold')")) return { value: hold };
    if (body.includes('const canvases =')) { calls.push('readback'); onReadback(rec); return { value: { contextLive: true, nonBlank: true } }; }
    if (body.includes(EXERCISE_MARK)) { calls.push('exercise'); return { value: exercise ?? cleanExercise() }; }
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
  assert.deepEqual(page.calls, ['record', 'exercise', 'readback', 'record'], 'the snapshot was not re-read after the readback');
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

// ---- gh#305: screenless routes (company-party) -----------------------------------------------------
const cleanRec = (extra = {}) => ({ installed: true, seenHeld: false, heldEnded: false, transitions: [], draws: 3, heldDraws: 0, webglContexts: 1, contextArgs: ['webgl2'], extensionRequests: {}, probeExtensionRequests: {}, webgpuRequests: 0, workers: 0, ...extra });

test('gh#305: a screenless route owes no held span, and everything else is still judged', () => {
  const sl = (rec, declaration = ADAPTER) => judgeHold({ route: 'r', declaration, rec, screenless: true, driven: true });
  assert.equal(sl(cleanRec()), null, 'POSITIVE CONTROL: a clean screenless adapter goes on to its readback');
  assert.equal(judgeHold({ route: 'r', declaration: ADAPTER, rec: cleanRec() }).verdict, 'UNMEASURED', 'a route WITH a screen still owes its held span');
  assert.equal(sl(cleanRec({ heldDraws: 1 })).verdict, 'FAIL', 'MUST-RED: a draw while held on a screenless route');
  assert.match(sl(cleanRec({ extensionRequests: { oes_texture_float_linear: 1 } }), { suspends: 'adapter', extensions: [] }).reason, /does not list: oes_texture_float_linear/, 'MUST-RED: an unlisted extension');
  assert.match(sl(cleanRec(), NONE).reason, /declared "none"/, 'MUST-RED: a context on a screenless route declared none');
  assert.equal(sl(cleanRec({ webglContexts: 0 }), NONE).verdict, 'PASS');
  assert.equal(judgeHold({ route: 'r', declaration: ADAPTER, rec: cleanRec(), screenless: true, driven: true, spanError: 'span' }).verdict, 'UNMEASURED');
});

function screenlessPage({ contextAfter = 0, onPress = () => {}, exercise = null } = {}) {
  const calls = [];
  const rec = cleanRec({ webglContexts: 0 });
  let polls = 0;
  const evaluate = async (body) => {
    if (body.includes('window.__holdRec; return r ?')) {
      calls.push('record');
      if (++polls > contextAfter && contextAfter >= 0) rec.webglContexts = Math.max(rec.webglContexts, contextAfter >= 0 ? 1 : 0);
      return { value: JSON.parse(JSON.stringify(rec)) };
    }
    if (body.includes("getAttribute('data-render-hold')")) { calls.push('hold'); return { value: null }; }
    if (body.includes('const canvases =')) { calls.push('readback'); return { value: { contextLive: true, nonBlank: true } }; }
    if (body.includes(EXERCISE_MARK)) { calls.push('exercise'); return { value: exercise ?? cleanExercise('prize-reveal:1') }; }
    throw new Error(`unscripted read: ${body.slice(0, 80)}`);
  };
  let t = 0;
  return { calls, rec, evaluate, onPress, wait: async (ms) => { t += ms; }, now: () => t };
}
const measureScreenless = (page, extra = {}) => measureRoute({
  route: 'r', url: 'u', declaration: ADAPTER, evaluate: page.evaluate, tap: async () => { throw new Error('a screenless row tapped a handover'); },
  armDelayMs: 400, settle: async () => null, wait: page.wait, now: page.now, contextCapMs: 1000, screenless: true, ...extra,
});

test('gh#305: a screenless adapter is driven to a live context before its readback, or is UNMEASURED by name', async () => {
  const ok = screenlessPage({ contextAfter: 2 });
  const row = await measureScreenless(ok, { driver: async () => { ok.calls.push('drive'); return null; } });
  assert.equal(row.verdict, 'PASS', `POSITIVE CONTROL: a driven reveal read back -- ${row.reason}`);
  assert.deepEqual(ok.calls.slice(0, 1), ['drive'], 'the driver did not run first');
  assert.ok(ok.calls.includes('readback'));
  const none = screenlessPage();
  const noDriver = await measureScreenless(none);
  assert.equal(noDriver.verdict, 'UNMEASURED', 'MUST-RED: a screenless adapter with no driver');
  assert.match(noDriver.reason, /no reveal driver/);
  assert.ok(!none.calls.includes('readback'), 'a cold page was read back');
  const stopped = await measureScreenless(screenlessPage(), { driver: async () => 'no armed .pr-go within 8000ms' });
  assert.match(stopped.reason, /its driver stopped: no armed \.pr-go/, 'MUST-RED: a driver that stops');
  const cold = screenlessPage({ contextAfter: -1 });
  const noContext = await measureScreenless(cold, { driver: async () => null });
  assert.equal(noContext.verdict, 'UNMEASURED', 'MUST-RED: a reveal that never creates a context');
  assert.match(noContext.reason, /created no WebGL context within 1000ms/);
  assert.ok(!cold.calls.includes('readback'));
});

test('gh#305: every screenless adapter the manifest and the declarations name has a reveal driver', async () => {
  const declarations = loadDeclarations();
  const screenless = screenlessPlayPaths();
  const routes = await renderPlayRoutes();
  const owed = routes.filter((g) => screenless.has(g.playRoute) && declarations[g.id]?.suspends === 'adapter').map((g) => g.id);
  assert.ok(owed.length > 0, 'no screenless adapter in the manifest: this test would pass vacuously');
  assert.deepEqual(owed.filter((id) => !REVEAL_DRIVERS[id]), [], 'a screenless adapter with no driver reds the WebGL lane as UNMEASURED');
  const screenlessIds = routes.filter((g) => screenless.has(g.playRoute)).map((g) => g.id);
  assert.deepEqual(Object.keys(REVEAL_DRIVERS).filter((id) => !screenlessIds.includes(id)), [], 'a driver for a route that is no screenless route is stale');
});

// ---- gh#305 REFUTE round 1: a supplied driver always runs before any verdict -----------------------
test('gh#305 REFUTE r1: a screenless route declared none with a driver runs it, and a renderer it starts is judged', async () => {
  // The reviewer's fixture: a cold page, a driver whose press would start the renderer.
  const page = screenlessPage({ contextAfter: -1 });
  let calls = 0;
  const driver = async () => { calls += 1; page.rec.webglContexts = 1; return null; };
  const row = await measureScreenless(page, { declaration: NONE, driver });
  assert.equal(calls, 1, 'MUST-RED: the driver was never invoked');
  assert.notEqual(row.verdict, 'PASS', 'MUST-RED: a renderer started by the driver escaped measurement');
  assert.match(row.reason, /declared "none"/, 'the context the press created is judged against the declaration');
  // POSITIVE CONTROL: a none route whose press starts no renderer passes, after its driver ran.
  const flat = screenlessPage({ contextAfter: -1 });
  let flatCalls = 0;
  const quiet = await measureScreenless(flat, { declaration: NONE, driver: async () => { flatCalls += 1; return null; } });
  assert.equal(flatCalls, 1);
  assert.equal(quiet.verdict, 'PASS', `POSITIVE CONTROL: ${quiet.reason}`);
});

test('gh#305 REFUTE r1: a screenless route is never judged without its driver having run', async () => {
  const noDriver = await measureScreenless(screenlessPage({ contextAfter: -1 }), { declaration: NONE });
  assert.equal(noDriver.verdict, 'UNMEASURED', 'MUST-RED: a cold screenless none route with no driver passed');
  assert.match(noDriver.reason, /no reveal driver/);
  const stopped = await measureScreenless(screenlessPage({ contextAfter: -1 }), { declaration: NONE, driver: async () => 'no armed .pr-go within 8000ms' });
  assert.equal(stopped.verdict, 'UNMEASURED', 'MUST-RED: a none route whose driver stopped passed');
  // The classifier itself: a screenless row that was not driven is never a pass, whatever it declares.
  const rec = cleanRec({ webglContexts: 0 });
  assert.equal(judgeHold({ route: 'r', declaration: NONE, rec, screenless: true }).verdict, 'UNMEASURED', 'MUST-RED: the classifier passed an undriven screenless row');
  assert.equal(judgeHold({ route: 'r', declaration: ADAPTER, rec: cleanRec(), screenless: true }).verdict, 'UNMEASURED', 'MUST-RED: the classifier sent an undriven adapter to readback');
  assert.equal(judgeHold({ route: 'r', declaration: NONE, rec, screenless: true, driven: true }).verdict, 'PASS', 'POSITIVE CONTROL: a driven none row with no context');
  assert.equal(judgeHold({ route: 'r', declaration: ADAPTER, rec: cleanRec(), screenless: true, driven: true }), null, 'POSITIVE CONTROL: a driven adapter goes on to readback');
});

test('gh#305 REFUTE r1: every screenless route, whatever it declares, has a reveal driver', async () => {
  const screenless = screenlessPlayPaths();
  const owed = (await renderPlayRoutes()).filter((g) => screenless.has(g.playRoute)).map((g) => g.id);
  assert.ok(owed.length > 0, 'no screenless route: this test would pass vacuously');
  assert.deepEqual(owed.filter((id) => !REVEAL_DRIVERS[id]), [], 'a screenless route with no driver cannot be measured');
});

// ---- gh#305 REFUTE round 2: every adapter is made to obey a REAL hold, through the shipped module ----------
// The exercise runs in the page against the hold module that shipped (its read-only probe hooks). Here it
// runs in a vm over the REAL src/play/_render-hold.ts and a fake renderer that draws on a timer unless its
// listener stopped it -- so each must-red is a renderer shape, not a hand-written exercise result.

const ATTR = 'data-render-hold';
const html = {
  attrs: new Map(),
  setAttribute(k, v) { this.attrs.set(k, String(v)); },
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
};
// The player screen (imported for its attribute name) arms gameplay roots on every release; there are none.
globalThis.document ??= { documentElement: html, querySelectorAll: () => [] };

/**
 * A page with one renderer. `register`: 'follows' (a listener that stops and restarts drawing), 'noop'
 * (registered, ignores the hold), 'never' (no subscription), 'immediate' (subscribes and unsubscribes at
 * once), 'unrelated' (another instance subscribes; this one never does), 'no-resume' (stops, never
 * restarts). `optIn` false leaves the page without diagnostics.
 */
function holdPage({ register = 'follows', optIn = true, layer = true, layerAfterMs = 0, drawAfterMs = 0, endAfterMs = null } = {}) {
  const doc = globalThis.document.documentElement;
  const rec = { draws: 0, heldDraws: 0 };
  const instance = 'prize-reveal:vm';
  let stopped = false;
  let ended = false;
  const t0 = Date.now();
  const offs = [];
  const timer = setInterval(() => {
    if (endAfterMs !== null && !ended && Date.now() - t0 >= endAfterMs) {
      // The reveal ends: its host leaves the hold, removes its layer and draws no more.
      ended = true;
      for (const off of offs.splice(0)) off();
    }
    if (stopped || ended || Date.now() - t0 < drawAfterMs) return;
    rec.draws += 1;
    if (doc.getAttribute(ATTR) === 'held') rec.heldDraws += 1;
  }, 2);
  if (register === 'follows') offs.push(hold.onRenderHold((h) => { stopped = h; }, instance));
  if (register === 'no-resume') offs.push(hold.onRenderHold((h) => { if (h) stopped = true; }, instance));
  if (register === 'noop') offs.push(hold.onRenderHold(() => {}, instance));
  if (register === 'immediate') hold.onRenderHold((h) => { stopped = h; }, instance)();
  if (register === 'unrelated') offs.push(hold.onRenderHold(() => {}, 'prize-reveal:other'));
  const box = {
    __holdRec: rec,
    document: {
      documentElement: doc,
      querySelector: (sel) => (layer && !ended && Date.now() - t0 >= layerAfterMs && sel === `[${hold.RENDER_HOLD_INSTANCE_ATTR}]` ? { isConnected: true, getAttribute: () => instance } : null),
    },
    setTimeout, clearTimeout, performance,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 2),
  };
  box.window = box;
  if (optIn) {
    box[hold.RENDER_HOLD_PROBE_GLOBAL] = { enabled: true };
    hold.installProbeHooks(box);
  }
  const ctx = vm.createContext(box);
  return {
    run: (capMs) => vm.runInContext(`(async () => { ${capMs === undefined ? HOLD_EXERCISE() : HOLD_EXERCISE(capMs)} })()`, ctx),
    close: () => { clearInterval(timer); for (const off of offs) off(); },
  };
}

async function exercised(opts, judgeOpts = {}, capMs = 600) {
  const page = holdPage(opts);
  try {
    const result = await page.run(capMs);
    return judgeHoldExercise({ route: 'r', result, requireInstance: true, ...judgeOpts });
  } finally {
    page.close();
  }
}

test('gh#305 REFUTE r2: POSITIVE CONTROL -- a renderer that follows a real hold stops while held and resumes', async () => {
  assert.equal(await exercised({ register: 'follows' }), null);
  assert.equal(hold.isRenderHeld(), false, 'the exercise left its hold up');
});

test('gh#305 REFUTE r2 MUST-RED: an active no-op listener -- registered, so a count would pass -- still draws while held', async () => {
  const r = await exercised({ register: 'noop' });
  assert.equal(r?.verdict, 'FAIL');
  assert.match(r.reason, /draw call\(s\) while a real hold was up/);
});

for (const [register, re] of [
  ['never', /no active hold registration/],
  ['immediate', /no active hold registration/],
  ['unrelated', /only another instance's registration/],
]) {
  test(`gh#305 REFUTE r2 MUST-RED: ${register === 'never' ? 'a dead subscription' : register === 'immediate' ? 'an immediate unsubscribe' : 'a listener registered by an unrelated instance'} FAILS`, async () => {
    const r = await exercised({ register });
    assert.equal(r?.verdict, 'FAIL');
    assert.match(r.reason, re);
  });
}

test('gh#305 REFUTE r2 MUST-RED: a renderer that stops for the hold but never resumes FAILS while still registered', async () => {
  const r = await exercised({ register: 'no-resume' });
  assert.equal(r?.verdict, 'FAIL');
  assert.match(r.reason, /did not resume/);
});

test('gh#305 REFUTE r2 MUST-RED: missing diagnostics, or no live layer naming the instance, is UNMEASURED', async () => {
  const noDiag = await exercised({ optIn: false });
  assert.equal(noDiag?.verdict, 'UNMEASURED');
  assert.match(noDiag.reason, /no render-hold diagnostics/);
  const noLayer = await exercised({ layer: false });
  assert.equal(noLayer?.verdict, 'UNMEASURED');
  assert.match(noLayer.reason, /no live renderer element names its hold instance/);
  // A route with a screen has no host layer: any active registration is accepted there, and the draw counts decide.
  assert.equal(await exercised({ layer: false }, { requireInstance: false }), null, 'POSITIVE CONTROL: an unscoped adapter that follows');
});

test('gh#305 REFUTE r2 MUST-RED: an exercise that never answered, or a page that drew nothing before the hold, is UNMEASURED', () => {
  assert.equal(judgeHoldExercise({ route: 'r', result: { error: 'context destroyed' } }).verdict, 'UNMEASURED');
  assert.equal(judgeHoldExercise({ route: 'r', result: null }).verdict, 'UNMEASURED');
  const idle = { ...cleanExercise('i'), drawsBefore: 0 };
  assert.match(judgeHoldExercise({ route: 'r', result: idle, requireInstance: true }).reason, /nothing drew/);
  const notHeld = { ...cleanExercise('i'), during: { held: false, holders: 0, registrations: [{ instance: 'i' }] } };
  assert.equal(judgeHoldExercise({ route: 'r', result: notHeld, requireInstance: true }).verdict, 'UNMEASURED');
  const ended = { ...cleanExercise('i'), drawsAfter: 0, after: { held: false, holders: 0, registrations: [] } };
  assert.match(judgeHoldExercise({ route: 'r', result: ended, requireInstance: true }).reason, /reveal ended during the exercise/);
});

test('gh#305 REFUTE r2: the recorder opts the page in before any script, and a page script cannot swap the opt-in', () => {
  const page = hookedPage();
  const slot = page.box[hold.RENDER_HOLD_PROBE_GLOBAL];
  assert.deepEqual({ ...slot }, { enabled: true });
  assert.throws(() => { page.box[hold.RENDER_HOLD_PROBE_GLOBAL] = { enabled: true, snapshot: () => ({}) }; }, TypeError);
});

test('gh#305 REFUTE r2: measureRoute exercises the hold on every adapter before its readback, and a failed exercise stops the row', async () => {
  const ok = scriptedRoute({ rec: settledRec() });
  const row = await measure(ok);
  assert.equal(row.verdict, 'PASS', `POSITIVE CONTROL: ${row.reason}`);
  assert.deepEqual(ok.calls, ['record', 'exercise', 'readback', 'record']);
  const noop = scriptedRoute({ rec: settledRec(), exercise: { ...cleanExercise(), heldDraws: 4 } });
  const bad = await measure(noop);
  assert.equal(bad.verdict, 'FAIL', 'MUST-RED: an adapter that draws under a real hold reached its readback');
  assert.ok(!noop.calls.includes('readback'));
  const nodiag = scriptedRoute({ rec: settledRec(), exercise: { diagnostics: false } });
  assert.equal((await measure(nodiag)).verdict, 'UNMEASURED', 'MUST-RED: missing diagnostics passed');
  // A screenless adapter must name its instance: an unrelated registration alone does not do.
  const sl = screenlessPage({ contextAfter: 1, exercise: { ...cleanExercise('prize-reveal:1'), during: { held: true, holders: 1, registrations: [{ instance: 'prize-reveal:9' }] } } });
  const slRow = await measureScreenless(sl, { driver: async () => null });
  assert.equal(slRow.verdict, 'FAIL', `MUST-RED: an unrelated instance's registration passed a screenless adapter -- ${slRow.reason}`);
  // A route declared none is never exercised: it has nothing to stop.
  const flat = screenlessPage({ contextAfter: -1 });
  await measureScreenless(flat, { declaration: NONE, driver: async () => null });
  assert.ok(!flat.calls.includes('exercise'));
});

// ---- gh#305 recheck (2026-11-13): a correct route measures every time --------------------------------------
// The lane's flake, reproduced locally: the press creates the WebGL context synchronously, so the probe began
// its exercise within milliseconds, while the host's layer appears only once the game and three load -- and
// the exercise read the layer ONCE, at its start. And a renderer that had not drawn yet inside one fixed
// 800ms window read as idle.

test('recheck MUST-RED: a live layer that appears after the exercise begins is still named', async () => {
  const page = holdPage({ register: 'follows', layerAfterMs: 150, drawAfterMs: 150 });
  try {
    const result = await page.run();
    assert.equal(result.instance, 'prize-reveal:vm', 'the exercise read the layer before the host had mounted it');
    assert.equal(judgeHoldExercise({ route: 'r', result, requireInstance: true }), null);
  } finally {
    page.close();
  }
});

test('recheck MUST-RED: a renderer whose first draw comes after the old fixed window is measured, not read as idle', async () => {
  const page = holdPage({ register: 'follows', drawAfterMs: 1100 });
  try {
    const result = await page.run();
    assert.ok(result.drawsBefore > 0, 'the exercise stopped waiting before the first draw');
    assert.equal(judgeHoldExercise({ route: 'r', result, requireInstance: true }), null);
  } finally {
    page.close();
  }
});

test('recheck: waiting is capped -- no layer, or no draw, by the cap is a retryable UNMEASURED, never a pass', async () => {
  const noLayer = await exercised({ layer: false }, {}, 200);
  assert.equal(noLayer.verdict, 'UNMEASURED');
  assert.equal(noLayer.retry, true);
  const silent = await exercised({ drawAfterMs: 10000 }, {}, 200);
  assert.equal(silent.verdict, 'UNMEASURED');
  assert.match(silent.reason, /nothing drew/);
  assert.equal(silent.retry, true);
});

test('recheck: a reveal that ends during the exercise is a retryable UNMEASURED -- never a FAIL, never a pass', async () => {
  // Ends while held (the hold goes up within a few ms and lasts about 100ms): the layer and the
  // registration go together, so this is no dead subscription.
  const r = await exercised({ endAfterMs: 40 }, {}, 600);
  assert.notEqual(r, null, 'a reveal that ended mid-exercise passed');
  assert.equal(r.verdict, 'UNMEASURED', `got ${r.verdict}: ${r.reason}`);
  assert.equal(r.retry, true);
  // A dead subscription on a live layer stays a FAIL, and is never retried.
  const dead = await exercised({ register: 'never' });
  assert.equal(dead.verdict, 'FAIL');
  assert.ok(!dead.retry);
});

function retryRoute(results) {
  const page = scriptedRoute({ rec: settledRec() });
  const base = page.evaluate;
  let n = 0;
  page.fresh = 0;
  page.evaluate = async (body) => (body.includes(EXERCISE_MARK) ? (page.calls.push('exercise'), { value: results[Math.min(n++, results.length - 1)] }) : base(body));
  return page;
}
const ended = () => ({ ...cleanExercise('prize-reveal:1'), phase: 'done', layerDuring: false, layerAfter: false, during: { held: true, holders: 1, registrations: [] }, drawsAfter: 0, after: { held: false, holders: 0, registrations: [] } });

test('recheck MUST-RED: a reveal that ends mid-exercise is re-measured once on a NEW reveal', async () => {
  const page = retryRoute([ended(), cleanExercise()]);
  const row = await measure(page, { fresh: async () => { page.fresh += 1; } });
  assert.equal(page.fresh, 1, 'no new reveal was started for the retry');
  assert.equal(row.verdict, 'PASS', `the retry on a new reveal did not measure: ${row.reason}`);
  assert.match(row.retriedAfter ?? '', /ended/);
});

test('recheck MUST-RED: a retry that still cannot measure is UNMEASURED, never PASS; a FAIL is never retried', async () => {
  const twice = retryRoute([ended(), ended()]);
  const row = await measure(twice, { fresh: async () => { twice.fresh += 1; } });
  assert.equal(twice.fresh, 1, 'retried more than once, or not at all');
  assert.equal(row.verdict, 'UNMEASURED');
  const noop = retryRoute([{ ...cleanExercise(), heldDraws: 3 }]);
  const failed = await measure(noop, { fresh: async () => { noop.fresh += 1; } });
  assert.equal(failed.verdict, 'FAIL');
  assert.equal(noop.fresh, 0, 'a failing route was retried -- a broken route could pass on its second go');
});

test('recheck: the cards demo is driven by one press, to its deal -- the reveal that does not need an exit first', async () => {
  const presses = [];
  const evaluate = async (body) => {
    if (body.includes('.pr-go')) { presses.push('press'); return { value: null }; }
    throw new Error(`unscripted: ${body.slice(0, 60)}`);
  };
  assert.equal(await REVEAL_DRIVERS['prize-cards']({ evaluate }), null);
  assert.equal(presses.length, 1, 'the driver went past the deal, through an exit the route policy reds');
  assert.match(await REVEAL_DRIVERS['prize-cards']({ evaluate: async () => ({ value: 'no armed .pr-go within 8000ms' }) }), /no armed/);
});

test('viewport: every prize reveal route is driven at a width where it draws 3D; every other route keeps the phone buffer', async () => {
  assert.ok(WIDE_VIEWPORT.width >= 640, 'below 640px a prize reveal runs the 2D path and creates no WebGL context');
  assert.equal(WIDE_VIEWPORT.mobile, false);
  assert.deepEqual(PHONE_VIEWPORT, { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const id of Object.keys(REVEAL_DRIVERS)) assert.deepEqual(viewportFor(id), WIDE_VIEWPORT, `${id} would be driven below 640px and read UNMEASURED`);
  const others = (await renderPlayRoutes()).map((g) => g.id).filter((id) => !REVEAL_DRIVERS[id]);
  assert.ok(others.length > 0);
  for (const id of others) assert.deepEqual(viewportFor(id), PHONE_VIEWPORT, `${id} left the phone buffer`);
});

// ---- the run's own dispatch and driver table, checked against the manifest -------------------------
// main() plans every manifest play route through runRoute: the viewport it sends, the driver it hands to
// measureRoute, and the screenless flag and declaration that decide MEASURED vs UNMEASURED are chosen
// there. These tests drive that production entry with a stub session, so a change to the route's setup --
// not just to its helpers -- is what reds them. Every expected value is computed from the source main()
// itself reads: src/games/manifest.ts through renderPlayRoutes for the route set and url, the category
// data through screenlessPlayPaths for the flag, src/play/_render-suspension.json through loadDeclarations
// for the declaration. Never a hand-typed list, never Object.keys(REVEAL_DRIVERS) as its own oracle.
const PROBE_BASE = 'http://localhost:4351';
const prizeGames = async () => (await renderPlayRoutes()).filter((g) => g.category === 'company-party');
const otherGames = async () => (await renderPlayRoutes()).filter((g) => g.category !== 'company-party');

/** What main() derives for one route, from the sources it derives them from. */
function expectedPlan(game) {
  return {
    url: new URL(game.playRoute, PROBE_BASE).href,
    screenless: screenlessPlayPaths().has(game.playRoute),
    suspends: loadDeclarations()[game.id]?.suspends,
  };
}

/** runRoute over a stub session: records the setup main performs, and the params it would measure with. */
async function plannedThroughRun(game) {
  const expected = expectedPlan(game);
  const calls = [];
  const session = {
    setViewport: async (viewport) => { calls.push(['viewport', viewport]); },
    clearStorage: async () => { calls.push(['clear']); },
    load: async (url) => { calls.push(['load', url]); },
    evaluate: async () => ({ value: null }),
    tap: async () => {},
  };
  let measured = null;
  const row = await runRoute({
    game, base: PROBE_BASE, declaration: loadDeclarations()[game.id], screenless: expected.screenless,
    session, armDelayMs: 1,
    measure: async (params) => { measured = params; return { route: game.id, verdict: 'PASS' }; },
  });
  return { calls, measured, row, expected };
}

/** The three fields that decide MEASURED vs UNMEASURED, each against the source main() reads. */
function assertMeasuredFromSources(game, measured, expected) {
  assert.equal(measured.url, expected.url, `${game.id} was measured at a url other than its manifest play route`);
  assert.equal(measured.screenless, expected.screenless, `${game.id} was measured with screenless=${measured.screenless}, but main computes ${expected.screenless}`);
  assert.equal(measured.declaration?.suspends, expected.suspends, `${game.id} was measured without the declaration its route id owns (${expected.suspends})`);
}

test('gh#305: the run drives every company-party prize route wide and every other play route at the phone buffer', async () => {
  // A swap of the two arms, or a collapse of the dispatch to one value, reds one of the two loops below.
  assert.notDeepEqual(WIDE_VIEWPORT, PHONE_VIEWPORT, 'the two viewports are identical, so the dispatch cannot be told apart');
  const prize = await prizeGames();
  const others = await otherGames();
  assert.ok(prize.length > 0, 'the manifest names no company-party play route: the wide side would pass vacuously');
  assert.ok(others.length > 0, 'the manifest names no non-prize play route: the phone side would pass vacuously');
  // The declaration comparison below is only meaningful if every route has one to lose.
  for (const game of [...prize, ...others]) {
    assert.match(String(expectedPlan(game).suspends), /^(adapter|none)$/, `${game.id} has no suspends declaration, so a run that dropped it would still match`);
  }
  for (const game of prize) {
    const { calls, measured, row, expected } = await plannedThroughRun(game);
    assert.equal(expected.screenless, true, `${game.id} is a company-party play route: the screenless flag main computes must be true here`);
    assert.deepEqual(calls[0], ['viewport', WIDE_VIEWPORT], `${game.id} is a prize reveal route but the run did not drive it wide`);
    assert.equal(typeof measured.driver, 'function', `${game.id} reached its measurement with no reveal driver from the table`);
    assert.equal(measured.driver, REVEAL_DRIVERS[game.id], `${game.id} was handed a driver other than its REVEAL_DRIVERS entry`);
    assert.equal(measured.route, game.id);
    assert.equal(row.route, game.id, 'runRoute did not return what measureRoute answered');
    assertMeasuredFromSources(game, measured, expected);
  }
  for (const game of others) {
    const { calls, measured, expected } = await plannedThroughRun(game);
    assert.equal(expected.screenless, false, `${game.id} is a party play route: the screenless flag main computes must be false here`);
    assert.deepEqual(calls[0], ['viewport', PHONE_VIEWPORT], `${game.id} is not a prize reveal route but the run left the phone buffer`);
    assert.equal(measured.driver, null, `${game.id} is not a reveal route but the run handed it a driver`);
    assertMeasuredFromSources(game, measured, expected);
  }
});

test('gh#305: REVEAL_DRIVERS names exactly the manifest\'s company-party reveal routes', async () => {
  const prize = (await prizeGames()).map((g) => g.id).sort();
  assert.ok(prize.length > 0, 'the manifest names no company-party play route: this test would pass vacuously');
  assert.deepEqual(Object.keys(REVEAL_DRIVERS).sort(), prize, 'a prize reveal route without a driver is never revealed, and a driver for any other route is stale');
});
