// Does a WebGL play surface actually DRAW? (ADR-0051's pixel readback, for the routes that took the
// owner's 2026-08-30 permission to use WebGL.)
//
// THREE outcomes, and the third is the reason this file exists. A canvas that renders nothing is
// indistinguishable from a working one from every other gate here: the build passes, the types pass,
// the DOM gates pass, the layout probes pass. On a lane where getContext('webgl') returns null the
// engine takes its unsupported branch and there is no drawing surface to read at all, so a two-way
// probe on that lane reports a pass while measuring nothing.
//
// This comment used to say every browser lane this repo runs launches Chrome with the GPU disabled
// and therefore has no context. That is true of `--disable-gpu` ON A MAC only. On the CI runner the
// same flag leaves the context LIVE, measured in-page on run 34458877355:
// `IN_PAGE_CONTEXT webgl2=live webgl=live experimental-webgl=live 2d=live`. WHY the runner has one
// is explicitly NOT known. So the lane a run took decides whether this probe measured anything --
// assert a live context IN the page rather than inferring it from the flag names.
//
// The readback resolves BOTH WebGL context families a route's engine might claim -- plain 'webgl' (the
// two routes shipped today) and 'webgl2' (needed the day a route's renderer requests it only, e.g. an
// engine built on `three`). A canvas locks to whichever type it is handed first and returns null for
// every other type after that, so the two families cannot share one getContext call; resolveGLContext
// tries 'webgl' first and 'webgl2' last, which keeps today's routes resolving exactly as before.
//
//   UNMEASURED  no live WebGL context on this runner  -> exit 2. Not a pass and not a failure.
//   PASS        a live context, and the canvas drew   -> exit 0.
//   FAIL        a live context, and the canvas is blank -> exit 1.
//
// UNMEASURED is never relaxed into a pass. The lane that runs this is the lane that supplies a
// software rasteriser; on that lane an UNMEASURED means the instrument changed, which is a thing to
// surface, not to swallow (docs/agents/ci-verification.md, and the same shape the play-exit guard
// already uses).
//
//   npx serve dist -l 4351
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-sandbox \
//     --use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=9333 \
//     --user-data-dir=/tmp/prof-webgl
//   BASE=http://localhost:4351 CDP_PORT=9333 node scripts/webgl-pixels-probe.mjs
//
// scripts/webgl-pixels-lane.sh does all of that and is what CI runs.
//
// CALIBRATION, not optional, and NOT a manual step any more -- a probe's first green proves nothing
// until it has failed once, and a calibration proved by hand on one laptop stops being evidence the
// moment anybody edits this file. STUB_DRAW=1 no-ops the draw calls on WebGLRenderingContext.prototype
// after the context is live, so the engine keeps clearing and stops drawing; with a live context that
// run MUST report FAIL. scripts/webgl-pixels-lane.sh runs it as its own stub-control leg on every CI
// run and reds when it does not go red, so loosening the `out.nonBlank` decision below cannot leave a
// green lane behind it.
// The third state has no leg of its own: a run against a --disable-gpu Chrome MUST report UNMEASURED,
// and that stays a knob (WEBGL_PROBE_CHROME_FLAGS) plus the classifier tests, because --disable-gpu
// means a SECOND Chrome and a control in a second browser calibrates a second environment.
//
// EVERY PARTY PLAY ROUTE, AND THE RENDER HOLD (gh#272, REFUTE round 1). The shared player screen
// holds rendering from its mount until its handover, and says so on <html> (player-screen.ts
// RENDER_HOLD_ATTR, 'held' / 'free'). Which routes use WebGL is decided HERE, in the browser, never by
// reading source: a recorder installed before the page's own script counts every WebGL context the
// page creates -- judged by what getContext RETURNED, so no expression for the context type hides
// one -- and every WebGL draw call made while <html> reads 'held'. Every party play route is loaded as
// a first visit, and in order:
//   1. a route whose hold still reads 'held' once the screen has settled is walked through its
//      handover (scripts/player-screen-handover.mjs) -- default players, the screen's own start, a real
//      touch -- and the walk ends only when the route ACKNOWLEDGED the players (HANDOVER_ATTR, written
//      after onStart returned). A walk that stops is an UNMEASURED row naming the step, and the
//      surface is never read back;
//   2. the held span must end in an OBSERVED 'free'. One never seen 'held', or never seen to end, is
//      UNMEASURED: two absent readings are not evidence of a hold;
//   3. any draw while held FAILS; a WebGL context on a route src/play/_render-suspension.json declares
//      "none" FAILS by name;
//   4. only a route declared "adapter" is then read back, as below -- the readback asks for a context
//      itself, so it never runs on a route that made none.
// POLICY (gh#272 REFUTE round 2, re-fork B): each route's entry also lists the WebGL extensions it
// may request. The recorder books every getExtension request by name and wraps the draw methods of
// every extension object it hands out, so an instanced or multi-draw call counts against the hold like
// a core one. An unlisted request FAILS by name, even one the route caught. A WebGPU request on any
// route, and a Worker or SharedWorker on an adapter route, FAIL unless the entry permits them -- none
// does -- because a draw there happens where this recorder cannot count it.
// THE BOUNDARY, stated: the recorder runs in this document's own realm. Another document -- an iframe,
// a popup -- is a realm it does not reach and is neither counted nor refused here; no party play
// route ships one today. And a context a route creates only later in a round, past where this walk
// stops, is not seen.
import { fileURLToPath } from 'node:url';
import { evaluateResult } from './cdp-evaluate-result.mjs';
import { awaitPlayerScreenSettled } from './play-screen-fit-probe.mjs';
import { walkHandover } from './player-screen-handover.mjs';
import { loadDeclarations, partyPlayRoutes } from './render-suspension-check.mjs';
import { RENDER_HOLD_ATTR } from '../src/play/_player-screen/player-screen.ts';

