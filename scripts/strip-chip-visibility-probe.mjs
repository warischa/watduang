// gh#184: proves in a REAL browser what strip-overflow-counter.test.mjs's own header says it cannot
// -- that the `+N` band is actually painted (non-zero size, not hidden, not transparent) whenever a
// chip is cut, and that the cut chip dissolves under the band instead of showing a naked partial
// glyph. The unit test only ever fed trailingOverflowCount plain {getBoundingClientRect} objects; this
// drives the three routes that mount the shared counter (short-stick, wire-snip-panic, zero-trigger)
// at real phone viewports with a real DOM.
//
// Roster: ten seats, all holding the LONGEST name in src/play/_mascots.ts (by grapheme-cluster
// count, read at run time so a future roster edit is picked up rather than a name typed into this
// file going stale), rendered with its own emoji in front -- the same "emoji name" shape
// src/shell/player-select.ts's defaultPlayers() builds, not a bare name narrower than a real seat.
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
// Imported, not assumed: the route-staleness block below reads the filesystem at module scope, and
// `fs` was an undeclared global there. `node -e` and the REPL expose builtin modules as globals, so
// an import smoke test written that way returns OK while `node driver.mjs <this file>` throws
// ReferenceError before a single page loads -- which is why this file could not have run as a leg.
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4321';
const CONTROL = !!process.env.CONTROL;
const BREAK_REACH = !!process.env.BREAK_REACH;
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

async function mascotEntries() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const src = await fs.readFile(
    path.join(import.meta.dirname, '..', 'src', 'play', '_mascots.ts'),
    'utf8',
  );
  const entries = [...src.matchAll(/emoji: '([^']+)', name: '([^']+)'/g)].map((m) => ({
    emoji: m[1],
    name: m[2],
  }));
  if (entries.length === 0) throw new Error('no mascot entries found -- _mascots.ts shape changed');
  return entries;
}

