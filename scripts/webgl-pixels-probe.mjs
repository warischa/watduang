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
// COMPANY-PARTY ROUTES (gh#305). The set is every play route of scripts/render-suspension-check.mjs's
// RENDER_CATEGORIES, so the prize-draw projector and the three prize games' own pages are walked too, each
// at its own playRoute. They are SCREENLESS (their category carries no group, play-screen-fit-probe.mjs
// screenlessPlayPaths): nothing on those pages raises the hold, so no held span is owed there and the
// row judges the rest -- contexts, the extension and worker policy, and any draw while held should
// something raise it. EVERY screenless route must have a driver and is driven before any verdict, whatever
// it declares: a renderer started only by a press is otherwise never seen (REFUTE round 1). Their hold-following is the shared host's, unit-tested in game-host.test.mjs. A
// cold screenless page draws nothing, so an adapter there is DRIVEN to a live reveal first by its entry
// in REVEAL_DRIVERS (the demo pages: one press; the projector: an event seeded through the store's own
// constants and the event domain's encoder, then the MC's press); a route with no driver, a driver that
// stops, or a reveal that never creates a context is UNMEASURED by name. Not driven: the fireworks
// demo's final mode, and the cards round after its deal.
// A REAL HOLD ON EVERY ADAPTER (gh#305 REFUTE round 2). A screen's held span proves nothing on a page
// that draws nothing behind the screen, and the wiring gate (render-suspension-check.mjs) proves wiring,
// never execution. So every adapter, once live -- driven to its reveal, or handed over by its screen -- is
// made to obey a hold it did not raise: HOLD_EXERCISE acquires one through the shipped hold module's
// own probe hooks, and judgeHoldExercise requires that the page drew before it, that the renderer on
// screen holds an ACTIVE registration in that module (on a reveal host, under the instance its live layer
// names -- another instance's does not count), that nothing drew while it was up, and that drawing
// resumed after the release. A registration alone never passes: a listener that ignores the hold is
// registered too. Missing diagnostics, no live layer, or a page that drew nothing first is UNMEASURED.
// Routes with a screen carry no instance name (their adapters predate it), so there any active
// registration is accepted and the draw counts decide.
// The exercise waits for what it must prove rather than for a clock (gh#305 recheck, 2026-11-13): the press
// creates the context at once while the host's layer appears only after the game and three load, so a
// one-shot read of the layer raced that load and lost on a cold cache. A reveal that ends mid-exercise, or
// never comes up within the cap, is UNMEASURED and gets exactly ONE retry on a new reveal from a fresh
// load; a FAIL is never retried, and a retry that still cannot measure stays UNMEASURED.
// THE BOUNDARY, stated: the recorder runs in this document's own realm. Another document -- an iframe,
// a popup -- is a realm it does not reach and is neither counted nor refused here; no party play
// route ships one today. And a context a route creates only later in a round, past where this walk
// stops, is not seen.
import { fileURLToPath } from 'node:url';
import { evaluateResult } from './cdp-evaluate-result.mjs';
import { awaitPlayerScreenSettled, screenlessPlayPaths } from './play-screen-fit-probe.mjs';
import { walkHandover } from './player-screen-handover.mjs';
import { loadDeclarations, renderPlayRoutes } from './render-suspension-check.mjs';
import { RENDER_HOLD_ATTR } from '../src/play/_player-screen/player-screen.ts';
import { RENDER_HOLD_INSTANCE_ATTR, RENDER_HOLD_PROBE_GLOBAL } from '../src/play/_render-hold.ts';

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
export function judgeHold({ route, declaration, rec, spanError = null, screenless = false, driven = false }) {
  if (!declaration) return { verdict: 'FAIL', reason: `${route} has no entry in src/play/_render-suspension.json` };
  if (!rec || rec.installed !== true) return { verdict: 'UNMEASURED', reason: 'the hold recorder was never installed, so nothing was counted' };
  if (rec.heldDraws > 0) return { verdict: 'FAIL', reason: `${rec.heldDraws} WebGL draw call(s) while the page read held (gh#272)` };
  const violations = policyViolations({ route, declaration, rec });
  if (violations.length) return { verdict: 'FAIL', reason: violations.join('; ') };
  // gh#305: a screenless route has nothing that raises the hold, so no held span is owed; one that did
  // appear must still be seen to end.
  // REFUTE round 1: a cold screenless page shows nothing a press has not started, so a row its driver
  // never brought to that press is not a measurement of the route, whatever it declares.
  if (screenless && !driven) return { verdict: 'UNMEASURED', reason: `${route}: a screenless route judged without its reveal driver having run -- a renderer started by a press would escape` };
  if (screenless && rec.seenHeld !== true) {
    if (spanError) return { verdict: 'UNMEASURED', reason: spanError };
    if (declaration.suspends !== 'adapter') return { verdict: 'PASS', reason: 'screenless: no WebGL context created (no hold source on this page)' };
    return null;
  }
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
  // The render hold's diagnostics opt-in (gh#305): read by the hold module as it loads, which installs its
  // read-only snapshot and a real acquire on this object. Non-writable, so no page script can swap it.
  Object.defineProperty(window, '${RENDER_HOLD_PROBE_GLOBAL}', { value: { enabled: true } });
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

// ---- a real hold, acquired by the probe (gh#305 REFUTE round 2) ----------------------------------

/** The most any one wait of the exercise may take: for the live layer and the first draws, and for the
 *  first draw after the release. A wait that hits it ends the exercise as UNMEASURED, never as a pass. */
const EXERCISE_CAP_MS = 8000;

/** In the page, sized to what it must prove rather than to a clock (gh#305 recheck 2026-11-13):
 *    1. wait -- capped -- for the live renderer's layer (when the page has one) and for two animation frames
 *       that drew AFTER it appeared; the layer is re-read every frame, because the host appends it only
 *       once the game and three have loaded, well after the press created the context;
 *    2. acquire a real hold through the shipped module's hooks and keep it for six animation frames, and
 *       at least three times the gap seen between drawing frames, so a renderer that would draw has had
 *       its chances; read the module's snapshot and whether the layer is still in the page;
 *    3. release, and wait -- capped -- for the first draw after it.
 *  Returns the counts and the snapshots; judgeHoldExercise decides. */
export const HOLD_EXERCISE = (capMs = EXERCISE_CAP_MS) => `/* hold-exercise */
  const probe = window[${JSON.stringify(RENDER_HOLD_PROBE_GLOBAL)}];
  const rec = window.__holdRec;
  if (!rec) return { error: 'the hold recorder is not installed' };
  if (!probe || typeof probe.snapshot !== 'function' || typeof probe.acquire !== 'function') return { diagnostics: false };
  const SEL = ${JSON.stringify(`[${RENDER_HOLD_INSTANCE_ATTR}]`)};
  const live = () => { const el = document.querySelector(SEL); return el && el.isConnected !== false ? el.getAttribute(${JSON.stringify(RENDER_HOLD_INSTANCE_ATTR)}) : null; };
  const tick = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
  const out = { diagnostics: true, instance: null, phase: 'before', drawsBefore: 0, heldDraws: 0, drawsAfter: 0 };
  // 1. The live layer, then two drawing frames after it.
  const t0 = performance.now();
  let seen = rec.draws, drawingFrames = 0, firstDrawAt = 0, lastDrawAt = 0, d0 = rec.draws;
  for (;;) {
    const now = await tick();
    const inst = live();
    if (inst && inst !== out.instance) { out.instance = inst; d0 = rec.draws; seen = rec.draws; drawingFrames = 0; }
    if (rec.draws > seen) {
      seen = rec.draws;
      drawingFrames += 1;
      if (drawingFrames === 1) firstDrawAt = now;
      lastDrawAt = now;
    }
    out.drawsBefore = rec.draws - d0;
    if (drawingFrames >= 2) break;
    if (now - t0 > ${capMs}) { out.timedOut = true; out.waitedMs = Math.round(now - t0); return out; }
  }
  // 2. A real hold, for as long as the renderer's own cadence needs to show it would have drawn.
  const gap = Math.max(16, lastDrawAt - firstDrawAt);
  const heldFor = Math.min(${capMs}, Math.max(3 * gap, 100));
  out.phase = 'held';
  const h0 = rec.heldDraws;
  const release = probe.acquire();
  try {
    out.during = probe.snapshot();
    const heldAt = performance.now();
    for (let frames = 0; frames < 6 || performance.now() - heldAt < heldFor; frames += 1) await tick();
    out.layerDuring = out.instance === null ? null : live() === out.instance;
  } finally {
    release();
  }
  out.heldDraws = rec.heldDraws - h0;
  out.heldMs = Math.round(heldFor);
  // 3. The first draw after the release.
  out.phase = 'after';
  const d1 = rec.draws;
  const t1 = performance.now();
  for (;;) {
    const now = await tick();
    if (rec.draws > d1) break;
    if (now - t1 > ${capMs}) break;
  }
  out.drawsAfter = rec.draws - d1;
  out.after = probe.snapshot();
  out.layerAfter = out.instance === null ? null : live() === out.instance;
  out.phase = 'done';
  return out;`;

/** What the exercise saw -> null when the adapter obeyed a real hold, else the row's verdict.
 *  `requireInstance`: a reveal host's route, where the live layer must name the registering instance.
 *  An UNMEASURED that a NEW reveal could settle carries `retry: true`; nothing that FAILS ever does. */
export function judgeHoldExercise({ route, result, requireInstance = false }) {
  const un = (reason, retry = false) => ({ verdict: 'UNMEASURED', reason: `${route}: ${reason}`, ...(retry ? { retry: true } : {}) });
  const fail = (reason) => ({ verdict: 'FAIL', reason: `${route}: ${reason}` });
  if (!result || result.error) return un(`the hold exercise never answered (${result?.error ?? 'no value'}) -- nothing proves its subscription`);
  if (result.diagnostics !== true) return un('the page exposes no render-hold diagnostics -- the opt-in never reached the hold module, or this build predates them; nothing proves its subscription');
  if (result.timedOut) {
    if (requireInstance && !result.instance) return un(`no live renderer element named its hold instance within ${result.waitedMs}ms -- the reveal never came up, so its subscription cannot be told from another's`, true);
    return un(`nothing drew within ${result.waitedMs}ms${result.instance ? ` of ${result.instance} appearing` : ''} -- a renderer that stopped could not be told from one that idles`, true);
  }
  if (requireInstance && !result.instance) return un('no live renderer element names its hold instance -- its subscription cannot be told from another\'s', true);
  if (result.during?.held !== true) return un('the hold the probe acquired never read held in the hold module');
  if (!(result.drawsBefore > 0)) return un('nothing drew before the hold -- a renderer that stopped could not be told from one that idles', true);
  const regs = (snap) => snap?.registrations ?? [];
  const mine = (snap) => regs(snap).filter((r) => (result.instance ? r.instance === result.instance : true)).length;
  if (mine(result.during) === 0) {
    // The layer left the page as the hold went up: the reveal ended there, which says nothing either way.
    if (result.instance && result.layerDuring === false) return un(`the reveal ${result.instance} ended as the hold went up`, true);
    return regs(result.during).length > 0
      ? fail(`only another instance's registration is active (${regs(result.during).map((r) => r.instance).join(', ')}), none under the live renderer's ${result.instance}`)
      : fail('no active hold registration while the hold was up -- the subscription never ran, or was dropped');
  }
  if (result.heldDraws > 0) return fail(`${result.heldDraws} draw call(s) while a real hold was up -- its listener is registered but does not stop rendering`);
  if (!(result.drawsAfter > 0)) {
    const stillLive = mine(result.after) > 0 && result.layerAfter !== false;
    return stillLive
      ? fail('drawing did not resume after the hold was released, while its registration and its layer are still live')
      : un('nothing drew after the release and its registration is gone -- the reveal ended during the exercise', true);
  }
  return null;
}

// ---- the drivers of screenless routes (gh#305) --------------------------------------------------

/** Press the control `selector` names once it is armed (enabled), or say why not. */
export const clickWhenArmed = (selector, capMs = 8000) => `
  const deadline = performance.now() + ${capMs};
  for (;;) {
    const b = document.querySelector(${JSON.stringify(selector)});
    if (b && !b.disabled) { b.click(); return null; }
    if (performance.now() > deadline) return ${JSON.stringify(`no armed ${selector} within ${capMs}ms`)};
    await new Promise((r) => setTimeout(r, 100));
  }`;

/** Put `raw` into the prize-draw event store, the store's own database, object store and key. */
export const seedEventStore = (db, raw) => `
  return await new Promise((resolve) => {
    const req = indexedDB.open(${JSON.stringify(db.name)}, ${Number(db.version)});
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(${JSON.stringify(db.store)})) req.result.createObjectStore(${JSON.stringify(db.store)}); };
    req.onerror = () => resolve('open failed: ' + req.error);
    req.onsuccess = () => {
      const conn = req.result;
      const tx = conn.transaction(${JSON.stringify(db.store)}, 'readwrite');
      tx.objectStore(${JSON.stringify(db.store)}).put(${JSON.stringify(raw)}, ${JSON.stringify(db.key)});
      tx.oncomplete = () => { conn.close(); resolve('ok'); };
      tx.onerror = () => { conn.close(); resolve('write failed: ' + tx.error); };
    };
  });`;

/** A small real event whose round 1 is a fireworks round, encoded by the event domain itself. */
async function fireworksEventRaw() {
  const { createEvent, encodeEvent } = await import(new URL('../src/prize-event/event.ts', import.meta.url).href);
  const { proposeSchedule } = await import(new URL('../src/prize-draw/schedule.ts', import.meta.url).href);
  const { demoRng } = await import(new URL('../src/play/_prize-reveal/demo.ts', import.meta.url).href);
  const names = Array.from({ length: 20 }, (_, i) => `P${i + 1}`);
  const games = { rounds: ['fireworks', null, null, null], final: null };
  return encodeEvent(createEvent({ eventName: 'Probe', names, schedule: proposeSchedule(names.length), prizes: ['A'], games }, demoRng(305)));
}

const pressed = (r) => (r.error ? `the press never answered (${r.error})` : r.value);

/** route id -> how a screenless adapter is brought to a live reveal: null once it is, else why not. */
export const REVEAL_DRIVERS = {
  'prize-fireworks': async ({ evaluate }) => pressed(await evaluate(clickWhenArmed('.pr-go'))),
  // gh#305 recheck: the deal's own reveal. Measured 2026-11-13 on the lane's flags: its layer lives about
  // 4.3s (not the 0.7s once assumed), the rule reveal's about 6.5s -- and the exercise needs about 0.3s once
  // the layer is up, so the deal is long enough. The rule reveal is reachable only through the deal's EXIT,
  // and that exit's context release asks for WEBGL_lose_context, which the route's extension policy does
  // not list: driving to it reds the route on policy, not on the hold.
  'prize-cards': async ({ evaluate }) => pressed(await evaluate(clickWhenArmed('.pr-go'))),
  'prize-ladder': async ({ evaluate }) => pressed(await evaluate(clickWhenArmed('.pr-go'))),
  'prize-draw': async ({ evaluate, reload }) => {
    const { DB } = await import(new URL('../src/prize-event/store.ts', import.meta.url).href);
    const seeded = await evaluate(seedEventStore(DB, await fireworksEventRaw()));
    if (seeded.error || seeded.value !== 'ok') return `seeding the event failed (${seeded.error ?? seeded.value})`;
    await reload();
    return pressed(await evaluate(clickWhenArmed('.pd-mc button')));
  },
};

// THE VIEWPORT A ROUTE IS DRIVEN AT (gh#305). Real device metrics, not a resized window: the engine sizes its
// drawing buffer from innerWidth x devicePixelRatio, so at the phone size the buffer read back is the one a
// phone would get -- that is why 390x844 is the default for every route. The four prize reveal routes are
// the one difference: by owner pick (gh#305 PD-305-04 / PD-306-02 / PD-307-02, the shared reveal host in
// src/play/_prize-reveal/game-host.ts) a viewport below the site's 640px phone boundary runs every prize
// reveal on its 2D path and creates NO WebGL context, so driving them at 390 reads UNMEASURED by design and
// the lane measures nothing there. They are driven at a width where they draw 3D instead. Nothing is
// exempted: the same verdicts apply, only the width differs. The set is the routes that own a reveal
// driver -- the prize routes and no others -- so a new driver lands wide with no second list to edit.
export const PHONE_VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 1, mobile: true };
export const WIDE_VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };
export const viewportFor = (route) => (REVEAL_DRIVERS[route] ? WIDE_VIEWPORT : PHONE_VIEWPORT);