// ---- the verdict classifier ---------------------------------------------------------------------
// Pure, and pinned by scripts/webgl-pixels-probe.test.mjs without a browser: this mapping is the
// whole product of the probe, and it must not be provable only by the apparatus it governs.

/** (context live?, pixels non-blank?) -> one of the three states. `nonBlank` null means the readback
 *  itself never happened -- a lost context, or no animation frame inside the deadline. That is a void
 *  reading on a live context, and a void reading takes the void verdict rather than being guessed
 *  either way. */
export function classify({ contextLive, nonBlank = null, readError = null }) {
  if (readError) {
    return { verdict: 'UNMEASURED', reason: `the readback never answered (${readError}) -- this says nothing about the runner's GPU` };
  }
  if (contextLive !== true) {
    return { verdict: 'UNMEASURED', reason: 'no live WebGL context on this runner -- nothing to read back' };
  }
  if (nonBlank === true) return { verdict: 'PASS', reason: 'live context, and the canvas drew' };
  if (nonBlank === false) return { verdict: 'FAIL', reason: 'live context, and the canvas is blank' };
  return { verdict: 'UNMEASURED', reason: 'live context, but the readback never happened' };
}

export function exitCodeFor(verdict) {
  return { PASS: 0, FAIL: 1, UNMEASURED: 2 }[verdict] ?? 2;
}

/** A failure outranks a void reading, and a void reading outranks a pass. An EMPTY set is UNMEASURED
 *  rather than PASS: a run that classified nothing is exactly the gate that cannot fail. */
export function aggregate(verdicts) {
  if (verdicts.includes('FAIL')) return 'FAIL';
  if (verdicts.length === 0 || verdicts.includes('UNMEASURED')) return 'UNMEASURED';
  return 'PASS';
}

// ---- the render hold (gh#272) -------------------------------------------------------------------

const norm = (name) => String(name).toLowerCase();

/** What a recorder snapshot shows a route doing against its entry in src/play/_render-suspension.json
 *  -- each one definite, whatever the hold did, and each named:
 *    - a WebGL context on a route declared "none";
 *    - a WebGL extension requested that the entry's `extensions` does not list (case-normalized), even
 *      if the request failed or the route caught what it threw. The probe's own requests are booked
 *      apart and never charged;
 *    - a WebGPU request (getContext('webgpu') or navigator.gpu.requestAdapter) without `webgpu: true`;
 *    - a Worker or SharedWorker on an adapter route without `workers: true` -- a worker draws in a
 *      realm this recorder does not reach. */
