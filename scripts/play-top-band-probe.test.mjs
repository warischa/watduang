// The top-band probe's verdict, judged on synthetic measurements -- no browser. Covers the one carve-out
// the probe owns (the MC control on the prize-draw projector may sit in the band, owner ruling 2026-11-13,
// gh#314 1a B) and the must-reds around it: the same box on any other route, the box over the close X
// or the edit control, the box leaving the viewport, and any other prize-draw content in the band.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as probe from './play-top-band-probe.mjs';
import { BAND_PX, BAND_GROUND, MC_ROUTE, judge } from './play-top-band-probe.mjs';
import { screenlessPlayPaths } from './play-screen-fit-probe.mjs';

const OTHER = 'timebomb';
// A prize reveal demo page: its bar may stand in the band (owner ruling 2026-11-14). No round-start control,
// so its walk is S1, D1, S2.
const DEMO = 'prize-cards';
const ROUTES = [MC_ROUTE, OTHER, DEMO];

// Real chrome geometry at 320 wide: the close X at the band's left end, the edit pill beside it.
const EXIT = { present: true, forced: false, l: 8, t: 6, r: 52, b: 50, visible: true, visibility: 'visible', opacity: 1, disabled: false };
const EDIT = { present: true, forced: false, l: 60, t: 6, r: 150, b: 50, visible: true, visibility: 'visible', opacity: 1, disabled: false };
// The MC control as play.css places it: fixed, 2px from the top, 24px from the right end.
const mcAt = (cw) => ({ present: true, shown: true, l: cw - 24 - 120, t: 2, r: cw - 24, b: 54, parts: 2, pseudo: 0, shape: [] });
/** Every .pd-mc element the page holds is one entry of `mcs`. */
const setMcs = (r, mcs) => {
  r.mcs = mcs;
};
const setMc = (r, patch) => setMcs(r, [{ ...r.mcs[0], ...patch }, ...r.mcs.slice(1)]);
const mcHit = (cw) => ({ sel: 'div.pd-mc > button.pd-go', l: cw - 144, t: 2, r: cw - 24, b: 54, overlapPx: 52, pos: 'static', mc: true });

const desktop = (state) => state.startsWith('D');
function row(route, state) {
  const cw = desktop(state) ? 1280 : 320;
  const screenless = screenlessPlayPaths().has(`/game/${route}/play/`);
  const notes = [];
  if (state === 'S2' && !screenless) notes.push('[data-ps=start]:clicked');
  if (state === 'S3') notes.push('#start:clicked');
  return {
    route, state, vp: desktop(state) ? '1280x800' : '320x568', notes,
    sig: state === 'S3' ? 2 : 1,
    renderHold: 'free', handover: '1', vw: cw, vh: desktop(state) ? 800 : 568, clientWidth: cw, bodyPaddingTop: `${BAND_PX}px`,
    sharedScreenOpen: screenless ? null : 'closed',
    band: { present: true, l: 0, t: 0, r: cw, b: BAND_PX, ground: BAND_GROUND, position: 'fixed', visibility: 'visible', opacity: 1 },
    exit: { ...EXIT }, edit: { ...EDIT }, checked: 40, skippedTiny: 1,
    hitCount: 0, mcHitCount: 0, hits: [], anchoredAbove: [], mcs: [],
  };
}

// A clean run on both routes, with the MC control in the band on every prize-draw screen. The MC route
// also carries D2, its seeded screen at the desktop width (on a fresh device D1 shows no event).
function cleanRun() {
  const rows = [];
  for (const id of ROUTES) for (const s of id === MC_ROUTE ? ['S1', 'D1', 'S2', 'S3', 'D2'] : id === DEMO ? ['S1', 'D1', 'S2'] : ['S1', 'D1', 'S2', 'S3']) {
    const r = row(id, s);
    if (id === DEMO) placeDemoBar(r, desktop(s) ? 'band' : 'below');
    if (id === MC_ROUTE) {
      setMcs(r, [mcAt(r.clientWidth)]);
      r.hits = [mcHit(r.clientWidth)];
      r.hitCount = 1;
      r.mcHitCount = 1;
      r.anchoredAbove = [{ sel: 'div.pd-mc', position: 'fixed', top: '2px', effectiveTop: 2, display: 'block', mc: true }];
    }
    rows.push(r);
  }
  return { routes: ROUTES, breakBand: false, rows };
}

