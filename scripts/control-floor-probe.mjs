#!/usr/bin/env node
// RENDERED floor gate for the shared game controls (gh#129, gate 1) — the tap-target companion to
// scripts/stick-tap-target-probe.mjs, which owns the same 44px minimum for short-stick's sticks only.
//
// THE INVARIANT, one sentence: on every game page, at 320px, every .game-btn that actually renders
// (a) resolves a computed min-height greater than zero, (b) has a getBoundingClientRect().height that
// is never below that resolved value, and (c) has a rect height never below the 44px tap minimum.
//
// GATE THE RELATIONSHIP, NOT THE PIXELS. Claims (a) and (b) carry NO height literal: the floor is read
// out of the rendered CSSOM and the rect is compared against whatever the page itself resolved. A
// rendered-height literal would belong to the visitor's OS and font (ADR-0044), and would flap on a
// runner font update. The single number in this file is MIN_TAP_PX, the one-sided accessibility spec
// constant this repo already gates on for gh#79 — a spec floor, not a measurement.
//
// WHY THIS CAN REGRESS HERE, and what each claim is worth:
//   * The floors are DECLARED nowhere the compiler can see them being used. They live in the
//     `<style is:global>` block of src/pages/game/[id].astro, on the .game-btn-primary and
//     .game-btn-secondary selectors (that block's own comment states why: game modules build this DOM
//     at runtime and Astro's default scoping would never reach it). Every .game-btn in the built site
//     is created by a game module's script — `grep game-btn dist/game/*/index.html` returns zero. So
//     dropping `is:global`, or renaming a class, or scoping that block, silently ships controls with
//     no floor at all and no build error anywhere. Claim (a) is the detector for exactly that.
//   * Claim (c) is the tap minimum. It reds when a floor survives but is set below 44, or when text
//     shrinks a floorless control under it.
//   * CLAIM (b) ALONE IS NEAR-TAUTOLOGICAL and is disclosed as such: CSS enforces min-height by
//     construction, so a rect can only fall under a live floor via a transform (or a clipped/scaled
//     ancestor). It is kept because that failure is real and invisible to (a) and (c), but claims (a)
//     and (c) are the load-bearing ones — do not read a green on (b) as coverage of anything else.
//
// THE PAGE SET IS DERIVED FROM src/games/manifest.ts, never hand-listed, and it is now EVERY game:
// a game with no playRoute gets its /game/<id>/ landing, a game that declares one gets
// /game/<id>/play/. Solo-vs-party seeding on a landing is derived from that module's own `players`
// tuple ([1, 1] is the ADR-0040 solo class, which renders no setup panel). A new game is covered the
// build after it lands. The navigation shape on a landing (seed the roster in localStorage, tick every
// box, click #start-round · or let the solo branch mount itself) is the one in
// scripts/ad-slot-game-probe.mjs, gh#154: this walk USED to also reach the party game that was the
// ONLY page rendering a .game-btn-secondary, i.e. the only page where the 56px secondary floor was
// measurable at all. That page is deleted and nothing replaced it (`git grep -n game-btn-secondary
// src/` returns the declaration in [id].astro and no producer). The 56px floor is therefore
// UNMEASURED, and the success line says so per-variant rather than folding it into a total.
//
// gh#170 — PLAY ROUTES ARE IN THE WALK, and the exclusion that kept them out is gone as a class, not
// as a line. It used to live in THREE places that a grep could never link: the pageSet() filter, the
// PAGE_COUNT expression, and the wording of the "walked N pages" error. All three read from the same
// manifest predicate now, so a play route cannot be silently unmeasured by one of them drifting.
// WHAT A PLAY ROUTE CONTRIBUTES IS A DIFFERENT SET, and the difference is load-bearing:
//   * A landing's controls are `.game-btn`, and their floors are DECLARED in [id].astro's
//     `<style is:global>` block. All three claims apply there — that block is the thing claim (a)
//     exists to watch.
//   * A play route mounts a lifted mockup (src/play/<id>/), which declares its own classes and never
//     sees [id].astro at all. There is no repo-wide floor declaration to lose, so claims (a) and (b)
//     have NOTHING to assert there and are marked not-applicable rather than faked into a pass — a
//     control carries `floorOwned` and claimsFor() reads it. Claim (c), the 44px tap minimum, is a
//     spec floor that belongs to the player's thumb and applies to EVERY rendered control on both
//     kinds of page. That is the claim this widening buys.
//   * The whole mockup markup is in the DOM at once with inactive screens hidden, so a play route is
//     measured on VISIBLE buttons only (a non-zero rect and no visibility:hidden). Measuring the
//     hidden ones would report every unmounted screen's controls as 0px-tall violations.
//
// EACH PAGE IS WALKED TWO SCREENS DEEP, because several games' controls only exist after a
// transition: daily-fortune's screen 1 has no .game-btn at all, and on a play route the entire setup
// panel — where the smallest controls on this site live — sits one press behind the menu screen. The
// second screen is reached differently per page kind, and neither trigger may be a navigation:
//   * landing: the first enabled #stage button.
//   * play route: the LARGEST visible button inside the mockup root that is not header chrome — the
//     same heuristic scripts/play-exit-probe.mjs uses to disarm the exit X, chosen for the same
//     reason. "First button in DOM order" would press #btn-home or the ❓ on most mockups, i.e. leave
//     the page and measure the site index instead of screen 2, which reads exactly like a clean run.
//
// WHAT ITS GREEN DOES NOT MEAN. 320px only — 390px is UNMEASURED here, deliberately: 320 is the
// binding width (a floor that holds at 320 holds wider, and every layout hazard in this repo has
// surfaced at 320 first). Two screens per page, not every screen; one browser; and love-match
// contributes ZERO controls — it has no page at all any more. It was delisted pending its "เนื้อคู่"
// redesign, so this manifest-driven walk never reaches it. It contributed zero before the delisting
// too, for a different reason: its solo wiring handed mount() an empty roster and the pick screen
// rendered a buttonless "need 2+ people" message. So a green here says NOTHING about that game, and
// nothing else covers it either: gh#170 — this file used to close that sentence by pointing at
// scripts/ad-slot-game-probe.mjs as "still reaching its code by mounting the chunk directly". That
// claim was false in two independent ways and is struck rather than repaired. (1) Nothing executes
// that probe: `grep -rn ad-slot-game-probe .github/ scripts/ package.json` finds it nowhere but in
// its own file, and a probe no runner invokes covers nothing however good its code is. (2) Its own
// header opens "gh#149 STALE TARGET — it drives /game/<id>/ landing pages that ADR-0050 ruling 2
// deleted ... do not read a run of it as evidence." The probe is KEPT — it is the hand-run tool
// ADR-0044/gh#120 wants, and deliberately unwired because what it measures is font-metric-dependent
// and would flap on a runner font update rather than on a regression here. What is retired is the
// coverage this file claimed on its behalf. love-match's HEADER_NAME_MAX path is UNCOVERED.
//
// WIRED as a ci-probes leg (a red = a floor that stopped reaching JS-created controls, or a control
// below the tap minimum — both regressions in THIS repo). Not --selftest-audited: it lives behind the
// ci-probes.sh wrapper, already named in gate-selftest-coverage-check's unauditableCommands; its
// calibration is the control leg.
//
//   node scripts/control-floor-probe.mjs               -> exit non-zero on any control failing any claim
//   BREAK_FLOOR=1 node scripts/control-floor-probe.mjs -> control: applies two inline mutants; exit 0
//                                                         ONLY if all three claims red on EVERY control
//
// It also default-exports a driver.mjs probe, so `node scripts/driver.mjs scripts/control-floor-probe.mjs`
// yields the raw JSON for a ci-probes.sh leg. Run directly, it spawns that itself and owns the verdict.
// Serve an ALREADY-BUILT dist/ on BASE and start Chrome on CDP_PORT first; this leg must never build.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { games } from '../src/games/manifest.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(repoRoot, 'dist');
// Own ports, deliberately not any other script's: the neighbouring browser probes hold 4455/9455, and
// 4321 is a peer project's dev server. Probing a foreign server or browser is how a green gets
// reported for someone else's bytes.
const BASE = process.env.BASE || process.env.PROBE_BASE || 'http://localhost:4580';
const CDP_PORT = process.env.CDP_PORT || '9580';
const WIDTH = Number(process.env.PROBE_WIDTH || 320);
const BREAK_FLOOR = Boolean(process.env.BREAK_FLOOR);