export function policyViolations({ route, declaration, rec }) {
  const out = [];
  const adapter = declaration.suspends === 'adapter';
  if (rec.webglContexts > 0 && !adapter) {
    out.push(`${route} created ${rec.webglContexts} WebGL context(s) but is declared "${declaration.suspends}" in src/play/_render-suspension.json -- a WebGL route must follow the hold`);
  }
  const permitted = new Set((declaration.extensions ?? []).map(norm));
  const unlisted = Object.keys(rec.extensionRequests ?? {}).map(norm).filter((n) => !permitted.has(n)).sort();
  if (unlisted.length) out.push(`${route} requested WebGL extension(s) its policy does not list: ${unlisted.join(', ')}`);
  if (rec.webgpuRequests > 0 && declaration.webgpu !== true) {
    out.push(`${route} asked for WebGPU ${rec.webgpuRequests} time(s), which its policy does not permit`);
  }
  if (rec.workers > 0 && adapter && declaration.workers !== true) {
    out.push(`${route} created ${rec.workers} worker(s) on an adapter route, which its policy does not permit -- a worker renders where this recorder cannot count`);
  }
  return out;
}

/** What the recorder and the walk saw on one route -> null when the route goes on to its next step,
 *  or the row's verdict. Definite failures first -- a draw while held, a policy violation -- then the
 *  readings that would leave the hold unproven: never held, or the LATEST held span not seen to end
 *  (an earlier free proves nothing about a hold that came back). */
export function judgeHold({ route, declaration, rec, spanError = null }) {
  if (!declaration) return { verdict: 'FAIL', reason: `${route} has no entry in src/play/_render-suspension.json` };
  if (!rec || rec.installed !== true) return { verdict: 'UNMEASURED', reason: 'the hold recorder was never installed, so nothing was counted' };
  if (rec.heldDraws > 0) return { verdict: 'FAIL', reason: `${rec.heldDraws} WebGL draw call(s) while the page read held (gh#272)` };
  const violations = policyViolations({ route, declaration, rec });
  if (violations.length) return { verdict: 'FAIL', reason: violations.join('; ') };
  if (rec.seenHeld !== true) return { verdict: 'UNMEASURED', reason: 'the page never read held -- no hold was observed, so no draw count means anything' };
  if (spanError) return { verdict: 'UNMEASURED', reason: spanError };
  if (rec.heldEnded !== true) {
    return { verdict: 'UNMEASURED', reason: `the latest held span was never seen to end in free (transitions: ${(rec.transitions ?? []).join('>')})` };
  }
  if (declaration.suspends !== 'adapter') return { verdict: 'PASS', reason: 'no WebGL context created, and no draw while held' };
  return null;
}

/** Installed before the page's own script on every document.
 *  DRAWS: every draw entry point -- the core ones on both WebGL prototypes, and those of every
 *  extension object getExtension hands out (ANGLE_instanced_arrays, WEBGL_multi_draw and the like),
 *  wrapped once per object before it is returned, so identity and return values stay native. Each
 *  call is counted, and counted as HELD when <html> reads held at the moment of the call -- read
 *  synchronously, so no observer delivery can misplace one -- and each obeys `stubDraw`, which is
 *  how the STUB_DRAW leg silences core and extension draws alike while they are still counted.
 *  CONTEXTS: every context getContext hands out is judged by what it IS, whatever expression asked
 *  for it, on HTMLCanvasElement and OffscreenCanvas both.
 *  EXTENSIONS: every getExtension request, by case-normalized name, whether or not it succeeded; a
 *  request made while `probeDepth` is up is the probe's own and is booked apart.
 *  WEBGPU and WORKERS: counted at the request, so a browser without WebGPU still shows the attempt.
 *  The hold's transitions are kept, values recovered from attributeOldValue: an observer reading the
 *  current value would describe only the last change of a batch. `heldEnded` is the LATEST span's. */
