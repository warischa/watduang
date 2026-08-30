// Does the short-stick play surface actually DRAW? (owner request 2026-08-30.)
//
// A canvas that renders nothing looks identical to a working one from every other gate: tsc passes,
// the build passes, the DOM gates pass, and the element is present with the right size. The only thing
// that can tell them apart is the pixels, so this probe plays a real round in a real browser and reads
// the backing store back. Same shape as src/play/timebomb/canvas-pixels-probe.mjs.
//
// Manual tool, NOT a CI leg (needs Chrome + a served dist), same class as scripts/play-exit-probe.mjs.
//
//   npm run build && npx serve dist -l 4327
//   "/Applications/Google Chrome.app/.../Google Chrome" --headless --remote-debugging-port=9227 ...
//   BASE=http://localhost:4327 node src/play/short-stick/canvas-pixels-probe.mjs 9227 /tmp/shot.png
//
// CALIBRATION, and it is not optional -- a probe's first green proves nothing. Stub the renderer's
// drawStick() to `return;`, rebuild, and run this: it must report drawn:false and exit non-zero.
// Restore, rebuild, run again: drawn:true. Both runs are recorded in the return.
//
// SS_REDUCED=1 emulates prefers-reduced-motion: reduce before the page runs.
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

// PlayExit.astro's arm gate holds this route's chrome, and the mockup's own controls are plain buttons.
// Waiting for the control rather than forcing it keeps every click one a player could actually make.
const CLICK_WHEN_READY = (selector) => `
  const deadlineAt = performance.now() + 4000;
  let el = null;
  while (performance.now() < deadlineAt) {
    el = document.querySelector('${selector}');
    if (el && !el.disabled && el.getClientRects().length > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!el || el.disabled) return { clicked: false, selector: '${selector}' };
  el.click();
  return { clicked: true, selector: '${selector}' };`;

// The readback. Coverage is the share of pixels with any alpha at all; `distinctColours` counts
// quantised colours, because a solid fill would pass a coverage-only test while proving no gradient,
// no shadow and no cut end ever ran.
const READ_PIXELS = `
  const c = document.getElementById('stick-canvas');
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
    coverage: Number((painted / total).toFixed(4)),
    distinctColours: colours.size,
    sticks: document.querySelectorAll('#stick-grid .straw-unit').length,
    used: document.querySelectorAll('#stick-grid .straw-unit.used').length,
    liveRegion: document.getElementById('stick-live')?.textContent ?? null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };`;

// Taps the first stick that is still in play, through the BUTTON -- the same element a finger hits.
// Insetting is unnecessary here because .click() is dispatched on the element, not at a coordinate.
const DRAW_ONE = `
  const unit = document.querySelector('#stick-grid .straw-unit:not(.used)');
  const btn = unit?.querySelector('.straw-btn');
  if (!btn || btn.disabled) return { drew: false };
  const before = document.querySelectorAll('#stick-grid .straw-unit.used').length;
  btn.click();
  await new Promise((r) => setTimeout(r, 900));
  return {
    drew: true,
    usedBefore: before,
    usedAfter: document.querySelectorAll('#stick-grid .straw-unit.used').length,
    resultOpen: document.getElementById('view-result')?.classList.contains('active') ?? false,
    hazardOpen: document.getElementById('short-reveal-dialog')?.open ?? false,
  };`;

const url = `${BASE}/game/short-stick/play/`;
const reduced = process.env.SS_REDUCED === '1';
// The emulated media feature must be set BEFORE the page runs: the renderer reads the query once at
// start and then listens.
if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const p = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url });
await p;
await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
await sleep(600);

const out = { url, reducedRequested: reduced };
out.openSetup = (await evaluate(CLICK_WHEN_READY('#btn-start-setup'))).value;
await sleep(400);
out.begin = (await evaluate(CLICK_WHEN_READY('#btn-begin-game'))).value;
await sleep(900);
out.pixelsAtBoard = (await evaluate(READ_PIXELS)).value;

// The reveal is the moment the round turns on, so the picture is read again AFTER a stick is drawn:
// a renderer that painted the opening board and then froze would pass a single read.
out.draw = (await evaluate(DRAW_ONE)).value;
out.pixelsAfterDraw = (await evaluate(READ_PIXELS)).value;

// SS_FULL_ROUND=1 plays the round to its end. It answers the only question the pixel readback cannot
// -- can a player actually finish a round on this surface, does the short stick's reveal reach the
// canvas, and does the result reach a screen reader.
if (process.env.SS_FULL_ROUND === '1') {
  // Leg 1: tap until the short stick surfaces. Stops WITH the hazard dialog still open, because that
  // is the only moment the revealed short stick is on the board and the canvas is still on screen.
  out.toHazard = (await evaluate(`
    let taps = 0;
    for (let i = 0; i < 12; i += 1) {
      if (document.getElementById('short-reveal-dialog')?.open) break;
      const btn = document.querySelector('#stick-grid .straw-unit:not(.used) .straw-btn');
      if (!btn || btn.disabled) { await new Promise((r) => setTimeout(r, 300)); continue; }
      btn.click();
      taps += 1;
      await new Promise((r) => setTimeout(r, 900));
    }
    return {
      taps,
      hazardOpen: document.getElementById('short-reveal-dialog')?.open ?? false,
      shortRevealed: document.querySelectorAll('#stick-grid .straw-unit.used.is-short').length,
    };`)).value;
  out.pixelsAtHazard = (await evaluate(READ_PIXELS)).value;

  // Leg 2: close the reveal and land on the result screen -- the round actually finishing.
  out.finish = (await evaluate(`
    document.getElementById('btn-close-hazard')?.click();
    await new Promise((r) => setTimeout(r, 600));
    const de = document.documentElement;
    return {
      finished: document.getElementById('view-result')?.classList.contains('active') ?? false,
      liveRegion: document.getElementById('stick-live')?.textContent ?? null,
      resultTitle: document.getElementById('result-loser-title')?.textContent ?? null,
      historyRows: document.querySelectorAll('#history-rows-container .history-row').length,
      canvasHidden: document.getElementById('stick-canvas')?.hidden ?? null,
      innerWidth,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      overflowing: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > de.clientWidth + 0.5).length,
    };`)).value;
}

const a = out.pixelsAtBoard ?? {};
const b = out.pixelsAfterDraw ?? {};
// A blank canvas reports coverage 0 and one colour. Thresholds sit far above that and far below a
// full-bleed fill, so neither "nothing ran" nor "one flat rect" can pass.
const painted = (px) => px.present === true && px.hidden === false && px.coverage > 0.01 && px.distinctColours >= 8;
out.drawn = painted(a) && painted(b);
out.revealChangedThePicture = a.coverage !== b.coverage || a.distinctColours !== b.distinctColours;

if (SHOT) {
  const { writeFile } = await import('node:fs/promises');
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(SHOT, Buffer.from(s.result.data, 'base64'));
  out.screenshot = SHOT;
}

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(out.drawn ? 0 : 1);
