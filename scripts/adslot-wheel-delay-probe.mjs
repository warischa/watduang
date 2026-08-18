// Measures wheel.astro's DELAYED shrink (SPIN_MS=1200 setTimeout in the un-reduced-motion branch of
// spin(), src/pages/tool/wheel.astro:243) — NOT the ghost-tap class this session's earlier work
// covers. That shift lands ~1200ms after the tap resolves, well outside any double-tap window, so
// the hazard here is a deliberate tap landing on the ad slot after a layout shift the player did not
// expect, not a second accidental tap. See docs/verification/evidence/adslot/README.md.
//
// READ-ONLY measurement — makes no src/ changes.
//
// Run (repeat once with, once without --force-prefers-reduced-motion — see docs/agents/browser-verification.md):
//   npm run build && npx serve dist/ -l 4321 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 \
//     --user-data-dir=/tmp/adslot-delay-prof &
//   REPEAT=5 node scripts/driver.mjs scripts/adslot-wheel-delay-probe.mjs

const BASE = process.env.PROBE_BASE || 'http://localhost:4321';
const WIDTH = Number(process.env.PROBE_WIDTH || 320); // this site's reference viewport
const REPEAT = Number(process.env.REPEAT || 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Long enough Thai names force one name per row at 320px (verified in ad-slot-grid-probe.mjs), so
// marking one "ออกแล้ว" has the best chance of actually changing row height/wrap.
const LONG_NAMES = ['ชื่อทดสอบยาวมากหนึ่ง', 'ชื่อทดสอบยาวมากสอง', 'ชื่อทดสอบยาวมากสาม', 'ชื่อทดสอบยาวมากสี่'];

// Same grid-scan method as ad-slot-grid-probe.mjs (docs/agents/browser-verification.md trap #2: a
// centre-line-only sample missed a real 7px-off-axis collision) — reused here, not reinvented.
function gridPoints(rect) {
  const pts = [];
  for (let x = rect.left + 2; x <= rect.right - 2; x += 6)
    for (let y = rect.top + 2; y <= rect.bottom - 2; y += 5) pts.push([Math.round(x), Math.round(y)]);
  if (pts.length === 0) pts.push([Math.round((rect.left + rect.right) / 2), Math.round((rect.top + rect.bottom) / 2)]);
  return pts;
}
function collide(pts, r) {
  if (!r) return false;
  return pts.some(([x, y]) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

// Grid-scans targetKey's PRE-TAP box against every OTHER target's rect across the whole sampled
// timeline, and reports the first/last sample timestamp (relative to tap) where a collision holds —
// answers "does a different tappable target land there, and for how long".
function overlapWindow(beforeRects, samples, tTapRel) {
  const keys = Object.keys(beforeRects).filter((k) => beforeRects[k]);
  const out = {};
  for (const a of keys) {
    const pts = gridPoints(beforeRects[a]);
    for (const b of keys) {
      if (a === b) continue;
      let first = null, last = null;
      for (const s of samples) {
        if (collide(pts, s[b])) {
          const tRel = Math.round(s.t - tTapRel);
          if (first === null) first = tRel;
          last = tRel;
        }
      }
      if (first !== null) out[`${a}_covered_by_${b}`] = { firstMs: first, lastMs: last, durationMs: last - first };
    }
  }
  return out;
}

async function runOnce(session) {
  const url = `${BASE}/tool/wheel/`;
  await session.nav(url);
  await session.setWidth(WIDTH, 1400);
  await session.wipe();
  await session.evaluate(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(LONG_NAMES))}); return true;`);
  await session.nav(url); // reload same tab so PlayerSetup reads the seeded roster (driver.mjs trap #3/#4)
  await session.setWidth(WIDTH, 1400);
  await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click();
    return true;`);
  await sleep(600);

  const rm = await session.evaluate(`return window.matchMedia('(prefers-reduced-motion: reduce)').matches;`);
  if (rm.error) return { error: rm.error };

  const setup = await session.evaluate(`
    document.getElementById('wheel-eliminate').click();
    window.__probe = { tTap: null, tMutation: null, samples: [] };
    function rectOf(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }
    function snap() {
      return {
        t: performance.now(),
        ad: rectOf(document.querySelector('.ad-slot')),
        navLink: rectOf(document.querySelector('.wheel-next a')),
        resetBtn: rectOf(document.getElementById('wheel-reset')),
      };
    }
    window.__probe.before = snap();
    // render() also runs synchronously at spin-start (to disable the button / update the note) —
    // that first childList mutation is NOT the delayed shrink. The reveal-time render() is the one
    // that adds an .is-out row (spun.add(picked) only happens inside reveal()), so that is the
    // signal to key the delayed-shrink timestamp on, not "any mutation".
    const mo = new MutationObserver(() => {
      if (window.__probe.tMutation === null && document.querySelector('#wheel-names .is-out')) {
        window.__probe.tMutation = performance.now();
      }
    });
    mo.observe(document.getElementById('wheel-names'), { childList: true, subtree: true, characterData: true });
    document.getElementById('wheel-spin').addEventListener('click', () => {
      if (window.__probe.tTap === null) window.__probe.tTap = performance.now();
    }, { capture: true });
    const t0 = performance.now();
    function loop() {
      window.__probe.samples.push(snap());
      if (performance.now() - t0 < 2200) requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    const r = document.getElementById('wheel-spin').getBoundingClientRect();
    return { cx: Math.round((r.left + r.right) / 2), cy: Math.round((r.top + r.bottom) / 2) };
  `);
  if (setup.error) return { error: setup.error };
  const { cx, cy } = setup.value;

  await session.tap(cx, cy); // real touch (Input.dispatchTouchEvent) — proves the handler actually fires
  await sleep(2400); // covers the 2200ms in-page sampling window + margin

  const result = await session.evaluate(`
    const p = window.__probe;
    return { before: p.before, samples: p.samples, tTap: p.tTap, tMutation: p.tMutation };
  `);
  if (result.error) return { error: result.error };
  const { before, samples, tTap, tMutation } = result.value;

  if (tTap === null) return { error: 'wheel-spin click never fired — real touch did not reach the handler' };

  const after = samples[samples.length - 1] || before;
  const delayMs = tMutation !== null ? Math.round(tMutation - tTap) : null;
  const adShiftPx = before.ad && after.ad ? Math.round((before.ad.top - after.ad.top) * 100) / 100 : null; // + = rose (moved up)
  const navLinkShiftPx = before.navLink && after.navLink ? Math.round((before.navLink.top - after.navLink.top) * 100) / 100 : null;
  const overlaps = overlapWindow(before, samples, tTap);

  return {
    reducedMotionMatches: rm.value,
    tapPoint: { cx, cy },
    delayMsTapToShrinkObserved: delayMs,
    shrinkNeverObserved: tMutation === null,
    adShiftPx,
    navLinkShiftPx,
    tappableTargetCollision: Object.keys(overlaps).length > 0,
    overlaps,
    rectsBefore: before,
    rectsAfter: after,
  };
}

export default async function (session) {
  const runs = [];
  for (let i = 0; i < REPEAT; i++) {
    runs.push(await runOnce(session));
  }
  const okRuns = runs.filter((r) => !r.error);
  const delays = okRuns.map((r) => r.delayMsTapToShrinkObserved).filter((d) => d !== null);
  const adShifts = okRuns.map((r) => r.adShiftPx).filter((d) => d !== null);
  const stats = (arr) => arr.length
    ? { n: arr.length, min: Math.min(...arr), max: Math.max(...arr), mean: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 }
    : { n: 0 };

  return {
    width: WIDTH,
    repeat: REPEAT,
    runs,
    summary: {
      delayMsStats: stats(delays),
      adShiftPxStats: stats(adShifts),
      anyRunErrored: runs.some((r) => r.error),
      anyTappableTargetCollision: okRuns.some((r) => r.tappableTargetCollision),
      reducedMotionMatchesConsistent: new Set(okRuns.map((r) => r.reducedMotionMatches)).size <= 1,
      reducedMotionMatches: okRuns[0]?.reducedMotionMatches ?? null,
    },
  };
}
