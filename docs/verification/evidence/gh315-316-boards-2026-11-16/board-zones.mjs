// gh#315 board: the colour-zone stand-up elimination game. Every count is the gh#303 fixture (EV): 200 invited,
// 196 joined, round 1 cuts 196 to 100. Frames are 2D stills of the 3D intent (three, ADR-0060), authored 1920x1080,
// shown at 75%. Values: the gh#302 B NIGHT STAGE pick, the gh#303 picks, tokens.css; new combinations are PROPOSAL.
import { th, nm, fit, EV, rng, shuffle, WIDE_AM, ZC, ZONE_COLORS, tint, resetCopy, boardDoc, tag, ORDER_LINE, valuesTable, contrastTable, beatTable, copyRow, notesRow, rulesRow, nameFitRow } from './lib.mjs';
import { rolesRow } from './roles.mjs';
import { STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, scaled, frame, top, plainReveal } from './stage.mjs';

const GNAME = () => th('โซนสีลุกยืน', 'game name', 'ticket');
const PEOPLE = () => th('คน', 'unit: people', 'g302');
const ZKEYS4 = ['punch', 'sky', 'lilac', 'white'];
const ZKEYS6 = [...ZKEYS4, 'soft', 'cream'];
const ZLABEL = { punch: 'โซนสีชมพู', sky: 'โซนสีฟ้า', lilac: 'โซนสีม่วง', white: 'โซนสีขาว', soft: 'โซนสีเทาอ่อน', cream: 'โซนสีครีม' };
const zl = (k) => th(ZLABEL[k], 'zone label');

// A seated figure, drawn (the self-hosted subsets carry no such glyph): head, back, thigh, shin.
const sitIcon = (w = 28) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="4" r="3" fill="#d9d6f0"/><path d="M8 8v6h7v6" fill="none" stroke="#d9d6f0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Zone paint, generated from the same constants the role table reads, so CSS and roles cannot drift apart.
const ZONE_CSS = ZKEYS6.map((k) => `
    .pj .zpanel.z${k} { background-color: ${tint(k)}; box-shadow: inset 0 0 0 3px ${ZC[k]}; }
    .pj .zhead .zdot.z${k}, .pj .chip:not(.in) .zdot.z${k} { background-color: ${ZC[k]}; }`).join('');

const CSS = `
    /* ---- colour zones. Field 100..870 (770px), lower band 170px (a PROPOSAL departure from gh#303's 190px). ---- */
    .pj .low { height: 170px; }
    .pj .zfield { position: absolute; left: 56px; right: 56px; top: 100px; height: 770px; z-index: 1; }
    .pj .zblocks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 375px; gap: 20px; }
    .pj .zcols { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
    .pj .zpanel { position: relative; box-sizing: border-box; border-radius: 24px; padding: 4px 16px; display: flex; flex-direction: column; gap: 2px; }
    .pj .zcols .zpanel { padding: 4px 12px; }
    .pj .zhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 34px; }
    .pj .zname { display: flex; align-items: center; gap: 10px; font: 600 30px/1 'Mitr', sans-serif; color: #ffffff; white-space: nowrap; }
    .pj .zdot { display: inline-block; width: 22px; height: 22px; border-radius: 50%; }
    .pj .chip.in .zdot { background-color: #14142b; }
    .pj .zbadge { display: flex; align-items: center; gap: 8px; font: 600 30px/1 'Mitr', sans-serif; color: #d9d6f0; white-space: nowrap; }
    .pj .zgrid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(22px, auto); gap: 2px 8px; align-content: center; }
    .pj .zcols .zgrid { grid-template-columns: minmax(0, 1fr); grid-auto-rows: minmax(21px, auto); gap: 1px 0; }
    .pj .zgrid .chip { font-weight: 700; }
    .pj .zcols .zgrid .chip { font-size: 18px; }
    /* C: the gh#303 picked field (8 columns, 27px rows) with a zone dot inside each chip. */
    .pj .grid .chip { font-weight: 700; }
    .pj .grid .chip .zdot { width: 14px; height: 14px; flex: 0 0 auto; }
    .pj .zlegend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
    .pj .zlegend .chip { width: 230px; height: 44px; font-size: 30px; justify-content: flex-start; gap: 10px; padding: 0 14px; }
    .pj .zlegend .zdot { width: 20px; height: 20px; flex: 0 0 auto; }
    .pj .zlab { font: 600 30px/1 'Mitr', sans-serif; color: #ffffff; white-space: nowrap; }
    .pj .legend .chip { width: 170px; height: 48px; font-size: 30px; }${ZONE_CSS}`;