/** The demo bar as demo.css places it. 'band' (640px and up, when it fits): fixed, 2px under the band's top,
 *  24px in from the right, one row, its declared anchor above the band. 'below': static under the frame. */
const barAt = (cw) => ({ present: true, shown: true, l: cw - 24 - 306, t: 2, r: cw - 24, b: 54, parts: 6, pseudo: 0, shape: [], mode: 'band', oneRow: true, rowTop: 15.5, rowBottom: 40.5 });
const BAR_ANCHOR = { sel: 'div#app > div.pr-viewport > div.pr-bar', position: 'fixed', top: '2px', effectiveTop: 2, display: 'flex', mc: false, bar: 0 };
function placeDemoBar(r, mode) {
  if (mode === 'band') {
    r.bars = [barAt(r.clientWidth)];
    r.anchoredAbove = [{ ...BAR_ANCHOR }];
  } else {
    r.bars = [{ present: true, shown: true, l: 0, t: 400, r: r.clientWidth, b: 560, parts: 6, pseudo: 0, shape: [], mode: 'below', oneRow: false, rowTop: 500, rowBottom: 450 }];
  }
}
const setBar = (r, patch) => { r.bars = [{ ...r.bars[0], ...patch }, ...r.bars.slice(1)]; };

const rowsOf = (out, id, state) => out.rows.filter((r) => r.route === id && (!state || r.state === state));

test('positive control: the MC control in the band on the prize-draw route is green', () => {
  assert.deepEqual(judge(cleanRun()), []);
});

test('must-red: the MC control in the band on any other route', () => {
  const out = cleanRun();
  const r = rowsOf(out, OTHER, 'S2')[0];
  setMcs(r, [mcAt(320)]);
  r.hits = [mcHit(320)];
  r.hitCount = 1;
  r.mcHitCount = 1;
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${OTHER} S2`) && /route-content box\(es\) intersect the band.*pd-mc/.test(m)), f.join('\n'));
});

test('must-red: an anchored MC box on any other route', () => {
  const out = cleanRun();
  rowsOf(out, OTHER, 'S1')[0].anchoredAbove = [{ sel: 'div.pd-mc', position: 'fixed', top: '2px', effectiveTop: 2, display: 'block', mc: true }];
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${OTHER} S1`) && /anchored above the band: div\.pd-mc/.test(m)), f.join('\n'));
});

test('must-red: the MC box over the close X', () => {
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'S3')[0];
  setMc(r, { l: 30, r: 160 });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S3`) && /MC control .* overlaps the close X/.test(m)), f.join('\n'));
});

test('must-red: the MC box over the edit control, forced read included', () => {
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'S1')[0];
  r.edit = { ...r.edit, forced: true };
  setMc(r, { l: 140, r: 260 });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S1`) && /MC control .* overlaps the edit control/.test(m)), f.join('\n'));
});

test('must-red: a hit area (pseudo-element) reaching the close X counts as the box', () => {
  // The in-page read unions ::before/::after boxes into mc; a widened union is what the verdict sees.
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'D1')[0];
  setMc(r, { l: 40, pseudo: 1 });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} D1`) && /overlaps the close X/.test(m)), f.join('\n'));
});

test('must-red: the MC box leaving the viewport', () => {
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'S2')[0];
  setMc(r, { r: 330 });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S2`) && /MC control .* is not inside the viewport/.test(m)), f.join('\n'));
});

test('must-red: any other prize-draw element in the band', () => {
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'S2')[0];
  r.hits = [{ sel: 'div.pd-frame', l: 0, t: 40, r: 320, b: 300, overlapPx: 16, pos: 'absolute', mc: false }, ...r.hits];
  r.hitCount = 2;
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S2`) && /1 route-content box\(es\) intersect the band, worst div\.pd-frame/.test(m)), f.join('\n'));
});

test('must-red: any other prize-draw fixed box anchored above the band', () => {
  const out = cleanRun();
  rowsOf(out, MC_ROUTE, 'S1')[0].anchoredAbove.push({ sel: 'div.pd-picks', position: 'fixed', top: '0px', effectiveTop: 0, display: 'block', mc: false });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S1`) && /1 fixed\/sticky route box\(es\) anchored above the band: div\.pd-picks/.test(m)), f.join('\n'));
});

