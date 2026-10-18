// gh#276 phase 1b: one row per traced run (trace-<tag>.summary.json) and per isolate sample (diag-iso-*.json).
//   node rollup.mjs -> rollup.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const j = (f) => JSON.parse(readFileSync(HERE + f, 'utf8'));
const l1 = (f) => { try { const m = [...readFileSync(HERE + f, 'utf8').matchAll(/load averages?: ([0-9.]+)/g)].map((x) => +x[1]); return { before: m[0] ?? null, after: m[1] ?? null }; } catch { return null; } };
const traces = readdirSync(HERE).filter((f) => /^trace-.*\.summary\.json$/.test(f)).map((f) => {
  const s = j(f), tag = f.replace(/^trace-|\.summary\.json$/g, ''), d = j(`diag-${tag}.json`);
  const b = s.peerMainThreads['Browser/CrBrowserMain'] || {}, g = s.peerMainThreads['GPU Process/CrGpuMain'] || {};
  const lockMsg = s.lockRelatedEvents.find((e) => e.thread === 'CrBrowserMain' && /blink\.mojom\.LockManager/.test(e.args) && e.name === 'Receive mojo message');
  return { tag, query: d.diag.ev.some((e) => /^query-/.test(e.k)), load1: l1(`load-${tag}.txt`), navToLockReqMs: d.lockReqMs, lockWaitMs: s.windowMs, navToPressableMs: d.pressableMs,
    renderer: { busyPct: s.mainThread.busyPct, idleMs: s.mainThread.idleMs, cpuMs: s.mainThread.cpuMsOfBusy, top3: s.attribution.slice(0, 3) },
    browserMain: { busyPct: b.busyPct, cpuMs: b.cpuMs, top2: (b.byPostingSite || []).slice(0, 2) }, gpuMain: { busyPct: g.busyPct, cpuMs: g.cpuMs },
    lockManagerMsgReceivedOnBrowserMainRelReqMs: lockMsg ? lockMsg.relReqMs : null, positiveControl: s.positiveControl };
}).sort((a, b) => b.lockWaitMs - a.lockWaitMs);
const iso = readdirSync(HERE).filter((f) => /^diag-iso-[PQT]-\d\.json$/.test(f)).map((f) => { const d = j(f), tag = f.replace(/^diag-|\.json$/g, ''); return { tag, arm: tag[4], lockWaitMs: d.lockWaitMs, navToLockReqMs: d.lockReqMs, navToPressableMs: d.pressableMs, load1: l1(`load-${tag}.txt`), void: d.void }; });
writeFileSync(HERE + 'rollup.json', JSON.stringify({ traces, isolate: iso }, null, 1));
for (const t of traces) console.log(t.tag, 'wait', t.lockWaitMs, 'load', JSON.stringify(t.load1), 'rendBusy%', t.renderer.busyPct, 'browserMain%', t.browserMain.busyPct, 'cpu', t.browserMain.cpuMs, t.browserMain.top2.map((x) => `${x.site} ${x.ms}/${x.cpuMs}cpu`).join(' ; '), 'lockMsg@', t.lockManagerMsgReceivedOnBrowserMainRelReqMs);
for (const r of iso) console.log(r.tag, r.lockWaitMs, r.navToPressableMs, JSON.stringify(r.load1));
