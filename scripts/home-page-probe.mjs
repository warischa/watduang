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
//   1. NO_SIDEWAYS_SCROLL at every width in WIDTHS. The term is "contributes to sideways scroll"
//      (owner ruling 2026-10-26, gh#288), so the verdict reads only the document's own scroll extent:
//      scrollWidth === clientWidth, and the layout viewport did not grow past clientWidth (mobile
//      emulation widens innerWidth around overflowing content, which is the browser saying the same
//      thing). Both are read with html and body forced to overflow-x: visible inline, in the same
//      evaluate, so a root or body clip cannot hide real overflow from the reading; the computed
//      overflow-x of both must then read "visible", or the row is red (an !important rule beat the
//      force). Which elements a decorative layer may poke past the edge without scrolling the page
//      (a clipping ancestor, clip-path, contain: paint, a transformed containing block) is a set the
//      browser owns, so the probe never models it. The per-element list of boxes whose right edge
//      passes the viewport edge is kept, UN-GATED, as a diagnostic that names a red's culprit.
//      Void is "the width did not apply" (clientWidth read before the force differs from the width
//      asked), never innerWidth: overflow grows innerWidth, and a real overflow must report as this
//      verdict's red, not as a void run. Calibrated per width, both must red or the run fails loudly:
//      (a) an injected 150vw element; (b) the same element under an injected html, body
//      { overflow-x: clip }, which hides it from an unforced reading (asserted, or the leg proves
//      nothing) and must still red through the force. A detector that cannot see the overflow it
//      exists to catch measures nothing.
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
//   6. SCROLL_REVEAL (gh#288). At 390 and 1440, after a plain navigation (the module hides nothing on
//      a back/forward or reload navigation, so a run whose navigation type is not "navigate" is void,
//      not a pass): no element at or above the fold carries .reveal-pending; no .reveal-pending or
//      .is-in sits on, inside or around an .ad-slot, the .hero or #stage; at least one below-the-fold
//      <section> is pending at load, with the lane's own pending form (normal: opacity 0, translate
//      0px 16px; reduced: opacity 0, translate none — the lanes must differ, or the reduced rule never
//      applied); scrolled into view it gains .is-in, ends at opacity 1 with both classes removed, and
//      nothing in view is left pending. Calibrated: the excluded-element detector must see a class
//      injected onto the ad slot and the hero, or the run fails loudly.
const BASE = process.env.BASE || 'http://localhost:4321';

const WIDTHS = [320, 390, 768, 1024, 1440];
const ANIMATED = '.toy, .spark, .tilt-a, .tilt-b, .tilt-c';
const expectedColumns = (w) => (w >= 1100 ? 7 : w >= 640 ? 4 : 2);
const expectedSlotHeight = (w) => (w >= 1100 ? 256 : 106);

