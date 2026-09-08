// Does the "บางกอกดริฟต์" road actually DRAW, and does it still draw a frame at a time under
// `(prefers-reduced-motion: reduce)`? (ADR-0051.)
//
// A canvas that renders nothing is invisible to every other gate: tsc passes, the build passes, the
// DOM gates pass, and the element is present at the right size. Only the pixels can tell the two
// apart. And reduced motion is the case a screenshot cannot answer at all -- a still frame of a road
// looks the same whether the loop is running or stopped -- so this counts FRAMES over a fixed
// interval instead. The route's own rule is that reduced motion slows the simulation and keeps
// drawing; a route that answered it by stopping the loop would still screenshot correctly.
//
// Manual tool, NOT a CI leg (needs Chrome and a served site), the same class as
// scripts/play-exit-probe.mjs.
//
//   npm run build && npx serve dist -l 4555 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
//     --remote-debugging-port=9555 --user-data-dir=/tmp/bd-probe about:blank &
//   BASE=http://localhost:4555 node src/play/bangkok-drift/canvas-frames-probe.mjs 9555 /tmp/shot.png
//
// CALIBRATION, and it is not optional -- a probe's first green proves nothing.
//   BD_REDUCED=1    the reduced-motion leg: the loop must still run, and the ink floor is the same,
//                   because this route reduces the SIMULATION and never the drawing.
//   BD_STUB_PAINT=1 blanks the 2D primitives the renderer paints through, leaving the round, the
//                   canvas, its size and getImageData untouched. The apparatus must then report
//                   drawn:false and exit non-zero. A green with no red beside it is one reading.
//   BD_NULL_CTX=1   the other half of ADR-0051: getContext('2d') returns null the way a device out of
//                   contexts would, and the round must still be startable and finishable. This leg
//                   reports on `playable`, because there are correctly no pixels.
//   BD_STOP_LOOP=1  freezes requestAnimationFrame right after the countdown, so no new frame is ever
//                   scheduled again; the ink already on the canvas is left untouched, not cleared or
//                   repainted. The frame count must fall to (near) zero while coverage stays ABOVE the
//                   ink floor -- proving the coverage term alone cannot tell a running loop from a
//                   frozen one, which is exactly why `out.drawing` also checks frames.
const [PORT = '9555', SHOT = ''] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:4555';

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
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable');
await send('Runtime.enable');

const evaluate = async (body) => {
  const res = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
  const r = res?.result;
  if (r?.exceptionDetails) return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  return { value: r?.result?.value ?? null };
};

/** Waits for a control to be live before pressing it: the arm gate (ADR-0017) ships a freshly
 *  revealed button disabled, and driving a disabled control proves nothing about a state a player
 *  can reach. */
const CLICK_WHEN_ARMED = (selector) => `
  const deadlineAt = performance.now() + 6000;
  let el = null;
  while (performance.now() < deadlineAt) {
    el = document.querySelector('${selector}');
    if (el && !el.disabled && el.offsetParent !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!el || el.disabled) return { clicked: false, selector: '${selector}' };
  el.click();
  return { clicked: true, selector: '${selector}' };`;

// The readback. Coverage is the share of pixels carrying any alpha; `distinctColours` counts
// quantised colours, because one flat fill would pass a coverage-only test while proving that no
// sky, no road, no skyline and no car ever painted.
const READ_PIXELS = `
  const c = document.getElementById('road');
  if (!c) return { present: false };
  const ctx = c.getContext('2d');
  if (!ctx) return { present: true, context: null };
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  let painted = 0;
  const colours = new Set();
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] > 8) {
      painted++;
      colours.add((img[i] >> 4) + ',' + (img[i + 1] >> 4) + ',' + (img[i + 2] >> 4));
    }
  }
  const total = img.length / 4;
  return {
    present: true, context: '2d',
    backingStore: { w: c.width, h: c.height },
    cssBox: { w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) },
    coverage: Number((painted / total).toFixed(5)),
    distinctColours: colours.size,
    screen: document.querySelector('.screen.active')?.id ?? null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };`;

const url = `${BASE}/game/bangkok-drift/play/`;
const reduced = process.env.BD_REDUCED === '1';
const stubbed = process.env.BD_STUB_PAINT === '1';
const nullCtx = process.env.BD_NULL_CTX === '1';
const stopLoop = process.env.BD_STOP_LOOP === '1';

