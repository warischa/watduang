// gh#253 runner. Serves one dist directory on :4361, starts ONE fresh headless Chrome on :9361 with its
// own temp profile, runs `node <script> [args]` from the repo root with BASE and CDP_PORT set, then tears
// down only the process groups it started. stdout of the script is passed through.
//
//   node docs/verification/evidence/gh253/run.mjs <dist-dir> scripts/driver.mjs <probe.mjs>
//
// One Chrome per invocation, so a repeat (n>1) is a fresh browser with no warm font or HTTP cache.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.SERVE_PORT || '4361';
const CDP = process.env.CDP_PORT || '9361';
const [dist, ...cmd] = process.argv.slice(2);
if (!dist || !cmd.length) { console.error('usage: run.mjs <dist-dir> <script> [args]'); process.exit(2); }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (url, n = 80) => {
  for (let i = 0; i < n; i++) { try { if ((await fetch(url)).ok) return true; } catch {} await wait(250); }
  return false;
};
// detached = own process group, so the teardown can signal npx AND the server it spawned, and nothing else
const serve = spawn('npx', ['serve', resolve(dist), '-l', PORT], { cwd: ROOT, stdio: 'ignore', detached: true });
const prof = mkdtempSync(join(tmpdir(), 'gh253-prof-'));
const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${CDP}`, `--user-data-dir=${prof}`], { stdio: 'ignore', detached: true });
const down = async () => {
  for (const p of [chrome, serve]) { try { process.kill(-p.pid, 'SIGTERM'); } catch {} }
  await wait(600);
  rmSync(prof, { recursive: true, force: true });
};
if (!(await until(`http://localhost:${PORT}/`)) || !(await until(`http://127.0.0.1:${CDP}/json/version`))) {
  console.error('serve or chrome did not come up'); await down(); process.exit(2);
}
const child = spawn('node', cmd, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, BASE: `http://localhost:${PORT}`, CDP_PORT: CDP } });
const rc = await new Promise((r) => child.on('exit', r));
await down();
process.exit(rc ?? 1);
