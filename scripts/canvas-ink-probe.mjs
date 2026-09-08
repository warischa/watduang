// gh#224 — does EVERY 2D-canvas play route actually put ink on its own backing store?
//
// THE INVARIANT, one sentence: every play route the manifest declares `renderer: 'canvas2d'` either
// reaches a screen where its canvas holds ink -- painted pixels, in more than one colour, read back
// out of that route's own backing store -- or is a route this repo has recorded as one whose canvas
// only paints on an outcome a generic walk cannot force, and whose render loop is still alive.
//
// THE ROUTE LIST IS DERIVED, NEVER HAND-MAINTAINED (owner ruling 2026-09-08 on gh#224). A hand list
// is a list someone forgets to update: a 2D route added without an entry goes untested while the leg
// stays green, which is the silent-success shape of gh#221 and gh#223. So the list is the manifest,
// imported and filtered at run time on the `renderer` field, and
// scripts/renderer-declaration.test.mjs reconciles that field against an independent read of each
// route's source in both directions -- a derived list is only as honest as the field it filters on.
//
// THE PREDICATE IS ONE THIS REPO OWNS, and it is deliberately NOT a frame rate (ADR-0056, ADR-0063):
// a frame count in a fixed window is a number the browser's compositor and the host machine own.
// Coverage and distinct colours are pixels this route wrote into a buffer it allocated. The coverage
// floor is "more than zero painted pixels", NOT a magnitude, and that is the same ownership argument
// rather than a soft threshold: HOW MUCH of a particle canvas is covered at the instant a sample
// lands is owned by particle count and timing, while WHETHER any paint ever landed is owned here.
// wire-snip-panic measured 0.0027 coverage with 13 distinct colours over 1156 real fill() calls --
// unmistakably drawing, and under any magnitude floor a false red.
//
// THREE OUTCOMES PER ROUTE, and the third is the reason a load-only probe would not do here. The
// WebGL lane enumerates by getContext and reads back at load, which works because those routes draw
// at mount. 2D routes do not: timebomb's game screen is `hidden` in its own markup until the round
// starts, and several routes' only canvas is a particle layer that is legitimately empty except
// during a burst.
//
//   DREW        the route made real paint calls and ink landed         -> route passes
//   BLANK       the route made real paint calls and NOTHING landed     -> route fails
//   UNMEASURED  no visible canvas, no paint call at all, or a throw    -> not a pass, see below
//
// WHAT SEPARATES BLANK FROM UNMEASURED IS A COUNT OF THE ROUTE'S OWN PAINT CALLS, not a guess. The
// recorder wraps the 2D context's eight paint primitives and counts them per route. A route whose
// loop ran 596 clearRect calls and zero paint calls did not draw a blank frame -- it never got to a
// moment where it draws anything, and calling that BLANK would send the next reader hunting a
// rendering bug that does not exist. clearRect is counted separately and never stubbed, because it
// is the signal that the render loop is alive at all.
//
// UNMEASURED IS NOT A PASS, and this is where the leg would otherwise go green measuring nothing.
// Every derived route must land in exactly one of two sets: it DREW, or its id is in RECORDED_IDLE
// below with a reason and a live render loop. The two sets are gated equal to the derived list in
// BOTH directions, so a forgotten entry cannot produce a green: a new 2D route either draws (no
// entry needed) or falls in neither set and reds. A route that used to draw and stops reds the same
// way. That is the recorded-set shape scripts/play-screen-fit-probe.mjs already uses for a measured
// row, and it is what keeps the owner's ruling in substance -- the WALK list is derived from the
// manifest, and the expectations that could rot are gated against it rather than trusted.
//
// SAMPLING RUNS IN THE PAGE, not over CDP. A canvas cleared every frame is only inked between two
// frames, so one readback per press would miss it; and per-sample CDP round trips would put the
// driver's own latency inside the measurement (docs/agents/shell-traps.md). The recorder is
// installed BEFORE the document's own script (session.onNewDocument) and keeps a running MAXIMUM,
// so any inked moment during the walk counts.
//
//   npx serve dist -l 4322
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --no-sandbox \
//     --remote-debugging-port=9592 --user-data-dir=/tmp/prof-ink about:blank &
//   BASE=http://localhost:4322 CDP_PORT=9592 node scripts/driver.mjs scripts/canvas-ink-probe.mjs
//
// CALIBRATION IS A LEG, not a manual step. Probes driven by ci-probes.sh sit outside this repo's
// gate meta-audit, so the control leg IS the calibration -- there is nothing else to prove this leg
// can go red. INK_STUB=1 no-ops the eight paint primitives before the page runs and leaves the
// counting wrapper OUTSIDE the stub, so the calls are still counted while nothing lands: every route
// that draws must then report BLANK, and the control fails if any of them still reports DREW. The
// RECORDED_IDLE routes report UNMEASURED on both legs, which is what makes the two legs comparable.
//
// KNOBS: INK_STUB=1 (the control) · ROUTES_ONLY=a,b (debug subset; prints that it is one, and the
// set checks stand down because a subset cannot speak for the set) · INK_NO_PRESS=1 (walk nothing --
// strands routes whose canvas is hidden at setup, which is how the "no visible canvas" UNMEASURED is
// demonstrated rather than asserted).
import { games } from '../src/games/manifest.ts';