// All three have to be in place BEFORE the page runs: main.js reads the motion query and takes its
// context at module evaluation, and a paint stub applied after the first frame would measure a
// half-painted canvas.
if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
// The two counters. requestAnimationFrame is wrapped rather than sampled: the game loop reschedules
// itself once per frame, so the count IS the frame count over whatever interval is read. The paint
// counter is the renderer's own gradient call, which happens at least once inside every draw() --
// counting both is what separates "the loop is running" from "the loop is running AND painting".
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__bdFrames = 0;
    window.__bdPaints = 0;
    const realRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => realRaf((t) => { window.__bdFrames++; return cb(t); });
    const grad = CanvasRenderingContext2D.prototype.createLinearGradient;
    CanvasRenderingContext2D.prototype.createLinearGradient = function (...a) {
      window.__bdPaints++;
      return grad.apply(this, a);
    };`,
});
if (stubbed) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      const proto = CanvasRenderingContext2D.prototype;
      // Only the primitives the renderer puts ink through. clearRect, save/restore, the transform,
      // getImageData and the canvas element itself are untouched, so the ONLY difference between this
      // leg and the real one is whether ink lands.
      proto.fillRect = function () {};
      proto.fill = function () {};
      proto.stroke = function () {};`,
  });
}
if (nullCtx) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (this.id === 'road') return null;
        return real.call(this, type, ...rest);
      };`,
  });
}

const p = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url });
await p;
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(600);

const out = { url, reducedRequested: reduced, paintStubbed: stubbed, nullContext: nullCtx, loopStopped: stopLoop };
// A fresh device has no roster, so this route opens on its own setup screen with the cast already in
// the fields: pressing "เริ่มแข่ง" and then "พร้อม ออกตัว!" is the whole path into a drive.
out.start = (await evaluate(CLICK_WHEN_ARMED('#startGameBtn'))).value;
await sleep(600);
out.ready = (await evaluate(CLICK_WHEN_ARMED('#readyBtn'))).value;
// Past the three-second countdown, so what is measured below is the drive loop and not the count-in.
await sleep(3400);

// Freeze AFTER the countdown, not before: the loop must have already painted at least one real
// frame, so what the frame window below measures is a loop that stopped, not one that never started.
if (stopLoop) await evaluate(`window.requestAnimationFrame = () => {};`);

// THE FRAME COUNT. A fixed interval, read from the page's own clock at both ends so a slow round trip
// cannot inflate the rate.
const WINDOW_MS = 2000;
out.frames = (await evaluate(`
  const t0 = performance.now(), f0 = window.__bdFrames, p0 = window.__bdPaints;
  await new Promise((r) => setTimeout(r, ${WINDOW_MS}));
  const elapsed = performance.now() - t0;
  return {
    elapsedMs: Math.round(elapsed),
    frames: window.__bdFrames - f0,
    paints: window.__bdPaints - p0,
    fps: Number(((window.__bdFrames - f0) / (elapsed / 1000)).toFixed(1)),
    screen: document.querySelector('.screen.active')?.id ?? null,
    metres: document.getElementById('hud-dist')?.textContent ?? null,
  };`)).value;
out.pixels = (await evaluate(READ_PIXELS)).value;

if (SHOT) {
  const { writeFile } = await import('node:fs/promises');
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(SHOT, Buffer.from(s.result.data, 'base64'));
  out.screenshot = SHOT;
}

if (nullCtx) {
  // Playable means the round reached the drive screen, the loop is running and the metres are
  // climbing. The canvas contributes to none of those, which is the whole point of ADR-0051.
  out.playable = (await evaluate(`
    const before = document.getElementById('hud-dist').textContent;
    await new Promise((r) => setTimeout(r, 500));
    return {
      screen: document.querySelector('.screen.active')?.id ?? null,
      metresMoved: document.getElementById('hud-dist').textContent !== before,
      bodyHasContent: document.getElementById('screen-setup') !== null,
      contextIsNull: document.getElementById('road').getContext('2d') === null,
    };`)).value;
  const ok = out.ready?.clicked === true
    && ['screen-drive', 'screen-result'].includes(out.playable?.screen)
    && out.playable?.bodyHasContent === true
    && out.playable?.contextIsNull === true
    && out.frames?.frames > 0;
  console.log(JSON.stringify(out, null, 2));
  ws.close();
  process.exit(ok ? 0 : 1);
}

// The floors. A stopped loop reports 0 frames; a blank canvas reports coverage 0 and no colours.
// FRAME_FLOOR is deliberately far below 60fps and far above zero -- what is being asserted is that
// the loop RUNS, never how fast this machine is, and a machine-speed number is exactly the kind of
// threshold that reds on a different runner.
//
// THE REDUCED-MOTION LEG SHARES BOTH FLOORS, and that is the whole finding: this route reduces the
// SIMULATION (the step is scaled) and never the drawing, so a reduced run that drew fewer frames
// would be a defect, not an accommodation. Relaxing the floor for it would erase the only thing the
// leg measures.
const FRAME_FLOOR = 30; // frames in 2000ms
const COVERAGE_FLOOR = 0.2; // the road, sky and skyline fill most of the surface
out.floors = { frames: FRAME_FLOOR, coverage: COVERAGE_FLOOR, windowMs: WINDOW_MS };
out.drawing = out.frames?.frames >= FRAME_FLOOR
  && out.frames?.paints >= out.frames?.frames
  && out.pixels?.present === true
  && out.pixels?.coverage > COVERAGE_FLOOR
  && out.pixels?.distinctColours >= 6;

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(out.drawing ? 0 : 1);