/** The one-sided accessibility spec constant this repo already gates on (gh#79). Not a measurement. */
export const MIN_TAP_PX = 44;
/** Subpixel tolerance — a rect and a resolved floor can disagree in the last fraction of a device px. */
const EPS = 0.05;

// RECORDED FROM THE FIRST GREEN RUN on the real dist/, not derived by grep: per-screen subsets render,
// so no static count of `className = 'game-btn ...'` assignments predicts it. A CHANGE IN THIS NUMBER
// IS THE INTENDED SIGNAL — a control that stopped rendering, a new one that started, or a screen that
// stopped being reachable. Re-record it deliberately, with the reason, never to make a run pass.
// First green run, as a breakdown so a future drift is attributable: timebomb 1+1, siamsi 1+1,
// pick-loser 1 + (1 primary + 1 secondary), short-stick 0+1, daily-fortune 0+1, love-match 0 = 9.
//
// 2026-08-28, 9 -> 10: freeze-tap joined the manifest, and it contributes 1+0. ATTRIBUTED, not
// assumed, because a net +1 could also hide a +2 with something else silently dropping to 0:
//   - freeze-tap's own .game-btn set is renderHandoff 1, renderAttempt 1, renderShowdown 1,
//     renderVoid 1, renderResults 2 (primary + secondary).
//   - This walk reaches only two screens, so it sees renderHandoff's ready button (1), and the click
//     on that button lands on renderWaiting, whose tap target is a div carrying .ft-pad and NOT
//     .game-btn — hence 0 on the second screen, where every other party game contributes 1. That div
//     is deliberate: it is also why the arm-gate coverage check needed no recorded exception for this
//     game. A future reader expecting 2 from freeze-tap should look there first.
//   - The registering commit touches no other game module and none of the shell, so no other game's
//     contribution can have moved. 9 + 1 = 10 closes exactly.
//
// 2026-08-29, 10 -> 9: freeze-tap's engine LEFT its module (gh#135) — same shape as cannon-flag's
// port below: src/games/freeze-tap.ts is now an 87-line landing rendering prose and no <button>;
// the game runs at src/pages/game/freeze-tap/play.astro. Its probe-visible contribution goes
// 1 -> 0. In the SAME change power-meter JOINED the manifest (gh#136) contributing 0: it was never
// probed before (unwired), and its landing mirrors cannon-flag's — no .game-btn on any screen.
// ATTRIBUTED, not bumped: old freeze-tap.ts had 7 game-btn refs (1 rendered on the two walked
// screens), new has 0; power-meter's landing has 0 refs. 10 - 1 + 0 = 9 closes exactly, measured
// against the local 4-lane run whose red prompted this re-record.
//
// 2026-08-29, 11 -> 10: cannon-flag's engine LEFT this module. The game now runs on its own
// full-screen route (src/pages/game/cannon-flag/play.astro) and src/games/cannon-flag.ts is an
// 87-line landing module that renders prose and no <button> at all — the entry into the game is an
// <a> in chrome above the stage, which is where ADR-0014 puts a navigation target. So cannon-flag's
// contribution goes 1 -> 0 and the total returns to the 10 that stood before it was registered.
// ATTRIBUTED, not bumped: a net -1 could equally hide a -2 with something else newly rendering. The
// deleting commit touches no other game module and none of the shell, and the walk still reaches the
// same two screens on every other page, so 11 - 1 = 10 closes exactly. The block below records what
// cannon-flag used to contribute, kept because a future reader asking "why 10" needs the history the
// number no longer carries.
//
// 2026-08-29, 10 -> 11 (SUPERSEDED by the line above): cannon-flag joined the manifest, and it
// contributed 1+0. Attributed the same way, for the same reason:
//   - cannon-flag's own .game-btn set is renderHandoff 1 (readyBtn), plus a next button, a sudden
//     death button, and renderResults 2 (replay primary + change secondary) on screens this walk
//     never reaches.
//   - Screen 2 is the aiming dashboard, whose controls are cf-step-btn and cf-btn-fire — neither
//     carries .game-btn, so it contributes 0, the same shape as freeze-tap's .ft-pad div.
//   - The registering commit touches no other game module and none of the shell. 10 + 1 = 11 closes
//     exactly.
// 2026-08-30, 9 -> 6: gh#154 deleted the party game whose page contributed 3 of the 9 — 1 on screen 1
// (its pick button) and 2 on screen 2 (a primary and the site's only secondary). ATTRIBUTED, not
// bumped: the deleting commit touches no other game module and none of the shell, and the walk still
// reaches the same two screens on every other page, so 9 - 3 = 6 closes exactly. RE-MEASURED against
// a real run of this probe on the post-deletion dist/, not carried over from the arithmetic.
// 2026-08-30, 6 -> 3: gh#149 deleted the landing page of every game declaring a playRoute (ADR-0050
// ruling 2), so this manifest-driven walk now reaches two pages instead of six. ATTRIBUTED, not
// bumped: the surviving pages are siamsi (1 on screen 1 + 1 on screen 2) and daily-fortune (0 on
// screen 1, which renders no .game-btn, + 1 on screen 2) = 3, exactly the breakdown recorded for
// those two pages on the first green run above, and the three pages that left (timebomb 1+1,
// short-stick 0+1) account for the other 3. RE-MEASURED against a real ci-probes run on the
// post-deletion dist/, not carried over from the arithmetic. WHAT THIS COSTS: with only solo pages
// left, this leg no longer measures a primary control on any party surface — those controls now
// render at the play routes, which no ci-probes leg walks.
// gh#170 — THIS PIN NOW COVERS THE LANDING PAGES ONLY, and that scoping is deliberate, not an
// oversight. It stays an exact equality because the landing set is two solo pages whose controls are
// built by shell code that changes rarely, so drift there really is the signal described above. The
// play routes get a DIFFERENT guard (PLAY_MIN_CONTROLS_PER_PAGE) for a reason worth stating: an exact
// total across 11 mockups would be co-owned by every mockup edit, would be stale the day it was
// recorded, and a pin that reds on unrelated work gets re-recorded to make the run pass — which is
// precisely the failure this comment block spends 60 lines warning against. Fail-closed there means
// "every play page rendered at least one control", i.e. the vacuity this file exists to refuse.
export const CONTROL_COUNT = 3;
/**
 * A play route that renders zero measurable controls did not mount — the mockup markup is inert HTML
 * until main.js runs, so a broken bundle leaves a page that loads, paints, and measures nothing. That
 * is the "a page that never loaded reads exactly like a clean one" failure, one layer in.
 */
