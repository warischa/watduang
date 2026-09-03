#!/usr/bin/env node
// gh#179 — PLAY-SCREEN FIT. Walks every play route PAST its setup screen and reports, per route and
// per viewport, whether the screen scrolls and what fraction of the viewport width its content fills.
//
// THE INVARIANT, one sentence: on every play route, at every viewport, the walk reaches at least one
// screen that is NOT the screen a fresh device opens on, and every screen it reaches there is
// measured for vertical scroll and horizontal width-fill.
//
// WHY THE WALK IS THE HARD PART, and how it is proved rather than assumed. The ways a walk can
// silently stay on setup are owned by 11 separate mockup state machines; enumerating them never
// converges, and a fitting setup screen reported as a fitting play screen is exactly the false green
// this file exists to refuse. So the proof is DIFFERENTIAL and repo-owned, not per-route:
//   1. Load the route with storage wiped. That is, by construction, the screen a first-time device
//      sees — the setup/menu screen. Record its SIGNATURE.
//   2. Reload with a roster and a group seeded (the roster<->mockup contract in
//      src/play/_setup-bridge.ts: with two or more names, each route's bridge replays what the player
//      already told the device and the mockup starts its own match), then press the mockup's own
//      controls.
//   3. A screen counts as measurable ONLY if its signature differs from the fresh one. A route where
//      every screen the walk reached still carries the fresh signature FAILS, by name.
// THE SIGNATURE IS THE VISIBLE TEXT of the mockup root, lowercased, with digits stripped and
// whitespace collapsed. Chosen over a DOM/id fingerprint after measuring: several routes
// (freeze-tap, how-close-is-near, power-meter, pinocchio-luck) render every screen into ONE container
// with one id, so an id set cannot tell their screens apart at all. Copy can: these are Thai-first
// screens whose whole job is to say what is happening. Digits are stripped because half of these
// screens carry a running clock or a score, and a signature that changes on its own would red a
// correct walk. THE DRIFT IS THE FALSE-GREEN DIRECTION — a signature that changed on its own would
// report "it left setup" about a walk that never moved — so BREAK_WALK is the calibration for exactly
// that: it re-reads the FRESH screen over the same elapsed time and every route must come back
// identical.
//
// THE PRESS LOOP IS SELF-CORRECTING AND CARRIES NO PER-ROUTE KNOWLEDGE. The trigger heuristic is the
// one scripts/control-floor-probe.mjs and scripts/play-exit-probe.mjs already share — the largest
// visible non-header button in the mockup root — because "first button in DOM order" presses #btn-home
// or the ❓ on most mockups, i.e. leaves the page. Measured here (gh#179): on dice-loser the largest
// button is a scoring-mode card, and pressing it forever leaves the walk on #dl-setup while every
// press "succeeds". So when a press does not change the signature, the next attempt takes the NEXT
// largest candidate instead; a press that does change it resets to the largest again. Anchors are
// never pressed: ADR-0014 puts the crawlable link in chrome above the play surface.
//
// WHAT IS MEASURED, and why it is the WORST screen rather than one nominated screen. After leaving
// the fresh screen the walk keeps pressing to a cap, measuring every distinct screen it lands on, and
// reports the worst. There is no repo-owned way to name "the" play screen — a round is a handoff, a
// turn, a result, and each is a play screen — so nominating one would be per-route knowledge with no
// declaration behind it. The worst is the honest answer to "do the play screens fit".
//
//   scrollPx            the largest vertical overflow on any visible box the player CAN scroll,
//                       documentElement and body included.
//   clippedPx           the same overflow on a box with overflow:hidden — content that is not
//                       scrollable, just unreachable. MEASURED (gh#179): every one of these mockups
//                       pins html and body, so on this site clipping is the NORMAL form of "does not
//                       fit" and scrolling is the exception. A probe that read documentElement's
//                       scroll alone reported a planted 2400px screen as fitting perfectly.
//   overflowPx          max of the two — the "does not fit" number, and the only one gated.
//   widthFillPct        (rightmost ink - leftmost ink) / innerWidth, over the VISIBLE INK inside the
//                       mockup root: leaf elements with text, plus canvas/img/svg/button/input. Boxes
//                       are not ink — a full-bleed background div would read 100% on a page whose
//                       content is a 320px column stranded in the middle of a 1440px screen, which is
//                       the finding this number exists to produce. position:fixed and <header>
//                       descendants are excluded for the same reason: a fixed corner control would
//                       peg every route at ~100% and measure nothing.
//
// WIRED as two ci-probes legs (scripts/ci-probes.sh lane3): the walk leg and its BREAK_WALK control.
//   node scripts/play-screen-fit-probe.mjs               -> exit non-zero if any route x viewport
//                                                           never left its fresh screen
//   BREAK_WALK=1 node scripts/play-screen-fit-probe.mjs  -> control: no seeding AND no presses, so the
//                                                           walk stands still on the fresh screen.
//                                                           Exit 0 ONLY if EVERY route x viewport
//                                                           failed to leave it.
//   NO_SEED=1 NO_PRESS=1 node scripts/...                -> the same stranding under the NORMAL
//                                                           verdict: the loud red, naming every route.
//   ROUTES_ONLY=a,b                                      -> narrow a hand-run debug pass. Never in CI.
// It also default-exports a driver.mjs probe. Serve an ALREADY-BUILT dist/ on BASE and start Chrome
// on CDP_PORT first; this leg must never build.
//
// WHAT ITS GREEN DOES NOT MEAN — the blind spots, stated so nobody reads more into a pass:
//   * IT FIXES NOTHING AND SETS NO LAYOUT THRESHOLD. widthFillPct is REPORTED only, and an
//     overflowing row's recorded px is the number ONE machine measured — the CI runner and a Mac
//     disagree by 4-28% on the same commit (inferred: fonts — the runner installs none and the play
//     routes name none), so growth and "fixed" on a KNOWN_OVERFLOW row are
//     PRINTED, never gated. gh#179 is the measurement; gh#180/#181/#182/#183 own the layout. What a
//     layout commit must do: move the fixed row from KNOWN_OVERFLOW to FITS_ROWS in that same commit,
//     because FITS is the one px claim (0, within 8px) both machines agree on and it IS gated.
//   * It proves the measured screen is not the FRESH screen. It does not prove it is the round's main
//     screen: a pass-device or handoff screen satisfies the invariant, and on a route whose first
//     press lands there the reported numbers may be that screen's.
//   * PRESS_CAP presses per viewport, not every screen: a screen only reachable deeper into a round
//     (a result panel, a sudden-death branch) is never measured.
//   * One browser, one font. widthFillPct on a text-only screen moves with the font the runner has.
//   * A route whose bridge deliberately stops short of starting the match still has to be pressed
//     there by this walk, so what it measures is whatever the mockup's own controls reach.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { games } from '../src/games/manifest.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(repoRoot, 'dist');
// Own ports, deliberately not any other script's: ci-probes.sh holds 4344/9344-9348, control-floor
// holds 4580/9580, play-exit holds 5051, and 4321/9222 is the runbook's manual pair. Probing a
// foreign server or attaching to someone else's Chrome is how a green gets reported for other bytes.
const BASE = process.env.BASE || process.env.PROBE_BASE || 'http://localhost:4592';
const CDP_PORT = process.env.CDP_PORT || '9592';
// BREAK_WALK is the control leg: it disables BOTH halves of the walk and inverts the verdict, so the
// probe is left standing on the fresh screen and every row must report that it never left.
// MEASURED, and the reason the control is defined this way rather than the obvious way: disabling the
// SEEDING alone does not strand the walk — 2 of 2 routes tried (cannon-flag, timebomb) still pressed
// through the mockup's own setup UI and reached a play screen, so a seed-only control comes back GREEN
// and calibrates nothing. Disabling the PRESSES alone does not strand it either: with a roster seeded,
// 9 of 11 routes auto-start and are already off the fresh screen at press 0. Only both together.
// NO_SEED and NO_PRESS are exposed separately so the same stranding can be watched failing under the
// NORMAL verdict — "the guard reds when the walk stays on setup" and "the guard's control passes" are
// different claims and one run cannot show both.
const NO_SEED = Boolean(process.env.BREAK_WALK || process.env.NO_SEED);
const NO_PRESS = Boolean(process.env.BREAK_WALK || process.env.NO_PRESS);
const BREAK_WALK = Boolean(process.env.BREAK_WALK);

