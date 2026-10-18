// gh#276: attribute the renderer main thread between the trace's `gh276:lock-req` and `gh276:lock-grant` marks.
//   node analyze.mjs <raw trace json> <diag json from trace.mjs> <out summary json>
// Every top-level main-thread task is clipped to the window and its self time is bucketed by event name
// (script by URL/function, compile/parse, style/layout/paint, GC, loading, other). Idle = window minus all tasks.
// Positive control: the in-page longtask list clipped to the same window must agree with trace tasks >= 50 ms.
import { readFileSync, writeFileSync } from 'node:fs';
const [RAW, DIAG, OUT] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const diag = JSON.parse(readFileSync(DIAG, 'utf8'));
const evs = Array.isArray(raw) ? raw : raw.traceEvents;
const tname = new Map(), pname = new Map();
for (const e of evs) if (e.ph === 'M') { if (e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args?.name); if (e.name === 'process_name') pname.set(e.pid, e.args?.name); }
const markOf = (n) => evs.filter((e) => e.name === `gh276:${n}`).sort((a, b) => a.ts - b.ts)[0];
const mReq = markOf('lock-req'), mGrant = markOf('lock-grant'), mPress = markOf('pressable');
if (!mReq || !mGrant) { console.error('marks missing', !!mReq, !!mGrant); process.exit(2); }
const PID = mReq.pid, TID = mReq.tid, A = mReq.ts, B = mGrant.ts, WIN = (B - A) / 1000;
const ms = (us) => Math.round(us / 100) / 10;

// slices per thread: X events, plus B/E pairs folded into the same shape
function slices(pid, tid) {
  const out = [], open = [];
  for (const e of evs) {
    if (e.pid !== pid || e.tid !== tid) continue;
    if (e.ph === 'X' && typeof e.dur === 'number') out.push({ name: e.name, cat: e.cat, ts: e.ts, end: e.ts + e.dur, tdur: e.tdur ?? null, args: e.args });
    else if (e.ph === 'B') open.push(e);
    else if (e.ph === 'E') { const b = open.pop(); if (b) out.push({ name: b.name, cat: b.cat, ts: b.ts, end: e.ts, tdur: e.tts != null && b.tts != null ? e.tts - b.tts : null, args: { ...b.args, ...e.args } }); }
  }
  out.sort((a, b) => a.ts - b.ts || b.end - a.end);
  const stack = [];
  for (const s of out) {
    while (stack.length && stack[stack.length - 1].end <= s.ts) stack.pop();
    s.parent = stack[stack.length - 1] || null; s.depth = stack.length; s.kids = [];
    if (s.parent) s.parent.kids.push(s);
    stack.push(s);
  }
  return out;
}
const clip = (s, a = A, b = B) => Math.max(0, Math.min(b, s.end) - Math.max(a, s.ts));
const label = (s) => { for (let x = s; x; x = x.parent) { const d = x.args?.data || x.args?.beginData || {}; const u = d.url || d.scriptName || d.stackTrace?.[0]?.url; const f = d.functionName; const t = d.type; if (u || f) return `${(u || '').replace(/^https?:\/\/[^/]+/, '')}${f ? ' ' + f : ''}`; if (t && /EventDispatch|TimerFire/.test(x.name)) return `${x.name}:${t}`; } return null; };
const bucket = (n) => {
  if (/GC|Scavenge|MarkCompact|Sweep|BlinkGC|MinorMS|MajorMS/i.test(n)) return 'gc';
  if (/ParseHTML|ParseAuthorStyleSheet/.test(n)) return 'parse-html/css';
  if (/[Cc]ompile|Parse(Script|Function)|v8\.parse|V8\.Parse|[Dd]eserializ|PreParse/.test(n)) return 'compile/parse-js';
  if (/UpdateLayoutTree|RecalculateStyles|^Layout$|Paint|Layerize|^Commit$|UpdateLayer|HitTest|BeginMainThreadFrame|BeginMainFrame|UpdateLifecycle|IntersectionObserver|ScrollLayer|Decode|Rasteri/.test(n)) return 'style/layout/paint';
  if (/EvaluateScript|v8\.run|evaluateModule|FunctionCall|callFunction|V8\.Execute|RunMicrotasks|callModuleMethod|EventDispatch|TimerFire|FireAnimationFrame|FireIdleCallback|v8\.newInstance|ScriptEvaluate/.test(n)) return 'script';
  if (/^Resource|navigation|Navigation|ParseOnBackground|loading|Document|CommitLoad/.test(n)) return 'loading/navigation';
  return 'other(task glue, mojo, scheduler)';
};

