// gh#114 — measures the ad slot's absolute top before vs after the FIRST watduang:start event on
// each name-entry tool page (draw/team/wheel), which is the exact moment a submitted name list first
// reaches the tool (ToolNameEntry -> #name-start click -> 'watduang:start'). number.astro carries no
// ToolNameEntry at all (verified by reading the file), so it has no analog to reproduce; it is still
// probed for a sane before/after around its own first action for completeness.
//
// READ-ONLY — makes no src/ changes.
//
// Trap this probe exists to avoid (docs/agents/browser-verification.md, "settle before the baseline
// read"): reading the ad slot's rect while a synchronous DOM mutation is still one animation frame
// from painting reports the WRONG number. measureAdTopStable() only resolves once the ad slot's
// getBoundingClientRect().top has held steady across 5 consecutive rAF ticks, so both the "before"
// and "after" reads are taken on a genuinely settled layout, never mid-flight.
//
// Run:
//   npm run build && npx serve dist/ -l 4321 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --no-sandbox --remote-debugging-port=9222 --user-data-dir=/tmp/adreflow-prof &
//   node scripts/driver.mjs scripts/ad-reflow-first-list-load-probe.mjs
//
// AD_REFLOW_DIAG=1 additionally names WHICH element above .ad-slot changed height (see below).

const BASE = process.env.PROBE_BASE || 'http://localhost:4321';
const WIDTHS = [320, 390];
const LONG_NAMES = ['ชื่อทดสอบยาวมากหนึ่ง', 'ชื่อทดสอบยาวมากสอง', 'ชื่อทดสอบยาวมากสาม', 'ชื่อทดสอบยาวมากสี่'];

// Evaluated in-page. Resolves the ad slot's rect.top once it has been unchanged (within 0.05px) for
// 5 consecutive requestAnimationFrame ticks — the settle-before-baseline-read discipline the brief
// requires, not a fixed sleep.
const SETTLE_SNIPPET = `
  return await new Promise((resolve) => {
    let last = null, stable = 0;
    function tick() {
      const ad = document.querySelector('.ad-slot');
      if (!ad) { resolve(null); return; }
      const top = ad.getBoundingClientRect().top;
      if (last !== null && Math.abs(top - last) < 0.05) stable++;
      else stable = 0;
      last = top;
      if (stable >= 5) { resolve(top); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
`;

// --- height-attribution diagnostic (AD_REFLOW_DIAG=1) --------------------------------------------
// gh#114 follow-up: a non-zero delta says the ad slot moved, never WHICH element above it grew, and
// the answer is platform-dependent (ubuntu-latest reports -9px on /tool/wheel/ at 320 where macOS
// reports 0). This snapshots every element that precedes-or-contains .ad-slot before and after the
// first list load and reports only the ones whose height changed.
//
// Identity across the two reads is a stamped attribute, not a selector path: the positive control
// INSERTS a node above the slot, which shifts every nth-child index after it, so a path-keyed diff
// would rename half the page and misattribute the growth. A marker survives insertion, and an
// element with no marker in the after pass is by construction new ("appeared").
//
// OFF unless AD_REFLOW_DIAG is set: with it off, not one extra evaluate runs and the verdict inputs
// (the two settled reads) are the same calls as before. With it on, the diagnostic only ADDS a
// `diag` field to a row -- deltaPx and verdict are still computed from the settled reads alone.
const DIAG = !!process.env.AD_REFLOW_DIAG;

// `data-adprobe-*` is inert here: nothing in src/ selects on it (grepped), and the clean calibration
// leg re-proves it every run by still reporting deltaPx 0 with the stamping active.
const CAP_FN = `
  const cap = (el, mid) => {
    const cs = getComputedStyle(el);
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    // data-* names are part of the identifier: a bare '<div>' is not a stable identity, and the
    // positive control's node carries no id or class at all -- only data-probe-control names it.
    const data = el.getAttributeNames().filter((a) => a.startsWith('data-') && a !== 'data-adprobe-id').map((a) => '[' + a + ']').join('');
    // Nearest clipping/scrolling ancestor. The name chips grow inside .wheel-names (fixed 120px,
    // overflow-y:auto), so they change height every run while being physically unable to move the ad
    // slot -- reported, then marked inert in the diff, never suppressed.
    let clip = null;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowY !== 'visible' || pcs.overflowX !== 'visible') {
        clip = { mid: p.getAttribute('data-adprobe-id'), sel: p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (typeof p.className === 'string' && p.className.trim() ? '.' + p.className.trim().split(/\\s+/).join('.') : '') };
        break;
      }
    }
    return {
      mid, clip,
      sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + data,
      h: Math.round(el.getBoundingClientRect().height * 100) / 100,
      oh: el.offsetHeight,
      fs: cs.fontSize, lh: cs.lineHeight, ff: cs.fontFamily,
    };
  };
  const above = () => {
    const ad = document.querySelector('.ad-slot');
    if (!ad) return null;
    // mask 4 = DOCUMENT_POSITION_FOLLOWING: true both for an element the slot comes after and for an
    // ancestor that contains it (which also reports CONTAINED_BY). .ad-slot itself compares 0.
    // Elements INSIDE an <svg> are excluded: the wheel repaints its slices on start, so a bare walk
    // reported 17 "changed" rows of <path>/<g> geometry (whose rect height is not block flow and
    // cannot move the ad slot) and pushed the real mover off both lists. The <svg> root itself is
    // kept -- it is the box that participates in layout. ownerSVGElement is null only for that root.
    return [...document.querySelectorAll('body, body *')]
      .filter((el) => !el.ownerSVGElement && (el.compareDocumentPosition(ad) & 4));
  };
`;

