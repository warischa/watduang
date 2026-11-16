// Must-red driver for the gh#317 / gh#318 render checks. COPIED from gh#303's mustred.mjs and changed: the plants
// target these two boards and their elements; the event-fixture guard is still gh#303's assertEvent (imported
// read-only). One planted fault per scratch copy, each in its own <dir>/design/ with <dir>/public linked to the
// repo's public/, so fonts and the support.js path resolve as on a real board. A plant counts as red only when the
// render exits 1 AND a problem matches the plant's own pattern; a plant red for another reason proves nothing.
// The two controls (one per board, unplanted) must stay green. Usage:
//   node mustred.mjs <scratch dir outside the repo> <repo root> <absolute path of this dir's render-boards.mjs>
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [P, REPO, RENDER] = process.argv.slice(2);
if (!P || !REPO || !RENDER) { console.error('usage: node mustred.mjs <scratch dir outside the repo> <repo root> <absolute path of render-boards.mjs>'); process.exit(2); }
const G = `${REPO}/design`;
let bad = 0; let n = 0;
const out = [];

// ---- source side: the event fixture (gh#303 lib.mjs assertEvent, read-only) ----
const { assertEvent, EV } = await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gh303-boards-2026-11-11/lib.mjs')).href);
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
const frameOpen = (id, dir) => `data-frame="${id}" data-dir="${dir}" style="transform: scale(0.75);">`;
const plants = [
  ['control', 'Gh317Envelopes', (s) => s, null],
  ['control', 'Gh318Cards', (s) => s, null],
  ['clip', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj .plate { width: 120px !important; } .pj .plate .fit { white-space: nowrap !important; }</style>'), /clipped in A\/env-idle/],
  ['fit-floor', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj .slot .sw { font-size: 10px !important; }</style>'), /fit below its floor in A\/env-result/],
  ['font', 'Gh318Cards', (s) => s.replace('sarabun-bold-subset.woff2', 'sarabun-bold-MISSING.woff2'), /^font Sarabun 700 error/],
  ['palette', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj .gname { color: #00ff00 !important; }</style>'), /div\.gname \(role: gold figures\) renders color:#00ff00/],
  ['thai-split', 'Gh317Envelopes', (s) => s.replace('รอเปิดรอบชิง', 'รอเปิดรอบชิง ห<span>ว</span>ย'), /barred word U\+E2B U\+E27 U\+E22/],
  ['thai-entity', 'Gh317Envelopes', (s) => s.replace('ซองของขวัญปิดอยู่', 'ซองของขวัญปิดอยู่' + '&#' + 'x644;'), /foreign letter\/mark\/invisible U\+0644/],
  ['console', 'Gh318Cards', (s) => s.replace('</body>', '<script>throw new Error("planted")</script></body>'), /^console: exception Error: planted/],
  ['matrix', 'Gh317Envelopes', (s) => s.replace('data-frame="env-few"', 'data-frame="env-fewX"'), /frame F\/env-few found 0 times/],
  ['overflow', 'Gh317Envelopes', (s) => s.replace('<div data-pick=', '<div style="width: 1700px; height: 10px;"></div><div data-pick='), /page scrolls sideways/],
  ['field-count', 'Gh317Envelopes', (s) => s.replace('data-expect="5/2"', 'data-expect="5/3"'), /field count in A\/env-rv-one: holds 5 with 2 passed, says 5\/3/],
  ['overlap', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj .plate { left: 700px !important; }</style>'), /name boxes overlap in A\/env-idle/],
  ['wrap-above-floor', 'Gh317Envelopes', (s) => s.replace('.pj .plate .fit {', '.pj .plate .fit { white-space: normal !important; overflow-wrap: anywhere !important; max-width: 120px;'), /name breaks the NAME FIT rule/],
  ['legend-24', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj .lk { font-size: 24px !important; }</style>'), /text under 30px in A\/env-idle: .*@24\.0px/],
  ['scaled-50px', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj .gname { transform: scale(0.5) !important; }</style>'), /text under 30px in A\/env-idle: .*25\.0px rendered \(50px x 0\.50\)/],
  ['symbol-use', 'Gh317Envelopes', (s) => s.replace(frameOpen('env-rv-one', 'A'), frameOpen('env-rv-one', 'A') + '<svg width="24" height="24" aria-hidden="true"><symbol id="mr-star" viewBox="0 0 24 24"><path d="M12 2L3 12L12 22L21 12z"/></symbol><use href="#mr-star" fill="#ffcc00"/></svg>'), /A\/env-rv-one: element <use> is outside the grammar/],
  ['fill-opacity', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj svg.layer circle { fill-opacity: 0.5 !important; }</style>'), /computes fill-opacity 0\.5/],
  ['css-content', 'Gh317Envelopes', (s) => s.replace('</style>', '.pj .gname::before { content: "\\0644"; }</style>'), /::before carries content/],
  ['template', 'Gh318Cards', (s) => s.replace('</x-dc>', '<template><p>hidden</p></template></x-dc>'), /<template> element/],
  ['card-face-colour', 'Gh318Cards', (s) => s.replace('</style>', '.pj .pcard.up.prize { background-color: #23214d !important; }</style>'), /role: card face with a prize\) renders background-color:#23214d/],
  ['card-label-gold', 'Gh318Cards', (s) => s.replace('</style>', '.pj .pcard.up.prize .fk { color: #ffcc00 !important; }</style>'), /role: prize label on a face\) renders color:#ffcc00/],
  ['card-clip-1px', 'Gh318Cards', (s) => s.replace('</style>', '.pj .pcard { height: 1px !important; overflow: hidden !important; }</style>'), /outside its parent or a clipping ancestor/],
  ['card-count', 'Gh318Cards', (s) => s.replace('data-expect="5/0"', 'data-expect="5/1"'), /field count in A\/card-idle: holds 5 with 0 passed, says 5\/1/],
];
for (const [name, board, f, want] of plants) {
  const dir = `${P}/gh317-mr/${name}-${board}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/design`, { recursive: true });
  if (!existsSync(`${dir}/public`)) symlinkSync(`${REPO}/public`, `${dir}/public`);
  const src = readFileSync(`${G}/${board}.dc.html`, 'utf8'); const planted = f(src);
  if (name !== 'control') n++;
  if (name !== 'control' && planted === src) { out.push(`UNEXPECTED ${name}: PLANT DID NOT APPLY`); bad++; continue; }
  writeFileSync(`${dir}/design/${board}.dc.html`, planted);
  let rc = 0, txt = '';
  try { txt = execFileSync('node', [RENDER, `${dir}/design/${board}.dc.html`], { env: { ...process.env, CHECK_ONLY: '1' }, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { rc = e.status; txt = e.stdout; }
  let probs = null; try { probs = JSON.parse(txt)[0].problems; } catch { probs = null; }
  const hit = want && probs ? probs.find((p) => want.test(p)) : null;
  const ok = probs && (name === 'control' ? rc === 0 && probs.length === 0 : rc !== 0 && !!hit);
  if (!ok) bad++;
  out.push(`${ok ? 'as expected' : 'UNEXPECTED'} ${name} (${board}): rc=${rc}; ${probs ? probs.length : 'no report'} problems; ${hit ? 'its line: ' + hit.slice(0, 170) : 'first: ' + ((probs || []).map((p) => p.slice(0, 170)).slice(0, 2).join(' || ') || '-')}`);
}
console.log(out.join('\n'));
console.error(`${bad ? 'FAIL' : 'ok'}: ${n} plants and 2 controls; ${bad} unexpected (a green plant, a plant red for another reason, a plant not applied, or a red control)`);
process.exitCode = bad ? 1 : 0;