// ---- zone assignment (theatre; the verdict itself is always EV's draw, decision 7) ----
// Z2-B: random zones, round-robin so sizes differ by at most one. Seeded, so a re-run writes the same bytes.
function assignRandom(Z, seed) {
  const order = shuffle(EV.field1.map((n, i) => i), rng(seed));
  const zones = Array.from({ length: Z }, () => []);
  order.forEach((idx, k) => zones[k % Z].push(idx));
  // The SARA AM worst case must land in a short column on layout B, where a wrapped row has no spare height.
  if (Z === 6) {
    const amIdx = EV.field1.indexOf(WIDE_AM);
    const from = zones.findIndex((z) => z.includes(amIdx));
    const short = zones.findIndex((z) => z.length < zones[from].length);
    if (short >= 0) { const swap = zones[short][0]; zones[short][0] = amIdx; zones[from][zones[from].indexOf(amIdx)] = swap; }
  }
  return zones.map((z) => z.map((i) => EV.field1[i]));
}
// Z2-A: zone sizes drawn to the cut, so whole zones sit. Disclosed: fate is readable when zones are assigned
// (the gh#300 R2 precedent: a card fate readable at the deal was accepted). Odds are unchanged: the draw is already fixed.
const sitCount = (Z) => Math.max(1, Math.min(Z - 1, Math.round((Z * (EV.field1.length - EV.pass1.size)) / EV.field1.length)));
function assignWhole(Z) {
  const out = EV.field1.filter((n) => !EV.pass1.has(n));
  const inn = EV.field1.filter((n) => EV.pass1.has(n));
  const k = sitCount(Z);
  const split = (arr, m) => { const base = Math.floor(arr.length / m), rem = arr.length % m; const parts = []; let i = 0; for (let j = 0; j < m; j++) { const sz = base + (j < rem ? 1 : 0); parts.push(arr.slice(i, i + sz)); i += sz; } return parts; };
  return [...split(out, k), ...split(inn, Z - k)];
}

// ---- chips ----
// state: 'plain' (standing, unresolved), 'in' (passed), 'out' (did not pass). dot: zone colour tag (layout C).
const stateCls = (s) => `chip${s === 'in' ? ' in' : s === 'out' ? ' out' : ''}`;
function chip(n, state, zk, dot) {
  const d = dot ? `<i class="zdot z${zk}"></i>` : '';
  return `<span class="${stateCls(state)}">${d}<span class="${dot ? fit(16, 20) : fit(18, 20)}">${nm(n)}</span></span>`;
}
const chipB = (n, state) => `<span class="${stateCls(state)}"><span class="${fit(18, 18)}">${nm(n)}</span></span>`;

function badge(mode, n) {
  if (mode === 'idle') return `<span class="zbadge">${th('ยืนขึ้น', 'zone badge: stand up')}</span>`;
  if (mode === 'sit') return `<span class="zbadge">${sitIcon()}${th('นั่งลง', 'zone badge: sit down')}</span>`;
  if (mode === 'stay') return `<span class="zbadge">${th('ยืนต่อ', 'zone badge: stay standing')}</span>`;
  return `<span class="zbadge">${n > 0 ? `${th('นั่ง', 'zone badge: seated count')} ${n}` : th('ยืนครบ', 'zone badge: all standing')}</span>`;
}

