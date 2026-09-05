#!/usr/bin/env node
// gh#179 — PLAY-SCREEN FIT. Walks every play route PAST its setup screen and reports, per route and
// per viewport, whether the screen scrolls and what fraction of the viewport width its content fills.
//
// THE INVARIANT, one sentence: on every play route, at every viewport, the walk reaches at least one
// screen that is NOT the screen a fresh device opens on, and every screen it reaches there is
// measured for vertical scroll, horizontal clipping (gh#202) and horizontal width-fill.
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
//   overflowPx          max of the two above — the VERTICAL "does not fit" number, gated against
//                       FITS_ROWS / KNOWN_OVERFLOW.
//   overflowXPx         gh#202: the largest HORIZONTAL overflow (scrollWidth - clientWidth) on a box
//                       whose sideways spill is UNREACHABLE. IT IS A GATE OF ITS OWN, deliberately NOT
//                       folded into overflowPx, and it carries its own exemption map (KNOWN_OVERFLOW_X).
//                       Folding it in was tried and rejected in review: rowKey is route+viewport with no
//                       axis in it, so a KNOWN_OVERFLOW row granted for a VERTICAL reason would silently
//                       absorb a brand-new sideways clip on the same route and viewport. An exemption
//                       recorded about scrolling must not license clipping.
//                       Its partition is the VERTICAL one, mirrored, and countsAsHorizontalOverflow is
//                       the single expression of it: visible spill is skipped (it lands in an ancestor
//                       and is counted THERE), hidden/clip counts (unreachable), auto/scroll is exempt
//                       only when the author DECLARED the horizontal axis and the box is under 0.6 of
//                       the viewport HEIGHT. Height, not width, and that is deliberate: the bound asks
//                       "is this box a screen, or a strip inside one", and a roster chip strip is 0.88
//                       to 0.93 of the viewport WIDE while only 0.05 to 0.10 of it TALL. Bounding on
//                       width would red all five real chip strips, every one of which declares a
//                       genuine overflow-x. Screen-ness is what the vertical rule measures too.
//                       The declared-vs-computed distinction is not pedantry: per
//                       CSS Overflow 3 a computed overflow-x of visible becomes auto as soon as the
//                       OTHER axis is not visible/clip, so every box carrying overflow-y:auto reports
//                       computed overflow-x:auto and would have exempted itself without its author ever
//                       asking for a horizontal scroller. The lifted route stylesheets are full of them.
//   widthFillPct        (rightmost ink - leftmost ink) / innerWidth, over the VISIBLE INK inside the
//                       mockup root: leaf elements with text, plus canvas/img/svg/button/input. Boxes
//                       are not ink — a full-bleed background div would read 100% on a page whose
//                       content is a 320px column stranded in the middle of a 1440px screen, which is
//                       the finding this number exists to produce. position:fixed and <header>
//                       descendants are excluded for the same reason: a fixed corner control would
//                       peg every route at ~100% and measure nothing.
//
// WIRED as a walk leg and its BREAK_WALK control, SHARDED by route across the ci-probes lanes (see
// FIT_SHARD below): a shard's clean leg and its control always share a lane, because a different lane is
// a different Chrome and the control would stop being one-variable.
//   node scripts/play-screen-fit-probe.mjs               -> exit non-zero if any route x viewport never
//                                                           left its fresh screen, is unclassified or in
//                                                           both vertical sets, regressed past FITS_ROWS,
//                                                           or clips SIDEWAYS outside KNOWN_OVERFLOW_X
//   BREAK_WALK=1 node scripts/play-screen-fit-probe.mjs  -> control: no seeding AND no presses, so the
//                                                           walk stands still on the fresh screen.
//                                                           Exit 0 ONLY if EVERY route x viewport
//                                                           failed to leave it.
//   NO_SEED=1 NO_PRESS=1 node scripts/...                -> the same stranding under the NORMAL
//                                                           verdict: the loud red, naming every route.
//   ROUTES_ONLY=a,b                                      -> narrow a hand-run debug pass. Never in CI.
//   FIT_SHARD=i FIT_SHARDS=n                             -> CI ONLY, and it is NOT a narrowing: the walk
//                                                           is split across n legs that between them walk
//                                                           every route, so each leg still gates every row
//                                                           it produces. Setting it together with
//                                                           ROUTES_ONLY throws — one is a debug subset and
//                                                           the other is a partition, and a run cannot be
//                                                           both. Coverage is correct BY CONSTRUCTION here
//                                                           and enforced anyway: every success path prints
//                                                           a FIT_SHARD_WALKED line naming the ids it
//                                                           walked, and ci-probes.sh reds unless the clean
//                                                           legs' union and the control legs' union each
//                                                           equal the manifest exactly. A shard that was
//                                                           killed, never scheduled, or deleted from the
//                                                           lane list writes no line and the union comes up
//                                                           short — which is the one failure a per-leg exit
//                                                           code cannot see.
// It also default-exports a driver.mjs probe. Serve an ALREADY-BUILT dist/ on BASE and start Chrome
// on CDP_PORT first; this leg must never build.
//
// WHAT ITS GREEN DOES NOT MEAN — the blind spots, stated so nobody reads more into a pass:
//   * IT FIXES NOTHING AND SETS NO LAYOUT THRESHOLD. widthFillPct is REPORTED only, and an
//     overflowing row's recorded px is the number ONE machine measured (inferred: fonts — the runner
//     installs none and the play routes name none), so growth and "fixed" on a KNOWN_OVERFLOW row are
//     PRINTED, never gated. gh#179 is the measurement; gh#180/#181/#182/#183 own the layout. What a
//     layout commit must do: move the fixed row from KNOWN_OVERFLOW to FITS_ROWS in that same commit,
//     because FITS is the one px claim (0, within 8px) both machines agree on and it IS gated.
//     THE TWO AXES DIVERGE BY DIFFERENT ORDERS, and the corrected numbers are the ones each set
//     records rather than one figure quoted for both. VERTICALLY the recorded rows sit 4-28% apart on
//     the same commit. HORIZONTALLY the divergence is far larger and its own reasons say so: one
//     KNOWN_OVERFLOW_X row reads 145px on the CI runner against 43px here — a factor of 3.4, not a
//     percentage — and another moves between 0px and 75px, which is not a magnitude at all but a
//     change of VERDICT, since zero and non-zero are exactly what the sideways gate asserts. Any
//     future acceptance criterion over either axis's px therefore needs a different number, or a
//     per-route owner verdict, and not a threshold (owner ruling 2026-09-04).
//   * THE SMALL-BOX SKIP BLINDS THE HORIZONTAL AXIS, and the rationale written beside it is a
//     VERTICAL one. The scan drops any element with clientHeight <= 1 || clientWidth <= 1 because a
//     screen-reader-only box is 1px tall and its vertical spill is not a fit defect. On the SIDEWAYS
//     axis that same skip is a real blind spot with no rationale behind it: a box 1px tall and 3000px
//     wide, clipped, is dropped before countsAsHorizontalOverflow ever sees it, and so is any element
//     collapsed to zero width by its own clip. The skip is kept because the vertical reason for it
//     still holds and no route has shown such a box, not because the horizontal case was checked.
//   * THE COMPOSITION ROW (below, gh#203) IS REPORTED AND NOT GATED EITHER, on its values. Only its
//     COMPLETENESS is gated — that every route the leg walked produced one at the desktop viewport.
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
// Own ports, deliberately not any other script's: ci-probes.sh holds 4344/9344-9350 (9349-9350 are the fit shard lanes), control-floor
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
//                    'owner ruling <date>:' (the site owner accepted this screen as it is),
//                    'gh#182 open:' (nobody has ruled yet; the row is recorded, not blessed), or
//                    'not a defect <date>:' (the pixels were measured and attributed to a mechanism
//                    that is not a layout fault, so no fix is owed — the opposite claim to an owner
//                    ruling, and gated harder for it). A bare number with no prefix is not a reason
//                    and must not be added.
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
 * cannon-flag and power-meter are the 'not a defect' rows, moved out of 'gh#182 open' on 2026-09-04:
 * their numbers were attributed to a font metric and to a containing block, and each reads the SAME
 * px at all three viewports, which is the evidence the class is gated on.
 */
