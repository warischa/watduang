// gh269 calibration harness. Launches ONE headless Chrome on the CDP port given, records its pid,
// runs the cases, writes JSON, and kills that pid. Usage:
//   node harness.mjs <env: webgl|nogl> <phase: synth|route> <out.json> [n]
// Synthetic phase loads calib.html from file://; the route phase needs dist/ served on ROUTE_ORIGIN.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const { FIRST_SCREEN_SAMPLER, FIRST_SCREEN_READ, firstScreenVerdict } = await import(pathToFileURL(path.join(repo, 'scripts/play-screen-fit-probe.mjs')).href);

const [envName, phase, outPath, nArg] = process.argv.slice(2);
const N = Number(nArg || 5);
const PORT = Number(process.env.CDP_PORT || 9451);
const ROUTE_ORIGIN = process.env.ROUTE_ORIGIN || 'http://127.0.0.1:4451';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENV_FLAGS = {
  webgl: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  nogl: ['--disable-gpu'],
};
if (!ENV_FLAGS[envName] || !['synth', 'route'].includes(phase) || !outPath) {
  console.error('usage: node harness.mjs <webgl|nogl> <synth|route> <out.json> [n]');
  process.exit(2);
}
const flags = ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(process.env.PROFILE_DIR || os.tmpdir(), 'gh269-'))}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=390,844', ...ENV_FLAGS[envName]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, flags, { stdio: 'ignore' });
console.error(`chrome pid ${chrome.pid} flags ${flags.join(' ')}`);
if (process.env.PID_FILE) fs.appendFileSync(process.env.PID_FILE, `${chrome.pid}\n`);