// One zone panel (layouts A and B). resolved: the verdict landed. whole: Z2-A mode; sits: this zone is an out zone.
function panel(zk, names, { resolved = false, whole = false, sits = false, layout }) {
  const passN = names.filter((n) => EV.pass1.has(n)).length;
  const outN = names.length - passN;
  const stateOf = (n) => !resolved ? 'plain' : EV.pass1.has(n) ? 'in' : 'out';
  const chips = names.map((n) => (layout === 'B' ? chipB(n, stateOf(n)) : chip(n, stateOf(n), zk, false))).join('');
  const bmode = whole ? (resolved ? (sits ? 'sit' : 'stay') : 'idle') : resolved ? 'count' : 'idle';
  const expect = resolved ? ` data-expect="${names.length}/${passN}"` : '';
  return `<div class="zpanel z${zk}"><div class="zhead"><span class="zname"><i class="zdot z${zk}"></i>${zl(zk)}</span>${badge(bmode, outN)}</div><div class="zgrid"${expect}>${chips}</div></div>`;
}

// Layout C: one tagged field, the gh#303 grid geometry. resolvedZones: how many zone groups resolved, or 'all'.
const zonesC = assignRandom(4, 315);
const zoneOfC = new Map(); zonesC.forEach((z, k) => z.forEach((n) => zoneOfC.set(n, k)));
function taggedField(resolvedZones) {
  const chips = EV.field1.map((n) => {
    const k = zoneOfC.get(n);
    const resolved = resolvedZones === 'all' || k < resolvedZones;
    return chip(n, !resolved ? 'plain' : EV.pass1.has(n) ? 'in' : 'out', ZKEYS4[k], true);
  }).join('');
  const expect = resolvedZones === 'all' ? ` data-expect="${EV.field1.length}/${EV.pass1.size}"` : '';
  return `<div class="grid"${expect}>${chips}</div>`;
}
const zlegend = () => `<div class="zlegend">${ZKEYS4.map((k) => `<span class="chip"><i class="zdot z${k}"></i><span class="zlab">${zl(k)}</span></span>`).join('')}</div>`;

// ---- lower band ----
function low(left, mid, right) { return `<div class="low"><div>${left}</div>${mid}<div class="rt">${right}</div></div>`; }
const lowIdle = (extra) => low(`<div class="lk">${th('เกมรอบนี้', 'game card label', 'g302')}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow">${EV.field1.length}<small>${PEOPLE()}</small></div>`,
  `<div class="lk">${extra ?? th('พิธีกรกดเริ่ม แล้วยืนในโซนสีของตัวเอง', 'zones idle: MC prompt')}</div>`);
const lowLive = (n, label, line) => low(`<div class="lk">${label}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow"><span class="to">${n}</span><small>${PEOPLE()}</small></div>`,
  `<div class="lk">${line}</div>`);
const lowEnd = () => low(`<div class="lk">${th('ผ่านรอบที่ 1', 'reveal: passed heading', 'g302')}</div><div class="gname">${GNAME()}</div>`,
  `<div class="flow"><span class="to">${EV.pass1.size}</span><small>${PEOPLE()}</small></div>`,
  `<div class="legend"><div><span class="chip in">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div><span class="chip out">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`);

