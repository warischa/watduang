// gh#87 committed browser probe — the ticket's own boxes, measured in a real browser, not read
// from the CSS (docs/agents/browser-verification.md). Run against a real build:
//
//   npm run build && npx serve dist/ -l 4321
//   Chrome A: --remote-debugging-port=9222 (normal motion)
//   Chrome B: --remote-debugging-port=9223 --force-prefers-reduced-motion (emulated reduce)
//   node scripts/driver.mjs scripts/home-direction-c-probe.mjs            -> CDP_PORT=9222
//   CDP_PORT=9223 node scripts/driver.mjs scripts/home-direction-c-probe.mjs
//
// Verdicts:
//   1. NO_SIDEWAYS_SCROLL at 320px and 390px — the run reports innerWidth equal to what was asked
//      (a run that does not is void, not a pass), scrollWidth === clientWidth, and zero elements
//      whose right edge passes the viewport edge. Calibrated per width: a deliberately overflowing
//      element injected before each measurement must flip the detector red, or the run
//      fail-louds — a detector that cannot see the overflow it exists to catch measures nothing.
//   2. RAIL_ABSENT below the 1100px the artboard names — at 1024px the rail is not rendered at
//      all (the criterion is absent, not merely unstuck) and the page still does not scroll
//      sideways. The 1440px row (the artboard's own width) is where the rail IS rendered, so its
//      600px reserved height is measured there, not asserted from the CSS.
//   3. MOTION — every element carrying the page's decoration classes (hero stripes, badge pop,
//      spinning wheel, card bobs) reports computed animation-name "none" and getAnimations() is
//      empty under prefers-reduced-motion; under normal motion the same scan must find real
//      running animation (the positive control — a page whose motion check cannot prove motion
//      exists is N/A, per docs/agents/browser-verification.md, not a pass).
const BASE = process.env.BASE || 'http://localhost:4321';

const ANIMATED = '.hero-stripes, .hero-badge, .hero-wheel, .bob-1, .bob-2, .bob-3';

// One evaluate body, returned raw so the two launches' rows are comparable. `return` is
// load-bearing: driver.mjs wraps the body in an async function, an expression without it reads
// back as null (runbook trap).
const MEASURE = `
  const doc = document.documentElement;
  const over = [...document.querySelectorAll('body *')]
    .map((el) => ({
      cls: (el.className && String(el.className).slice(0, 60)) || el.tagName,
      right: el.getBoundingClientRect().right,
    }))
    .filter((e) => e.right > doc.clientWidth + 0.5);
  const animated = [...document.querySelectorAll('${ANIMATED}')].map((el) => ({
    cls: String(el.className),
    animationName: getComputedStyle(el).animationName,
  }));
  const rail = document.querySelector('.ad-rail');
  return {
    innerWidth: window.innerWidth,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    overflowCount: over.length,
    overflowSample: over.slice(0, 4),
    railRendered: !!rail,
    railDisplay: rail ? getComputedStyle(rail).display : null,
    slotHeights: [...document.querySelectorAll('.ad-slot')].map((el) =>
      Math.round(el.getBoundingClientRect().height),
    ),
    getAnimations: document.getAnimations().length,
    reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animated,
  };
`;

export default async function (session) {
  const rows = [];
  const calibration = [];
  for (const width of [320, 390, 1024, 1440]) {
    await session.setWidth(width, 844);
    await session.nav(`${BASE}/`);
    // Positive control: the overflow detector must SEE a deliberate overflow, then the clean
    // re-measure must be empty again. Injection is DOM-only, same tab, no reload between the two.
    await session.evaluate(
      `document.body.insertAdjacentHTML('afterbegin',
        '<div id="probe-overflow" style="width:150vw;height:1px"></div>'); return true;`,
    );
    const injected = await session.evaluate(MEASURE);
    await session.evaluate(
      `const el = document.getElementById('probe-overflow'); if (el) el.remove(); return true;`,
    );
    // A fresh load after removal, not a re-measure of the same layout: mobile viewport emulation
    // expands the layout viewport around overflowing content and does NOT re-contract without a
    // reload — measuring the post-expansion layout would report innerWidth 330 as a clean pass.
    await session.nav(`${BASE}/`);
    const clean = await session.evaluate(MEASURE);
    calibration.push({ width, sawInjectedOverflow: injected.value.overflowCount > 0 });
    rows.push(clean.value ?? { innerWidth: width, note: 'null measure' });
  }

  const noScroll = (row) => row.scrollWidth === row.clientWidth && row.overflowCount === 0;
  const railAbsent = (row) => !row.railRendered || row.railDisplay === 'none';
  const r320 = rows[0];
  const r390 = rows[1];
  const r1024 = rows[2];
  const r1440 = rows[3];
  const widthVerdicts = [320, 390, 1024, 1440].map((w, i) => ({
    width: w,
    innerWidthReported: rows[i].innerWidth,
    voidUnlessEqual: rows[i].innerWidth === w,
    noSidewaysScroll: noScroll(rows[i]),
    railAbsentBelow1100: w < 1100 ? railAbsent(rows[i]) : null,
  }));
  const calibrationClean = calibration.every((c) => c.sawInjectedOverflow);

  const stopped = rows.map((row) =>
    row.animated.filter((a) => a.animationName !== 'none' && a.animationName !== ''),
  );
  const anyMotionRunning = rows.some((row) =>
    row.animated.some((a) => a.animationName !== 'none' && a.animationName !== '') ||
    row.getAnimations > 0,
  );
  const reduced = rows.every((row) => row.reducedMotionMatches);
  const motionVerdict = reduced
    ? { state: 'reduced', allDecorationStopped: !stopped.some((s) => s.length > 0), noRunningAnimations: rows.every((row) => row.getAnimations === 0), stopped: stopped }
    : { state: 'normal', motionActuallyPresent: anyMotionRunning };

  // Reserved heights the canvas sets: billboard 250, in-content 90, rail 600, pre-footer 250.
  // Measured border-inclusive (the canvas `height` property plus its two 3px dashed borders).
  const heightsVerdict = {
    at390: rows[1].slotHeights, // rail display:none, reserves nothing — three slots
    at1440: r1440.slotHeights, // all four, rail visible — the 600px reserve is real only here
  };

  return {
    verdict: {
      noSidewaysScroll320: noScroll(r320) && r320.innerWidth === 320,
      noSidewaysScroll390: noScroll(r390) && r390.innerWidth === 390,
      railAbsentAt1024: railAbsent(r1024),
      noSidewaysScroll1024: noScroll(r1024),
      railRenderedAt1440: r1440.railRendered && r1440.railDisplay !== 'none',
      noSidewaysScroll1440: noScroll(r1440) && r1440.innerWidth === 1440,
      overflowDetectorCalibration: calibrationClean ? 'red-then-clean on all four widths' : 'CALIBRATION FAILED',
      motion: motionVerdict,
      reservedSlotHeights: heightsVerdict,
    },
    widthVerdicts,
    calibration,
    consoleErrors: session.consoleErrors,
  };
}