export const PLAY_MIN_CONTROLS_PER_PAGE = 1;
/** Every game in the manifest gets exactly one page. Pinned so a page that stopped loading cannot read as clean. */
// gh#170 — EVERY game, again: a game with no playRoute has its /game/<id>/ landing and a game that
// declares one has /game/<id>/play/, so the count is the manifest length and the walk is total over
// it. This used to be `games.filter((g) => !g.playRoute).length`, the second of the three faces of
// the play-route exclusion. Derived from pageSet() itself now rather than from a predicate that
// merely resembles it, so the two cannot drift apart at all.
export const PAGE_COUNT = pageSet().length;

const NAMES = ['เอ', 'บี', 'ซี'];

// The mutants, applied and reverted inside the same evaluate: zero checkout mutation, nothing
// to revert. `floorless` is the lost-is:global regression in miniature (no floor, and small enough
// that the rendered box also drops under the tap minimum); `squashed` is the only way a rect can fall
// under a floor that is still live.
// gh#170 — THE MUTANTS ARE APPLIED INLINE, PER ELEMENT, WITH THE `important` PRIORITY FLAG, and are
// no longer an injected stylesheet. The measured set grew from 3 shell-built controls to 148 across 11
// third-party mockups, and an injected `button { ... !important }` rule loses the cascade to any of
// those sheets that declares the same property `!important` on a higher-specificity selector (an #id
// or a class). Nothing in an author stylesheet can outrank an inline `important` declaration, so this
// is the only form of the mutant that is guaranteed to reach every control it is tallied over.
// MEASURED, in this order, on the real dist/: as a `.game-btn` rule the floorless mutant left 72 of
// 148 controls at or above 44px; widened to `button !important` it still left 12 (cannon-flag,
// power-meter, how-close-is-near, cursed-number, zero-trigger — non-round resolved floors like
// 48.3065px, i.e. their own `!important` winning on specificity); inline, it leaves none.
//
// Each property earns its place, because `min-height` is only one of the ways 11 mockups size a
// control: `height` (every #play-exit is a fixed 44x44 box), `padding` and `font-size` and
// `line-height` (text-sized controls), `aspect-ratio` (square icon buttons), and `align-self` (a flex
// item stretched to its tallest sibling — how-close-is-near's count-chip row, which no property
// applied to the chip itself would otherwise shrink).
// `transition`/`animation` COME FIRST AND ARE NOT OPTIONAL. A running CSS transition outranks an
// author !important declaration in the cascade — it is above it in CSS Cascade 4 — so on a mockup that
// sets `transition: 0.15s` (cannon-flag, power-meter, how-close-is-near all do) the mutant does not
// lose, it just has not arrived yet. Measured on cannon-flag #btn-start-match: inline
// `min-height: 0px !important` was on the element with priority "important" and getComputedStyle
// still reported 44.4055px two frames later — the value 32ms into a 150ms ease from 50px to 0. That
// read looks exactly like a mutant the page defeated, and it cost this leg two wrong diagnoses.
// SETTLE_MS then holds past the longest transition any of these mockups declares.
const MUTANT_SETTLE_MS = 260;
export const MUTANTS = {
  floorless: {
    transition: 'none',
    animation: 'none',
    'min-height': '0',
    height: 'auto',
    padding: '0',
    'font-size': '8px',
    'line-height': '1',
    'aspect-ratio': 'auto',
    'align-self': 'flex-start',
  },
  // The only way a rect can fall under a floor that is still live.
  squashed: { transition: 'none', animation: 'none', transform: 'scaleY(.25)' },
};
// floorless must also reach DESCENDANTS: a button whose child span carries its own height is not
// shrunk by anything set on the button (measured — cursed-number #startGameBtn and zero-trigger
// #btn-quick-start both resolved min-height 0 while still rendering ~49px of child content). squashed
// stays on the control itself: it models an ancestor transform, and scaling every descendant too would
// compound the factor and prove a different thing.
const MUTANT_DEEP = { floorless: true, squashed: false };

