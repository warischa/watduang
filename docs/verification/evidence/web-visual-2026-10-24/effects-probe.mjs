// gh#288 Phase 0/1 — measured cost of effect candidates A-E as THROWAWAY prototypes injected into the
// built pages over CDP. Nothing here is a design: colours, durations and distances are placeholders
// picked only to exercise the rendering path (ADR-0033: design values come from a canvas board later).
// Every reading is headless Chrome on a Mac under CPU 4x, an approximation, not a phone. With
// --disable-gpu the compositor rasterises in software, so paint-heavy effects read pessimistic here.
//
// Per variant: bytes (gzip -9 of the prototype source, printed by the caller) and a 3s frame window:
// rAF intervals (p50/p95/max, frames over 50ms), long tasks, and main-thread task time from
// Performance.getMetrics. Scroll variants scroll 0 -> 2400px over the window inside rAF.
//   CDP_PORT=9310 LANE=nogpu OUT=<json> node <this file>
//   CDP_PORT=9311 LANE=swiftshader OUT=<json> node <this file>      (Chrome with --use-angle=swiftshader)
import { open } from './cdp-lib.mjs';
import { writeFile, readFile } from 'node:fs/promises';
const BASE = process.env.BASE || 'http://localhost:4410', LANE = process.env.LANE || 'nogpu';
const DIR = new URL('./effects/', import.meta.url);
const src = async (f) => readFile(new URL(f, DIR), 'utf8');
const s = await open();
await s.send('Performance.enable');
await s.setWidth(390, 844, true);
await s.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const WINDOW = (scroll) => `
  const iv = []; let last = performance.now(); let long = 0;
  const po = new PerformanceObserver((l) => { long += l.getEntries().length; }); po.observe({ type: 'longtask' });
  const t0 = performance.now(); const H = 2400;
  await new Promise((done) => { const f = (t) => { iv.push(t - last); last = t; if (${scroll}) scrollTo(0, Math.min(H, ((t - t0) / 3000) * H)); if (t - t0 < 3000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  po.disconnect(); iv.shift();
  const q = (p) => { const a = [...iv].sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1); };
  return { frames: iv.length, p50: q(0.5), p95: q(0.95), max: +Math.max(...iv).toFixed(1), over50: iv.filter((x) => x > 50).length, longTasks: long };
`;
const TRACE_CATS = 'devtools.timeline,disabled-by-default-devtools.timeline,cc,viz,gpu,benchmark,disabled-by-default-devtools.timeline.frame';
// Picked from a name census of this lane (baseline vs the CAL-heavy row): raster workers, the display
// compositor's draw, main-thread paint and BeginMainFrame. PipelineReporter carried no state arg here.
const TRACE_NAMES = ['RasterTask', 'Display::DrawAndSwap', 'Paint', 'ProxyMain::BeginMainFrame'];
const metric = async () => { const m = (await s.send('Performance.getMetrics')).result.metrics; const g = (n) => m.find((x) => x.name === n)?.value ?? 0; return { task: g('TaskDuration'), layout: g('LayoutDuration'), style: g('RecalcStyleDuration') }; };
async function measure(path, inject, scroll) {
  await s.nav(BASE + path); await s.sleep(800);
  await s.ev(`scrollTo(0, 0); return 1`);
  const injected = inject ? await s.ev(inject) : null;
  await s.sleep(600);
  const m0 = await metric();
  const { result: w, events } = await s.trace(TRACE_CATS, () => s.ev(WINDOW(scroll)));
  const m1 = await metric();
  // Raster and draw run off the main thread, where rAF intervals cannot see them: sum the trace's own
  // slices instead. Names are Chrome's (stable within one version, 155 here); totals are over the window.
  const sum = {}; const pname = {}; let gpu = 0;
  for (const e of events) if (e.ph === 'M' && e.name === 'process_name') pname[e.pid] = e.args.name;
  for (const e of events) {
    if (e.ph === 'X' && TRACE_NAMES.includes(e.name)) sum[e.name] = (sum[e.name] || 0) + (e.dur || 0) / 1000;
    // With a GL context (SwiftShader lane) raster and draw run in the GPU process: its scheduler's slices.
    if (e.ph === 'X' && e.name === 'Scheduler::RunTask' && pname[e.pid] === 'GPU Process') gpu += (e.dur || 0) / 1000;
  }
  const traceMs = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v)]));
  const cls = await s.ev(`return await new Promise((res) => { let sum = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) sum += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => res(+sum.toFixed(4)), 200); });`);
  const lcp = await s.ev(`return await new Promise((res) => { let last = null; new PerformanceObserver((l) => { const e = l.getEntries(); last = e[e.length - 1]; }).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => res(last ? Math.round(last.startTime) : null), 200); });`);
  return { injected, ...w, traceMs, gpuProcessMs: Math.round(gpu), mainThreadMs: Math.round((m1.task - m0.task) * 1000), layoutMs: Math.round((m1.layout - m0.layout) * 1000), styleMs: Math.round((m1.style - m0.style) * 1000), cls, lcp };
}
const css = (text) => `const st = document.createElement('style'); st.textContent = ${JSON.stringify(text)}; document.head.appendChild(st); return 'css'`;
const out = { lane: LANE, webgl: null, runs: {} };
await s.nav(BASE + '/'); out.webgl = await s.ev(`const c = document.createElement('canvas'); return { webgl: !!c.getContext('webgl'), webgl2: !!document.createElement('canvas').getContext('webgl2') };`);