/** How long a driven reveal may take to create its WebGL context (three and the game load lazily). */
const CONTEXT_CAP_MS = 15000;

// ---- one route ----------------------------------------------------------------------------------

/** One loaded route, from the settle to its row. Exported so the order -- walk, span, verdict, readback,
 *  and the FINAL snapshot judged after the readback -- is pinned without a browser. */
export async function measureRoute(params) {
  const {
    route, url, declaration, evaluate, tap, armDelayMs, stubDraw = false,
    settle = awaitPlayerScreenSettled, spanCapMs = SPAN_CAP_MS, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now,
    screenless = false, driver = null, reload = async () => {}, contextCapMs = CONTEXT_CAP_MS, exerciseCapMs = EXERCISE_CAP_MS,
    fresh = null, attempt = 1,
  } = params;
  // gh#264 -- the shared player screen's open can hold this route's own screen invisible while it
  // waits on a roster migration; reading or pressing in that gap measures a page still booting. Waits
  // with the fit probe's own helper and cap, and a route that never settles reds by name.
  const unsettled = await settle(evaluate);
  if (unsettled) return { route, url, verdict: 'UNMEASURED', reason: `${route}: ${unsettled}` };
  const record = async () => {
    const r = await evaluate(RECORD);
    return r.error ? null : r.value;
  };
  // 1s. gh#305: a route with a driver -- and every screenless route must have one -- is driven before any
  // verdict. An adapter must then show a live WebGL context; any other route gets the same window, and a
  // context that appears in it is judged against its declaration below (REFUTE round 1).
  let driven = false;
  const drive = async () => {
    if (!driver) return { route, url, verdict: 'UNMEASURED', reason: `${route}: no reveal driver in REVEAL_DRIVERS for this screenless route -- a cold page draws nothing a press has not started, so nothing it would draw could be judged` };
    const stopped = await driver({ evaluate, reload });
    driven = true;
    if (stopped) return { route, url, hold: holdSummary(await record()), verdict: 'UNMEASURED', reason: `${route}: its driver stopped: ${stopped}` };
    for (const deadline = now() + contextCapMs; ;) {
      const r = await record();
      if (r && r.webglContexts > 0) return null;
      if (now() >= deadline) {
        if (declaration?.suspends !== 'adapter') return null;
        return { route, url, hold: holdSummary(r), verdict: 'UNMEASURED', reason: `${route}: the driven reveal created no WebGL context within ${contextCapMs}ms -- nothing to read back` };
      }
      await wait(100);
    }
  };
  if (screenless) {
    const stop = await drive();
    if (stop) return stop;
  }
  // 1. A hold still up after the settle is the open screen's: walk its handover. A walk that stops
  // reds this row by name and the surface is never read.
  const holdNow = await evaluate(HOLD_STATE);
  if (!screenless && !holdNow.error && holdNow.value === 'held') {
    const walked = await walkHandover({ evaluate, tap, armDelayMs, wait, now });
    if (walked) return { route, url, hold: holdSummary(await record()), verdict: 'UNMEASURED', reason: `${route}: ${walked} -- the surface was not read back` };
  }
  // A route with a screen and a driver too: its driver runs once the screen has handed over.
  if (!screenless && driver) {
    const stop = await drive();
    if (stop) return stop;
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
  const judged = judgeHold({ route, declaration, rec, spanError, screenless, driven });
  if (judged) return { route, url, hold: holdSummary(rec), ...judged };
  // 4. A declared adapter: make it obey a real hold it did not raise, then read its surface back.
  const exercise = await evaluate(HOLD_EXERCISE(exerciseCapMs));
  const exercised = judgeHoldExercise({ route, result: exercise.error ? { error: exercise.error } : exercise.value, requireInstance: screenless });
  // A reveal that ended (or never came up) gets ONE more go, on a NEW reveal from a fresh load. A FAIL is
  // never retried, and the second go's verdict stands, whatever it is.
  if (exercised?.retry && attempt === 1 && fresh) {
    await fresh();
    const again = await measureRoute({ ...params, attempt: 2 });
    return { ...again, retriedAfter: exercised.reason };
  }
  if (exercised) {
    const { retry: _retry, ...row } = exercised;
    return { route, url, hold: holdSummary(await record()), exercise: exercise.value ?? null, ...row };
  }
  const read = await evaluate(READBACK(stubDraw));
  // An evaluate that did not answer is not a measurement of anything, least of all of this
  // runner's GPU: keep contextLive unset so classify reports the read as the cause.
  const measured = read.error
    ? { contextLive: null, nonBlank: null, readError: read.error }
    : read.value ?? { contextLive: false, nonBlank: null, error: 'no value returned' };
  // 5. The FINAL snapshot, taken after the readback: a draw while held, a policy violation or a hold
  // that came back during the measurement is judged on it, and outranks what the pixels said.
  const final = await record();
  const finalJudged = judgeHold({ route, declaration, rec: final, screenless, driven });
  return { route, url, hold: holdSummary(final), ...measured, ...(finalJudged ?? classify(measured)) };
}

// ---- the run ------------------------------------------------------------------------------------

async function main() {
  const BASE = process.env.BASE ?? process.env.PROBE_BASE ?? 'http://localhost:4351';
  const PORT = process.env.CDP_PORT ?? '9333';
  const stubDraw = process.env.STUB_DRAW === '1';
  const games = (await renderPlayRoutes()).sort((a, b) => a.id.localeCompare(b.id));
  const routes = games.map((g) => g.id);
  const screenlessPaths = screenlessPlayPaths();
  const declarations = loadDeclarations();
  if (routes.length === 0) throw new Error('no play route in the manifest -- refusing to report a vacuous verdict');

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
  for (const g of games) {
    const route = g.id;
    const url = new URL(g.playRoute, BASE).href;
    const screenless = screenlessPaths.has(g.playRoute);
    const load = async () => {
      const p = new Promise((r) => { loadResolve = r; });
      await send('Page.navigate', { url });
      await p;
    };
    // Real device metrics, not a resized window (why 390 for most routes, and why the prize routes differ: viewportFor).
    await send('Emulation.setDeviceMetricsOverride', viewportFor(route));
    // A first visit: an earlier route's start saved a roster on this same origin.
    // gh#305: and the prize-draw event an earlier route seeded.
    await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'local_storage,indexeddb' });
    await load();
    // A NEW reveal for the exercise's one retry: the same first visit, from the start.
    const fresh = async () => {
      await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'local_storage,indexeddb' });
      await load();
    };
    rows.push(await measureRoute({
      route, url, declaration: declarations[route], evaluate, tap, armDelayMs: ARM_DELAY_MS, stubDraw,
      screenless, driver: REVEAL_DRIVERS[route] ?? null, reload: load, fresh,
    }));
  }

  const verdict = aggregate(rows.map((r) => r.verdict));
  const out = { verdict, stubDraw, routes, rows };
  console.log(JSON.stringify(out, null, 2));
  for (const r of rows) {
    const ext = r.hold ? Object.keys(r.hold.extensionRequests ?? {}).length : 0;
    const held = r.hold ? ` [held: ${r.hold.heldDraws} draw call(s); WebGL contexts: ${r.hold.webglContexts}; extensions requested: ${ext}; hold ${r.hold.transitions.join('>')}]` : '';
    console.log(`webgl-pixels: ${r.route} ${r.verdict} -- ${r.reason}${held}${r.retriedAfter ? ` (retried once on a new reveal after: ${r.retriedAfter})` : ''}`);
  }
  console.log(`webgl-pixels: ${rows.length} play route(s) (${games.filter((g) => screenlessPaths.has(g.playRoute)).length} screenless, hold not exercised there) checked for WebGL contexts and draws while held, ${rows.filter((r) => declarations[r.route]?.suspends === 'adapter').length} adapter surface(s) read, verdict ${verdict} (exit ${exitCodeFor(verdict)})`);
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  ws.close();
  process.exit(exitCodeFor(verdict));
}

// Importable for the unit test, runnable as a probe -- the classifier must be testable without a
// browser, and importing this file must not drive one.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
