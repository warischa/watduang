// Does the wire-snip-panic play surface actually DRAW, and does the round survive without it? (gh#162.)
//
// Two questions, because this route's canvas answers to two rules at once:
//   ADR-0051 -- a canvas that renders nothing is indistinguishable from a working one to every other
//     gate: tsc passes, the build passes, the DOM gates pass, the element is present and the right
//     size. Only the pixels can tell them apart, so this drives a real turn in a real browser and
//     reads the backing store back.
//   ADR-0051 again -- and a play route must never blank the page. `getContext('2d')` returning null
//     used to throw at main.js's top level and take the entire game down with it, so every leg here
//     also asserts the round is still REACHABLE, not just that pixels landed.
//
// Manual tool, NOT a CI leg (needs Chrome + a served route), same class as scripts/play-exit-probe.mjs
// and the timebomb/short-stick probes this is shaped after.
//
//   npx astro dev --port 4331          # or: npm run build && npx serve dist -l 4331
//   "/Applications/Google Chrome.app/.../Google Chrome" --headless --remote-debugging-port=9231 ...
//   BASE=http://localhost:4331 node src/play/wire-snip-panic/canvas-pixels-probe.mjs 9231 /tmp/shot.png
//
// CALIBRATION, and it is not optional -- a probe's first green proves nothing:
//   WSP_STUB=1 makes HTMLCanvasElement.prototype.getContext return null BEFORE the page's own script
//   runs. That is the exact failure ADR-0051 is about, injected rather than hand-edited into the
//   source, so the must-red leg needs no rebuild and cannot be left behind by accident. It must
//   report drawn:false and exit non-zero -- while still reporting playable:true, which is the guard
//   being proved. Both runs are recorded in the return.
//
//   WSP_REDUCED=1 emulates prefers-reduced-motion: reduce before the page runs. The canvas must still
//   paint (ADR-0046 reduces motion, it does not delete it) and the softened keyframes must be the
//   ones in force.
const [PORT = '9222', SHOT = ''] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:4331';

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
  if (res?.exceptionDetails) return { error: res.exceptionDetails.exception?.description ?? res.exceptionDetails.text };
  return { value: r?.result?.value ?? null };
};

// Controls sit behind the shell's arm gate, so a click WAITS for the control to arm rather than being
// forced past it -- driving a disabled button would prove nothing about a state a player can reach.
const CLICK_WHEN_ARMED = (selector) => `
  const deadlineAt = performance.now() + 5000;
  let el = null;
  while (performance.now() < deadlineAt) {
    el = document.querySelector('${selector}');
    if (el && !el.disabled && el.offsetParent !== null) break;
    el = null;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!el) return { clicked: false, selector: '${selector}' };
  el.click();
  return { clicked: true, selector: '${selector}' };`;

// The readback. Coverage is the share of pixels with any alpha at all; `distinctColours` counts
// quantised colours, because a solid fill would pass a coverage-only test while proving that no spark,
// no colour and no fade ever ran.
//
// SAMPLED OVER TIME, not once. This canvas is empty at rest -- the sparks are spawned per flashed
// wire and each one fades in well under a second -- so a single read lands wherever it lands and a
// working surface can look blank. `SAMPLE_PIXELS` reads repeatedly and keeps the busiest frame.
const SAMPLE_PIXELS = (samples, gapMs) => `
  let best = null;
  for (let i = 0; i < ${samples}; i++) {
    const shot = await (async () => { ${READ_PIXELS_BODY} })();
    if (!best || (shot.coverage ?? -1) > (best.coverage ?? -1)) best = shot;
    await new Promise((r) => setTimeout(r, ${gapMs}));
  }
  return best;`;

const READ_PIXELS_BODY = `
  const c = document.getElementById('particle-canvas');
  if (!c) return { present: false };
  const ctx = c.getContext('2d');
  if (!ctx) return { present: true, context2d: false };
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
    present: true, context2d: true, hidden: c.hidden,
    backingStore: { w: c.width, h: c.height },
    cssBox: { w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) },
    devicePixelRatio,
    coverage: Number((painted / total).toFixed(4)),
    distinctColours: colours.size,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };`;

