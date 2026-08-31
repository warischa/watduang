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
//   * IT FIXES NOTHING AND GATES NO LAYOUT. scrolls/widthFillPct are REPORTED, never asserted
//     against a threshold. gh#179 is the measurement; gh#180/#181/#182/#183 own the layout. A pin
//     here would red on every one of those tickets' first commit.
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

// THE ONLY PIN IN THIS FILE, and the direction it can move is the point. RECORDED FROM REAL RUNS,
// never derived by reading CSS: these are the route/viewport rows where every play screen this walk
// reached FITS — nothing to scroll, nothing clipped away. A row NOT listed here overflows today and is
// REPORTED, not gated: gh#180/#181/#182/#183 own those, and pinning them would red on their first
// commit. So the guard is INVERTED onto the provably-clean set (the hazardous set is unowned and
// growing; the safe set is small and converges). It can only ever red when a row that fits today stops
// fitting, and every one of those tickets makes this list LONGER. Add a row in the commit that makes
// it fit; never remove one to make a run pass.
// WHAT IS NOT PINNED: widthFillPct. Measured across two consecutive runs it moved 89.2 -> 100 on
// cannon-flag, because these games advance on their own clock and press 1 lands on a different screen
// each time. It is a report, and a pin on it would flap forever.
// Recorded 2026-08-31 from a full run against a real dist/: the 9 of 33 rows whose worst play screen
// overflowed by ZERO px, not merely by less than the tolerance. Deliberately stricter than the gate —
// a row admitted at 7px would have one pixel of headroom and would flap.
export const FITS_ROWS = new Set([
  'dice-loser 320x568',
  'dice-loser 390x844',
  'dice-loser 1440x900',
  'freeze-tap 390x844',
  'freeze-tap 1440x900',
  'wire-snip-panic 390x844',
  'wire-snip-panic 1440x900',
  'zero-trigger 390x844',
  'zero-trigger 1440x900',
]);
/** A pinned row may drift by this much without reading as a regression — under a line of text. */
const OVERFLOW_TOLERANCE_PX = 8;
/** Sub-pixel slack: a scrollHeight and a clientHeight can disagree in the last fraction of a device px. */
const EPS = 1;

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
  let clippedPx = 0;
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
    if (oy === 'hidden' || oy === 'clip') clippedPx = Math.max(clippedPx, over);
    else scrollPx = Math.max(scrollPx, over);
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
  const stalePins = narrowed ? [] : [...FITS_ROWS].filter((k) => !keys.has(k));
  for (const k of stalePins) {
    console.error(`::error::FITS_ROWS pins "${k}", which this run never produced — the pin is stale (a route left the manifest, or a viewport changed), so it is asserting nothing.`);
  }
  const regressions = out.rows
    .filter((r) => FITS_ROWS.has(rowKey(r)))
    .map((r) => ({ r, w: worstOf(r) }))
    .filter((x) => x.w.overflowPx > OVERFLOW_TOLERANCE_PX);
  for (const x of regressions) {
    console.error(`::error::${x.r.url} at ${x.r.vp} no longer fits: ${Math.round(x.w.scrollPx)}px to scroll and ${Math.round(x.w.clippedPx)}px clipped away on a play screen (press ${x.w.press}). This row is pinned as fitting in FITS_ROWS from a recorded run, and the pin only ever moves toward MORE rows. Find what grew, then re-record with the reason — never to make a run pass.`);
  }
  if (stalePins.length || regressions.length) process.exit(1);

  const measured = out.rows.reduce((n, r) => n + r.screens.length, 0);
  // Every number here comes from the expression that describes it: the asserted count is the rows
  // this run actually walked AND has a pin for, never FITS_ROWS.size, which a narrowed run would
  // print as coverage it does not have.
  const asserted = out.rows.filter((r) => FITS_ROWS.has(rowKey(r))).length;
  console.log(`OK ${out.rows.length} route/viewport row(s) left the fresh screen; ${measured} distinct play screen(s) measured across ${out.routesWalked} route(s) x ${out.viewports} viewport(s). ${asserted} row(s) asserted to fit within ${OVERFLOW_TOLERANCE_PX}px; the other ${out.rows.length - asserted} are REPORTED, not gated — gh#180/#181/#182/#183 own those.`);
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
