// gh#281 box 1: render the board's frames and measure the ready button on the board itself.
// Usage: CDP_PORT=9321 node render-and-check.mjs   (Chrome already listening on CDP_PORT, file:// board)
// Writes next to this file: PNGs at deviceScaleFactor 2 and board-check.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const BOARD = join(root, 'design/Gh281FreezeTapReady.dc.html');
const PORT = process.env.CDP_PORT || 9321;
const BAND = 56;
const VIEWPORT_H = 568;

// The nine draws, read from the route itself so nothing is copied by hand.
const mainJs = readFileSync(join(root, 'src/play/freeze-tap/main.js'), 'utf8');
const block = mainJs.slice(mainJs.indexOf('const TRIGGER_CONDITIONS = ['), mainJs.indexOf('4. GAME STATE MACHINE'));
const draws = [...block.matchAll(/id: '([A-Z_]+)',\s*category: '\w+',\s*prompt: '([^']*)',\s*targetBg: '([^']*)',\s*targetText: '[^']*',\s*targetSymbol: '([^']*)'/g)]
  .map((m) => ({ id: m[1], prompt: m[2], targetBg: m[3], symbol: m[4] }));
if (draws.length !== 9) throw new Error(`expected 9 draws from main.js, parsed ${draws.length}`);
const box3 = JSON.parse(readFileSync(join(root, 'docs/verification/evidence/gh268-2026-10-20/box3-freeze-tap-ready-320.json'), 'utf8'));

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const consoleLines = [];
let loadResolve = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  if (m.method === 'Runtime.consoleAPICalled') consoleLines.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded') consoleLines.push(`${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
});
const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
const loaded = new Promise((r) => { loadResolve = r; });
await send('Page.navigate', { url: `file://${BOARD}` });
await loaded;
await evaluate('document.fonts.ready.then(() => true)');
// elementFromPoint is blind below the window, so the window is grown to the whole sheet before anything is measured.
const sheetH = await evaluate('document.documentElement.scrollHeight');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: sheetH, deviceScaleFactor: 2, mobile: false });
await evaluate('window.scrollTo(0,0), true');

// Measure one frame, in the frame's own coordinates (frames sit inside a 1440 sheet, raw viewport coords are wrong).
// Returns the button box, band bottom, viewport, and what sits at the button's centre.
const MEASURE = `(name) => {
  const f = document.querySelector('[data-frame="' + name + '"]');
  const fr = f.getBoundingClientRect();
  const b = f.querySelector('[data-ready]');
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const main = f.querySelector('[data-main]');
  const top = +(r.top - fr.top).toFixed(2), bottom = +(r.bottom - fr.top).toFixed(2);
  return { top, bottom, height: +r.height.toFixed(2), left: +(r.left - fr.left).toFixed(2), right: +(r.right - fr.left).toFixed(2),
    frameH: fr.height, frameW: fr.width,
    centreY: +(cy - fr.top).toFixed(2),
    centreHitsButton: !!hit && (hit === b || b.contains(hit)),
    mainScrollHeight: main.scrollHeight, mainClientHeight: main.clientHeight };
}`;
const setDraw = (name, d) => evaluate(`(() => {
  const f = document.querySelector('[data-frame="${name}"]');
  f.querySelector('[data-prompt]').textContent = ${JSON.stringify(d.prompt)};
  f.querySelector('[data-target]').textContent = ${JSON.stringify(d.symbol)};
  f.querySelector('[data-target]').style.backgroundColor = ${JSON.stringify(d.targetBg)};
  f.querySelector('[data-cond-box]').style.borderColor = ${JSON.stringify(d.targetBg)};
  return true; })()`);
const measure = (name) => evaluate(`(${MEASURE})(${JSON.stringify(name)})`);
const passes = (m) => m.top >= BAND && m.bottom <= VIEWPORT_H;

const names = ['today', 'A', 'B', 'C'];
const initial = {}; // the tallest draw painted in the markup, as it will be photographed
for (const n of names) initial[n] = await measure(n);