const snapshotBefore = (session) =>
  session.evaluate(`
    ${CAP_FN}
    const els = above();
    if (!els) return null;
    let n = 0;
    const rows = els.map((el) => { const mid = 'e' + (n++); el.setAttribute('data-adprobe-id', mid); return cap(el, mid); });
    const b = getComputedStyle(document.body);
    return { rows, bodyFont: { ff: b.fontFamily, fs: b.fontSize, lh: b.lineHeight } };
  `);

const snapshotAfter = (session) =>
  session.evaluate(`
    ${CAP_FN}
    const els = above();
    if (!els) return null;
    return { rows: els.map((el) => cap(el, el.getAttribute('data-adprobe-id'))) };
  `);

// Every row gets a `summary` even when nothing moved: a diagnostic that has only ever printed an
// empty list is indistinguishable from one that measures nothing, so the clean case says so out loud.
function diffHeights(before, after) {
  if (!before || !after) return { error: 'snapshot unavailable (.ad-slot not found)' };
  const beforeById = new Map(before.rows.map((r) => [r.mid, r]));
  const afterById = new Map(after.rows.filter((r) => r.mid).map((r) => [r.mid, r]));
  // A height change trapped in a clipping ancestor that did NOT itself change height cannot move the
  // ad slot. Marked, not dropped -- if the clipper ever stops holding, its own row shows up too.
  const inert = (row) => {
    const c = row.clip;
    if (!c || !c.mid) return false;
    const cb = beforeById.get(c.mid), ca = afterById.get(c.mid);
    return !!cb && !!ca && Math.abs(ca.h - cb.h) < 0.05;
  };
  const unseen = new Map(beforeById);
  const changed = [], appeared = [];
  for (const a of after.rows) {
    const b = a.mid && beforeById.get(a.mid);
    const base = { sel: a.sel, oh: a.oh, fs: a.fs, lh: a.lh, ff: a.ff, clippedBy: inert(a) ? a.clip.sel : undefined };
    if (!b) { appeared.push({ ...base, after: a.h, delta: a.h }); continue; }
    unseen.delete(a.mid);
    const delta = Math.round((a.h - b.h) * 100) / 100;
    if (Math.abs(delta) >= 0.05 || a.oh !== b.oh) changed.push({ ...base, before: b.h, after: a.h, delta, oh: [b.oh, a.oh] });
  }
  const removed = [...unseen.values()]
    .filter((r) => r.h >= 0.05)
    .map((r) => ({ sel: r.sel, before: r.h, delta: -r.h, clippedBy: inert(r) ? r.clip.sel : undefined }));
  // live movers ahead of clipped ones, then biggest first -- a document-order cap hid the 200px
  // control behind four SVG slices on the first calibration run, and a clipped chip must never
  // displace a real mover from a capped list either
  const rank = (x, y) => (!!x.clippedBy - !!y.clippedBy) || Math.abs(y.delta) - Math.abs(x.delta);
  const all = [...changed, ...appeared, ...removed];
  const live = all.filter((r) => !r.clippedBy).length;
  const clipped = all.length - live;
  return {
    summary:
      live === 0
        ? `no element changed height that can move .ad-slot${clipped ? ` (${clipped} change(s) clipped inside a fixed/scrolling ancestor)` : ''}`
        : `${live} element(s) changed height above .ad-slot${clipped ? ` (+${clipped} clipped, inert)` : ''}`,
    // capped so the whole diag survives a GitHub Actions log line; biggest movers first
    changed: changed.sort(rank).slice(0, 8),
    appeared: appeared.sort(rank).slice(0, 4),
    removed: removed.sort(rank).slice(0, 4),
    bodyFont: before.bodyFont,
  };
}

async function settledAdTop(session) {
  const r = await session.evaluate(SETTLE_SNIPPET);
  if (r.error) return { error: r.error };
  return { value: r.value };
}

