// gh#276: summarise warm.sh (F fresh, R reused profile, U unthrottled control) -> warm-summary-<P>.json   (node warm-summary.mjs w|p)
//   run analyze.mjs on every traced sample first (trace-w-*.summary.json)
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const j = (f) => JSON.parse(readFileSync(HERE + f, 'utf8'));
const l1 = (f) => { try { const m = [...readFileSync(HERE + f, 'utf8').matchAll(/load averages?: ([0-9.]+)/g)].map((x) => +x[1]); return { before: m[0] ?? null, after: m[1] ?? null }; } catch { return null; } };
const P = process.argv[2] || 'w'; // w = traced rotation, p = untraced rotation
const rows = readdirSync(HERE).filter((f) => new RegExp(`^diag-${P}-[FRU]-\\d+\\.json$`).test(f)).map((f) => {
  const tag = f.replace(/^diag-|\.json$/g, ''), d = j(f), arm = tag.split('-')[1], k = +tag.split('-')[2];
  const r = { tag, arm, k, void: d.void, lockWaitMs: d.lockWaitMs, navToLockReqMs: d.lockReqMs, navToPressableMs: d.pressableMs, load1: l1(`load-${tag}.txt`) };
  if (arm === 'R' && existsSync(`${HERE}warm-${tag}.json`)) { const w = j(`warm-${tag}.json`); r.warmup = { void: w.void, lockWaitMs: w.lockWaitMs, navToPressableMs: w.pressableMs }; }
  if (existsSync(`${HERE}trace-${tag}.summary.json`)) {
    const s = j(`trace-${tag}.summary.json`), b = s.peerMainThreads['Browser/CrBrowserMain'] || {};
    const top = (b.longest || [])[0];
    r.trace = { windowMs: s.windowMs, rendererBusyPct: s.mainThread.busyPct, browserMainBusyPct: b.busyPct, browserMainCpuMs: b.cpuMs,
      browserMainBusiestTask: top ? { site: top.site, inWindowMs: top.inWindowMs, wallMs: top.wallMs, cpuMs: top.cpuMs } : null };
  }
  return r;
}).sort((a, b) => a.k - b.k || a.arm.localeCompare(b.arm));
const med = (a) => { const x = a.filter((n) => typeof n === 'number').sort((p, q) => p - q); return x.length ? (x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2) : null; };
const st = (a) => { const x = a.filter((n) => typeof n === 'number'); return { n: x.length, median: med(x), min: x.length ? Math.min(...x) : null, max: x.length ? Math.max(...x) : null }; };
const arm = (A) => { const ok = rows.filter((r) => r.arm === A && !r.void); return { n: ok.length, voids: rows.filter((r) => r.arm === A && r.void).length, lockWaitMs: st(ok.map((r) => r.lockWaitMs)), waitUnder1s: ok.filter((r) => r.lockWaitMs < 1000).length, navToPressableMs: st(ok.map((r) => r.navToPressableMs)), pressableWithin1s: ok.filter((r) => r.navToPressableMs <= 1000).length, load1Before: st(ok.map((r) => r.load1?.before)), browserMainBusyPct: st(ok.map((r) => r.trace?.browserMainBusyPct)) }; };
const summary = { F: arm('F'), R: arm('R'), U: arm('U') };
writeFileSync(HERE + `warm-summary-${P}.json`,JSON.stringify({ summary, rows }, null, 1));
for (const r of rows) console.log(r.tag, r.void ? 'VOID ' + r.void : '', 'wait', r.lockWaitMs, 'press', r.navToPressableMs, 'load', r.load1?.before, '->', r.load1?.after, r.warmup ? `warmup wait ${r.warmup.lockWaitMs} press ${r.warmup.navToPressableMs}` : '', r.trace ? `| rend ${r.trace.rendererBusyPct}% bmain ${r.trace.browserMainBusyPct}% top ${JSON.stringify(r.trace.browserMainBusiestTask)}` : '');
console.log(JSON.stringify(summary));