// One evaluate body, returned raw so the two launches' rows are comparable. `return` is
// load-bearing: driver.mjs wraps the body in an async function, an expression without it reads
// back as null (runbook trap).
export const MEASURE = `
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
  // Unforced reading first: forcing overflow visible grows innerWidth synchronously under mobile
  // emulation and it does not shrink back, so every other read above and here precedes the force.
  const innerWidth = window.innerWidth;
  const unforced = { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  const inline = { html: doc.style.overflowX, body: document.body.style.overflowX };
  doc.style.overflowX = 'visible';
  document.body.style.overflowX = 'visible';
  const forced = {
    htmlOverflowX: getComputedStyle(doc).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    innerWidth: window.innerWidth,
  };
  doc.style.overflowX = inline.html;
  document.body.style.overflowX = inline.body;
  return {
    innerWidth,
    clientWidth: unforced.clientWidth,
    unforced,
    forced,
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

// Scroll reveal (verdict 6). One evaluate defines the scan and records the load state; the scan is
// kept on window so the calibration can rerun the same detector, never a second copy of it.
const REVEAL_WIDTHS = [390, 1440];
const REVEAL_LOAD = `
  const NEVER = '.ad-slot, .hero, #stage';
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (String(el.className).trim() ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '');
  window.__revealScan = () => {
    const marked = [...document.querySelectorAll('.reveal-pending, .is-in')];
    return {
      excluded: marked.filter((el) => el.closest(NEVER) || el.querySelector(NEVER)).map(describe),
      // Not mid-fade: fonts can shift a section into view after the module ran, and IO then reveals
      // it correctly; only an element still hidden counts.
      aboveFold: [...document.querySelectorAll('.reveal-pending:not(.is-in)')]
        .filter((el) => el.getBoundingClientRect().top <= innerHeight).map(describe),
    };
  };
  const target = [...document.querySelectorAll('section.reveal-pending')][0] ?? null;
  window.__revealProbe = { target, sawIn: false };
  if (target) {
    new MutationObserver(() => {
      if (target.classList.contains('is-in')) window.__revealProbe.sawIn = true;
    }).observe(target, { attributes: true, attributeFilter: ['class'] });
  }
  const cs = target ? getComputedStyle(target) : null;
  return {
    innerWidth: window.innerWidth,
    navigationType: performance.getEntriesByType('navigation')[0]?.type ?? null,
    reducedMotionMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    pendingCount: document.querySelectorAll('.reveal-pending').length,
    target: target ? describe(target) : null,
    pendingForm: cs ? { opacity: cs.opacity, translate: cs.translate } : null,
    ...window.__revealScan(),
  };
`;
const REVEAL_CALIBRATE = `
  const planted = [...document.querySelectorAll('.ad-slot, .hero')].filter((el) => !el.classList.contains('reveal-pending'));
  planted.forEach((el) => el.classList.add('reveal-pending'));
  const seen = window.__revealScan().excluded.length;
  planted.forEach((el) => el.classList.remove('reveal-pending'));
  return { planted: planted.length, seen, cleanAfter: window.__revealScan().excluded.length };
`;
const REVEAL_SCROLL = `
  const p = window.__revealProbe;
  if (!p || !p.target) return { note: 'no target' };
  p.target.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 1200));
  const stuck = [...document.querySelectorAll('.reveal-pending:not(.is-in)')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight * 0.9 - 1;
  });
  return {
    sawIn: p.sawIn,
    opacity: getComputedStyle(p.target).opacity,
    cleanedUp: !p.target.classList.contains('reveal-pending') && !p.target.classList.contains('is-in'),
    stuckInView: stuck.length,
    ...window.__revealScan(),
  };
