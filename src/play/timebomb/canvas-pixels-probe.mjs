// RETIRED AS COVERAGE 2026-09-08 (gh#224, ADR-0063 decision 1 withdrawn). What this file asks is now
// asked of EVERY 2D play route on every CI run by the canvas-ink / canvas-ink-control pair in
// scripts/ci-probes.sh, whose route list is derived from the manifest rather than hand-listed. Kept
// on disk, not deleted: an evidence README cites this path as its reproduce command, and the
// per-route detail here is finer than a class-wide leg can be. Do not wire it — reach for it by hand
// when the leg reds on this route and you want to know which screen.
// Does the play surface actually DRAW? (gh#145, owner direction 2026-08-30.)
//
// A canvas that renders nothing looks identical to a working one from every other gate: tsc passes,
// the build passes, the DOM gates pass, and the element is present with the right size. The only
// thing that can tell them apart is the pixels, so this probe starts a real round in a real browser
// and reads the backing store back.
//
// Manual tool, NOT a CI leg (needs Chrome + a served dist), same class as scripts/play-exit-probe.mjs.
//
//   npm run build && npx serve dist -l 4326
//   "/Applications/Google Chrome.app/.../Google Chrome" --headless --remote-debugging-port=9226 ...
//   BASE=http://localhost:4326 node src/play/timebomb/canvas-pixels-probe.mjs 9226 /tmp/shot.png
//
// CALIBRATION, and it is not optional — a probe's first green proves nothing. Stub the renderer's
// paint() to `return;`, rebuild, and run this: it must report drawn:false. Restore, rebuild, run
// again: drawn:true. Both runs are recorded in the ticket.
//
// gh#295 A1: the fuse spark used to be drawn ABOVE the canvas at every size, so a drawn:true read
// still showed an unlit bomb. The ticking read now also reports `spark`: how many device pixels carry
// the spark's core colour, and how many inked pixels touch the top, left and right edges (a clipped
// cord or glow lands there). Exit 0 needs drawn AND sparkInside. The spark is sized from the canvas
// box, so the read is taken at the viewport this probe is told to use:
//   TB_VIEWPORT=390x844 TB_DPR=3 BASE=... node src/play/timebomb/canvas-pixels-probe.mjs 9226
// Default 320x640 at dpr 2, as before. Calibrated on the pre-fix build: spark core 0 at 320x568,
// 390x844 and 1280x800, with the cord inked on the top row.
const [PORT = '9222', SHOT = ''] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:4326';

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

// Both controls sit behind the arm gate (400ms of quiet), so the click has to WAIT for the control to
// arm rather than being forced past it — driving a disabled button would prove nothing about a state
// a player can actually reach.
const CLICK_WHEN_ARMED = (selector) => `
  const deadlineAt = performance.now() + 4000;
  let el = null;
  while (performance.now() < deadlineAt) {
    el = document.querySelector('${selector}');
    if (el && !el.disabled) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!el || el.disabled) return { clicked: false, selector: '${selector}' };
  el.click();
  return { clicked: true, selector: '${selector}' };`;

// The readback. Coverage is the share of pixels with any alpha at all; `distinctColours` counts
// quantised colours, because a solid fill would pass a coverage-only test while proving no gradient,
// no shadow and no highlight ever ran.
const READ_PIXELS = `
  const c = document.getElementById('tb-canvas');
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
  // gh#295 A1. Core colour of the spark (a pale yellow); nothing else on the ticking frame is that
  // yellow with that little blue. Edge ink: any pixel with alpha on the top row, the left column or the
  // right column -- the bomb, cord and glow are all meant to sit inside the box. The bottom row is not
  // read: the ground shadow is a gradient that fades to nothing and may legitimately reach it.
  let sparkCore = 0;
  const edge = { top: 0, left: 0, right: 0 };
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    const r = img[i], g = img[i + 1], b = img[i + 2], a = img[i + 3];
    if (a > 200 && r > 240 && g > 215 && b > 110 && b < 170) sparkCore++;
    if (a > 8) {
      const x = p % c.width, y = Math.floor(p / c.width);
      if (y === 0) edge.top++;
      if (x === 0) edge.left++;
      if (x === c.width - 1) edge.right++;
    }
  }
  return {
    spark: { core: sparkCore, edge },
    present: true, hidden: c.hidden,
    backingStore: { w: c.width, h: c.height },
    cssBox: { w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) },
    devicePixelRatio,
    coverage: Number((painted / total).toFixed(4)),
    distinctColours: colours.size,
    // gh#151: this width is the fuse bar's fixed-cycle shimmer, NOT the time left — reported as a
    // liveness read only. Nothing here may be used to infer the remaining fuse.
    fuseShimmerWidth: document.getElementById('tb-fuse')?.style.width ?? null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };`;