// BREAK_GUARD=1 arms a positive control: the trigger this leg is about to click also prepends a 200px
// block above the ad slot, so the before/after pair MUST report a ~200px delta. A 0px verdict from a
// probe that has never reported a non-zero delta is indistinguishable from a probe that measured
// nothing (docs/verification/probe-triage-2026-08-26.md: two probes reported 0 while never firing
// their trigger at all). scripts/ci-probes.sh runs this leg and fails if it does NOT go red.
// It never touches the rule under test -- it is a synthetic mover, not a disabled guard.
const armPositiveControl = (session, triggerId) =>
  session.evaluate(`
    const t = document.getElementById(${JSON.stringify(triggerId)});
    if (!t) return false;
    t.addEventListener('click', () => {
      document.querySelector('.ad-slot')
        ?.insertAdjacentHTML('beforebegin', '<div data-probe-control style="height:200px"></div>');
    });
    return true;
  `);

async function measureNameEntryPage(session, path, width) {
  const url = `${BASE}${path}`;
  await session.nav(url);
  await session.setWidth(width, 1400);
  await session.wipe();
  const storageKey =
    path === '/tool/draw/'
      ? 'watduang:tool:draw-names'
      : path === '/tool/team/'
        ? 'watduang:tool:team-names'
        : 'watduang:tool:wheel-names';
  await session.evaluate(
    `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(LONG_NAMES))}); return true;`
  );
  await session.nav(url); // reload same tab so ToolNameEntry reads the seeded list on its own render()
  await session.setWidth(width, 1400);

  const before = await settledAdTop(session);
  if (before.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: before.error };
  if (before.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found before' };

  // stamped BEFORE the trigger is armed, so the control's injected node is unmarked in the after pass
  const snapBefore = DIAG ? (await snapshotBefore(session)).value : null;
  if (process.env.BREAK_GUARD) await armPositiveControl(session, 'name-start');
  const startClick = await session.evaluate(`
    const btn = document.getElementById('name-start');
    if (!btn) return { missing: true };
    btn.click(); // dispatches watduang:start with the seeded players, same as a real tap
    return { missing: false };
  `);
  if (startClick.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: startClick.error };
  if (startClick.value?.missing) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '#name-start not found' };

  const after = await settledAdTop(session);
  if (after.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: after.error };
  if (after.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found after' };

  const deltaPx = Math.round((after.value - before.value) * 100) / 100;
  const row = {
    path, width,
    beforeY: Math.round(before.value * 100) / 100,
    afterY: Math.round(after.value * 100) / 100,
    deltaPx,
    verdict: Math.abs(deltaPx) < 1 ? 'PASS' : 'FAIL',
  };
  if (DIAG) row.diag = diffHeights(snapBefore, (await snapshotAfter(session)).value);
  return row;
}

// number.astro has no ToolNameEntry / no name list (verified by reading the file) — this measures its
// own first action (pressing "สุ่ม" after filling min/max) purely so the report has a number for every
// page, not because the ticket's premise applies here.
async function measureNumberPage(session, width) {
  const path = '/tool/number/';
  const url = `${BASE}${path}`;
  await session.nav(url);
  await session.setWidth(width, 1400);
  await session.wipe();

  const before = await settledAdTop(session);
  if (before.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: before.error };
  if (before.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found before' };

  const snapBefore = DIAG ? (await snapshotBefore(session)).value : null;
  if (process.env.BREAK_GUARD) await armPositiveControl(session, 'number-go');
  const setup = await session.evaluate(`
    const min = document.getElementById('number-min');
    const max = document.getElementById('number-max');
    const go = document.getElementById('number-go');
    if (!min || !max || !go) return { missing: true };
    min.value = '1'; min.dispatchEvent(new Event('input', { bubbles: true }));
    max.value = '100'; max.dispatchEvent(new Event('input', { bubbles: true }));
    go.click();
    return { missing: false };
  `);
  if (setup.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: setup.error };
  if (setup.value?.missing) return { path, width, verdict: 'FAIL(unmeasurable)', reason: 'number controls not found' };

  const after = await settledAdTop(session);
  if (after.error) return { path, width, verdict: 'FAIL(unmeasurable)', reason: after.error };
  if (after.value === null) return { path, width, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot not found after' };

  const deltaPx = Math.round((after.value - before.value) * 100) / 100;
  const row = {
    path, width,
    beforeY: Math.round(before.value * 100) / 100,
    afterY: Math.round(after.value * 100) / 100,
    deltaPx,
    verdict: Math.abs(deltaPx) < 1 ? 'PASS' : 'FAIL',
    note: 'no ToolNameEntry on this page — measures its own first result reveal, not a name-list load',
  };
  if (DIAG) row.diag = diffHeights(snapBefore, (await snapshotAfter(session)).value);
  return row;
}

export default async function (session) {
  const results = [];
  for (const width of WIDTHS) {
    results.push(await measureNameEntryPage(session, '/tool/draw/', width));
    results.push(await measureNameEntryPage(session, '/tool/team/', width));
    results.push(await measureNameEntryPage(session, '/tool/wheel/', width));
    results.push(await measureNumberPage(session, width));
  }
  return { results, allPass: results.every((r) => r.verdict === 'PASS') };
}