const A1p = await src('a1-gradient-paint.css'), A1c = await src('a1-gradient-compositor.css'), A2 = await src('a2-shader.js');
const B0 = await src('b0-sticky-solid.css'), B1 = await src('b1-frosted.css'), B2 = await src('b2-svg-glass.js');
const C = await src('c-micro.css'), D = await src('d-reveal.js');
// Must-red: a full-viewport backdrop blur, a repainting body gradient and box-shadow animations. Any
// instrument that reads this row like the baseline cannot see raster cost.
const HEAVY = `const st = document.createElement('style'); st.textContent = '.cal-blur{position:fixed;inset:0;z-index:999;pointer-events:none;backdrop-filter:blur(40px) saturate(2)} body{background-image:linear-gradient(90deg,red,blue,red);background-size:400% 100%;animation:calbg 1s linear infinite} @keyframes calbg{to{background-position:100% 0}} a.tile{animation:calsh .5s linear infinite alternate} @keyframes calsh{to{box-shadow:0 0 40px 20px red}}'; document.head.appendChild(st); const d = document.createElement('div'); d.className = 'cal-blur'; document.body.appendChild(d); return 'heavy'`;
const plan = [
  ['CAL-heavy-scroll', '/', HEAVY, true],
  ['home-idle-baseline', '/', null, false],
  ['A1-gradient-paint', '/', css(A1p), false],
  ['A1-gradient-compositor', '/', css(A1c).replace("return 'css'", "const d = document.createElement('div'); d.className = 'proto-ambient'; d.setAttribute('aria-hidden', 'true'); document.querySelector('header.hero').prepend(d); return 'css+layer'"), false],
  ['A2-shader', '/', A2, false],
  ['home-scroll-baseline', '/', null, true],
  ['B0-sticky-solid-scroll', '/', css(B0), true],
  ['B1-frosted-scroll', '/', css(B0 + B1), true],
  ['B2-svg-glass-scroll', '/', B2, true],
  ['D-reveal-scroll', '/', D, true],
  ['tools-scroll-baseline', '/c/party/', null, true],
  ['D-reveal-party-scroll', '/c/party/', D, true],
  // C: the press state toggled on every visible button every 150ms through the window (a stand-in for taps).
  ['C-micro-press-wheel', '/tool/wheel/', css(C).replace("return 'css'", "const bs = [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0); const iv = setInterval(() => bs.forEach((b) => b.classList.toggle('proto-press')), 150); setTimeout(() => clearInterval(iv), 4500); return 'css+toggle ' + bs.length"), false],
  ['wheel-idle-baseline', '/tool/wheel/', null, false],
];
const REPS = Number(process.env.REPS || 3);
for (const [id, path, inject, scroll] of plan) {
  out.runs[id] = [];
  // Interleaved repeats would need a second page per rep; reps run back to back and the spread is reported.
  for (let i = 0; i < REPS; i++) out.runs[id].push(await measure(path, inject, scroll));
}
out.events = s.events;
await s.close();
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(out, null, 1));
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('lane', LANE, JSON.stringify(out.webgl));
for (const [id, rs] of Object.entries(out.runs)) console.log(id.padEnd(26), 'raster', rs.map((r) => r.traceMs.RasterTask ?? 0).join('/'), 'draw', rs.map((r) => r.traceMs['Display::DrawAndSwap'] ?? 0).join('/'), 'paint', rs.map((r) => r.traceMs.Paint ?? 0).join('/'), 'bmf', rs.map((r) => r.traceMs['ProxyMain::BeginMainFrame'] ?? 0).join('/'), 'gpuProc', rs.map((r) => r.gpuProcessMs).join('/'), 'rAF p95', med(rs.map((r) => r.p95)), '>50ms', rs.map((r) => r.over50).join('/'), 'long', rs.map((r) => r.longTasks).join('/'), 'cls', rs.map((r) => r.cls).join('/'), 'inj', String(rs[0].injected).slice(0, 40));
console.log('events', s.events.length, JSON.stringify(s.events.slice(0, 3)));
process.exit(0);