export const RECORDER = `(() => {
  const ATTR = '${RENDER_HOLD_ATTR}';
  const rec = {
    installed: true, draws: 0, heldDraws: 0, seenHeld: false, heldEnded: false, transitions: [],
    webglContexts: 0, contextArgs: [], extensionRequests: {}, probeExtensionRequests: {},
    webgpuRequests: 0, workers: 0, stubDraw: false, probeDepth: 0,
  };
  Object.defineProperty(window, '__holdRec', { value: rec });
  const heldNow = () => document.documentElement?.getAttribute(ATTR) === 'held';
  const DRAW = /^(draw|multiDraw)(Arrays|Elements|RangeElements)/;
  const wrapDraw = (f) => function (...args) {
    rec.draws += 1;
    if (heldNow()) rec.heldDraws += 1;
    if (rec.stubDraw) return undefined;
    return f.apply(this, args);
  };
  const GLS = [self.WebGLRenderingContext, self.WebGL2RenderingContext].filter(Boolean);
  const wrapped = new WeakSet();
  for (const C of GLS) {
    for (const name of Object.getOwnPropertyNames(C.prototype)) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, name);
      if (DRAW.test(name) && d && typeof d.value === 'function') C.prototype[name] = wrapDraw(d.value);
    }
    const getExtension = C.prototype.getExtension;
    if (typeof getExtension !== 'function') continue;
    C.prototype.getExtension = function (name) {
      const book = rec.probeDepth > 0 ? rec.probeExtensionRequests : rec.extensionRequests;
      const key = String(name).toLowerCase();
      book[key] = (book[key] || 0) + 1;
      const ext = getExtension.apply(this, arguments);
      if (ext && typeof ext === 'object' && !wrapped.has(ext)) {
        wrapped.add(ext);
        const names = new Set();
        for (let o = ext; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
          for (const m of Object.getOwnPropertyNames(o)) if (DRAW.test(m)) names.add(m);
        }
        for (const m of names) {
          const f = ext[m];
          if (typeof f === 'function') Object.defineProperty(ext, m, { value: wrapDraw(f), configurable: true, writable: true });
        }
      }
      return ext;
    };
  }
  const counted = new WeakSet();
  for (const K of [self.HTMLCanvasElement, self.OffscreenCanvas]) {
    if (!K) continue;
    const get = K.prototype.getContext;
    K.prototype.getContext = function (...args) {
      if (String(args[0]).toLowerCase() === 'webgpu') rec.webgpuRequests += 1;
      const ctx = get.apply(this, args);
      if (ctx && GLS.some((C) => ctx instanceof C) && !counted.has(ctx)) {
        counted.add(ctx);
        rec.webglContexts += 1;
        rec.contextArgs.push(String(args[0]));
      }
      return ctx;
    };
  }
  const gpu = self.navigator && self.navigator.gpu;
  if (gpu && typeof gpu.requestAdapter === 'function') {
    const requestAdapter = gpu.requestAdapter;
    gpu.requestAdapter = function (...args) { rec.webgpuRequests += 1; return requestAdapter.apply(this, args); };
  }
  for (const name of ['Worker', 'SharedWorker']) {
    const W = self[name];
    if (typeof W !== 'function') continue;
    self[name] = new Proxy(W, { construct(target, args, newTarget) { rec.workers += 1; return Reflect.construct(target, args, newTarget); } });
  }
  new MutationObserver((records) => {
    records.forEach((r, i) => {
      const value = i + 1 < records.length ? records[i + 1].oldValue : r.target.getAttribute(ATTR);
      rec.transitions.push(value);
      if (value === 'held') { rec.seenHeld = true; rec.heldEnded = false; }
      if (value === 'free' && rec.seenHeld) rec.heldEnded = true;
    });
  }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: [ATTR] });
})();`;

const HOLD_STATE = `return document.documentElement.getAttribute('${RENDER_HOLD_ATTR}');`;
const RECORD = 'const r = window.__holdRec; return r ? JSON.parse(JSON.stringify(r)) : null;';
/** How long a held span may take to end once the walk is done before the row is UNMEASURED. */
const SPAN_CAP_MS = 15000;

/** The recorder's evidence, as a row carries it. */
const holdSummary = (rec) => rec && {
  seenHeld: rec.seenHeld, heldEnded: rec.heldEnded, transitions: rec.transitions, draws: rec.draws, heldDraws: rec.heldDraws,
  webglContexts: rec.webglContexts, contextArgs: rec.contextArgs, extensionRequests: rec.extensionRequests,
  probeExtensionRequests: rec.probeExtensionRequests, webgpuRequests: rec.webgpuRequests, workers: rec.workers,
};