/**
 * The three claims for one measured control. Pure, so the control leg asserts on the same code path.
 *
 * gh#170 — claims (a) and (b) are gated on `c.floorOwned`, and a not-applicable claim returns true.
 * That is the honest encoding, not a softening: those two claims are the detector for [id].astro's
 * `<style is:global>` block losing its reach, and a play-route control has no relationship to that
 * block whatsoever. Reporting "no floor resolves" on a mockup button would be a false red naming a
 * file the button never loads. Claim (c) is a spec constant about a thumb and is asserted on every
 * control of every kind — it is the whole point of widening the walk. Anything reading a green here
 * per-claim must use the applicability tallies main() prints, never the raw control total.
 */
export function claimsFor(c) {
  const floor = Number.isFinite(c.floorPx) ? c.floorPx : 0;
  return {
    hasFloor: !c.floorOwned || floor > 0,
    atLeastFloor: !c.floorOwned || c.rectHeight >= floor - EPS,
    atLeastTap: c.rectHeight >= MIN_TAP_PX - EPS,
  };
}

/** The page set and its seeding kind, both derived from the manifest. */
export function pageSet() {
  // gh#170 — TOTAL over the manifest, which is the third and last face of the old play-route
  // exclusion (the filter itself). The manifest is the declaration of record for which routes exist;
  // scripts/play-exit-probe.mjs derives its own route list from this identical `g.playRoute`
  // predicate, and landing-claims-check already reds a declared playRoute with no built page, so a
  // route that reaches this list is a route that exists. Deriving here from the manifest rather than
  // importing that probe is not a second source of truth — it is the SAME source; play-exit-probe is
  // a top-level-await script that opens a CDP session on import and cannot be read for its list.
  return games.map((g) =>
    g.playRoute
      ? { id: g.id, url: `/game/${g.id}/play/`, kind: 'play' }
      : {
          id: g.id,
          url: `/game/${g.id}/`,
          // ADR-0040: a [1, 1] page renders no setup panel, so there is no #start-round to click and
          // the page's own solo branch mounts the module straight into the stage.
          kind: g.players[0] === 1 && g.players[1] === 1 ? 'solo' : 'party',
        },
  );
}

