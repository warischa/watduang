// gh#88 committed browser probe — the ticket's own boxes, measured in a real browser, not read
// from the CSS (docs/agents/browser-verification.md). Run against a real build:
//
//   npm run build && npx serve dist/ -l 4321
//   Chrome: --remote-debugging-port=9222
//   node scripts/driver.mjs scripts/category-pop-probe.mjs
//
// The same committed shape the home page uses (home-direction-c-probe.mjs); this probe drives the
// two category pages. Verdicts:
//   1. NO_SIDEWAYS_SCROLL at 320px and 390px on BOTH /c/fortune/ and /c/party/ — each run reports
//      innerWidth equal to what was asked (a run that does not is void, not a pass), scrollWidth
//      === clientWidth, and zero elements whose right edge passes the viewport edge. Calibrated per
//      width and per page: a deliberately overflowing element injected before each measurement must
//      flip the detector red, or the run fail-louds — a detector that cannot see the overflow it
//      exists to catch measures nothing.
//   2. ACCENTS — the header block (-cat-head) on each page resolves to a DIFFERENT computed
//      background colour, read from getComputedStyle rather than from the stylesheet: fortune
//      rgb(255, 210, 127) (--accent-gold #ffd27f) and party rgb(248, 152, 128) (--accent-punch
//      #f89880), the two canvas accents.
//   3. AD HEIGHTS — the billboard slot and the rail slot reserve their height at 1440px (the
//      artboard's own width; the rail only exists there), and below the 1100px the artboard names
//      the rail is not rendered at all (absent, not merely unstuck) while the billboard keeps its
//      height at phone widths.
const BASE = process.env.BASE || 'http://localhost:4321';
const PAGES = ['fortune', 'party'];

const ACCENT_RGB = { fortune: 'rgb(255, 210, 127)', party: 'rgb(248, 152, 128)' };

// One evaluate body, returned raw so both pages' rows are comparable. `return` is load-bearing:
// driver.mjs wraps the body in an async function, an expression without it reads back as null
// (runbook trap).
const MEASURE = `
  const doc = document.documentElement;
  const over = [...document.querySelectorAll('body *')]
    .map((el) => ({
      cls: (el.className && String(el.className).slice(0, 60)) || el.tagName,
      right: el.getBoundingClientRect().right,
    }))
    .filter((e) => e.right > doc.clientWidth + 0.5);
  const head = document.querySelector('.cat-head');
  const slots = [...document.querySelectorAll('.ad-slot')].map((el) => ({
    cls: String(el.className),
    height: Math.round(el.getBoundingClientRect().height),
  }));
  const rail = document.querySelector('.ad-rail');
  return {
    innerWidth: window.innerWidth,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    overflowCount: over.length,
    overflowSample: over.slice(0, 4),
    headBg: head ? getComputedStyle(head).backgroundColor : null,
    railRendered: !!rail,
    railDisplay: rail ? getComputedStyle(rail).display : null,
    slots,
  };
`;

export default async function (session) {
  const rows = [];
  const calibration = [];
  for (const slug of PAGES) {
    for (const width of [320, 390]) {
      await session.setWidth(width, 844);
      await session.nav(`${BASE}/c/${slug}/`);
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
      // reload — measuring the post-expansion layout would report a false clean pass.
      await session.nav(`${BASE}/c/${slug}/`);
      const clean = await session.evaluate(MEASURE);
      calibration.push({ slug, width, sawInjectedOverflow: injected.value.overflowCount > 0 });
      rows.push({ slug, width, ...clean.value });
    }
    await session.setWidth(1440, 844);
    await session.nav(`${BASE}/c/${slug}/`);
    const wide = await session.evaluate(MEASURE);
    rows.push({ slug, width: 1440, ...wide.value });
  }

  const at = (slug, width) => rows.find((r) => r.slug === slug && r.width === width);
  const noScroll = (r) => r.scrollWidth === r.clientWidth && r.overflowCount === 0;
  const narrow = PAGES.flatMap((slug) => [320, 390].map((width) => ({ slug, width, r: at(slug, width) })));
  const desktop = PAGES.map((slug) => at(slug, 1440));

  const calibrationClean = calibration.every((c) => c.sawInjectedOverflow);

  const accentVerdict = {
    fortuneComputed: at('fortune', 1440).headBg,
    partyComputed: at('party', 1440).headBg,
    accentsDiffer: at('fortune', 1440).headBg !== at('party', 1440).headBg,
    matchesCanvas:
      ACCENT_RGB.fortune === at('fortune', 1440).headBg &&
      ACCENT_RGB.party === at('party', 1440).headBg,
  };

  const slotOf = (r, clsPart) => r.slots.find((s) => s.cls.includes(clsPart));
  const heightVerdict = desktop.map((r) => ({
    slug: r.slug,
    railRenderedAt1440: r.railRendered && r.railDisplay !== 'none',
    billboardHeight: slotOf(r, 'ad-billboard') ? slotOf(r, 'ad-billboard').height : null,
    railSlotHeight: slotOf(r, 'ad-rail-slot') ? slotOf(r, 'ad-rail-slot').height : null,
  }));

  return {
    verdict: {
      noSidewaysScroll320: narrow.filter((n) => n.width === 320).every((n) => n.r.innerWidth === 320 && noScroll(n.r)),
      noSidewaysScroll390: narrow.filter((n) => n.width === 390).every((n) => n.r.innerWidth === 390 && noScroll(n.r)),
      railAbsentBelow1100: narrow.every((n) => !n.r.railRendered || n.r.railDisplay === 'none'),
      billboardReservesHeightAt1440: heightVerdict.every((h) => h.billboardHeight >= 250),
      railReservesHeightAt1440: heightVerdict.every((h) => h.railRenderedAt1440 && h.railSlotHeight >= 250),
      accent: accentVerdict,
      overflowDetectorCalibration: calibrationClean ? 'red-then-clean on every width and page' : 'CALIBRATION FAILED',
    },
    narrow,
    heightVerdict,
    calibration,
    consoleErrors: session.consoleErrors,
  };
}