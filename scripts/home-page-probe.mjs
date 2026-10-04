// gh#244 committed browser probe for the home page (canvas D, Toy Shelf). It replaces gh#87's
// direction C probe, whose rail and decoration selectors no longer exist on the page. The name
// carries no direction on purpose, so the next redesign rewrites this file instead of renaming it.
// Every verdict is measured in a real browser, never read from the CSS
// (docs/agents/browser-verification.md). Run against a real build:
//
//   npm run build && npx serve dist/ -l 4321
//   Chrome A: --remote-debugging-port=9222 (normal motion)
//   Chrome B: --remote-debugging-port=9223 --force-prefers-reduced-motion (emulated reduce)
//   node scripts/driver.mjs scripts/home-page-probe.mjs            -> CDP_PORT=9222
//   CDP_PORT=9223 node scripts/driver.mjs scripts/home-page-probe.mjs
//
// Verdicts:
//   1. NO_SIDEWAYS_SCROLL at every width in WIDTHS. The run reports innerWidth equal to what was
//      asked (a run that does not is void, not a pass), scrollWidth === clientWidth, and zero
//      elements whose right edge passes the viewport edge. Calibrated per width: a deliberately
//      overflowing element injected before each measurement must flip the detector red, or the run
//      fails loudly. A detector that cannot see the overflow it exists to catch measures nothing.
//   2. ONE_AD_SLOT. Exactly one reserved slot, and no rail at any width (owner ruling 2026-10-04 on
//      gh#244). Its height is measured border-inclusive: the canvas content height plus its two 3px
//      dashed borders, 250 + 6 at desktop and 100 + 6 at or below 1099px.
//   3. SHELF_COLUMNS. The party shelf's first row holds 7 tiles at desktop, 4 in the 640-1099 band
//      and 2 on a phone. Counted from rendered tile positions, never from the grid template.
//   4. ART. After scrolling the whole page, every <img> has loaded with a nonzero natural width (no
//      broken art), and the shelf carries one image per tile.
//   5. MOTION. Every element carrying the page's decoration (the bobbing toy, the sparkles, the
//      popular row's wiggle) reports computed animation-name "none", and getAnimations() is empty,
//      under prefers-reduced-motion. Under normal motion the same scan must find real running
//      animation. That is the positive control: a page whose motion check cannot prove motion exists
//      is N/A, per docs/agents/browser-verification.md, not a pass.
const BASE = process.env.BASE || 'http://localhost:4321';

const WIDTHS = [320, 390, 768, 1024, 1440];
const ANIMATED = '.toy, .spark, .tilt-a, .tilt-b, .tilt-c';
const expectedColumns = (w) => (w >= 1100 ? 7 : w >= 640 ? 4 : 2);
const expectedSlotHeight = (w) => (w >= 1100 ? 256 : 106);

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
  const shelfTiles = [...document.querySelectorAll('.grid-shelf > a')];
  const firstTop = shelfTiles.length ? Math.round(shelfTiles[0].getBoundingClientRect().top) : null;
  const firstRow = shelfTiles.filter((el) => Math.abs(Math.round(el.getBoundingClientRect().top) - firstTop) <= 1);
  return {
    innerWidth: window.innerWidth,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    overflowCount: over.length,
    overflowSample: over.slice(0, 4),
    railCount: document.querySelectorAll('.ad-rail').length,
    slotHeights: [...document.querySelectorAll('.ad-slot')].map((el) =>
      Math.round(el.getBoundingClientRect().height),
    ),
    shelfTiles: shelfTiles.length,
    shelfImages: document.querySelectorAll('.grid-shelf > a img').length,
    shelfFirstRow: firstRow.length,
    getAnimations: document.getAnimations().length,
    reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animated,
  };
`;

// Scroll the whole page one viewport at a time so every lazy image is requested, then wait for each
// to settle. An image that never settles is reported as not loaded, not waited on forever.
const ART = `
  for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight) {
    scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 250));
  }
  const imgs = [...document.images];
  await Promise.all(imgs.map((img) => img.complete ? null : new Promise((r) => {
    img.addEventListener('load', r, { once: true });
    img.addEventListener('error', r, { once: true });
    setTimeout(r, 5000);
  })));
  return {
    images: imgs.length,
    broken: imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute('src')),
  };
`;

export default async function (session) {
  const rows = [];
  const calibration = [];
  let art = null;
  for (const width of WIDTHS) {
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
    calibration.push({ width, sawInjectedOverflow: (injected.value?.overflowCount ?? 0) > 0 });
    rows.push(clean.value ?? { innerWidth: width, note: 'null measure' });
    if (width === 320) art = (await session.evaluate(ART)).value ?? { note: 'null art measure' };
  }

  const noScroll = (row) => row.scrollWidth === row.clientWidth && row.overflowCount === 0;
  const widthVerdicts = WIDTHS.map((w, i) => ({
    width: w,
    innerWidthReported: rows[i].innerWidth,
    voidUnlessEqual: rows[i].innerWidth === w,
    noSidewaysScroll: noScroll(rows[i]),
    oneAdSlot: rows[i].slotHeights?.length === 1 && rows[i].railCount === 0,
    slotHeight: rows[i].slotHeights?.[0] ?? null,
    slotHeightAsDrawn: rows[i].slotHeights?.[0] === expectedSlotHeight(w),
    shelfFirstRow: rows[i].shelfFirstRow,
    shelfColumnsAsDrawn: rows[i].shelfFirstRow === expectedColumns(w),
  }));
  const calibrationClean = calibration.every((c) => c.sawInjectedOverflow);

  const stopped = rows.map((row) =>
    (row.animated ?? []).filter((a) => a.animationName !== 'none' && a.animationName !== ''),
  );
  const anyMotionRunning = rows.some((row) =>
    (row.animated ?? []).some((a) => a.animationName !== 'none' && a.animationName !== '') ||
    row.getAnimations > 0,
  );
  const reduced = rows.every((row) => row.reducedMotionMatches);
  const motionVerdict = reduced
    ? { state: 'reduced', allDecorationStopped: !stopped.some((s) => s.length > 0), noRunningAnimations: rows.every((row) => row.getAnimations === 0), decorated: rows.map((r) => (r.animated ?? []).length), stopped }
    : { state: 'normal', motionActuallyPresent: anyMotionRunning, decorated: rows.map((r) => (r.animated ?? []).length) };

  const shelf = rows[0];
  return {
    verdict: {
      noSidewaysScrollAll: widthVerdicts.every((w) => w.voidUnlessEqual && w.noSidewaysScroll),
      oneAdSlotNoRail: widthVerdicts.every((w) => w.oneAdSlot),
      slotHeightsAsDrawn: widthVerdicts.every((w) => w.slotHeightAsDrawn),
      shelfColumnsAsDrawn: widthVerdicts.every((w) => w.shelfColumnsAsDrawn),
      shelfOneImagePerTile: shelf.shelfTiles > 0 && shelf.shelfImages === shelf.shelfTiles,
      artLoaded: !!art && art.images > 0 && Array.isArray(art.broken) && art.broken.length === 0,
      overflowDetectorCalibration: calibrationClean ? `red-then-clean on all ${WIDTHS.length} widths` : 'CALIBRATION FAILED',
      motion: motionVerdict,
    },
    widthVerdicts,
    art,
    calibration,
    consoleErrors: session.consoleErrors,
  };
}
