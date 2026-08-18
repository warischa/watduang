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
async function measure(session, controlId) {
  const before = await session.evaluate(`
    const btn = document.getElementById('${controlId}');
    const adEl = document.querySelector('.ad-slot');
    if (!btn || !adEl) return { missing: true };
    const r = btn.getBoundingClientRect();
    const a = adEl.getBoundingClientRect();
    return {
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      adBefore: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
    };
  `);
  if (before.error) return { controlId, verdict: 'FAIL(unmeasurable)', reason: before.error };
  if (before.value?.missing) return { controlId, verdict: 'FAIL(unmeasurable)', reason: `#${controlId} or .ad-slot not found` };

  const rect = before.value.rect;
  const cx = Math.round((rect.left + rect.right) / 2);
  const cy = Math.round((rect.top + rect.bottom) / 2);
  await session.tap(cx, cy); // the real touch that fires the shrink handler

  const after = await session.evaluate(`
    const adEl = document.querySelector('.ad-slot');
    if (!adEl) return { missing: true };
    const a = adEl.getBoundingClientRect();
    return { adAfter: { left: a.left, right: a.right, top: a.top, bottom: a.bottom } };
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

  return {
    controlId, tapPoint: { x: cx, y: cy },
    controlRectBeforeTap: rect, adRectBefore: before.value.adBefore, adRectAfter: adAfter,
    adRoseByPx, gridTotal: pts.length, collisions: hits, overlapPx,
    verdict: hits.length > 0 ? 'FAIL' : 'PASS',
  };
}

async function seedRosterAndStart(session, path, width, players) {
  const url = `${BASE}${path}`;
  await session.nav(url);
  await session.setWidth(width, 900);
  await session.wipe();
  await session.evaluate(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(players))}); return true;`);
  await session.nav(url); // reload same tab so the seeded roster is what PlayerSetup reads (sessionStorage/localStorage are per-tab/per-origin — driver.mjs trap #3/#4)
  await session.setWidth(width, 900);
  await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click(); return true;`);
  await sleep(600);
}

// #draw-names/#wheel-names are `display:flex;flex-wrap:wrap` chip lists (draw.astro/wheel.astro CSS)
// — short names like "เอ"/"บี" pack multiple per row, so removing one doesn't drop a row and the ad
// slot never moves (measured empirically: adRoseByPx stayed 0 with 2 short names). Long names force
// one name per row at both test widths (verified: 4 names -> 4 distinct li.offsetTop rows), so a
// single removal reliably drops a row and the slot actually rises — the real-world equivalent is any
// roster with names too long to share a row, which this site's 24-char name field allows.
const LONG_NAMES = ['ชื่อทดสอบยาวมากหนึ่ง', 'ชื่อทดสอบยาวมากสอง', 'ชื่อทดสอบยาวมากสาม', 'ชื่อทดสอบยาวมากสี่'];

async function runDraw(session, width) {
  await seedRosterAndStart(session, '/tool/draw/', width, LONG_NAMES);
  // draw-go shrinks #draw-remaining on the FIRST click already (4 names -> 3 remaining, one row less) — no extra setup
  return measure(session, 'draw-go');
}

async function runWheel(session, width) {
  await seedRosterAndStart(session, '/tool/wheel/', width, LONG_NAMES);
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
  return measure(session, 'wheel-spin');
}

async function runTeam(session, width) {
  await seedRosterAndStart(session, '/tool/team/', width, ['เอ', 'บี', 'ซี', 'ดี']);
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
  return measure(session, 'team-split');
}

async function runNumber(session, width) {
  const url = `${BASE}/tool/number/`;
  await session.nav(url);
  await session.setWidth(width, 900);
  await session.wipe();
  await session.nav(url); // fresh defaults (min=1 max=10), no roster needed — number.astro has none
  await session.setWidth(width, 900);
  // number.astro has no candidate control per the brief (no innerHTML list-clear above the slot) —
  // measured anyway for parity across all four pages; expected PASS with adRoseByPx ~ 0.
  return measure(session, 'number-go');
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
  results.summary = {
    calibrationWentRed: results.calibration.verdict === 'FAIL',
    anyRealCollision: allVerdicts.includes('FAIL'),
    anyUnmeasurable: allVerdicts.includes('FAIL(unmeasurable)'),
    overall: allVerdicts.every((v) => v === 'PASS') ? 'PASS' : 'FAIL',
  };
  return results;
}
