// Does zero-trigger's play surface actually DRAW? (gh#163 box 5, ADR-0051.)
//
// Same class of question, same shape, as src/play/timebomb/canvas-pixels-probe.mjs: a canvas that
// renders nothing looks identical to a working one from every other gate -- tsc passes, the build
// passes, the DOM gates pass, and the element is present with the right size. Only the pixels can
// tell them apart, so this drives a real round in a real browser and reads the backing store back.
//
// WHAT IS DIFFERENT HERE. #fx-canvas is not a play surface that is always painted; it is the
// particle and screen-shake layer, and it is legitimately EMPTY on the menu and between bursts --
// renderLoop() clears it every frame. So the probe plays a round to the moment a burst exists
// (start the clock, wait past the 1s anti-cheat lock, stop it) and reads immediately after. Reading
// early, or a second too late, measures a canvas that is correctly blank.
//
// Manual tool, NOT a CI leg (needs Chrome + a served site), same class as scripts/play-exit-probe.mjs.
//
//   npx astro dev --port 4327          # or: npx serve dist -l 4327 against a fresh build
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
//     --remote-debugging-port=9227 --user-data-dir=/tmp/zt-probe about:blank &
//   BASE=http://localhost:4327 node src/play/zero-trigger/canvas-pixels-probe.mjs 9227 /tmp/shot.png
//
// CALIBRATION, and it is not optional -- a probe's first green proves nothing. `ZT_STUB_FX=1` blanks
// the 2D context's two paint primitives (fillRect and fill) before the page runs, leaving everything
// else -- the round, the canvas, its size, getImageData -- exactly as it was. The apparatus must then
// report drawn:false and exit non-zero. Run BOTH legs; a green with no red beside it is one reading.
const [PORT = '9222', SHOT = ''] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:4327';

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