/** The renderer values src/games/types.ts allows. Exported so the reconcile test pins the set here
 *  rather than retyping it -- a fourth renderer added to the type and not here would otherwise pass
 *  the type check and silently never be classified. */
export const RENDERERS = ['canvas2d', 'webgl', 'dom'];

/** THE ONE ROUTE-ENUMERATION EXPRESSION for this leg. Takes the manifest as an argument so the
 *  reconcile test can bucket the same input the walk uses. A route with no playRoute has no page of
 *  its own to walk (siamsi and daily-fortune render inside #stage), so `renderer` alone is not the
 *  filter -- but the bucket check in that test is over the WHOLE manifest, unfiltered, so a route
 *  dropped here is dropped on a stated ground rather than silently. */
export const canvas2dRouteIds = (list = games) =>
  list.filter((g) => g.renderer === 'canvas2d' && g.playRoute).map((g) => g.id).sort();

/**
 * Routes whose 2D canvas is a particle layer that paints ONLY on a specific in-round outcome, which
 * a walk carrying no per-route knowledge cannot force. Each entry names the trigger, read out of the
 * route's own source rather than guessed from the canvas id. An entry buys exactly one thing: the
 * route may report UNMEASURED instead of DREW. It still has to prove its render loop is alive
 * (clearRect > 0), so a killed loop cannot hide behind the record.
 *
 * REMOVING an entry is the good direction and needs no ceremony: if the walk ever does reach the
 * burst, the route reports DREW and this record reds as stale. Adding one is a claim about a route,
 * and the reason has to cite the trigger.
 */
export const RECORDED_IDLE = new Map([
  ['freeze-tap', 'spawnShockParticles fires on a real pointer tap carrying coordinates (the false-start and valid-tap paths) and spawnConfetti only at FINAL_RESULTS; a synthetic click on the largest button reaches neither'],
  ['how-close-is-near', 'fx.burst is called only from the #btnDoReveal handler, several player turns into a round'],
  ['power-meter', 'spawnSparkles fires only on a locked score of 1000, >=800 or <=200 -- a scoring outcome the walk cannot aim for'],
]);

/** Distinct quantised colours a canvas must show to count as inked. A solid single-colour fill would
 *  pass a coverage-only test while proving that no palette, no alpha fade and no per-particle size
 *  ever ran -- the reason the per-route hand probes counted colours too. */
export const INK_COLOUR_FLOOR = 2;

/** (what the walk saw on one route) -> one of the three verdicts. Pure, and pinned by
 *  scripts/canvas-ink-probe.test.mjs without a browser: this mapping is the whole product of the
 *  leg, and it must not be provable only by the apparatus it governs. */
