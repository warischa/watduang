// Must-red driver for the gh#303 render checks: one planted fault per scratch copy, each copy in its own
// <dir>/design/ with <dir>/public linked to the repo's public/, so fonts and the support.js path resolve as on a real board.
// A plant counts as red only when the render exits 1 AND a problem matches the plant's own pattern: a plant that goes
// red for some other reason proves nothing about the check it was written for.
// Before the board plants, the event fixture's own guard (lib.mjs assertEvent) is fed two broken events (source side).
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [P, REPO, RENDER] = process.argv.slice(2);
if (!P || !REPO || !RENDER) { console.error('usage: node mustred.mjs <scratch dir outside the repo> <repo root> <absolute path of render-boards.mjs>'); process.exit(2); }
const G = `${REPO}/design`;
let bad = 0; let n = 0;
const out = [];

// ---- source side: the event fixture (REFUTE round 2, R1-2) ----
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
const frameOpen = (id, dir) => `data-frame="${id}" data-dir="${dir}"`;
const plants = [
  ['control', 'Gh303Fireworks', (s) => s, null],
  ['clip', 'Gh303Fireworks', (s) => s.replaceAll('data-min="18" data-max="20"', 'data-min="20" data-max="20"').replace('</style>', '.pj .chip > .fit { white-space: nowrap !important; }</style>'), /^clipped in A\/fw-idle/],
  ['floor-wrap-only', 'Gh303Fireworks', (s) => s.replaceAll('data-min="18" data-max="20"', 'data-min="20" data-max="20"'), /12-base-letter name wraps/],
  ['floor', 'Gh303Cards', (s) => s.replace('</style>', '.pj .grid .card .fit { font-size: 10px !important; }</style>'), /fit below its floor in B\/cd-idle/],
  ['font', 'Gh303Ladder', (s) => s.replace('sarabun-bold-subset.woff2', 'sarabun-bold-MISSING.woff2'), /^font Sarabun 700 error/],
  ['palette', 'Gh303Ladder', (s) => s.replace('</style>', '.pj .gname { color: #00ff00 !important; }</style>'), /div\.gname \(role: gold figures\) renders color:#00ff00/],
  ['thai-split', 'Gh303Home', (s) => s.replace('ดูทั้งหมด', 'ดูทั้งหมด ห<span>ว</span>ย'), /barred word U\+E2B U\+E27 U\+E22/],
  ['thai-entity', 'Gh303Home', (s) => s.replace('ดูทั้งหมด', 'ดู' + '&#' + 'x644;' + 'ทั้ง'), /foreign letter\/mark\/invisible U\+0644/],
  ['console', 'CatCompany-partyPop', (s) => s.replace('</body>', '<script>throw new Error("planted")</script></body>'), /^console: exception Error: planted/],
  ['matrix', 'Gh303Cards', (s) => s.replace('data-frame="cd-code"', 'data-frame="cd-codeX"'), /frame F\/cd-code found 0 times/],
  ['tap', 'Gh303Home', (s) => s.replace('</style>', '.hm .see-all { min-block-size: 0 !important; padding: 2px 8px !important; font-size: 12px !important; }</style>'), /tap under 44px in A\/home-1440/],
  ['overflow', 'CatCompany-partyPop', (s) => s.replace('<div class="foot">', '<div style="width: 1700px; height: 10px;"></div><div class="foot">'), /page scrolls sideways/],
  ['field', 'Gh303Fireworks', (s) => s.replace('</style>', '.pj .grid { grid-auto-rows: minmax(34px, auto) !important; }</style>'), /name field overflows its box/],
  ['wrap-above-floor', 'Gh303Ladder', (s) => s.replace('.pj .lplate .fit {', '.pj .lplate .fit { white-space: normal !important; overflow-wrap: anywhere !important; max-width: 120px;'), /name breaks the NAME FIT rule/],
  ['overlap', 'Gh303Ladder', (s) => s.replace('</style>', '.pj .lplate { left: 700px !important; }</style>'), /name boxes overlap/],
  // REFUTE round 1
  ['not-picked-colour', 'CatCompany-partyPop', (s) => s.replace('</style>', '.cp .gc { background-color: #23214d !important; }</style>'), /role: game and event cards\) renders background-color:#23214d/],
  ['second-red-suit', 'Gh303Cards', (s) => s.replace('</style>', '.pj .grid .card.up.red:not(.fail) .face { color: #ff3d7f !important; }</style>'), /role: rank on a red card\) renders color:#ff3d7f/],
  ['clip-1px', 'Gh303Fireworks', (s) => s.replace('</style>', '.pj .grid .chip.lan { height: 1px !important; overflow: hidden !important; }</style>'), /outside its parent or a clipping ancestor/],
  ['css-content', 'Gh303Fireworks', (s) => s.replace('</style>', '.pj .gname::before { content: "\\0644"; }</style>'), /::before carries content/],
  ['template', 'Gh303Home', (s) => s.replace('</x-dc>', '<template><p>hidden</p></template></x-dc>'), /<template> element/],
  ['digits', 'Gh303Cards', (s) => s.replace('4821 5307 6290', '4821 5307 6290 1234'), /clipped in F\/cd-code/],
  ['legend-24', 'Gh303Fireworks', (s) => s.replace('</style>', '.pj .legend .chip { font-size: 24px !important; }</style>'), /text under 30px in A\/fw-result: .*@24\.0px/],
  ['expect-off', 'Gh303Cards', (s) => s.replace('data-expect="100/50"', 'data-expect="100/51"'), /field count in A\/cd-result: holds 100 with 50 passed, says 100\/51/],
  // REFUTE round 2: the rendered-size floor, the closed grammar, exclusive role ownership
  ['scaled-50px', 'Gh303Fireworks', (s) => s.replace('</style>', '.pj .gname { transform: scale(0.5) !important; }</style>'), /text under 30px in A\/fw-idle: .*25\.0px rendered \(50px x 0\.50\)/],
  ['symbol-heart-use', 'Gh303Cards', (s) => s.replace(`${frameOpen('cd-reveal', 'B')} style="transform: scale(0.75);">`, `${frameOpen('cd-reveal', 'B')} style="transform: scale(0.75);"><svg width="24" height="24" aria-hidden="true"><symbol id="mr-heart" viewBox="0 0 24 24"><path d="M12 21L3 12L12 3L21 12z"/></symbol><use href="#mr-heart" fill="#ff3d7f"/></svg>`), /B\/cd-reveal: element <use> is outside the grammar/],
  ['not-picked-gradient-stop', 'CatCompany-partyPop', (s) => s.replace(`${frameOpen('cat-1440', 'A')}>`, `${frameOpen('cat-1440', 'A')}><svg width="40" height="40" aria-hidden="true"><defs><linearGradient id="mr-g"><stop offset="0" stop-color="#23214d"/></linearGradient></defs><rect width="40" height="40" fill="url(#mr-g)"/></svg>`), /A\/cat-1440: (element <defs> is outside the grammar|rect fill="url\(#mr-g\)" is outside the grammar)/],
  ['fill-opacity', 'Gh303Ladder', (s) => s.replace('</style>', '.pj svg.layer circle { fill-opacity: 0.5 !important; }</style>'), /computes fill-opacity 0\.5/],
  ['marker-content', 'CatCompany-partyPop', (s) => s.replace('</style>', '.cp .kicker { display: list-item !important; } .cp .kicker::marker { content: "\\00644"; }</style>'), /pseudo-element ::marker is outside the grammar/],
  ['live-ad-border', 'CatCompany-partyPop', (s) => s.replace('</style>', '.cp .ad { border-color: #c9c3a8 !important; }</style>'), /\(role: ad slots\) renders border-color:#c9c3a8/],
  // AMENDMENT 2026-11-11: the event card's art must load, and only the site's own art may be drawn
  ['art-missing', 'CatCompany-partyPop', (s) => s.replaceAll('../public/art/prize-draw.webp', '../public/art/prize-draw-MISSING.webp'), /image did not load in A\/cat-event-320/],
  ['art-foreign-src', 'CatCompany-partyPop', (s) => s.replaceAll('../public/art/prize-draw.webp', '../public/og/prize-draw.png'), /img src="\.\.\/public\/og\/prize-draw\.png" is outside the grammar/],
  ['white-rank-red-card', 'Gh303Cards', (s) => s.replace('</style>', '.pj .grid .card.up.red .face { color: #ffffff !important; }</style>'), /role: rank on a red card\) renders color:#ffffff/],
];
for (const [name, board, f, want] of plants) {
  const dir = `${P}/gh303-mr/${name}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(`${dir}/design`, { recursive: true });
  if (!existsSync(`${dir}/public`)) symlinkSync(`${REPO}/public`, `${dir}/public`);
  const src = readFileSync(`${G}/${board}.dc.html`, 'utf8'); const planted = f(src);
  if (name !== 'control') n++;
  if (name !== 'control' && planted === src) { out.push(`UNEXPECTED ${name}: PLANT DID NOT APPLY`); bad++; continue; }
  writeFileSync(`${dir}/design/${board}.dc.html`, planted);
  let rc = 0, txt = '';
  try { txt = execFileSync('node', [RENDER, `${dir}/design/${board}.dc.html`], { env: { ...process.env, CHECK_ONLY: '1' }, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { rc = e.status; txt = e.stdout; }
  let probs = null; try { probs = JSON.parse(txt)[0].problems; } catch { probs = null; }
  // The verdict: the control stays green (rc 0, no problem); every plant goes red (rc 1) with its own check's line.
  const hit = want && probs ? probs.find((p) => want.test(p)) : null;
  const ok = probs && (name === 'control' ? rc === 0 && probs.length === 0 : rc !== 0 && !!hit);
  if (!ok) bad++;
  out.push(`${ok ? 'as expected' : 'UNEXPECTED'} ${name} (${board}): rc=${rc}; ${probs ? probs.length : 'no report'} problems; ${hit ? 'its line: ' + hit.slice(0, 170) : 'first: ' + ((probs || []).map((p) => p.slice(0, 170)).slice(0, 2).join(' || ') || '-')}`);
}
console.log(out.join('\n'));
console.error(`${bad ? 'FAIL' : 'ok'}: ${n} plants and 2 controls; ${bad} unexpected (a green plant, a plant red for another reason, a plant not applied, or a red control)`);
process.exitCode = bad ? 1 : 0;
