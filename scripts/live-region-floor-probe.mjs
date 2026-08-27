#!/usr/bin/env node
// RENDERED floor gate for the live regions above an .ad-slot (gh#124) — the computed-style companion
// to scripts/live-region-height-check.mjs.
//
// WHY A SECOND LEG. The static gate reads DECLARED source text out of the four .astro tool pages. A
// floor that arrives any other way is invisible to it: from a global stylesheet, from the inherited
// cascade, from a style string built in a .ts module, or from a script at runtime. This leg never
// reads source. It opens the BUILT page in a real browser and asks getComputedStyle what the box
// actually resolves to, so the mechanism is caught by where it LANDS instead of by where it was
// written. The static gate keeps its owned .astro scope untouched — widening that scan would trade a
// set we own for every file that can emit a style string, and that set never converges.
//
// THE INVARIANT, one sentence: no announced element (aria-live / role="status") that precedes the
// page's first .ad-slot resolves a non-zero computed min-height / min-block-size, unless some
// ancestor between it and <html> scroll-clips it (overflow-y auto/scroll/hidden/clip/overlay).
// Presence of a floor, never a height VALUE — the rendered value belongs to the visitor's OS and font
// while gh#120 is open (ADR-0044), and a gate on the number would flap. 0 vs non-zero does not.
//
// THE PAGE SET IS DERIVED FROM THE ARTIFACT, so it converges with no registration: every dist/**.html
// whose bytes contain both `ad-slot` and an announced attribute. A new page with an ad slot and a
// status line is covered the build after it lands. Today that resolves to the four /tool/ pages; the
// enumeration is the set, and an empty enumeration is a failure, not a pass (ADR-0019).
//
// OUT OF SCOPE, named on purpose: the `min-height` floor in the love-match game module's header style
// constant (the only min-height in any game module). This leg cannot see it, and does not claim to:
// it is emitted by script INSIDE #stage, so it exists only after a roster is entered and a round is
// started — no static page carries it, and reaching it needs the game's own interaction sequence.
// Whether it is a defect at all is a separate question this leg does not answer (the comment above it
// argues the reservation is a hard cap, bounded by the module's name-truncation helper, not a floor
// over text of unbounded length). If that ever needs proving, it belongs in a game-flow probe that
// drives the round, not here.
//
// WHAT ITS GREEN DOES NOT MEAN. One width (320px, the hazard width), one browser, first paint of the
// static page — so it does not see a floor that only appears after interaction, a region rendered
// below the first .ad-slot on a page that has two, or any reflow driven by something OTHER than a
// min-height (a wrapping flex row, an image without dimensions). Actual reflow in pixels is
// scripts/ad-reflow-first-list-load-probe.mjs's job; this leg only refuses the floor.
//
// WIRED OR MANUAL: WIRE IT (recommended; the wiring itself is not this file's to do). Per the
// manual-probe rule in scripts/ci-probes.sh's header, a probe is wired only when a red would mean a
// regression in THIS repo — and it would: the invariant is floor presence in markup and CSS this repo
// authors, not slot geometry Google owns nor a text height the visitor's font owns. Two conditions on
// wiring: it needs an already-built dist/ (like every leg in that script — it must never build one),
// and it should be wired WITH its control leg, BREAK_GUARD=1, because its clean state is an empty
// violation list, which is the shape of a pass that can also mean "measured nothing".
//
//   node scripts/live-region-floor-probe.mjs               -> serve dist/ on 4455 + Chrome on 9455 yourself; exit non-zero on any rendered floor
//   BREAK_GUARD=1 node scripts/live-region-floor-probe.mjs -> control: injects a real floor in the DOM; exit 0 ONLY if the detector reds
//   node scripts/live-region-floor-probe.mjs --selftest    -> calibration both ways on fixtures (no browser, never reads dist/)
//
// It also default-exports a driver.mjs probe, so `node scripts/driver.mjs scripts/live-region-floor-probe.mjs`
// yields the raw JSON for a ci-probes.sh leg. Run directly, it spawns that itself and owns the verdict.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(repoRoot, 'dist');
// Own ports, deliberately not any other script's: probing a foreign server or browser is how a green
// gets reported for someone else's bytes.
const BASE = process.env.BASE || process.env.PROBE_BASE || 'http://localhost:4455';
const CDP_PORT = process.env.CDP_PORT || '9455';
const WIDTH = Number(process.env.PROBE_WIDTH || 320);
const BREAK_GUARD = Boolean(process.env.BREAK_GUARD);

