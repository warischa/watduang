#!/usr/bin/env node
// gh#325 cost probe, FROZEN kit file: wall time of one full render-boards run (capture included) and the peak
// summed RSS of the headless Chrome process tree while it runs. The tree is walked from CHROME_PID (the browser
// pid YOU started; never found by process name) every 100ms with `ps`, so it includes the renderer, GPU and
// utility children. Summed RSS double-counts pages the processes share: an upper bound, not unique memory.
// Usage: CHROME_PID=<pid> CDP_PORT=<port> SHOT_TMP=<scratch dir> RUNS=<n> node measure-render.mjs board-<x>.mjs
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PID = Number(process.env.CHROME_PID); const RUNS = Number(process.env.RUNS || 2); const board = process.argv[2];
if (!PID || !process.env.CDP_PORT || !process.env.SHOT_TMP || !board) { console.error('usage: CHROME_PID=<pid> CDP_PORT=<port> SHOT_TMP=<dir> RUNS=<n> node measure-render.mjs board-<x>.mjs'); process.exit(2); }
const treeRss = () => {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const kids = new Map(); for (const [p, pp] of rows) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(p); }
  const rss = new Map(rows.map(([p, , r]) => [p, r]));
  if (!rss.has(PID)) throw new Error(`CHROME_PID ${PID} is not running`);
  let sum = 0, n = 0; const stack = [PID];
  while (stack.length) { const p = stack.pop(); sum += rss.get(p) ?? 0; n++; stack.push(...(kids.get(p) ?? [])); }
  return { kb: sum, procs: n };
};
const results = [];
for (let i = 0; i < RUNS; i++) {
  const before = treeRss(); let peak = before; const t0 = performance.now();
  const child = spawn('node', ['render-boards.mjs', board], { cwd: here, env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; child.stderr.on('data', (d) => { err += d; });
  const timer = setInterval(() => { const s = treeRss(); if (s.kb > peak.kb) peak = s; }, 100);
  const rc = await new Promise((r) => child.on('exit', r));
  clearInterval(timer);
  results.push({ run: i + 1, rc, wallS: +((performance.now() - t0) / 1000).toFixed(2), idleMB: +(before.kb / 1024).toFixed(0), peakMB: +(peak.kb / 1024).toFixed(0), peakProcs: peak.procs, render: err.trim() });
}
console.log(JSON.stringify(results, null, 1));
process.exitCode = results.every((r) => r.rc === 0) ? 0 : 1;
