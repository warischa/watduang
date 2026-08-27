// Measures: can a tap on a tool page's content-shrinking control be followed, within a human
// double-tap window, by the 250px ad slot (ADR-0004) rising into the point the finger just touched?
// READ-ONLY measurement — this script makes no src/ changes, it only observes.
//
// Hazard: draw.astro/wheel.astro/team.astro shrink content ABOVE the ad slot in a click handler
// (remainingEl/namesEl/resultEl.innerHTML = ''), which pulls the slot upward. number.astro has no
// such handler (its result/note elements are single-line status text, never a shrinking list —
// verified by reading the whole file; measured anyway below for parity, expected PASS/no-op).
//
// Run:
//   npm run build && npx serve dist/ -l 4321 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 \
//     --force-prefers-reduced-motion --user-data-dir=/tmp/adslot-cdp-prof &
//   node scripts/driver.mjs scripts/ad-slot-grid-probe.mjs
// (--force-prefers-reduced-motion is required here, not optional: wheel.astro's reveal() only
// removes a spun name from the list SYNCHRONOUSLY under that media query — see runWheel() below.
// Without it the shrink lands ~1200ms later, outside any human double-tap window, and the second
// wheel-spin tap this probe drives would measure nothing.)
//
// Invariant asserted per page/control/width, one falsifiable sentence: "no point in the control's
// pre-tap box sits inside the ad slot's post-tap bounding rect." Grid-scans the WHOLE control box,
// not the centre line — docs/agents/browser-verification.md trap #2 records a prior probe that
// passed on a 3-point centre-x sample while a real collision sat 7px off axis; this probe exists to
// not repeat that.
// FIXED 2026-08-27 (gh#122): this probe seeded the tool pages through PlayerSetup's #roster-list /
// #start-round, which no tool page renders — every measured control stayed `disabled`, every tap was a
// silent no-op, and all eight rows reported `adRoseByPx: 0` as a PASS. Seeding now goes through the
// tool's own ToolNameEntry panel, and three liveness gates (control not disabled, tap point inside the
// viewport, the page's own list actually changed) turn "measured nothing" into FAIL(unmeasurable)
// instead of into a green. BREAK_GUARD=1 is the end-to-end positive control: it lifts .ad-slot onto the
// real control on the real tap, so every row must report collisions.
// STATUS (gh#43): MANUAL, deliberately. The clearance it measures can go negative with ZERO source change — a longer Thai name or a taller ad creative does it — and the slot height is Google-owned. There is no set we own to scan, so no tripwire can stand in. Re-run it by hand when a tool page's controls or the slot geometry change.

const BASE = process.env.PROBE_BASE || 'http://localhost:4321';
const WIDTHS = [320, 390]; // narrowest supported, and a normal phone width
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gridPoints(rect) {
  const pts = [];
  for (let x = rect.left + 2; x <= rect.right - 2; x += 6)
    for (let y = rect.top + 2; y <= rect.bottom - 2; y += 5) pts.push([Math.round(x), Math.round(y)]);
  if (pts.length === 0) pts.push([Math.round((rect.left + rect.right) / 2), Math.round((rect.top + rect.bottom) / 2)]);
  return pts;
}

function collide(pts, ad) {
  return pts.filter(([x, y]) => x >= ad.left && x <= ad.right && y >= ad.top && y <= ad.bottom)
    .map(([x, y]) => ({ x, y }));
}