// gh#170 — a landing keeps the exact `.game-btn` set it always measured (CONTROL_COUNT still means
// what it meant); a play route measures every VISIBLE <button> in the document. Visibility is decided
// on the rendered box, not on offsetParent: #play-exit is position:fixed and offsetParent is null for
// a fixed element, so an offsetParent test would drop the one control shared by all 11 routes. A
// zero-area rect is how an inactive mockup screen presents, and visibility:hidden is how a couple of
// them present a dialog — neither is a tap target, and measuring them would report a wall of 0px
// violations that no player can ever touch.
const SELECTOR = (kind) => (kind === 'play' ? 'button' : '.game-btn');
const measureExpr = (mutantProps, kind, deep = false) => `
  const els = [...document.querySelectorAll(${JSON.stringify(SELECTOR(kind))})];
  const props = ${JSON.stringify(mutantProps ?? null)};
  // The targets are the controls, plus their descendants when the mutant is deep. Captured BEFORE any
  // write so the restore below is byte-identical: an element with no style attribute before must have
  // none after, or the next read measures this mutant instead of the page.
  const targets = props
    ? (${JSON.stringify(deep)} ? els.flatMap((e) => [e, ...e.querySelectorAll('*')]) : els.slice())
    : [];
  const saved = targets.map((e) => e.getAttribute('style'));
  for (const e of targets) {
    for (const [k, v] of Object.entries(props)) e.style.setProperty(k, v, 'important');
  }
  // Two frames for layout, then a hold past the longest transition these mockups declare — a running
  // transition outranks !important, so a short wait reads the mutant mid-flight and under-reports it.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (props) await new Promise((r) => setTimeout(r, ${MUTANT_SETTLE_MS}));
  const visibleOnly = ${JSON.stringify(kind === 'play')};
  const out = els.map((b) => {
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      name: b.id ? '#' + b.id : b.className,
      variant: b.classList.contains('game-btn-secondary') ? 'secondary'
        : b.classList.contains('game-btn-primary') ? 'primary' : 'bare',
      // NO BACKTICKS ANYWHERE IN THIS TEMPLATE. It is a Node template literal, so a backtick in a
      // comment closes it and the prose after it is evaluated as Node expressions — which is exactly
      // what happened writing the comment below (ReferenceError: btn is not defined, from prose).
      // Claims (a)/(b) detect ONE thing: src/pages/game/[id].astro's is:global block losing its reach.
      // So ownership is decided by PAGE KIND, not by class name. Measured (gh#170): the lifted mockups
      // at src/play/dice-loser/ and src/play/timebomb/ ship their own .game-btn in markup.html with
      // their own floor in play.css — a pure class-name collision with the shell's. Keying off the
      // class put those 4 into claims (a)/(b) and had them asserting something true of a DIFFERENT
      // stylesheet, under an error message naming a file the page never loads.
      floorOwned: ${JSON.stringify(kind !== 'play')} && b.classList.contains('game-btn'),
      minHeight: cs.minHeight,
      floorPx: Number.parseFloat(cs.minHeight),
      rectHeight: r.height,
      rectWidth: r.width,
      disabled: !!b.disabled,
      hidden: r.width === 0 || r.height === 0 || cs.visibility === 'hidden',
    };
  }).filter((c) => !visibleOnly || !c.hidden);
  targets.forEach((e, i) => { if (saved[i] === null) e.removeAttribute('style'); else e.setAttribute('style', saved[i]); });
  // browser-verification.md trap 1: --window-size does not reflow, and a run measured at the wrong
  // innerWidth is void rather than wrong. Carried per screen so the verdict can refuse it.
  return { innerWidth, controls: out };
`;

// The mutants shrink controls but never hide them, so the visible set is the same under a mutant as
// under the clean read — which is what lets the control leg's tallies share one denominator.
const WAIT_FOR_CONTROLS = (kind) => `
  const sel = ${JSON.stringify(SELECTOR(kind))};
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && document.querySelectorAll(sel).length === 0) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return document.querySelectorAll(sel).length;
`;

// The one action every game's screen-1 control shares: the first enabled button in #stage. Waits out
// the 400ms arm gate (src/games/_arm-gate.ts) plus margin before giving up.
const CLICK_FIRST_ENABLED = `
  const deadline = Date.now() + 1500;
  let btn = null;
  while (Date.now() < deadline) {
    btn = document.querySelector('#stage button:not([disabled])');
    if (btn) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!btn) return { found: false };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim() };
`;