const hide = (r) => { setMcs(r, [{ present: true, shown: false, parts: 1, pseudo: 0, shape: [] }]); r.hits = []; r.hitCount = 0; r.mcHitCount = 0; };
const neverRan = (f, vp) => f.some((m) => m.startsWith(`${MC_ROUTE} ${vp}`) && /the carve-out check never ran/.test(m));

test('green: the MC control hidden on one screen (a reveal presenting after the press)', () => {
  const out = cleanRun();
  hide(rowsOf(out, MC_ROUTE, 'S3')[0]);
  assert.deepEqual(judge(out), []);
});

test('green: hidden on every screen but one per width (fresh device: S1/D1 show no event)', () => {
  const out = cleanRun();
  for (const s of ['S1', 'D1', 'S3']) hide(rowsOf(out, MC_ROUTE, s)[0]);
  assert.deepEqual(judge(out), []);
});

test('must-red: the MC control hidden on every walked screen', () => {
  const out = cleanRun();
  for (const r of rowsOf(out, MC_ROUTE)) hide(r);
  const f = judge(out);
  assert.ok(neverRan(f, '320x568') && neverRan(f, '1280x800'), f.join('\n'));
});

test('must-red: the MC control hidden on every screen of one width', () => {
  const out = cleanRun();
  for (const s of ['D1', 'D2']) hide(rowsOf(out, MC_ROUTE, s)[0]);
  const f = judge(out);
  assert.ok(neverRan(f, '1280x800') && !neverRan(f, '320x568'), f.join('\n'));
});

test('must-red: the MC route walked without its seeded desktop screen', () => {
  const out = cleanRun();
  out.rows = out.rows.filter((r) => !(r.route === MC_ROUTE && r.state === 'D2'));
  const f = judge(out);
  assert.ok(f.some((m) => /row\(s\), expected/.test(m)), f.join('\n'));
});

test('no carve-out requirement on another route: it never shows the MC control and stays green', () => {
  const out = cleanRun();
  assert.ok(rowsOf(out, OTHER).every((r) => !r.mcs.length));
  assert.ok(!judge(out).some((m) => m.startsWith(OTHER)));
});

// ---- every .pd-mc is measured, and exactly one may show (REFUTE round 1, item 1) ----

test('must-red: a second .pd-mc exactly covering the close X', () => {
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'S2')[0];
  setMcs(r, [...r.mcs, { present: true, shown: true, l: 8, t: 6, r: 52, b: 50, parts: 2, pseudo: 0, shape: [] }]);
  r.hits = [...r.hits, { ...mcHit(320), l: 8, r: 52 }];
  r.hitCount = 2;
  r.mcHitCount = 2;
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S2`) && /2 MC controls \(\.pd-mc\) shown/.test(m)), f.join('\n'));
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S2`) && /MC control .* overlaps the close X/.test(m)), f.join('\n'));
});

test('green: a second .pd-mc in the page that shows nothing (an emptied bar)', () => {
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'S2')[0];
  setMcs(r, [...r.mcs, { present: true, shown: false, parts: 1, pseudo: 0, shape: [] }]);
  assert.deepEqual(judge(out), []);
});

// ---- the carve-out admits only geometry the box read is exact for (REFUTE round 1, item 2) ----

const still = { transform: 'none', translate: 'none', rotate: 'none', scale: 'none', zoom: '1' };
const noPseudo = { content: 'none', display: 'inline', position: 'static' };
/** The real control as play.css draws it: a fixed bar, one button, no pseudo-element, nothing transformed. */
const realParts = () => [
  { sel: 'div.pd-mc', style: { ...still, position: 'fixed' }, pseudos: [['::before', noPseudo], ['::after', noPseudo]] },
  { sel: 'div.pd-mc > button.pd-go', style: { ...still, position: 'static' }, pseudos: [['::before', noPseudo], ['::after', noPseudo]] },
];
const hitArea = (extra) => ({ content: '""', display: 'block', position: 'absolute', width: '44px', height: '44px', top: '0px', right: 'auto', bottom: 'auto', left: '0px', ...still, ...extra });
const faultsOf = (parts) => {
  assert.equal(typeof probe.carveOutShapeFaults, 'function', 'the probe exports its shape classifier');
  return probe.carveOutShapeFaults(parts);
};

test('shape: the real .pd-mc (no transform, no pseudo-element) is admitted', () => {
  assert.deepEqual(faultsOf(realParts()), []);
});

