// gh#276 phase 1b: aggregate the H/L interleave (interleave.sh) into one summary.
//   node aggregate.mjs [TAG=hl]  -> hl-summary.json (per sample + per arm), table on stdout
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const TAG = process.argv[2] || 'hl';
const load = Object.fromEntries(readFileSync(`${HERE}load-${TAG}.tsv`, 'utf8').trim().split('\n').slice(1).map((l) => { const [s, start, b, a, end] = l.split('\t'); return [s, { start, end, load1Before: +b, load1After: +a }]; }));
const inWin = (lt, a, b) => Math.round(lt.reduce((n, l) => n + Math.max(0, Math.min(b, l.s + l.d) - Math.max(a, l.s)), 0));
const rows = [];
for (let k = 1; ; k++) {
  const fh = `${HERE}il-${TAG}-H-${k}.json`, fl = `${HERE}il-${TAG}-L-${k}.json`;
  if (!existsSync(fh) && !existsSync(fl)) break;
  for (const [arm, f] of [['H', fh], ['L', fl]]) {
    if (!existsSync(f)) { rows.push({ sample: `${arm}-${k}`, arm, k, void: 'no output file' }); continue; }
    const j = JSON.parse(readFileSync(f, 'utf8'));
    let r;
    if (arm === 'H') {
      const x = j.runs[0]; const lk = x.locks?.[0];
      r = { void: x.void || (!lk ? 'no lock request' : null), reqMs: lk?.reqT ?? null, grantMs: lk?.grantT ?? null, waitMs: lk?.waitMs ?? null, pressableMs: x.pressableMs ?? null, lockCount: x.locks?.length ?? 0, lt: x.lt || [] };
    } else {
      const lks = (j.diag?.ev || []).filter((e) => e.k === 'lock-req');
      r = { void: j.void, reqMs: j.lockReqMs, grantMs: j.lockGrantMs, waitMs: j.lockWaitMs, pressableMs: j.pressableMs, lockCount: lks.length, lt: j.diag?.lt || [] };
    }
    const ltWin = r.reqMs != null && r.grantMs != null ? inWin(r.lt, r.reqMs, r.grantMs) : null;
    rows.push({ sample: `${arm}-${k}`, arm, k, void: r.void ?? null, navToLockReqMs: r.reqMs, lockWaitMs: r.waitMs, navToPressableMs: r.pressableMs, longTaskMsInLockWindow: ltWin, longTaskShareOfWait: ltWin != null && r.waitMs ? +(ltWin / r.waitMs).toFixed(2) : null, lockCount: r.lockCount, ...(load[`${arm}-${k}`] || {}) });
  }
}
const med = (a) => { const x = a.filter((n) => typeof n === 'number').sort((p, q) => p - q); return x.length ? (x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2) : null; };
const stat = (a) => { const x = a.filter((n) => typeof n === 'number'); return { n: x.length, median: med(x), min: x.length ? Math.min(...x) : null, max: x.length ? Math.max(...x) : null, each: a }; };
const arm = (A) => { const ok = rows.filter((r) => r.arm === A && !r.void); return { n: ok.length, voids: rows.filter((r) => r.arm === A && r.void).length, lockWaitMs: stat(ok.map((r) => r.lockWaitMs)), lockWaitAtLeast2s: ok.filter((r) => r.lockWaitMs >= 2000).length, navToLockReqMs: stat(ok.map((r) => r.navToLockReqMs)), navToPressableMs: stat(ok.map((r) => r.navToPressableMs)), pressableWithin1s: ok.filter((r) => r.navToPressableMs != null && r.navToPressableMs <= 1000).length, longTaskMsInLockWindow: stat(ok.map((r) => r.longTaskMsInLockWindow)), load1Before: stat(ok.map((r) => r.load1Before)) }; };
const pairs = [];
for (const k of [...new Set(rows.map((r) => r.k))]) { const h = rows.find((r) => r.k === k && r.arm === 'H'), l = rows.find((r) => r.k === k && r.arm === 'L'); if (h && l && !h.void && !l.void) pairs.push({ k, waitDiffHminusL: h.lockWaitMs - l.lockWaitMs }); }
const summary = { tag: TAG, H: arm('H'), L: arm('L'), pairedWaitDiffHminusL: { ...stat(pairs.map((p) => p.waitDiffHminusL)), hGreater: pairs.filter((p) => p.waitDiffHminusL > 0).length, pairs: pairs.length } };
writeFileSync(`${HERE}${TAG}-summary.json`, JSON.stringify({ summary, rows }, null, 1));
for (const r of rows) console.log([r.sample, r.void ? 'VOID ' + r.void : '', 'req', r.navToLockReqMs, 'wait', r.lockWaitMs, 'lt-in-win', r.longTaskMsInLockWindow, 'press', r.navToPressableMs, 'load', r.load1Before, '->', r.load1After].join(' '));
console.log(JSON.stringify(summary, (k, v) => (k === 'each' ? undefined : v)));