// ---- frames (inner HTML; the section builder wraps each in frame()) ----
function idle(layout) {
  if (layout === 'C') return `${top(1)}${taggedField(0)}<div class="low"><div><div class="lk">${th('เกมรอบนี้', 'game card label', 'g302')}</div><div class="gname">${GNAME()}</div></div><div class="flow">${EV.field1.length}<small>${PEOPLE()}</small></div><div class="rt">${zlegend()}</div></div>`;
  const Z = layout === 'A' ? 4 : 6;
  const zones = assignRandom(Z, layout === 'A' ? 315 : 316);
  const panels = zones.map((names, k) => panel(ZKEYS6[k], names, { layout })).join('');
  return `${top(1)}<div class="zfield ${layout === 'A' ? 'zblocks' : 'zcols'}">${panels}</div>${lowIdle(layout === 'B' ? th('หกโซนสี ยืนในโซนของตัวเอง', 'zones idle B: six zones') : undefined)}`;
}
// Z2-B per-name reveal, mid-wave: the first `done` zone groups have resolved.
function revealB(layout, done) {
  if (layout === 'C') {
    const n = EV.field1.filter((n) => EV.pass1.has(n) || zoneOfC.get(n) >= done).length;
    return `${top(1)}${taggedField(done)}${lowLive(n, th(`โซนที่ ${done} จาก 4`, 'zones reveal: zone counter'), th('ชื่อที่ไม่ผ่าน นั่งลง', 'zones reveal B: the out sit'))}`;
  }
  const Z = layout === 'A' ? 4 : 6;
  const zones = assignRandom(Z, layout === 'A' ? 315 : 316);
  const panels = zones.map((names, k) => panel(ZKEYS6[k], names, { resolved: k < done, layout })).join('');
  const n = EV.field1.filter((n) => { const k = zones.findIndex((z) => z.includes(n)); return EV.pass1.has(n) || k >= done; }).length;
  return `${top(1)}<div class="zfield ${layout === 'A' ? 'zblocks' : 'zcols'}">${panels}</div>${lowLive(n, th(`โซนที่ ${done} จาก ${Z}`, 'zones reveal: zone counter'), th('ชื่อที่ไม่ผ่าน นั่งลง', 'zones reveal B: the out sit'))}`;
}
function result(layout) {
  if (layout === 'C') return `${top(1)}${taggedField('all')}${lowEnd()}`;
  const Z = layout === 'A' ? 4 : 6;
  const zones = assignRandom(Z, layout === 'A' ? 315 : 316);
  const panels = zones.map((names, k) => panel(ZKEYS6[k], names, { resolved: true, layout })).join('');
  return `${top(1)}<div class="zfield ${layout === 'A' ? 'zblocks' : 'zcols'}">${panels}</div>${lowEnd()}`;
}
// Z2-A idle: the zone sizes are already drawn to the cut (48/48/50/50 here), everyone still standing.
function wholeIdle() {
  const Z = 4; const zones = assignWhole(Z); const k = sitCount(Z);
  const panels = zones.map((names, z) => panel(ZKEYS4[z], names, { whole: true, sits: z < k, layout: 'A' })).join('');
  return `${top(1)}<div class="zfield zblocks">${panels}</div>${lowIdle()}`;
}
// Z2-A whole zones on layout A: after the first zone sat (reveal), and at the end.
function whole(end) {
  const Z = 4; const zones = assignWhole(Z); const k = sitCount(Z);
  const panels = zones.map((names, z) => panel(ZKEYS4[z], names, { resolved: end ? true : z < 1, whole: true, sits: z < k, layout: 'A' })).join('');
  const band = end ? lowEnd() : lowLive(EV.field1.length - zones[0].length, th(`โซนที่ 1 จาก ${k} นั่งลง`, 'zones reveal A: whole-zone counter'), th('โซนที่นั่งลง คือโซนที่ไม่ผ่าน', 'zones reveal A: the out zones sit'));
  return `${top(1)}<div class="zfield zblocks">${panels}</div>${band}`;
}

const OPT1 = { A: 'FOUR BLOCKS', B: 'SIX COLUMNS', C: 'TAGGED FIELD' };
const OPT2 = { A: 'WHOLE ZONES SIT', B: 'NAMES SIT IN THEIR ZONES' };
export const EXPECT_ZONES = {
  A: ['zn-idle', 'zn-reveal', 'zn-wholeidle', 'zn-whole', 'zn-wholeend', 'zn-wholerm', 'zn-result', 'zn-rm'],
  B: ['zn-idle', 'zn-reveal', 'zn-result', 'zn-rm'],
  C: ['zn-idle', 'zn-reveal', 'zn-result', 'zn-rm'],
  F: ['zn-fallback'],
};