const url = `${BASE}/game/timebomb/play/`;
const reduced = process.env.TB_REDUCED === '1';
// The emulated media feature must be set BEFORE the page runs: the renderer reads the query once at
// start and then listens, but the engine's own reduced-motion read happens at mount.
if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const p = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url });
await p;
const [VW, VH] = (process.env.TB_VIEWPORT ?? '320x640').split('x').map(Number);
const DPR = Number(process.env.TB_DPR ?? '2');
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: VW < 1100 });
await sleep(900);

const out = { url, reducedRequested: reduced, viewport: { w: VW, h: VH, dpr: DPR } };
// gh#264: the start button is the shared player screen's now (ADR-0071), mounted into #tb-setup.
out.begin = (await evaluate(CLICK_WHEN_ARMED('#tb-setup [data-ps=start]'))).value;
await sleep(700);
out.start = (await evaluate(CLICK_WHEN_ARMED('#tb-start'))).value;
// Fixed settle, calibrated to this machine, not a poll -- see the longer note on the boom settle
// below for the concrete hazard this shape already caused once (gh#189 box 38). Manual tool only,
// not wired into CI today; if it ever is, this becomes poll-until-pixels-stop-changing.
await sleep(1500);
out.pixels = (await evaluate(READ_PIXELS)).value;

// TB_FULL_ROUND=1 plays the round out: the fuse is 30-90s of real time (gh#151), so this leg is slow on
// purpose. It answers the only question the pixel readback cannot — can a player finish a round on
// this surface, and does the result reach a screen reader.
if (process.env.TB_FULL_ROUND === '1') {
  out.pass = (await evaluate(`
    const b = document.getElementById('tb-pass');
    if (!b || b.disabled) return { passed: false };
    b.click();
    return { passed: true, holder: document.querySelector('.tb-holder-name')?.textContent ?? null };`)).value;
  out.round = (await evaluate(`
    const until = performance.now() + 120000; // must outlive the 90s ceiling, or a long fuse reads as a hang
    while (performance.now() < until) {
      if (document.getElementById('tb-again')) {
        return {
          detonated: true,
          liveRegion: document.getElementById('tb-live')?.textContent ?? null,
          stageText: document.getElementById('tb-stage')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
          canvasHidden: document.getElementById('tb-canvas')?.hidden ?? null,
        };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { detonated: false };`)).value;
  // Settle before the readback. The loop above returns the instant #tb-again appears, which is one
  // rAF EARLIER than the renderer's boom frame — the surface flip clears the backing store and
  // repaints on the next frame. Read immediately and the boom leg returns the ticking image, which is
  // indistinguishable from "the explosion never drew". Measured on this build under reduced motion:
  // no settle gave coverage 0.3756 / 163 colours (identical to the ticking read), a 1500ms settle
  // gave 0.6619 / 617. Full motion hid it, because every frame repaints there anyway.
  // Ceiling (gh#189 box 38): 1500ms is calibrated to this machine, not a guarantee on a slower one.
  // Not wired into CI today -- manual evidence probe only. If it ever is wired in, replace this fixed
  // sleep with a poll that waits until the readback stops changing, instead of raising the number.
  await sleep(1500);
  out.pixelsAfterBoom = (await evaluate(READ_PIXELS)).value;
}

const px = out.pixels ?? {};
// A blank canvas reports coverage 0 and one colour. Thresholds sit far above that and far below a
// full-bleed fill, so neither "nothing ran" nor "one flat rect" can pass.
out.drawn = px.present === true && px.hidden === false && px.coverage > 0.02 && px.distinctColours >= 8;
// A lit spark is a disc of a few CSS px; 12 device px is far below its area at dpr 1 and far above 0.
const sp = px.spark ?? { core: 0, edge: { top: 1, left: 1, right: 1 } };
out.sparkInside = sp.core >= 12 && sp.edge.top === 0 && sp.edge.left === 0 && sp.edge.right === 0;

if (SHOT) {
  const { writeFile } = await import('node:fs/promises');
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(SHOT, Buffer.from(s.result.data, 'base64'));
  out.screenshot = SHOT;
}

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(out.drawn && out.sparkInside ? 0 : 1);
