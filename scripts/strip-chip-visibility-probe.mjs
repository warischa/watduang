// gh#184: proves in a REAL browser what strip-overflow-counter.test.mjs's own header says it cannot
// -- that the `+N` band is actually painted (non-zero size, not hidden, not transparent) whenever a
// chip is cut, and that the cut chip dissolves under the band instead of showing a naked partial
// glyph. The unit test only ever fed trailingOverflowCount plain {getBoundingClientRect} objects; this
// drives the three routes that mount the shared counter (short-stick, wire-snip-panic, zero-trigger)
// at real phone viewports with a real DOM.
//
// Roster: ten seats, all holding the LONGEST name in src/play/_mascots.ts (by codepoint count, read
// at run time so a future roster edit is picked up rather than a name typed into this file going
// stale) -- the worst case for chip width, not today's shortest-name lucky pass.
//
// Usage: BASE=http://localhost:4321 CDP_PORT=9222 node scripts/driver.mjs scripts/strip-chip-visibility-probe.mjs
// CONTROL=1 injects a mutant stylesheet that force-hides the band (`.strip-more{visibility:hidden}`)
// AFTER the strip has real overflow -- this is "a chip is clipped with no visible signal" made real,
// not simulated. The assertion logic itself is identical on both runs; only the mutant differs. A
// normal run must exit 0 (driver.mjs propagates a thrown error as a non-zero exit; see its own header).
//
// WHAT THIS CANNOT SEE: it measures the STRIP's own scroll container only. A chip that itself became
// an inner scroller (its OWN scrollWidth > clientWidth, e.g. a name too long even for the chip) would
// clip text with no signal from this check -- trailingOverflowCount and this probe both look at chip
// vs. STRIP geometry, never chip vs. its own content box. No route currently nests a scroller inside a
// chip; if one ever does, this check is blind to it and a chip-level scrollWidth/clientWidth probe
// would need to be added alongside this one, not folded into it.
const BASE = process.env.BASE || 'http://localhost:4321';
const CONTROL = !!process.env.CONTROL;
const SHOT_DIR = process.env.SHOT_DIR || null;
// `ONLY=<route>:<width>` restricts the walk to one route+viewport -- used to demonstrate the
// mutant/restore red-green pair on a single combo without the run time or noise of all six.
const ONLY = process.env.ONLY || null;

// The routes with a scrolling player strip. This is a HAND LIST, and a hand list of an open set goes
// stale the moment a fourth route mounts the counter -- silently, because an uncovered route produces
// no row and no row produces no finding. The assertion below turns that silence into a red: the number
// of routes here must equal the number of modules that actually call the shared mount.
const ALL_ROUTES = [
  { id: 'short-stick', stripId: 'draw-player-strip' },
  { id: 'wire-snip-panic', stripId: 'hud-player-strip' },
  { id: 'zero-trigger', stripId: 'game-player-strip' },
];
{
  const playDir = new URL('../src/play/', import.meta.url);
  const callers = fs
    .readdirSync(playDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) =>
      ['main.js', 'main.ts'].some((n) => {
        const f = new URL(`${e.name}/${n}`, playDir);
        return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('mountStripOverflowCounter');
      }),
    )
    .map((e) => e.name)
    .sort();
  const listed = ALL_ROUTES.map((r) => r.id).sort();
  if (callers.join(',') !== listed.join(',')) {
    throw new Error(
      `this probe's route list is stale: it covers [${listed.join(', ')}] but [${callers.join(', ')}] mount the shared strip counter -- an uncovered route is measured by nothing and reports no finding`,
    );
  }
}
const ALL_VIEWPORTS = [
  [320, 568],
  [390, 844],
  [1440, 900],
];
const ROUTES = ONLY ? ALL_ROUTES.filter((r) => r.id === ONLY.split(':')[0]) : ALL_ROUTES;
const VIEWPORTS = ONLY
  ? ALL_VIEWPORTS.filter(([w]) => String(w) === ONLY.split(':')[1])
  : ALL_VIEWPORTS;

async function longestMascotName() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const src = await fs.readFile(
    path.join(import.meta.dirname, '..', 'src', 'play', '_mascots.ts'),
    'utf8',
  );
  const names = [...src.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
  if (names.length === 0) throw new Error('no mascot names found -- _mascots.ts shape changed');
  // First occurrence at the max length, computed here rather than typed by hand.
  return names.reduce((a, b) => ([...b].length > [...a].length ? b : a));
}