export function buildZones() {
  resetCopy();
  const sec = (title, why, frames) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${frames.map(([t, f]) => `<div class="cand">${t}${scaled(f)}</div>`).join('')}</div>
  </div>`;
  const rows = [];
  const f3 = (kind, fn) => ['A', 'B', 'C'].map((o) => [tag(o, OPT1[o], ` · zn-${kind} · authored 1920x1080, shown at 75%`), frame(`zn-${kind}`, o, '', fn(o))]);
  rows.push(sec('Z1 · IDLE · the room stands in its colour zone', `The event's ${EV.field1.length} joined names (gh#302 fixture: ${EV.invited} invited, ${EV.field1.length} joined, round 1 ${EV.field1.length} to ${EV.pass1.size}), three of them the NAME FIT worst cases. Zones are theatre (decision 7): the verdict is the draw the event already made. <b>A FOUR BLOCKS</b>: 2x2 panels, four zones of ${assignRandom(4, 315).map((z) => z.length).join('/')}, names 20px shrinking to an 18px floor. <b>B SIX COLUMNS</b>: six colour columns of ${assignRandom(6, 316).map((z) => z.length).join('/')}, names 18px. <b>C TAGGED FIELD</b>: the gh#303 picked field unchanged (8 columns, 27px rows), a zone dot in each chip, names shrink to a 16px floor (the dot costs name width). 3D intent: panels are rounded planes in the night space, names one canvas-texture atlas on an InstancedMesh; the camera is fixed, a 2 degree drift at most.`, f3('idle', idle)));
  rows.push(sec('Z1 x Z2-B · REVEAL · names sit inside their zones, zone by zone', `Z2-B drawn on every layout, mid-wave: the first zone groups have resolved, the rest still stand. Passed names turn gold with ink text and the glow (the gh#302 pick); the out go dim and struck through (never colour alone), and each resolved zone's badge counts who sat. <b>A</b> after zone 1 of 4, <b>B</b> after zone 2 of 6, <b>C</b> after zone group 1 of 4. 3D intent: a seated name's chip lowers 6px and tilts 8 degrees as it dims; the panel itself never moves, so the room keeps its spatial map.`, f3('reveal', (o) => revealB(o, o === 'B' ? 2 : 1))));
  rows.push(sec('Z2-A · WHOLE ZONES SIT · the cut drawn into zone sizes', `<b>The tradeoff, disclosed:</b> zone sizes are drawn to the cut (here ${assignWhole(4).map((z) => z.length).join('/')}: the first ${sitCount(4)} zones hold exactly the ${EV.field1.length - EV.pass1.size} who are out), so whole zones sit together and the room watches a zone fall as one. A player's zone therefore leaks their fate at assignment, before the reveal — the gh#300 R2 precedent (a card fate readable at the deal, accepted by the owner). Odds are unchanged: the draw is already fixed; only the grouping is theatre. Drawn on layout A: idle (the sized zones, everyone standing), after the first zone sat, the end state, and reduced motion (the end still, one 200ms fade per zone). Z2-B keeps the suspense: zones are random, the verdict lands per name.`, [
    [tag('A', OPT2.A, ' · zn-wholeidle · the sized zones at idle'), frame('zn-wholeidle', 'A', '', wholeIdle())],
    [tag('A', OPT2.A, ' · zn-whole · after zone 1 sat'), frame('zn-whole', 'A', '', whole(false))],
    [tag('A', OPT2.A, ' · zn-wholeend · the end state'), frame('zn-wholeend', 'A', '', whole(true))],
    [tag('A', OPT2.A, ' · zn-wholerm · reduced motion, the end still'), frame('zn-wholerm', 'A', '', whole(true))],
  ]));
  rows.push(sec('Z1 · ROUND RESULT · who stands, who sat', `The end state on each layout: ${EV.pass1.size} passed, gold and bold with the glow; ${EV.field1.length - EV.pass1.size} dim and struck through. Zone badges count the seated. The lower band is the gh#302 picked result band.`, f3('result', result)));
  rows.push(sec('Z1 · REDUCED MOTION · the 2D path (also what below 640px shows)', 'Reduce, not remove (ADR-0046, ADR-0051). No lower-and-tilt, no wave: each zone resolves in one 200ms fade (gh#302 --motion-rm-fade), badges and counts jump to their end values. Drawn at the end state, identical to the result still. Below 640px the shared reveal host serves this same 2D path; the plain field of the fallback frame is what a phone renders.', f3('rm', result)));
  rows.push(sec('NEVER-BLANK FALLBACK (ADR-0051)', 'No WebGL context, a lost context that does not restore, or a renderer error: the page shows the plain 2D reveal the owner picked on gh#302 (B, proj-reveal) and the round still finishes. Identical for every option.', [[`<div class="tag"><span class="d">FALLBACK</span> · zn-fallback · gh#302 proj-reveal B, picked<span class="pc">COPY PROPOSED</span></div>`, frame('zn-fallback', 'F', '', plainReveal(GNAME()))]]));

  const beatsB = [
    ['idle', 'until the MC presses start', 'panels hold still; a 1px breathing glow on each zone rim, 3s phase (one emissive value per zone, no flicker)', 'still panels, no glow pulse'],
    ['zone wave 1..Z', 'Z x 1100ms: verdict 400ms ease-out, settle 700ms', 'each resolved zone: out chips lower 6px and tilt 8 degrees as they dim, 0.02s stagger per name; in chips light gold with the glow; the badge count rolls', 'the whole zone resolves in one 200ms fade; counts jump'],
    ['count', '800ms', `the band counter rolls ${EV.field1.length} to ${EV.pass1.size} linear (constant-rate progress)`, `counter jumps to ${EV.pass1.size}`],
    ['settle', '3000ms', 'seated chips hold their lowered pose; passed chips keep glowing', 'none'],
  ];
  const beatsA = [
    ['idle', 'until start', 'as Z2-B; zone sizes already drawn to the cut', 'as Z2-B'],
    ['zone sits 1..k', `k x 1400ms (k = ${sitCount(4)} at round 1)`, 'the whole zone lowers 10px as one plane, its chips dim and strike together, the seated figure fades in on its badge; the room sits with it', 'the zone dims in one 200ms fade, badge swaps'],
    ['remaining zones light', '800ms', 'the standing zones light gold together', 'one 200ms fade'],
    ['count + settle', '800ms + 3000ms', 'as Z2-B', 'counter jumps'],
  ];
  rows.push(`
  <div class="brow">
    <h2>MOTION · beat by beat, with the time chosen for each beat</h2>
    <p class="why">Timings are this board's proposal; the ui-ux-pro-max motion rules shaped them (RULES CHECKED). No query returned a stand-up or sit-down timing, so the beat lengths themselves are not from the skill. Totals: Z2-B about ${(4 * 1.1 + 0.8 + 3).toFixed(1)}s at round 1 (4 zones), Z2-A about ${(sitCount(4) * 1.4 + 0.8 + 0.8 + 3).toFixed(1)}s. The room's own standing and sitting is the beat the MC conducts; nothing here rushes it.</p>
    <h3>Z2-B NAMES SIT (every layout)</h3>${beatTable(beatsB)}<h3>Z2-A WHOLE ZONES SIT</h3>${beatTable(beatsA)}
  </div>`);
  rows.push(rulesRow('--domain ux "animation reveal duration easing stagger", "readability large display distance contrast font size", "reduced motion vestibular sensitivity", "color only indicator meaning accessibility", "flashing seizure blink" (returned nothing); --stack threejs "instanced mesh many objects performance", "webgl context lost fallback".', [
    '<b>Excessive Motion</b> (1 to 2 key elements per view): the wave animates one zone at a time; the chrome never moves. Checked on every layout.',
    '<b>Reduced Motion / Motion Sensitivity</b> (respect prefers-reduced-motion, present the final readable state): the RM frames are those end states; the round still finishes (ADR-0051: reduce, not remove).',
    '<b>Easing Functions</b>: ease-out on the verdict landing; linear on the count (constant-rate progress). The skill bars linear for UI transitions; the count is a progress readout, the same carve-out gh#303 used.',
    '<b>Duration Timing</b> (150-300ms micro, never one duration for everything): chip verdicts 400ms, zone settle 700ms, fades 200ms, the count 800ms; the room\'s beat is the MC\'s, not a timer\'s.',
    '<b>Continuous Animation</b> (loading only, never decorative): the idle rim breath is the one ambient loop, 1px, and it stops under reduced motion; nothing else loops.',
    '<b>Color Only</b>: the out go dim AND struck through AND the badge says the seated count in words; zone identity is a dot plus a written zone name, never colour alone.',
    '<b>Color Contrast</b> (4.5:1 normal text): every text pair below clears it, computed 2026-11-16. Zone-coloured header text was rejected on the measurement: punch on its own tint 4.19, sky 3.60; headers are white (10.7:1 or better) with a zone dot.',
    '<b>Readable Font Size</b> (16px minimum body on mobile): the phone path is the plain 2D field (fallback frame), whose names carry a 14px floor as the gh#302 pick set it; the projector floors are 16-18px by layout.',
    '<b>threejs</b>: InstancedMesh for the name chips (196 at round 1, 50+ repeated objects); one canvas-texture atlas for names; Single Renderer Per Page; Pixel Ratio Cap at 2; dispose geometry, material and the atlas when the round scene goes; canvas role="img" with an aria-label, the round announced in a live region outside the canvas (ADR-0051).',
    '<b>Not from the skill</b>: flashing. Its flash query returned nothing; WCAG 2.3.1 (no more than three flashes in any one second) is applied from outside it: zone waves are 1100ms apart and nothing flashes the whole frame.',
  ]));
  const zoneValues = ZONE_COLORS.map(([k, v, src]) => [v, `zone ${k}: rim, dot${k === 'soft' || k === 'cream' ? ' (layout B only)' : ''}`, src]);
  rows.push(`
  <div class="brow">
    <h2>VALUES · every frame value, token, gh#302/gh#303 pick, or PROPOSAL</h2>
    <p class="why"><b>Departures from the gh#302 picked values (B), each a PROPOSAL for the game frames only; the fallback frame carries the gh#302 picked values unchanged:</b> the lower band is 170px tall (from gh#303's 190px) to give the zones the room; the field runs 100..870 (770px). Layout A panels: 24px radius (the gh#302 winner-card radius), a 3px zone rim, ground the zone colour at 14% pre-composited over the night midpoint #1c1b3c, names in 4 columns of 22px rows (20px, 18px floor). Layout B: six columns, names 18px in 21px rows. Layout C: the gh#303 picked field (8 columns, 27px rows) with a 14px zone dot, names to a 16px floor. Gold is reserved for the passed state (the gh#302 pick), so no zone colour is gold. <b>Fonts:</b> Mitr 600 (labels, badges) and Sarabun 700 (names), the self-hosted files. <b>New on this board, PROPOSAL:</b> the seated figure (a drawn head-and-legs mark), the zone badge wording, the panel tint and rim combination. No new colour: every value below is in the canvas.</p>
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ...zoneValues, ...ZKEYS6.map((k) => [tint(k), `zone ${k} panel ground (14% over #1c1b3c, pre-composited)`, 'PROPOSAL: ' + ZC[k] + ' from the canvas, faded() as gh#303'])])}</div><div class="cand">${contrastTable([...STAGE_PAIRS, ['#ffffff', tint('punch'), 'zone header on the punch tint'], ['#ffffff', tint('sky'), 'zone header on the sky tint'], ['#ffffff', tint('lilac'), 'zone header on the lilac tint'], ['#ffffff', tint('white'), 'zone header on the white tint'], ['#ffffff', tint('soft'), 'zone header on the soft tint (B)'], ['#ffffff', tint('cream'), 'zone header on the cream tint (B)']])}</div></div>
  </div>`);
  rows.push(nameFitRow([
    ['A blocks (49 names a zone)', 'Sarabun 700', '20px', '18px', '1 of 4 columns in an 894px panel, 6px chip side padding', 'W x12 and U+0E12 x12: 18px, one line; U+0E12 U+0E33 x12: 18px, two lines (its row grows)'],
    ['B columns (33 or 32 names)', 'Sarabun 700', '18px', '18px', 'the column less 24px panel and 12px chip padding', 'W x12 and U+0E12 x12: 18px, one line; U+0E12 U+0E33 x12: 18px, two lines (placed in a 32-name column, whose spare height takes the grown row)'],
    ['C tagged field (196 names)', 'Sarabun 700', '20px', '16px', '1 of 8 columns less the 14px dot and 6px gap', 'W x12 and U+0E12 x12: 16px, one line; U+0E12 U+0E33 x12: 16px, two lines'],
    ['fallback field (gh#302 picked)', 'Sarabun 700 / 400', '20px', '14px', '1 of 10 columns, 8px side padding', 'W x12 and U+0E12 x12: 14px, one line; U+0E12 U+0E33 x12: 14px, two lines (as on the gh#302 board)'],
  ]));
  rows.push(rolesRow('Gh315Zones'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decision 3 (the room plays standing), 7 (equal odds: the zone grouping is theatre drawn around the fixed cut, never a choice that changes odds), 11 (3D on the main screen, never-blank fallback), 12 (the phase-2 library). <b>On gh#302 (picked 2026-11-11):</b> direction B for the projector, its copy, the 12-grapheme-cluster name limit and its NAME FIT rule. <b>On gh#303 (picked 2026-11-11):</b> the 8-column 27px-row field layout C tags, the gold passed / dim struck out states, the 190px band this board proposes at 170px.',
    '<b>Z2-A disclosure:</b> whole zones sit only if zone sizes are drawn to the cut, which makes a player\'s fate readable at assignment. The owner accepts or rejects that tradeoff here; gh#300 R2 accepted the same shape for cards. Z2-B never leaks: zones are random theatre.',
    '<b>Not drawn:</b> the round-code frame (gh#302\'s, shown before the reveal in QR mode); rounds 2 to 4 (same frames, fewer names: a smaller field gets larger chips, never smaller than these floors); the phone verdict screen (gh#309\'s, from the round code alone); the 3D camera move itself (frames are 2D stills of the 3D intent).',
    '<b>Not covered:</b> a real projector, a real room, frame rate on the venue laptop; whether a room actually stands and sits on the MC\'s beat (a rehearsal question, gh#310\'s manner).',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS FOR THE OWNER (open; the pick is recorded on gh#315 before any code, ADR-0033):</b><ul>
  <li><b>Z1. Zone layout</b>: A FOUR BLOCKS (2x2 panels, four zones, names to an 18px floor; zn-idle A) · B SIX COLUMNS (six colour columns, smaller groups, names 18px; zn-idle B) · C TAGGED FIELD (the picked field unchanged, zones as dots, names to a 16px floor; zn-idle C). The layouts can be mixed with either Z2 option: say so.</li>
  <li><b>Z2. How the cut lands</b>: A WHOLE ZONES SIT (zone sizes drawn to the cut, whole zones sit as one, fate readable at assignment — disclosed; zn-whole, zn-wholeend) · B NAMES SIT IN THEIR ZONES (random zones, the verdict per name, suspense kept; zn-reveal, zn-result on every layout).</li>
  <li><b>Z3. Proposed copy</b>: approve, or mark strings to change (COPY SOURCES row).</li>
</ul></div>`;
  return boardDoc('gh#315 · prize draw · colour zones stand-up', 'gh#315: proposal board, ADR-0033.', [ORDER_LINE, 'Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11) and the gh#303 picks. Each open decision is drawn in options A/B/C; idle, reveal, round result, reduced motion (the 2D path, also what below 640px shows) and the never-blank fallback are drawn for each. Frames are 2D stills of a 3D scene (three, ADR-0060); the 3D intent is written under each frame.', OWNER], STAGE_CSS + CSS, rows, { status: 'AWAITING OWNER (gh#315)', pick: '' });
}