/** The three viewports gh#179 asks for: the binding narrow width, the common phone, and desktop. */
export const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
/** Presses per viewport after the seeded load. Bounded so a mockup that never advances ends the loop. */
const PRESS_CAP = 6;

// THE TWO PINS IN THIS FILE, and the direction each one can move is the point. EVERY route/viewport
// row this walk produces belongs to EXACTLY ONE of them, so "not listed anywhere" is no longer a
// silent third state: a new route, a new viewport, or a screen that started overflowing reds as
// UNCLASSIFIED instead of being reported into the void.
//   FITS_ROWS      — the rows whose worst play screen overflows by ZERO px. GROWS ONLY. A row is
//                    added in the commit that makes it fit; it is never removed to make a run pass,
//                    and never admitted at 4px "because that is under the tolerance". The tolerance
//                    is drift room for a row already pinned, never an admission rule: a row admitted
//                    at 7px would have one pixel of headroom and would flap.
//   KNOWN_OVERFLOW — the rows that do NOT fit today, each with the reason it is allowed to stand.
//                    SHRINKS ONLY in the normal case: when a layout ticket lands, the row leaves this
//                    map for FITS_ROWS; the probe PRINTS a row that measured 0px here (rule iii) but
//                    cannot red on it — one machine's 0 is another machine's 17px (inferred: fonts). It grows
//                    only with a reason line that names an owner decision — every value starts with
//                    'owner ruling <date>:' (the site owner accepted this screen as it is) or
//                    'gh#182 open:' (nobody has ruled yet; the row is recorded, not blessed). A bare
//                    number with no prefix is not a reason and must not be added.
// RECORDED FROM REAL RUNS, never derived by reading CSS. Both sets were re-recorded 2026-09-02 from
// three consecutive full runs against a real dist/, under the self-scroller measurement rule above:
// the rows below fit; every other row in this map overflows.
// WHAT IS NOT PINNED: widthFillPct. Measured across two consecutive runs it moved 89.2 -> 100 on
// cannon-flag, because these games advance on their own clock and press 1 lands on a different screen
// each time. It is a report, and a pin on it would flap forever.
export const FITS_ROWS = new Set([
  'dice-loser 320x568',
  'dice-loser 390x844',
  'dice-loser 1440x900',
  // Added 2026-09-02: 0px under the self-scroller rule (it read 160-187px while an inner
  // overflow-y:auto box was being counted as page overflow).
  'freeze-tap 390x844',
  'freeze-tap 1440x900',
  'wire-snip-panic 390x844',
  'wire-snip-panic 1440x900',
  'zero-trigger 390x844',
  'zero-trigger 1440x900',
  // Added 2026-09-02: 0px once visible-overflow boxes stopped counting.
  'how-close-is-near 390x844',
  'how-close-is-near 1440x900',
  'timebomb 390x844',
  'timebomb 1440x900',
  // Added 2026-09-03: moved from KNOWN_OVERFLOW. 0px on the CI runner (gh run 33740125366) AND on
  // three consecutive dev-machine runs against a real dist/ — both machines agree, per the
  // file-header licence. Numbers: docs/verification/182-dev-recheck.md (the run logs were written
  // to a *.log path that .gitignore drops, so the committed md IS the artifact).
  'short-stick 390x844',
  'short-stick 1440x900',
  'timebomb 320x568',
]);
/**
 * Row -> why it is allowed to overflow. Recorded 2026-09-02 from three consecutive full runs; the
 * numbers are what those runs measured (they agreed to the pixel on every row in this map), not what
 * a fix is expected to leave behind. cursed-number is the only row carrying an owner ruling, and that ruling
 * names ONE viewport: its 390 and 1440 rows are 'gh#182 open', because whether the exception is the
 * route or only the 320 screen has not been ruled on.
 */