async function longestMascotName() {
  const entries = await mascotEntries();
  const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
  // Grapheme-cluster count, not code-point length. Thai combining vowels and tone marks stack onto
  // the preceding base consonant with zero advance width, so code-point length overstates a name's
  // visual width: two names can share a code-point length and still differ in clusters, and the one
  // with more clusters is the wider of the two -- which is why first-max-by-code-point picked a
  // narrower name than the cast contains. No winning name and no count is written here on purpose:
  // the roster owns that set, this function computes it live, and a name or a number pinned in a
  // comment rots on the next roster edit. This is still a proxy, never a measurement: only a
  // real render (see play-screen-fit-probe.mjs's own header) measures pixel width; grapheme-cluster
  // count merely tracks it better than code-point count did.
  const clusters = (s) => [...seg.segment(s)].length;
  return entries.reduce((a, b) => (clusters(b.name) > clusters(a.name) ? b : a)).name;
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

// The adversarial scroll walk, and why the boot position alone was not a measurement.
//
// A chip is only ever "naked" by the width of the sliver between its own left edge and the band's
// reach -- so the reading depends entirely on WHERE the strip happens to be scrolled. At first paint
// the chips sit at multiples of (chip width + gap), and whether the boundary chip lands barely-clipped
// (worst case, a full chip's width of sliver) or almost-fully-clipped (best case, nothing) is decided
// by arithmetic nobody chose. Measured while wiring this: with the chip cap removed and a 15-character
// name -- the longest the roster input accepts -- the boot position reported nakedCutCount 0 on all
// nine combinations, and so did a chip widened past the band's reach. A detector that answers 0 to
// the defect it exists to catch is not a detector, it is the scroll offset's opinion.
//
// So each chip's OWN barely-clipped position is visited: scrollLeft placed so that chip's right edge
// sits 1px past the strip's, which is the worst case for that chip by construction rather than by
// luck. The row's nakedCutCount is the worst reading over those positions and the boot one, which
// makes it a property of the layout instead of a property of where the strip stopped.
//
// The 1px inset is deliberate: a chip placed EXACTLY on the edge is the sub-pixel boundary
// docs/agents/browser-verification.md's trap 6 is about, and the counter's own 0.5px edge tolerance
// would classify it as not hidden at all.
const MEASURE_WORST_SCROLL = (stripId) => `
  const strip = document.getElementById(${JSON.stringify(stripId)});
  const counter = strip.querySelector('.strip-more');
  const kids = () => [...strip.children].filter((c) => c !== counter);
  const maxScroll = strip.scrollWidth - strip.clientWidth;
  // From measured rects and the CURRENT scrollLeft, never from offsetLeft/clientWidth: offsetLeft is
  // relative to the nearest positioned ancestor, which for a static strip is the page, and clientWidth
  // is the padding box while the check below reads the border box. Both errors move the target off the
  // one position that matters, and each of them reads as a clean walk. This form places the chip's
  // right edge 1px past the very edge the naked-cut test uses.
  const stripRight = () => strip.getBoundingClientRect().right;
  const positions = [...new Set(kids()
    // MINUS one, not plus: raising scrollLeft moves content toward the leading edge, so the offset
    // that puts a chip's right edge one pixel PAST the strip's is the gap minus a pixel. With the sign
    // flipped the chip lands one pixel INSIDE instead, is not clipped at all, and the row reports a
    // clean zero for a position that was never visited -- which is what it did on the first run here.
    .map((c) => Math.round(strip.scrollLeft + (c.getBoundingClientRect().right - stripRight()) - 1))
    .filter((p) => p > 0 && p <= maxScroll))];
  const readAt = () => {
    const edge = strip.getBoundingClientRect().right;
    const hidden = kids().filter((c) => c.getBoundingClientRect().right > edge + 0.5);
    const cs = getComputedStyle(counter);
    const cRect = counter.getBoundingClientRect();
    const bandVisible = cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
      && cRect.width > 0.5 && cRect.height > 0.5;
    const reach = cRect.left - (parseFloat(getComputedStyle(counter, '::before').width) || 0);
    const naked = bandVisible ? hidden.filter((c) => c.getBoundingClientRect().left < reach - 0.5) : hidden;
    // Slack (gh#210): how much margin the tightest hidden chip had before it would have become a
    // naked cut -- chipLeft - reach, over ALL hidden chips and not only the naked ones, so a clean
    // row still reports a real number instead of leaving this undefined on exactly the green runs
    // anyone reads. Negative means past the coverage edge. It is NOT an iff with "naked": that test
    // applies a further half-pixel tolerance, so a value in (-0.5, 0) is negative here and still not
    // a naked cut.
    //
    // NULL when the band is not visible, and that case is the load-bearing one. The control leg hides
    // the band with visibility, which PRESERVES its geometry, so "reach" stays a real coordinate
    // inside the strip while every off-edge chip sits to the right of it -- positive slack on all of
    // them, at the same time as "naked" counts all of them -- a summary line reporting failures and
    // healthy margin at once, on the one leg whose whole job is to fail. Slack is defined against the
    // band's coverage, so with no band there is no margin to report and the honest value is absent,
    // not positive.
    //
    // Measured on a green local suite run, 2026-09-07: the control leg reads checked=9 bad=8
    // minSlack=n/a. Eight and not nine because one of the nine combos has no hidden chip at all, so
    // there is nothing there to call a naked cut -- the same reason its slack is null and it is left
    // out of the minimum below.
    //
    // No backticks in this comment on purpose: it lives inside a template literal, and one closes it.
    const slack = bandVisible && hidden.length
      ? Math.min(...hidden.map((c) => c.getBoundingClientRect().left - reach))
      : null;
    return {
      bandVisible,
      n: hidden.length,
      naked: naked.length,
      worstPx: naked.length
        ? Math.max(...naked.map((c) => reach - c.getBoundingClientRect().left))
        : 0,
      slack,
    };
  };
  let worstNaked = 0;
  let worstPx = 0;
  let worstAt = null;
  let worstSlackPx = null; // the tightest (smallest) slack seen at any visited position
  for (const p of positions) {
    strip.scrollLeft = p;
    await new Promise((r) => setTimeout(r, 40));
    let m = readAt();
    // The band is shown and hidden by the module's own passive scroll listener, so a position read
    // before that listener ran can report the band hidden while chips really are clipped -- which
    // would be a false red, not a false green. One re-read settles it; a second would be the harness
    // arguing with itself.
    if (!m.bandVisible && m.n > 0) {
      await new Promise((r) => setTimeout(r, 120));
      m = readAt();
    }
    if (m.naked > worstNaked || (m.naked === worstNaked && m.worstPx > worstPx)) {
      worstNaked = m.naked;
      worstPx = m.worstPx;
      worstAt = p;
    }
    if (m.slack !== null && (worstSlackPx === null || m.slack < worstSlackPx)) {
      worstSlackPx = m.slack;
    }
  }
  strip.scrollLeft = 0;
  await new Promise((r) => setTimeout(r, 60));
  return {
    scrollPositionsWalked: positions.length,
    nakedAtWorstScroll: worstNaked,
    nakedWorstPx: +worstPx.toFixed(2),
    worstScrollLeft: worstAt,
    worstSlackPx: worstSlackPx === null ? null : +worstSlackPx.toFixed(2),
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

// Reads the narrowest player-name input cap out of the shipped source of the routes below, so the
// seed guard tracks those inputs instead of restating a number here that would rot the moment one of
// them changed. It THROWS when it finds no cap at all, on purpose: a guard that silently finds
// nothing is a guard that passes everything, and this one exists to stop a silent truncation.
async function seedNameCapUtf16() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const caps = [];
  for (const { id } of ROUTES) {
    const found = [];
    for (const base of ['main.js', 'main.ts']) {
      const src = await fs
        .readFile(path.join(import.meta.dirname, '..', 'src', 'play', id, base), 'utf8')
        .catch(() => null);
      if (!src) continue;
      for (const m of src.matchAll(/<input\b[^>]*maxlength="(\d+)"[^>]*>/gi)) {
        if (/name/i.test(m[0])) found.push(Number(m[1]));
      }
    }
    // PER ROUTE, not over the union. A union-only check fails open for exactly the case that will
    // happen: several routes in this repo already set the cap as a property assignment or an
    // interpolated attribute, neither of which this text read can see. If a route here adopted that
    // form, its own cap would vanish while the other routes kept the list non-empty, the minimum
    // would come from a route that is not the narrowest, and a smaller real cap would truncate the
    // seed and red as a clipped chip with no visible signal -- the misdiagnosis this guard exists to
    // prevent. So a route contributing nothing is an error about THAT route.
    if (!found.length) {
      throw new Error(
        `seed guard read no literal name-input maxlength for ${id}, so it cannot know that route's ` +
          `cap. It must not fall back on the other routes' caps. Read the cap from that route's own ` +
          `input, or widen this reader to the form that route now uses -- do not delete this check.`,
      );
    }
    found.forEach((n) => caps.push(n));
  }
  // Reached only when ROUTES itself is empty, which would otherwise make Math.min return Infinity
  // and wave every label through.
  if (!caps.length) {
    throw new Error('seed guard ran over an empty route set, so it proved nothing about any label.');
  }
  return Math.min(...caps);
}

