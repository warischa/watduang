// Frame time of the prize-draw 3D reveals at 200 names and projector resolution (gh#305, gh#306).
//
// Opens a demo page (200 synthetic names, fixed seed) at 1920x1080, DPR 1, switches on the in-page sampler
// (src/play/_prize-reveal/frame-time.ts), plays full reveals by pressing the page's own buttons with real
// mouse events, and writes the raw per-frame samples plus a per-phase summary as JSON.
//
//   GAME=fireworks|cards  CDP_PORT=9633  BASE=http://localhost:4633  OUT=<dir>  [RUNS=5] [THROTTLE=<rate>]
//   node scripts/prize-reveal-frame-probe.mjs
//
// The Chrome it drives must have a real GPU (headless=new --use-angle=metal --enable-gpu
// --ignore-gpu-blocklist on a Mac). The probe READS the WebGL unmasked renderer in the page and REFUSES to
// report (exit 2, nothing written) when it is a software rasteriser, absent, or unreadable: a frame time off
// SwiftShader says nothing about a projector laptop.
//
// What the numbers are: RAF interval is frame pacing; CPU ms is the time around advance(tick) on the main
// thread (submission), never GPU execution time. The first reveal of a page is a warm-up (shader compile,
// lazy module load) and is recorded apart, never summarised. Held and hidden spans are not frame intervals:
// the host records them as gaps, and the first frame after one has a null RAF interval, which the summary
// leaves out. STALL_DRAW_MS (each WebGL draw call spins that long) is the must-red knob: it MUST raise CPU ms.
// THROTTLE (CDP CPU throttling rate) is recorded with an in-page busy-loop check but did NOT move CPU ms here
// (see the evidence README), so it is not the control. Knob runs are never the stated figure.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FRAME_TIME_GLOBAL } from '../src/play/_prize-reveal/frame-time.ts';

const COPY_DEAL = 'แจกไพ่';
const COPY_REVEAL = 'เปิดผล';
const COPY_REPLAY = 'ดูอีกครั้ง';
const SOFTWARE = /swiftshader|software|llvmpipe|softpipe|basic render|microsoft basic/i;

/** Nearest-rank stats, the same definition as frame-time.ts. */
export function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return { count: 0, median: null, p95: null, max: null };
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return { count: n, median, p95: v[Math.max(0, Math.ceil(0.95 * n) - 1)], max: v[n - 1] };
}

/** Per-phase and whole-step summary of frames pooled over reveals. A frame with a null interval stays in the
 *  CPU stats and is left out of the RAF stats. */
export function summarise(frames) {
  const by = new Map();
  for (const f of frames) {
    if (!by.has(f.phase)) by.set(f.phase, []);
    by.get(f.phase).push(f);
  }
  const one = (list) => ({
    rafMs: stats(list.flatMap((f) => (f.rafMs === null ? [] : [f.rafMs]))),
    cpuMs: stats(list.map((f) => f.cpuMs)),
  });
  const phases = {};
  for (const [phase, list] of by) phases[phase] = one(list);
  return { all: one(frames), phases };
}

export function refuseReason(renderer) {
  if (typeof renderer !== 'string' || renderer === '') return 'the WebGL unmasked renderer could not be read';
  if (SOFTWARE.test(renderer)) return `software renderer: ${renderer}`;
  return null;
}

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

