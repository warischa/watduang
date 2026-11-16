// Must-red driver for the gh#315 / gh#316 render checks, adapted from gh303-boards-2026-11-11/mustred.mjs at commit
// 1f57574. One planted fault per scratch copy, each copy in its own <dir>/design/ with <dir>/public linked to the
// repo's public/, so fonts and the support.js path resolve as on a real board. A plant counts as red only when the
// render exits 1 AND a problem matches the plant's own pattern: a plant that goes red for some other reason proves
// nothing about the check it was written for. Before the board plants, the event fixture's own guard (assertEvent,
// imported read-only from gh#303 through lib.mjs) is fed two broken events (source side).
// With an inert renderer (one that always exits 0) every plant comes back UNEXPECTED and this driver exits 1.
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [P, REPO, RENDER] = process.argv.slice(2);
if (!P || !REPO || !RENDER) { console.error('usage: node mustred.mjs <scratch dir outside the repo> <repo root> <path of render-boards.mjs>'); process.exit(2); }
const G = `${REPO}/design`;
let bad = 0; let n = 0;
const out = [];

// ---- source side: the event fixture (the gh#303 guard, unchanged) ----
const { assertEvent, EV } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib.mjs')).href);
const outsider = EV.field1.find((x) => !EV.pass1.has(x));
const events = [
  ['event control', EV, null],
  ['event: 1 invited, 196 joined', { ...EV, invited: 1 }, /joined but only 1 invited/],
  ['event: a round-2 participant who did not survive round 1', { ...EV, field2: [...EV.field2.slice(0, -1), outsider] }, /round 2 participants are not exactly the round 1 survivors/],
];
for (const [name, ev, want] of events) {
  let msg = null; try { assertEvent(ev); } catch (e) { msg = e.message; }
  const ok = want ? msg !== null && want.test(msg) : msg === null; n += want ? 1 : 0; if (!ok) bad++;
  out.push(`${ok ? 'as expected' : 'UNEXPECTED'} ${name} (source): ${msg ?? 'accepted'}`);
}