// The rendered form of the static gate's fixed-height-ancestor exemption: what actually stops a
// child's overflow from moving the ad slot is an ancestor that scroll-clips, and unlike a fixed
// `height` (which computed style reports as a used px value on every element, laid out or not) that
// is directly observable. `clip`/`overlay` included because Chrome reports both.
export const CLIPPING_OVERFLOW = ['auto', 'scroll', 'hidden', 'clip', 'overlay'];

/** The floor a computed min-height/min-block-size value reserves, or null when it reserves nothing. */
export function floorOf(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'auto' || v === 'none') return null;
  const n = Number.parseFloat(v);
  // Percentages survive into computed style on min-height in some engines; a non-zero one is still a
  // floor, so parse the number and keep the raw string for the message.
  if (!Number.isFinite(n) || n <= 0) return null;
  return v;
}

/** The violation for one measured element, or null. Pure, so --selftest can calibrate it both ways. */
export function verdictFor(entry) {
  const hit = [
    { prop: 'min-height', value: floorOf(entry.minHeight) },
    { prop: 'min-block-size', value: floorOf(entry.minBlockSize) },
  ].find((x) => x.value !== null);
  if (!hit) return null;
  if (entry.boundedBy) return null; // scroll-clipped by an ancestor — its overflow cannot move the ad slot
  return { name: entry.name, prop: hit.prop, value: hit.value, source: entry.source ?? 'unknown' };
}

/** Every built page that carries both an ad slot and an announced element, as site-root URLs. */
export function candidatePages(distDir) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.name.endsWith('.html')) continue;
      const text = fs.readFileSync(p, 'utf8');
      if (!text.includes('ad-slot')) continue;
      if (!/aria-live|role\s*=\s*"status"/.test(text)) continue;
      const rel = path.relative(distDir, p).split(path.sep).join('/');
      out.push('/' + rel.replace(/(^|\/)index\.html$/, '$1'));
    }
  };
  walk(distDir);
  return out;
}

/**
 * The in-page measurement. `breakGuard` plants a REAL floor in the DOM the detector must then see —
 * and plants it only on an element the detector is SUPPOSED to see, i.e. one with no scroll-clipping
 * ancestor. Planting on a clipped element (the /tool/draw/ shape) tests the exemption, not the
 * detector, and a control that reds there would be asserting the wrong invariant. `plantedOn` names
 * the element that got the floor, or null when every announced element on the page is clipped.
 */
export function measureExpr({ breakGuard = false } = {}) {
  return `
    const ad = document.querySelector('.ad-slot');
    if (!ad) return { adSlot: false, entries: [], plantedOn: null };
    const announced = [...document.querySelectorAll('[aria-live],[role="status"]')]
      .filter((el) => (ad.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
    const name = (el) => el.id ? '#' + el.id : (el.classList[0] ? '.' + el.classList[0] : el.tagName.toLowerCase());
    const clipping = ${JSON.stringify(CLIPPING_OVERFLOW)};
    const clippedBy = (el) => {
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const pcs = getComputedStyle(p);
        if (clipping.includes(pcs.overflowY)) return name(p) + ' (overflow-y: ' + pcs.overflowY + ')';
      }
      return null;
    };
    let plantedOn = null;
    ${breakGuard
      ? `const target = announced.find((el) => clippedBy(el) === null);
    if (target) { target.style.minHeight = '3em'; plantedOn = name(target); }`
      : ''}
    const entries = announced.map((el) => {
      const cs = getComputedStyle(el);
      return {
        name: name(el),
        minHeight: cs.minHeight,
        minBlockSize: cs.minBlockSize,
        height: cs.height,
        boundedBy: clippedBy(el),
        source: (el.style.minHeight || el.style.minBlockSize) ? 'inline style attribute' : 'stylesheet or cascade',
      };
    });
    return { adSlot: true, entries, plantedOn };
  `;
}