test('shape: an inset-positioned pseudo hit area with nothing transformed is admitted', () => {
  const parts = realParts();
  parts[1].pseudos[0] = ['::before', hitArea({ left: '-8px', top: '-4px' })];
  assert.deepEqual(faultsOf(parts), []);
});

for (const [what, extra] of [
  ['a transformed ::before', { transform: 'matrix(1, 0, 0, 1, -900, 0)' }],
  ['a ::before moved by the translate property', { translate: '-900px' }],
  ['a ::before turned by rotate', { rotate: '45deg' }],
  ['a ::before grown by scale', { scale: '4' }],
  ['a ::before in static flow', { position: 'static' }],
  ['a relatively positioned ::before', { position: 'relative' }],
  ['a fixed ::before', { position: 'fixed' }],
  ['an absolute ::before with no resolved inset', { left: 'auto', right: 'auto' }],
]) {
  test(`shape must-red: ${what}`, () => {
    const parts = realParts();
    parts[1].pseudos[1] = ['::after', hitArea(extra)];
    assert.ok(faultsOf(parts).some((m) => m.startsWith('div.pd-mc > button.pd-go::after')), JSON.stringify(faultsOf(parts)));
  });
}

for (const [what, patch] of [['transform', { transform: 'matrix(2, 0, 0, 2, 0, 0)' }], ['translate', { translate: '10px 0px' }], ['zoom', { zoom: '2' }]]) {
  test(`shape must-red: the button itself carries ${what}`, () => {
    const parts = realParts();
    parts[1].style = { ...parts[1].style, ...patch };
    assert.ok(faultsOf(parts).some((m) => m.startsWith('div.pd-mc > button.pd-go ')), JSON.stringify(faultsOf(parts)));
  });
}

const TRANSFORMED = 'div.pd-mc > button.pd-go::before transform: matrix(1, 0, 0, 1, -1000, 0)';
test('must-red: a transformed pseudo over the close X (its box read without the transform looks clear)', () => {
  const out = cleanRun();
  // What the read reports: the untransformed pseudo box, inside the real control, far from the X.
  setMc(rowsOf(out, MC_ROUTE, 'S1')[0], { pseudo: 1, shape: [TRANSFORMED] });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S1`) && /the carve-out geometry is outside the shape this probe can measure/.test(m)), f.join('\n'));
});

test('must-red: a transformed pseudo NOT over the close X is still outside the shape', () => {
  const out = cleanRun();
  setMc(rowsOf(out, MC_ROUTE, 'D1')[0], { pseudo: 1, shape: ['div.pd-mc > button.pd-go::after transform: matrix(1, 0, 0, 1, -4, 0)'] });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} D1`) && /outside the shape this probe can measure/.test(m)), f.join('\n'));
});

// ---- the containing chain: a transformed ancestor moves every box under it (REFUTE round 2) ----

/** The real tree above the control (stage.ts mounts it in markup.html #app): nothing transformed. */
const realChain = () => [
  { sel: 'div.pd-viewport', style: { ...still } },
  { sel: 'div#app', style: { ...still } },
  { sel: 'body', style: { ...still } },
  { sel: 'html', style: { ...still } },
];
const chainFaults = (parts, chain) => {
  assert.equal(typeof probe.carveOutShapeFaults, 'function', 'the probe exports its shape classifier');
  return probe.carveOutShapeFaults(parts, chain);
};

test('chain: the real tree, the control under an untransformed viewport, app, body and html, is admitted', () => {
  assert.deepEqual(chainFaults(realParts(), realChain()), []);
});