// The big action button is disabled for the first second of every round (the anti-cheat lock), so the
// click WAITS for it to arm rather than being forced past it -- driving a disabled control would
// prove nothing about a state a player can actually reach.
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
  return { clicked: true, selector: '${selector}', label: document.getElementById('action-btn-main-text')?.textContent ?? null };`;

// The readback. Coverage is the share of pixels with any alpha at all; `distinctColours` counts
// quantised colours, because a solid fill would pass a coverage-only test while proving that no
// palette, no alpha fade and no per-particle size ever ran.
const READ_PIXELS = `
  const c = document.getElementById('fx-canvas');
  if (!c) return { present: false };
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  let painted = 0;
  const colours = new Set();
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] > 8) {
      painted++;
      colours.add((img[i] >> 4) + ',' + (img[i + 1] >> 4) + ',' + (img[i + 2] >> 4) + ',' + (img[i + 3] >> 5));
    }
  }
  const total = img.length / 4;
  return {
    present: true, hidden: c.hidden,
    backingStore: { w: c.width, h: c.height },
    cssBox: { w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) },
    devicePixelRatio,
    coverage: Number((painted / total).toFixed(5)),
    distinctColours: colours.size,
    liveParticles: window.game?.fx?.particles?.length ?? null,
    screen: document.querySelector('.screen.active')?.id ?? null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };`;

const url = `${BASE}/game/zero-trigger/play/`;
const reduced = process.env.ZT_REDUCED === '1';
const stubbed = process.env.ZT_STUB_FX === '1';
// The other half of ADR-0051: the page must stay PLAYABLE when the context is unavailable, not just
// unpainted. This leg makes getContext('2d') return null for the fx layer the way a device that
// refuses one would, and then asks whether a round can still be started and stopped. It reports on
// `playable` instead of on pixels, because there are correctly none.
const nullCtx = process.env.ZT_NULL_CTX === '1';
// Both of these must be in place BEFORE the page runs: main.js reads the motion query at module
// evaluation, and a paint stub applied after the first frame would measure a half-painted canvas.
if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
if (stubbed) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      const proto = CanvasRenderingContext2D.prototype;
      // Only the two primitives every particle in main.js paints through. clearRect, save/restore,
      // getImageData and the canvas element itself are untouched, so the ONLY difference between
      // this leg and the real one is whether ink lands.
      proto.fillRect = function () {};
      proto.fill = function () {};`,
  });
}
if (nullCtx) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        // Only the fx layer, so the probe's own readback keeps working on any other canvas.
        if (this.id === 'fx-canvas') return null;
        return real.call(this, type, ...rest);
      };`,
  });
}
const p = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url });
await p;
await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
await sleep(1200);

const out = { url, reducedRequested: reduced, paintStubbed: stubbed, nullContext: nullCtx };
// A fresh device has no roster, so the route boots on its menu and quick-start is the shortest path
// a player has into a round.
out.quickStart = (await evaluate(CLICK_WHEN_ARMED('#btn-quick-start'))).value;
await sleep(600);
// Nothing has burst yet: the burst only follows a stopped clock, so this read is the baseline that
// proves the coverage below came from the round and not from something painted at load.
out.pixelsBeforeBurst = (await evaluate(READ_PIXELS)).value;
out.startClock = (await evaluate(CLICK_WHEN_ARMED('#btn-big-action'))).value;
// Past the 1000ms anti-cheat lock, or the stop click lands on a disabled control.
await sleep(1400);
out.stopClock = (await evaluate(CLICK_WHEN_ARMED('#btn-big-action'))).value;
// Sparkles decay at 0.02-0.04 per frame and are gone inside a second: read while they are alive.
await sleep(220);
out.pixels = (await evaluate(READ_PIXELS)).value;

if (nullCtx) {
  // Playable means: the round screen is up, the clock ran, and the stop produced a losing/safe
  // verdict. The canvas contributes nothing to any of those, which is the whole point.
  out.playable = (await evaluate(`
    return {
      screen: document.querySelector('.screen.active')?.id ?? null,
      lcd: document.getElementById('lcd-timer-display')?.textContent ?? null,
      resultModalOpen: document.getElementById('modal-result')?.classList.contains('active') ?? null,
      bodyHasContent: document.getElementById('app-container') !== null,
      // NOT \`window.game?.fx?.ctx ?? null\`: an engine that threw in its constructor leaves
      // window.game undefined, and \`?? null\` would report that as the very null this leg is
      // looking for -- a broken page and a guarded one would read identically.
      engineBuilt: typeof window.game === 'object' && window.game !== null,
      fxContextIsNull: window.game?.fx?.ctx === null,
    };`)).value;
  const ok = out.playable?.screen === 'screen-game'
    && out.playable?.bodyHasContent === true
    && out.playable?.engineBuilt === true
    && out.playable?.fxContextIsNull === true
    && out.stopClock?.clicked === true;
  console.log(JSON.stringify(out, null, 2));
  ws.close();
  process.exit(ok ? 0 : 1);
}

const px = out.pixels ?? {};
// A blank canvas reports coverage 0 and zero colours. The floor sits far above that and far below a
// full-bleed fill, so neither "nothing ran" nor "one flat rect" can pass. The colour floor is what
// the sparkle and explosion palettes (4 colours each, faded across per-particle alpha) clear easily.
//
// The reduced-motion leg gets its own floor, and that is not the threshold being relaxed to make a
// leg pass: under `(prefers-reduced-motion: reduce)` main.js scales every particle count and speed by
// its own motionScale(), so LESS ink is the correct result and a fixed floor would score the working
// reduced path as a blank canvas. The floor is scaled by the same constant, so what is still asserted
// is exactly what ADR-0051 requires -- the canvas is REDUCED, never absent. Both legs measured on
// this build: full 0.005x coverage / 69 colours, reduced 0.001x / 42, stubbed 0 / 0.
const REDUCED_MOTION_SCALE = 0.3;
const floor = 0.0015 * (reduced ? REDUCED_MOTION_SCALE : 1);
out.coverageFloor = floor;
out.drawn = px.present === true && px.hidden === false && px.coverage > floor && px.distinctColours >= 6;

if (SHOT) {
  const { writeFile } = await import('node:fs/promises');
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(SHOT, Buffer.from(s.result.data, 'base64'));
  out.screenshot = SHOT;
}

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(out.drawn ? 0 : 1);