// Split in two so a screenshot can be taken BETWEEN them: MEASURE_INITIAL reads the band at the
// screen's real first-paint scroll position (screenshot here proves deliverable 1 -- is the band
// visible); MEASURE_SWIPE then scrolls to the end and reads the last seat (screenshot here proves
// deliverable 2 -- is the last seat reachable and fully visible). A single evaluate that did both and
// read the band's text only at the END would be reading it AFTER the swipe recomputed it to the
// post-scroll value -- caught live in this session, not a defect in the app.
const MEASURE_INITIAL = (stripId) => `
  const strip = document.getElementById(${JSON.stringify(stripId)});
  if (!strip) return { missing: true };
  const edge = strip.getBoundingClientRect().right;
  const counter = strip.querySelector('.strip-more');
  const kids = [...strip.children].filter((c) => c !== counter);
  const hidden = kids.filter((c) => c.getBoundingClientRect().right > edge + 0.5);
  const cs = counter ? getComputedStyle(counter) : null;
  const cRect = counter ? counter.getBoundingClientRect() : null;
  const bandVisible = !!counter && !!cRect
    && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
    && cRect.width > 0.5 && cRect.height > 0.5;
  // The counter's OWN box (cRect) is only the solid opaque pill -- the fade sits in its ::before,
  // which is absolutely positioned to the pill's left (inset-inline-end: 100%) and therefore never
  // widens cRect itself, no matter how wide the pseudo is. Checking a chip's left edge against
  // cRect.left alone (an earlier version of this probe did exactly that) flags EVERY partially
  // visible chip as naked regardless of the gradient's own reach -- a check no CSS width change on
  // the pseudo could ever satisfy. Read the pseudo's real rendered width and cover it too: the total
  // dissolve reach is the solid pill PLUS the gradient's own inline-size in front of it.
  const beforeWidthPx = counter ? (parseFloat(getComputedStyle(counter, '::before').width) || 0) : 0;
  const bandLeftEdge = cRect ? cRect.left - beforeWidthPx : null;
  // A hidden chip "dissolves" only if the sliver that would otherwise show naked (from the chip's own
  // left edge up to where the covered reach starts) is entirely covered by the pill+gradient -- i.e.
  // the chip's left edge is already at or past that combined reach's own left edge. If the band is
  // not rendered at all, every hidden chip is a naked cut by definition.
  const nakedCuts = bandVisible
    ? hidden.filter((c) => c.getBoundingClientRect().left < bandLeftEdge - 0.5)
    : hidden;
  return {
    innerWidth: window.innerWidth,
    n: hidden.length,
    counterText: counter ? counter.textContent : null,
    textMatchesN: counter ? counter.textContent === ('+' + hidden.length) : null,
    bandVisible,
    bandRect: cRect ? { w: cRect.width, h: cRect.height } : null,
    beforeWidthPx,
    nakedCutCount: nakedCuts.length,
    scrollWidth: strip.scrollWidth,
    clientWidth: strip.clientWidth,
  };
`;

const MEASURE_SWIPE = (stripId) => `
  const strip = document.getElementById(${JSON.stringify(stripId)});
  const counter = strip.querySelector('.strip-more');
  // Swipe to the physical end, exactly as a player's thumb would, and check the ruling's own claim:
  // every seat stays reachable and fully visible there (no name trapped behind the band).
  strip.scrollLeft = strip.scrollWidth;
  await new Promise((r) => setTimeout(r, 300));
  const edgeAfter = strip.getBoundingClientRect().right;
  const kidsAfter = [...strip.children].filter((c) => c !== counter);
  const last = kidsAfter[kidsAfter.length - 1];
  const lastRect = last.getBoundingClientRect();
  const nAfter = kidsAfter.filter((c) => c.getBoundingClientRect().right > edgeAfter + 0.5).length;
  return {
    lastSeatFullyVisible: lastRect.right <= edgeAfter + 0.5 && lastRect.left >= strip.getBoundingClientRect().left - 0.5,
    lastSeatName: (last.textContent || '').trim(),
    nAtMaxScroll: nAfter,
  };
`;