// gh#170 — the play-route transition trigger, lifted from scripts/play-exit-probe.mjs's startBtn
// block (same roots, same size floor, same header exclusion) because it solves the same problem here:
// find the one press that advances a mockup without leaving the page. #appRoot is in the root list
// because how-close-is-near uses it and nothing else — measured there, a null root threw and the
// route reported "no trigger" forever, a permanent skip that looks exactly like a page with nothing
// to press. Anchors are never pressed at all: ADR-0014 puts the crawlable link in chrome above the
// play surface, and following it would measure the site index and call it screen 2.
const CLICK_PLAY_TRANSITION = `
  const deadline = Date.now() + 1500;
  let root = null;
  while (Date.now() < deadline) {
    root = document.querySelector('#app, #app-container, #appRoot');
    if (root) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!root) return { found: false, why: 'no mockup root (#app / #app-container / #appRoot)' };
  const cands = [...root.querySelectorAll('button:not([disabled])')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 60 && r.height > 30 && r.top >= 0
      && !b.closest('header') && getComputedStyle(b).visibility !== 'hidden';
  }).sort((a, z) => {
    const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
    return rz.width * rz.height - ra.width * ra.height;
  });
  const btn = cands[0];
  if (!btn) return { found: false, why: 'no non-header button over 60x30 in the mockup root' };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim().slice(0, 40) };
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(session, page) {
  const url = `${BASE}${page.url}`;
  await session.nav(url);
  await session.setWidth(WIDTH, 1600);
  await session.wipe();
  if (page.kind === 'play') {
    // No roster seeding: a wiped play route opens on its own menu screen, which is the screen a
    // first-time player sees and the one press away from the setup panel. Seeding a roster would
    // skip past setup on the routes whose bridge auto-resumes — and setup is where the smallest
    // controls on this site are.
    await session.nav(url); // reload ON-ORIGIN after the wipe (docs/agents/browser-verification.md)
    await session.setWidth(WIDTH, 1600);
    await sleep(900); // main.js is an external module; give it a beat to build the first screen
    return null;
  }
  if (page.kind === 'party') {
    await session.evaluate(
      `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))}); return true;`,
    );
  }
  await session.nav(url); // reload ON-ORIGIN after the wipe (docs/agents/browser-verification.md)
  await session.setWidth(WIDTH, 1600);
  if (page.kind === 'party') {
    const res = await session.evaluate(`
      const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
      for (const b of boxes) if (!b.checked) b.click();
      const btn = document.getElementById('start-round');
      if (!btn) return { missing: true };
      btn.click(); // dispatches watduang:start with the real ticked roster, same as a real tap
      return { missing: false };
    `);
    if (res.error) return `seed evaluate error: ${res.error}`;
    if (res.value?.missing) return '#start-round not found';
  }
  await sleep(700); // the module is lazy-imported; give mountInto() a beat
  if (page.id === 'daily-fortune') {
    // screen 1 needs a name before its (non-.game-btn) submit will advance to the result screen
    await session.evaluate(`
      const input = document.getElementById('df-name');
      if (input) input.value = 'ทดสอบชื่อ';
      return true;
    `);
  }
  return null;
}

async function measureScreen(session, page, screen) {
  await session.evaluate(WAIT_FOR_CONTROLS(page.kind));
  const clean = await session.evaluate(measureExpr(null, page.kind));
  if (clean.error) return { page: page.id, url: page.url, kind: page.kind, screen, error: clean.error, controls: [] };
  const innerWidth = clean.value?.innerWidth ?? null;
  if (innerWidth !== WIDTH) {
    return {
      page: page.id, url: page.url, kind: page.kind, screen, controls: [],
      error: `measured at innerWidth ${innerWidth}, asked for ${WIDTH} — the page never reflowed, so this read is void (docs/agents/browser-verification.md trap 1)`,
    };
  }
  const row = { page: page.id, url: page.url, kind: page.kind, screen, error: null, innerWidth, controls: clean.value?.controls ?? [] };
  if (BREAK_FLOOR) {
    for (const [name, props] of Object.entries(MUTANTS)) {
      const m = await session.evaluate(measureExpr(props, page.kind, MUTANT_DEEP[name]));
      if (m.error) return { page: page.id, url: page.url, kind: page.kind, screen, error: `mutant ${name}: ${m.error}`, controls: [] };
      row[name] = m.value?.controls ?? [];
    }
  }
  return row;
}

/** driver.mjs probe: walk every manifest page two screens deep at WIDTH and report what rendered. */
export default async function (session) {
  const pages = pageSet();
  const screens = [];
  for (const page of pages) {
    const seedErr = await seed(session, page);
    if (seedErr) {
      screens.push({ page: page.id, url: page.url, kind: page.kind, screen: 1, error: seedErr, controls: [] });
      continue;
    }
    screens.push(await measureScreen(session, page, 1));
    const click = await session.evaluate(page.kind === 'play' ? CLICK_PLAY_TRANSITION : CLICK_FIRST_ENABLED);
    if (click.error) {
      screens.push({ page: page.id, url: page.url, kind: page.kind, screen: 2, error: click.error, controls: [] });
      continue;
    }
    if (!click.value?.found) continue; // no reachable transition — not a failure, just fewer screens
    await sleep(400);
    // A trigger that navigated instead of transitioning would have us measuring another page's
    // controls under this page's name. Cheap to rule out, and silent if it ever happens.
    const here = await session.evaluate('return location.pathname;');
    if (here.value && !here.value.startsWith(page.url)) {
      screens.push({
        page: page.id, url: page.url, kind: page.kind, screen: 2, controls: [],
        error: `the screen-2 trigger (${click.value.label}) navigated to ${here.value} instead of transitioning in place — screen 2 would have measured another page`,
      });
      continue;
    }
    screens.push(await measureScreen(session, page, 2));
  }
  return {
    base: BASE,
    width: WIDTH,
    breakFloor: BREAK_FLOOR,
    pagesWalked: new Set(screens.map((s) => s.page)).size,
    screens,
  };
}

const violationMsg = (s, c, k) => {
  const where = `${c.name} (${c.variant}) on ${s.url} screen ${s.screen} at ${WIDTH}px`;
  if (!k.hasFloor) {
    return `${where} resolves NO computed min-height floor (computed: ${c.minHeight}). The floors for .game-btn-primary/.game-btn-secondary are declared in the <style is:global> block of src/pages/game/[id].astro, and every .game-btn in the built site is created by a game module at runtime — so a floor that stops reaching them means that block stopped being global, or the class was renamed. Nothing else in the build can see this.`;
  }
  if (!k.atLeastFloor) {
    return `${where} renders ${c.rectHeight}px, BELOW its own resolved min-height of ${c.minHeight} — CSS cannot do that on its own, so something is transforming, scaling or clipping the control.`;
  }
  return `${where} renders ${c.rectHeight}px, under the ${MIN_TAP_PX}px tap minimum this repo gates on (gh#79). Its resolved floor is ${c.minHeight}.`;
};

