#!/usr/bin/env node
// gh#325 must-red driver, FROZEN kit file. COPIED from gh#317-318's mustred.mjs and changed: one board per run,
// named by its module; the plants are the kit's generic ones (kit.mjs kitPlants) plus the board's own
// (BOARD.plants), plus the board's extra commands (BOARD.extra); the source guards are the kit's (half-cut, the
// 14-digit code, the generator's argv guard, the banned-word scan). A plant counts as red only when its check
// exits non-zero AND reports the plant's own line; a plant red for another reason proves nothing. Each control
// (an unplanted board, a valid fixture) must stay green. Scratch dirs carry the board name, so sibling runs never
// collide. A kit plant whose marker the board lacks is printed 'not applicable', never counted. Each board copy lives in <scratch>/gh325-mr/<board>/<plant>/design/ with public/ and docs/ linked.
// Usage: CDP_PORT=<port> node mustred.mjs board-<x>.mjs <scratch dir outside the repo>
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertHalfCut, WORD_ROUND, assertCode, wordCode, kitPlants } from './kit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const [modArg, P] = process.argv.slice(2);
if (!modArg || !P || !process.env.CDP_PORT || !/^board-[a-z0-9-]+\.mjs$/.test(path.basename(modArg))) { console.error('usage: CDP_PORT=<port> node mustred.mjs board-<x>.mjs <scratch dir outside the repo>'); process.exit(2); }
if (path.resolve(P).startsWith(REPO + path.sep)) { console.error('the scratch dir must be outside the repo'); process.exit(2); }
const BOARD = (await import(pathToFileURL(path.resolve(here, path.basename(modArg))).href)).BOARD;
let bad = 0, nPlants = 0, nControls = 0; const out = [];
const record = (ok, name, msg, control) => { if (control) nControls++; else nPlants++; if (!ok) bad++; out.push(`${ok ? 'as expected' : 'UNEXPECTED'} ${name}: ${msg}`); };
const run = (args, env = {}) => { try { return { rc: 0, txt: execFileSync('node', args, { cwd: here, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { rc: e.status, txt: (e.stdout ?? '') + (e.stderr ?? '') }; } };

// ---- source side: the kit's guards ----
const guard = (name, fn, want) => { let msg = null; try { fn(); } catch (e) { msg = e.message; } record(want ? msg !== null && want.test(msg) : msg === null, `${name} (source)`, msg ?? 'accepted', !want); };
guard('half-cut control', () => assertHalfCut(WORD_ROUND), null);
guard('half-cut: 200 live, keep 99', () => assertHalfCut({ ...WORD_ROUND, keep: 99 }), /not a half-cut: live 200, keep 99/);
guard('half-cut: 201 heads', () => assertHalfCut({ ...WORD_ROUND, live: 201, names: [...WORD_ROUND.names, 'x'] }), /201 heads, more than MAX_HEADS 200/);
const good = wordCode(1, { seed: '48215', cut: 100, revision: 1, kind: 8, pool: 'food' });
guard('code control', () => assertCode(good, 1), null);
guard('code: 13 digits', () => assertCode(good.slice(1), 1), /13 digits, not 14/);
guard('code: one digit changed', () => assertCode(good.slice(0, 13) + ((Number(good[13]) + 1) % 10), 1), /fails its Damm check/);
guard('code: typed into another round', () => assertCode(good, 2), /fails its Damm check for round 2/);
for (const [name, args] of [['generator: no board named', ['make-boards.mjs']], ['generator: two boards named', ['make-boards.mjs', 'board-a.mjs', 'board-b.mjs']]]) {
  const r = run(args); const ok = r.rc === 2 && /exactly one board module/.test(r.txt); record(ok, `${name} (source)`, `rc=${r.rc}; ${r.txt.trim().slice(0, 100)}`, false);
}
const board = path.join(REPO, 'design', `${BOARD.name}.dc.html`);
const src = readFileSync(board, 'utf8');
{
  const r = run(['banned-scan.mjs', board]); record(r.rc === 0 && /: 0 hits/.test(r.txt), 'banned-scan control (board)', `rc=${r.rc}; ${r.txt.trim().split('\n').pop()}`, true);
  const dir = path.join(P, 'gh325-mr', BOARD.name, 'banned'); mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${BOARD.name}.dc.html`); writeFileSync(f, src.replace('</style>', '.pj .chips { display: none; }</style>'));
  const r2 = run(['banned-scan.mjs', f]); record(r2.rc === 1 && /"chips"/.test(r2.txt), 'banned-scan plant (a .chips class)', `rc=${r2.rc}; ${r2.txt.trim().split('\n')[0].slice(0, 120)}`, false);
  const f2 = path.join(dir, `${BOARD.name}-th.dc.html`); writeFileSync(f2, src.replace('</x-dc>', '<p>\u0e40\u0e14\u0e34\u0e21\u0e1e\u0e31\u0e19</p></x-dc>'));
  const r3 = run(['banned-scan.mjs', f2]); record(r3.rc === 1 && /: 1 hits/.test(r3.txt), 'banned-scan plant (a barred Thai word, held as escapes here)', `rc=${r3.rc}; ${r3.txt.trim().split('\n').pop().slice(0, 120)}`, false);
}

// ---- board side: one planted fault per scratch copy, the render in CHECK_ONLY mode ----
const first = Object.entries(BOARD.expect).flatMap(([d, ids]) => ids.map((i) => `${d}/${i}`))[0];
const plants = [['control', (s) => s, null], ...kitPlants(first), ...(BOARD.plants ?? [])];
const na = [];
for (const [name, f, want, marker] of plants) {
  if (marker && !src.includes(marker)) { na.push(name); out.push(`not applicable ${name}: the board draws no ${marker}`); continue; }
  const dir = path.join(P, 'gh325-mr', BOARD.name, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(path.join(dir, 'design'), { recursive: true });
  for (const l of ['public', 'docs']) if (!existsSync(path.join(dir, l))) symlinkSync(path.join(REPO, l), path.join(dir, l));
  const planted = f(src);
  if (name !== 'control' && planted === src) { record(false, name, 'PLANT DID NOT APPLY', false); continue; }
  const html = path.join(dir, 'design', `${BOARD.name}.dc.html`); writeFileSync(html, planted);
  const r = run(['render-boards.mjs', path.basename(modArg), html], { CHECK_ONLY: '1' });
  let probs = null; try { probs = JSON.parse(r.txt.slice(0, r.txt.lastIndexOf(']') + 1))[0].problems; } catch { probs = null; }
  const hit = want && probs ? probs.find((p) => want.test(p)) : null;
  const ok = !!probs && (name === 'control' ? r.rc === 0 && probs.length === 0 : r.rc !== 0 && !!hit);
  record(ok, `${name} (${BOARD.name})`, `rc=${r.rc}; ${probs ? probs.length : 'no report'} problems; ${hit ? 'its line: ' + hit.slice(0, 170) : 'first: ' + ((probs || []).map((p) => p.slice(0, 170)).slice(0, 2).join(' || ') || (probs ? '-' : r.txt.trim().split('\n').pop().slice(0, 170)))}`, name === 'control');
}

// ---- the board's extra commands: [name, args, env, the pattern its own check must report | null for a control] ----
for (const [name, args, env, want] of BOARD.extra ?? []) {
  const r = run(args, { ...env, SHOT_TMP: path.join(P, 'gh325-mr', BOARD.name, 'shots') });
  const line = want ? r.txt.split('\n').find((l) => want.test(l)) : null;
  const ok = want ? r.rc !== 0 && !!line : r.rc === 0;
  record(ok, `${name} (${BOARD.name} extra)`, `rc=${r.rc}; ${line ? 'its line: ' + line.trim().slice(0, 170) : (r.txt.match(/"problems": \[[^\]]*\]/)?.[0] ?? r.txt.trim().split('\n').pop()).replace(/\s+/g, ' ').slice(0, 170)}`, !want);
}
console.log(out.join('\n'));
console.error(`${bad ? 'FAIL' : 'ok'}: ${nPlants} plants and ${nControls} controls (${na.length} not applicable); ${bad} unexpected (a green plant, a plant red for another reason, a plant not applied, or a red control)`);
process.exitCode = bad ? 1 : 0;
