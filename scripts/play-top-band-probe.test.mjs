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

// ---- production wiring: run(session), the real MEASURE, a fake page (REFUTE 2026-11-14) ----
// The verdict tests above judge synthetic rows, so a mutation to the in-page collector (the bar
// index) stayed green: nothing executed it. These tests drive the SAME symbol main executes -- the
// default export run(session) -- with a stub session whose evaluate runs the REAL exported MEASURE
// string against a minimal fake page, the idiom play-screen-fit-probe.test.mjs uses for its font
// collector. What this cannot cover is whether Chrome answers the way the fake does; the browser leg
// owns that, and play-top-band-probe.fixture.html next to this file is its Chrome counterpart.

const STYLE0 = {
  opacity: '1', visibility: 'visible', display: 'block', position: 'static', top: 'auto', bottom: 'auto', left: 'auto', right: 'auto',
  width: 'auto', height: 'auto', overflowX: 'visible', overflowY: 'visible', transform: 'none', translate: 'none', rotate: 'none',
  scale: 'none', zoom: '1', filter: 'none', perspective: 'none', contain: 'none', clipPath: 'none', backgroundColor: 'rgba(0, 0, 0, 0)',
  content: 'normal', boxSizing: 'content-box', paddingTop: '0px', paddingBottom: '0px', paddingLeft: '0px', paddingRight: '0px',
  borderTopWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', borderRightWidth: '0px',
  marginTop: '0px', marginBottom: '0px', marginLeft: '0px', marginRight: '0px',
};
class BandText {
  constructor(data) { this.nodeType = 3; this.data = data; this.parentElement = null; }
  get textContent() { return this.data; }
}
class BandEl {
  constructor(tag, o = {}, kids = []) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.id = o.id || '';
    this.classList = o.cls ? o.cls.split(/\s+/) : [];
    this.o = o; this.style = { display: '' }; this.hidden = !!o.hidden; this.disabled = !!o.disabled;
    this.attrs = o.attrs || {}; this.childNodes = []; this.parentElement = null;
    for (const k of kids) { k.parentElement = this; this.childNodes.push(k); }
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  get clientWidth() { const c = this.o.clientWidth; return typeof c === 'function' ? c() : (c ?? 0); }
  get clientHeight() { const c = this.o.clientHeight; return typeof c === 'function' ? c() : (c ?? 0); }
  getBoundingClientRect() {
    const r = typeof this.o.rect === 'function' ? this.o.rect() : (this.o.rect || { l: 0, t: 0, r: 0, b: 0 });
    return { left: r.l, top: r.t, right: r.r, bottom: r.b, width: r.r - r.l, height: r.b - r.t };
  }
  contains(n) { for (let x = n; x; x = x.parentElement) if (x === this) return true; return false; }
  matches(sel) {
    if (sel === '*') return true;
    const m = /^([a-zA-Z0-9]*)((?:[#.][\w-]+)*)$/.exec(sel);
    if (!m) throw new Error(`fake page cannot match selector ${sel}`);
    if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
    return (m[2].match(/[#.][\w-]+/g) || []).every((p) => (p[0] === '#' ? this.id === p.slice(1) : this.classList.includes(p.slice(1))));
  }
  closest(sel) { for (let x = this; x; x = x.parentElement) if (x.matches(sel)) return x; return null; }
  all() { const out = []; const w = (e) => { for (const c of e.childNodes) if (c.nodeType === 1) { out.push(c); w(c); } }; w(this); return out; }
  querySelectorAll(sel) { return this.all().filter((e) => e.matches(sel)); }
  getAttribute(name) { return this.attrs[name] ?? null; }
}
const R = (l, t, r, b) => ({ l, t, r, b });

/** A fake page holding the probe's chrome plus the content the caller builds. Rects may be functions
 *  of the live viewport, so a bottom-pinned box resolves against the height the walk set. */
function fakeBandPage(content) {
  const vp = { w: 320, h: 568 };
  const band = new BandEl('div', { id: 'play-band', style: { position: 'fixed', top: '0px', backgroundColor: BAND_GROUND }, rect: () => R(0, 0, vp.w, BAND_PX) });
  const exit = new BandEl('button', { id: 'play-exit', style: { position: 'fixed', top: '6px' }, rect: R(8, 6, 52, 50) });
  const edit = new BandEl('button', { id: 'play-edit-players', hidden: true, style: { position: 'fixed', top: '6px' }, rect: R(60, 6, 150, 50) });
  const tickText = new BandText('0');
  const tick = new BandEl('div', { id: 'tick', rect: R(0, 60, 40, 80) }, [tickText]);
  const body = new BandEl('body', { style: { paddingTop: `${BAND_PX}px` }, rect: () => R(0, 0, vp.w, vp.h) }, [band, exit, edit, tick, ...content({ vp })]);
  const html = new BandEl('html', { clientWidth: () => vp.w, rect: () => R(0, 0, vp.w, vp.h) }, [body]);
  const document = {
    documentElement: html, body,
    getElementById: (id) => html.all().find((e) => e.id === id) ?? null,
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    createTreeWalker: (root) => { const list = []; const w = (e) => { for (const c of e.childNodes) { if (c.nodeType === 3) list.push(c); else w(c); } }; w(root); let i = 0; return { nextNode: () => list[i++] ?? null }; },
    createRange: () => ({ selectNodeContents() {}, getClientRects: () => [] }),
  };
  const getComputedStyle = (e, pseudo) => {
    if (pseudo) return e.o.pseudo?.[pseudo] ?? { ...STYLE0, content: 'none', display: 'inline' };
    const s = { ...STYLE0, ...(e.o.style || {}) };
    if (e.style.display) s.display = e.style.display;
    if (e.o.pinnedShut) s.display = 'none';
    // Chrome's resolved value, measured: a positioned element that GENERATES a box reports its used
    // top even when the declaration is auto; a display:none box reports the declared value. Fixtures
    // supply the used value where the distinction matters (o.usedTop), so the fake never claims a
    // shown box reads auto when Chrome would resolve it.
    if (s.display !== 'none' && s.position !== 'static' && e.o.usedTop) s.top = e.o.usedTop();
    return s;
  };
  const store = () => { const m = new Map(); return { clear: () => m.clear(), setItem: (k, v) => m.set(k, String(v)), getItem: (k) => m.get(k) ?? null }; };
  const localStorage = store(), sessionStorage = store();
  const indexedDB = { deleteDatabase: () => ({ set onsuccess(f) { f(); }, onerror: null }) };
  // The driver wraps every evaluate body in an async IIFE; the fake does the same, so MEASURE's
  // `return` and DROP_STORE's `return await` both run exactly as they run in Chrome.
  const run = (code) => new Function('document', 'getComputedStyle', 'innerWidth', 'innerHeight', 'NodeFilter', 'localStorage', 'sessionStorage', 'indexedDB',
    `return (async () => {${code}\n})()`)(document, getComputedStyle, vp.w, vp.h, { SHOW_TEXT: 4 }, localStorage, sessionStorage, indexedDB);
  let reads = 0;
  return { vp, run, bumpTick: () => { tickText.data = String(++reads); } };
}

/** Drive the production entry over a fixture: run(session) with a stub session. Every MEASURE read
 *  is recorded, so a test can assert each collected row carries the measurement taken at THAT read. */
async function walkFixture(content) {
  const page = fakeBandPage(content);
  const reads = [];
  const session = {
    async onNewDocument() {}, async nav() {}, async wipe() {},
    async setWidth(w, h) { page.vp.w = w; page.vp.h = h; },
    async evaluate(body) {
      try {
        if (body === probe.MEASURE) page.bumpTick();
        const value = await page.run(body);
        if (body === probe.MEASURE) reads.push(value);
        return { value };
      } catch (err) { return { error: String(err) }; }
    },
  };
  const prev = process.env.ROUTES_ONLY;
  process.env.ROUTES_ONLY = DEMO;
  try {
    const out = await probe.default(session);
    return { out, reads, failures: judge(out) };
  } finally {
    if (prev === undefined) delete process.env.ROUTES_ONLY; else process.env.ROUTES_ONLY = prev;
  }
}

// The counter-example (REFUTE 2026-11-14, overflow-ancestor hole): a fixed unrelated box pinned by
// its BOTTOM inset (top:auto, bottom:746px, height 52) at y=2..54 in an 800px viewport, under an
// overflow:hidden viewport starting at y=56. The hit reader clips its overlap away; the anchor
// reader must catch the pin from the bottom inset. Chrome resolves a SHOWN box's computed top to
// the used value (measured), so the shown twin is caught by the top branch already; the hole that
// survives in a real browser is the CLOSED twin (display:none, no used value, rect 0x0) -- a toast
// or modal that lands in the band the moment it shows. Two companions guard the filters: the same
// pin under a transformed ancestor (contained) and an !important display:none pin (pinned shut)
// stay unreported.
const counterContent = ({ vp }) => {
  const pinnedRect = () => R(10, vp.h - 746 - 52, 110, vp.h - 746);
  const usedTop = () => `${vp.h - 746 - 52}px`;
  return [new BandEl('div', { cls: 'clip-viewport', style: { overflowX: 'hidden', overflowY: 'hidden' }, rect: () => R(0, BAND_PX, vp.w, vp.h) }, [
    new BandEl('div', { cls: 'bottom-pinned', style: { position: 'fixed', top: 'auto', bottom: '746px' }, usedTop, rect: pinnedRect }),
    new BandEl('div', { cls: 'bottom-pinned-hidden', style: { position: 'fixed', top: 'auto', bottom: '746px', display: 'none' }, rect: R(0, 0, 0, 0) }),
    new BandEl('div', { cls: 'transformed', style: { transform: 'matrix(1, 0, 0, 1, 0, 0)' }, rect: () => R(0, BAND_PX, vp.w, 300) }, [
      new BandEl('div', { cls: 'contained-pin', style: { position: 'fixed', top: 'auto', bottom: '746px' }, usedTop, rect: pinnedRect }),
    ]),
    new BandEl('div', { cls: 'pinned-shut', style: { position: 'fixed', top: 'auto', bottom: '746px', display: 'none' }, pinnedShut: true, rect: R(0, 0, 0, 0) }),
    new BandEl('div', { cls: 'filler', rect: () => R(0, BAND_PX, vp.w, 356) }),
  ])];
};
const anchorSels = (r) => (r.anchoredAbove || []).map((a) => a.sel);

test('wiring counter-example: the CLOSED bottom-pinned fixed box under the overflow ancestor is caught on every walked screen', async () => {
  const { out, failures } = await walkFixture(counterContent);
  assert.equal(out.rows.length, 3, 'the demo route walk reads S1, D1, S2');
  for (const r of out.rows) {
    assert.ok(anchorSels(r).some((s) => s.endsWith('div.bottom-pinned-hidden')), `${r.state} ${r.vp}: the closed bottom-pinned box is anchored above the band, got ${JSON.stringify(r.anchoredAbove)}`);
    const a = r.anchoredAbove.find((x) => x.sel.endsWith('div.bottom-pinned-hidden'));
    // The pin resolves against the viewport the walk set: 800 - 746 = 54 on the desktop screen
    // (a closed box has no height, so the bottom edge is the conservative read).
    assert.equal(a.effectiveTop, r.vh - 746, `${r.state}: effectiveTop from the bottom inset`);
    assert.equal(a.top, 'auto');
    assert.equal(a.bottom, '746px');
    assert.equal(a.display, 'none');
    // The shown twin, whose computed top Chrome resolves to the used value, is caught either way.
    assert.ok(anchorSels(r).some((s) => s.endsWith('div.bottom-pinned')), `${r.state}: the shown bottom-pinned twin is caught`);
    // The hit reader's clip model is unchanged: the overflow ancestor still cuts the overlap away.
    assert.equal(r.hitCount, 0, `${r.state}: the clip model still reports no hit for these boxes`);
    // The filters are kept: a contained pin and a pinned-shut pin are not reported.
    assert.ok(!anchorSels(r).some((s) => s.endsWith('div.contained-pin')), `${r.state}: a contained pin stays excluded`);
    assert.ok(!anchorSels(r).some((s) => s.endsWith('div.pinned-shut')), `${r.state}: a pinned-shut pin stays excluded`);
  }
  assert.ok(failures.some((m) => /anchored above the band: .*div\.bottom-pinned-hidden/.test(m)), failures.join('\n'));
});

test('wiring positive control: the same box declared by top is caught (the harness detects a known-good anchor)', async () => {
  const topContent = ({ vp }) => {
    const kids = counterContent({ vp })[0].childNodes.slice();
    kids[0] = new BandEl('div', { cls: 'top-pinned', style: { position: 'fixed', top: '2px', bottom: 'auto' }, rect: () => R(160, 2, 260, 54) });
    return [new BandEl('div', { cls: 'clip-viewport', style: { overflowX: 'hidden', overflowY: 'hidden' }, rect: () => R(0, BAND_PX, vp.w, vp.h) }, kids)];
  };
  const { out, failures } = await walkFixture(topContent);
  for (const r of out.rows) {
    assert.ok(anchorSels(r).some((s) => s.endsWith('div.top-pinned')), `${r.state}: a top-declared pin is caught, got ${JSON.stringify(r.anchoredAbove)}`);
  }
  assert.ok(failures.some((m) => /anchored above the band: .*div\.top-pinned/.test(m)), failures.join('\n'));
});

// Two bars, so the collector's index is load-bearing: bar zero sits below the frame (mode below),
// bar one stands in the band (mode band) and is the carve-out's exempt box. The anchored entry must
// name bar ONE -- an index that always says 0 makes the judge read bar zero's results and reds the
// exempt bar as content. This is the REFUTE mutation that stayed green on the synthetic-row tests.
const barContent = ({ vp }) => [
  new BandEl('div', { cls: 'pr-viewport', attrs: { 'data-bar': 'below' }, rect: () => R(0, BAND_PX, vp.w, vp.h) }, [
    new BandEl('div', { id: 'bar-zero', cls: 'pr-bar', rect: () => R(0, 400, vp.w, 560) }, [
      new BandEl('div', { cls: 'pr-item', rect: () => R(10, 410, 100, 450) }),
    ]),
  ]),
  new BandEl('div', { cls: 'pr-viewport', attrs: { 'data-bar': 'band' }, style: { overflowX: 'hidden', overflowY: 'hidden' }, rect: () => R(0, BAND_PX, vp.w, vp.h) }, [
    new BandEl('div', { id: 'bar-one', cls: 'pr-bar', style: { position: 'fixed', top: '2px' }, rect: () => R(vp.w - 164, 2, vp.w - 24, 54) }, [
      new BandEl('div', { cls: 'pr-item', rect: () => R(vp.w - 154, 15, vp.w - 34, 40) }),
    ]),
  ]),
];

test('wiring: the exempt bar is admitted through run(session) and the collector index names the right bar', async () => {
  const { out, failures } = await walkFixture(barContent);
  assert.deepEqual(failures, [], 'the two-bar fixture is green when the collector wiring is intact');
  for (const r of out.rows) {
    assert.equal(r.bars.length, 2);
    assert.equal(r.bars[0].mode, 'below');
    assert.equal(r.bars[1].mode, 'band');
    assert.equal(r.anchoredAbove.length, 1, `${r.state}: only the band bar is anchored`);
    assert.equal(r.anchoredAbove[0].bar, 1, `${r.state}: the anchored entry names bar ONE, not bar zero`);
    assert.ok(r.anchoredAbove[0].sel.endsWith('div#bar-one'));
  }
});

test('wiring: every collected row carries the measurement taken at its own read, under its own route/state/viewport', async () => {
  const { out, reads } = await walkFixture(barContent);
  assert.equal(out.routes.length, 1);
  assert.equal(out.rows.length, reads.length);
  const states = ['S1', 'D1', 'S2'], vps = ['320x568', '1280x800', '320x568'];
  const sigs = new Set();
  out.rows.forEach((r, i) => {
    assert.equal(r.route, DEMO);
    assert.equal(r.state, states[i]);
    assert.equal(r.vp, vps[i]);
    assert.equal(r.sig, reads[i].sig, `row ${i} carries its own read's fingerprint, not another row's`);
    assert.equal(r.vw, reads[i].vw);
    assert.equal(r.vh, reads[i].vh);
    assert.equal(r.clientWidth, reads[i].clientWidth);
    assert.equal(r.hitCount, reads[i].hitCount);
    sigs.add(r.sig);
  });
  assert.equal(sigs.size, out.rows.length, 'each read is distinguishable, so a shifted or reused result cannot hide');
});

// ---- the tall CLOSED bottom-pinned box (REFUTE round 1 on the bottom-inset fix) ----
// A closed box reads rect height 0, so the bottom-edge read (VH - bottom) misses a box whose
// DECLARED height would carry it into the band when it shows: bottom:0, height:600px at VH 568
// shows at top -32, but the closed read says 568. The declared height stands in: px as is, percent
// of the viewport for a fixed box (of the containing block for sticky), an unresolvable percent
// reads as reaching the band (effectiveTop 0), and auto keeps the bottom-edge read.
const r2 = (n) => +n.toFixed(2);
const closedHeightContent = ({ vp }) => {
  const closedFixed = (cls, height) => new BandEl('div', { cls, style: { position: 'fixed', top: 'auto', bottom: '0px', height, display: 'none' }, rect: R(0, 0, 0, 0) });
  const clip = new BandEl('div', { cls: 'clip-viewport', style: { overflowX: 'hidden', overflowY: 'hidden' }, rect: () => R(0, BAND_PX, vp.w, vp.h) }, [
    closedFixed('tall-closed', '600px'),
    closedFixed('tall-closed-pct', '110%'),
    closedFixed('short-closed', '40px'),
    new BandEl('div', { cls: 'filler', rect: () => R(0, BAND_PX, vp.w, 356) }),
  ]);
  // Sticky percent resolves against the containing block, so these sit OUTSIDE any overflow ancestor
  // (the scroller filter would otherwise exclude them). The rendered block has a definite content
  // height; the closed one has none, which is the unresolvable case.
  const stickyBlock = new BandEl('div', { cls: 'sticky-block', clientHeight: 400, rect: () => R(0, BAND_PX, vp.w, 400) }, [
    new BandEl('div', { cls: 'sticky-pct', style: { position: 'sticky', top: 'auto', bottom: '0px', height: '150%', display: 'none' }, rect: R(0, 0, 0, 0) }),
  ]);
  const closedBlock = new BandEl('div', { cls: 'closed-block', style: { display: 'none' }, clientHeight: 0, rect: R(0, 0, 0, 0) }, [
    new BandEl('div', { cls: 'sticky-unresolvable', style: { position: 'sticky', top: 'auto', bottom: '0px', height: '50%', display: 'none' }, rect: R(0, 0, 0, 0) }),
  ]);
  return [clip, stickyBlock, closedBlock];
};

test('wiring: a tall CLOSED bottom-pinned box is caught from its declared height, a short one is not', async () => {
  const { out, failures } = await walkFixture(closedHeightContent);
  assert.equal(out.rows.length, 3);
  for (const r of out.rows) {
    const bySel = (suffix) => (r.anchoredAbove || []).find((a) => a.sel.endsWith(suffix));
    const reaches = (h) => r.vh - h < BAND_PX - 0.5;
    // 600px declared: caught only where the viewport is short enough that showing it reaches the band.
    const tall = bySel('div.tall-closed');
    if (reaches(600)) {
      assert.ok(tall, `${r.state} ${r.vp}: the tall closed box (600px) reaches the band, got ${JSON.stringify(r.anchoredAbove)}`);
      assert.equal(tall.effectiveTop, r2(r.vh - 600));
      assert.equal(tall.top, 'auto'); assert.equal(tall.bottom, '0px'); assert.equal(tall.display, 'none');
    } else assert.ok(!tall, `${r.state} ${r.vp}: 600px does not reach the band at this height`);
    // 110% of the viewport: always taller than the viewport, so always reaches the band.
    const pct = bySel('div.tall-closed-pct');
    assert.ok(pct, `${r.state} ${r.vp}: the 110% closed box reaches the band`);
    assert.equal(pct.effectiveTop, r2(r.vh - 1.1 * r.vh));
    // Known-good: a short closed box (40px) well below the band is never flagged.
    assert.ok(!bySel('div.short-closed'), `${r.state} ${r.vp}: the short closed box stays unflagged`);
    // Sticky percent of a definite containing block (150% of 400 = 600): same reach as the 600px box.
    const sp = bySel('div.sticky-pct');
    if (reaches(600)) { assert.ok(sp, `${r.state} ${r.vp}: sticky 150% of 400 reaches the band`); assert.equal(sp.effectiveTop, r2(r.vh - 600)); }
    else assert.ok(!sp, `${r.state} ${r.vp}: sticky 600px does not reach at this height`);
    // Sticky percent against a CLOSED containing block: unresolvable, conservatively reaching the band.
    const su = bySel('div.sticky-unresolvable');
    assert.ok(su, `${r.state} ${r.vp}: an unresolvable sticky percent reads as reaching the band`);
    assert.equal(su.effectiveTop, 0);
    // Closed boxes carry no rect, so the hit reader still reports nothing for them.
    assert.equal(r.hitCount, 0);
  }
  assert.ok(failures.some((m) => /anchored above the band: .*div\.tall-closed/.test(m)), failures.join('\n'));
});

// ---- percent and calc INSETS on a closed box (REFUTE round 2 on the declared-height fix) ----
// parseFloat cannot resolve a percentage or calc inset: bottom:90% reads 90 (not 0.9*VH), and
// bottom:calc(100% - 56px) reads NaN, so a closed box that Chrome shows inside the band produces no
// anchor. Both insets resolve like heights now: px as is, percent of the viewport for fixed (of the
// containing block for sticky), and anything that needs layout (calc, var, env, min/max/clamp) reads
// as reaching the band (effectiveTop 0). The fake keeps calc UNSIMPLIFIED -- Chrome simplifies
// calc(10px) to 10px before the read, but a percentage-bearing calc stays calc, and that is the path
// exercised here. No DOM mutation: the resolver reads computed style and clientHeight only.
const insetContent = ({ vp }) => {
  const closed = (cls, insets) => new BandEl('div', { cls, style: { position: 'fixed', height: '40px', display: 'none', ...insets }, rect: R(0, 0, 0, 0) });
  return [new BandEl('div', { cls: 'clip-viewport', style: { overflowX: 'hidden', overflowY: 'hidden' }, rect: () => R(0, BAND_PX, vp.w, vp.h) }, [
    closed('bottom-90', { top: 'auto', bottom: '90%' }),
    closed('bottom-calc', { top: 'auto', bottom: 'calc(100% - 56px)' }),
    closed('top-1pct', { top: '1%', bottom: 'auto' }),
    closed('top-calc', { top: 'calc(10px)', bottom: 'auto' }),
    closed('bottom-10', { top: 'auto', bottom: '10%' }),
    new BandEl('div', { cls: 'filler', rect: () => R(0, BAND_PX, vp.w, 356) }),
  ])];
};

test('wiring: percent and calc insets on a closed box resolve, an unresolvable inset reaches the band', async () => {
  const { out, failures } = await walkFixture(insetContent);
  assert.equal(out.rows.length, 3);
  for (const r of out.rows) {
    const bySel = (suffix) => (r.anchoredAbove || []).find((a) => a.sel.endsWith(suffix));
    // bottom:90% resolves to 0.9*VH, so the shown top is VH - 0.9*VH - 40 = 0.1*VH - 40 (in band).
    const b90 = bySel('div.bottom-90');
    assert.ok(b90, `${r.state} ${r.vp}: bottom:90% closed box reaches the band, got ${JSON.stringify(r.anchoredAbove)}`);
    assert.equal(b90.effectiveTop, r2(0.1 * r.vh - 40));
    // bottom:calc(100% - 56px) cannot be resolved without layout: conservatively reaching the band.
    const bc = bySel('div.bottom-calc');
    assert.ok(bc, `${r.state} ${r.vp}: an unresolvable bottom calc reaches the band`);
    assert.equal(bc.effectiveTop, 0);
    // top:1% resolves to 0.01*VH (parseFloat would read 1, the wrong position).
    const t1 = bySel('div.top-1pct');
    assert.ok(t1, `${r.state} ${r.vp}: top:1% closed box reaches the band`);
    assert.equal(t1.effectiveTop, r2(0.01 * r.vh));
    // top:calc(10px) unresolvable in the fake: reaching the band.
    const tc = bySel('div.top-calc');
    assert.ok(tc, `${r.state} ${r.vp}: an unresolvable top calc reaches the band`);
    assert.equal(tc.effectiveTop, 0);
    // Known-good: bottom:10% / height 40px shows far below the band (0.9*VH - 40), never flagged.
    assert.ok(!bySel('div.bottom-10'), `${r.state} ${r.vp}: bottom:10% closed box stays unflagged`);
    assert.equal(r.hitCount, 0);
  }
  assert.ok(failures.some((m) => /anchored above the band: .*div\.bottom-90/.test(m)), failures.join('\n'));
});