export function classify({ canvasSeen, paintCalls = 0, coverage = null, colours = null, readbackError = null }) {
  if (readbackError) {
    return { verdict: 'UNMEASURED', reason: `the readback threw: ${readbackError}` };
  }
  if (canvasSeen !== true) {
    return { verdict: 'UNMEASURED', reason: 'no visible canvas on any screen the walk reached -- this route was never measured, which is not the same as measured blank' };
  }
  if (!paintCalls) {
    return { verdict: 'UNMEASURED', reason: 'a visible canvas, and not one paint call on it during the whole walk -- the walk never reached a moment this route draws' };
  }
  if (coverage === null || colours === null) {
    return { verdict: 'UNMEASURED', reason: 'paint calls were made but no sample was ever recorded' };
  }
  if (coverage > 0 && colours >= INK_COLOUR_FLOOR) {
    return { verdict: 'DREW', reason: `${paintCalls} paint call(s), coverage ${coverage.toFixed(4)}, ${colours} distinct colours` };
  }
  return { verdict: 'BLANK', reason: `${paintCalls} paint call(s) and nothing landed: coverage ${coverage.toFixed(4)}, ${colours} distinct colours (floor ${INK_COLOUR_FLOOR})` };
}

/**
 * The leg-level verdict. Returns a list of complaint strings -- empty means green.
 *
 * `full` says whether these rows are the whole derived set. A ROUTES_ONLY subset is judged row by
 * row and the set checks stand down, because a subset that reported "every route is accounted for"
 * would be the vacuous green this leg exists to prevent.
 */
export function judge(rows, { stubbed, derivedIds = null, full = true }) {
  const bad = [];
  const want = stubbed ? 'BLANK' : 'DREW';
  for (const r of rows) {
    const recorded = RECORDED_IDLE.has(r.id);
    if (r.verdict === 'UNMEASURED') {
      if (!recorded) {
        bad.push(`${r.id}: UNMEASURED and not recorded as an idle-canvas route -- ${r.reason}. If this route stopped drawing, that is the regression; if it never could here, record it in RECORDED_IDLE with the trigger.`);
      } else if (!r.clearCalls) {
        bad.push(`${r.id}: recorded as an idle-canvas route, but its render loop made no clearRect call either -- the loop is dead, which the record does not excuse.`);
      }
      continue;
    }
    if (recorded) {
      bad.push(`${r.id}: reported ${r.verdict} while RECORDED_IDLE says its canvas cannot be reached by this walk -- the record is stale, drop the entry.`);
      continue;
    }
    if (r.verdict !== want) {
      bad.push(`${r.id}: reported ${r.verdict} on the ${stubbed ? 'control' : 'clean'} leg, expected ${want} -- ${r.reason}`);
    }
  }
  if (full && derivedIds) {
    const walked = new Set(rows.map((r) => r.id));
    for (const id of derivedIds) {
      if (!walked.has(id)) bad.push(`${id}: derived from the manifest as a 2D route and never walked -- a route no leg owns is a route nothing measures.`);
    }
    for (const id of RECORDED_IDLE.keys()) {
      if (!derivedIds.includes(id)) bad.push(`${id}: RECORDED_IDLE names it and the manifest no longer derives it as a 2D play route -- drop the entry.`);
    }
  }
  return bad;
}

// ---- the in-page recorder ------------------------------------------------------------------------
// No backticks anywhere inside these template literals -- a backtick in a comment closes the Node
// template and the prose after it is evaluated as Node expressions (the trap play-screen-fit-probe's
// header already records).
const SAMPLE_MS = 150;
const PAINT_METHODS = ['fill', 'fillRect', 'stroke', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'putImageData'];
// arc/ellipse are deliberately NOT in that list: they build a path and paint nothing, so counting
// them would let a route that builds a path and never fills it read as one that drew.