export const KNOWN_OVERFLOW = new Map([
  ['cannon-flag 320x568', 'gh#182 open: 2px on press 1 - 2px clipped by div.power-gauge-container'],
  ['cannon-flag 390x844', 'gh#182 open: 2px on press 1 - 2px clipped by div.power-gauge-container'],
  ['cannon-flag 1440x900', 'gh#182 open: 2px on press 1 - 2px clipped by div.power-gauge-container'],
  ['cursed-number 320x568', 'owner ruling 2026-09-01: 689px on press 1 - 689px to scroll on documentElement (accepted exception at 320x568, worst screen 2.21 viewports, removable blocks 252px vs 689px)'],
  ['cursed-number 390x844', 'gh#182 open: 317px on press 1 - 317px to scroll on documentElement'],
  ['cursed-number 1440x900', 'gh#182 open: 157px on press 1 - 157px to scroll on documentElement'],
  // Moved from FITS_ROWS 2026-09-02: E1 bounded the self-scroller rule to boxes under 0.6x viewport
  // height, so a box that fills the screen (a scroll surface in name only) counts as page overflow
  // again. Measured under the bounded rule, not a regression in the page itself.
  ['freeze-tap 320x568', 'gh#182 open: 187px on press 1 - 187px to scroll on main#mainContent'],
  ['how-close-is-near 320x568', 'gh#182 open: 194px on press 4 - 194px to scroll on documentElement'],
  ['pinocchio-luck 320x568', 'gh#182 open: 136px on press 1 - 136px to scroll on documentElement, 4px clipped by div.css-mouth; measured 107-136px across 15 runs (13x107, 1x116, 1x120, 1x136) on this route/viewport, a self-timed screen per the press-timing note in the file header'],
  ['pinocchio-luck 390x844', 'gh#182 open: 14px on press 1 - 14px to scroll on documentElement, 4px clipped by div.css-mouth'],
  ['pinocchio-luck 1440x900', 'gh#182 open: 17px on press 2 - 17px to scroll on documentElement, 4px clipped by div.css-mouth'],
  ['power-meter 320x568', 'gh#182 open: 76px on press 0 - 76px clipped by div#app-container'],
  ['power-meter 390x844', 'gh#182 open: 76px on press 0 - 76px clipped by div#app-container'],
  ['power-meter 1440x900', 'gh#182 open: 76px on press 0 - 76px clipped by div#app-container'],
  ['short-stick 320x568', 'gh#182 open: 191px on press 0 - 191px to scroll on documentElement'],
  // Moved from FITS_ROWS 2026-09-02: same self-scroller bound as freeze-tap above.
  ['wire-snip-panic 320x568', 'gh#182 open: 111px on press 0 - 111px to scroll on div#screen-game.screen.active'],
  ['zero-trigger 320x568', 'gh#182 open: 131px on press 0 - 131px to scroll on section#screen-game.screen.active. RE-RECORDED UPWARD from 96px, measured this run on this Mac: gh#194 deliberately gives the player strip its real height (flex-shrink:0 in overrides.css), and that height is added to a screen that was already over. The growth is the fix, not a regression — a chip row nobody can see is not a saving. Promotion to FITS_ROWS is not owed here; this row still overflows by design until the 320px play screen is redesigned'],
]);
/** A pinned row may drift by this much without reading as a regression — under a line of text. */
const OVERFLOW_TOLERANCE_PX = 8;
/** Sub-pixel slack: a scrollHeight and a clientHeight can disagree in the last fraction of a device px. */
const EPS = 1;