export const KNOWN_OVERFLOW = new Map([
  ['cannon-flag 320x568', 'not a defect 2026-09-04: 2px on press 1 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['cannon-flag 390x844', 'not a defect 2026-09-04: 2px on press 1 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['cannon-flag 1440x900', 'not a defect 2026-09-04: 2px on press 1 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['cursed-number 320x568', 'owner ruling 2026-09-01: 689px on press 1 - 689px to scroll on documentElement (accepted exception at 320x568, worst screen 2.21 viewports, removable blocks 252px vs 689px)'],
  ['cursed-number 390x844', 'owner ruling 2026-09-05: 317px on press 1 - 317px to scroll on documentElement. The 2026-09-01 exception named only 320x568 and the map recorded that nobody had ruled whether it covered the route or only that screen. Asked and answered 2026-09-05: it covers the ROUTE. So this row is accepted for the same reason the 320 row is, and cursed-number owes no fit fix at any viewport until the screen is redesigned'],
  ['cursed-number 1440x900', 'owner ruling 2026-09-05: 157px on press 1 - 157px to scroll on documentElement. Same 2026-09-05 route-scope ruling as the 390x844 row above. NOTE this number was never independently assessed: the 2026-09-01 reasoning measured 689px of overflow against 252px of removable blocks at 320x568, and nobody has done that arithmetic at 390 or 1440. The ruling accepts these rows on scope, not on a fresh trade-off'],
  // Moved from FITS_ROWS 2026-09-02: E1 bounded the self-scroller rule to boxes under 0.6x viewport
  // height, so a box that fills the screen (a scroll surface in name only) counts as page overflow
  // again. Measured under the bounded rule, not a regression in the page itself.
  ['freeze-tap 320x568', 'gh#182 open: 187px on press 1 - 187px to scroll on main#mainContent'],
  ['how-close-is-near 320x568', 'gh#182 open: 194px on press 4 - 194px to scroll on documentElement'],
  // gh#195, 2026-09-03: the NUMBER below does not move, and that is the recorded finding rather than
  // an omission. No layout changed on this route, and re-recording it at this run's 107px would only
  // make the next 136px run warn; 136 stays as the high end of the measured band. What DID change is
  // that the screen gh#195 asks about was measured, and it is NOT the screen this row reports.
  // MEASURED IN A REAL BROWSER (headless Chrome 152, CDP, a true 320x568 emulated viewport read back
  // as 320/568, against a real npm run build served from dist/): on the RESULTS screen the document
  // scrolls 244px, nothing in the chain from the results panel up to <html> clips, and scrolling to
  // 244 brings the last control fully into view - reachable. Identical at 4 and at 10 players.
  // THIS WALK CANNOT REACH THAT SCREEN, arithmetically: renderResults costs 1 press to start plus 3
  // per player (ready, answer, next), i.e. 1+3N, measured 13 at N=4, against PRESS_CAP 6 - and the
  // cheapest round, N=2, still needs 7. Raising the cap would not reach it either: this walk presses
  // the largest visible button and never forces a WRONG answer, and a correct round ends on
  // renderAllSafe instead. PROVED, not assumed: planting the fix gh#195 was filed about
  // (#app{height:100svh;max-height:100svh}) left this probe GREEN at exit 0 while the results panel
  // became unreachable (0px document scroll, 219px clipped by main#app) - and it moved this row to
  // 0px scroll / 81px clipped and the 390x844 row to 0px scroll, i.e. it read as an IMPROVEMENT.
  // WHAT MEASURES THAT SCREEN INSTEAD: src/play/pinocchio-luck/results-reachable.test.mjs, which
  // guards the CSS shape that keeps the panel reachable and carries every number above.
  ['pinocchio-luck 320x568', 'gh#182 open: 136px on press 1 - 136px to scroll on documentElement, 4px clipped by div.css-mouth; measured 107-136px across 15 runs (13x107, 1x116, 1x120, 1x136) plus 107px on a 16th run 2026-09-03, a self-timed screen per the press-timing note in the file header. This row measures press 1, NOT the results screen: gh#195 measured that one separately at 244px document scroll with nothing clipping and the last control reachable, and the comment above records why this walk cannot reach it and what guards it instead'],
  ['pinocchio-luck 390x844', 'gh#182 open: 14px on press 1 - 14px to scroll on documentElement, 4px clipped by div.css-mouth'],
  ['pinocchio-luck 1440x900', 'gh#182 open: 17px on press 2 - 17px to scroll on documentElement, 4px clipped by div.css-mouth'],
  ['power-meter 320x568', 'not a defect 2026-09-04: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['power-meter 390x844', 'not a defect 2026-09-04: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['power-meter 1440x900', 'not a defect 2026-09-04: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['short-stick 320x568', 'gh#182 open: 191px on press 0 - 191px to scroll on documentElement'],
  // Moved from FITS_ROWS 2026-09-02: same self-scroller bound as freeze-tap above.
  ['wire-snip-panic 320x568', 'gh#182 open: 111px on press 0 - 111px to scroll on div#screen-game.screen.active'],
  ['zero-trigger 320x568', 'gh#182 open: 131px on press 0 - 131px to scroll on section#screen-game.screen.active. RE-RECORDED UPWARD from 96px, measured this run on this Mac: gh#194 deliberately gives the player strip its real height (flex-shrink:0 in overrides.css), and that height is added to a screen that was already over. The growth is the fix, not a regression — a chip row nobody can see is not a saving. Promotion to FITS_ROWS is not owed here; this row still overflows by design until the 320px play screen is redesigned'],
]);
/**
 * gh#202 — the HORIZONTAL exemption map, and the reason it is a separate map rather than a column in
 * KNOWN_OVERFLOW above. rowKey is route plus viewport and carries no axis, so one shared map means one
 * exemption covers both axes: a row excused for 689px of vertical scrolling would silently absorb a
 * brand-new sideways clip on the same screen. Splitting the map is what keeps "this screen is allowed
 * to scroll" from ever meaning "this screen is allowed to cut content off sideways".
 *
 * THE SHAPE IS INVERTED FROM KNOWN_OVERFLOW's, on purpose and on evidence: measured across a full
 * 11-route walk, the horizontal axis reads ZERO on almost every row, so the honest default is GATED and
 * the exceptions are the short list. There is therefore no UNCLASSIFIED third state to police here — a
 * new route, a new viewport or a new screen is gated the moment it appears, without anyone pinning it.
 * Same reason-prefix rule as KNOWN_OVERFLOW, checked at import.
 */
export const KNOWN_OVERFLOW_X = new Map([
  // Every row below was FOUND BY THIS AXIS (gh#202), not carried over from anywhere, and all four land
  // on just TWO routes - wire-snip-panic and pinocchio-luck. They are recorded rather than fixed
  // because gh#202's scope is making sideways clipping visible; changing a route's layout is separate
  // work with its own owner call, tracked on that ticket. None is covered by that route's vertical
  // exemption, which is the whole point of this map being separate.
  //
  // THE RECORDED px IS THE LARGER OF TWO MACHINES, and the reason says both. This axis reads WILDLY
  // differently on a Mac and on the CI runner - one row moved 0 to 75px - because these are Thai-first
  // screens and the runner's font stack wraps their text differently. Recording the smaller reading
  // would make the growth warning fire forever on the other machine. Only rows that actually went red
  // on at least one machine are listed: a row that reads 0 on both is deliberately NOT pre-exempted,
  // because an exception nobody can trigger is the licence to regress this file refuses elsewhere.
  ['wire-snip-panic 320x568', 'gh#202 open: 145px on press 0 - UNDESIGNED SIDEWAYS SCROLL on div#screen-game.screen.active. CI runner 145px, this Mac 43px. Say scroll and not clipped, because the layout call depends on it: no author rule declares overflow-x on that box, so its computed auto is pure CSS Overflow 3 coercion from the overflow-y beside it - reachable by swipe, but nobody asked for a horizontal swipe on a play screen and nothing signals it is there. The vertical row for this same screen is excused separately and does not reach this'],
  ['wire-snip-panic 390x844', 'gh#202 open: 75px on press 0 - same undesigned sideways scroll on div#screen-game.screen.active as the 320x568 row above, same coercion. CI runner 75px, this Mac ZERO. This row is the reason no row here is trusted from one machine: it passed every local run and went red on the first CI run'],
  ['pinocchio-luck 320x568', 'gh#202 open: 11px on press 0 - the widest offender is an h1, so this is Thai text overflowing its own heading rather than a container mis-sized. CI runner 11px, this Mac ZERO, which is consistent with the runner wrapping Thai differently; docs/agents/ci-verification.md names a self-hosted Thai webfont as the converging fix and reserves it for the owner'],
  ['pinocchio-luck 390x844', 'gh#202 open: 10px on press 2 - sideways overflow on section#stageFrame. This Mac 10px, CI runner ZERO - the one row that runs the opposite way to the others. Check (vi) will therefore print its clear-row warning on CI asking for this row to be deleted: DO NOT act on that alone. Deleting it reds the Mac. Delete only when BOTH machines read it under tolerance'],
]);
/**
 * The overflow values that declare an element an intended scroller, on either axis. Anything else
 * (visible, hidden, clip, and any value a future CSS revision adds) is NOT a scroller declaration.
 * Kept as data, and exported, so scripts/play-screen-fit-probe.test.mjs can pin the partition without
 * driving a browser: it is closed, so both axes fail SAFE when the set of possible values grows.
 */
export const DECLARED_SCROLLER = ['auto', 'scroll'];
/**
 * A box that fills this fraction of the viewport is a SCREEN, not a widget, and its scroll is the
 * page's. Shared by both axes so the bound the owner ruling put on the vertical self-scroller rule is
 * the same bound the horizontal one gets, rather than the horizontal one having none.
 */
const SCREEN_FRACTION = 0.6;

/**
 * gh#202 — THE HORIZONTAL CLASSIFICATION, and the only place it is expressed. Injected verbatim into
 * MEASURE (it runs in the browser) and exported so scripts/play-screen-fit-probe.test.mjs can drive
 * every branch of it with no browser at all — which is what makes the horizontal axis able to fail a
 * unit test rather than only a full walk.
 *
 * It mirrors the vertical partition below, case for case, and the mirroring is the point:
 *   visible      — SKIPPED. Its spill lands in an ancestor and is counted there, exactly as the
 *                  vertical axis stopped counting visible-overflow boxes. Decorative overhang that
 *                  nothing clips is not unreachable content.
 *   hidden, clip — COUNTS. The content is cut off sideways and the player cannot reach it.
 *   auto, scroll — EXEMPT, but only against two independent conditions:
 *                  (a) the author actually DECLARED the horizontal axis (declaredX). Computed
 *                      overflow-x is worthless on its own here: CSS Overflow 3 turns a visible
 *                      overflow-x into auto whenever overflow-y is not visible/clip, so a box carrying
 *                      nothing but overflow-y:auto reports auto on X and would exempt itself.
 *                  (b) the box is not a SCREEN in disguise — the same bound the vertical axis puts on a
 *                      self-scroller, and deliberately the same EXPRESSION rather than the same axis
 *                      letter: clientHeight against SCREEN_FRACTION of innerHeight.
 *   the two roots — COUNT unconditionally, as they do vertically: html and body sliding sideways IS
 *                  the page not fitting.
 *
 * WHY THE BOUND IS MEASURED ON HEIGHT AND NOT ON WIDTH, which is the version review would expect. The
 * bound exists to catch a box that is really the SCREEN wearing a scroller's declaration, and screen-ness
 * is what the vertical rule already measures: a page-sized container is viewport-TALL. Mirroring the
 * letter instead of the meaning was tried and MEASURED WRONG here: every play route's roster chip strip
 * (wire-snip-panic .hud-player-strip, zero-trigger .player-strip-container, short-stick .player-strip)
 * is 88-93% of the viewport WIDE and 5-10% of it TALL, each carrying a real author-written
 * overflow-x:auto, and a width bound reported all five as unreachable content when a swipe reaches every
 * chip. A full-width, one-row-tall horizontal scroller is the normal shape of this widget; a full-HEIGHT
 * one is a page container, and that is the one this bound refuses to exempt.
 */
export function countsAsHorizontalOverflow({ isRoot, overflowX, declaredX, clientHeight, innerHeight }) {
  if (isRoot) return true;
  if (overflowX === 'hidden' || overflowX === 'clip') return true;
  if (!DECLARED_SCROLLER.includes(overflowX)) return false; // visible: counted in the ancestor instead
  return !(declaredX && clientHeight < SCREEN_FRACTION * innerHeight);
}
/** A pinned row may drift by this much without reading as a regression — under a line of text. */
export const OVERFLOW_TOLERANCE_PX = 8;
/** Sub-pixel slack: a scrollHeight and a clientHeight can disagree in the last fraction of a device px. */
const EPS = 1;

// GATE ON THE REASON STRING ITSELF: every KNOWN_OVERFLOW value must open with the prefix that carries
// its recorded px, so check (iv) below can parse it back out. A reason that drifts from this shape
// (a rewrite that drops the number, a typo in the ruling-date format) throws at import time instead of
// silently making check (iv) unable to find a number to compare against.
// THREE CLASSES, and the third is not a softer version of the second. 'owner ruling <date>' ACCEPTS a
// defect: the screen is wrong and the owner has decided to ship it anyway. 'not a defect <date>' makes
// the opposite claim — the pixels were measured and attributed, and there is nothing to fix. Being the
// stronger claim it carries the stricter gate, enforced below and not left to prose, in THREE parts:
//   * the reason NAMES the mechanism that produced the pixels — a real clause, not the substring. The
//     word has to stand on its own (a 'biomechanism:' passes a substring test and names nothing) and
//     carry a tail long enough to be an attribution rather than a shrug ('mechanism: unknown' is the
//     shape that has to be refused).
//   * the reason CITES THE OWNER RULING that licensed it, ticket and date, in the shape
//     NOT_A_DEFECT_LICENCE captures. THIS, and not the invariance, is what makes the class safe: the
//     pixels were measured and attributed by a named human decision, which is a thing a fresh red
//     cannot manufacture for itself.
//   * the SAME number is recorded at every viewport.
// WHAT INVARIANCE DOES AND DOES NOT RULE OUT, stated so no later reader inherits the stronger claim
// this comment used to make. It rules out a VIEWPORT-DEPENDENT defect, which is most of this map: a
// layout that breaks because the screen is narrow reads a different number at 320 than at 1440, so a
// row whose number moves is not the row the cited ruling looked at. It does NOT rule out a FIXED-SIZE
// defect: a fixed-height overflow:hidden card holding text that wraps identically at all three widths
// clips the same N px everywhere and is perfectly invariant while being an ordinary layout fault. So
// invariance is a CONSISTENCY CHECK on the cited ruling, never the proof on its own.
// The class never widens OVERFLOW_TOLERANCE_PX, and a row in it is still a row the probe measures
// against its recorded px like any other.
const KNOWN_OVERFLOW_PREFIX = /^(owner ruling \d{4}-\d{2}-\d{2}|gh#\d+ open|not a defect \d{4}-\d{2}-\d{2}): (\d+)px /;
const NOT_A_DEFECT = /^not a defect \d{4}-\d{2}-\d{2}: /;
// \b is what refuses 'biomechanism:', and the 12-character floor over a clause that runs to the next
// comma or full stop is what refuses an empty tail and a one-word non-answer. The floor is a crude
// lower bound on "an attribution was written here" and nothing more — no wording can be gated, and this
// does not try to.
const MECHANISM_CLAUSE = /\bmechanism: [^,.]{12,}/;
// The licence, captured rather than trusted as prose: which ticket ruled, and on what date.
const NOT_A_DEFECT_LICENCE = /\bProved by the (gh#\d+) owner ruling of (\d{4}-\d{2}-\d{2})\b/;
/**
 * What a person meeting an UNCLASSIFIED row is told to do. Held here, beside the classes it describes,
 * and exported so scripts/play-screen-fit-probe.test.mjs can assert it stays true about all three of
 * them — the advice went stale once already by listing two classes after a third had shipped, and an
 * omission in the only instruction a fresh red prints reads as an invitation to guess.
 * The third class is named and REFUSED in the same sentence deliberately: it is the one class a fresh
 * row can never open in, because its licence is an owner ruling that has already measured and
 * attributed those pixels, and no such ruling exists for a row nobody has looked at yet.
 */
export const UNCLASSIFIED_ADVICE = 'Measure the row, then either pin it as fitting (0px) or record it in KNOWN_OVERFLOW with a reason starting "owner ruling <date>:" (the owner accepted this screen as it is) or "gh#182 open:" (nobody has ruled yet). The third class, "not a defect <date>:", is never available to a fresh row: it requires an owner ruling that already measured and attributed these pixels, cited in the reason, and a row nobody has ruled on has none. Do not leave the row out of both sets.';
/**
 * Throws on any reason string that is not one of the three recorded classes, and on any not-a-defect
 * claim that does not carry its evidence. Exported because a gate that has only ever seen the shipped
 * (valid) maps has never been shown to REJECT: scripts/play-screen-fit-probe.test.mjs drives it with
 * throwaway maps to prove both directions without a browser.
 */
export function assertRecordedReasons(which, map) {
  // Every prefix is checked BEFORE any not-a-defect rule, because the invariance rule reads a sibling
  // row's number: a malformed sibling met mid-pass would otherwise fail on the unparsable string and
  // report a null dereference instead of naming the row that is actually wrong.
  for (const [key, reason] of map) {
    if (!KNOWN_OVERFLOW_PREFIX.test(reason)) {
      throw new Error(`${which}["${key}"] does not start with "<owner ruling YYYY-MM-DD|gh#N open|not a defect YYYY-MM-DD>: <N>px ": "${reason}"`);
    }
  }
  for (const [key, reason] of map) {
    if (!NOT_A_DEFECT.test(reason)) continue;
    if (!MECHANISM_CLAUSE.test(reason)) {
      throw new Error(`${which}["${key}"] claims "not a defect" but names no mechanism — the reason needs a standalone "mechanism: " clause naming what produced the pixels, not the substring: "${reason}"`);
    }
    // The LICENCE, checked before the invariance below, because invariance is only a consistency check
    // ON the cited ruling: a row with no ruling behind it has nothing for the numbers to be consistent
    // with, and reporting a viewport mismatch there would name the wrong defect.
    if (!NOT_A_DEFECT_LICENCE.test(reason)) {
      throw new Error(`${which}["${key}"] claims "not a defect" but cites no owner ruling — the class rests on a named human decision that measured and attributed the pixels, not on the number being viewport-invariant (a fixed-size defect is invariant too). Add "Proved by the gh#N owner ruling of YYYY-MM-DD": "${reason}"`);
    }
    const route = key.slice(0, key.lastIndexOf(' '));
    const px = KNOWN_OVERFLOW_PREFIX.exec(reason)[2];
    for (const vp of VIEWPORTS) {
      const sibling = map.get(`${route} ${vp.w}x${vp.h}`);
      const siblingPx = sibling && NOT_A_DEFECT.test(sibling) ? KNOWN_OVERFLOW_PREFIX.exec(sibling)[2] : null;
      if (siblingPx !== px) {
        throw new Error(`${which}["${key}"] claims "not a defect" at ${px}px, but "${route} ${vp.w}x${vp.h}" reads ${siblingPx === null ? 'another class or nothing' : `${siblingPx}px`} — the claim rests on the number being viewport-invariant, so it must hold at every viewport or it is a defect after all`);
      }
    }
  }
}
for (const [which, map] of [['KNOWN_OVERFLOW', KNOWN_OVERFLOW], ['KNOWN_OVERFLOW_X', KNOWN_OVERFLOW_X]]) {
  assertRecordedReasons(which, map);
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
  // FIT_SHARD/FIT_SHARDS is the OTHER knob and it is the opposite kind of thing: a partition, not a
  // subset. Each shard walks a full-strength gate over the rows it produces, and the shards between them
  // produce every row. Refusing the combination is not tidiness — ROUTES_ONLY prints "this is a debug
  // run, not a gate", and a run that is both a debug subset and a member of a partition would report one
  // shard's coverage under the other's verdict.
  const shardRaw = process.env.FIT_SHARD?.trim();
  const sharded = Boolean(shardRaw);
  if (sharded && only?.length) {
    throw new Error('ROUTES_ONLY and FIT_SHARD are both set — one narrows a debug run and the other partitions a gated one. Pick one.');
  }
  let ids = games.filter((g) => g.playRoute).map((g) => g.id).sort()
    .filter((id) => !only?.length || only.includes(id));
  if (sharded) {
    const i = Number(shardRaw);
    const n = Number(process.env.FIT_SHARDS?.trim());
    if (!Number.isInteger(n) || n < 1) throw new Error(`FIT_SHARDS must be an integer >= 1, got "${process.env.FIT_SHARDS}"`);
    if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error(`FIT_SHARD must be an integer in 0..${n - 1}, got "${shardRaw}"`);
    // A STRIDE over the sorted ids, never a contiguous block. The per-route cost of this walk is not
    // uniform — it is the mockup's own clock — so contiguous blocks would pack the neighbours the sort
    // happens to put together into one lane, and the lanes would finish at different times for a reason
    // nobody chose. Stride interleaves them.
    ids = ids.filter((_, idx) => idx % n === i);
  }
  if (!ids.length) throw new Error('no play routes derived from the manifest — refusing to report a vacuous pass');
  return ids;
};

/**
 * The shard this process is walking, as [index, count]; [0, 1] when unsharded, so a hand run prints the
 * same line shape a CI leg does. Read from the environment rather than passed around, for the same reason
 * playRoutes() reads ROUTES_ONLY there: one expression owns the knob.
 */
const shardOf = () => [Number(process.env.FIT_SHARD?.trim() || 0), Number(process.env.FIT_SHARDS?.trim() || 1)];
/**
 * The line scripts/ci-probes.sh's union check reads. It is printed on the SUCCESS path only, by both the
 * clean leg and the control leg, and it names the ids this process actually walked rather than the ones it
 * was asked for — a leg that died, was never scheduled, or was deleted from the lane list prints nothing,
 * and the union it belongs to comes up short. Which is exactly the failure EXPECTED_LEGS cannot see: that
 * number is human-maintained and blind to a route added to the manifest and to no shard.
 */
const shardWalkedLine = (routes) => {
  const [i, n] = shardOf();
  return `FIT_SHARD_WALKED ${BREAK_WALK ? 'control' : 'clean'} ${i}/${n} routes=${routes.join(',')}`;
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
  let overflowXPx = 0;
  let overflowXFrom = null;
  // The ONE list of computed overflow values that declare an element an intended scroller, shared by
  // both axes so there is a single idiom rather than two.
  const DECLARED_SCROLLER = ${JSON.stringify(DECLARED_SCROLLER)};
  const SCREEN_FRACTION = ${SCREEN_FRACTION};
  // gh#202 — the horizontal classifier, injected from the module scope so the browser and the unit test
  // run the SAME expression. Editing it in one place is the only way to edit it.
  ${countsAsHorizontalOverflow.toString()}
  // gh#202 — WHICH SELECTORS DECLARE THE HORIZONTAL AXIS. Collected once per measurement from this
  // page's own stylesheets, because a computed overflow-x cannot answer the question: CSS Overflow 3
  // computes a visible overflow-x to auto whenever overflow-y is not visible or clip, so every box in
  // the lifted route stylesheets that carries overflow-y:auto reports auto on X without its author
  // having declared a horizontal scroller at all. Reading the CASCADE INPUT instead of its output is
  // the only signal that separates the two. Cheap because the list is a handful of selectors: the
  // per-element cost is matches() against those, not a rule walk.
  // The overflow SHORTHAND sets both longhands, so a rule carrying it exposes overflow-x here and is
  // correctly treated as a horizontal declaration; a rule carrying overflow-y ALONE exposes nothing
  // and is correctly not. But EXPOSING a value is not DECLARING a scroller: overflow:hidden and
  // overflow:visible expose overflow-x too, and treating any exposed value as a declaration handed the
  // exemption to selectors whose author asked for the opposite. Only DECLARED_SCROLLER values declare.
  const declaresScroller = (v) => DECLARED_SCROLLER.includes((v || '').trim());
  // A CONDITIONAL GROUP declares nothing unless its condition holds AT THIS VIEWPORT. Walking into one
  // unconditionally let a desktop-only rule declare a horizontal scroller on the 320px screen, i.e. the
  // one signal this whole exemption path rests on failing OPEN. Non-conditional nesting (a nested style
  // rule, @layer) carries no condition and is still walked.
  // ponytail: a container query is read through CSS.supports here, which is not its grammar. Every
  // failure of this predicate is a REFUSAL to recurse, so an unevaluable condition ends GATED (a loud
  // red naming the box), never exempt. Evaluate it properly if a route ever ships one.
  const groupApplies = (rule) => {
    try {
      if (rule.media) return matchMedia(rule.media.mediaText).matches;
      if (typeof rule.conditionText === 'string') return CSS.supports(rule.conditionText);
    } catch (err) { return false; }
    return true;
  };
  const xDeclSelectors = [];
  for (const sheet of document.styleSheets) {
    let top; try { top = sheet.cssRules; } catch (err) { continue; } // a cross-origin sheet is not ours to read
    const walk = (list) => {
      for (const rule of list) {
        if (rule.style && rule.selectorText && declaresScroller(rule.style.getPropertyValue('overflow-x'))) xDeclSelectors.push(rule.selectorText);
        if (rule.cssRules && groupApplies(rule)) walk(rule.cssRules); // @media / @supports / nested
      }
    };
    walk(top);
  }
  const declaresX = (e) => {
    if (e.style && declaresScroller(e.style.getPropertyValue('overflow-x'))) return true;
    for (const sel of xDeclSelectors) { try { if (e.matches(sel)) return true; } catch (err) { /* an unmatchable selector declares nothing about e */ } }
    return false;
  };
  const desc = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '')).slice(0, 60);
  for (const e of [de, document.body, ...document.querySelectorAll('body *')]) {
    if (!e || (e !== de && e !== document.body && !visible(e))) continue;
    // A one-pixel clip box is the screen-reader visually-hidden pattern, not a scroll surface, and it
    // overflows by the height of whatever the announcer last said. MEASURED (gh#179): every route but
    // dice-loser reported a constant 20-23px of "clipped" content that was only #cf-live / #sr-announcer
    // and friends — a plausible number, on every route, describing nothing a player can see.
    if (e.clientHeight <= 1 || e.clientWidth <= 1) continue;
    const cs = getComputedStyle(e);
    const isRoot = e === de || e === document.body;
    // gh#202 — THE HORIZONTAL AXIS, classified by the module's countsAsHorizontalOverflow (injected
    // above), which mirrors the vertical partition below case for case. The declaredX argument is read
    // from the stylesheets, not from the computed value, for the CSS Overflow 3 reason stated there.
    // WHAT THIS CHECK DOES NOT COVER: this repo does not own what a mockup declares. Each route's
    // style.css is written byte-for-byte from the mockup by scripts/extract-mockup.mjs, so an
    // overflow-x:auto a mockup author genuinely wrote on a small play widget (freeze-tap's .preset-pills
    // is a real one) makes that element exempt here, and a screen clipping inside it would green
    // silently. The horizontal fit of content INSIDE a declared, sub-screen-width scroller is not
    // measured at all.
    const overX = e.scrollWidth - e.clientWidth;
    if (overX > ${EPS} && overX > overflowXPx && countsAsHorizontalOverflow({
      isRoot, overflowX: cs.overflowX, declaredX: declaresX(e), clientHeight: e.clientHeight, innerHeight,
    })) {
      overflowXPx = overX;
      overflowXFrom = desc(e);
    }
    const over = e.scrollHeight - e.clientHeight;
    if (over <= ${EPS}) continue;
    const oy = cs.overflowY;
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
    const isScroller = DECLARED_SCROLLER.includes(oy);
    // ponytail: 0.6 x viewport is a heuristic ceiling; a log or roster column sits well under it, a
    // screen container sits at or above it. Raise to a per-route declaration only if a real widget
    // crosses it. Failure direction: a box AT or ABOVE the line fails LOUD (its spill reads as page
    // overflow, an UNCLASSIFIED or regressed row names it); a screen container UNDER the line would
    // fail SILENT (its spill hidden as a designed scroller) — measured 2026-09-02, no route has one:
    // every .screen / main / #view-root is height:100%.
    const fillsViewport = isScroller && e.clientHeight >= SCREEN_FRACTION * innerHeight;
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
    docScrollPx, scrollPx, clippedPx, overflowXPx,
    // VERTICAL ONLY. overflowXPx is deliberately absent: it is gated separately against
    // KNOWN_OVERFLOW_X, because the exemptions in KNOWN_OVERFLOW are about scrolling.
    overflowPx: Math.max(scrollPx, clippedPx),
    // Named so a KNOWN_OVERFLOW reason can say WHICH box overflows instead of only by how much.
    scrollFrom, clipFrom, overflowXFrom,
    inkCount: n,
    inkLeft: n ? left : null, inkRight: n ? right : null,
    widthFillPct: n ? Math.round((span / innerWidth) * 1000) / 10 : 0,
  };
`;

// gh#203 — THE COMPOSITION ROW, at the desktop viewport only. A SECOND, FONT-INDEPENDENT reading of
// the same question widthFillPct asks, built because widthFillPct cannot answer it: its extents are
// GLYPH extents, this repo has a recorded CI-versus-Mac disagreement on the very same commit, and the
// site owner ruled on 2026-09-04 that a criterion in this ticket family needs a different number or a
// per-route verdict rather than a threshold over that one. So nothing below reads text, and nothing
// below is gated on its value.
//
// WHAT IT READS INSTEAD: the repo's OWN RESOLVED CSS and the layout boxes that CSS produced.
//   frameCap      the computed inline-size cap on the mockup root. 'none' means the route released
//                 the phone column (structural rule 1 in docs/agents/desktop-sizing-decisions.md);
//                 a px value means the frame is still a column of that width. Computed, not authored:
//                 a media block that never matched would still be greppable in the stylesheet.
//   tracks        the resolved grid-template-columns TRACK COUNT on the active screen. ONE track
//                 versus TWO OR MORE is the distinction gh#203 is actually about, and a track count
//                 is an integer that no font can move. 0 is reported when the value is 'none', i.e.
//                 the screen is not a grid at all — which is a different fact from a one-track grid.
//   unitSpanFrac  the merged x-span of the active screen's composition UNITS over the frame's width.
//   unitRanges    how many NON-OVERLAPPING x-ranges those units fall into. 2+ is side-by-side.
//
// THE THREE FILTERS THAT MAKE A UNIT, and each one is a false-green this reading would otherwise ship:
//   IN FLOW, OR OUT OF FLOW AND CARRYING TEXT. The box to exclude is the painted LAYER — a particle
//     canvas at inset:0, a theatre curtain, a flash overlay. It covers the whole window while
//     composing nothing, and counting it pegs unitSpanFrac at 1.0 on a route whose real surface is a
//     narrow centred column, which is precisely the finding this row exists to produce. But "out of
//     flow" alone is the WRONG test for it, and cannon-flag is the route that proves so: its screens
//     are position:absolute stacked on each other with only the active one visible, so an in-flow-only
//     filter read that route as having ZERO composition units — a void reading, not a verdict.
//     TEXT is what separates the two: a screen holds copy and labelled controls, a decoration layer is
//     media-only or empty. WHAT THAT DOES NOT COVER: a visible out-of-flow overlay that DOES carry
//     text — a full-window toast or a modal backdrop with a label — counts as a unit and would widen
//     the span. It is a real box the player is looking at, so counting it is defensible, but the row
//     would then describe the overlay's composition and not the screen's.
//   INK SOMEWHERE INSIDE, but the SPAN comes from the unit's own layout box. Ink presence is a
//     STRUCTURAL filter (does this subtree render anything at all) and is the only place text is
//     consulted; no measured number here is derived from a glyph extent. A background-only wrapper
//     holds no ink and is not a unit.
//   BIGGER THAN MIN_UNIT_PX ON BOTH AXES. The screen-reader visually-hidden pattern is a 1px box, and
//     one of those in flow would otherwise contribute a stray range of its own.
//
// THE ACTIVE SCREEN IS FOUND BY DESCENT, carrying no per-route selector — the same constraint the
// walk above is built under. From the frame, while there is EXACTLY ONE unit, descend into it. That
// walks a sole-wrapper chain (a panel wrap into its panel, a main into the one container that is not
// display:none) without knowing any of their names, and stops at the innermost element that actually
// holds more than one thing. Where it stops is REPORTED as screenDesc, so the row says what it read.
const MIN_UNIT_PX = 8;
const COMPOSITION = `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { ok: false, why: 'no mockup root' };
  const MEDIA = new Set(['CANVAS', 'IMG', 'SVG', 'VIDEO', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
  const inFlow = (e) => {
    const p = getComputedStyle(e).position;
    return p === 'static' || p === 'relative' || p === 'sticky';
  };
  const textIn = (e) => {
    if (!e.children.length) return Boolean((e.textContent || '').trim());
    for (const d of e.querySelectorAll('*')) {
      if (!visible(d) || d.closest('header')) continue;
      if (!d.children.length && (d.textContent || '').trim()) return true;
    }
    return false;
  };
  const inkIn = (e) => {
    if (MEDIA.has(e.tagName)) return true;
    if (textIn(e)) return true;
    for (const d of e.querySelectorAll('*')) {
      if (visible(d) && !d.closest('header') && MEDIA.has(d.tagName)) return true;
    }
    return false;
  };
  const unitsOf = (e) => [...e.children].filter((c) => {
    if (c.tagName === 'HEADER' || c.closest('header') || !visible(c) || !inkIn(c)) return false;
    if (!inFlow(c) && !textIn(c)) return false;
    const r = c.getBoundingClientRect();
    return r.width > ${MIN_UNIT_PX} && r.height > ${MIN_UNIT_PX};
  });
  // Descend past every sole wrapper. Used TWICE, and the second use is the one that matters: a
  // full-width flex wrapper holding one narrow centred child is a BOUNDING box, not a content box,
  // and measuring it reports a span of 1.0 for a surface that occupies a third of the frame. So each
  // unit is collapsed onto its own innermost multi-unit descendant before its x-extent is read.
  const deepest = (e) => {
    let at = e;
    for (let depth = 0; depth < 16; depth += 1) {
      const kids = unitsOf(at);
      if (kids.length !== 1) return at;
      at = kids[0];
    }
    return at;
  };
  const screen = deepest(root);
  const units = unitsOf(screen).map(deepest);
  const desc = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
  const scs = getComputedStyle(screen);
  const rcs = getComputedStyle(root);
  const cols = scs.gridTemplateColumns;
  const frameW = root.getBoundingClientRect().width;
  // Merged with a 1px join: two boxes that merely touch are one column, and a sub-pixel rounding
  // artefact must not invent a second range.
  const iv = units.map((u) => {
    const r = u.getBoundingClientRect();
    return [Math.max(r.left, 0), Math.min(r.right, innerWidth)];
  }).filter((p) => p[1] - p[0] > ${MIN_UNIT_PX}).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of iv) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const covered = merged.reduce((s, [a, b]) => s + (b - a), 0);
  return {
    ok: true, innerWidth, frameW: Math.round(frameW),
    frameDesc: desc(root),
    // maxInlineSize is the logical property the desktop layer authors; maxWidth is reported beside it
    // because a Chrome that does not expose the logical name would otherwise report undefined and
    // read exactly like an uncapped frame.
    frameCap: rcs.maxInlineSize || rcs.maxWidth,
    frameMaxWidth: rcs.maxWidth,
    screenDesc: desc(screen),
    screenDisplay: scs.display,
    gridTemplateColumns: cols,
    // COUNTED ONLY ON A REAL GRID. getComputedStyle returns USED track sizes (a plain px list) for a
    // grid container, which is what makes a whitespace split a correct count; on a non-grid it returns
    // the SPECIFIED value, where 'minmax(0, 1fr)' would split into two tokens and report a two-column
    // layout that does not exist. A non-grid screen has no track count, and 0 says so.
    tracks: (scs.display === 'grid' || scs.display === 'inline-grid') && cols && cols !== 'none'
      ? cols.trim().split(/\\s+/).length : 0,
    unitCount: units.length,
    // The units BY NAME and by their own x-extent. Without this the row states a range count with
    // nothing behind it, and the one thing that makes a composition reading arguable is being able to
    // see which boxes it counted.
    unitDescs: units.map((u) => {
      const r = u.getBoundingClientRect();
      return desc(u) + ' [' + Math.round(r.left) + '-' + Math.round(r.right) + ']';
    }),
    unitRanges: merged.length,
    unitSpanFrac: frameW > 0 ? Math.round((covered / frameW) * 1000) / 1000 : 0,
    sideBySide: merged.length >= 2,
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

/**
 * gh#203 — the desktop viewport the composition row is taken at, resolved from VIEWPORTS rather than
 * retyped, so adding or renaming a viewport cannot leave this pointing at one the walk never visits.
 */
const DESKTOP_W = Math.max(...VIEWPORTS.map((v) => v.w));
// Derived, never retyped. A hand-written "1440x900" here matches no row the moment VIEWPORTS changes
// its desktop height, and compositionGaps would then filter an EMPTY set and report zero gaps -- the
// completeness gate would go green by construction rather than by coverage.
const DESKTOP_VP = `${DESKTOP_W}x${VIEWPORTS.find((v) => v.w === DESKTOP_W).h}`;
const EVIDENCE_DIR = path.join(repoRoot, 'docs/verification/evidence/203');
const WRITE_SHOTS = process.env.COMPOSITION_SHOTS === '1' || !process.env.CI;

/**
 * gh#203 — read the composition row and, on a walking leg, put a screenshot of the SAME moment beside
 * it. The label is part of the filename and part of the row: a screenshot of an unnamed screen cannot
 * be reproduced, because "the play screen" is not a thing these routes have exactly one of.
 *
 * innerWidth is re-asserted here rather than trusted from the row's earlier check. The walk presses
 * the mockup's own controls between the two reads, and browser-verification.md trap 1 is that a read
 * taken at a width the page never reflowed to is VOID, not wrong — so a composition row is only
 * emitted at a proven 1440.
 */
async function capture(session, id, row, label, press) {
  const w = await session.evaluate('return innerWidth;');
  if (w.value !== DESKTOP_W) {
    row.error = `composition read at innerWidth ${w.value}, asked for ${DESKTOP_W} — the page never reflowed, so this read is void (docs/agents/browser-verification.md trap 1)`;
    return null;
  }
  const c = await session.evaluate(COMPOSITION);
  if (c.error || !c.value?.ok) {
    row.error = `composition read failed: ${c.error ?? c.value?.why}`;
    return null;
  }
  let shot = null;
  // Only a leg that actually walks writes evidence. Under BREAK_WALK/NO_PRESS every route stands on
  // its fresh screen, and letting the control leg write would overwrite the named game-screen images
  // with setup images carrying the same filenames.
  //
  // And only OFF CI. The images are gitignored and this file's own doc calls them "a convenience for
  // whoever still has the working tree" -- CI has no working tree afterwards, so on the runner they
  // are pure cost. That cost is not free: the lanes run in parallel, and on run 33964448528 every leg
  // on the box got slower while play-exit's burst dispatch blew its 400ms arm window. Nothing is
  // gated on a screenshot; compositionGaps gates on the ROW being present. COMPOSITION_SHOTS=1
  // forces them back on anywhere.
  if (!NO_PRESS && WRITE_SHOTS) {
    shot = path.join(EVIDENCE_DIR, `${id}-${DESKTOP_VP}-${label}.png`);
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    await session.screenshot(shot);
  }
  return {
    ...c.value, label, press,
    screenshot: shot ? path.relative(repoRoot, shot) : null,
  };
}

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
          // gh#203 — the composition row, taken on the FIRST screen that is not the fresh one, which
          // is the screen the label calls first-game-screen. Not the worst and not the last: the two
          // ranking rules above both pick by a px number, and a composition reading chosen by a px
          // number would inherit exactly the machine dependence it exists to avoid.
          if (vp.w === DESKTOP_W && !row.composition) {
            row.composition = await capture(session, id, row, 'first-game-screen', press);
          }
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
      // gh#203 — a route whose walk never left setup still owes a composition row, labelled for the
      // screen it really is. Otherwise the completeness check below could only ever red on a route
      // that errored, and a stranded route would read as one nobody asked about.
      if (vp.w === DESKTOP_W && !row.composition && !row.error) {
        row.composition = await capture(session, id, row, 'setup', null);
      }
    }
  }
  return { base: BASE, breakWalk: BREAK_WALK, routesWalked: routes.length, viewports: VIEWPORTS.length, rows };
}

/** The worst screen of a row: most overflow first, then least width-fill. The row a layout ticket wants. */
const worstOf = (r) => r.screens.slice().sort((a, b) => b.overflowPx - a.overflowPx || a.widthFillPct - b.widthFillPct)[0];
export const rowKey = (r) => `${r.route} ${r.vp}`;

/**
 * gh#202 — the row's worst HORIZONTAL screen, chosen independently of worstOf. Deliberately not
 * worstOf(r).overflowXPx: worstOf ranks by the vertical number, so on a row whose tallest screen is not
 * its widest, reading X off it would report 0px sideways while another screen of the same row cut
 * content off. The two axes rank their screens separately or one hides the other.
 */
const worstXOf = (r) => (r.screens || []).reduce(
  (worst, s) => ((s.overflowXPx ?? 0) > (worst.overflowXPx ?? 0) ? s : worst),
  { overflowXPx: 0, press: null, overflowXFrom: null },
);

/**
 * gh#202 — THE HORIZONTAL GATE, over a run's rows. Every row is gated by default and the exemption map
 * is the short list, which is why there is no UNCLASSIFIED case here: a route or viewport nobody pinned
 * is gated, not ignored.
 *
 * What it asserts is PRESENCE vs ABSENCE within OVERFLOW_TOLERANCE_PX, never a recorded pixel. That is
 * forced by this file's own header: the CI runner measured six rows 4-28% above this Mac's numbers with
 * no code change between the runs, so a px recorded here is one machine's. Zero-or-not survives both.
 *
 * Exported so scripts/play-screen-fit-probe.test.mjs can replay a SAVED run's rows through the real
 * gate with no browser — which is what makes the horizontal axis's BEHAVIOUR (not just its table) able
 * to fail a unit test.
 */
export const sidewaysOffenders = (rows) => rows
  .map((r) => ({ r, key: rowKey(r), x: worstXOf(r) }))
  .filter((o) => (o.x.overflowXPx ?? 0) > OVERFLOW_TOLERANCE_PX && !KNOWN_OVERFLOW_X.has(o.key));

/**
 * gh#203 — THE ONLY THING THE COMPOSITION ROW GATES: completeness. Not frameCap, not tracks, not
 * unitSpanFrac, not unitRanges — those are REPORTED, per the owner ruling of 2026-09-04 that this
 * ticket family's acceptance needs a different number or a per-route verdict rather than a threshold.
 *
 * The shape is the union-of-walked-ids idea scripts/ci-probes.sh already applies to the fit shards,
 * pulled inside one leg: the ids this leg WALKED at the desktop viewport, minus the ids that produced
 * a composition row there. A route that loaded, walked, and then read nothing is the one failure a
 * per-row exit code cannot see, because a missing reading and a route nobody asked about look
 * identical in the table.
 *
 * Exported so scripts/play-screen-fit-probe.test.mjs can red it with no browser.
 */
export const compositionGaps = (rows) => {
  const desktop = rows.filter((r) => r.vp === DESKTOP_VP);
  return desktop.filter((r) => !r.composition).map((r) => r.route).sort();
};

const fmtComposition = (r) => {
  const c = r.composition;
  if (!c) return `${r.route.padEnd(18)} NO COMPOSITION ROW`;
  return `${r.route.padEnd(18)} frame ${c.frameDesc} cap ${String(c.frameCap).padStart(7)}  screen ${c.screenDesc}  [${c.label}${c.press === null ? '' : ' press ' + c.press}]  display ${c.screenDisplay}  tracks ${c.tracks} (${c.gridTemplateColumns})  units ${c.unitCount} {${(c.unitDescs || []).join(' | ')}} in ${c.unitRanges} x-range(s)  span ${c.unitSpanFrac} of ${c.frameW}px frame  side-by-side ${c.sideBySide ? 'YES' : 'no'}${c.screenshot ? '  ' + c.screenshot : ''}`;
};

const fmt = (r) => {
  if (!r.screens.length) return `${r.route.padEnd(18)} ${r.vp.padEnd(9)} NEVER LEFT THE FRESH SCREEN`;
  const w = worstOf(r);
  // The sideways number is the row's own worst horizontal screen, not the worst VERTICAL screen's
  // horizontal number — otherwise the printed table would disagree with the gate that reads it.
  const x = worstXOf(r);
  return `${r.route.padEnd(18)} ${r.vp.padEnd(9)} scrolls ${(w.scrollPx > EPS ? 'YES' : 'no ').padEnd(3)} ${String(Math.round(w.scrollPx)).padStart(5)}px  clipped ${String(Math.round(w.clippedPx)).padStart(5)}px  sideways ${String(Math.round(x.overflowXPx ?? 0)).padStart(5)}px${x.overflowXFrom ? ' by ' + x.overflowXFrom : ''}  width-fill ${String(w.widthFillPct).padStart(5)}%  (${r.screens.length} screen(s), worst at press ${w.press}, ${w.inkCount} ink)${FITS_ROWS.has(rowKey(r)) ? ' [pinned fits]' : ''}${KNOWN_OVERFLOW_X.has(rowKey(r)) ? ' [sideways excepted]' : ''}`;
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
    // Re-based on THIS leg's route list, which is the shard's when FIT_SHARD is set: a leg can only
    // assert what it walked. That every shard together covers the manifest is asserted by ci-probes.sh
    // over the FIT_SHARD_WALKED lines, not here.
    console.error(`::error::${out.rows.length} route/viewport row(s), expected ${expectedRows} (${playRoutes().length} play route(s) this leg walks x ${VIEWPORTS.length} viewports) — a route that never loaded reads exactly like a clean one.`);
    process.exit(1);
  }

  // gh#203 — composition ROW COMPLETENESS, before either leg's verdict, because it is a statement
  // about readings and not about the walk: the control leg produces composition rows too (labelled
  // setup, and writing no screenshot), so a reading that silently stopped happening reds on both legs
  // instead of only on the one whose table someone reads.
  const gaps = compositionGaps(out.rows);
  for (const id of gaps) {
    console.error(`::error::/game/${id}/play/ at ${DESKTOP_VP} produced NO composition row (gh#203). The leg walked this route and read no resolved-CSS composition from it, which in the table below is indistinguishable from a route nobody asked about. Values in that row are reported and never gated; its PRESENCE is.`);
  }
  if (gaps.length) process.exit(1);
  for (const r of out.rows.filter((r) => r.vp === DESKTOP_VP)) console.log('::notice::' + fmtComposition(r));

  // The ids this run really produced rows for, read back off the rows rather than off playRoutes(): the
  // union check downstream is asking what was WALKED, and re-printing the request would answer a
  // different question.
  const walked = [...new Set(out.rows.map((r) => r.route))].sort();

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
    console.log(shardWalkedLine(walked));
    console.log(`OK control: all ${out.rows.length} route/viewport row(s) stayed on the fresh screen with both the seeding and the presses disabled — so the walk invariant CAN fail, and the screen signature is stable across the ${PRESS_CAP} press intervals the clean leg spends walking (a signature that drifted on its own would report "it left setup" about a walk that never moved).`);
    return;
  }

  for (const r of stuck) {
    console.error(`::error::${r.url} at ${r.vp}: every screen this walk reached still carries the signature of the screen a fresh device opens on — it never left setup, so any fit number from it would describe the setup screen. ${PRESS_CAP} presses, ${r.freshSigLen} chars of fresh copy.`);
  }
  if (stuck.length) process.exit(1);

  // The inverted guard. Only the rows recorded as scroll-free are asserted; the rest are reported.
  // A narrowed run cannot judge the pins it never walked, and must not be read as if it had.
  const narrowed = Boolean(process.env.ROUTES_ONLY?.trim());
  if (narrowed) console.log(`NARROWED by ROUTES_ONLY=${process.env.ROUTES_ONLY} — ${out.routesWalked} of ${games.filter((g) => g.playRoute).length} play route(s). This is a debug run, not a gate.`);
  // (i) EVERY produced row lands in exactly one set. A row in neither is the state this check exists
  // to kill: before it, a new route or a screen that started overflowing was simply "not pinned" and
  // printed into the report with nothing asserting anything about it.
  const unclassified = out.rows.map(rowKey).filter((k) => !FITS_ROWS.has(k) && !KNOWN_OVERFLOW.has(k));
  for (const k of unclassified) {
    console.error(`::error::"${k}" is UNCLASSIFIED — this run produced it and neither FITS_ROWS nor KNOWN_OVERFLOW holds it. ${UNCLASSIFIED_ADVICE}`);
  }
  const inBoth = out.rows.map(rowKey).filter((k) => FITS_ROWS.has(k) && KNOWN_OVERFLOW.has(k));
  for (const k of inBoth) {
    console.error(`::error::"${k}" is in BOTH FITS_ROWS and KNOWN_OVERFLOW — a row cannot both fit and be an accepted overflow, and whichever set is wrong is asserting nothing.`);
  }
  // (ii) STALE PINS LIVE IN scripts/play-screen-fit-probe.test.mjs NOW, and this is the only check that
  // moved. It is the one statement here about the WHOLE row set rather than about a row — "no set pins a
  // key nobody produces" cannot be decided by a leg that walks a third of the routes, and it was already
  // dead under a narrowed run for exactly that reason. It needs no measurement and no browser: the full
  // manifest x VIEWPORTS keyset is derivable from this module's own exports, which is where the test
  // computes it. Every other check below is per-row and stays here, where the rows are.
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
    console.error(`::error::${x.r.url} at ${x.r.vp} no longer fits VERTICALLY: ${Math.round(x.w.scrollPx)}px to scroll and ${Math.round(x.w.clippedPx)}px clipped away on a play screen (press ${x.w.press}). This row is pinned as fitting in FITS_ROWS from a recorded run, and the pin only ever moves toward MORE rows. Find what grew, then re-record with the reason — never to make a run pass.`);
  }
  // (v) gh#202, THE HORIZONTAL GATE, and it is a gate of its own rather than a term inside (iii)/(iv).
  // Every row is gated; KNOWN_OVERFLOW_X is the only exemption, and it is separate from KNOWN_OVERFLOW
  // so a row excused for vertical scrolling cannot absorb a new sideways clip. Presence vs absence
  // within the tolerance is asserted, never a recorded px — see sidewaysOffenders.
  const sideways = sidewaysOffenders(out.rows);
  for (const o of sideways) {
    console.error(`::error::${o.r.url} at ${o.r.vp} clips SIDEWAYS: ${Math.round(o.x.overflowXPx)}px of content is unreachable horizontally${o.x.overflowXFrom ? ` (widest offender ${o.x.overflowXFrom})` : ''} on a play screen (press ${o.x.press}). The horizontal axis is gated on every row by default and this one is not in KNOWN_OVERFLOW_X. A vertical exemption in KNOWN_OVERFLOW does not cover this: fix the layout, or record the row in KNOWN_OVERFLOW_X with a reason starting "owner ruling <date>:" or "gh#202 open:".`);
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
  // (vi) gh#202 — THE HORIZONTAL ANALOGUES OF (iii) AND (iv), and without them KNOWN_OVERFLOW_X is
  // write-only. A passing leg's log is discarded by standalone() in scripts/ci-probes.sh except for
  // lines carrying the warning marker, so the table line for an excepted row never reaches CI: an
  // exempted row could grow from 43px to 400px, or drop to nothing, and the run would stay green AND
  // silent. That is the whole risk of having exempted anything. WARNINGS, not gates, for the same
  // reason (iii) and (iv) are: a recorded px is what ONE machine measured (the 4-28% divergence above).
  // The under-tolerance trigger is OVERFLOW_TOLERANCE_PX and not zero, unlike (iii)'s: this axis has no
  // FITS_ROWS to promote into, so the action a cleared row asks for is DELETING the exception, and the
  // gate itself treats anything within the tolerance as not overflowing. Zero would never fire on a row
  // recorded a couple of px above the line, which is exactly the row most likely to have cleared.
  const exceptedX = out.rows
    .filter((r) => KNOWN_OVERFLOW_X.has(rowKey(r)))
    .map((r) => ({ r, x: worstXOf(r), reason: KNOWN_OVERFLOW_X.get(rowKey(r)) }))
    .map((e) => ({ ...e, px: e.x.overflowXPx ?? 0, recorded: recordedPx(e.reason) }));
  for (const e of exceptedX.filter((e) => e.px <= OVERFLOW_TOLERANCE_PX)) {
    console.warn(`::warning::${e.r.url} at ${e.r.vp} measured ${Math.round(e.px)}px SIDEWAYS, within the ${OVERFLOW_TOLERANCE_PX}px tolerance, against KNOWN_OVERFLOW_X "${e.reason}" — this row no longer clips sideways here. If that holds on the CI runner too, delete the row: an exception nobody can trigger is a licence to regress.`);
  }
  for (const e of exceptedX.filter((e) => e.px > e.recorded + OVERFLOW_TOLERANCE_PX)) {
    console.warn(`::warning::${e.r.url} at ${e.r.vp} measured ${Math.round(e.px)}px SIDEWAYS against a recorded ${e.recorded}px${e.x.overflowXFrom ? ` (widest offender ${e.x.overflowXFrom})` : ''} at press ${e.x.press}. Same machine as the recording? Then the sideways clip GREW past what was excused — fix it or re-record with the reason. Different machine? Fonts, not layout: leave the number alone.`);
  }
  if (unclassified.length || inBoth.length || regressions.length || sideways.length) process.exit(1);

  console.log(shardWalkedLine(walked));

  const measured = out.rows.reduce((n, r) => n + r.screens.length, 0);
  // Every number here comes from the expression that describes it: the asserted count is the rows
  // this run actually walked AND has a pin for, never FITS_ROWS.size, which a narrowed run would
  // print as coverage it does not have.
  const asserted = out.rows.filter((r) => FITS_ROWS.has(rowKey(r))).length;
  const excepted = out.rows.filter((r) => KNOWN_OVERFLOW.has(rowKey(r))).length;
  console.log(`OK ${out.rows.length} route/viewport row(s) left the fresh screen; ${measured} distinct play screen(s) measured across ${out.routesWalked} route(s) x ${out.viewports} viewport(s). ${asserted} row(s) asserted to fit within ${OVERFLOW_TOLERANCE_PX}px and ${excepted} row(s) held as recorded exceptions in KNOWN_OVERFLOW (reported, never gated: growth or a 0px reading prints a warning) — every produced row is in exactly one of the two sets. SIDEWAYS (gh#202) is a separate gate on its own set: all ${out.rows.length} row(s) are asserted to clip no more than ${OVERFLOW_TOLERANCE_PX}px horizontally except the ${out.rows.filter((r) => KNOWN_OVERFLOW_X.has(rowKey(r))).length} in KNOWN_OVERFLOW_X.`);
  // ::notice:: so it survives a PASS: standalone() in ci-probes.sh discards a green leg's log, and this
  // table carries "worst at press", which the FIT_SHARDS comment names as the signal to drop a shard.
  // A rollback trigger that only exists in an uploaded artifact is a rollback trigger nobody reads.
  for (const r of out.rows) console.log('::notice::' + fmt(r));
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