const recorder = (stub) => `
(() => {
  const P = CanvasRenderingContext2D.prototype;
  const state = { canvasSeen: false, coverage: null, colours: null, paintCalls: 0, clearCalls: 0, readbackError: null, samples: 0 };
  window.__ink = state;
  ${stub ? `
  // The control, and it is installed FIRST so the counting wrapper below wraps the no-op rather than
  // the other way round. Order is load-bearing: a stub applied over the counter would replace it,
  // every route would report zero paint calls, and the control would read UNMEASURED everywhere --
  // a calibration that calibrates nothing. clearRect is left alive on purpose: the control proves the
  // detector can see an unpainted canvas, not that something erases one.
  for (const m of ${JSON.stringify(PAINT_METHODS)}) {
    if (typeof P[m] === 'function') P[m] = function () {};
  }
  ` : ''}
  for (const m of ${JSON.stringify(PAINT_METHODS)}) {
    const orig = P[m];
    if (typeof orig !== 'function') continue;
    P[m] = function (...args) { state.paintCalls++; return orig.apply(this, args); };
  }
  const origClear = P.clearRect;
  P.clearRect = function (...args) { state.clearCalls++; return origClear.apply(this, args); };
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const sample = () => {
    for (const c of document.querySelectorAll('canvas')) {
      if (!c.width || !c.height || !visible(c)) continue;
      state.canvasSeen = true;
      let ctx = null;
      try { ctx = c.getContext('2d'); } catch (e) { state.readbackError = String(e); continue; }
      if (!ctx) continue; // a WebGL canvas beside a 2D one: nothing to read here, and not an error
      let img;
      try { img = ctx.getImageData(0, 0, c.width, c.height).data; }
      catch (e) { state.readbackError = String(e); continue; }
      // Stride over the buffer rather than every pixel: this runs every ${SAMPLE_MS}ms beside the
      // game's own loop, and coverage is a SHARE, so a fixed stride changes the cost and not the
      // number. 4 pixels of stride = 1 sample in 4.
      const stride = 4 * 4;
      let painted = 0;
      let seen = 0;
      const colours = new Set();
      for (let i = 0; i < img.length; i += stride) {
        seen++;
        if (img[i + 3] > 8) {
          painted++;
          colours.add((img[i] >> 4) + ',' + (img[i + 1] >> 4) + ',' + (img[i + 2] >> 4) + ',' + (img[i + 3] >> 5));
        }
      }
      if (!seen) continue;
      const cov = painted / seen;
      // A running MAXIMUM over the whole walk: a canvas cleared every frame is inked only between
      // two frames, so the last reading is not the measurement -- the best one is.
      if (state.coverage === null || cov > state.coverage) state.coverage = cov;
      if (state.colours === null || colours.size > state.colours) state.colours = colours.size;
      state.samples++;
    }
  };
  setInterval(sample, ${SAMPLE_MS});
})();
`;

// ---- the walk ------------------------------------------------------------------------------------
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;
const HELPERS = `
  const ROOT_SEL = '#app, #app-container, #appRoot';
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
`;
// The press loop carries NO per-route knowledge, the same shape scripts/play-screen-fit-probe.mjs
// walks with: press the largest visible non-header button, and when a press changes nothing step to
// the next-largest instead of pressing the same toggle forever.
const clickTransition = (skip) => `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL) || document.body;
  const cands = [...root.querySelectorAll('button:not([disabled])')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header') && visible(b);
  }).sort((a, z) => {
    const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
    return rz.width * rz.height - ra.width * ra.height;
  });
  const btn = cands[${JSON.stringify(skip)}];
  if (!btn) return { found: false };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim().slice(0, 40) };
`;
const READ = 'return window.__ink ?? null;';
const SIGNATURE = `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL) || document.body;
  return (root.innerText || '').replace(/[0-9]+/g, '').replace(/\\s+/g, ' ').trim().slice(0, 400);
`;