test('must-red: the reviewer fixture, an ancestor at scale(2) under an inset pseudo (read at 160, drawn 120..160 over the edit control)', () => {
  const parts = realParts();
  parts[1].pseudos[0] = ['::before', hitArea({ left: '-40px', width: '20px' })];
  const chain = realChain();
  chain[0] = { sel: 'div.pd-viewport', style: { ...still, transform: 'matrix(2, 0, 0, 2, 0, 0)' } };
  const shape = chainFaults(parts, chain);
  assert.ok(shape.some((m) => m.startsWith('div.pd-viewport')), JSON.stringify(shape));
  // The row the in-page read reports: the box without the ancestor's scale, clear of the edit control.
  const out = cleanRun();
  const r = rowsOf(out, MC_ROUTE, 'S1')[0];
  setMc(r, { l: 160, pseudo: 1, shape });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} S1`) && /outside the shape this probe can measure.*div\.pd-viewport/.test(m)), f.join('\n'));
});

for (const [what, at, patch] of [
  ['an ancestor transform with no pseudo-element', 0, { transform: 'matrix(1, 0, 0, 1, -900, 0)' }],
  ['the app root moved by translate', 1, { translate: '-900px' }],
  ['body turned by rotate', 2, { rotate: '180deg' }],
  ['html grown by scale', 3, { scale: '2' }],
  ['html zoomed', 3, { zoom: '1.5' }],
]) {
  test(`must-red: ${what}`, () => {
    const chain = realChain();
    chain[at] = { ...chain[at], style: { ...chain[at].style, ...patch } };
    const shape = chainFaults(realParts(), chain);
    assert.ok(shape.some((m) => m.startsWith(chain[at].sel) && /ancestor/.test(m)), JSON.stringify(shape));
  });
}

// ---- the demo bar carve-out (owner ruling 2026-11-14: "carve-out for .pr-bar like .pd-mc") ----

const barTag = (state) => `${DEMO} ${state} ${state.startsWith('D') ? '1280x800' : '320x568'}`;
const redOn = (f, state, re) => f.some((m) => m.startsWith(barTag(state)) && re.test(m));

test('the demo routes the bar carve-out names are manifest play routes, and the prize-draw projector is not one', () => {
  assert.ok(Array.isArray(probe.DEMO_ROUTES) && probe.DEMO_ROUTES.length === 3, 'the probe exports its demo route set');
  for (const id of probe.DEMO_ROUTES) assert.ok(screenlessPlayPaths().has(`/game/${id}/play/`), `${id} is not a play route the walk reaches`);
  assert.ok(!probe.DEMO_ROUTES.includes(MC_ROUTE));
  assert.equal(probe.BAR_SEL, '.pr-bar');
});

test('positive control: the demo bar standing in the band on a demo route is green', () => {
  const out = cleanRun();
  assert.ok(rowsOf(out, DEMO, 'D1')[0].anchoredAbove.length === 1, 'the fixture plants the anchored bar');
  assert.deepEqual(judge(out), []);
});

test('must-red: the bar anchored above the band while its viewport is NOT data-bar="band"', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { mode: 'below' });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /1 fixed\/sticky route box\(es\) anchored above the band: div#app > div\.pr-viewport > div\.pr-bar/), f.join('\n'));
});

test('must-red: the bar with no data-bar on its viewport at all', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { mode: null });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /anchored above the band: .*pr-bar/), f.join('\n'));
});

test('must-red: the bar over the close X', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { l: 40 });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /demo bar .* overlaps the close X/), f.join('\n'));
});

test('must-red: the bar over the edit control', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { l: 120 });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /demo bar .* overlaps the edit control/), f.join('\n'));
  assert.ok(!redOn(f, 'D1', /overlaps the close X/), 'l 120 is clear of the close X');
});

test('must-red: the bar reaching below the band', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { b: 60 });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /demo bar .* is not inside the band/), f.join('\n'));
});

test('must-red: the bar off the right end of the band', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { r: 1300 });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /demo bar .* is not inside the band/), f.join('\n'));
});

test('must-red: the bar wrapped to a second row', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { oneRow: false, rowTop: 30, rowBottom: 28 });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /demo bar .* is not one row/), f.join('\n'));
});

test('must-red: the exempted bar shows no box, so nothing about it was judged', () => {
  const out = cleanRun();
  const r = rowsOf(out, DEMO, 'D1')[0];
  r.bars = [{ present: true, shown: false, parts: 1, pseudo: 0, shape: [], mode: 'band', oneRow: true }];
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /demo bar .* anchored above the band but shows no box/), f.join('\n'));
});

test('must-red: the anchored entry names a bar the read never measured', () => {
  const out = cleanRun();
  rowsOf(out, DEMO, 'D1')[0].bars = [];
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /anchored above the band: .*pr-bar/), f.join('\n'));
});

test('must-red: the bar geometry outside the shape the read is exact for (a transformed ancestor)', () => {
  const out = cleanRun();
  setBar(rowsOf(out, DEMO, 'D1')[0], { shape: ['div.pr-viewport (an ancestor of the demo bar) transform: matrix(2, 0, 0, 2, 0, 0)'] });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /outside the shape this probe can measure.*div\.pr-viewport/), f.join('\n'));
});

test('must-red: a second bar anchored above the band on a demo route', () => {
  const out = cleanRun();
  const r = rowsOf(out, DEMO, 'D1')[0];
  r.bars = [...r.bars, { ...barAt(1280), l: 500, r: 700 }];
  r.anchoredAbove = [...r.anchoredAbove, { ...BAR_ANCHOR, bar: 1 }];
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /2 demo bars \(\.pr-bar\) anchored above the band/), f.join('\n'));
});

test('must-red: a second fixed box (not the bar) anchored above the band on a demo route', () => {
  const out = cleanRun();
  rowsOf(out, DEMO, 'D1')[0].anchoredAbove.push({ sel: 'div#app > div.pr-viewport > div.pr-toast', position: 'fixed', top: '0px', effectiveTop: 0, display: 'block', mc: false, bar: -1 });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /1 fixed\/sticky route box\(es\) anchored above the band: div#app > div\.pr-viewport > div\.pr-toast/), f.join('\n'));
});

test('must-red: a fixed descendant of the bar is not the bar', () => {
  const out = cleanRun();
  rowsOf(out, DEMO, 'D1')[0].anchoredAbove.push({ sel: 'div.pr-bar > button.pr-go', position: 'fixed', top: '0px', effectiveTop: 0, display: 'block', mc: false, bar: -1 });
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /1 fixed\/sticky route box\(es\) anchored above the band: div\.pr-bar > button\.pr-go/), f.join('\n'));
});

test('must-red: the bar in the band on a non-demo route', () => {
  const out = cleanRun();
  for (const id of [OTHER, MC_ROUTE]) {
    const r = rowsOf(out, id, 'D1')[0];
    r.bars = [barAt(1280)];
    r.anchoredAbove = [...r.anchoredAbove, { ...BAR_ANCHOR }];
  }
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${OTHER} D1`) && /anchored above the band: .*pr-bar/.test(m)), f.join('\n'));
  assert.ok(f.some((m) => m.startsWith(`${MC_ROUTE} D1`) && /anchored above the band: .*pr-bar/.test(m)), f.join('\n'));
});