// Real touch on #controlId (Input.dispatchTouchEvent via session.tap — proves the handler actually
// fires, not just that an element sits at a point), then compares the ad slot's post-tap rect
// against the grid of the control's OWN pre-tap box. That box, not just its centre, is where a real
// double-tap's second contact can land — two taps of a double-tap are close together, not identical.
// An unmeasurable element (missing control or missing .ad-slot) is FAIL, never a silent skip (per brief).
//
// `listSelector` is this leg's LIVENESS observable, and it is the reason this probe was rewritten: the
// old version seeded the tool pages through #roster-list / #start-round, which no tool page has ever
// rendered, so every measured control stayed `disabled`, every real tap was a no-op, and the resulting
// `adRoseByPx: 0` on all four pages read as PASS while nothing had been measured at all
// (docs/verification/probe-triage-2026-08-26.md, "BROKEN PROBE / false green"). Three things now have to
// be true before a 0-collision verdict is allowed to mean anything: the control is not disabled, its
// tap point is inside the viewport, and the page's own list actually changed under the tap.
async function measure(session, controlId, listSelector) {
  const before = await session.evaluate(`
    const btn = document.getElementById('${controlId}');
    const adEl = document.querySelector('.ad-slot');
    if (!btn || !adEl) return { missing: true };
    // A CDP touch is dispatched in VIEWPORT coordinates, and these controls sit ~1100-1800px down the
    // document at 320px wide — every tap this probe ever aimed at draw-go/team-split (and at its own
    // calibration button) landed below the fold on nothing, which is the second half of why it read 0
    // everywhere. Scroll the control into view first, then read both rects in the SAME frame: the
    // control-to-ad-slot geometry the invariant is about is scroll-invariant, the tap point is not.
    btn.scrollIntoView({ block: 'center' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = btn.getBoundingClientRect();
    const a = adEl.getBoundingClientRect();
    const list = ${JSON.stringify(listSelector ?? null)};
    return {
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      adBefore: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
      disabled: !!btn.disabled,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      listCount: list ? (document.querySelector(list)?.children.length ?? null) : null,
      listHtmlLen: list ? (document.querySelector(list)?.innerHTML.length ?? null) : null,
    };
  `);
  if (before.error) return { controlId, verdict: 'FAIL(unmeasurable)', reason: before.error };
  if (before.value?.missing) return { controlId, verdict: 'FAIL(unmeasurable)', reason: `#${controlId} or .ad-slot not found` };
  // The exact false-green this probe shipped for months: a disabled control swallows the tap silently.
  if (before.value.disabled) {
    return { controlId, verdict: 'FAIL(unmeasurable)', reason: `#${controlId} is disabled — the name list never reached the tool, so the tap cannot fire anything`, before: before.value };
  }

  const rect = before.value.rect;
  const cx = Math.round((rect.left + rect.right) / 2);
  const cy = Math.round((rect.top + rect.bottom) / 2);
  const { w, h } = before.value.viewport;
  // A CDP touch outside the viewport hits nothing and reports no error (browser-verification.md trap
  // #6, applied to touch dispatch) — that is a tap that measured nothing, not a clean screen.
  if (cx < 0 || cx > w || cy < 0 || cy > h) {
    return { controlId, verdict: 'FAIL(unmeasurable)', reason: `tap point (${cx},${cy}) is outside the ${w}x${h} viewport — the touch would land on nothing`, before: before.value };
  }
  if (process.env.BREAK_GUARD) await armPositiveControl(session, controlId);
  await session.tap(cx, cy); // the real touch that fires the shrink handler

  const after = await session.evaluate(`
    const adEl = document.querySelector('.ad-slot');
    if (!adEl) return { missing: true };
    const a = adEl.getBoundingClientRect();
    const list = ${JSON.stringify(listSelector ?? null)};
    return { adAfter: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
             listCount: list ? (document.querySelector(list)?.children.length ?? null) : null,
             listHtmlLen: list ? (document.querySelector(list)?.innerHTML.length ?? null) : null };
  `);
  if (after.error) return { controlId, verdict: 'FAIL(unmeasurable)', reason: after.error };
  if (after.value?.missing) return { controlId, verdict: 'FAIL(unmeasurable)', reason: '.ad-slot vanished after tap' };

  const adAfter = after.value.adAfter;
  const pts = gridPoints(rect);
  const hits = collide(pts, adAfter);
  // clearance/overlap in px along the vertical axis, computed here so the number reported is the
  // number the check actually used, not a threshold trusted from inside the page
  const overlapPx = hits.length ? Math.max(0, Math.min(rect.bottom, adAfter.bottom) - Math.max(rect.top, adAfter.top)) : 0;
  const adRoseByPx = Math.round(before.value.adBefore.top - adAfter.top);
  // Did the tap do ANYTHING? Compared on the page's own list, not on the ad slot: the ad slot staying
  // put is the PASS condition, so using it as the liveness signal too would make "measured nothing"
  // and "measured a clean screen" the same reading.
  const listChanged =
    listSelector === null || listSelector === undefined
      ? null
      : before.value.listCount !== after.value.listCount || before.value.listHtmlLen !== after.value.listHtmlLen;

  return {
    controlId, tapPoint: { x: cx, y: cy },
    controlRectBeforeTap: rect, adRectBefore: before.value.adBefore, adRectAfter: adAfter,
    adRoseByPx, gridTotal: pts.length, collisions: hits, overlapPx,
    listSelector: listSelector ?? null,
    listCountBefore: before.value.listCount, listCountAfter: after.value.listCount, listChanged,
    verdict:
      listChanged === false
        ? 'FAIL(unmeasurable)'
        : hits.length > 0
          ? 'FAIL'
          : 'PASS',
    ...(listChanged === false
      ? { reason: `the tap on #${controlId} changed nothing in ${listSelector} — the trigger never fired, so a 0-collision reading measures nothing` }
      : {}),
  };
}