// ---- board side: [name, board, plant, the pattern its own check must report] ----
const plants = [
  ['control', 'Gh315Zones', (s) => s, null],
  ['control-marbles', 'Gh316Marbles', (s) => s, null],
  ['clip', 'Gh315Zones', (s) => s.replaceAll('data-min="18" data-max="20"', 'data-min="20" data-max="20"').replace('</style>', '.pj .zgrid .chip > .fit { white-space: nowrap !important; }</style>'), /^clipped in A\/zn-idle/],
  ['floor-wrap-only', 'Gh315Zones', (s) => s.replaceAll('data-min="18" data-max="20"', 'data-min="20" data-max="20"'), /12-base-letter name wraps/],
  ['floor', 'Gh315Zones', (s) => s.replace('</style>', '.pj .zgrid .chip .fit { font-size: 10px !important; }</style>'), /fit below its floor in A\/zn-idle/],
  ['font', 'Gh316Marbles', (s) => s.replace('sarabun-bold-subset.woff2', 'sarabun-bold-MISSING.woff2'), /^font Sarabun 700 error/],
  ['palette', 'Gh315Zones', (s) => s.replace('</style>', '.pj .gname { color: #00ff00 !important; }</style>'), /div\.gname \(role: gold figures\) renders color:#00ff00/],
  ['not-owned-colour', 'Gh315Zones', (s) => s.replace('</style>', '.pj .zname { color: #ff3d7f !important; }</style>'), /role: zone header text\) renders color:#ff3d7f/],
  ['two-owners', 'Gh315Zones', (s) => s.replace('data-values-dir="A">', 'data-values-dir="A"><tr data-sel=".pj .zname" data-v="color:#ffffff"><td>intruder</td><td>x</td><td>x</td><td>x</td></tr>'), /color is owned by 2 roles/],
  // The barred word is split by markup in this source literal, so the raw file does not carry it; the rendered DOM does.
  ['thai-split', 'Gh315Zones', (s) => s.replace('โซนสีลุกยืน', 'โซนสีลุกยืน ห<span>ว</span>ย'), /barred word U\+E2B U\+E27 U\+E22/],
  ['thai-entity', 'Gh315Zones', (s) => s.replace('โซนสีลุกยืน', 'โซนสีลุก' + '&#' + 'x644;' + 'ยืน'), /foreign letter\/mark\/invisible U\+0644/],
  ['console', 'Gh316Marbles', (s) => s.replace('</body>', '<script>throw new Error("planted")</script></body>'), /^console: exception Error: planted/],
  ['matrix', 'Gh315Zones', (s) => s.replace('data-frame="zn-fallback"', 'data-frame="zn-fallbackX"'), /frame F\/zn-fallback found 0 times/],
  ['overflow', 'Gh315Zones', (s) => s.replace('<body>', '<body><div style="width: 1700px; height: 10px;"></div>'), /page scrolls sideways/],
  ['field', 'Gh315Zones', (s) => s.replace('</style>', '.pj .zgrid { grid-auto-rows: minmax(34px, auto) !important; }</style>'), /name field overflows its box in A\/zn-idle/],
  ['expect-off', 'Gh315Zones', (s) => s.replace(/data-expect="(\d+)\/(\d+)"/, (m, a, b) => `data-expect="${a}/${+b + 1}"`), /field count in A\/zn-reveal/],
  ['legend-24', 'Gh315Zones', (s) => s.replace('</style>', '.pj .legend .chip { font-size: 24px !important; }</style>'), /text under 30px in A\/zn-wholeend: .*@24\.0px/],
  ['scaled-50px', 'Gh315Zones', (s) => s.replace('</style>', '.pj .gname { transform: scale(0.5) !important; }</style>'), /text under 30px in A\/zn-idle: .*25\.0px rendered \(50px x 0\.50\)/],
  ['overlap', 'Gh315Zones', (s) => s.replace('</style>', '.pj .zpanel { position: absolute !important; left: 100px !important; top: 100px !important; }</style>'), /name boxes overlap in A\/zn-idle/],
  ['clip-1px', 'Gh315Zones', (s) => s.replace('</style>', '.pj .zgrid .chip { height: 1px !important; overflow: hidden !important; }</style>'), /outside its parent or a clipping ancestor/],
  ['css-content', 'Gh315Zones', (s) => s.replace('</style>', '.pj .gname::before { content: "\\0644"; }</style>'), /::before carries content/],
  ['template', 'Gh315Zones', (s) => s.replace('</x-dc>', '<template><p>hidden</p></template></x-dc>'), /<template> element/],
  ['wrap-above-floor', 'Gh316Marbles', (s) => s.replace('</style>', '.pj .lanes .chip .fit { white-space: normal !important; overflow-wrap: anywhere !important; max-width: 120px; }</style>'), /name breaks the NAME FIT rule/],
  ['fill-opacity', 'Gh316Marbles', (s) => s.replace('</style>', '.pj svg.layer circle { fill-opacity: 0.5 !important; }</style>'), /computes fill-opacity 0\.5/],
  // The ::marker rule alone: with display:list-item in the same plant, the computed list-item check fires on every
  // frame and buries the pseudo-element line past the report's grammar slice, so the two branches get separate plants.
  ['marker-content', 'Gh316Marbles', (s) => s.replace('</style>', '.pj .gname::marker { content: "\\00644"; }</style>'), /pseudo-element ::marker is outside the grammar/],
  ['list-item', 'Gh316Marbles', (s) => s.replace('</style>', '.pj .gname { display: list-item !important; }</style>'), /computes a list item \(::marker\)/],
  ['track-gradient', 'Gh316Marbles', (s) => s.replace('</style>', '.pj .track { background-image: linear-gradient(45deg, #23214d, #ff3d7f) !important; }</style>'), /no role owns background-image/],
  ['marble-count', 'Gh316Marbles', (s) => s.replace('data-expect="196/100"', 'data-expect="196/101"'), /field count in B\/mb-reveal/],
  // The idle invariant: nobody is across at idle. A gold plate or chip there leaks the draw before the race.
  ['idle-leak-lanes', 'Gh316Marbles', (s) => s.replace('class="chip"><span class="fit" data-min="18" data-max="28"', 'class="chip in"><span class="fit" data-min="18" data-max="28"'), /field count in A\/mb-idle: holds 20 with 1 passed, says 20\/0/],
  ['idle-leak-grid', 'Gh316Marbles', (s) => s.replace('class="chip"><span class="fit" data-min="14" data-max="18"', 'class="chip in"><span class="fit" data-min="14" data-max="18"'), /field count in B\/mb-idle: holds 196 with 1 passed, says 196\/0/],
];
for (const [name, board, f, want] of plants) {
  const dir = `${P}/gh315-316-mr/${name}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/design`, { recursive: true });
  if (!existsSync(`${dir}/public`)) symlinkSync(`${REPO}/public`, `${dir}/public`);
  const src = readFileSync(`${G}/${board}.dc.html`, 'utf8'); const planted = f(src);
  if (!name.startsWith('control')) n++;
  if (!name.startsWith('control') && planted === src) { out.push(`UNEXPECTED ${name}: PLANT DID NOT APPLY`); bad++; continue; }
  writeFileSync(`${dir}/design/${board}.dc.html`, planted);
  let rc = 0, txt = '';
  try { txt = execFileSync('node', [RENDER, `${dir}/design/${board}.dc.html`], { env: { ...process.env, CHECK_ONLY: '1' }, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { rc = e.status; txt = e.stdout; }
  let probs = null; try { probs = JSON.parse(txt)[0].problems; } catch { probs = null; }
  const hit = want && probs ? probs.find((p) => want.test(p)) : null;
  const ok = probs && (name.startsWith('control') ? rc === 0 && probs.length === 0 : rc !== 0 && !!hit);
  if (!ok) bad++;
  out.push(`${ok ? 'as expected' : 'UNEXPECTED'} ${name} (${board}): rc=${rc}; ${probs ? probs.length : 'no report'} problems; ${hit ? 'its line: ' + hit.slice(0, 170) : 'first: ' + ((probs || []).map((p) => p.slice(0, 170)).slice(0, 2).join(' || ') || '-')}`);
}
console.log(out.join('\n'));
console.error(`${bad ? 'FAIL' : 'ok'}: ${n} plants and 3 controls; ${bad} unexpected (a green plant, a plant red for another reason, a plant not applied, or a red control)`);
process.exitCode = bad ? 1 : 0;