// ADR-0046's CSS half, read as COMPUTED style rather than as text in a file: which keyframes are in
// force right now. Under reduced motion these must be the softened ones.
const READ_MOTION = `
  const named = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).animationName : null;
  };
  return {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    ledBlink: named('.menu-led-display'),
    bombCoreGlowDuration: (() => {
      const el = document.querySelector('.menu-bomb-core');
      return el ? getComputedStyle(el).animationDuration : null;
    })(),
  };`;

const url = `${BASE}/game/wire-snip-panic/play/`;
const stubbed = process.env.WSP_STUB === '1';
const reduced = process.env.WSP_REDUCED === '1';

// The emulated media feature must be set BEFORE the page runs: main.js reads the query once at mount
// and then listens, so a switch flipped after load exercises the listener, not the mount path.
if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
// The must-red injection. Runs before ANY page script, so main.js sees exactly what a device out of
// context slots would hand it.
if (stubbed) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'HTMLCanvasElement.prototype.getContext = function () { return null; };',
  });
}

// A roster left in localStorage by an earlier run changes which screen this opens on: roster-bridge
// drives the setup controls itself when a saved group exists, so the probe's own clicks find the
// button already gone and the two runs are no longer the same experiment.
await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'local_storage' });

const p = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url });
await p;
await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
await sleep(900);

const out = { url, stubRequested: stubbed, reducedRequested: reduced };
out.motion = (await evaluate(READ_MOTION)).value;
out.openSetup = (await evaluate(CLICK_WHEN_ARMED('#btn-menu-start'))).value;
await sleep(400);
// The seats only exist once the setup view has rendered. Zero rows means main.js died before it could
// render them -- which is the blank-page failure, whatever the canvas did.
out.seats = (await evaluate(`
  return {
    rows: document.querySelectorAll('#player-list-container .player-row').length,
    avatars: [...document.querySelectorAll('#player-list-container .player-avatar')].map((el) => el.textContent.trim()),
  };`)).value;
out.startMatch = (await evaluate(CLICK_WHEN_ARMED('#btn-start-match'))).value;
await sleep(500);
// The hint scan is what spawns the sparks this probe reads; it needs no correct answer from the
// player, so the pixel leg does not depend on guessing the sequence.
out.scan = (await evaluate(CLICK_WHEN_ARMED('#btn-trigger-scan'))).value;
// Ten reads across ~2.5s of the hint scan, keeping the busiest frame -- see SAMPLE_PIXELS.
out.pixels = (await evaluate(SAMPLE_PIXELS(10, 250))).value;
out.round = (await evaluate(`
  return {
    wires: document.querySelectorAll('.wire-column').length,
    status: document.getElementById('lcd-main-status')?.textContent ?? null,
  };`)).value;

// PLAYABLE is the ADR-0051 half: the module ran to the end, the roster rendered, and the turn reached
// a live wire bay. True in BOTH legs, including the stubbed one -- that is the whole point of the
// guard, and if the stub leg ever reports playable:false the guard has regressed.
// Judged on STATE REACHED, not on who clicked what: roster-bridge drives these same controls when a
// saved group exists, so a `clicked:false` can mean "already past it" as easily as "dead page". The
// click results stay in the output as diagnostics.
out.playable = out.seats?.rows > 0 && out.round?.wires > 0 && !!out.round?.status;

const px = out.pixels ?? {};
// A blank canvas reports coverage 0 and zero colours; the stub leg reports context2d:false and never
// reaches either. The thresholds are set from measurement, not from taste: on this route's busiest
// sampled frame the sparks cover ~0.1% of a 640x1280 backing store, because they are twenty 2-5px
// dots on a full-screen overlay rather than a painted scene. So the bar sits an order of magnitude
// below the measured value and still an infinity above blank, and `distinctColours` is what stops a
// single flat rect from passing.
out.drawn = px.present === true && px.context2d === true && px.hidden === false && px.coverage > 0.00005 && px.distinctColours >= 3;

if (SHOT) {
  const { writeFile } = await import('node:fs/promises');
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(SHOT, Buffer.from(s.result.data, 'base64'));
  out.screenshot = SHOT;
}

console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(out.playable && out.drawn ? 0 : 1);