async function main() {
  const GAME = process.env.GAME;
  const PORT = process.env.CDP_PORT || '9633';
  const BASE = process.env.BASE || 'http://localhost:4633';
  const OUT = process.env.OUT;
  const RUNS = Number(process.env.RUNS || 5);
  const THROTTLE = Number(process.env.THROTTLE || 1);
  const STALL_DRAW_MS = Number(process.env.STALL_DRAW_MS || 0);
  if (!['fireworks', 'cards'].includes(GAME) || !OUT) {
    console.error('usage: GAME=fireworks|cards OUT=<dir> [CDP_PORT BASE RUNS THROTTLE] node scripts/prize-reveal-frame-probe.mjs');
    process.exit(64);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const url = `${BASE}/game/prize-${GAME}/play/`;

  const api = async (p, method = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();
  const version = await api('/json/version');
  const target = await api('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  let loadResolve = null;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m);
    else if (m.method === 'Page.loadEventFired' && loadResolve) {
      loadResolve();
      loadResolve = null;
    }
  });
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(`page eval failed: ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`);
    return r.result?.result?.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const close = async () => {
    try { await api(`/json/close/${target.id}`); } catch { /* tab already gone */ }
    ws.close();
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    if (STALL_DRAW_MS > 0) {
      // Must-red knob: every WebGL draw call spins this long on the main thread, so advance(tick) MUST get slower.
      const stall = `(() => { const ms = ${STALL_DRAW_MS}; for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const orig = C.prototype[m]; if (!orig) continue; C.prototype[m] = function (...a) { const t = performance.now(); while (performance.now() - t < ms); return orig.apply(this, a); }; } })();`;
      await send('Page.addScriptToEvaluateOnNewDocument', { source: stall });
    }
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window[${JSON.stringify(FRAME_TIME_GLOBAL)}] = { enabled: true };` });
    const loaded = new Promise((r) => { loadResolve = r; });
    await send('Page.navigate', { url });
    await loaded;
    await sleep(1500);
    // Applied after the load: a throttle set before a navigation can be lost with the old renderer process.
    // A fixed busy loop, timed in the page before and after, proves the rate took effect.
    const busy = () => ev(`(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 3e7; i++) x += Math.sqrt(i); return performance.now() - t; })()`);
    const busyBeforeMs = await busy();
    if (THROTTLE !== 1) await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    const busyAfterMs = await busy();

    const renderer = await ev(`(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return null; const x = g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : null; })()`);
    const refuse = refuseReason(renderer);
    if (refuse) {
      console.error(`REFUSED: ${refuse}`);
      await close();
      process.exit(2);
    }

    const press = async (label) => {
      const pos = await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
        if (!b || b.disabled || b.hidden) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (!pos) throw new Error(`button "${label}" not present`);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
      }
    };
    const labelNow = () => ev(`(() => { const b = document.querySelector('.pr-go'); return b ? b.textContent.trim() : null; })()`);
    const waitLabel = async (want, timeoutMs) => {
      const t0 = Date.now();
      for (;;) {
        const l = await labelNow();
        if (want.includes(l)) return l;
        if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${want.join('/')}, last "${l}"`);
        await sleep(100);
      }
    };
    const frameCount = () => ev(`window[${JSON.stringify(FRAME_TIME_GLOBAL)}].frames ? window[${JSON.stringify(FRAME_TIME_GLOBAL)}].frames.length : 0`);

    const steps = GAME === 'cards' ? [COPY_DEAL, COPY_REVEAL] : [COPY_REVEAL];
    const reveals = [];
    let canvases = null;
    for (let run = 0; run <= RUNS; run++) {
      await waitLabel([steps[0]], 15000);
      for (const step of steps) {
        await waitLabel([step], 15000);
        await sleep(700); // past the arm window, so the press is a genuine first contact
        const from = await frameCount();
        const gapsFrom = await ev(`(window[${JSON.stringify(FRAME_TIME_GLOBAL)}].gaps || []).length`);
        await press(step);
        // The step is over when the bar offers the next control again.
        await sleep(500);
        if (!canvases) canvases = await ev(`[...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight }))`);
        const nextLabel = step === COPY_DEAL ? COPY_REVEAL : COPY_REPLAY;
        await waitLabel([nextLabel], 120000);
        const slice = await ev(`(() => { const s = window[${JSON.stringify(FRAME_TIME_GLOBAL)}];
          return { frames: (s.frames || []).slice(${from}), gaps: (s.gaps || []).slice(${gapsFrom}) }; })()`);
        reveals.push({ run, warmup: run === 0, step: step === COPY_DEAL ? 'deal' : 'reveal', frames: slice.frames, gaps: slice.gaps });
      }
      await sleep(700);
      await press(COPY_REPLAY);
    }

    const backing = await ev(`(() => ({ innerWidth, innerHeight, dpr: devicePixelRatio,
      canvases: [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight })) }))()`);
    const total = reveals.reduce((n, r) => n + r.frames.length, 0);
    if (total === 0) throw new Error('the sampler recorded 0 frames: it was never enabled or the host never ran');

    const measured = reveals.filter((r) => !r.warmup);
    const summary = { game: GAME, runs: RUNS, throttleRate: THROTTLE, stallDrawMs: STALL_DRAW_MS, steps: {} };
    for (const step of new Set(measured.map((r) => r.step))) {
      const mine = measured.filter((r) => r.step === step);
      summary.steps[step] = {
        reveals: mine.length,
        frames: mine.reduce((n, r) => n + r.frames.length, 0),
        heldOrHiddenGaps: mine.reduce((n, r) => n + r.gaps.filter((g) => g.kind !== 'load').length, 0),
        gapMs: mine.flatMap((r) => r.gaps.map((g) => ({ kind: g.kind, ms: g.ms }))),
        ...summarise(mine.flatMap((r) => r.frames)),
      };
    }

    const dist = readFileSync(resolve(root, `dist/game/prize-fireworks/play/index.html`));
    const machine = {
      cpu: sh('sysctl', ['-n', 'machdep.cpu.brand_string']),
      hardware: (sh('system_profiler', ['SPHardwareDataType']) || '').split('\n').map((l) => l.trim()).filter((l) => /Model|Chip/.test(l)),
      os: sh('sw_vers', ['-productVersion']),
      kernel: sh('uname', ['-r']),
      chrome: version.Browser,
      webglRenderer: renderer,
      viewport: { cssWidth: backing.innerWidth, cssHeight: backing.innerHeight, dpr: backing.dpr },
      canvases,
      busyLoopMs: { beforeThrottle: busyBeforeMs, afterThrottle: busyAfterMs },
      distFingerprint: { file: 'dist/game/prize-fireworks/play/index.html', sha256: createHash('sha256').update(dist).digest('hex') },
      url,
      cpuThrottleRate: THROTTLE,
      stallDrawMs: STALL_DRAW_MS,
      measuredAt: new Date().toISOString(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, 'samples.json'), JSON.stringify({ machine, reveals }));
    writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify({ machine, ...summary }, null, 2) + '\n');
    console.log(JSON.stringify({ out: OUT, renderer, totalFrames: total, summary: summary.steps }, (k, v) => (k === 'gapMs' ? undefined : v)));
    await close();
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    await close();
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