function main() {
  // Probes an existing build and must never make one: measuring a freshly regenerated dist/ is not
  // measuring the bytes that get deployed.
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('::error::dist/index.html not found — this leg measures an existing build and must never make one. Run it after the build.');
    process.exit(1);
  }

  // gh#170 — the driver's JSON goes to a FILE, not down a pipe. spawnSync on darwin returns a stdout
  // string TRUNCATED at the 64KiB pipe buffer with `status: 0` and `error: undefined` — no signal at
  // all that it happened; `maxBuffer` is a different, larger ceiling and does not prevent it. This
  // walk used to fit under 64KiB and now does not (13 pages, and BREAK_FLOOR triples the payload with
  // its two mutant reads), so the failure was one control short of arriving as an unexplained
  // "produced no parseable JSON" on a run that had in fact measured everything correctly. Measured:
  // piped stdout came back at exactly 65536 bytes against 134916 written.
  const jsonPath = path.join(os.tmpdir(), `control-floor-probe-${process.pid}.json`);
  const fd = fs.openSync(jsonPath, 'w');
  let run;
  try {
    run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/driver.mjs'), fileURLToPath(import.meta.url)], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', fd, 'pipe'],
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

  // Fail closed on every way this can measure nothing while looking clean.
  const broken = out.screens.filter((s) => s.error);
  for (const s of broken) console.error(`::error::${s.url ?? s.page} screen ${s.screen} did not measure: ${s.error}`);
  if (broken.length) process.exit(1);

  if (out.pagesWalked !== PAGE_COUNT) {
    console.error(`::error::walked ${out.pagesWalked} game page(s), expected ${PAGE_COUNT} (every game in src/games/manifest.ts — its landing, or its play route where it declares one) — a page that never loaded reads exactly like a clean one.`);
    process.exit(1);
  }
  const controlsMeasured = out.screens.reduce((n, s) => n + s.controls.length, 0);

  // Two sets, two guards, each printing a number that comes from the expression describing it.
  const landingScreens = out.screens.filter((s) => s.kind !== 'play');
  const landingMeasured = landingScreens.reduce((n, s) => n + s.controls.length, 0);
  if (landingMeasured !== CONTROL_COUNT) {
    console.error(`::error::measured ${landingMeasured} rendered .game-btn control(s) on the /game/<id>/ landing pages, expected ${CONTROL_COUNT}. This count is the intended signal: a control stopped rendering, a new one started, or a screen stopped being reachable. Find out which, then re-record CONTROL_COUNT with the reason — never to make a run pass.`);
    process.exit(1);
  }
  // gh#170 — the play routes' anti-vacuity guard. A mockup's markup is inert HTML until its module
  // runs, so a page whose bundle broke still loads and still paints; only "it rendered nothing"
  // separates that from a page with no controls to measure.
  const playPages = [...new Set(out.screens.filter((s) => s.kind === 'play').map((s) => s.page))];
  const starved = playPages
    .map((id) => ({
      id,
      n: out.screens.filter((s) => s.page === id).reduce((n, s) => n + s.controls.length, 0),
    }))
    .filter((p) => p.n < PLAY_MIN_CONTROLS_PER_PAGE);
  for (const p of starved) {
    console.error(`::error::/game/${p.id}/play/ rendered ${p.n} measurable control(s) across both screens, under the ${PLAY_MIN_CONTROLS_PER_PAGE} minimum — the mockup markup is inert until its module runs, so a page that mounted nothing loads, paints, and measures clean.`);
  }
  if (starved.length) process.exit(1);

  if (BREAK_FLOOR) {
    // Control leg: the expected outcome is INVERTED, and every mutant must red on EVERY control — a
    // mutant that reds on some of them is a detector with a blind spot, not a calibration.
    // gh#170 — EACH LEG CARRIES ITS OWN DENOMINATOR, read off the same mutant array the numerator is
    // read off, and narrowed to the controls the claim actually applies to. Claims 1 and 2 assert
    // something about [id].astro's floor declarations, which only a .game-btn has, so tallying them
    // over the play-route buttons too would put ~200 permanently-not-applicable controls in the
    // denominator and no mutant could ever make the leg pass. Claim 3 applies to every control there
    // is, so its denominator is every control — that leg is the one the widening exists for.
    const tally = (key, claim, applies) => {
      let failed = 0, total = 0;
      for (const s of out.screens) {
        for (const c of s[key] ?? []) {
          if (!applies(c)) continue;
          total++;
          if (!claimsFor(c)[claim]) failed++;
        }
      }
      return { failed, total };
    };
    const floorOwned = (c) => c.floorOwned;
    const every = () => true;
    const legs = [
      { label: `floorless mutant -> claim 1 (a floor resolves), .game-btn only`, ...tally('floorless', 'hasFloor', floorOwned) },
      { label: `floorless mutant -> claim 3 (rect >= ${MIN_TAP_PX}px), every control`, ...tally('floorless', 'atLeastTap', every) },
      { label: `squashed mutant  -> claim 2 (rect >= resolved floor), .game-btn only`, ...tally('squashed', 'atLeastFloor', floorOwned) },
    ];
    let bad = false;
    for (const leg of legs) {
      // total === 0 is a leg that asserted nothing, and it must never read as a pass.
      const ok = leg.total > 0 && leg.failed === leg.total;
      if (!ok) bad = true;
      console.log(`${ok ? 'RED as expected' : 'NOT RED'}: ${leg.label} — ${leg.failed}/${leg.total} control(s)`);
    }
    if (bad) {
      console.error('::error::BREAK_FLOOR did not red every applicable control on all three claims (a leg with a 0 denominator asserted nothing) — the detector cannot see the hazards it exists to catch.');
      process.exit(1);
    }
    // The control leg holds ~0.5s per screen that the normal run does not, and these pages are
    // timer-driven, so screen 2 is reached at a later moment in the round and the measured set is not
    // the same size as the normal run's. Both are valid sets; neither is the other's baseline. Printed
    // so nobody reads the difference between the two totals as a regression.
    console.log(`OK control: every claim red on every control it applies to, across ${out.pagesWalked} game page(s) / ${controlsMeasured} control(s) at ${out.width}px (mutants applied inline with the important flag and reverted in the same evaluate; no file changed). This total is NOT comparable with the normal run's: the mutant settle holds ~${MUTANT_SETTLE_MS * 2}ms per screen and these games advance on their own clock, so screen 2 lands later in the round.`);
    return;
  }

  const violations = [];
  for (const s of out.screens) {
    for (const c of s.controls) {
      const k = claimsFor(c);
      if (!k.hasFloor || !k.atLeastFloor || !k.atLeastTap) violations.push(violationMsg(s, c, k));
    }
  }
  for (const v of violations) console.error(`::error::${v}`);
  if (violations.length) {
    console.error(`\n${violations.length} of ${controlsMeasured} rendered control(s) fail a floor claim at ${out.width}px (${landingMeasured} landing .game-btn, ${controlsMeasured - landingMeasured} play-route visible <button>).`);
    process.exit(1);
  }
  // gh#154 / ADR-0019 — the per-variant tally is printed because a variant with zero instances is a
  // claim this run did NOT test. `.game-btn-secondary` lost its only producer when the party game was
  // deleted, so its 56px floor is measured by nothing; the declaration still sits in [id].astro's
  // is:global block and would go on resolving even if it stopped reaching JS-created controls.
  // Landing screens only: `variant` is a .game-btn-primary/-secondary distinction, and a mockup
  // button lands in `bare` for the trivial reason that it carries neither class — folding ~200 of
  // those into this tally would drown the signal it exists to give.
  const byVariant = { primary: 0, secondary: 0, bare: 0 };
  for (const s of landingScreens) for (const c of s.controls) byVariant[c.variant] = (byVariant[c.variant] ?? 0) + 1;
  // Only the two variants that DECLARE their own floor in [id].astro can be unmeasured in the sense
  // that matters; `bare` is the no-variant bucket and declares nothing, so a zero there is not a gap.
  const unmeasured = ['primary', 'secondary'].filter((v) => byVariant[v] === 0);
  const unmeasuredNote = unmeasured.length
    ? ` · NOT MEASURED: zero .game-btn-${unmeasured.join(' and zero .game-btn-')} control(s) rendered anywhere in this walk — that floor is declared in [id].astro and exercised by nothing, so this green says nothing about it`
    : '';
  const playMeasured = controlsMeasured - landingMeasured;
  const perPlayPage = playPages
    .map((id) => `${id} ${out.screens.filter((s) => s.page === id).reduce((n, s) => n + s.controls.length, 0)}`)
    .join(', ');
  console.log(
    `OK ${controlsMeasured} rendered control(s) across ${out.pagesWalked} game page(s) at ${out.width}px, all clearing the ${MIN_TAP_PX}px tap minimum.\n` +
      `  landing .game-btn: ${landingMeasured} across ${landingScreens.length} screen(s) (primary ${byVariant.primary}, secondary ${byVariant.secondary}, bare ${byVariant.bare}) — all three claims asserted.${unmeasuredNote}\n` +
      `  play-route visible <button>: ${playMeasured} across ${playPages.length} route(s) — claim 3 ONLY. Claims 1 and 2 are NOT APPLICABLE there: they detect [id].astro's is:global floor block losing its reach, and a mockup at src/play/<id>/ never loads that block. Per route: ${perPlayPage}.`,
  );
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