let ws;
const out = { env: envName, phase, flags, chromePid: chrome.pid, runs: [] };
try {
  let ver;
  for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(200); } }
  if (!ver) throw new Error('chrome did not come up');
  out.browser = ver.Browser;
  // Refuse a browser this harness did not launch: its own tab list must be the fresh one.
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  if (targets.filter((x) => x.type === 'page').some((x) => x.url && x.url !== 'about:blank' && !x.url.startsWith('chrome://'))) throw new Error('attached to a browser with live pages: not ours');
  const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { pend.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 400) };
    return { value: r.result?.result?.value };
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // Order matters: the sampler first, so its frame callback is registered before any page or hook one.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: FIRST_SCREEN_SAMPLER });
  if (phase === 'route') await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(here, 'hook-route.js'), 'utf8') });

  const waitDone = async (capMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < capMs) {
      const r = await ev('window.__cal ? window.__cal.done : null');
      if (r.value === true) return true;
      await sleep(100);
    }
    return false;
  };
  const readAll = async () => {
    const sampler = await ev(`(() => { ${FIRST_SCREEN_READ} })()`);
    const cal = await ev('JSON.parse(JSON.stringify(window.__cal))');
    const inner = await ev('({ innerWidth, innerHeight, visibility: document.visibilityState })');
    return { sampler, cal: cal.value ?? cal, page: inner.value };
  };

  // Painted before open: the leaf has an element-timing entry, and its presentation time is strictly
  // earlier than the first presentation of the open screen -- a separate, earlier frame showed it.
  const judge = (sampler, cal) => {
    const leaf = (cal.entries || []).filter((e) => e.id === 'leaf').sort((a, b) => a.renderTime - b.renderTime)[0] || null;
    const open = (cal.entries || []).filter((e) => e.id === 'open').sort((a, b) => a.renderTime - b.renderTime)[0] || null;
    const ev_ = (n) => (cal.events || []).find((e) => e.name === n) || null;
    const verdict = firstScreenVerdict(sampler);
    const painted = Boolean(leaf && open && leaf.renderTime > 0 && leaf.renderTime < open.renderTime);
    return { leafRender: leaf?.renderTime ?? null, openRender: open?.renderTime ?? null,
      leafPaint: leaf?.paintTime ?? null, openPaint: open?.paintTime ?? null,
      paintedBeforeOpen: painted, samplerVerdict: verdict, samplerFinal: sampler.value?.final ?? null,
      // firstScreenVerdict also returns null when the screen never opened; that is no green here
      samplerGreen: verdict === null && sampler.value?.final === 'open',
      holeReached: painted && verdict === null && sampler.value?.final === 'open', offenders: sampler.value?.offenders ?? null,
      revealAt: ev_('reveal')?.at ?? null, revealSamples: ev_('reveal')?.samples ?? null };
  };

  if (phase === 'synth') {
    const page = pathToFileURL(path.join(here, 'calib.html')).href;
    for (const order of ['pos', 'neg', 'real', 'task']) {
      for (const mech of order === 'real' ? ['insert', 'adopt', 'media', 'attr'] : ['insert', 'adopt', 'media']) {
        for (let i = 0; i < N; i++) {
          await send('Page.navigate', { url: `${page}?mech=${mech}&order=${order}&i=${i}` });
          const ok = await waitDone(8000);
          const { sampler, cal, page: pg } = await readAll();
          const j = judge(sampler, cal);
          const evs = cal.events || [];
          const at = (n) => evs.find((e) => e.name === n)?.at ?? null;
          const revealStart = at('reveal-start');
          const openStart = at('open-start');
          const revealSeq = evs.find((e) => e.name === 'reveal-start')?.seq;
          const openSeq = evs.find((e) => e.name === 'open-start')?.seq;
          const lo = Math.min(revealStart, openStart);
          const hi = Math.max(revealStart, openStart);
          // frames counted by the page's own rAF loop strictly between the reveal and the open
          const run = { order, mech, i, ok, gl: cal.gl, page: pg, ...j,
            openAt: openStart, samplesAtOpen: evs.find((e) => e.name === 'open-start')?.samples ?? null,
            samplerOpenAt: sampler.value?.openAt ?? null, samplerSamples: sampler.value?.samples ?? null,
            // DOM mutations observed from the reveal until the open (or, when the reveal comes after the
            // open, until the end): must be 0, or the reveal was not stylesheet-only
            mutationsInWindow: (cal.mutations || []).filter((m) => m.seq > revealSeq && (openSeq > revealSeq ? m.seq < openSeq : true)).length,
            leafPaintBeforeOpenTask: j.leafPaint !== null && j.leafPaint < openStart,
            framesBetween: (cal.frames || []).filter((f) => f.at > lo && f.at < hi).length,
            entries: cal.entries, events: evs,
            mutations: (cal.mutations || []).filter((m) => m.at >= Math.min(revealStart, openStart) - 1) };
          out.runs.push(run);
          console.error(`${envName} ${order}/${mech}#${i} ok=${ok} gl=${cal.gl?.webgl} painted=${j.paintedBeforeOpen} leaf=${j.leafRender} open=${j.openRender} green=${j.samplerGreen} mut=${run.mutationsInWindow} paint<openTask=${run.leafPaintBeforeOpenTask} frames=${run.framesBetween} samples@reveal=${j.revealSamples} @open=${run.samplesAtOpen}`);
        }
      }
    }
  } else {
    const url = `${ROUTE_ORIGIN}/game/croc-bite/play/`;
    for (const order of ['pos', 'real']) {
      for (const mech of ['insert', 'adopt']) {
        for (let i = 0; i < N; i++) {
          // Wipe and seed ON the origin (a wipe on about:blank clears nothing), then load with the hook armed.
          await send('Page.navigate', { url: `${ROUTE_ORIGIN}/robots.txt` });
          await sleep(300);
          const seed = await ev(`(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('watduang:timebomb-players', JSON.stringify({ players: ['ก', 'ข', 'ค'] })); return { origin: location.origin, keys: Object.keys(localStorage) }; })()`);
          await send('Page.navigate', { url: `${url}#gh269=${mech},${order}` });
          const ok = await waitDone(20000);
          const { sampler, cal, page: pg } = await readAll();
          const j = judge(sampler, cal);
          const evs = cal.events || [];
          const e = (n) => evs.find((x) => x.name === n) || null;
          const run = { order, mech, i, ok, seed: seed.value, gl: cal.gl, page: pg, ...j, tagged: cal.tagged,
            openAt: cal.openAt, samplerOpenAt: sampler.value?.openAt ?? null, samplerSamples: sampler.value?.samples ?? null,
            samplesAtOpen: e('open-seen')?.samples ?? null, holdAtReveal: e('reveal')?.hold ?? null, holdAtOpen: e('open-seen')?.hold ?? null,
            setupOpacityBefore: e('reveal-start')?.setupOpacity ?? null, setupOpacityAfter: e('reveal')?.setupOpacity ?? null,
            framesBetween: (e('open-seen')?.frames ?? NaN) - (e('reveal')?.frames ?? NaN),
            leafPaintBeforeOpenTask: j.leafPaint !== null && cal.openAt !== null && j.leafPaint < cal.openAt,
            remainingLegacy: (await ev(`localStorage.getItem('watduang:timebomb-players')`)).value,
            entries: cal.entries, events: evs };
          out.runs.push(run);
          console.error(`${envName} route ${order}/${mech}#${i} ok=${ok} gl=${cal.gl?.webgl} painted=${j.paintedBeforeOpen} leaf=${j.leafRender} open=${j.openRender} green=${j.samplerGreen} paint<openTask=${run.leafPaintBeforeOpenTask} hold@reveal=${run.holdAtReveal} hold@open=${run.holdAtOpen} opacity ${run.setupOpacityBefore}->${run.setupOpacityAfter} frames=${run.framesBetween} samples@reveal=${j.revealSamples} @open=${run.samplesAtOpen} tagged=${JSON.stringify(cal.tagged)}`);
        }
      }
    }
  }
} catch (err) {
  out.error = String(err?.stack || err);
  console.error(out.error);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  await new Promise((r) => { const t = setTimeout(r, 3000); chrome.on('exit', () => { clearTimeout(t); r(); }); });
  out.chromeExit = chrome.exitCode ?? chrome.signalCode;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.error(`wrote ${outPath} runs=${out.runs.length} chromeExit=${out.chromeExit}`);
}