const main = slices(PID, TID);
const top = main.filter((s) => s.depth === 0 && clip(s) > 0);
const buckets = new Map();
const add = (k, v) => buckets.set(k, (buckets.get(k) || 0) + v);
const selfIn = (s) => clip(s) - s.kids.reduce((n, k) => n + clip(k), 0);
const walk = (s, fn) => { fn(s); for (const k of s.kids) walk(k, fn); };
const tasks = [], byName = new Map();
for (const t of top) {
  const local = new Map();
  walk(t, (s) => { const self = selfIn(s); if (self <= 0) return; byName.set(s.name, (byName.get(s.name) || 0) + self); const b = bucket(s.name); const l = b === 'script' || b === 'compile/parse-js' ? label(s) : null; const key = l ? `${b} | ${l}` : b; add(key, self); local.set(key, (local.get(key) || 0) + self); });
  if (clip(t) >= 50000) tasks.push({ startRelReqMs: ms(t.ts - A), wallMs: ms(t.end - t.ts), inWindowMs: ms(clip(t)), cpuMs: t.tdur != null ? ms(t.tdur) : null, name: t.name, top: [...local].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ k, ms: ms(v) })) });
}
const busy = top.reduce((n, t) => n + clip(t), 0);
const idle = B - A - busy;
const cpu = top.reduce((n, t) => n + (t.tdur != null && t.end > t.ts ? t.tdur * clip(t) / (t.end - t.ts) : 0), 0);
const table = [...buckets].map(([k, v]) => ({ occupant: k, ms: ms(v), pct: +(100 * v / (B - A)).toFixed(1) })).sort((a, b) => b.ms - a.ms);
table.push({ occupant: 'idle (no task on the main thread)', ms: ms(idle), pct: +(100 * idle / (B - A)).toFixed(1) });

// other threads, same window
const threads = new Map();
for (const e of evs) if (e.ph === 'X' || e.ph === 'B') threads.set(`${e.pid}:${e.tid}`, [e.pid, e.tid]);
const others = [];
for (const [key, [pid, tid]] of threads) {
  if (pid === PID && tid === TID) continue;
  const tp = slices(pid, tid).filter((s) => s.depth === 0);
  const b = tp.reduce((n, s) => n + clip(s), 0);
  if (b > 0) others.push({ process: pname.get(pid) || pid, thread: tname.get(key) || tid, busyMs: ms(b), pct: +(100 * b / (B - A)).toFixed(1) });
}
others.sort((a, b) => b.busyMs - a.busyMs);

// the browser and GPU main threads: what their top-level tasks in the window were (posting site / mojo interface),
// wall vs thread-CPU, and the longest tasks. The lock request is a mojo message the browser main thread must receive.
const describe = (s) => { const a = s.args || {}; const m = a.chrome_mojo_event_info || {}; let k = a.src_func ? `${(a.src_file || '').replace(/.*\//, '')}:${a.src_func}` : null; for (const c of s.kids) { const ci = c.args?.chrome_mojo_event_info || {}; if (ci.mojo_interface_tag || ci.watcher_notify_interface_tag) { k = `${k ? k + ' ' : ''}mojo ${ci.mojo_interface_tag || ci.watcher_notify_interface_tag}`; break; } if (c.args?.src_func && !k) k = `${(c.args.src_file || '').replace(/.*\//, '')}:${c.args.src_func}`; } return k || m.mojo_interface_tag || s.name; };
const threadOf = (proc, th) => { for (const [key, [pid, tid]] of threads) if (pname.get(pid) === proc && tname.get(key) === th) return [pid, tid]; return null; };
const peers = {};
for (const [proc, th] of [['Browser', 'CrBrowserMain'], ['GPU Process', 'CrGpuMain']]) {
  const id = threadOf(proc, th); if (!id) continue;
  const tp = slices(...id).filter((s) => s.depth === 0 && clip(s) > 0);
  const g = new Map(); let wall = 0, cpuT = 0;
  for (const s of tp) { const c = clip(s), k = describe(s); const cp = s.tdur != null && s.end > s.ts ? s.tdur * c / (s.end - s.ts) : 0; wall += c; cpuT += cp; const v = g.get(k) || { ms: 0, cpu: 0, n: 0 }; v.ms += c; v.cpu += cp; v.n++; g.set(k, v); }
  peers[`${proc}/${th}`] = { busyMs: ms(wall), busyPct: +(100 * wall / (B - A)).toFixed(1), cpuMs: ms(cpuT), tasks: tp.length,
    byPostingSite: [...g].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, v]) => ({ site: k, ms: ms(v.ms), cpuMs: ms(v.cpu), n: v.n, pct: +(100 * v.ms / (B - A)).toFixed(1) })),
    longest: tp.sort((a, b) => clip(b) - clip(a)).slice(0, 6).map((s) => ({ startRelReqMs: ms(s.ts - A), wallMs: ms(s.end - s.ts), inWindowMs: ms(clip(s)), cpuMs: s.tdur != null ? ms(s.tdur) : null, site: describe(s) })) };
}