// BREAK_GUARD=1 arms a positive control on the control this leg is about to tap: its click ALSO lifts
// .ad-slot by exactly the distance that lands the slot's box over the control's own box, so the grid
// scan MUST find collisions. Same computed-shift trick calibrate() uses (a hand-picked px guess landed
// the two edges flush twice, scoring 0 hits), pointed at the real controls instead of a synthetic
// button — that is what makes it an END-TO-END control: it exercises the real page's real trigger.
// It plants a mover; it never disables the detector.
const armPositiveControl = (session, controlId) =>
  session.evaluate(`
    const btn = document.getElementById(${JSON.stringify(controlId)});
    const ad = document.querySelector('.ad-slot');
    if (!btn || !ad) return false;
    btn.addEventListener('click', () => {
      const b = btn.getBoundingClientRect();
      const a = ad.getBoundingClientRect();
      ad.style.transform = 'translateY(-' + ((a.top - b.top) + 20) + 'px)';
    });
    return true;
  `);

// A tool page's names come from its OWN panel (src/components/ToolNameEntry.astro), which reads a
// per-tool localStorage key on render and dispatches `watduang:start` from #name-start — never from
// PlayerSetup's #roster-list / #start-round, which no tool page has ever rendered. The same pattern is
// already proven green in scripts/ad-reflow-first-list-load-probe.mjs.
const TOOL_STORAGE_KEY = {
  '/tool/draw/': 'watduang:tool:draw-names',
  '/tool/team/': 'watduang:tool:team-names',
  '/tool/wheel/': 'watduang:tool:wheel-names',
};

