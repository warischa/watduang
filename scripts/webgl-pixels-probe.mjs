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
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateResult } from './cdp-evaluate-result.mjs';

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

// ---- the measured set ---------------------------------------------------------------------------

/** The routes that take a WebGL context, derived from the ported engine files rather than from a
 *  list someone remembers to update -- a new WebGL route is covered the day it lands.
 *  ponytail: main.js only, matched on the CALLING shape. The .ts side of a route discusses
 *  getContext('webgl') in prose, so scanning it would enumerate routes that draw in 2D; and a route
 *  whose WebGL call lives somewhere other than its extracted engine file would be missed here. Widen
 *  the scan when such a route exists, not before. */
export function webglRoutes(playDir) {
  const shape = /\.getContext\(\s*['"](?:experimental-)?webgl/;
  return readdirSync(playDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((id) => {
      try {
        return shape.test(readFileSync(join(playDir, id, 'main.js'), 'utf8'));
      } catch {
        return false;
      }
    })
    .sort();
}

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
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
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
  // Same code path as a live run -- only the draw calls change.
  const proto = Object.getPrototypeOf(gl);
  for (const name of ['drawArrays', 'drawElements']) if (proto[name]) proto[name] = function () {};
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

// ---- the run ------------------------------------------------------------------------------------

async function main() {
  const BASE = process.env.BASE ?? process.env.PROBE_BASE ?? 'http://localhost:4351';
  const PORT = process.env.CDP_PORT ?? '9333';
  const stubDraw = process.env.STUB_DRAW === '1';
  const playDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'play');
  const routes = webglRoutes(playDir);

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
    const p = new Promise((r) => { loadResolve = r; });
    await send('Page.navigate', { url });
    await p;
    const read = await evaluate(READBACK(stubDraw));
    // An evaluate that did not answer is not a measurement of anything, least of all of this
    // runner's GPU: keep contextLive unset so classify reports the read as the cause.
    const measured = read.error
      ? { contextLive: null, nonBlank: null, readError: read.error }
      : read.value ?? { contextLive: false, nonBlank: null, error: 'no value returned' };
    rows.push({ route, url, ...measured, ...classify(measured) });
  }

  const verdict = aggregate(rows.map((r) => r.verdict));
  const out = { verdict, stubDraw, routes, rows };
  console.log(JSON.stringify(out, null, 2));
  for (const r of rows) console.log(`webgl-pixels: ${r.route} ${r.verdict} -- ${r.reason}`);
  console.log(`webgl-pixels: ${rows.length} WebGL route(s) read, verdict ${verdict} (exit ${exitCodeFor(verdict)})`);
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  ws.close();
  process.exit(exitCodeFor(verdict));
}

// Importable for the unit test, runnable as a probe -- the classifier must be testable without a
// browser, and importing this file must not drive one.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