// GATE ON THE REASON STRING ITSELF: every KNOWN_OVERFLOW value must open with the prefix that carries
// its recorded px, so check (iv) below can parse it back out. A reason that drifts from this shape
// (a rewrite that drops the number, a typo in the ruling-date format) throws at import time instead of
// silently making check (iv) unable to find a number to compare against.
const KNOWN_OVERFLOW_PREFIX = /^(owner ruling \d{4}-\d{2}-\d{2}|gh#\d+ open): (\d+)px /;
for (const [key, reason] of KNOWN_OVERFLOW) {
  if (!KNOWN_OVERFLOW_PREFIX.test(reason)) {
    throw new Error(`KNOWN_OVERFLOW["${key}"] does not start with "<owner ruling YYYY-MM-DD|gh#N open>: <N>px ": "${reason}"`);
  }
}
/**
 * The px a KNOWN_OVERFLOW reason was recorded at — used by check (iv) to catch a regression past it.
 * Exported for scripts/play-screen-fit-probe.test.mjs, which asserts every recorded reason parses
 * without driving a browser: it THROWS on a reason that does not match, so a silent NaN is impossible.
 */
export const recordedPx = (reason) => Number(KNOWN_OVERFLOW_PREFIX.exec(reason)[2]);

/**
 * THE ONE ROUTE-ENUMERATION EXPRESSION, shared verbatim with scripts/play-exit-probe.mjs (and with
 * anything else that walks play routes — gh#178). The manifest is the declaration of record, and
 * landing-claims-check already reds a declared playRoute with no built page, so a route that reaches
 * this list is a route that exists. Hand-listing is what let short-stick ship unprobed.
 */
export const playRoutes = () => {
  // ROUTES_ONLY narrows the walk for a hand-run debug pass, the same knob and the same vacuity throw
  // scripts/play-exit-probe.mjs carries. It is never set in ci-probes.sh, and a narrowed run says so
  // on stdout so a shortened table can never be read as the whole set.
  const only = process.env.ROUTES_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
  const ids = games.filter((g) => g.playRoute).map((g) => g.id).sort()
    .filter((id) => !only?.length || only.includes(id));
  if (!ids.length) throw new Error('no play routes derived from the manifest — refusing to report a vacuous pass');
  return ids;
};

const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shared by every evaluate below. No backticks anywhere inside these template literals — a backtick in
// a comment closes the Node template and the prose after it is evaluated as Node expressions.
const HELPERS = `
  const ROOT_SEL = '#app, #app-container, #appRoot';
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
`;

// The screen signature. Digits out (clocks and scores move on their own), case folded, whitespace
// collapsed. Read off the mockup root only: page chrome above the play surface is the same on every
// screen and would dilute the difference this signature exists to detect.
const SIGNATURE = `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { ok: false, why: 'no mockup root (#app / #app-container / #appRoot)' };
  const parts = [];
  for (const e of root.querySelectorAll('*')) {
    if (e.children.length || !visible(e)) continue;
    const t = (e.textContent || '').trim();
    if (t) parts.push(t);
  }
  const sig = parts.join(' ').toLowerCase().replace(/[0-9\\u0E50-\\u0E59]+/g, '').replace(/\\s+/g, ' ').trim();
  return { ok: true, sig, len: sig.length };
`;

const MEASURE = `
  ${HELPERS}
  const de = document.documentElement;
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { ok: false, why: 'no mockup root' };
  const docScrollPx = de.scrollHeight - de.clientHeight;
  // THE SCAN INCLUDES html AND body, and that is not a detail. Measured (gh#179): every one of these
  // mockups sets overflow:hidden on both, so documentElement.scrollHeight - clientHeight is 0 even
  // when the content is 800px taller than the screen. A plant of min-height:2400px on cannon-flag's
  // #app-container was INVISIBLE to a 'body *' scan and the probe reported it as fitting. What the
  // pinned body turns overflow into is not scrolling but CLIPPING — content the player cannot reach
  // at all — so both are measured and the gate is on whichever is larger.
  let scrollPx = docScrollPx > ${EPS} ? docScrollPx : 0;
  let scrollFrom = scrollPx ? 'documentElement' : null;
  let clippedPx = 0;
  let clipFrom = null;
  const desc = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '')).slice(0, 60);
  for (const e of [de, document.body, ...document.querySelectorAll('body *')]) {
    if (!e || (e !== de && e !== document.body && !visible(e))) continue;
    const over = e.scrollHeight - e.clientHeight;
    if (over <= ${EPS}) continue;
    // A one-pixel clip box is the screen-reader visually-hidden pattern, not a scroll surface, and it
    // overflows by the height of whatever the announcer last said. MEASURED (gh#179): every route but
    // dice-loser reported a constant 20-23px of "clipped" content that was only #cf-live / #sr-announcer
    // and friends — a plausible number, on every route, describing nothing a player can see.
    if (e.clientHeight <= 1 || e.clientWidth <= 1) continue;
    const oy = getComputedStyle(e).overflowY;
    if (oy === 'hidden' || oy === 'clip') {
      if (over > clippedPx) { clippedPx = over; clipFrom = desc(e); }
      continue;
    }
    // OWNER RULING 2026-09-01, applied here as a MEASUREMENT rule rather than as an exception list:
    // an INNER self-scroller does not violate the fit criterion. A box the page itself declared
    // scrollable (overflow-y auto/scroll) is a designed scroll surface — a log, a roster column — and
    // its content is reachable inside a screen that does not itself scroll. What the criterion is
    // about is the PAGE not fitting, so html/body and docScrollPx keep counting. hidden/clip is
    // untouched by the ruling and still counts: clipped content is unreachable, not scrollable.
    // A non-root box whose overflow is VISIBLE cannot scroll either: its spill lands in an ancestor,
    // where it is counted once, as documentElement scroll or as clipping by the hidden/clip box above
    // it. Counting it here invented 9px on a range input and 71px on a box inside a designed scroller
    // (measured 2026-09-02), so only the two roots and a bounded self-scroller below reach the line
    // below.
    const isRoot = e === de || e === document.body;
    const isScroller = oy === 'auto' || oy === 'scroll';
    // ponytail: 0.6 x viewport is a heuristic ceiling; a log or roster column sits well under it, a
    // screen container sits at or above it. Raise to a per-route declaration only if a real widget
    // crosses it. Failure direction: a box AT or ABOVE the line fails LOUD (its spill reads as page
    // overflow, an UNCLASSIFIED or regressed row names it); a screen container UNDER the line would
    // fail SILENT (its spill hidden as a designed scroller) — measured 2026-09-02, no route has one:
    // every .screen / main / #view-root is height:100%.
    const fillsViewport = isScroller && e.clientHeight >= 0.6 * innerHeight;
    if (!isRoot && !fillsViewport) continue;
    if (over > scrollPx) { scrollPx = over; scrollFrom = desc(e); }
  }
  // INK, not boxes: leaves that render text, plus the media and control elements that render
  // themselves. A full-bleed wrapper is not content and must not count as width filled.
  const MEDIA = new Set(['CANVAS', 'IMG', 'SVG', 'VIDEO', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
  let left = Infinity, right = -Infinity, n = 0;
  for (const e of root.querySelectorAll('*')) {
    if (!visible(e)) continue;
    if (getComputedStyle(e).position === 'fixed') continue;
    if (e.closest('header')) continue;
    const isMedia = MEDIA.has(e.tagName);
    if (!isMedia && (e.children.length || !(e.textContent || '').trim())) continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    n += 1;
  }
  const span = n ? Math.min(right, innerWidth) - Math.max(left, 0) : 0;
  return {
    ok: true, innerWidth, innerHeight,
    docScrollPx, scrollPx, clippedPx, overflowPx: Math.max(scrollPx, clippedPx),
    // Named so a KNOWN_OVERFLOW reason can say WHICH box overflows instead of only by how much.
    scrollFrom, clipFrom,
    inkCount: n,
    inkLeft: n ? left : null, inkRight: n ? right : null,
    widthFillPct: n ? Math.round((span / innerWidth) * 1000) / 10 : 0,
  };
`;

// The transition trigger, lifted from scripts/control-floor-probe.mjs's CLICK_PLAY_TRANSITION (same
// roots, same size floor, same header exclusion), with one addition: SKIP, so the caller can step
// past a candidate whose press changed nothing. That is the whole dice-loser fix, and it needs no
// per-route selector.
const clickTransition = (skip) => `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { found: false, why: 'no mockup root' };
  const cands = [...root.querySelectorAll('button:not([disabled])')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header') && visible(b);
  }).sort((a, z) => {
    const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
    return rz.width * rz.height - ra.width * ra.height;
  });
  const btn = cands[${JSON.stringify(skip)}];
  if (!btn) return { found: false, why: 'no non-header button over 60x30 left to press at rank ${skip}' };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim().slice(0, 40) };
`;

const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

async function load(session, url, vp, seeded) {
  await session.nav(url);
  await session.setWidth(vp.w, vp.h);
  await session.wipe(); // on-origin, per docs/agents/browser-verification.md trap 4
  if (seeded) await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(vp.w, vp.h);
  await sleep(1200); // main.js is an external module; give it a beat to build the first screen
}

/** driver.mjs probe: every play route x every viewport, fresh signature then the seeded walk. */
export default async function (session) {
  const routes = playRoutes();
  const rows = [];
  for (const id of routes) {
    const url = `${BASE}/game/${id}/play/`;
    for (const vp of VIEWPORTS) {
      const row = { route: id, url: `/game/${id}/play/`, vp: `${vp.w}x${vp.h}`, error: null, screens: [] };
      rows.push(row);
      await load(session, url, vp, false);
      const fresh = await session.evaluate(SIGNATURE);
      if (fresh.error || !fresh.value?.ok) {
        row.error = `fresh signature unreadable: ${fresh.error ?? fresh.value?.why}`;
        continue;
      }
      row.freshSigLen = fresh.value.len;

      // NO_SEED skips the seeding, so the walk is left on the fresh screen and every screen it
      // reaches must still carry the fresh signature. That is this probe's calibration, and it also
      // proves the signature is stable over the same elapsed time rather than drifting on its own.
      await load(session, url, vp, !NO_SEED);
      const widthOk = await session.evaluate('return innerWidth;');
      if (widthOk.value !== vp.w) {
        // browser-verification.md trap 1: a run measured at the wrong innerWidth is void, not wrong.
        row.error = `measured at innerWidth ${widthOk.value}, asked for ${vp.w} — the page never reflowed, so this read is void (docs/agents/browser-verification.md trap 1)`;
        continue;
      }

      let skip = 0;
      const seen = new Set([fresh.value.sig]);
      for (let press = 0; press <= PRESS_CAP; press += 1) {
        const sig = await session.evaluate(SIGNATURE);
        if (sig.error || !sig.value?.ok) { row.error = `signature unreadable: ${sig.error ?? sig.value?.why}`; break; }
        const left = sig.value.sig !== fresh.value.sig;
        if (left && !seen.has(sig.value.sig)) {
          seen.add(sig.value.sig);
          const m = await session.evaluate(MEASURE);
          if (m.error || !m.value?.ok) { row.error = `measure failed: ${m.error ?? m.value?.why}`; break; }
          row.screens.push({ press, ...m.value });
        }
        if (press === PRESS_CAP) break;
        const before = sig.value.sig;
        // NO_PRESS still burns the same wall clock: the control has to prove the signature is stable
        // over the walk's own elapsed time, not just that nothing was clicked.
        if (NO_PRESS) { await sleep(700); continue; }
        const click = await session.evaluate(clickTransition(skip));
        if (click.error) { row.error = `press failed: ${click.error}`; break; }
        if (!click.value?.found) break; // nothing left to press — not an error, just fewer screens
        await sleep(700);
        const here = await session.evaluate('return location.pathname;');
        if (here.value && !here.value.startsWith(row.url)) {
          row.error = `the press (${click.value.label}) navigated to ${here.value} instead of transitioning in place — every later screen would belong to another page`;
          break;
        }
        const after = await session.evaluate(SIGNATURE);
        // A press that changed nothing means this candidate is not a transition (a scoring-mode card,
        // a toggle). Step to the next-largest rather than pressing it again forever.
        skip = after.value?.sig === before ? skip + 1 : 0;
      }
    }
  }
  return { base: BASE, breakWalk: BREAK_WALK, routesWalked: routes.length, viewports: VIEWPORTS.length, rows };
}

/** The worst screen of a row: most overflow first, then least width-fill. The row a layout ticket wants. */
const worstOf = (r) => r.screens.slice().sort((a, b) => b.overflowPx - a.overflowPx || a.widthFillPct - b.widthFillPct)[0];
export const rowKey = (r) => `${r.route} ${r.vp}`;

const fmt = (r) => {
  if (!r.screens.length) return `${r.route.padEnd(18)} ${r.vp.padEnd(9)} NEVER LEFT THE FRESH SCREEN`;
  const w = worstOf(r);
  return `${r.route.padEnd(18)} ${r.vp.padEnd(9)} scrolls ${(w.scrollPx > EPS ? 'YES' : 'no ').padEnd(3)} ${String(Math.round(w.scrollPx)).padStart(5)}px  clipped ${String(Math.round(w.clippedPx)).padStart(5)}px  width-fill ${String(w.widthFillPct).padStart(5)}%  (${r.screens.length} screen(s), worst at press ${w.press}, ${w.inkCount} ink)${FITS_ROWS.has(rowKey(r)) ? ' [pinned fits]' : ''}`;
};

function main() {
  // Probes an existing build and must never make one: measuring a freshly regenerated dist/ is not
  // measuring the bytes that get deployed.
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('::error::dist/index.html not found — this leg measures an existing build and must never make one. Run it after the build.');
    process.exit(1);
  }
  // The driver's JSON goes to a FILE, not down a pipe: spawnSync on darwin truncates stdout at the
  // 64KiB pipe buffer with status 0 and no signal at all that it happened (see control-floor-probe.mjs).
  const jsonPath = path.join(os.tmpdir(), `play-screen-fit-probe-${process.pid}.json`);
  const fd = fs.openSync(jsonPath, 'w');
  let run;
  try {
    run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/driver.mjs'), fileURLToPath(import.meta.url)], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', fd, 'pipe'],
      env: { ...process.env, CDP_PORT, BASE },
    });
  } finally {
    fs.closeSync(fd);
  }
  if (run.status !== 0) {
    fs.rmSync(jsonPath, { force: true });
    console.error(`::error::the browser leg did not run (exit ${run.status}). Serve dist/ on ${BASE} and start Chrome with --remote-debugging-port=${CDP_PORT} first.\n${(run.stderr || '').trim()}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  fs.rmSync(jsonPath, { force: true });
  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    console.error(`::error::the browser leg produced no parseable JSON (${raw.length} bytes):\n${raw.slice(0, 500)}`);
    process.exit(1);
  }

  const broken = out.rows.filter((r) => r.error);
  for (const r of broken) console.error(`::error::${r.url} at ${r.vp} did not measure: ${r.error}`);
  if (broken.length) process.exit(1);

  const expectedRows = playRoutes().length * VIEWPORTS.length;
  if (out.rows.length !== expectedRows) {
    console.error(`::error::${out.rows.length} route/viewport row(s), expected ${expectedRows} (every play route in src/games/manifest.ts x ${VIEWPORTS.length} viewports) — a route that never loaded reads exactly like a clean one.`);
    process.exit(1);
  }

  const stuck = out.rows.filter((r) => !r.screens.length);
  if (BREAK_WALK) {
    // Control leg: the expected outcome is INVERTED. Without the seeding every route stays on the
    // screen a fresh device opens on, so EVERY row must be stuck. A row that "left" it there means
    // the signature drifts on its own and the clean leg's green proves nothing.
    for (const r of out.rows) {
      if (r.screens.length) {
        console.error(`::error::control leg: ${r.url} at ${r.vp} reported ${r.screens.length} screen(s) DIFFERENT from the fresh one with no roster seeded — the screen signature changes on its own, so "it left setup" is not what a clean green measures.`);
      }
    }
    if (stuck.length !== out.rows.length) process.exit(1);
    console.log(`OK control: all ${out.rows.length} route/viewport row(s) stayed on the fresh screen with both the seeding and the presses disabled — so the walk invariant CAN fail, and the screen signature is stable across the ${PRESS_CAP} press intervals the clean leg spends walking (a signature that drifted on its own would report "it left setup" about a walk that never moved).`);
    return;
  }

  for (const r of stuck) {
    console.error(`::error::${r.url} at ${r.vp}: every screen this walk reached still carries the signature of the screen a fresh device opens on — it never left setup, so any fit number from it would describe the setup screen. ${PRESS_CAP} presses, ${r.freshSigLen} chars of fresh copy.`);
  }
  if (stuck.length) process.exit(1);

  // The inverted guard. Only the rows recorded as scroll-free are asserted; the rest are reported.
  const keys = new Set(out.rows.map(rowKey));
  // A narrowed run cannot judge the pins it never walked, and must not be read as if it had.
  const narrowed = Boolean(process.env.ROUTES_ONLY?.trim());
  if (narrowed) console.log(`NARROWED by ROUTES_ONLY=${process.env.ROUTES_ONLY} — ${out.routesWalked} of ${games.filter((g) => g.playRoute).length} play route(s). This is a debug run, not a gate.`);
  // (i) EVERY produced row lands in exactly one set. A row in neither is the state this check exists
  // to kill: before it, a new route or a screen that started overflowing was simply "not pinned" and
  // printed into the report with nothing asserting anything about it.
  const unclassified = out.rows.map(rowKey).filter((k) => !FITS_ROWS.has(k) && !KNOWN_OVERFLOW.has(k));
  for (const k of unclassified) {
    console.error(`::error::"${k}" is UNCLASSIFIED — this run produced it and neither FITS_ROWS nor KNOWN_OVERFLOW holds it. Measure the row, then either pin it as fitting (0px) or record it in KNOWN_OVERFLOW with a reason starting "owner ruling <date>:" or "gh#182 open:". Do not leave it out of both.`);
  }
  const inBoth = out.rows.map(rowKey).filter((k) => FITS_ROWS.has(k) && KNOWN_OVERFLOW.has(k));
  for (const k of inBoth) {
    console.error(`::error::"${k}" is in BOTH FITS_ROWS and KNOWN_OVERFLOW — a row cannot both fit and be an accepted overflow, and whichever set is wrong is asserting nothing.`);
  }
  // (ii) Stale pins, both sets: a key nobody produced asserts nothing, whichever set it sits in.
  const stalePins = narrowed ? [] : [...FITS_ROWS, ...KNOWN_OVERFLOW.keys()].filter((k) => !keys.has(k));
  for (const k of stalePins) {
    const which = FITS_ROWS.has(k) ? 'FITS_ROWS' : 'KNOWN_OVERFLOW';
    console.error(`::error::${which} pins "${k}", which this run never produced — the pin is stale (a route left the manifest, or a viewport changed), so it is asserting nothing.`);
  }
  // (iii) An exception that no longer overflows. The trigger is ZERO overflow, not
  // OVERFLOW_TOLERANCE_PX: FITS_ROWS admits 0px rows only, so a tolerance-based trigger would red
  // the 4-6px rows into a set that is not allowed to hold them, and no edit could clear it.
  const fixed = out.rows
    .filter((r) => KNOWN_OVERFLOW.has(rowKey(r)))
    .map((r) => ({ r, w: worstOf(r) }))
    .filter((x) => x.w.overflowPx <= EPS);
  // REPORTED, not gated (measured 2026-09-02, CI run 33633519499): the Linux runner read 0px on three
  // rows this Mac records at 2-17px. A px other than zero is owned by the runner's font stack, so
  // "fixed" cannot be asserted from one machine. The line still prints, so a fixed row is visible
  // and gets moved by the layout commit that fixed it.
  for (const x of fixed) {
    console.warn(`::warning::${x.r.url} at ${x.r.vp}: this run measured ${Math.round(x.w.overflowPx)}px against KNOWN_OVERFLOW "${KNOWN_OVERFLOW.get(rowKey(x.r))}" — if that holds on both the CI runner and a dev machine, move the row to FITS_ROWS; an exception nobody deletes is a licence to regress.`);
  }
  const regressions = out.rows
    .filter((r) => FITS_ROWS.has(rowKey(r)))
    .map((r) => ({ r, w: worstOf(r) }))
    .filter((x) => x.w.overflowPx > OVERFLOW_TOLERANCE_PX);
  for (const x of regressions) {
    console.error(`::error::${x.r.url} at ${x.r.vp} no longer fits: ${Math.round(x.w.scrollPx)}px to scroll and ${Math.round(x.w.clippedPx)}px clipped away on a play screen (press ${x.w.press}). This row is pinned as fitting in FITS_ROWS from a recorded run, and the pin only ever moves toward MORE rows. Find what grew, then re-record with the reason — never to make a run pass.`);
  }
  // (iv) A KNOWN_OVERFLOW row that grew past the px its reason was recorded at. REPORTED, not gated:
  // the same CI run measured six of these rows 4-28% ABOVE this Mac's numbers (power-meter 76 -> 268),
  // with no code change between the two — inferred cause: Thai text wraps differently under the
  // runner's fallback fonts (the workflow installs none; the src diff between the two runs touched
  // only a test file). A
  // recorded px is therefore the number ONE machine saw; the only environment-stable claims here are
  // "classified" and "fits within tolerance", and those two stay gates.
  const knownRegressions = out.rows
    .filter((r) => KNOWN_OVERFLOW.has(rowKey(r)))
    .map((r) => ({ r, w: worstOf(r), recorded: recordedPx(KNOWN_OVERFLOW.get(rowKey(r))) }))
    .filter((x) => x.w.overflowPx > x.recorded + OVERFLOW_TOLERANCE_PX);
  for (const x of knownRegressions) {
    console.warn(`::warning::${x.r.url} at ${x.r.vp} measured ${Math.round(x.w.overflowPx)}px against a recorded ${x.recorded}px (press ${x.w.press}). Same machine as the recording? Then something grew — fix it or re-record with the reason. Different machine? Fonts, not layout: leave the number alone.`);
  }
  if (unclassified.length || inBoth.length || stalePins.length || regressions.length) process.exit(1);

  const measured = out.rows.reduce((n, r) => n + r.screens.length, 0);
  // Every number here comes from the expression that describes it: the asserted count is the rows
  // this run actually walked AND has a pin for, never FITS_ROWS.size, which a narrowed run would
  // print as coverage it does not have.
  const asserted = out.rows.filter((r) => FITS_ROWS.has(rowKey(r))).length;
  const excepted = out.rows.filter((r) => KNOWN_OVERFLOW.has(rowKey(r))).length;
  console.log(`OK ${out.rows.length} route/viewport row(s) left the fresh screen; ${measured} distinct play screen(s) measured across ${out.routesWalked} route(s) x ${out.viewports} viewport(s). ${asserted} row(s) asserted to fit within ${OVERFLOW_TOLERANCE_PX}px and ${excepted} row(s) held as recorded exceptions in KNOWN_OVERFLOW (reported, never gated: growth or a 0px reading prints a warning) — every produced row is in exactly one of the two sets.`);
  for (const r of out.rows) console.log('  ' + fmt(r));
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