async function seedToolNamesAndStart(session, path, width, players) {
  const url = `${BASE}${path}`;
  const key = TOOL_STORAGE_KEY[path];
  await session.nav(url);
  await session.setWidth(width, 900);
  await session.wipe();
  await session.evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(players))}); return true;`);
  await session.nav(url); // reload same tab so ToolNameEntry reads the seeded list on its own render()
  await session.setWidth(width, 900);
  const started = await session.evaluate(`
    const btn = document.getElementById('name-start');
    if (!btn) return { missing: true };
    btn.click(); // dispatches watduang:start with the seeded players, same as a real tap
    return { missing: false };`);
  await sleep(600);
  return started.value?.missing ? '#name-start not found' : null;
}

// #draw-names/#wheel-names are `display:flex;flex-wrap:wrap` chip lists (draw.astro/wheel.astro CSS)
// — short names like "เอ"/"บี" pack multiple per row, so removing one doesn't drop a row and the ad
// slot never moves (measured empirically: adRoseByPx stayed 0 with 2 short names). Long names force
// one name per row at both test widths (verified: 4 names -> 4 distinct li.offsetTop rows), so a
// single removal reliably drops a row and the slot actually rises — the real-world equivalent is any
// roster with names too long to share a row, which this site's 24-char name field allows.
const LONG_NAMES = ['ชื่อทดสอบยาวมากหนึ่ง', 'ชื่อทดสอบยาวมากสอง', 'ชื่อทดสอบยาวมากสาม', 'ชื่อทดสอบยาวมากสี่'];

async function runDraw(session, width) {
  const err = await seedToolNamesAndStart(session, '/tool/draw/', width, LONG_NAMES);
  if (err) return { controlId: 'draw-go', verdict: 'FAIL(unmeasurable)', reason: err };
  // draw-go shrinks #draw-remaining on the FIRST click already (4 names -> 3 remaining, one row less) — no extra setup
  return measure(session, 'draw-go', '#draw-remaining');
}

async function runWheel(session, width) {
  const err = await seedToolNamesAndStart(session, '/tool/wheel/', width, LONG_NAMES);
  if (err) return { controlId: 'wheel-spin', verdict: 'FAIL(unmeasurable)', reason: err };
  // The reduced-motion branch is what makes this leg's shrink land inside a double-tap window at all
  // (see the header). If the flag did not apply, this leg is VOID — never a pass.
  const rm = await session.evaluate(`return window.matchMedia('(prefers-reduced-motion: reduce)').matches;`);
  if (rm.value !== true) {
    return { controlId: 'wheel-spin', verdict: 'FAIL(unmeasurable)', reason: 'browser is NOT in reduced motion — wheel.astro then defers the shrink by SPIN_MS, so this leg would measure a screen the double-tap window never sees. Launch Chrome with --force-prefers-reduced-motion.' };
  }
  // Setup: turn elimination on and spin once so `spun` already has one name. Under
  // --force-prefers-reduced-motion, reveal() (which removes the spun name from #wheel-names) runs
  // SYNCHRONOUSLY inside spin()'s own click handler — same as it will for the measured tap below.
  await session.evaluate(`
    document.getElementById('wheel-eliminate').click();
    document.getElementById('wheel-spin').click();
    return true;`);
  await sleep(300);
  // The SECOND spin (real tap, measured) removes another already-spun-eligible name synchronously —
  // this is wheel.astro:164's shrink, fired directly by the tap being measured.
  return measure(session, 'wheel-spin', '#wheel-names');
}

async function runTeam(session, width) {
  const err = await seedToolNamesAndStart(session, '/tool/team/', width, ['เอ', 'บี', 'ซี', 'ดี']);
  if (err) return { controlId: 'team-split', verdict: 'FAIL(unmeasurable)', reason: err };
  // Setup: split once at count=4 (grows #team-result from empty to 4 teams), then drop the count
  // input's value to 2 WITHOUT dispatching 'change' — team-count only re-splits on 'change' (line
  // ~216), so #team-result still shows 4 teams when the measured tap fires. The measured tap on
  // team-split is what actually re-splits at count=2, shrinking 4 teams -> 2 (team.astro:163).
  await session.evaluate(`
    document.getElementById('team-count').value = '4';
    document.getElementById('team-count').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('team-split').click();
    return true;`);
  await sleep(300);
  await session.evaluate(`document.getElementById('team-count').value = '2'; return true;`);
  return measure(session, 'team-split', '#team-result');
}

async function runNumber(session, width) {
  const url = `${BASE}/tool/number/`;
  await session.nav(url);
  await session.setWidth(width, 900);
  await session.wipe();
  await session.nav(url); // no name list here — number.astro renders no ToolNameEntry
  await session.setWidth(width, 900);
  // #number-go ships `disabled` and only enables once the range is valid, so the range has to be typed
  // before the measured tap or the touch lands on a dead control (the same silent no-op that made this
  // probe's tool legs false-green).
  const setup = await session.evaluate(`
    const min = document.getElementById('number-min');
    const max = document.getElementById('number-max');
    if (!min || !max) return { missing: true };
    min.value = '1'; min.dispatchEvent(new Event('input', { bubbles: true }));
    max.value = '100'; max.dispatchEvent(new Event('input', { bubbles: true }));
    return { missing: false };`);
  if (setup.value?.missing) return { controlId: 'number-go', verdict: 'FAIL(unmeasurable)', reason: 'number range inputs not found' };
  await sleep(200);
  // number.astro has no candidate control per the brief (no innerHTML list-clear above the slot) —
  // measured anyway for parity across all four pages; expected PASS with adRoseByPx ~ 0.
  return measure(session, 'number-go', '#number-result');
}

// Calibration: construct a case that MUST collide, so the detector is proven capable of going red
// before its all-PASS verdict on the real pages is trusted (browser-verification.md trap #2).
// Injects a synthetic button directly above .ad-slot; on tap it moves .ad-slot up via a CSS
// transform computed AT CLICK TIME from the two elements' real rects (btn.top - ad.top, plus a 20px
// overshoot) — not a hand-picked px guess. First two attempts at this used a fixed shrink amount and
// landed the ad's edge exactly flush with the button's edge both times (0 collisions each time: a
// grid inset stops 2px short of a rect edge that only touches, never enters, the box) — computing
// the exact required shift removes that whole class of near-miss. Reuses measure(), the same
// function used for the real controls, so this calibrates the actual code path, not a hand check
// beside it.
async function calibrate(session) {
  await session.evaluate(`
    const ad = document.querySelector('.ad-slot');
    const btn = document.createElement('button');
    btn.id = 'calib-btn'; btn.textContent = 'calib';
    btn.style.cssText = 'display:block;width:100%;height:40px;';
    btn.onclick = () => {
      const b = btn.getBoundingClientRect();
      const a = ad.getBoundingClientRect();
      const shift = (a.top - b.top) + 20; // lands ad's new top 20px ABOVE btn's top -> btn's whole box is inside ad
      ad.style.transform = 'translateY(-' + shift + 'px)';
    };
    ad.parentNode.insertBefore(btn, ad);
    return true;`);
  return measure(session, 'calib-btn');
}

export default async function (session) {
  // innerWidth verification per trap #1 — recorded once per width so a wrong-width run is visible
  // in the evidence, not just asserted.
  const results = { calibration: null, pages: {} };

  await session.nav(`${BASE}/tool/draw/`);
  // Tall viewport so the injected calib-btn (which sits low on the page, just above .ad-slot) is
  // actually on-screen for session.tap() — CDP touch coordinates are viewport-relative and a tap
  // below the viewport silently hits nothing (browser-verification.md trap #6, same failure mode
  // applied to touch dispatch instead of elementFromPoint). Confirmed empirically: at height 900 the
  // calibration read adRoseByPx: 0 (a false PASS); at 1400 it reads the real collapse.
  await session.setWidth(320, 1400);
  results.calibration = await calibrate(session);

  for (const width of WIDTHS) {
    const widthCheck = await session.evaluate(`return { innerWidth };`);
    results.pages[width] = results.pages[width] || { innerWidthReported: widthCheck.value?.innerWidth ?? widthCheck.error };
    results.pages[width].draw = await runDraw(session, width);
    const w1 = await session.evaluate(`return { innerWidth };`);
    results.pages[width].wheel = await runWheel(session, width);
    results.pages[width].team = await runTeam(session, width);
    results.pages[width].number = await runNumber(session, width);
    results.pages[width].innerWidthReported = w1.value?.innerWidth ?? w1.error;
  }

  const allVerdicts = [];
  for (const width of WIDTHS) {
    for (const page of ['draw', 'wheel', 'team', 'number']) {
      allVerdicts.push(results.pages[width][page]?.verdict);
    }
  }
  // Every row's own liveness, hoisted so no reader has to dig for it: `rowsWithTriggerFired` is the
  // number that would have been 0 on the version of this probe that reported eight green rows without
  // ever firing a trigger.
  const rows = WIDTHS.flatMap((w) => ['draw', 'wheel', 'team', 'number'].map((p) => results.pages[w][p]));
  results.summary = {
    breakGuard: !!process.env.BREAK_GUARD,
    calibrationWentRed: results.calibration.verdict === 'FAIL',
    rows: rows.length,
    rowsWithTriggerFired: rows.filter((r) => r?.listChanged === true).length,
    rowsWithCollisions: rows.filter((r) => r?.collisions?.length > 0).length,
    adRoseByPxPerRow: rows.map((r) => ({ control: r?.controlId, adRoseByPx: r?.adRoseByPx ?? null, verdict: r?.verdict })),
    anyRealCollision: allVerdicts.includes('FAIL'),
    anyUnmeasurable: allVerdicts.includes('FAIL(unmeasurable)'),
    overall: allVerdicts.every((v) => v === 'PASS') ? 'PASS' : 'FAIL',
  };
  return results;
}