test('must-red: the base case the gate exists for, any route box anchored above the band elsewhere', () => {
  const out = cleanRun();
  rowsOf(out, OTHER, 'S2')[0].anchoredAbove.push({ sel: 'header.tb-head', position: 'sticky', top: '0px', effectiveTop: 0, display: 'flex', mc: false });
  const f = judge(out);
  assert.ok(f.some((m) => m.startsWith(`${OTHER} S2`) && /1 fixed\/sticky route box\(es\) anchored above the band: header\.tb-head/.test(m)), f.join('\n'));
});

test('must-red: the bar carve-out does not cover route content intersecting the band on a demo route', () => {
  const out = cleanRun();
  const r = rowsOf(out, DEMO, 'D1')[0];
  r.hits = [{ sel: 'div.pr-bar > button.pr-go', l: 1110, t: 2, r: 1256, b: 54, overlapPx: 52, pos: 'static', mc: false }];
  r.hitCount = 1;
  const f = judge(out);
  assert.ok(redOn(f, 'D1', /1 route-content box\(es\) intersect the band/), f.join('\n'));
});

test('green: a below-the-frame bar on the phone screens is not judged by the carve-out', () => {
  const out = cleanRun();
  assert.equal(rowsOf(out, DEMO, 'S1')[0].bars[0].mode, 'below');
  assert.ok(!judge(out).some((m) => m.startsWith(DEMO)));
});

test('shape: the classifier names the element it was asked about', () => {
  const chain = [{ sel: 'div.pr-viewport', style: { transform: 'matrix(2, 0, 0, 2, 0, 0)', translate: 'none', rotate: 'none', scale: 'none', zoom: '1' } }];
  const f = probe.carveOutShapeFaults([], chain, 'the demo bar');
  assert.ok(f.some((m) => m === 'div.pr-viewport (an ancestor of the demo bar) transform: matrix(2, 0, 0, 2, 0, 0)'), JSON.stringify(f));
  assert.ok(probe.carveOutShapeFaults([], chain).some((m) => m.includes('(an ancestor of the MC control)')), 'the MC wording is the default');
});