export default async function (session) {
  const name = await longestMascotName();
  const roster = JSON.stringify(Array.from({ length: 10 }, () => name));
  const results = [];

  for (const { id, stripId } of ROUTES) {
    const url = `${BASE}/game/${id}/play/`;

    // Fresh reload PER VIEWPORT, not once per route: the shared counter has no ResizeObserver (by
    // design, see _strip-overflow.ts's own header), so reusing one page load across two setWidth()
    // calls would read the FIRST viewport's frozen band value at the SECOND viewport -- a harness
    // bug, not a product one. A real player also always meets this screen via a fresh load.
    for (const [w, h] of VIEWPORTS) {
      await session.setWidth(w, h);
      await session.nav(url);
      await session.wipe();
      await session.evaluate(`
        localStorage.setItem('watduang:roster', ${JSON.stringify(roster)});
        localStorage.setItem('watduang:group', ${JSON.stringify(roster)});
        return true;`);
      // Re-apply the emulated width BEFORE this reload, not after: roster-bridge's seedFromRoster()
      // (and the FIRST mountStripOverflowCounter call inside it) runs synchronously on THIS reload's
      // own DOMContentLoaded, so the width must already be correct when this nav() starts, or the
      // very first render measures the wrong viewport and freezes a wrong band value nothing later
      // corrects (confirmed live: applying setWidth AFTER this nav instead produced a deterministic,
      // per-route-and-viewport-specific wrong count, not a timing flake).
      await session.setWidth(w, h);
      await session.nav(url); // reload so roster-bridge seeds and auto-starts at boot
      const check = await session.evaluate('return window.innerWidth;');
      if (check.value !== w) throw new Error(`${id} ${w}x${h}: innerWidth read ${check.value} after reload -- run is void`);
      await new Promise((r) => setTimeout(r, 1500)); // bridge clicks + ARM_DELAY_MS settle

      if (CONTROL) {
        await session.evaluate(`
          const s = document.createElement('style');
          s.textContent = '.strip-more { visibility: hidden !important; }';
          document.head.appendChild(s);
          return true;`);
      }

      await session.evaluate(`
        document.getElementById(${JSON.stringify(stripId)}).scrollIntoView({ block: 'center' });
        return true;`);
      await new Promise((r) => setTimeout(r, 300));

      const initial = await session.evaluate(MEASURE_INITIAL(stripId));
      if (initial.error) throw new Error(`${id} ${w}x${h}: initial evaluate failed: ${initial.error}`);
      if (SHOT_DIR) {
        await session.screenshot(`${SHOT_DIR}/${id}-${w}x${h}${CONTROL ? '-control' : ''}.png`);
      }

      const swipe = await session.evaluate(MEASURE_SWIPE(stripId));
      if (swipe.error) throw new Error(`${id} ${w}x${h}: swipe evaluate failed: ${swipe.error}`);
      if (SHOT_DIR) {
        await session.screenshot(`${SHOT_DIR}/${id}-${w}x${h}${CONTROL ? '-control' : ''}-swiped.png`);
      }

      results.push({ id, w, h, ...initial.value, ...swipe.value });
    }
  }

  // `seededName` only proves the longest name was COMPUTED, never that it reached the page. If the
  // roster handoff changes key or shape the page boots on its short numbered defaults, which may not
  // overflow far enough to exercise the reaches this probe is here to check -- and the control would
  // still redden on those short names, so the pair would stay green while measuring the wrong roster.
  // Requiring the seeded name to appear in the rendered chip closes that: `includes` rather than
  // equality because a chip's text carries the seat's emoji alongside the name.
  const bad = results.filter(
    (r) =>
      r.missing ||
      (r.n > 0 && !r.bandVisible) ||
      r.nakedCutCount > 0 ||
      !r.lastSeatFullyVisible ||
      !(r.lastSeatName || '').includes(name),
  );

  const out = { control: CONTROL, seededName: name, checked: results.length, bad: bad.length, results, badRows: bad };
  // Throwing is the point on a NORMAL run: driver.mjs turns a throw into a non-zero exit, so a clipped
  // chip is a red leg rather than a line of JSON nobody reads. On the CONTROL run it is the opposite --
  // the run must reach here and REPORT what it found, because a non-zero exit is equally what a
  // watchdog kill, a dead Chrome or a page that never loaded looks like. The control's verdict is the
  // JSON below, judged in scripts/ci-probes-verdict.mjs, so a detector that was never exercised cannot
  // pass by exiting quietly. Same shape as narrow-overflow-probe.mjs, deliberately.
  if (bad.length > 0 && !CONTROL) {
    throw new Error(`clipped chip with no visible signal on ${bad.length} row(s): ${JSON.stringify(bad)}`);
  }
  return out;
}