const PRESS_CAP = 8;
const VP = { w: 390, h: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (session) {
  const BASE = process.env.PROBE_BASE ?? process.env.BASE ?? 'http://localhost:4322';
  const stubbed = process.env.INK_STUB === '1';
  const noPress = process.env.INK_NO_PRESS === '1';
  const only = process.env.ROUTES_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);

  const derivedIds = canvas2dRouteIds();
  if (!derivedIds.length) throw new Error('no canvas2d play routes derived from the manifest -- refusing to report a vacuous pass');
  let ids = derivedIds;
  const full = !only?.length && !noPress;
  if (only?.length) {
    ids = ids.filter((id) => only.includes(id));
    console.log(`::notice::ROUTES_ONLY is set -- this is a DEBUG run over ${ids.length} of ${derivedIds.length} derived route(s), not the leg's coverage.`);
    if (!ids.length) throw new Error(`ROUTES_ONLY matched none of the ${derivedIds.length} derived 2D routes`);
  }
  if (noPress) console.log('::notice::INK_NO_PRESS is set -- nothing is pressed, so this run measures what a route paints without a player and is not the leg.');

  await session.onNewDocument(recorder(stubbed));

  const rows = [];
  for (const id of ids) {
    const url = `${BASE}${games.find((g) => g.id === id).playRoute}`;
    await session.nav(url);
    await session.setWidth(VP.w, VP.h);
    await session.wipe(); // on-origin, per docs/agents/browser-verification.md trap 4
    await session.evaluate(SEED);
    await session.nav(url);
    await session.setWidth(VP.w, VP.h);
    await sleep(1500); // main.js is an external module -- give it a beat to build the first screen

    let skip = 0;
    let walkError = null;
    for (let press = 0; !noPress && press < PRESS_CAP; press += 1) {
      const before = await session.evaluate(SIGNATURE);
      const click = await session.evaluate(clickTransition(skip));
      if (click.error) { walkError = `press failed: ${click.error}`; break; }
      if (!click.value?.found) break; // nothing left to press -- fewer screens, not an error
      await sleep(900);
      const here = await session.evaluate('return location.pathname;');
      if (here.value && !url.endsWith(here.value)) {
        // The press left the route. Every later sample would belong to another page, so stop here
        // and keep what this route's own screens recorded.
        walkError = `a press navigated to ${here.value}`;
        break;
      }
      const after = await session.evaluate(SIGNATURE);
      skip = after.value === before.value ? skip + 1 : 0;
    }
    if (noPress) await sleep(2000); // the no-press leg burns the same clock, it does not just skip work

    const ink = await session.evaluate(READ);
    const raw = ink.error || !ink.value
      ? { canvasSeen: false, readbackError: ink.error ?? 'window.__ink was never installed' }
      : ink.value;
    const { verdict, reason } = classify(raw);
    rows.push({
      id, url, verdict, reason, walkError,
      samples: raw.samples ?? 0, paintCalls: raw.paintCalls ?? 0, clearCalls: raw.clearCalls ?? 0,
      coverage: raw.coverage ?? null, colours: raw.colours ?? null,
    });
    console.log(`  ${verdict.padEnd(10)} ${id} -- ${reason}${walkError ? ` (walk: ${walkError})` : ''}`);
  }

  const bad = judge(rows, { stubbed, derivedIds, full });
  for (const complaint of bad) console.error(`::error::${complaint}`);
  const out = {
    base: BASE, stubbed, noPress, full,
    derivedCount: derivedIds.length, walked: rows.length,
    recordedIdle: [...RECORDED_IDLE.keys()],
    rows,
  };
  if (bad.length) {
    console.log(JSON.stringify(out, null, 2));
    throw new Error(
      stubbed
        ? `control leg: ${bad.length} complaint(s) with the paint primitives stubbed out -- this leg's detector cannot be shown to go red, so its green means nothing`
        : `${bad.length} complaint(s): a 2D route is not accounted for by ink or by the idle record`,
    );
  }
  const drew = rows.filter((r) => r.verdict === (stubbed ? 'BLANK' : 'DREW')).length;
  const idle = rows.filter((r) => r.verdict === 'UNMEASURED').length;
  console.log(
    full
      ? `OK: all ${rows.length} 2D play route(s) derived from the manifest are accounted for -- ${drew} ${stubbed ? 'BLANK (the detector goes red on demand)' : 'DREW'}, ${idle} recorded idle-canvas route(s) with a live render loop.`
      : `OK partial run (${rows.length} of ${derivedIds.length} route(s), set checks stood down) -- NOT this leg's coverage.`,
  );
  return out;
}