`;

// Verdict 1's term, one predicate for the clean rows and both calibration legs. Fails closed: a null
// or partial measure is never a pass.
export const noScroll = (row) => {
  const f = row?.forced;
  return !!f && typeof f.scrollWidth === 'number' && typeof f.clientWidth === 'number' &&
    f.htmlOverflowX === 'visible' && f.bodyOverflowX === 'visible' &&
    f.scrollWidth === f.clientWidth && f.innerWidth === f.clientWidth;
};

const OVERFLOW_DIV = `document.body.insertAdjacentHTML('afterbegin',
  '<div id="probe-overflow" style="width:150vw;height:1px"></div>');`;
const ROOT_CLIP = `document.head.insertAdjacentHTML('beforeend',
  '<style id="probe-root-clip">html, body { overflow-x: clip }</style>');`;

export default async function (session) {
  const rows = [];
  const calibration = [];
  let art = null;
  for (const width of WIDTHS) {
    await session.setWidth(width, 844);
    // Positive controls: the detector must SEE a deliberate overflow, plain and behind a root clip.
    // Each leg gets its own fresh load: mobile viewport emulation expands the layout viewport around
    // overflowing content and does NOT re-contract without a reload, so a leg measured on the
    // previous leg's layout would read that leg's expansion, and a clean measure on it would pass.
    await session.nav(`${BASE}/`);
    await session.evaluate(`${OVERFLOW_DIV} return true;`);
    const plain = (await session.evaluate(MEASURE)).value ?? null;
    await session.nav(`${BASE}/`);
    await session.evaluate(`${ROOT_CLIP} ${OVERFLOW_DIV} return true;`);
    const clipped = (await session.evaluate(MEASURE)).value ?? null;
    await session.nav(`${BASE}/`);
    const clean = await session.evaluate(MEASURE);
    // The clip leg counts only if the clip really hid the overflow from an unforced reading; a leg
    // that reds without the force step proves nothing about the force step.
    const clipHidUnforced = !!clipped && clipped.unforced?.scrollWidth === clipped.unforced?.clientWidth;
    // Red for the right reason: the forced scroll extent itself, not the computed-visible assertion,
    // which a clip leg trips with or without the force and so would mask a force step that stopped
    // working.
    const redByExtent = (m) => !!m?.forced && !noScroll(m) && m.forced.scrollWidth !== m.forced.clientWidth;
    const plainRed = redByExtent(plain);
    const clipRed = redByExtent(clipped);
    const reading = (m) => m && { unforced: m.unforced, forced: m.forced };
    calibration.push({
      width,
      sawInjectedOverflow: plainRed && clipRed && clipHidUnforced,
      plainRed,
      clipRed,
      clipHidUnforced,
      plain: reading(plain),
      clipped: reading(clipped),
    });
    rows.push(clean.value ?? { innerWidth: width, note: 'null measure' });
    if (width === 320) art = (await session.evaluate(ART)).value ?? { note: 'null art measure' };
  }

  // Verdict 6. A different URL first, so the navigation into / is a plain one, never a same-URL
  // navigation the browser may turn into a reload (on which the module hides nothing by design).
  const reveal = [];
  for (const width of REVEAL_WIDTHS) {
    await session.setWidth(width, 844);
    await session.nav('about:blank');
    await session.nav(`${BASE}/`);
    const load = (await session.evaluate(REVEAL_LOAD)).value ?? { note: 'null reveal measure' };
    const calibration = (await session.evaluate(REVEAL_CALIBRATE)).value ?? { note: 'null calibration' };
    const scrolled = (await session.evaluate(REVEAL_SCROLL)).value ?? { note: 'null scroll measure' };
    reveal.push({ width, load, calibration, scrolled });
  }
  const revealReduced = reveal.every((r) => r.load.reducedMotionMatches);
  const expectedTranslate = revealReduced ? 'none' : '0px 16px';
  const revealVerdict = {
    lane: revealReduced ? 'reduced' : 'normal',
    voidUnlessPlainNavigation: reveal.every((r) => r.load.navigationType === 'navigate' && r.load.innerWidth === r.width),
    detectorCalibrated: reveal.every((r) => r.calibration.planted > 0 && r.calibration.seen >= r.calibration.planted && r.calibration.cleanAfter === 0),
    belowFoldSectionPending: reveal.every((r) => r.load.target !== null),
    pendingFormForLane: reveal.every((r) => r.load.pendingForm?.opacity === '0' && r.load.pendingForm?.translate === expectedTranslate),
    nothingAboveFoldPending: reveal.every((r) => (r.load.aboveFold ?? []).length === 0),
    neverOnAdHeroOrStage: reveal.every((r) => (r.load.excluded ?? []).length === 0 && (r.scrolled.excluded ?? []).length === 0),
    revealedOnScroll: reveal.every((r) => r.scrolled.sawIn === true && r.scrolled.opacity === '1' && r.scrolled.cleanedUp === true),
    nothingInViewLeftPending: reveal.every((r) => r.scrolled.stuckInView === 0),
  };

  const widthVerdicts = WIDTHS.map((w, i) => ({
    width: w,
    innerWidthReported: rows[i].innerWidth,
    voidUnlessEqual: rows[i].clientWidth === w,
    noSidewaysScroll: noScroll(rows[i]),
    forced: rows[i].forced ?? null,
    overflowDiagnostic: { count: rows[i].overflowCount ?? null, sample: rows[i].overflowSample ?? null },
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
      overflowDetectorCalibration: calibrationClean ? `plain and root-clip legs red on all ${WIDTHS.length} widths` : 'CALIBRATION FAILED',
      motion: motionVerdict,
      scrollReveal: revealVerdict,
    },
    widthVerdicts,
    art,
    calibration,
    reveal,
    consoleErrors: session.consoleErrors,
  };
}