// anything naming a lock, any process, window +-50 ms
const lockish = evs.filter((e) => e.ts >= A - 50000 && e.ts <= B + 50000 && !String(e.name).startsWith('gh276:') && /LockManager|LockRequest|LockHandle|web_?locks|navigator\.locks/i.test(e.name + JSON.stringify(e.args || {}))).slice(0, 40).map((e) => ({ relReqMs: ms(e.ts - A), process: pname.get(e.pid) || e.pid, thread: tname.get(`${e.pid}:${e.tid}`) || e.tid, name: e.name, durMs: e.dur != null ? ms(e.dur) : null, args: JSON.stringify(e.args || {}).slice(0, 200) }));

// sampling profiler (if present) for the main thread: self time per function inside the window
const prof = new Map();
const profiles = evs.filter((e) => e.name === 'Profile' && e.pid === PID);
for (const p of profiles) {
  const nodes = new Map(); let t = p.args?.data?.startTime ?? p.ts; let samples = 0;
  for (const c of evs.filter((e) => e.name === 'ProfileChunk' && e.pid === PID && e.id === p.id)) {
    const cp = c.args?.data?.cpuProfile || {};
    for (const n of cp.nodes || []) nodes.set(n.id, n.callFrame || {});
    const sm = cp.samples || [], dl = c.args?.data?.timeDeltas || [];
    for (let i = 0; i < sm.length; i++) { t += dl[i] || 0; const nx = t + (dl[i + 1] || 0); const w = Math.max(0, Math.min(B, nx) - Math.max(A, t)); if (w > 0) { const f = nodes.get(sm[i]) || {}; const k = `${f.functionName || '(anonymous)'} ${(f.url || '').replace(/^https?:\/\/[^/]+/, '')}`.trim(); prof.set(k, (prof.get(k) || 0) + w); samples++; } }
  }
}
const profTop = [...prof].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ fn: k, ms: ms(v) }));

// where the request sits: main-thread script evaluation and page milestones, relative to the request
const nav = evs.filter((e) => e.pid === PID && /navigationStart|MarkDOMContent|MarkLoad|domContentLoadedEventStart|loadEventStart/.test(e.name)).map((e) => ({ name: e.name, relReqMs: ms(e.ts - A) }));
const scripts = main.filter((s) => /EvaluateScript|evaluateModule|compileModule|v8\.compile$|EventDispatch/.test(s.name) && s.end - s.ts >= 1000 && s.ts > A - 120e6 && s.ts < B + 5e6).map((s) => ({ name: s.name, relReqMs: ms(s.ts - A), wallMs: ms(s.end - s.ts), what: label(s) || s.args?.data?.type || null }));

// positive control: in-page long tasks clipped to the in-page window vs trace top tasks >= 50 ms clipped to the trace window
const req = diag.diag.ev.find((e) => e.k === 'lock-req'), grant = diag.diag.ev.find((e) => e.k === 'lock-grant');
const inPageLt = diag.diag.lt.reduce((n, l) => n + Math.max(0, Math.min(grant.t, l.s + l.d) - Math.max(req.t, l.s)), 0);
const traceLt = top.filter((t) => t.end - t.ts >= 50000).reduce((n, t) => n + clip(t), 0);

const out = { raw: RAW.replace(/.*\//, ''), renderer: { pid: PID, tid: TID, thread: tname.get(`${PID}:${TID}`) }, windowMs: ms(B - A), inPageWaitMs: Math.round(grant.t - req.t), pressableRelReqMs: mPress ? ms(mPress.ts - A) : null,
  mainThread: { busyMs: ms(busy), busyPct: +(100 * busy / (B - A)).toFixed(1), idleMs: ms(idle), cpuMsOfBusy: ms(cpu), topLevelTasks: top.length },
  attribution: table, attributedPct: +table.reduce((n, r) => n + r.pct, 0).toFixed(1),
  selfTimeByEventName: [...byName].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => ({ event: k, ms: ms(v) })), tasksOver50ms: tasks,
  positiveControl: { inPageLongTaskMsInWindow: Math.round(inPageLt), traceTasksOver50msInWindow: ms(traceLt) },
  otherThreadsBusy: others.slice(0, 12), peerMainThreads: peers, lockRelatedEvents: lockish, profilerTopInWindow: profTop, milestones: nav, mainThreadScriptAndEvents: scripts.slice(0, 40) };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ windowMs: out.windowMs, inPageWaitMs: out.inPageWaitMs, mainThread: out.mainThread, attributedPct: out.attributedPct, top: table.slice(0, 8), byName: out.selfTimeByEventName.slice(0, 10), tasks: tasks.length, positiveControl: out.positiveControl, others: others.slice(0, 5) }));
