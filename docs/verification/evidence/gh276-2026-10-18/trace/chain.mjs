// gh#276: per traced run, the chain behind the browser main thread's busiest task inside the lock window.
//   node chain.mjs <RAWDIR> <tag>...   -> chain.json (merged by tag)
// For the task: posting site, wall/CPU, and the longest synchronous mojo call made inside it (by name).
// For the GPU process, inside the window: VizCompositorThread wall/CPU, and CrGpuMain `GPUTask` wall/CPU.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const [RAWDIR, ...tags] = process.argv.slice(2);
const out = existsSync(HERE + 'chain.json') ? JSON.parse(readFileSync(HERE + 'chain.json', 'utf8')) : {};
for (const tag of tags) {
  const raw = JSON.parse(readFileSync(`${RAWDIR}/trace-${tag}.json`, 'utf8'));
  const evs = Array.isArray(raw) ? raw : raw.traceEvents;
  const tname = new Map(), pname = new Map();
  for (const e of evs) if (e.ph === 'M') { if (e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args?.name); if (e.name === 'process_name') pname.set(e.pid, e.args?.name); }
  const A = evs.find((e) => e.name === 'gh276:lock-req').ts, B = evs.find((e) => e.name === 'gh276:lock-grant').ts;
  const th = (proc, name) => { const k = [...tname].find(([k, v]) => v === name && pname.get(+k.split(':')[0]) === proc)?.[0]; return k ? k.split(':').map(Number) : null; };
  const clip = (e) => Math.max(0, Math.min(B, e.ts + e.dur) - Math.max(A, e.ts));
  const xs = (id) => evs.filter((e) => id && e.pid === id[0] && e.tid === id[1] && e.ph === 'X' && e.dur > 0);
  const bm = xs(th('Browser', 'CrBrowserMain'));
  const tops = bm.filter((e) => e.name === 'ThreadControllerImpl::RunTask' && clip(e) > 0).sort((a, b) => clip(b) - clip(a));
  const t = tops[0];
  const inner = t ? bm.filter((e) => e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur && e !== t && e.cat?.includes('mojom')).sort((a, b) => b.dur - a.dur)[0] : null;
  const sum = (arr, f = () => true) => arr.filter(f).reduce((n, e) => [n[0] + clip(e), n[1] + (e.tdur ? e.tdur * clip(e) / e.dur : 0)], [0, 0]).map((v) => Math.round(v / 100) / 10);
  const viz = xs(th('GPU Process', 'VizCompositorThread')).filter((e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask');
  const gpu = xs(th('GPU Process', 'CrGpuMain'));
  out[tag] = { windowMs: Math.round((B - A) / 100) / 10,
    browserMainBusiest: t ? { site: `${(t.args?.src_file || '').replace(/.*\//, '')}:${t.args?.src_func}`, startRelReqMs: Math.round((t.ts - A) / 100) / 10, wallMs: Math.round(t.dur / 100) / 10, cpuMs: Math.round((t.tdur || 0) / 100) / 10, inWindowMs: Math.round(clip(t) / 100) / 10,
      longestMojoInside: inner ? { name: inner.name, wallMs: Math.round(inner.dur / 100) / 10 } : null } : null,
    vizCompositorTopLevel: (() => { const v = viz.filter((e) => !viz.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur)); const [w, c] = sum(v); return { wallMs: w, cpuMs: c }; })(),
    gpuMainGPUTask: (() => { const [w, c] = sum(gpu, (e) => e.name === 'GPUTask'); return { wallMs: w, cpuMs: c }; })() };
  console.log(tag, JSON.stringify(out[tag]));
}
writeFileSync(HERE + 'chain.json', JSON.stringify(out, null, 1));