// ---- context-type resolution ---------------------------------------------------------------------
// A canvas locks to the first context type it is ever handed and refuses every other type after that
// (measured against a live headless Chrome running this lane's own flags): calling getContext('webgl2')
// then getContext('webgl') on the SAME canvas returns null for the second call, and the reverse order
// nulls the reverse call. That made the readback below blind to any route whose engine claims webgl2 --
// it asked for 'webgl' and 'experimental-webgl' only, both of which come back null on a webgl2 canvas,
// so a route drawing correctly through webgl2 was reported UNMEASURED. 'webgl2' is appended as a third
// attempt rather than reordered to the front: the two shipped routes both claim plain 'webgl', so the
// first branch still resolves them exactly as it did before this was added, and only a webgl2 canvas
// ever reaches the new branch.
// Stringified into READBACK below so the exact function that runs in the browser is the one pinned by
// scripts/webgl-pixels-probe.test.mjs against mock canvases -- no separate copy to drift out of sync.
export function resolveGLContext(canvas) {
  return canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2');
}

// ---- the readback -------------------------------------------------------------------------------
// Read INSIDE an animation-frame callback, and that is the single most likely way this probe could
// lie. Neither engine asks for preserveDrawingBuffer, so the drawing buffer is cleared once the
// compositor has presented it, and a readPixels taken from an ordinary task reads zeros no matter
// what the frame drew -- a permanent, silent FAIL. A callback registered from here runs AFTER the
// engine's own callback in the next frame (the engine re-registers at the end of its loop, so its
// registration is older than ours) and before that frame is presented, which is the one window where
// the buffer holds what was just drawn. Three frames are read and the strongest one is taken, so a
// single frame that happens to draw nothing cannot decide the verdict.
//
// The default framebuffer is bound explicitly and the previous binding restored: neither engine binds
// an FBO today, but reading whatever framebuffer happened to be bound would answer about the wrong
// surface, and it would do it while looking perfectly healthy.
//
// ponytail: this claims the FIRST canvas that will hand over a WebGL context, and getContext is a
// write -- on a canvas the engine has not claimed yet it CREATES the context, and the engine's own
// later call would then silently receive this one. Both WebGL routes ship exactly one <canvas>
// today, and canvasWidthAtFirstPoll below is what tells the two apart in the record: the engine
// sizes the element from innerWidth before its first frame, so the default 300 would mean this probe
// got there first. Name the engine's canvas explicitly when a route ships a second one.
const READBACK = (stubDraw) => `
  const resolveGLContext = ${resolveGLContext.toString()};
  const canvases = [...document.querySelectorAll('canvas')];
  let c = null, gl = null;
  const deadline = performance.now() + 6000;
  while (performance.now() < deadline && !gl) {
    for (const el of canvases.length ? canvases : [...document.querySelectorAll('canvas')]) {
      const ctx = resolveGLContext(el);
      if (ctx) { c = el; gl = ctx; break; }
    }
    if (!gl) await new Promise((r) => setTimeout(r, 100));
  }
  if (!gl) {
    return {
      contextLive: false, nonBlank: null,
      canvases: document.querySelectorAll('canvas').length,
      unsupportedNotice: !!document.getElementById('webglUnsupportedNotice'),
    };
  }
  // The probe's own request, booked apart by the recorder (probeDepth) so it is never charged to the route.
  const hold = window.__holdRec;
  if (hold) hold.probeDepth += 1;
  let dbg;
  try { dbg = gl.getExtension('WEBGL_debug_renderer_info'); } finally { if (hold) hold.probeDepth -= 1; }
  const out = {
    contextLive: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    contextLost: gl.isContextLost(),
    // Constraint stated in the brief, measured rather than assumed: a canvas already holding a WebGL
    // context refuses a 2D one, which is why the existing 2D canvas-pixels probes cannot be reused.
    twoDContextOnSameCanvas: c.getContext('2d'),
    canvasWidthAtFirstPoll: c.width,
    backingStore: { w: c.width, h: c.height },
    drawingBuffer: { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight },
    stubbed: ${stubDraw ? 'true' : 'false'},
    frames: [],
  };
  if (out.contextLost) { out.nonBlank = null; out.readbackNote = 'context lost'; return out; }
  ${stubDraw ? `
  // Must-red mode: the engine keeps running and keeps clearing, and every draw call becomes a no-op.
  // Same code path as a live run -- only the draw calls change. Through the recorder when it is
  // there, so core and extension draws are silenced alike and both are still counted.
  if (hold) hold.stubDraw = true;
  else {
    const proto = Object.getPrototypeOf(gl);
    for (const name of ['drawArrays', 'drawElements']) if (proto[name]) proto[name] = function () {};
  }
  // Two frames of grace: the frame already in the buffer was drawn before the stub landed.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  ` : ''}
  // Evidence for the paragraph above rather than a claim about it: the SAME readback taken from an
  // ordinary task, outside any animation frame. Recorded and never judged -- if this collapses to one
  // colour while the framed reads do not, the frame timing is what makes this probe work, and if it
  // does not, the comment above is overstated on this runner.
  {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (w > 0 && h > 0) {
      const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const seen = new Set();
      for (let i = 0; i < buf.length; i += 4) {
        seen.add((buf[i] >> 4) * 4096 + (buf[i + 1] >> 4) * 256 + (buf[i + 2] >> 4) * 16 + (buf[i + 3] >> 4));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
      out.outOfFrameDistinctColours = seen.size;
    }
  }
  await new Promise((resolve) => {
    let n = 0;
    // Never hang: a target that fires no animation frame at all leaves nonBlank null, which is
    // UNMEASURED, rather than an empty pixel buffer, which would be a fabricated FAIL.
    const bail = setTimeout(resolve, 4000);
    const step = () => {
      const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      let frame = { w, h, distinctColours: 0, coverage: 0 };
      if (w > 0 && h > 0) {
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        // Quantised colours, and coverage measured against the MODAL colour rather than against
        // alpha: one engine asks for alpha:false, so every pixel comes back opaque and an
        // alpha-based coverage would read 100% on a buffer that only ever got cleared.
        const hist = new Map();
        for (let i = 0; i < buf.length; i += 4) {
          const k = (buf[i] >> 4) * 4096 + (buf[i + 1] >> 4) * 256 + (buf[i + 2] >> 4) * 16 + (buf[i + 3] >> 4);
          hist.set(k, (hist.get(k) || 0) + 1);
        }
        let modal = 0;
        for (const v of hist.values()) if (v > modal) modal = v;
        const total = w * h;
        frame = { w, h, distinctColours: hist.size, coverage: Number(((total - modal) / total).toFixed(4)) };
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
      out.frames.push(frame);
      if (++n >= 3) { clearTimeout(bail); resolve(); } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  if (out.frames.length === 0) { out.nonBlank = null; out.readbackNote = 'no animation frame fired within 4000ms'; return out; }
  out.best = out.frames.reduce((a, b) => (b.distinctColours > a.distinctColours ? b : a));
  // A cleared-only buffer is one colour and zero coverage. A collapsed 0x0 canvas is a real
  // regression, so it lands on FAIL here rather than on UNMEASURED.
  out.nonBlank = out.best.distinctColours >= 8 && out.best.coverage > 0.02;
  return out;`;

// ---- one route ----------------------------------------------------------------------------------

/** One loaded route, from the settle to its row. Exported so the order -- walk, span, verdict, readback,
 *  and the FINAL snapshot judged after the readback -- is pinned without a browser. */
export async function measureRoute({
  route, url, declaration, evaluate, tap, armDelayMs, stubDraw = false,
  settle = awaitPlayerScreenSettled, spanCapMs = SPAN_CAP_MS, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now,
}) {
  // gh#264 -- the shared player screen's open can hold this route's own screen invisible while it
  // waits on a roster migration; reading or pressing in that gap measures a page still booting. Waits
  // with the fit probe's own helper and cap, and a route that never settles reds by name.
  const unsettled = await settle(evaluate);
  if (unsettled) return { route, url, verdict: 'UNMEASURED', reason: `${route}: ${unsettled}` };
  const record = async () => {
    const r = await evaluate(RECORD);
    return r.error ? null : r.value;
  };
  // 1. A hold still up after the settle is the open screen's: walk its handover. A walk that stops
  // reds this row by name and the surface is never read.
  const holdNow = await evaluate(HOLD_STATE);
  if (!holdNow.error && holdNow.value === 'held') {
    const walked = await walkHandover({ evaluate, tap, armDelayMs, wait, now });
    if (walked) return { route, url, hold: holdSummary(await record()), verdict: 'UNMEASURED', reason: `${route}: ${walked} -- the surface was not read back` };
  }
  // 2. The LATEST held span must be SEEN to end.
  let rec = null;
  let spanError = null;
  for (const deadline = now() + spanCapMs; ;) {
    rec = await record();
    if (!rec || rec.heldEnded === true || rec.seenHeld !== true) break;
    if (now() >= deadline) { spanError = `the latest held span did not end in an observed free within ${spanCapMs}ms`; break; }
    await wait(100);
  }
  // 3. The verdict the hold alone decides.
  const judged = judgeHold({ route, declaration, rec, spanError });
  if (judged) return { route, url, hold: holdSummary(rec), ...judged };
  // 4. A declared adapter: read its surface back.
  const read = await evaluate(READBACK(stubDraw));
  // An evaluate that did not answer is not a measurement of anything, least of all of this
  // runner's GPU: keep contextLive unset so classify reports the read as the cause.
  const measured = read.error
    ? { contextLive: null, nonBlank: null, readError: read.error }
    : read.value ?? { contextLive: false, nonBlank: null, error: 'no value returned' };
  // 5. The FINAL snapshot, taken after the readback: a draw while held, a policy violation or a hold
  // that came back during the measurement is judged on it, and outranks what the pixels said.
  const final = await record();
  const finalJudged = judgeHold({ route, declaration, rec: final });
  return { route, url, hold: holdSummary(final), ...measured, ...(finalJudged ?? classify(measured)) };
}

// ---- the run ------------------------------------------------------------------------------------

async function main() {
  const BASE = process.env.BASE ?? process.env.PROBE_BASE ?? 'http://localhost:4351';
  const PORT = process.env.CDP_PORT ?? '9333';
  const stubDraw = process.env.STUB_DRAW === '1';
  const routes = (await partyPlayRoutes()).map((g) => g.id).sort();
  const declarations = loadDeclarations();
  if (routes.length === 0) throw new Error('no party play route in the manifest -- refusing to report a vacuous verdict');

  const api = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json();
  const target = await api('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  let loadResolve = null;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
    if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  });
  const send = (method, params = {}) =>
    new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
  const { ARM_DELAY_MS } = await import(new URL('../src/games/_arm-gate.ts', import.meta.url).href);
  // A real touch at a point, the same Input path scripts/driver.mjs taps through.
  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const evaluate = async (body) => {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true,
    });
    return evaluateResult(res);
  };

  const rows = [];
  for (const route of routes) {
    const url = `${BASE}/game/${route}/play/`;
    // Real device metrics, not a resized window: the engine sizes its drawing buffer from
    // innerWidth x devicePixelRatio, so the buffer this reads back is the one a phone would get.
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    // A first visit: an earlier route's start saved a roster on this same origin.
    await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'local_storage' });
    const p = new Promise((r) => { loadResolve = r; });
    await send('Page.navigate', { url });
    await p;
    rows.push(await measureRoute({ route, url, declaration: declarations[route], evaluate, tap, armDelayMs: ARM_DELAY_MS, stubDraw }));
  }

  const verdict = aggregate(rows.map((r) => r.verdict));
  const out = { verdict, stubDraw, routes, rows };
  console.log(JSON.stringify(out, null, 2));
  for (const r of rows) {
    const ext = r.hold ? Object.keys(r.hold.extensionRequests ?? {}).length : 0;
    const held = r.hold ? ` [held: ${r.hold.heldDraws} draw call(s); WebGL contexts: ${r.hold.webglContexts}; extensions requested: ${ext}; hold ${r.hold.transitions.join('>')}]` : '';
    console.log(`webgl-pixels: ${r.route} ${r.verdict} -- ${r.reason}${held}`);
  }
  console.log(`webgl-pixels: ${rows.length} party play route(s) checked for WebGL contexts and draws while held, ${rows.filter((r) => declarations[r.route]?.suspends === 'adapter').length} adapter surface(s) read, verdict ${verdict} (exit ${exitCodeFor(verdict)})`);
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  ws.close();
  process.exit(exitCodeFor(verdict));
}

// Importable for the unit test, runnable as a probe -- the classifier must be testable without a
// browser, and importing this file must not drive one.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