export default async function (session) {
  const name = await longestMascotName();
  // Production's default seat label is the emoji and the name TOGETHER, one space between --
  // src/shell/player-select.ts's defaultPlayers() builds `${mascot.emoji} ${mascot.name}`. Seeding
  // the bare name alone is a narrower seat than any real one, so the roster mirrors that shape.
  const emoji = (await mascotEntries()).find((e) => e.name === name).emoji;
  const label = `${emoji} ${name}`;
  // ZERO-MARGIN GUARD, and the margin really is zero today. This label is exactly as long, in UTF-16
  // units, as the shortest name input among the routes below, and that route's roster-bridge
  // truncates with slice(0, maxLength). One more unit — a variation-selector emoji arriving in a
  // future roster edit — silently shortens the seed on whichever route caps below it, and the rows
  // for THAT route then red with "clipped chip with no visible signal": a false red carrying the
  // wrong diagnosis, on the very roster-change path this probe advertises that it tracks. Rows on
  // the wider-capped routes still pass, which is what makes such a failure read like a real defect
  // on one route rather than a seeding problem. Fail loudly here instead, naming the real cause.
  const cap = await seedNameCapUtf16();
  if (label.length > cap) {
    throw new Error(
      `seed label ${JSON.stringify(label)} is ${label.length} UTF-16 units but the narrowest name ` +
        `input this probe drives caps at ${cap}; on that route it would be truncated before render, ` +
        `so that route's clipping rows would describe a shorter name than the one this probe claims ` +
        `to seed, while the wider-capped routes' rows still passed. Widen that input deliberately or ` +
        `pick the seed against the new cap — do not relax this guard.`,
    );
  }
  const roster = JSON.stringify(Array.from({ length: 10 }, () => label));
  const results = [];

  for (const { id, stripId } of ROUTES) {
    const url = `${BASE}/game/${id}/play/`;

    // Fresh reload PER VIEWPORT, not once per route: a real player always meets this screen via a
    // fresh load, and what this probe measures is the band's rendered geometry AT each width, not its
    // behaviour ACROSS a width change.
    //
    // Do not read that as "a resize is not a real sequence" -- an earlier version of this comment
    // came close to saying so, and a rotation is exactly a width change with no reload. The resize
    // path has its own owner: the shared counter re-arms from a ResizeObserver over the boxes it
    // measures (gh#219). Proving THAT needs a setWidth with no nav, which is deliberately not what
    // happens here. So this probe's green does not cover rotation; it never performs one.
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
      // A SECOND, NARROWER mutant, hand-run and deliberately not a wired leg. CONTROL hides the band
      // outright, which makes every clipped chip naked by definition and therefore says nothing about
      // the geometry -- whether the reach really covers a chip. BREAK_REACH leaves the band painted and
      // takes away only the gradient's own inline size, which is the exact drift the shipped CSS makes
      // impossible by sizing the gradient FROM the chip cap. Run it to re-establish that the
      // naked-cut arithmetic can still see an uncovered sliver; a green here means the reach check has
      // gone inert even though the visibility check has not.
      if (BREAK_REACH) {
        await session.evaluate(`
          const s = document.createElement('style');
          s.textContent = '.strip-more::before { inline-size: 0 !important; }';
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

      // Between the two, so the walk starts from the boot position it just read and leaves the strip
      // back at 0 before the swipe measures the trailing end.
      const worst = await session.evaluate(MEASURE_WORST_SCROLL(stripId));
      if (worst.error) throw new Error(`${id} ${w}x${h}: worst-scroll evaluate failed: ${worst.error}`);

      const swipe = await session.evaluate(MEASURE_SWIPE(stripId));
      if (swipe.error) throw new Error(`${id} ${w}x${h}: swipe evaluate failed: ${swipe.error}`);
      if (SHOT_DIR) {
        await session.screenshot(`${SHOT_DIR}/${id}-${w}x${h}${CONTROL ? '-control' : ''}-swiped.png`);
      }

      results.push({ id, w, h, ...initial.value, ...worst.value, ...swipe.value });
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
      r.nakedAtWorstScroll > 0 ||
      // Liveness for the walk, and only where a walk was owed: a row with chips off the trailing edge
      // and zero positions visited reported its 0 without measuring anything. A row with nothing
      // hidden (the desktop rail, where the strip wraps) legitimately has no barely-clipped position.
      (r.n > 0 && !(r.scrollPositionsWalked > 0)) ||
      !r.lastSeatFullyVisible ||
      !(r.lastSeatName || '').includes(name),
  );

  // gh#210: the smallest width slack across every row that had a hidden chip to measure -- rows with
  // nothing hidden (e.g. the 1440px rail, which wraps instead of clipping) report a null slack and
  // are excluded here rather than pulling the minimum toward a value that measured nothing.
  const slacks = results.map((r) => r.worstSlackPx).filter((v) => typeof v === 'number');
  const minSlackPx = slacks.length ? Math.min(...slacks) : null;
  const out = { control: CONTROL, breakReach: BREAK_REACH, seededName: name, checked: results.length, bad: bad.length, minSlackPx, results, badRows: bad };
  // Throwing is the point on a NORMAL run: driver.mjs turns a throw into a non-zero exit, so a clipped
  // chip is a red leg rather than a line of JSON nobody reads. On the CONTROL run it is the opposite --
  // the run must reach here and REPORT what it found, because a non-zero exit is equally what a
  // watchdog kill, a dead Chrome or a page that never loaded looks like. The control's verdict is the
  // JSON below, judged in scripts/ci-probes-verdict.mjs, so a detector that was never exercised cannot
  // pass by exiting quietly. Same shape as narrow-overflow-probe.mjs, deliberately.
  if (bad.length > 0 && !CONTROL && !BREAK_REACH) {
    throw new Error(`clipped chip with no visible signal on ${bad.length} row(s): ${JSON.stringify(bad)}`);
  }
  return out;
}