// Every draw per frame, restoring the painted one afterwards.
const painted = draws.find((d) => d.id === 'SYMBOL_STAR');
const perDraw = {};
for (const n of names) {
  perDraw[n] = [];
  for (const d of draws) {
    await setDraw(n, d);
    const m = await measure(n);
    perDraw[n].push({ draw: d.id, top: m.top, bottom: m.bottom, height: m.height, centreHitsButton: m.centreHitsButton, pass: passes(m) && m.centreHitsButton });
  }
  await setDraw(n, painted);
}

// Calibration of the control against box 3 (same Mac, real built page): draws 0-6 read top 529 / bottom 589,
// draws 7-8 read top 556 / bottom 616 with the band on.
const calib = draws.map((d, i) => {
  const mine = perDraw.today[i];
  const real = box3.rows[i];
  return { draw: d.id, boardTop: mine.top, boardBottom: mine.bottom, box3Top: real.top, box3Bottom: real.bottom, deltaBottom: +(mine.bottom - real.bottom).toFixed(2) };
});

const frames = names.map((n) => {
  const m = initial[n];
  const all = perDraw[n];
  return {
    frame: n,
    draw: 'SYMBOL_STAR',
    bandBottom: BAND,
    viewportBottom: VIEWPORT_H,
    buttonTop: m.top,
    buttonBottom: m.bottom,
    buttonHeight: m.height,
    visiblePx: Math.max(0, Math.min(m.bottom, VIEWPORT_H) - Math.max(m.top, BAND)),
    slackBelowPx: +(VIEWPORT_H - m.bottom).toFixed(2),
    slackAbovePx: +(m.top - BAND).toFixed(2),
    centreHitsButton: m.centreHitsButton,
    mainOverflowPx: m.mainScrollHeight - m.mainClientHeight,
    pass: passes(m) && m.centreHitsButton,
    allNineDrawsPass: all.every((x) => x.pass),
    worstBottomOverNine: Math.max(...all.map((x) => x.bottom)),
    tallestDrawsOverNine: all.filter((x) => x.bottom === Math.max(...all.map((y) => y.bottom))).map((x) => x.draw),
  };
});

const expect = { today: false, A: true, B: true, C: true };
const verdict = frames.every((f) => f.pass === expect[f.frame] && (f.frame === 'today' || f.allNineDrawsPass));
writeFileSync(join(here, 'board-check.json'), JSON.stringify({
  board: 'design/Gh281FreezeTapReady.dc.html',
  note: 'browser-measured from the board DOM, frame coordinates; pass = button top >= band bottom (56) AND bottom <= viewport (568) AND the button centre is what elementFromPoint hits. today MUST fail (must-red).',
  passRule: { bandBottom: BAND, viewportBottom: VIEWPORT_H },
  verdict: verdict ? 'candidates pass, today fails' : 'UNEXPECTED',
  frames,
  perDraw,
  calibrationTodayVsBox3: calib,
  consoleLines,
}, null, 1) + '\n');

// Screenshots: one PNG per frame (640x1136), plus the whole sheet.
const shot = async (path, clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  writeFileSync(path, Buffer.from(r.result.data, 'base64'));
};
for (const n of names) {
  const rect = await evaluate(`(() => { const r = document.querySelector('[data-frame="${n}"]').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
  await shot(join(here, `${n === 'today' ? 'today' : 'variant-' + n}.png`), rect);
}
await shot(join(here, 'sheet.png'), null);

await send('Target.closeTarget', { targetId: target.id });
ws.close();
console.log(JSON.stringify({ verdict: verdict ? 'ok' : 'UNEXPECTED', frames: frames.map((f) => ({ f: f.frame, top: f.buttonTop, bottom: f.buttonBottom, pass: f.pass, nine: f.allNineDrawsPass, slack: f.slackBelowPx })), calibMaxAbsDelta: Math.max(...calib.map((c) => Math.abs(c.deltaBottom))) }));