/** driver.mjs probe: navigate every candidate page at WIDTH and report what rendered. */
export default async function (session) {
  const pages = candidatePages(DIST);
  await session.setWidth(WIDTH, 900);
  const results = [];
  for (const url of pages) {
    await session.nav(`${BASE}${url}`);
    const r = await session.evaluate(measureExpr({ breakGuard: BREAK_GUARD }));
    results.push({
      url,
      error: r.error ?? null,
      adSlot: r.value?.adSlot ?? null,
      plantedOn: r.value?.plantedOn ?? null,
      entries: r.value?.entries ?? [],
    });
  }
  return { base: BASE, width: WIDTH, breakGuard: BREAK_GUARD, pageCount: results.length, pages: results };
}

const violationMsg = (url, v) =>
  `${v.name} on ${url} is announced (aria-live/role="status") and renders above .ad-slot, but its COMPUTED ${v.prop} is ${v.value} (from: ${v.source}) with no scroll-clipping ancestor — that is a FLOOR over text a script rewrites, and it moves the ad slot on any platform whose font wraps the text past it (gh#120). Use a fixed height plus overflow-y: auto, as /tool/draw/ and /tool/team/ do, or bound it with a scroll-clipping ancestor.`;

function selftest() {
  // known-bad: a non-zero computed floor with nothing clipping it.
  const bad = verdictFor({ name: '#t-note', minHeight: '44.8px', minBlockSize: 'auto', boundedBy: null, source: 'stylesheet or cascade' });
  assert.equal(bad?.prop, 'min-height', 'a non-zero computed min-height must red');
  assert.match(violationMsg('/tool/x/', bad), /COMPUTED min-height is 44\.8px/, 'the message must quote the measured value');

  // known-bad: the logical property is the same hazard, and must red too.
  assert.equal(
    verdictFor({ name: '#t-note', minHeight: 'auto', minBlockSize: '48px', boundedBy: null })?.prop,
    'min-block-size',
    'a non-zero computed min-block-size must red',
  );

  // known-good: the four shapes that reserve nothing, and the /tool/draw/ exemption.
  assert.equal(verdictFor({ name: '#a', minHeight: '0px', minBlockSize: '0px', boundedBy: null }), null, 'a 0px floor must green');
  assert.equal(verdictFor({ name: '#a', minHeight: 'auto', minBlockSize: 'auto', boundedBy: null }), null, 'auto must green');
  assert.equal(
    verdictFor({ name: '#a', minHeight: '44px', minBlockSize: 'auto', boundedBy: '.t-result-box (overflow-y: auto)' }),
    null,
    'a floor under a scroll-clipping ancestor must green',
  );
  assert.equal(floorOf('3em'), '3em', 'a unit computed style cannot resolve is still reported, not dropped');
  console.log('PASS calibration: non-zero computed min-height/min-block-size red and are named · 0px, auto and a scroll-clipped ancestor green');

  // The measurement expression must actually plant a floor under BREAK_GUARD, or the control leg is a
  // guard that cannot fail — and must NOT plant one otherwise, or every clean run reds.
  assert.match(measureExpr({ breakGuard: true }), /target\.style\.minHeight = '3em'/, 'BREAK_GUARD must inject a real floor');
  // ...on an element the detector is supposed to see. Planting on a scroll-clipped one would make the
  // control assert that the exemption is a defect (it red 3 of 4 pages that way on the first run).
  assert.match(measureExpr({ breakGuard: true }), /announced\.find\(\(el\) => clippedBy\(el\) === null\)/, 'the plant must target an UNCLIPPED live region');
  assert.doesNotMatch(measureExpr(), /style\.minHeight =/, 'the clean run must inject nothing');

  // The page set comes from the artifact: an ad slot alone is not enough, an announced element alone
  // is not enough, and a page with both is enumerated as a directory URL.
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'live-region-floor-probe-'));
  try {
    fs.mkdirSync(path.join(dir, 'both'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'ad-only'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'both/index.html'), '<p role="status"></p><div class="ad-slot"></div>');
    fs.writeFileSync(path.join(dir, 'ad-only/index.html'), '<div class="ad-slot"></div>');
    fs.writeFileSync(path.join(dir, 'index.html'), '<p aria-live="polite"></p>');
    assert.deepEqual(candidatePages(dir), ['/both/'], 'only a page with BOTH an ad slot and an announced element is a candidate');
    console.log('PASS calibration: the page set is derived from the built artifact, and a page missing either half is not enumerated');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();

  // Probes an existing build and must never make one: measuring a freshly regenerated dist/ is not
  // measuring the bytes that get deployed.
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('::error::dist/index.html not found — this leg measures an existing build and must never make one. Run it after the build.');
    process.exit(1);
  }
  const pages = candidatePages(DIST);
  if (!pages.length) {
    console.error('::error::no built page carries both an .ad-slot and an announced element — nothing was measured, which is not the same as clean (ADR-0019)');
    process.exit(1);
  }

  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/driver.mjs'), fileURLToPath(import.meta.url)], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CDP_PORT, BASE },
  });
  if (run.status !== 0) {
    console.error(`::error::the browser leg did not run (exit ${run.status}). Serve dist/ on ${BASE} and start Chrome with --remote-debugging-port=${CDP_PORT} first.\n${(run.stderr || '').trim()}`);
    process.exit(1);
  }
  let out;
  try {
    out = JSON.parse(run.stdout);
  } catch {
    console.error(`::error::the browser leg produced no parseable JSON:\n${run.stdout.slice(0, 500)}`);
    process.exit(1);
  }

  // Fail closed on every way this can measure nothing while looking clean.
  const broken = out.pages.filter((p) => p.error || p.adSlot !== true);
  if (broken.length) {
    for (const p of broken) console.error(`::error::${p.url} did not measure: ${p.error ?? 'no .ad-slot in the rendered DOM'}`);
    process.exit(1);
  }
  const measured = out.pages.reduce((n, p) => n + p.entries.length, 0);
  if (!measured) {
    console.error('::error::no announced element rendered above any .ad-slot — every enumerated page carries one, so this is a broken measurement, not a clean tree');
    process.exit(1);
  }

  const violations = out.pages.flatMap((p) => p.entries.map((e) => verdictFor(e)).filter(Boolean).map((v) => ({ url: p.url, v })));
  for (const { url, v } of violations) console.error(`::error::${violationMsg(url, v)}`);

  if (BREAK_GUARD) {
    // Control leg: the expected outcome is INVERTED, and it is asserted PER PLANTED ELEMENT, not per
    // page. A page where every announced element is scroll-clipped (the /tool/draw/ shape) gets no
    // plant and must not red — counting it as a miss would assert the exemption is a defect. Such a
    // page is listed rather than dropped, so a set that silently stopped being plantable is visible.
    const planted = out.pages.filter((p) => p.plantedOn);
    const skipped = out.pages.filter((p) => !p.plantedOn).map((p) => p.url);
    if (!planted.length) {
      console.error('::error::BREAK_GUARD planted nothing on any page — every announced element is scroll-clipped, so this control measured the exemption, not the detector.');
      process.exit(1);
    }
    const missed = planted.filter((p) => !violations.some((x) => x.url === p.url && x.v.name === p.plantedOn));
    if (missed.length) {
      for (const p of missed) console.error(`::error::BREAK_GUARD planted min-height: 3em on ${p.plantedOn} at ${p.url} and the detector did not red — it cannot see the hazard it exists to catch.`);
      process.exit(1);
    }
    console.log(`OK control: BREAK_GUARD planted a floor on ${planted.length} unclipped live region(s) at ${out.width}px and the detector red on every one${skipped.length ? ` (not plantable, every announced element scroll-clipped: ${skipped.join(', ')})` : ''}.`);
    return;
  }

  if (violations.length) {
    console.error(`\n${violations.length} live region(s) above an .ad-slot RENDER a floor at ${out.width}px (measured on ${out.pageCount} built page(s), ${measured} announced element(s)).`);
    process.exit(1);
  }
  console.log(`OK ${measured} announced element(s) above an .ad-slot across ${out.pageCount} built page(s) at ${out.width}px: none renders a non-zero computed min-height/min-block-size outside a scroll-clipping ancestor.`);
}

// Entry point only — driver.mjs imports this module for its default export, and that must not fire
// the gate (which would spawn driver.mjs again, recursively).
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};
if (isEntryPoint()) main();
