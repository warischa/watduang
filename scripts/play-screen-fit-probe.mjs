#!/usr/bin/env node
// gh#179 — PLAY-SCREEN FIT. Walks every play route PAST its setup screen and reports, per route and
// per viewport, whether the screen scrolls and what fraction of the viewport width its content fills.
//
// THE INVARIANT, one sentence: on every play route, at every viewport, the walk reaches at least one
// screen that is NOT the screen a fresh device opens on, and every screen it reaches there is
// measured for vertical scroll, horizontal clipping (gh#202) and horizontal width-fill.
//
// WHY THE WALK IS THE HARD PART, and how it is proved rather than assumed. The ways a walk can
// silently stay on setup are owned by one separate mockup state machine per route; enumerating them never
// converges, and a fitting setup screen reported as a fitting play screen is exactly the false green
// this file exists to refuse. So the proof is DIFFERENTIAL and repo-owned, not per-route:
//   1. Load the route with storage wiped. That is, by construction, the screen a first-time device
//      sees — the setup/menu screen. Record its SIGNATURE.
//   2. Reload with a roster and a group seeded (since gh#264 every route mounts the shared player
//      screen, src/play/_player-screen/, which opens pre-filled from them; the per-route bridges and
//      their shared module that used to replay the roster into each mockup are retired), then press
//      the page's own controls.
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
//   NO_WEBGL=1 node scripts/play-screen-fit-probe.mjs    -> gh#264, its own leg (no-webgl-first-screen in
//                                                           ci-probes.sh): WebGL taken away before any page
//                                                           script, then ONLY the first-screen order verdict,
//                                                           every manifest route once at the narrow viewport.
//                                                           See NO_WEBGL_CONTEXTS for what it proves.
//   ROUTES_ONLY=a,b                                      -> narrow a hand-run debug pass. Never in CI.
//   FONT_READ=1                                          -> gh#287, REPORT-ONLY and dormant: no lane sets
//                                                           it and nothing is gated on it. Unset, this file
//                                                           behaves and prints exactly as without it. Set,
//                                                           every screen the walk measures is also asked
//                                                           which face SHAPED its Thai text (Chrome's
//                                                           CSS.getPlatformFontsForNode, not the declared
//                                                           stack), and FONT_READ lines stream out per
//                                                           screen. See FONT_READ below for the sets read.
//                                                           Shell-rendered games have no play route and no
//                                                           fit row, so they are outside it.
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
//     overflowing row's recorded px is the number ONE machine measured (fonts: until gh#287 the
//     runner had no Thai face at all, and since then it has Noto Sans Thai, which neither a Mac nor an
//     iPhone draws with), so growth and "fixed" on a KNOWN_OVERFLOW row are
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
//   * THE SELF-SCROLLER EXEMPTION BLINDS ANYTHING CLIPPED INSIDE ANY BOX IT EXEMPTS.
//     countsAsHorizontalOverflow exempts EVERY declared horizontal scroller occupying under
//     SCREEN_FRACTION of the viewport height — see its own docblock BELOW for that measurement. That
//     set is wider than the player chip strips: preset-pill rows and player-count rows on other
//     routes are declared x-scrollers too. So anything clipped inside any exempt box — a chip, a
//     pill, a control — is invisible to THIS probe.
//     Not a defect to narrow here: a width bound on the exemption would red every real chip strip.
//     WHAT COVERS PART OF IT: scripts/strip-chip-visibility-probe.mjs — but ONLY the routes that
//     mount the shared overflow counter, which is what its own staleness assert pins. An exempt
//     x-scroller on a route that mounts no counter is covered by NEITHER probe. Do not read this
//     bullet as saying the blind spot is covered; read it as saying where the covered part stops.
//   * THE COMPOSITION ROW (below, gh#203) IS REPORTED AND NOT GATED EITHER, on its values. Only its
//     COMPLETENESS is gated — that every route the leg walked produced one at the desktop viewport.
//   * It proves the measured screen is not the FRESH screen. It does not prove it is the round's main
//     screen: a pass-device or handoff screen satisfies the invariant, and on a route whose first
//     press lands there the reported numbers may be that screen's.
//   * PRESS_CAP presses per viewport, not every screen: a screen only reachable deeper into a round
//     (a result panel, a sudden-death branch) is never measured.
//   * One browser, one font. widthFillPct on a text-only screen moves with the font the runner has.
//   * A route that stops short of starting the match (the shared player screen opens on every load)
//     still has to be pressed there by this walk, so what it measures is whatever its controls reach.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
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
// 9 of 11 routes auto-started and were already off the fresh screen at press 0 -- a reading taken when
// the set was 11 routes, and NOT re-run since; it is left as the dated measurement it is rather than
// renumbered to a ratio nobody has measured. Only both together.
// NO_SEED and NO_PRESS are exposed separately so the same stranding can be watched failing under the
// NORMAL verdict — "the guard reds when the walk stays on setup" and "the guard's control passes" are
// different claims and one run cannot show both.
const NO_SEED = Boolean(process.env.BREAK_WALK || process.env.NO_SEED);
const NO_PRESS = Boolean(process.env.BREAK_WALK || process.env.NO_PRESS);
const BREAK_WALK = Boolean(process.env.BREAK_WALK);
// gh#287 — the platform-font read. Exactly "1", so a stray FONT_READ=0 stays off.
const FONT_READ = process.env.FONT_READ === '1';

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
  // Added 2026-09-09 (gh#213), the route's own landing change. All three rows measure ZERO on every
  // axis — scrolls no, clipped 0px, sideways 0px — confirmed on three consecutive probe runs rather
  // than one, because a single green here is a sample and this set GROWS ONLY.
  //
  // These rows did NOT arrive fitting, and the history is worth keeping because it explains a rule
  // in src/play/croc-bite/overrides.css. The 320x568 row first measured 57px clipped. An A/B with
  // only the gh#79 tap-floor block removed read 41px, so 16px came from raising the controls to 44px
  // and 41px was already in the lifted layout. The cause was NOT the controls: `.setup-box` stays
  // mounted with visibility:hidden rather than display:none once a round starts, so its height keeps
  // feeding #app's scrollHeight while it is invisible. Closed by reclaiming vertical spacing in
  // overrides.css — padding and gaps only, no content removed and no type shrunk below the site
  // floor — which is why that file raises heights and tightens spacing in the same breakpoint.
  //
  // Pinned as fitting rather than recorded as overflow on purpose: gh#213's own definition of done
  // refuses an overflow reason that is "merely `open`", and `gh#182 open:` is the only class this
  // probe offers a row nobody has ruled on. Fitting was the outcome that needed no owner ruling.
  'croc-bite 320x568',
  'croc-bite 390x844',
  'croc-bite 1440x900',
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
  // Added 2026-09-06: one-bomb, the twelfth play route. 0px on three consecutive dev-machine runs
  // against a real dist/ served on 4733 with CDP on 4744.
  'one-bomb 390x844',
  // Added 2026-09-06: bangkok-drift, the thirteenth play route. 0px scroll and 0px clipped at all
  // THREE viewports on three consecutive dev-machine runs against a real dist/ served on 4555 with
  // CDP on 9555. Attributed: its screens are fixed-position panels that own their own overflow-y, so
  // the walk's screens end at the viewport instead of pushing the document.
  // SCOPE, because 0px here is not "nothing scrolls on this route": the walk seeds three names, and a
  // hand-driven ten-seat setup on the same build scrolled 483px INSIDE the setup panel at 320x568
  // (239px at 375x812), with the last field and the start control both reachable. That scrolling is
  // the panel's own, which is exactly what this probe's self-scroller rule excludes, and no walk here
  // reaches ten seats — so these rows are a true reading of what is walked, not of every roster size.
  'bangkok-drift 320x568',
  'bangkok-drift 390x844',
  'bangkok-drift 1440x900',
  'one-bomb 1440x900',
]);
/**
 * gh#264 — the shared player screen (ADR-0071) is a LIST, and the owner ruled 2026-10-15 (popup) that
 * it may scroll. The exception is SCOPED TO THAT STATE, not to the route: a row named here stays in
 * FITS_ROWS, and only the screens measured while the player screen was open (`playerScreen`, read off
 * the page's own data-player-screen attribute) leave its gate. Every play screen of the same row is
 * still gated as fitting, so a round screen that grows still reds. Every value starts with
 * 'owner ruling <date>:' and must name the px it was recorded at, like KNOWN_OVERFLOW.
 */
export const PLAYER_SCREEN_SCROLLS = new Map([
  ['timebomb 320x568', 'owner ruling 2026-10-20: 71px on press 0 - 71px documentElement overflow on the shared player screen with 3 saved names. RE-RECORDED UPWARD from 15px by the 56px reserved top band of gh#268, measured on the integration run of 2026-10-20 (scripts/run-workflow-gates.sh, this Mac, n=1): the before-band run read 15px and the band build reads 71px, the 56px of the band. The start-button position quoted in the previous reason (bottom 559 of 568) predates the band and was not re-read here; no primary-control fold reading is produced for this route. Previously: owner ruling 2026-10-15: 15px on press 0 - 15px documentElement overflow on the shared player screen with 3 saved names (gh#264 popup). The screen is a list that scrolls by design (board frame 4, design/PlayerSetup.dc.html); measured with the start button bottom at 559 of 568, fully visible. A first visit at 4 rows needs 89px, and this walk never measures that screen: it is the fresh, unseeded one. Play screens of this row stay pinned as fitting.'],
  ['dice-loser 320x568', 'owner ruling 2026-10-20: 70px on press 0 - 70px documentElement overflow on the shared player screen with the seeded names. RE-RECORDED UPWARD from 14px by the 56px reserved top band of gh#268, measured on the integration run of 2026-10-20 (scripts/run-workflow-gates.sh, this Mac, n=1): the unsharded before-band run read 14px and the band build reads 70px, the 56px of the band. The growth is the band, not a regression. Unlike the freeze-tap row no primary-control fold reading is produced for this route, so none is cited. Previously: owner ruling 2026-10-15: 14px on press 0 - 14px documentElement overflow on the shared player screen with the seeded names (gh#264 popup: the shared player screen may scroll), measured on the gh#264 integration run 2026-10-15. The route now opens on the shared list; its own rule picker and play screens stay pinned as fitting.'],
  ['bangkok-drift 320x568', 'owner ruling 2026-10-20: 126px on press 0 - 126px documentElement overflow on the shared player screen with the seeded names. RE-RECORDED UPWARD from 70px by the 56px reserved top band of gh#268, measured on the integration run of 2026-10-20 (scripts/run-workflow-gates.sh, this Mac, n=1): the before-band run read 70px and the band build reads 126px, the 56px of the band. The growth is the band, not a regression. No primary-control fold reading is produced for this route. Previously: owner ruling 2026-10-15: 70px on press 0 - 70px documentElement overflow on the shared player screen with the seeded names (gh#264 popup: the shared player screen may scroll), measured on the gh#264 integration run 2026-10-15. The route keeps its title and long intro above the list (moved byte-identical from its old setup), which is most of the height. Play screens stay pinned as fitting.'],
]);

/** The screen a FITS_ROWS row is gated on: its worst screen, minus the player-screen state where
 *  PLAYER_SCREEN_SCROLLS scopes an owner ruling to it. A row whose every screen is excepted gates on
 *  nothing and reads 0px. */
export function gatedWorstOf(r) {
  const scoped = PLAYER_SCREEN_SCROLLS.has(rowKey(r));
  const screens = (r.screens || []).filter((s) => !(scoped && s.playerScreen));
  return screens.slice().sort((a, b) => b.overflowPx - a.overflowPx || a.widthFillPct - b.widthFillPct)[0]
    ?? { overflowPx: 0, scrollPx: 0, clippedPx: 0, press: null };
}

/**
 * Row -> why it is allowed to overflow. Recorded 2026-09-02 from three consecutive full runs; the
 * numbers are what those runs measured (they agreed to the pixel on every row in this map), not what
 * a fix is expected to leave behind. cursed-number is the only row carrying an owner ruling, and that ruling
 * names ONE viewport: its 390 and 1440 rows are 'gh#182 open', because whether the exception is the
 * route or only the 320 screen has not been ruled on.
 * cannon-flag and power-meter were the 'not a defect' rows, moved out of 'gh#182 open' on 2026-09-04:
 * their numbers were attributed to a font metric and to a containing block, and each read the SAME
 * px at all three viewports, which is the evidence that class is gated on. Owner ruling 2026-10-20
 * (popup, batch S2026-10-20) reclassed all six of those rows to 'owner ruling': the 56px reserved top
 * band made the 320x568 row of each route read a different px than its 390x844 and 1440x900 siblings,
 * so the invariance no longer holds. Each reason keeps the old text after 'Previously:'. No row here
 * is in the 'not a defect' class now; the class and its gate stay for a future row.
 */
export const KNOWN_OVERFLOW = new Map([
  ['cannon-flag 320x568', 'owner ruling 2026-10-20: 20px on press 0 - 20px to scroll on section#cf-players.cf-players.ps, 0px clipped. That is the shared player screen (the .ps class), which the gh#264 owner ruling of 2026-10-15 (popup: the shared player screen may scroll) already allows to scroll. The 2px clip by div.power-gauge-container is still read on press 2 at this viewport; mechanism of that 2px: font half-leading inside a 14px gauge. RE-CLASSED from not-a-defect by owner ruling 2026-10-20 (popup, batch S2026-10-20; recorded on gh#182 comment 6292773677): this row no longer reads the same px as its 390x844 and 1440x900 siblings (2px each, measured in the same run), which the not-a-defect class requires. Measured on this Mac (dist served on 4601, ROUTES_ONLY=cannon-flag,power-meter, n=3 identical runs, offenders read off the driver JSON). The growth is MEASURED, from the unsharded pre-band and band builds of gh#268 (docs/verification/evidence/gh268-2026-10-20/box3-fit-before-after.json, one run each): this row read scroll 0 / clip 2 before and reads scroll 20 / clip 0 after, so the worst screen moved from the 2px clip to the 20px scroll across the band commit 35302a8; the 20px sits on the first screen at 320 only. Previously: not a defect 2026-09-04: 2px on press 1 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['cannon-flag 390x844', 'owner ruling 2026-10-20: 2px on press 2 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge. RE-CLASSED from not-a-defect by owner ruling 2026-10-20 (popup, batch S2026-10-20; recorded on gh#182 comment 6292773677), because the 320x568 sibling no longer reads the same px. This viewport is unchanged: 2px, now read on press 2 (press 1 reads 0px), n=3 identical runs on this Mac. Previously: not a defect 2026-09-04: 2px on press 1 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['cannon-flag 1440x900', 'owner ruling 2026-10-20: 2px on press 2 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge. RE-CLASSED from not-a-defect by owner ruling 2026-10-20 (popup, batch S2026-10-20; recorded on gh#182 comment 6292773677), because the 320x568 sibling no longer reads the same px. This viewport is unchanged: 2px, now read on press 2 (press 1 reads 0px), n=3 identical runs on this Mac. Previously: not a defect 2026-09-04: 2px on press 1 - 2px clipped by div.power-gauge-container; mechanism: font half-leading inside a 14px gauge, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['cursed-number 320x568', 'owner ruling 2026-09-01: 689px on press 1 - 689px to scroll on documentElement (accepted exception at 320x568, worst screen 2.21 viewports, removable blocks 252px vs 689px)'],
  ['cursed-number 390x844', 'owner ruling 2026-09-05: 317px on press 1 - 317px to scroll on documentElement. The 2026-09-01 exception named only 320x568 and the map recorded that nobody had ruled whether it covered the route or only that screen. Asked and answered 2026-09-05: it covers the ROUTE. So this row is accepted for the same reason the 320 row is, and cursed-number owes no fit fix at any viewport until the screen is redesigned'],
  ['cursed-number 1440x900', 'owner ruling 2026-09-05: 157px on press 1 - 157px to scroll on documentElement. Same 2026-09-05 route-scope ruling as the 390x844 row above. NOTE this number was never independently assessed: the 2026-09-01 reasoning measured 689px of overflow against 252px of removable blocks at 320x568, and nobody has done that arithmetic at 390 or 1440. The ruling accepts these rows on scope, not on a fresh trade-off'],
  // Moved from FITS_ROWS 2026-09-02: E1 bounded the self-scroller rule to boxes under 0.6x viewport
  // height, so a box that fills the screen (a scroll surface in name only) counts as page overflow
  // again. Measured under the bounded rule, not a regression in the page itself.
  // Re-measured 2026-09-15 after the pass screen's own fix (src/play/freeze-tap/overrides.css):
  // playerReadyBtn on press 1 now reads 0px overflow (confirmed n=12 dev-machine runs, both of the
  // route's two card states, docs/verification/evidence/182-freeze-tap-fold-2026-09-15/). The number
  // moved because a DIFFERENT screen is now the route's worst: press 0 (rule-reveal, ruleReadyBtn) was
  // already at 92px overflow / 0 visible px on the unmodified overrides.css (confirmed by A/B), just
  // masked in the old 187px reading because press 1 was worse. Not fixed by that change — out of
  // scope there, a different screen and a different control. Closed 2026-09-15 by a second
  // overrides.css block scoped to `.rule-reveal-container`; row moved to FITS_ROWS above.
  ['how-close-is-near 320x568', 'owner ruling 2026-10-20: 60px on press 0 - 60px to scroll on the shared player screen with the seeded names (the worst screen is the player screen, not a round screen; the box that scrolls was not read). Accepted by owner ruling 2026-10-20 (popup, batch S2026-10-20#3), resting on the existing owner ruling 2026-10-15 (gh#264 popup: the shared player screen may scroll). Found by the gh#284 screen-class check: the 2026-09-15 ruling below was made on a round screen, and no round screen reads near its 194px any more. The largest round screen reads 18px on press 5 (presses 1-5 read 3/0/0/0/18px), above the 8px OVERFLOW_TOLERANCE_PX, which is why this row stays in KNOWN_OVERFLOW and does not move to FITS_ROWS. Measured on this Mac 2026-10-20 with the ci-probes.sh lane flags (--headless --disable-gpu --no-sandbox), n=4 identical runs (one unsharded, three with ROUTES_ONLY), evidence docs/verification/evidence/gh284-2026-10-20/. The 2026-09-11 primary-control reading the previous ruling rests on predates the shared player screen and the band and was not repeated here. Previously: owner ruling 2026-09-15: 194px on press 4 - 194px to scroll on documentElement. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned.'],
  // gh#195, 2026-09-03: the NUMBER below does not move, and that is the recorded finding rather than
  // an omission. No layout changed on this route, and re-recording it at this run's 107px would only
  // make the next 136px run warn; 136 stays as the high end of the measured band. What DID change is
  // that the screen gh#195 asks about was measured, and it is NOT the screen this row reports.
  // gh#282, 2026-10-20: the three rows below WERE re-recorded after all - the number moved because the
  // route opened on the shared player screen (gh#264) and then took the gh#268 top band, so the worst
  // screen became the player screen. Each reason carries the old text after "Previously:".
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
  ['pinocchio-luck 320x568', 'owner ruling 2026-10-20: 270px on press 0 - 270px to scroll on documentElement, nothing clipped, on the shared player screen with the seeded names (the worst screen is the player screen, not a round screen). Cause: the first bad commit 469980e "feat(gh#264): pinocchio-luck on the shared player screen" (gh#282 bisect, evidence docs/verification/evidence/gh282-2026-10-20/), which makes the seeded load open on that screen; the player screen alone read 212-214px at the bisect and before the band, later growth unbisected, plus the 56px reserved top band of gh#268. Accepted by owner ruling 2026-10-20 (popup, batch S2026-10-20#2), resting on the existing owner ruling 2026-10-15 (gh#264 popup: the shared player screen may scroll). Measured on this Mac 2026-10-20 on the band build, no-WebGL fallback lane, n=3 (270px on all three runs). The round screens (presses 1-3) read 63px / 163-176px / 82px with 4px clipped by div.css-mouth: the 2026-09-15 round-screen figures plus the band, not unchanged. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned. That 2026-09-11 reading predates the shared player screen and the band and was not repeated here. Previously: owner ruling 2026-09-15: 136px on press 1 - 136px to scroll on documentElement, 4px clipped by div.css-mouth; measured 107-136px across 15 runs (13x107, 1x116, 1x120, 1x136) plus 107px on a 16th run 2026-09-03, a self-timed screen per the press-timing note in the file header. This row measures press 1, NOT the results screen: gh#195 measured that one separately at 244px document scroll with nothing clipping and the last control reachable, and the comment above records why this walk cannot reach it and what guards it instead. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned.'],
  ['pinocchio-luck 390x844', 'owner ruling 2026-10-20: 170px on press 0 - 170px to scroll on documentElement, nothing clipped, on the shared player screen with the seeded names (the worst screen is the player screen, not a round screen). Cause: the first bad commit 469980e "feat(gh#264): pinocchio-luck on the shared player screen" (gh#282 bisect, evidence docs/verification/evidence/gh282-2026-10-20/), which makes the seeded load open on that screen; the player screen alone read 112px at that commit and 114px just before the band (the extra 2px, panel-wrap 514 to 516, is unbisected), plus the 56px reserved top band of gh#268. Accepted by owner ruling 2026-10-20 (popup, batch S2026-10-20#2), resting on the existing owner ruling 2026-10-15 (gh#264 popup: the shared player screen may scroll). Measured on this Mac 2026-10-20 on the band build, no-WebGL fallback lane, n=3 (170px on all three runs). The round screens (presses 1-3) read 4px / 70px / 4px with 4px clipped by div.css-mouth: the 2026-09-15 round-screen figures (4/14/4px) plus the band on the one that scrolled (14 to 70px). The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned. That 2026-09-11 reading predates the shared player screen and the band and was not repeated here. Previously: owner ruling 2026-09-15: 14px on press 1 - 14px to scroll on documentElement, 4px clipped by div.css-mouth. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned.'],
  ['pinocchio-luck 1440x900', 'owner ruling 2026-10-20: 174px on press 0 - 174px to scroll on documentElement, nothing clipped, on the shared player screen with the seeded names (the worst screen is the player screen, not a round screen). Cause: the first bad commit 469980e "feat(gh#264): pinocchio-luck on the shared player screen" (gh#282 bisect, evidence docs/verification/evidence/gh282-2026-10-20/), which makes the seeded load open on that screen; the player screen alone read 116-118px before the band, plus the 56px reserved top band of gh#268. Accepted by owner ruling 2026-10-20 (popup, batch S2026-10-20#2), resting on the existing owner ruling 2026-10-15 (gh#264 popup: the shared player screen may scroll). Measured on this Mac 2026-10-20 on the band build, no-WebGL fallback lane, n=3 (174px on all three runs). The round screens (presses 1-3) read 34px / 4px / 4px (one run of three read 73px on press 3) with 4px clipped by div.css-mouth. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned. That 2026-09-11 reading predates the shared player screen and the band and was not repeated here. Previously: owner ruling 2026-09-15: 17px on press 2 - 17px to scroll on documentElement, 4px clipped by div.css-mouth. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned.'],
  ['power-meter 320x568', 'owner ruling 2026-10-20: 100px on press 4 - 100px to scroll on main#view-root and 76px clipped by div#app-container (81px to scroll on div.modal-content on presses 0-3, 5 and 6); mechanism: a parked toast resting below a containing block created by will-change, which is the 76px clip. RE-CLASSED from not-a-defect by owner ruling 2026-10-20 (popup, batch S2026-10-20; recorded on gh#182 comment 6292773677): this row now also scrolls at 320x568 while its 390x844 and 1440x900 siblings read 0px scroll and the same 76px clip, so it no longer reads the same px at every viewport. Measured on this Mac (dist served on 4601, ROUTES_ONLY=cannon-flag,power-meter, n=3 identical runs, offenders read off the driver JSON). The recorded 76px was the CLIP, and it is unchanged. The 81px scroll on div.modal-content was ALREADY present before the band (unrecorded), measured on the unsharded pre-band build of gh#268 (docs/verification/evidence/gh268-2026-10-20/box3-fit-before-after.json: scroll 81 / clip 76 before, scroll 100 / clip 76 after); the band commit 35302a8 added 19px to the scroll (81 to 100). Previously: not a defect 2026-09-04: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['power-meter 390x844', 'owner ruling 2026-10-20: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change. RE-CLASSED from not-a-defect by owner ruling 2026-10-20 (popup, batch S2026-10-20; recorded on gh#182 comment 6292773677), because the 320x568 sibling no longer reads the same px. This viewport is unchanged: 76px clipped, 0px to scroll, identical on every press, n=3 identical runs on this Mac. Previously: not a defect 2026-09-04: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  ['power-meter 1440x900', 'owner ruling 2026-10-20: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change. RE-CLASSED from not-a-defect by owner ruling 2026-10-20 (popup, batch S2026-10-20; recorded on gh#182 comment 6292773677), because the 320x568 sibling no longer reads the same px. This viewport is unchanged: 76px clipped, 0px to scroll, identical on every press, n=3 identical runs on this Mac. Previously: not a defect 2026-09-04: 76px on press 0 - 76px clipped by div#app-container; mechanism: a parked toast resting below a containing block created by will-change, invariant at all three viewports. Proved by the gh#182 owner ruling of 2026-09-04, not a layout defect and no fix is owed'],
  // Moved from FITS_ROWS 2026-09-22: the pin was set by an instrument that could not see the
  // draw it was pinning. gh#182 reopened for this row; gh#239 carries the probe fix.
  ['freeze-tap 320x568', 'owner ruling 2026-10-20: 37px on press 0 - 37px to scroll, 0px clipped. RE-RECORDED DOWNWARD from 51px by gh#281: variant A of design/Gh281FreezeTapReady.dc.html (owner approval 2026-10-20, popup, batch S2026-10-20#2) is now in src/play/freeze-tap/overrides.css, and the pass screen (press 2) reads 0px, was 51px. Measured this Mac, n=1 per build, same walk and ROUTES_ONLY=freeze-tap, docs/verification/evidence/gh281-2026-10-20/fit-before.txt vs fit-after.txt: press 0 37px and press 1 26px read identically on the unchanged build, so the worst screen is now press 0, which this change does not touch, and the row stays here rather than in FITS_ROWS. Press 0 is the shared player screen (section#ftPlayers.ft-players.ps in fit-after.txt), which the gh#264 owner ruling of 2026-10-15 lets scroll, as the dice-loser 320x568 row records. PRIMARY CONTROL: playerReadyBtn reads 60 visible px of 60 below the 56px band on every one of the 9 forced draws (top 476.86, bottom 536.86, elementFromPoint at its centre hits it), was 39 of 60 on seven draws and 12 of 60 on two (ready-before.json vs ready-after.json, same directory). Previously: owner ruling 2026-10-20: 51px on press 2 - 51px to scroll, 0px clipped. RE-RECORDED UPWARD from 12px, measured on the integration run of 2026-10-20 (scripts/run-workflow-gates.sh, this Mac, n=1): the unsharded before-band run on the same Mac read 0px, and the band build reads 51px, so the growth is the 56px reserved top band of gh#268 (the 12px being recorded was a CI-runner figure, a different machine). PRIMARY CONTROL, same run: playerReadyBtn reads 17 visible px of 60 (top 551, bottom 611, press 2 draw 0.8333) - partly visible, not 0, so the standing reading of the 2026-09-10 rule (0 visible px violates it, partly visible does not) holds. A partly hidden ready button at 320px under the band is tracked in gh#281. Previously: owner ruling 2026-09-22: 12px on press 1 - 12px to scroll and 0px clipped on the pass screen. REPRODUCED on CI run 35687379298 attempts 1 and 2 of the same commit da75294, both reporting 12px at press 1 while presses 4, 5 and 6 read 0px. This row was in FITS_ROWS from an owner ruling 2026-09-15 whose evidence was 0px on three consecutive dev-machine runs; that instrument graded whichever of the nine TRIGGER_CONDITIONS an unseeded pick drew, and on a dev machine every draw reports the same numbers, so those three runs could not see the tall draw. gh#239 made the probe enumerate every draw and the tallest one overflows. This reason does not itself invoke the 2026-09-10 primary-control rule, and a first version of it wrongly said the fold had never been checked here. It has: on a Mac at c6e75ca, n=12 across both card states, playerReadyBtn reads 60 visible px on every load with the pass-screen container at 0 overflow, recorded under docs/verification/evidence/182-freeze-tap-fold-2026-09-15. MEASURED ON THE RUNNER 2026-09-22, CI run 35694044038, on the very draw that produces this 12px: draw index 7 of 9 won the worst-per-press merge and playerReadyBtn reads 72 visible px of 76, top 496 bottom 572. Partly visible, and the standing reading is that 0 visible px violates the 2026-09-10 rule while partly visible does not, so that rule IS satisfied here on the machine that produces the overflow. The same tree read 60 of 60 on a Mac, which also settles the re-measure 6dbaf71 left owing. This row therefore rests on the same basis as its sibling 320x568 rulings rather than on bare acceptance.'],
  ['short-stick 320x568', 'owner ruling 2026-09-15: 191px on press 0 - 191px to scroll on documentElement. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned.'],
  // Moved from FITS_ROWS 2026-09-02: same self-scroller bound as freeze-tap above.
  ['wire-snip-panic 320x568', 'owner ruling 2026-10-20: 67px on press 1 - 67px to scroll on the shared player screen with the seeded names (the worst screen is the player screen, not a round screen; the box that scrolls was not read). Accepted by owner ruling 2026-10-20 (popup, batch S2026-10-20#3), resting on the existing owner ruling 2026-10-15 (gh#264 popup: the shared player screen may scroll). Found by the gh#284 screen-class check: the 2026-09-15 ruling below was made on a round screen (div#screen-game), and no round screen reads near its 111px any more. The largest round screen reads 19px on press 3 (presses 2-4 read 0/19/19px), above the 8px OVERFLOW_TOLERANCE_PX, which is why this row stays in KNOWN_OVERFLOW and does not move to FITS_ROWS. Measured on this Mac 2026-10-20 with the ci-probes.sh lane flags (--headless --disable-gpu --no-sandbox), n=4 identical runs (one unsharded, three with ROUTES_ONLY), evidence docs/verification/evidence/gh284-2026-10-20/. The 2026-09-11 primary-control reading the previous ruling rests on predates the shared player screen and the band and was not repeated here. Previously: owner ruling 2026-09-15: 111px on press 0 - 111px to scroll on div#screen-game.screen.active. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned.'],
  ['zero-trigger 320x568', 'owner ruling 2026-10-20: 143px on press 2 - 143px to scroll, 0px clipped. RE-RECORDED UPWARD from 131px, measured on the integration run of 2026-10-20 (scripts/run-workflow-gates.sh, this Mac, n=1): the before-band run read 131px, and the band build reads 143px on a different screen (press 2 now wins over press 0), so the 56px reserved top band of gh#268 grew the worst screen by 12px, not the full 56px. No primary-control fold reading is produced for this route. Previously: owner ruling 2026-09-15: 131px on press 0 - 131px to scroll on section#screen-game.screen.active. RE-RECORDED UPWARD from 96px, measured this run on this Mac: gh#194 deliberately gives the player strip its real height (flex-shrink:0 in overrides.css), and that height is added to a screen that was already over. The growth is the fix, not a regression — a chip row nobody can see is not a saving. Promotion to FITS_ROWS is not owed here; this row still overflows by design until the 320px play screen is redesigned. The binding requirement for a play screen is the 2026-09-10 rule — the primary control is reachable above the fold at 320px — not that the whole screen fits. This route was measured against that rule on 2026-09-11 and was not found in violation, so the remaining scroll is accepted rather than redesigned. This supersedes the preceding clause of this reason: after the 2026-09-15 ruling no redesign is owed here.'],
  // gh#284, 2026-10-20: this row moved to FITS_ROWS with a PLAYER_SCREEN_SCROLLS entry and came back
  // the same day, when the CI runner read 79px clipped on its round screen; the reason carries both
  // lanes. The history below is the row's own, from before that batch.
  // Added 2026-09-06: one-bomb, the twelfth play route. Never ruled on, so gh#182 open is the only
  // class available. RE-RECORDED the same day from 23px on press 2, measured on this Mac against a
  // real dist/: 75px on press 1, identical on three consecutive runs. Only 2px of the difference is
  // owed to the gh#79 tap floor this route grew in overrides.css — the same build with that block
  // removed measured 73px on press 1 here, so the 23px was somebody else's machine, or another
  // screen, and it was never this one's number.
  // RE-MEASURED 2026-09-06 after the route grew its no-3D DOM board, on three consecutive runs on
  // this Mac against a real dist/: still 75px, and the NUMBER IS DELIBERATELY UNCHANGED because it
  // did not move. What moved is the screen behind it — press 1 used to land on a dead unsupported
  // notice and now lands on a live board — so the row was re-derived rather than carried over.
  // ATTRIBUTION, measured this time rather than inherited: the board contributes ZERO. The scrolling
  // box inside it reads 0px of overflow at every seat count, and removing the menu overlay from
  // layout takes div#app's overflow to 0px on the board screen. All 75px belong to the menu card,
  // which is 573px tall in a 568px viewport and stays in layout behind the board because
  // `.menuOverlay.hidden` hides it with visibility, not display. A candidate note in that card was
  // dropped for the same reason: it added 58px and was itself clipped off the bottom, unread.
  // RE-MEASURED 2026-09-06 after the menu overlay was made a self-scroller, three consecutive runs on
  // this Mac against a real dist/: 97px, identical on all three, and the CLIPPED column went 75 -> 0.
  // The 75px was never a smaller version of this number, so it was re-derived rather than adjusted.
  // It was 75px of card the phone could not reach at all, measured with the probe's own seed of three
  // names; what is recorded now is the card's OWN scroll distance, and it varies with the roster the
  // way the card does - 45px at two names, 97px at three, 142px at four and above, all measured at
  // 320x568. The two numbers are not comparable and no arithmetic between them means anything: they
  // are different boxes measured under different alignment, which is why the row reads HIGHER after a
  // fix that made the screen usable. Why it stays in this map: the probe counts a
  // self-scroller that fills the viewport as a screen, and this one is `inset: 0`, so the invariant is
  // still not satisfied even though nothing is unreachable any more.
  ['one-bomb 320x568', 'owner ruling 2026-10-20: 174px on press 0 - 174px to scroll on the shared player screen with the seeded names (the worst screen is the player screen, not a round screen). Accepted by owner ruling 2026-10-20 (popup, batch S2026-10-20#3: FITS_ROWS first, falling back to KNOWN_OVERFLOW class "player" if the CI runner reds the round screens), resting on the existing owner ruling 2026-10-15 (gh#264 popup: the shared player screen may scroll). The fallback was taken because the runner red the FITS_ROWS pin. TWO LANES, read separately: (1) this Mac, no-WebGL fallback lane (ci-probes.sh flags --headless --disable-gpu --no-sandbox, where this route draws its no-3D DOM board), n=4 identical runs, evidence docs/verification/evidence/gh284-2026-10-20/: 174px to scroll on the player screen, 0px on every round screen. (2) the CI runner, WebGL-live lane, RE-RECORDED 2026-10-24 by gh#287 box 3, after ci.yml began installing fonts-noto-core (owner ruling 2026-10-24, gh#287 box 2): n=3 runs of commit a164bd1 (40080855402, 40081954392, 40081954489) each read the same two screens: the player screen (press 0) 176px to scroll, 0px clipped, 0px sideways, and the round screen (press 1, class round) 0px on every axis. Row and screen lines are in docs/verification/evidence/gh287-2026-10-24/box3-noto-rows.txt. The 79px clip and the 6px sideways are gone: gh#287 measured them as Thai drawn in DejaVu tofu on a runner with no Thai face, and installing the face alone removed them. The walk also reaches one screen fewer (2, was 3): before the font, press 2 was a second reading of the clipped modalBox. So the runner red that made the 2026-10-20 batch take its KNOWN_OVERFLOW fallback no longer reads, and the first choice of that ruling (FITS_ROWS with the player screen excepted) is open again. Moving the row is a reclassification, not a re-record, so it is left to the owner and this row stays here until then. Previously, before gh#287: the CI runner, n=1, run 39444165152 (artifact browser-probe-output-39444165152-1, play-screen-fit-1.log): the player screen (press 0) reads 171px to scroll plus 79px clipped, and the round screen (press 1) reads 0px to scroll, 79px clipped and 6px sideways by div#app. The round screen 79px clip on the runner sits inside this row headroom and is NOT separately gated: this map gates only the screen class of the worst screen, and the row worst is the player screen on both lanes. The 390x844 and 1440x900 rows read 0px on every screen on both lanes. Previously: owner ruling 2026-10-20: 174px on the worst screen (press 0 in the probe run) - 174px to scroll, 0px clipped. RE-RECORDED UPWARD from 97px, measured on the integration run of 2026-10-20 (scripts/run-workflow-gates.sh, this Mac, n=1). Only 56px of the growth is the 56px reserved top band of gh#268: the unsharded run on the build before the band read 118px, so 21px of the growth over the old 97px recording predates the band and is NOT the band (not attributed here). The box that scrolls was not re-read this run. No primary-control fold reading is produced for this route: the startPlayBtn visibility quoted in the previous reason is the pre-band Mac reading and has not been re-measured under the band. Previously: owner ruling 2026-09-15: 97px on the worst screen (press 0 in the probe run) - 97px to scroll on div#menuOverlay.menuOverlay, 0px clipped. The owner accepted this screen as it is: the primary control button#startPlayBtn is fully visible at 54px (rect.bottom 532.11 of 568) and the 97px of scroll is consumed by the secondary buttons howToPlayBtn and menuSettingsBtn, measured n=3 at 320x568 in docs/verification/evidence/182-one-bomb-fold-2026-09-15/'],
]);
/**
 * gh#284 — WHICH SCREEN each KNOWN_OVERFLOW ruling was made on, as data beside the map and keyed
 * identically (a unit test pins the two key sets equal). 'player' = the shared player screen
 * (ADR-0071), 'round' = any other play screen. A reason's px is one machine's and is never gated, so
 * without this a row's number can move to a screen nobody ruled on and the run stays green: the
 * pinocchio-luck rows did exactly that when the route started opening on the shared player screen.
 *
 * THE IDENTITY IS THE SCREEN CLASS, NOT THE PRESS INDEX. A press index names an encounter, and
 * self-timed routes reach a given state on different presses from run to run and machine to machine.
 * The class is read off the page's own data-player-screen attribute at each measurement, which the
 * shared player screen writes, so it does not depend on when the walk got there. That is also why the
 * check covers EVERY row rather than only the press-stable ones: the thing compared does not move with
 * the press clock, so no row needs to be left out for it.
 *
 * Ties are real (some rows read the same px on every press), so the check is a band, not an argmax:
 * see screenClassMismatches. Values are read off each row's reason: the 'player' rows say their
 * worst screen is the shared player screen; every other row names a round screen.
 */
export const KNOWN_OVERFLOW_SCREEN = new Map([
  ['cannon-flag 320x568', 'player'],
  ['cannon-flag 390x844', 'round'],
  ['cannon-flag 1440x900', 'round'],
  ['cursed-number 320x568', 'round'],
  ['cursed-number 390x844', 'round'],
  ['cursed-number 1440x900', 'round'],
  ['how-close-is-near 320x568', 'player'],
  ['pinocchio-luck 320x568', 'player'],
  ['pinocchio-luck 390x844', 'player'],
  ['pinocchio-luck 1440x900', 'player'],
  ['power-meter 320x568', 'round'],
  ['power-meter 390x844', 'round'],
  ['power-meter 1440x900', 'round'],
  ['freeze-tap 320x568', 'player'],
  ['short-stick 320x568', 'round'],
  ['wire-snip-panic 320x568', 'player'],
  ['zero-trigger 320x568', 'round'],
  ['one-bomb 320x568', 'player'],
]);
/** The class of one measured screen, the same word KNOWN_OVERFLOW_SCREEN declares. */
export const screenClass = (s) => (s.playerScreen ? 'player' : 'round');
/**
 * gh#284 — the KNOWN_OVERFLOW rows whose worst screen is no longer the class their ruling declares.
 * The band: every screen within OVERFLOW_TOLERANCE_PX of the row's worst overflow is a candidate for
 * "the worst", and the row passes if ANY candidate carries the declared class. An argmax would red a
 * row whose screens read equal px on every press on whichever one sorted first. Within-run only: no
 * recorded px is read, so this is as machine-stable as the class bit itself. Fails closed: a
 * KNOWN_OVERFLOW row with no declared class has no candidate that can match, and reds.
 *
 * Exported with the map as a parameter so scripts/play-screen-fit-probe.test.mjs can replay a saved
 * run under the class a row carried before a re-record.
 */
export const screenClassMismatches = (rows, classes = KNOWN_OVERFLOW_SCREEN) => rows
  .filter((r) => KNOWN_OVERFLOW.has(rowKey(r)) && r.screens?.length)
  .map((r) => {
    const worst = worstOf(r);
    const band = r.screens.filter((s) => s.overflowPx >= worst.overflowPx - OVERFLOW_TOLERANCE_PX);
    return { r, key: rowKey(r), declared: classes.get(rowKey(r)), worst, band };
  })
  .filter((m) => !m.band.some((s) => screenClass(s) === m.declared));
/**
 * gh#202 — the HORIZONTAL exemption map, and the reason it is a separate map rather than a column in
 * KNOWN_OVERFLOW above. rowKey is route plus viewport and carries no axis, so one shared map means one
 * exemption covers both axes: a row excused for 689px of vertical scrolling would silently absorb a
 * brand-new sideways clip on the same screen. Splitting the map is what keeps "this screen is allowed
 * to scroll" from ever meaning "this screen is allowed to cut content off sideways".
 *
 * THE SHAPE IS INVERTED FROM KNOWN_OVERFLOW's, on purpose and on evidence: measured across a full walk
 * back when the set was 11 routes, the horizontal axis read ZERO on almost every row, so the honest default is GATED and
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
  // wire-snip-panic 320x568/390x844 rows REMOVED gh#226: root cause was `.wire-label-tag`'s
  // `white-space: nowrap` forcing each of the 6 wire-columns' min-content width to the label's
  // full-line width (up to 65px on this Mac) -- 6 of those don't fit in .wires-bay at 320/390px, so
  // the last column got pushed past #screen-game's right edge, exposed only by the overflow-y/auto
  // coercion gh#202 found. Fix: the label may now wrap (src/play/wire-snip-panic/style.css), so its
  // min-content width no longer exceeds an equal 1/6 share of the bay. Measured on this Mac after the
  // fix: 320x568 0px (was 43px), 390x844 0px (unchanged, was already 0 here). CI's larger 145px/75px
  // reading is unverified from this machine but the mechanism removed (a nowrap label forcing a
  // column wider than its share) is font-stack-independent -- the fix does not depend on which font
  // measured wider.
  // pinocchio-luck 320x568 row REMOVED 2026-10-24, gh#287 box 3: it recorded 11px sideways on the CI
  // runner against ZERO on this Mac, from an h1 of Thai overflowing its own heading. gh#287 measured
  // that runner as having no Thai face at all, and once ci.yml installed fonts-noto-core the row read
  // 0px sideways on n=3 runs of commit a164bd1 (40080855402, 40081954392, 40081954489). Both machines
  // now read it under tolerance, which is the deletion rule its 390x844 sibling below states.
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
for (const [which, map] of [['KNOWN_OVERFLOW', KNOWN_OVERFLOW], ['KNOWN_OVERFLOW_X', KNOWN_OVERFLOW_X], ['PLAYER_SCREEN_SCROLLS', PLAYER_SCREEN_SCROLLS]]) {
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
// The mockup root, one spelling for every in-page read that resolves it.
const MOCKUP_ROOT_SEL = '#app, #app-container, #appRoot';
const HELPERS = `
  const ROOT_SEL = '${MOCKUP_ROOT_SEL}';
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

// The box name MEASURE prints as scrollFrom / clipFrom / overflowXFrom. One copy, because the FONT_READ
// join finds the named box again by this same name and a second spelling would silently never match.
const DESC = `const desc = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '')).slice(0, 60);`;

// gh#287 — under FONT_READ only, MEASURE also keeps a REFERENCE to each box it names, so the font read
// joins to that very element. A name cannot do it: sibling boxes share names. Unset, every piece below
// is the empty string and MEASURE is the same text as without the knob.
export const FONT_BOXES_KEY = '__watduangFontBoxes';
const FONT_BOX_RESET = FONT_READ ? ` window[${JSON.stringify(FONT_BOXES_KEY)}] = { scroll: scrollPx ? de : null };` : '';
const fontBoxMark = (slot) => (FONT_READ ? ` window[${JSON.stringify(FONT_BOXES_KEY)}].${slot} = e;` : '');

// The ONE text-set criterion, shared by the snapshot MEASURE takes and by FONT_COLLECT, so a member and
// an entry are the same kind of thing: laid-out text nodes holding U+0E00-U+0E7F, fields showing Thai,
// and ::before / ::after hosts whose content holds it. scope itself is included.
const FONT_MEMBERS = `
  const THAI = /[\\u0E00-\\u0E7F]/;
  const rangeLaidOut = (n) => { const r = document.createRange(); r.selectNodeContents(n); return r.getClientRects().length > 0; };
  const fontHosted = () => [...new Set([...document.fonts].map((f) => f.family.replace(/^["']|["']$/g, '')))];
  const fontMembers = (scope) => {
    const out = [];
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (THAI.test(t.data) && t.parentElement && rangeLaidOut(t)) out.push({ node: t, kind: 'text', host: t.parentElement });
    }
    for (const e of scope.querySelectorAll('input, textarea')) {
      // What the field shows: its value when it has one, else its placeholder.
      if (e.getClientRects().length && THAI.test(e.value ? e.value : (e.placeholder || ''))) out.push({ node: e, kind: 'field', host: e });
    }
    for (const e of [scope, ...scope.querySelectorAll('*')]) {
      for (const pseudo of ['before', 'after']) {
        if (THAI.test(getComputedStyle(e, '::' + pseudo).content || '') && e.getClientRects().length) out.push({ node: e, kind: 'pseudo', pseudo, host: e });
      }
    }
    return out;
  };
`;

/**
 * gh#287 — the members each named box holds AT MEASURE, frozen once the scan has picked its winners
 * (MEASURE runs this after the scan loop, under FONT_READ only). Per slot: every member of the text set
 * inside both that box and the mockup root, with its host's computed font-family, plus the page's hosted
 * list. FONT_COLLECT later trusts a member only if none of that has drifted. A block, so its names
 * cannot collide with MEASURE's. Exported so a test runs the real snapshot.
 */
export const FONT_SNAPSHOT = `{
  ${FONT_MEMBERS}
  const fontRoot = document.querySelector(${JSON.stringify(MOCKUP_ROOT_SEL)});
  const fontStash = window[${JSON.stringify(FONT_BOXES_KEY)}];
  if (fontRoot && fontStash) {
    const frozen = { hosted: fontHosted(), slots: {} };
    for (const slot of ['scroll', 'clip', 'x']) {
      const box = fontStash[slot];
      if (!box) continue;
      const scope = box.contains(fontRoot) ? fontRoot : fontRoot.contains(box) ? box : null;
      frozen.slots[slot] = (scope ? fontMembers(scope) : []).map((m) => ({ ...m, font: getComputedStyle(m.host).fontFamily }));
    }
    fontStash.frozen = frozen;
  }
}`;

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
  let scrollFrom = scrollPx ? 'documentElement' : null;${FONT_BOX_RESET}
  let clippedPx = 0;
  let clipFrom = null;
  let clipChild = null;
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
  ${DESC}
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
      overflowXFrom = desc(e);${fontBoxMark('x')}
    }
    const over = e.scrollHeight - e.clientHeight;
    if (over <= ${EPS}) continue;
    const oy = cs.overflowY;
    if (oy === 'hidden' || oy === 'clip') {
      if (over > clippedPx) {
        clippedPx = over;
        clipFrom = desc(e);${fontBoxMark('clip')}
        // Which content is cut off, not only which box cuts it: the descendant reaching furthest
        // below the box, with its rect. A runner-only clip (one-bomb 320x568, 2026-10-20) could not
        // be judged from the log because only the px was printed. A lead, not a cause -- a fixed
        // descendant can reach below without adding to scrollHeight.
        const boxBottom = e.getBoundingClientRect().bottom;
        let past = 0;
        clipChild = null;
        for (const c of e.querySelectorAll('*')) {
          const r = c.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0 || r.bottom - boxBottom <= past) continue;
          past = r.bottom - boxBottom;
          clipChild = desc(c) + ' ' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') + ' (+' + Math.round(past) + 'px)';
        }
      }
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
    if (over > scrollPx) { scrollPx = over; scrollFrom = desc(e);${fontBoxMark('scroll')} }
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
  const span = n ? Math.min(right, innerWidth) - Math.max(left, 0) : 0;${FONT_READ ? FONT_SNAPSHOT : ''}
  return {
    ok: true, innerWidth, innerHeight,
    docScrollPx, scrollPx, clippedPx, overflowXPx,
    // VERTICAL ONLY. overflowXPx is deliberately absent: it is gated separately against
    // KNOWN_OVERFLOW_X, because the exemptions in KNOWN_OVERFLOW are about scrolling.
    overflowPx: Math.max(scrollPx, clippedPx),
    // Named so a KNOWN_OVERFLOW reason can say WHICH box overflows instead of only by how much.
    scrollFrom, clipFrom, clipChild, overflowXFrom,
    inkCount: n,
    inkLeft: n ? left : null, inkRight: n ? right : null,
    widthFillPct: n ? Math.round((span / innerWidth) * 1000) / 10 : 0,
    // gh#264: was the shared player screen up when this screen was measured? The screen marks <html>
    // itself (data-player-screen, ADR-0071), so this is the page's own statement, not a guess from
    // markup. PLAYER_SCREEN_SCROLLS scopes its exception by this bit and nothing else.
    playerScreen: de.getAttribute('data-player-screen') === 'open',
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

/** localStorage key the forced draw travels on. Read by DRAW_OVERRIDE before any page script runs. */
const DRAW_KEY = 'watduang:__fit-draw';

/**
 * gh#239 — routes whose PLAY SCREEN picks its own text from an array, so one walk measures one draw
 * and a green means a short string was drawn rather than that the screen fits. The count is the
 * array's length, declared here because it lives in a module closure the probe cannot read.
 *
 * freeze-tap draws from TRIGGER_CONDITIONS in startNewRound(). Measured at a real emulated 320x568:
 * seven prompts give a 456px pass screen, the two symbol prompts wrap to three lines and give 483px.
 * A 27px swing with identical element counts, which is why two CI attempts on one SHA both reported
 * the same ink while disagreeing about the fit.
 *
 * This is a declared count, not a per-route selector: the walk stays generic, and a wrong count reds
 * rather than under-covering (see the two assertions in the route loop).
 *
 * Sibling routes were grepped when this landed: the other Math.random callers under src/play drive
 * particles and physics, not the choice of text. That rules out this SHAPE, not every way a route
 * could vary its own height.
 */
export const DRAW_COUNTS = { 'freeze-tap': 9 };

/**
 * gh#182 FOLD READ — REPORT ONLY, gated by nothing, asserted by nothing.
 *
 * The 2026-09-10 rule the KNOWN_OVERFLOW reasons cite makes the binding requirement that the PRIMARY
 * CONTROL is reachable above the fold at 320px, not that the whole screen fits. Every 320x568 reason
 * in this file rests on Mac readings; the runner renders Thai-heavy rows differently (see
 * docs/agents/ci-gate-calibration.md "A pixel the fit probe records is one machine's number"), so
 * whether those readings hold here has never been measured. This emits the number so it can be.
 *
 * WHY AN EXPLICIT SELECTOR rather than this file's own largest-visible-button heuristic: the figure
 * this is compared against is the n=12 Mac baseline in
 * docs/verification/evidence/182-freeze-tap-fold-2026-09-15, which read #playerReadyBtn by name. A
 * heuristic pick is a DIFFERENT INSTRUMENT, and two instruments cannot answer whether one machine
 * agrees with another. Scoped to the one route whose ruling is open; the sibling rows carry
 * 2026-09-11 Mac measurements with the same runner-gap and widening was not asked for.
 *
 * WHICH DRAW THE READING BELONGS TO: the fold fields ride the screen record, and screen records merge
 * WORST-PER-PRESS across the forced draws. So the surviving reading is the one from the screen the row
 * itself reports. On a machine where the draws differ that is the TALL draw by construction, which is
 * exactly the reading wanted; on a machine where every draw ties at 0px the winner is whichever came
 * first and the draw label says which. Measured 2026-09-22 on this Mac: one line, draw index 0, 60px of
 * 60px -- the tie case. The line always names its draw, so a reader can tell the two apart.
 *
 * INERT ON THE CONTROL LEG BY CONSTRUCTION: this adds no assertion. Under BREAK_WALK / NO_SEED /
 * NO_PRESS the walk never leaves the fresh screen, so no screen is measured, so no fold line is
 * emitted and nothing can grade the empty set. That is the 2026-09-22 lesson in
 * docs/agents/ci-gate-calibration.md, which cost a full suite run.
 */
export const FOLD_SELECTORS = { 'freeze-tap': '#playerReadyBtn' };

/** The fold rule is a 320px rule, so the read is taken at that width only. */
export const FOLD_VP_W = 320;

/**
 * Visible height of a rect inside the viewport: the overlap of [top, bottom] with [0, innerHeight].
 * Same arithmetic the Mac baseline reported as visiblePxInViewport, so the two numbers are comparable.
 * Exported pure so the arithmetic is tested without a browser.
 */
export const foldVisiblePx = (top, bottom, innerHeight) =>
  Math.max(0, Math.min(bottom, innerHeight) - Math.max(top, 0));

/** In-page read for one selector. Absent element is reported, never thrown: the walk must not care. */
export const FOLD_READ = (sel) => `
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if (!(r.width > 0 && r.height > 0) || cs.visibility === 'hidden' || cs.display === 'none') {
    return { found: false, why: 'not rendered' };
  }
  return { found: true, top: r.top, bottom: r.bottom, height: r.height, innerHeight };
`;

/*
 * gh#287 — FONT_READ: which face SHAPED the Thai text on each measured screen. Report-only; it feeds
 * the gh#287 enumeration of fit rows that may be measuring tofu on a runner with no Thai face, and it
 * gates nothing.
 *
 * ROUTE SET: playRoutes(), the same list the walk takes. SCREEN SET: every screen the walk measures,
 * read right after that screen's own MEASURE in the same pass (after the fold and composition reads, so
 * those keep their timing), so a line only ever joins to fit numbers of the same run. Every pass of a
 * DRAW_COUNTS route is read, not only the draw that wins the worst-per-press merge.
 *
 * TEXT SET, all inside the mockup root resolved exactly as MEASURE resolves it (page chrome such as the
 * crawl-home link is out): every LAID-OUT text node holding a character in U+0E00-U+0E7F (laid out =
 * its range has a client rect, so visibility:hidden text is in and display:none text is out); every
 * laid-out input or textarea whose placeholder or value holds one; every ::before / ::after whose
 * computed content holds one.
 *
 * READ GRANULARITY: the TEXT NODE, not its element. Measured on one-bomb (Mac, 2026-10-24): an element
 * read covers its own text plus its depth-1 layout children, so a paragraph read also counted its bold
 * child's glyphs and a host read counted its ::after. A container read misses deeper text entirely. So
 * each Thai text node is read on its own and the line names its parent element. A pseudo-element is
 * read through DOM.describeNode's pseudoElements; a field through its user-agent shadow text, skipping
 * the placeholder node while the field hides it (a hidden placeholder reads empty by design). Chrome
 * does not lay out for this call, so the in-page collector's rect reads force layout first.
 *
 * VERDICT per element (fontVerdict): glyphs summed per family; custom faces only is custom, non-custom
 * only is system, both is mixed and counted on neither side, and an EMPTY read is unread, never clean.
 * The isCustomFont flag decides, never the family name: a system face can carry a self-hosted face name.
 * Every custom family must also be one the page itself registered in document.fonts (matched with a
 * weight suffix allowed, see fontVerdict), else an ANOMALY line prints. AT-RISK (fontReadSummary):
 * whether a system element was inside a box the screen's fit line names (scrolling, clipping or
 * sideways) AT MEASURE: MEASURE keeps a reference to each box and FONT_SNAPSHOT freezes its members, and
 * a member that drifted before the read makes the answer unknown rather than no. The ROUTE line's
 * system count is DISTINCT element names over
 * every screen read, so a row of identically named cells counts once.
 *
 * WHERE IT PRINTS: the walk runs in the driver child, whose stdout is the JSON file. So the parent hands
 * the child its own stdout as an extra descriptor and the child writes each line there as the screen is
 * read, which keeps every line a dead or timed-out walk got through. Read from any other launcher, the
 * lines fall back to stderr. Lines: one per screen, FONT_READ ANOMALY when it fires, FONT_READ CAL once
 * per one-bomb viewport (its how-to-play list is system-first and expected system, the player-screen
 * hint is Sarabun-first and expected custom, plus the in-page WebGL state, because the lanes differ in
 * which board and therefore which text one-bomb renders), and FONT_READ ROUTE per route at the end.
 */
const FONT_NODES_KEY = '__watduangFontRead';
export const FONT_COLLECT = (named, cal) => `
  ${HELPERS}
  ${DESC}
  ${FONT_MEMBERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { ok: false, why: 'no mockup root' };
  const de = document.documentElement;
  const hosted = fontHosted();
  const nodes = [];
  const nodeIndex = new Map();
  const idxOf = (n) => { if (!nodeIndex.has(n)) { nodeIndex.set(n, nodes.length); nodes.push(n); } return nodeIndex.get(n); };
  // AT-RISK reads the members each named box held AT MEASURE (FONT_SNAPSHOT), iterated on their own and
  // not through the walk below, because a member moved out of the root is never visited by it. A member
  // is trusted only while it is still connected, laid out, inside the root, under a host with the same
  // computed font-family, on a page with the same hosted list; otherwise it carries its drift reason.
  // A slot with no stashed box or no frozen set is not found. Text added after MEASURE is not a member.
  const stash = window[${JSON.stringify(FONT_BOXES_KEY)}] || {};
  const frozen = stash.frozen;
  const hostedSame = Boolean(frozen) && JSON.stringify(frozen.hosted) === JSON.stringify(hosted);
  const trusted = new Set();
  const boxes = ${JSON.stringify(named)}.map(({ slot, name }) => {
    const members = frozen && stash[slot] ? frozen.slots[slot] : null;
    if (!members) return { slot, name, found: false, members: [] };
    return { slot, name, found: true, members: members.map((m) => {
      const host = m.kind === 'text' ? m.node.parentElement : m.node;
      let drift = null;
      if (!host || !de.contains(m.node)) drift = 'detached';
      else if (!(m.kind === 'text' ? rangeLaidOut(m.node) : m.node.getClientRects().length)) drift = 'not laid out';
      else if (!root.contains(m.node)) drift = 'outside root';
      else if (getComputedStyle(host).fontFamily !== m.font) drift = 'font changed';
      else if (!hostedSame) drift = 'hosted changed';
      if (!drift) trusted.add(m.node);
      const sel = (host ? desc(host) : 'detached') + (m.kind === 'field' ? '[field]' : m.kind === 'pseudo' ? '::' + m.pseudo : '');
      return { sel, kind: m.kind, pseudo: m.pseudo, drift, idx: drift ? [] : [idxOf(m.node)] };
    }) };
  });
  // The counted text set: the root's members now. inBox marks an entry holding a trusted member.
  const entries = [];
  const hosts = new Map();
  for (const m of fontMembers(root)) {
    if (m.kind === 'text') {
      let entry = hosts.get(m.host);
      if (!entry) {
        entry = { sel: desc(m.host), kind: 'text', idx: [], inBox: false, host: m.host };
        hosts.set(m.host, entry);
        entries.push(entry);
      }
      entry.idx.push(idxOf(m.node));
      entry.inBox = entry.inBox || trusted.has(m.node);
    } else {
      entries.push({ sel: desc(m.host) + (m.kind === 'field' ? '[field]' : '::' + m.pseudo), kind: m.kind, pseudo: m.pseudo, idx: [idxOf(m.node)], inBox: trusted.has(m.node), host: m.host });
    }
  }
  let calRead = null;
  if (${cal ? 'true' : 'false'}) {
    // Every li of the list is counted, so an li with no readable Thai cannot drop out of the half.
    const lis = [...root.querySelectorAll('#howModal li')];
    for (const x of entries) { const li = x.host.closest('#howModal li'); if (li) { x.cal = 'how'; x.calLi = lis.indexOf(li); } }
    const firstFamily = (e) => (getComputedStyle(e).fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
    // The two halves never share an entry: the Sarabun half skips anything the list half owns.
    const free = entries.filter((x) => x.kind === 'text' && !x.cal);
    const sarabun = free.find((x) => x.host.closest('.ps-hint')) || free.find((x) => firstFamily(x.host) === 'Sarabun');
    if (sarabun) sarabun.cal = 'sarabun';
    // The lane's WebGL grant, read in the page because the launch flags do not decide it.
    const gl = {};
    for (const k of ['webgl2', 'webgl']) {
      try {
        const ctx = document.createElement('canvas').getContext(k);
        gl[k] = ctx ? 'live' : 'null';
        if (ctx) { const lose = ctx.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
      } catch (err) { gl[k] = 'threw'; }
    }
    calRead = { gl, canvasInRoot: root.querySelectorAll('canvas').length, howLi: lis.length };
  }
  window[${JSON.stringify(FONT_NODES_KEY)}] = nodes;
  return {
    ok: true, hosted, cal: calRead, boxes,
    entries: entries.map(({ host, ...x }) => x),
  };
`;

const isThai = (s) => /[\u0E00-\u0E7F]/.test(s || '');

/**
 * Driver half of FONT_READ for one screen: collect in the page, then one platform-font read per node.
 * A failed protocol call leaves that element's fonts empty, which the verdict counts as unread.
 */
export async function readFonts(session, m, cal) {
  const named = [];
  if (m.scrollPx > EPS && m.scrollFrom) named.push({ slot: 'scroll', name: m.scrollFrom });
  if (m.clippedPx > EPS && m.clipFrom) named.push({ slot: 'clip', name: m.clipFrom });
  if (m.overflowXPx > EPS && m.overflowXFrom) named.push({ slot: 'x', name: m.overflowXFrom });
  // Node ids die with every navigation, so the document is re-requested per screen.
  await session.cdp('DOM.getDocument', { depth: 0 });
  const c = await session.evaluate(FONT_COLLECT(named, cal));
  if (c.error || !c.value?.ok) return { error: `collect failed: ${c.error ?? c.value?.why}` };
  const list = await session.cdp('Runtime.evaluate', { expression: `window[${JSON.stringify(FONT_NODES_KEY)}]` });
  const listId = list.result?.result?.objectId;
  const props = listId ? await session.cdp('Runtime.getProperties', { objectId: listId, ownProperties: true }) : null;
  const objectIds = [];
  for (const p of props?.result?.result ?? []) if (/^\d+$/.test(p.name)) objectIds[Number(p.name)] = p.value?.objectId;
  const nodeIdOf = async (objectId) => (objectId ? (await session.cdp('DOM.requestNode', { objectId })).result?.nodeId : undefined);
  // null, not [], when the read failed: a failed fragment must stay visible as a failure.
  const fontsOf = async (nodeId) => {
    if (!nodeId) return null;
    const r = await session.cdp('CSS.getPlatformFontsForNode', { nodeId });
    return r.result?.fonts?.length ? r.result.fonts : null;
  };
  const pushed = async (backendNodeIds) => (backendNodeIds.length
    ? (await session.cdp('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds })).result?.nodeIds ?? []
    : []);
  // One read per node and kind, shared by the entries and the frozen box members that name it.
  const cache = new Map();
  const readOne = async (kind, i, pseudo) => {
    const key = `${kind}:${i}:${pseudo ?? ''}`;
    if (cache.has(key)) return cache.get(key);
    const fonts = [];
    let failed = 0;
    const take = (f) => { if (f) fonts.push(...f); else failed += 1; };
    {
      const nodeId = await nodeIdOf(objectIds[i]);
      if (kind === 'text') {
        take(await fontsOf(nodeId));
      } else if (kind === 'pseudo') {
        const d = nodeId ? await session.cdp('DOM.describeNode', { nodeId }) : null;
        const p = (d?.result?.node?.pseudoElements ?? []).find((x) => x.pseudoType === pseudo);
        const ids = await pushed(p ? [p.backendNodeId] : []);
        if (!ids.length) failed += 1;
        for (const id of ids) take(await fontsOf(id));
      } else if (kind === 'field') {
        const d = nodeId ? await session.cdp('DOM.describeNode', { nodeId, depth: -1, pierce: true }) : null;
        const texts = [];
        const walk = (n, hidden) => {
          const attrs = n.attributes ?? [];
          const style = attrs[attrs.indexOf('style') + 1];
          const off = hidden || (attrs.includes('style') && /display:\s*none/.test(style || ''));
          if (n.nodeType === 3 && !off && isThai(n.nodeValue)) texts.push(n.backendNodeId);
          for (const k of [...(n.shadowRoots ?? []), ...(n.children ?? [])]) walk(k, off);
        };
        // The shadow only: a textarea's light-DOM text is its unrendered default value.
        for (const sr of d?.result?.node?.shadowRoots ?? []) walk(sr, false);
        const ids = await pushed(texts);
        if (!ids.length) failed += 1;
        for (const id of ids) take(await fontsOf(id));
      }
    }
    const r = { fonts, failed };
    cache.set(key, r);
    return r;
  };
  // Every fragment that reads empty or errors is counted, and one is enough to make the element
  // unread: a sibling fragment that did read must not absorb it.
  const readInto = async (x) => {
    const fonts = [];
    let failed = 0;
    for (const i of x.idx) { const r = await readOne(x.kind, i, x.pseudo); fonts.push(...r.fonts); failed += r.failed; }
    x.fonts = fonts;
    x.failed = failed;
    delete x.idx;
  };
  for (const e of c.value.entries) await readInto(e);
  for (const b of c.value.boxes) for (const mem of b.members) await readInto(mem);
  await session.evaluate(`delete window[${JSON.stringify(FONT_NODES_KEY)}]; return true;`);
  return { hosted: c.value.hosted, boxes: c.value.boxes, entries: c.value.entries, cal: c.value.cal };
}

/**
 * The lines stream through the descriptor the parent handed over (see FONT_READ above); FONT_READ_FD is
 * set by acquireMeasurements only, together with that descriptor.
 */
// writeSync on a non-blocking pipe can write PART of the buffer, or throw EAGAIN while the reader is
// behind. So write until every byte is out, retry EAGAIN after a short pause (bounded), and hand the
// unwritten rest to the fallback on any other error, so no line is lost or cut.
const FONT_WRITE_RETRIES = 2000;
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function fontWriteAll(fd, text, { write = fs.writeSync, fallback = (b) => process.stderr.write(b), sleep = sleepSync } = {}) {
  const buf = Buffer.from(text);
  let off = 0;
  let retries = 0;
  while (off < buf.length) {
    try {
      off += write(fd, buf, off, buf.length - off);
    } catch (err) {
      if (err?.code === 'EAGAIN' && retries < FONT_WRITE_RETRIES) { retries += 1; sleep(5); continue; }
      fallback(buf.subarray(off));
      return;
    }
  }
}
export const fontEmit = (line) => {
  const fd = Number(process.env.FONT_READ_FD);
  if (Number.isInteger(fd) && fd > 2) { fontWriteAll(fd, line + '\n'); return; }
  process.stderr.write(line + '\n');
};
/** Per route, every screen read this run, for the FONT_READ ROUTE summary. */
const fontByRoute = new Map();

/**
 * Installed once per session via Page.addScriptToEvaluateOnNewDocument, so it is in place before the
 * route's own module runs and therefore before the pick happens. Self-limiting: load() wipes
 * localStorage at the top of every walk, so a pass that forces nothing leaves the native generator
 * alone and cannot contaminate the route that follows.
 *
 * WHY NO CLEANUP OF THE KEY, which is the question a reader gets to next: the last pass does leave it
 * set, and localStorage is per-ORIGIN, so it outlives this probe in a shared Chrome profile. It is
 * inert anyway, and the reason is worth writing down rather than re-deriving. The key does nothing
 * without this script registered, and the registration is per-TARGET -- driver.mjs opens a fresh
 * target per run, so the override dies with the tab while the key does not. A later leg on the same
 * origin (canvas-ink drives Math.random particles, so it would be a wrong number that runs clean)
 * therefore reads a stale key with no override to act on it. Add a removeItem here only if driver.mjs
 * ever starts REUSING a target, because that is the single fact this holds on.
 */
const DRAW_OVERRIDE = `
  (() => {
    const native = Math.random;
    try {
      const raw = localStorage.getItem(${JSON.stringify(DRAW_KEY)});
      if (raw !== null) { const v = Number(raw); if (v >= 0 && v < 1) Math.random = () => v; return; }
    } catch (e) {}
    Math.random = native;
  })();
`;

/**
 * The values forced for a route declared with N draws, in pass order.
 *
 * Passes 0..N-1 are midpoints: Math.floor(((i + 0.5) / N) * N) === i exactly, so N passes enumerate
 * every index of an array of length N. Fewer than N DISTINCT screens coming back means either the
 * override never reached the pick or the array is SHORTER than declared -- both red.
 *
 * Pass N is the growth canary, and the pair is the whole detector. Against an array of length N,
 * (N-1)/N and (N-0.5)/N both floor to index N-1, so the canary matches the last midpoint pass. Let
 * the array grow to N+1 and they separate: (N-1)/N lands on N-1 while (N-0.5)/N lands on N. So a
 * canary that does NOT match pass N-1 means TRIGGER_CONDITIONS grew past the count declared above.
 */
export const drawValues = (n) => [...Array(n).keys()].map((i) => (i + 0.5) / n).concat((n - 1) / n);

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

async function load(session, url, vp, seeded, draw = null) {
  await session.nav(url);
  await session.setWidth(vp.w, vp.h);
  await session.wipe(); // on-origin, per docs/agents/browser-verification.md trap 4
  if (seeded) await session.evaluate(SEED);
  // gh#239 — written after the wipe and before the reload, so DRAW_OVERRIDE reads it on the document
  // the walk actually measures. Left unset, the wipe alone restores the page's own generator.
  if (draw !== null) await session.evaluate(`localStorage.setItem(${JSON.stringify(DRAW_KEY)}, ${JSON.stringify(String(draw))}); return true;`);
  await session.nav(url);
  await session.setWidth(vp.w, vp.h);
  await sleep(1200); // main.js is an external module; give it a beat to build the first screen
  return awaitPlayerScreenSettled((body) => session.evaluate(body));
}

/**
 * gh#264 — THE FIXED BEAT ABOVE IS NOT ENOUGH ON ITS OWN. Every play route mounts the shared player
 * screen (ADR-0071), and its open() first waits for a roster migration that takes a Web Lock. On a
 * slow runner that open lands seconds after the beat, so a read taken at the beat saw a page mid-boot
 * and the control leg reported the screen "changing on its own" when it was only finishing its open.
 * So load() also waits until the page itself says the open is done: the screen is mounted (its
 * attribute is on <html> -- set at mount, before anything opens it, so routes that open it only after
 * their own intro satisfy this at boot) and no open is pending (the screen's separate pending
 * attribute, set by open() before its migration and cleared on success AND failure).
 *
 * The two names are the screen's own (player-screen.ts SCREEN_ATTR / PENDING_ATTR) and are restated
 * here because this read runs in the page; player-screen.test.mjs pins that they agree.
 */
export const PLAYER_SCREEN_ATTR = 'data-player-screen';
export const PLAYER_SCREEN_PENDING_ATTR = 'data-player-screen-pending';
/** The cap, measured from the first read after the beat. CI's red run showed the boot plus the open
 *  taking 5s and more on the runner, so the cap is three times that: generous enough that a runner
 *  slower than the worst one seen still settles, and short enough that a page whose open never ends
 *  reds this row in seconds instead of hanging the leg. A settled page pays nothing -- the first read
 *  returns. At the cap the row REDS by name; it never proceeds to a read of a page still booting. */
export const PLAYER_SCREEN_SETTLE_CAP_MS = 15000;
const PLAYER_SCREEN_POLL_MS = 100;
const PLAYER_SCREEN_READ = `
  const de = document.documentElement;
  return { mounted: de.hasAttribute('${PLAYER_SCREEN_ATTR}'), pending: de.hasAttribute('${PLAYER_SCREEN_PENDING_ATTR}') };
`;

/** null once the player screen has finished any open; otherwise, at the cap, the reason the row reds. */
export async function awaitPlayerScreenSettled(evaluate, {
  capMs = PLAYER_SCREEN_SETTLE_CAP_MS, pollMs = PLAYER_SCREEN_POLL_MS, wait = sleep, now = Date.now,
} = {}) {
  const deadline = now() + capMs;
  for (;;) {
    const read = await evaluate(PLAYER_SCREEN_READ);
    const v = read.error ? null : read.value;
    if (v?.mounted && !v.pending) return null;
    if (now() >= deadline) {
      const why = read.error ? `the read itself failed (${read.error})`
        : !v?.mounted ? `<html> never carried ${PLAYER_SCREEN_ATTR}, so the shared screen never mounted`
          : `${PLAYER_SCREEN_PENDING_ATTR} was still set, so an open was still waiting on its migration`;
      return `the player screen never finished opening within ${capMs}ms: ${why}. A fresh read taken now would describe a page mid-boot, not the screen a device opens on (gh#264)`;
    }
    await wait(pollMs);
  }
}

/**
 * gh#264 REFUTE rounds 1-2 — WHAT THE SETTLE WAIT GAVE UP, CHECKED ON ITS OWN. The wait above moves the
 * fresh read past the open, and the open is exactly the window in which a route that paints its OWN
 * screen first is visible: croc-bite's options screen showed there for seconds on a slow runner, and
 * after the wait the control leg could no longer see it. So the order is its own invariant: on a route
 * whose shared player screen opens by itself (ADR-0071 ruling 1, "the player screen first"), nothing
 * the route owns is painted in the play surface between navigation and that open -- except what the
 * route DECLARES may show first.
 *
 * AN ALLOW-LIST, FAIL-CLOSED. A route marks the elements it means to show before the shared screen --
 * its header chrome, up from first paint by design -- with data-shows-before-players in its own
 * markup.html. Everything else visible is an offender, named tag#id|text. A text count was tried first
 * and was a heuristic: an 18-char "Options / Easy / Start" menu passed it (REFUTE round 2).
 *
 * A CONTENT LEAF is an element with its own non-whitespace text (its direct text nodes; an element
 * with no element children reads its textContent, which is the same thing), or an img, svg, picture or
 * video with a non-empty box. Empty styled boxes are not content and are ignored. canvas is allowed
 * everywhere: the owner accepted a blank, canvas-only first second on a slow device (2026-10-16).
 * EXCLUDED: anything inside the shared screen's root (.ps), a dialog, a template, a canvas, or a
 * [data-shows-before-players] element. Page chrome (the exit X, the edit control) sits outside the root.
 * VISIBLE means a non-empty box, not visibility:hidden or display:none, and no ancestor up to the root
 * at opacity 0.
 * UNCOVERED, by construction: a menu drawn into a canvas, a screen painted by a CSS background-image,
 * and text from pseudo-element content -- none of them is a DOM content leaf.
 *
 * A DECLARATION MAY NOT BLANKET THE SCREEN. One attribute on the play-surface root, on an ancestor of
 * it, or on any ancestor of .ps would allow everything, so each of those is a red of its own, read off
 * the page once the screen has settled (when .ps exists).
 *
 * THE MEASURE. An in-page sampler, installed before any of the page's own script, samples on every
 * frame, every 50ms, at DOMContentLoaded and at EVERY DOM MUTATION under <html>, synchronously in the
 * observer callback. That last one is what makes it deterministic: the callback runs at the microtask
 * checkpoint right after the task or rAF callback that mutated, and before any rendering, so it reads
 * every state a frame could paint. Frame and interval samples alone raced the open (gh#264 REFUTE:
 * sampler rAF, then a route rAF inserting its board, then a rendering opportunity, then the open --
 * no frame or task sample ever saw that board, and croc-bite's unheld no-3D board read green on a warm
 * load). Mutations are coalesced per callback, so a node inserted and removed inside one callback is
 * never seen, as no frame can show it (one-bomb removes its engine notice that way). The residual,
 * fail-closed: a node inserted by one callback and removed by a later callback of the SAME task is
 * counted although it never paints. The player-screen attributes are mutations too, which is why
 * open() setting its pending marker in the task that hid (or failed to hide) the route's screen is
 * sampled even when the open lands in a millisecond. Sampling stops the moment the screen announces itself open
 * (the screen is shown by then; the pending marker clears a microtask later, and a sample in that gap
 * would count a route whose menu legitimately frames the open screen, as one-bomb's does). A sample
 * counts only while the screen is not yet settled and only once every stylesheet has loaded (an
 * unstyled read describes no frame: the sheets are render-blocking).
 *
 * THE SET judged = every route whose screen is open once settled; a route still 'closed' there opens
 * the screen only after its own intro (short-stick, wire-snip-panic, zero-trigger), and its own screen
 * IS meant to be first, so it is not judged.
 */
export const SHOWS_BEFORE_PLAYERS_ATTR = 'data-shows-before-players';
const FIRST_SCREEN_KEY = '__watduangFirstScreen';
const FIRST_SCREEN_ROOT_SEL = '#app, #app-container, #appRoot';
export const FIRST_SCREEN_SAMPLER = `(() => {
  const A = '${PLAYER_SCREEN_ATTR}';
  const P = '${PLAYER_SCREEN_PENDING_ATTR}';
  const EXCLUDED = '.ps, dialog, template, canvas, [${SHOWS_BEFORE_PLAYERS_ATTR}]';
  const MEDIA = ['IMG', 'SVG', 'PICTURE', 'VIDEO'];
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const rec = { samples: 0, unstyled: 0, offenders: [], firstOffenderAt: null, openAt: null, stopped: false };
  window['${FIRST_SCREEN_KEY}'] = rec;
  const html = () => document.documentElement;
  const settled = () => html().hasAttribute(A) && !html().hasAttribute(P);
  const styled = () => [...document.querySelectorAll('link[rel="stylesheet"]')].every((l) => l.sheet !== null);
  const boxed = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const seen = (e, root) => {
    if (!boxed(e)) return false;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    for (let n = e; n && n !== root.parentElement; n = n.parentElement) if (Number(getComputedStyle(n).opacity) === 0) return false;
    return true;
  };
  const ownText = (e) => {
    if (!e.children.length) return (e.textContent || '').trim();
    let t = '';
    for (const n of e.childNodes || []) if (n.nodeType === 3) t += n.textContent;
    return t.trim();
  };
  let timer;
  let tree;
  const stop = () => { rec.stopped = true; clearInterval(timer); if (tree) tree.disconnect(); };
  const sample = () => {
    if (rec.stopped || !html()) return;
    if (html().getAttribute(A) === 'open') { rec.openAt = ms(); stop(); return; }
    if (settled()) return;
    if (ms() > 30000) { stop(); return; }
    const root = document.querySelector('${FIRST_SCREEN_ROOT_SEL}');
    if (!root) return;
    if (!styled()) { rec.unstyled += 1; return; }
    rec.samples += 1;
    for (const e of root.querySelectorAll('*')) {
      if (e.closest(EXCLUDED)) continue;
      const media = MEDIA.includes(String(e.tagName).toUpperCase());
      const text = media ? '' : ownText(e);
      if (!media && !text) continue;
      if (!seen(e, root)) continue;
      const name = String(e.tagName).toLowerCase() + (e.id ? '#' + e.id : '') + '|' + (media ? '[' + String(e.tagName).toLowerCase() + ']' : text.slice(0, 32));
      if (!rec.offenders.includes(name)) {
        if (rec.firstOffenderAt === null) rec.firstOffenderAt = ms();
        if (rec.offenders.length < 12) rec.offenders.push(name);
      }
    }
  };
  timer = setInterval(sample, 50);
  const frame = () => { sample(); if (!rec.stopped) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  let watching = false;
  const watch = () => {
    if (watching || !html()) return;
    watching = true;
    tree = new MutationObserver(sample);
    tree.observe(html(), { attributes: true, childList: true, characterData: true, subtree: true });
  };
  watch();
  document.addEventListener('readystatechange', watch);
  document.addEventListener('DOMContentLoaded', sample);
})();`;
/** The record, plus the declaration audit: a [data-shows-before-players] that is the root, encloses
 *  it, or encloses a .ps allows the whole screen, and is named here. Read after the settle wait, when
 *  the shared screen has mounted and .ps exists. */
export const FIRST_SCREEN_READ = `
  const rec = window['${FIRST_SCREEN_KEY}'];
  if (!rec) return null;
  const D = '[${SHOWS_BEFORE_PLAYERS_ATTR}]';
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '');
  const faults = [];
  const root = document.querySelector('${FIRST_SCREEN_ROOT_SEL}');
  const over = root && root.closest(D);
  if (over) faults.push(name(over) + ' declares the play-surface root ' + name(root) + (over === root ? '' : ' (an ancestor)'));
  for (const ps of document.querySelectorAll('.ps')) {
    const wrap = ps.closest(D);
    if (wrap && wrap !== over) faults.push(name(wrap) + ' encloses the shared screen ' + name(ps));
  }
  return { ...rec, final: document.documentElement.getAttribute('${PLAYER_SCREEN_ATTR}'), declarationFaults: faults };
`;

/** The order verdict for one load: the reason the row reds, or null. No route is excused and there is
 *  no threshold: an undeclared visible leaf before the open is a red (gh#264 REFUTE round 2). A record
 *  without the declaration audit (the sampler's own record, before the read adds it) audits nothing;
 *  checkFirstScreen refuses a browser read that lacks it. */
export function firstScreenVerdict(read) {
  if (read?.error) return `the first-screen sampler could not be read (${read.error})`;
  const v = read?.value;
  if (!v) return 'the first-screen sampler was not installed on the document measured, so nothing here says what was painted before the player screen';
  if (v.declarationFaults?.length) return `a ${SHOWS_BEFORE_PLAYERS_ATTR} declaration would allow the whole screen: ${v.declarationFaults.join('; ')} -- declare the header elements themselves (gh#264)`;
  if (v.final !== 'open') return null;
  if (!v.samples) return 'the shared screen opened with no styled sample taken before it, so this row cannot say what was painted first (gh#264)';
  if (!v.offenders?.length) return null;
  return `the route painted content of its own before the shared player screen opened, from +${v.firstOffenderAt}ms: ${JSON.stringify(v.offenders)}. Hold it until the open, or -- if it is header chrome meant to show first -- mark it ${SHOWS_BEFORE_PLAYERS_ATTR} in the route's markup.html (gh#264)`;
}

/** Reads the sampler after the settle wait and records the verdict on the row. true = row.error set.
 *  What the read observed rides on the row -- the screen's settled state and the styled samples taken
 *  -- so a leg can count a row as judged, or as intro-first, only off a measurement (gh#264 REFUTE). */
async function checkFirstScreen(session, row) {
  const read = await session.evaluate(FIRST_SCREEN_READ);
  row.firstScreen = read.value ? { final: read.value.final ?? null, samples: read.value.samples ?? 0 } : null;
  const why = read.value && !Array.isArray(read.value.declarationFaults)
    ? 'the first-screen read returned no declaration audit, so a blanket declaration would pass unseen'
    : firstScreenVerdict(read);
  if (why) row.error = why;
  return Boolean(why);
}

/**
 * gh#264 — THE FIRST-SCREEN ORDER ON THE NO-WEBGL PATH, as a leg of its own (NO_WEBGL=1).
 *
 * The runner's Chrome hands out WebGL, so every other leg here only ever walks a 3D route's 3D boot.
 * The fallback a GPU-less phone takes is a different boot -- croc-bite inserts its DOM board at mount,
 * pinocchio-luck reveals a notice -- and that boot is exactly where a route painted its own screen
 * ahead of the shared player screen while every CI leg stayed green. So this leg takes WebGL away
 * before any page script runs and judges the first screen of EVERY manifest play route there.
 *
 * THE PRECONDITION IS MEASURED, NEVER ASSUMED. An injection that silently failed to take would make
 * this leg one more walk of the WebGL path under a no-WebGL label. So on the very document judged,
 * each context kind is requested from a fresh canvas and a fresh OffscreenCanvas (a canvas that
 * already holds a context answers null for any other kind, which would fake a pass) and must answer
 * null, and a 2d context must still work -- an injection that broke every canvas would measure a page
 * no device ever sees. Either failure reds that row before its verdict is read.
 *
 * COVERAGE IS RECONCILED, NOT ASSUMED: every route playRoutes() names has exactly one row, or the leg
 * reds. One viewport (the binding narrow one) and one fresh-roster load per route: the order defect is
 * a boot-order fact, not a layout one, and the full matrix is the clean leg's job.
 *
 * UNCOVERED: a route that reaches WebGL from a worker (the injection runs in the page only), or that
 * decides on a capability probe other than getContext. No route here does either today.
 */
export const NO_WEBGL_CONTEXTS = ['webgl', 'webgl2', 'experimental-webgl'];
export const NO_WEBGL_VP = VIEWPORTS.reduce((a, b) => (b.w < a.w ? b : a));
const noWebgl = () => Boolean(process.env.NO_WEBGL);
/** The leg is one thing: a sharded, stranded or control run under it would judge a different set. */
const assertNoWebglAlone = () => {
  const clash = ['FIT_SHARD', 'BREAK_WALK', 'NO_SEED', 'NO_PRESS'].filter((k) => process.env[k]?.trim());
  if (clash.length) throw new Error(`NO_WEBGL is its own leg and cannot run with ${clash.join(', ')} -- it walks every manifest route once, with a fresh roster, and reconciles that set itself`);
};
/** Installed before any of the page's own script. Matches the context kinds exactly, as the browser does. */
export const NO_WEBGL_INJECTION = `(() => {
  const KINDS = ${JSON.stringify(NO_WEBGL_CONTEXTS)};
  for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
    if (!C) continue;
    const native = C.prototype.getContext;
    C.prototype.getContext = function (kind, ...rest) {
      return KINDS.includes(kind) ? null : native.call(this, kind, ...rest);
    };
  }
})();`;
/** In-page, on the document just judged: what each WebGL kind and a 2d request answer right now. */
export const NO_WEBGL_CHECK = `
  const KINDS = ${JSON.stringify(NO_WEBGL_CONTEXTS)};
  const ask = (make, kind) => { try { return make().getContext(kind) === null; } catch (e) { return 'threw ' + e.message; } };
  const canvas = {};
  for (const k of KINDS) canvas[k] = ask(() => document.createElement('canvas'), k);
  const offscreenPresent = typeof window.OffscreenCanvas === 'function';
  const offscreen = {};
  if (offscreenPresent) for (const k of KINDS) offscreen[k] = ask(() => new window.OffscreenCanvas(1, 1), k);
  const c2d = document.createElement('canvas').getContext('2d');
  return { canvas, offscreenPresent, offscreen, twoD: Boolean(c2d) && typeof c2d.fillRect === 'function' };
`;

/** The precondition verdict for one document: the reason the row reds, or null. */
export function noWebglInjectionVerdict(read) {
  if (read?.error) return `the no-WebGL check could not be read (${read.error}), so nothing says WebGL was off on the document judged`;
  const v = read?.value;
  if (!v || typeof v.canvas !== 'object') return 'the no-WebGL check returned nothing, so nothing says WebGL was off on the document judged';
  const live = NO_WEBGL_CONTEXTS.filter((k) => v.canvas[k] !== true).map((k) => `canvas ${k} (${v.canvas[k]})`);
  if (v.offscreenPresent) live.push(...NO_WEBGL_CONTEXTS.filter((k) => v.offscreen?.[k] !== true).map((k) => `OffscreenCanvas ${k} (${v.offscreen?.[k]})`));
  if (live.length) return `forced no-WebGL did not take on the document judged: ${live.join(', ')} did not answer null -- this row would describe the WebGL path under a no-WebGL label`;
  if (v.twoD !== true) return 'the no-WebGL injection took the 2d context away too -- the route was judged on a page no device sees';
  return null;
}

/** A clean row counts only off what the first-screen read observed: an opened screen with at least one
 *  styled sample before it (judged), or a screen the read saw still 'closed' (intro-first, not judged).
 *  An absent read is neither -- counting it as intro-first would excuse a row nobody measured. */
export function firstScreenEvidenceFault(fs) {
  if (!fs || typeof fs !== 'object') return 'no first-screen measurement on this row, so it can be counted neither as judged nor as intro-first';
  if (fs.final === 'open') return fs.samples > 0 ? null : 'the shared screen opened with no styled sample on record, so nothing was judged';
  if (fs.final === 'closed') return null;
  return `the first-screen read saw the shared screen ${JSON.stringify(fs.final)}, neither open nor closed, so the row is neither judged nor intro-first`;
}

/** Every reason the leg reds, over a whole run. `expected` is the route set it had to cover. */
export function noWebglFaults(out, expected) {
  const faults = [];
  if (!out?.noWebgl) faults.push('these measurements are not from a forced-no-WebGL run (no noWebgl marker), so a WebGL-live walk would be judged as this leg');
  const rows = out?.rows ?? [];
  for (const r of rows) {
    if (r.error) { faults.push(`${r.url} at ${r.vp} with WebGL forced off: ${r.error}`); continue; }
    // Re-judged here off the row, so a driver path that skipped the check cannot hand over a clean row.
    const pre = noWebglInjectionVerdict({ value: r.injection });
    if (pre) faults.push(`${r.url} at ${r.vp}: ${pre}`);
    const why = firstScreenEvidenceFault(r.firstScreen);
    if (why) faults.push(`${r.url} at ${r.vp}: ${why}`);
  }
  const got = rows.map((r) => r.route);
  const missing = expected.filter((id) => !got.includes(id));
  const extra = [...new Set(got.filter((id) => !expected.includes(id)))];
  const doubled = [...new Set(got.filter((id, i) => got.indexOf(id) !== i))];
  if (missing.length) faults.push(`no row for ${missing.join(', ')} -- a route that never loaded reads exactly like a clean one`);
  if (extra.length) faults.push(`rows for ${extra.join(', ')}, which this leg was not asked to walk`);
  if (doubled.length) faults.push(`more than one row for ${doubled.join(', ')} -- the reconciliation counts routes, not rows`);
  return faults;
}

/** driver.mjs half of the leg: one fresh load per route, precondition first, then the order verdict. */
async function noWebglPass(session) {
  assertNoWebglAlone();
  await session.onNewDocument(NO_WEBGL_INJECTION);
  await session.onNewDocument(FIRST_SCREEN_SAMPLER);
  const routes = playRoutes();
  const vp = NO_WEBGL_VP;
  const rows = [];
  for (const id of routes) {
    const row = { route: id, url: `/game/${id}/play/`, vp: `${vp.w}x${vp.h}`, error: null, injection: null, screens: [] };
    rows.push(row);
    const notOpen = await load(session, `${BASE}${row.url}`, vp, false);
    if (notOpen) { row.error = notOpen; continue; }
    const check = await session.evaluate(NO_WEBGL_CHECK);
    row.injection = check.value ?? null;
    const pre = noWebglInjectionVerdict(check);
    if (pre) { row.error = pre; continue; }
    await checkFirstScreen(session, row);
  }
  return { base: BASE, noWebgl: true, routesWalked: routes.length, viewports: 1, rows };
}

/** main()'s half: the verdict over the whole run. */
function noWebglMain(out, log) {
  const expected = playRoutes();
  const faults = noWebglFaults(out, expected);
  for (const f of faults) console.error(`::error::${f}`);
  if (faults.length) process.exit(1);
  if (process.env.ROUTES_ONLY?.trim()) log(`NARROWED by ROUTES_ONLY=${process.env.ROUTES_ONLY} — ${expected.length} of ${games.filter((g) => g.playRoute).length} play route(s). This is a debug run, not a gate.`);
  // Both counted off the observation, never one as the other's remainder: noWebglFaults has already
  // refused a row that is neither.
  const judged = out.rows.filter((r) => r.firstScreen.final === 'open').length;
  const introFirst = out.rows.filter((r) => r.firstScreen.final === 'closed').length;
  log(`OK no-WebGL first screen: ${out.rows.length} route row(s) at ${NO_WEBGL_VP.w}x${NO_WEBGL_VP.h}, reconciled one-to-one against the ${expected.length} play route(s) this leg was asked for; on every judged document WebGL was verified off (${NO_WEBGL_CONTEXTS.join(', ')} null on canvas and OffscreenCanvas, 2d live). ${judged} route(s) opened the shared screen by themselves and painted nothing undeclared before it; ${introFirst} were observed still closed once settled (they open it after their own intro) and are not judged.`);
}

/** driver.mjs probe: every play route x every viewport, fresh signature then the seeded walk. */
/**
 * One seeded walk of one route at one viewport. Returns the screen signatures it reached, in order,
 * which is the fingerprint the draw assertions compare -- reusing the signature the walk already
 * takes rather than adding a reader for the drawn text.
 *
 * `draw` null leaves the page's own generator alone, which is every route but the ones in
 * DRAW_COUNTS. Measurements merge into row.screens WORST-PER-PRESS, so an enumerated route reports
 * the same number of screens as an unenumerated one and the row stays one row per route/viewport.
 * Press index is not a stable state in general -- but across passes of the same route and viewport
 * with nothing varied except the forced draw, it is the same walk pressing the same controls, which
 * is exactly the comparison "measure the worst draw" asks for.
 */
async function walkPass(session, id, url, vp, row, fresh, draw) {
  // NO_SEED skips the seeding, so the walk is left on the fresh screen and every screen it
  // reaches must still carry the fresh signature. That is this probe's calibration, and it also
  // proves the signature is stable over the same elapsed time rather than drifting on its own.
  const notOpen = await load(session, url, vp, !NO_SEED, draw);
  if (notOpen) {
    row.error = notOpen;
    return { sigs: [] };
  }
  if (await checkFirstScreen(session, row)) return { sigs: [] };
  const sigs = [];
  if (draw !== null) {
    // The override has to be proved INSTALLED on the document just measured. Without this the whole
    // enumeration can report a clean green while every pass drew freely, which is the failure this
    // gate exists to remove rather than to reproduce more quietly.
    const forced = await session.evaluate('return Math.random();');
    if (forced.error || forced.value !== draw) {
      row.error = `forced draw ${draw} but the page reported ${forced.error ?? forced.value} — the Math.random override is not installed on the document that was measured, so nothing here enumerates anything`;
      return { sigs };
    }
  }
  const widthOk = await session.evaluate('return innerWidth;');
  if (widthOk.value !== vp.w) {
    // browser-verification.md trap 1: a run measured at the wrong innerWidth is void, not wrong.
    row.error = `measured at innerWidth ${widthOk.value}, asked for ${vp.w} — the page never reflowed, so this read is void (docs/agents/browser-verification.md trap 1)`;
    return { sigs };
  }

  let skip = 0;
  const seen = new Set([fresh.value.sig]);
  const measured = [];
  for (let press = 0; press <= PRESS_CAP; press += 1) {
    const sig = await session.evaluate(SIGNATURE);
    if (sig.error || !sig.value?.ok) { row.error = `signature unreadable: ${sig.error ?? sig.value?.why}`; break; }
    const left = sig.value.sig !== fresh.value.sig;
    if (left && !seen.has(sig.value.sig)) {
      seen.add(sig.value.sig);
      sigs.push(sig.value.sig);
      const m = await session.evaluate(MEASURE);
      if (m.error || !m.value?.ok) { row.error = `measure failed: ${m.error ?? m.value?.why}`; break; }
      measured.push({ press, draw, ...m.value });
      const foldSel = vp.w === FOLD_VP_W ? FOLD_SELECTORS[id] : undefined;
      if (foldSel) {
        // Report-only; a failed read leaves the screen record without fold fields and emits nothing.
        const f = await session.evaluate(FOLD_READ(foldSel));
        if (!f.error && f.value?.found) {
          const last = measured[measured.length - 1];
          last.foldSel = foldSel;
          last.foldTop = f.value.top;
          last.foldBottom = f.value.bottom;
          last.foldHeight = f.value.height;
          last.foldVisiblePx = foldVisiblePx(f.value.top, f.value.bottom, f.value.innerHeight);
        }
      }
      // gh#203 — the composition row, taken on the FIRST screen that is not the fresh one, which
      // is the screen the label calls first-game-screen. Not the worst and not the last: the two
      // ranking rules above both pick by a px number, and a composition reading chosen by a px
      // number would inherit exactly the machine dependence it exists to avoid.
      if (vp.w === DESKTOP_W && !row.composition) {
        row.composition = await capture(session, id, row, 'first-game-screen', press);
      }
      // gh#287 — report-only; see FONT_READ. Streamed now, so a walk that dies later keeps this line.
      if (FONT_READ) {
        const last = measured[measured.length - 1];
        const cal = id === 'one-bomb' && !row.fontCal;
        last.fontRead = await readFonts(session, last, cal);
        fontEmit(fmtFontRead(id, row.vp, last));
        const anomaly = fmtFontAnomaly(id, row.vp, last);
        if (anomaly) fontEmit(anomaly);
        if (cal && !last.fontRead.error) { row.fontCal = true; fontEmit(fmtFontCal(id, row.vp, last)); }
        if (!fontByRoute.has(id)) fontByRoute.set(id, []);
        fontByRoute.get(id).push({ vp: row.vp, screen: last });
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

  // Same ranking worstOf uses, so the screen this keeps is the screen the row's own summary and the
  // gate would have picked. A different tie-break here would make the table disagree with the gate.
  for (const s of measured) {
    const at = row.screens.findIndex((k) => k.press === s.press);
    if (at < 0) { row.screens.push(s); continue; }
    const k = row.screens[at];
    if (s.overflowPx > k.overflowPx || (s.overflowPx === k.overflowPx && s.widthFillPct < k.widthFillPct)) row.screens[at] = s;
  }
  return { sigs };
}

export default async function (session) {
  if (noWebgl()) return noWebglPass(session);
  // gh#239 — installed before the first navigation so it is in place ahead of every route's own
  // module. Registered once per session on purpose: it is inert unless load() wrote a forced value.
  await session.onNewDocument(DRAW_OVERRIDE);
  // gh#264 REFUTE round 1: the first-screen order sampler, registered the same once-per-session way.
  await session.onNewDocument(FIRST_SCREEN_SAMPLER);
  // gh#287 — the platform-font read needs both agents; enabled once, they hold across navigations.
  if (FONT_READ) {
    await session.cdp('DOM.enable');
    await session.cdp('CSS.enable');
  }
  const routes = playRoutes();
  const rows = [];
  for (const id of routes) {
    const url = `${BASE}/game/${id}/play/`;
    for (const vp of VIEWPORTS) {
      const row = { route: id, url: `/game/${id}/play/`, vp: `${vp.w}x${vp.h}`, error: null, screens: [] };
      rows.push(row);
      const notOpen = await load(session, url, vp, false);
      if (notOpen) {
        row.error = notOpen;
        continue;
      }
      if (await checkFirstScreen(session, row)) continue;
      const fresh = await session.evaluate(SIGNATURE);
      if (fresh.error || !fresh.value?.ok) {
        row.error = `fresh signature unreadable: ${fresh.error ?? fresh.value?.why}`;
        continue;
      }
      row.freshSigLen = fresh.value.len;

      // A CALIBRATION LEG ENUMERATES NOTHING. NO_SEED and NO_PRESS exist to strand the walk on the
      // fresh screen -- that is the whole control -- so no pass reaches a play screen, every draw
      // fingerprint comes back empty, and the distinctness assertion below would red on the control
      // for doing exactly what it is there to do. Measured: the control leg reported "1 distinct
      // screen sequence" against 9 forced draws before this line existed.
      const draws = NO_SEED || NO_PRESS ? 1 : DRAW_COUNTS[id] ?? 1;
      const values = draws === 1 ? [null] : drawValues(draws);
      const fingerprints = [];
      for (const draw of values) {
        const pass = await walkPass(session, id, url, vp, row, fresh, draw);
        if (row.error) break;
        fingerprints.push(pass.sigs.join(' >> '));
      }
      row.draws = draws;

      // gh#239 — the two assertions that make the declared DRAW_COUNTS entry fail loudly instead of
      // under-covering. Both read the pass fingerprints, which are the screen signatures the walk
      // already takes; neither needs a second evaluator and neither can pass by construction.
      // enumerated.some(Boolean) defers to the existing NEVER LEFT THE FRESH SCREEN reporting when a
      // clean-leg walk reached nothing at all: that is a walk failure with its own diagnosis, and
      // answering it here with "the override did not reach the pick" would be a wrong one. A walk
      // that reached screens on SOME passes and not others still falls through to the count below.
      if (!row.error && draws > 1 && fingerprints.slice(0, draws).some(Boolean)) {
        const enumerated = fingerprints.slice(0, draws);
        const distinct = new Set(enumerated).size;
        if (distinct < draws) {
          // Either the override never reached the pick -- in which case every pass drew freely and
          // this gate is exactly as unsound as before while looking fixed -- or the array is shorter
          // than declared and two midpoints collided on one index.
          row.error = `forced ${draws} draw(s) but only ${distinct} distinct screen sequence(s) came back, so the enumeration did not cover ${draws} values. Either the Math.random override never reached the pick, or the array is shorter than the ${draws} declared in DRAW_COUNTS`;
        } else if (fingerprints.length > draws && fingerprints[draws] !== enumerated[draws - 1]) {
          row.error = `the growth canary drew a different screen from the last enumerated pass, so the array this route picks from is LONGER than the ${draws} declared in DRAW_COUNTS — raise the count (the draws past it were never measured)`;
        }
      }
      // gh#203 — a route whose walk never left setup still owes a composition row, labelled for the
      // screen it really is. Otherwise the completeness check below could only ever red on a route
      // that errored, and a stranded route would read as one nobody asked about.
      if (vp.w === DESKTOP_W && !row.composition && !row.error) {
        row.composition = await capture(session, id, row, 'setup', null);
      }
    }
    if (FONT_READ) fontEmit(fmtFontRoute(id, fontByRoute.get(id)));
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
  return `${r.route.padEnd(18)} ${r.vp.padEnd(9)} scrolls ${(w.scrollPx > EPS ? 'YES' : 'no ').padEnd(3)} ${String(Math.round(w.scrollPx)).padStart(5)}px  clipped ${String(Math.round(w.clippedPx)).padStart(5)}px  sideways ${String(Math.round(x.overflowXPx ?? 0)).padStart(5)}px${x.overflowXFrom ? ' by ' + x.overflowXFrom : ''}  width-fill ${String(w.widthFillPct).padStart(5)}%  (worst of ${r.screens.length} screen(s)${(r.draws ?? 1) > 1 ? ` x ${r.draws} draw(s)` : ''}: press ${w.press}, ${w.inkCount} ink)${FITS_ROWS.has(rowKey(r)) ? ' [pinned fits]' : ''}${KNOWN_OVERFLOW_X.has(rowKey(r)) ? ' [sideways excepted]' : ''}${PLAYER_SCREEN_SCROLLS.has(rowKey(r)) ? ' [player screen excepted]' : ''}`;
};

/**
 * gh#182 reporting — emits one line per measured screen in r.screens, carrying that screen's own
 * measurements: its press label, overflowPx, scrollPx, clippedPx, overflowXPx, widthFillPct, and inkCount.
 * Pure formatter function exported so tests can exercise the exact output production uses without a browser.
 *
 * Why every screen is reported: on freeze-tap, the press-0 rule-reveal screen was already at 92 px
 * overflow on the unmodified stylesheet (confirmed by A/B), but was hidden under press 1's 187 px in the
 * worstOf summary. The walk measured both; this formatter ensures every screen is visible in CI logs.
 * Why these lines are not a gate: press index identifies an encounter, not a stable state, so rowKey
 * stays route x viewport and does not pin non-deterministic press walk counts.
 */
export const fmtScreens = (r) => {
  if (!r?.screens?.length) return [];
  return r.screens.map((s) => {
    const pressLabel = s.press !== null && s.press !== undefined ? `press ${s.press}` : 'press -';
    const labelPart = s.label ? `${s.label} (${pressLabel})` : pressLabel;
    const overPx = Math.round(s.overflowPx ?? Math.max(s.scrollPx ?? 0, s.clippedPx ?? 0));
    const scrPx = Math.round(s.scrollPx ?? 0);
    const clpPx = Math.round(s.clippedPx ?? 0);
    const ovxPx = Math.round(s.overflowXPx ?? 0);
    const wfill = s.widthFillPct ?? 0;
    const ink = s.inkCount ?? 0;
    // gh#284: the class is printed through the same screenClass the gate reads, so the log shows
    // exactly what was graded, on the runner as well as here.
    // The clip's box and furthest descendant ride only on a screen that clips, so a 0px line is unchanged.
    const clipBy = clpPx > 0 && s.clipFrom ? ` by ${s.clipFrom}${s.clipChild ? ` [furthest below: ${s.clipChild}]` : ''}` : '';
    return `  screen [${labelPart}]  overflow ${String(overPx).padStart(5)}px  scrolls ${(scrPx > EPS ? 'YES' : 'no ').padEnd(3)} ${String(scrPx).padStart(5)}px  clipped ${String(clpPx).padStart(5)}px${clipBy}  sideways ${String(ovxPx).padStart(5)}px${s.overflowXFrom ? ' by ' + s.overflowXFrom : ''}  width-fill ${String(wfill).padStart(5)}%  ink ${ink}  class ${screenClass(s)}`;
  });
};

/**
 * Emits the complete reporting lines for one row: the per-row summary produced by fmt(r),
 * followed by one line per measured screen in r.screens produced by fmtScreens(r).
 * Pure function exported so tests can exercise the exact emission logic main() performs without a browser.
 */
export const fmtRowReport = (r) => {
  if (!r) return [];
  return [fmt(r), ...fmtScreens(r)];
};

/**
 * Emits every row's report through the `emit` sink, one call per line, and returns the number of
 * lines emitted. main() passes console.log; a test passes a collector and can therefore OBSERVE the
 * emission instead of reading main()'s source for it.
 *
 * Why the return count and the sink both exist: the first version of this reporting was guarded only
 * by a regex over main()'s own source text, and on 2026-09-16 a mutation that kept the loop verbatim
 * while discarding its body passed 18 of 18 tests. A source check cannot answer a question about a
 * runtime value. The count is what a hollowed-out loop cannot fake.
 */
/**
 * gh#182 — one line per screen that carries a fold reading. A SEPARATE formatter on purpose: the row
 * and screen lines above are asserted verbatim by this file's tests, and a fold figure spliced into
 * them would have to change those assertions to say anything. Emits nothing when no screen was read,
 * which is every screen on a control leg and every route without a FOLD_SELECTORS entry.
 */
export const fmtFold = (r) => {
  if (!r?.screens?.length) return [];
  return r.screens
    .filter((s) => typeof s.foldVisiblePx === 'number')
    .map((s) => {
      const pressLabel = s.press !== null && s.press !== undefined ? `press ${s.press}` : 'press -';
      const drawPart = s.draw !== null && s.draw !== undefined ? ` draw ${s.draw}` : '';
      const clears = s.foldVisiblePx > 0 ? 'clears' : 'BELOW ';
      return `  fold [${pressLabel}${drawPart}]  ${s.foldSel}  ${clears} the fold  visible ${String(Math.round(s.foldVisiblePx)).padStart(4)}px of ${String(Math.round(s.foldHeight ?? 0)).padStart(4)}px  top ${String(Math.round(s.foldTop ?? 0)).padStart(5)}  bottom ${String(Math.round(s.foldBottom ?? 0)).padStart(5)}`;
    });
};

/**
 * gh#287 — one element's verdict from its platform-font read(s). Pure, so what a reading is CALLED is
 * pinned by a test without a browser. `hosted` is the family set the page registered in document.fonts.
 */
const FONT_STYLE_SUFFIX = /^(?:(?:Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)(?: Italic)?|Italic)$/;
export function fontVerdict(fonts, hosted) {
  const custom = {};
  const system = {};
  for (const f of fonts || []) {
    if (!(f.glyphCount > 0)) continue;
    const into = f.isCustomFont ? custom : system;
    into[f.familyName] = (into[f.familyName] ?? 0) + f.glyphCount;
  }
  // Chrome names a custom face by the font FILE's own family name, which can carry the weight: the
  // self-hosted Mitr 500 face reads "Mitr Medium" (measured on one-bomb, Mac, 2026-10-24) while
  // document.fonts says Mitr. So a hosted family matches itself, or itself plus one word from the
  // closed FONT_STYLE_SUFFIX list. Any other suffix is a different face and an ANOMALY.
  const isHosted = (fam) => (hosted || []).some((h) => fam === h || (fam.startsWith(h + ' ') && FONT_STYLE_SUFFIX.test(fam.slice(h.length + 1))));
  const anomalies = Object.keys(custom).filter((fam) => !isHosted(fam));
  const c = Object.keys(custom).length;
  const s = Object.keys(system).length;
  const verdict = c && s ? 'mixed' : c ? 'custom' : s ? 'system' : 'unread';
  return { verdict, custom, system, anomalies };
}

/**
 * gh#287 — one screen's FONT_READ, partitioned by verdict, and whether it is AT RISK: a system element
 * inside the box the fit line names. n/a when the screen names no box (it fits); unknown when a named
 * box could not be found again and no system element was seen inside one that was.
 */
export function fontReadSummary(s) {
  const r = s?.fontRead;
  const out = { system: [], custom: [], mixed: [], unread: [], anomalies: [], atRisk: 'n/a', error: r?.error ?? null };
  if (!r || r.error) return out;
  for (const e of r.entries || []) {
    const v = fontVerdict(e.fonts, r.hosted);
    if (e.failed) v.verdict = 'unread';
    out[v.verdict].push({ ...e, ...v });
    for (const a of v.anomalies) if (!out.anomalies.includes(a)) out.anomalies.push(a);
  }
  // Over the members each named box held at MEASURE: yes if a trusted member reads system; else unknown
  // if a box was not found, a member drifted, or a trusted member reads unread; else no (an empty set is
  // no, and mixed counts on neither side).
  const boxes = r.boxes || [];
  if (boxes.length) {
    let yes = false;
    let unknown = false;
    for (const b of boxes) {
      if (!b.found) unknown = true;
      for (const mem of b.members || []) {
        if (mem.drift) { unknown = true; continue; }
        const v = mem.failed ? 'unread' : fontVerdict(mem.fonts, r.hosted).verdict;
        if (v === 'system') yes = true;
        if (v === 'unread') unknown = true;
      }
    }
    out.atRisk = yes ? 'yes' : unknown ? 'unknown' : 'no';
  }
  return out;
}

const fontScreenId = (s) => `press ${s.press ?? '-'}${s.draw !== null && s.draw !== undefined ? ` draw ${s.draw}` : ''}`;
const fontFams = (o) => Object.entries(o).map(([f, n]) => `${f}:${n}`).join(',');
// The first four DISTINCT descriptions; elements sharing a name and a reading (a row of score cells)
// collapse into one item with a count, so they do not crowd out the rest of the list.
const fontFirst = (xs, f) => {
  const seen = new Map();
  for (const x of xs) { const k = f(x); seen.set(k, (seen.get(k) ?? 0) + 1); }
  const items = [...seen].map(([k, n]) => (n > 1 ? `${k} x${n}` : k));
  return items.slice(0, 4).join('; ') + (items.length > 4 ? ` (+${items.length - 4} more)` : '');
};

/** gh#287 — the per-screen FONT_READ line. */
export const fmtFontRead = (route, vp, s) => {
  const sum = fontReadSummary(s);
  const id = `FONT_READ ${route} ${vp} ${fontScreenId(s)} overflow ${Math.round(s.overflowPx ?? 0)}px`;
  if (sum.error) return `${id} READ FAILED: ${sum.error}`;
  const boxes = s.fontRead?.boxes || [];
  let line = `${id} system=${sum.system.length} custom=${sum.custom.length} mixed=${sum.mixed.length} unread=${sum.unread.length} at-risk=${sum.atRisk}`;
  const boxInfo = (b) => {
    if (!b.found) return '(not found)';
    const drifted = (b.members || []).filter((x) => x.drift).map((x) => x.drift);
    return `[members ${(b.members || []).length}${drifted.length ? `, drifted ${drifted.length}: ${[...new Set(drifted)].join('/')}` : ''}]`;
  };
  if (boxes.length) line += ` box=${boxes.map((b) => `${b.slot ?? 'box'}:${b.name}${boxInfo(b)}`).join('+')}`;
  if (sum.system.length) line += ` | system: ${fontFirst(sum.system, (e) => `${e.sel} ${fontFams(e.system)}${e.inBox ? ' [in box]' : ''}`)}`;
  if (sum.mixed.length) line += ` | mixed: ${fontFirst(sum.mixed, (e) => `${e.sel} custom ${fontFams(e.custom)} system ${fontFams(e.system)}`)}`;
  if (sum.unread.length) line += ` | unread: ${fontFirst(sum.unread, (e) => e.sel)}`;
  return line;
};

/** gh#287 — a custom face the page never registered, or null. */
export const fmtFontAnomaly = (route, vp, s) => {
  const sum = fontReadSummary(s);
  return sum.anomalies.length
    ? `FONT_READ ANOMALY ${route} ${vp} ${fontScreenId(s)} custom face(s) not in document.fonts: ${sum.anomalies.join(',')} (hosted: ${(s.fontRead?.hosted || []).join(',')})`
    : null;
};

/**
 * gh#287 — the instrument's calibration on one-bomb: its how-to-play list must read system and a
 * Sarabun-first element must read custom. Either side wrong means the reading is wrong, not the page.
 */
export const fmtFontCal = (route, vp, s) => {
  const sum = fontReadSummary(s);
  const all = ['system', 'custom', 'mixed', 'unread'].flatMap((v) => sum[v].map((e) => ({ ...e, verdict: v })));
  const how = all.filter((e) => e.cal === 'how');
  const sar = all.find((e) => e.cal === 'sarabun');
  const cal = s.fontRead?.cal;
  // Per li, not per entry: an li counts as system only when it has entries and every one is system,
  // and the denominator is every li in the list, read or not.
  const liCount = cal?.howLi ?? 0;
  const liSys = [...Array(liCount).keys()].filter((i) => {
    const mine = how.filter((e) => e.calLi === i);
    return mine.length > 0 && mine.every((e) => e.verdict === 'system');
  }).length;
  const ok = liCount > 0 && liSys === liCount && sar?.verdict === 'custom';
  return `FONT_READ CAL ${route} ${vp} ${fontScreenId(s)} howModal-li=${liCount ? `system ${liSys}/${liCount}` : 'MISSING'}` +
    ` sarabun-el=${sar ? `${sar.sel} ${sar.verdict} ${fontFams({ ...sar.custom, ...sar.system })}` : 'MISSING'}` +
    ` webgl2=${cal?.gl?.webgl2 ?? '?'} webgl=${cal?.gl?.webgl ?? '?'} canvas-in-root=${cal?.canvasInRoot ?? '?'} calibration=${ok ? 'OK' : 'WRONG'}`;
};

/** gh#287 — the run-end line per route: distinct system elements over every screen read, and the at-risk screens. */
export const fmtFontRoute = (route, reads) => {
  const sys = new Set();
  const atRisk = [];
  const unknown = [];
  for (const { vp, screen } of reads || []) {
    const sum = fontReadSummary(screen);
    for (const e of sum.system) sys.add(e.sel);
    const tag = `${vp}/p${screen.press}${screen.draw !== null && screen.draw !== undefined ? `/d${screen.draw}` : ''}`;
    if (sum.atRisk === 'yes') atRisk.push(tag);
    if (sum.atRisk === 'unknown') unknown.push(tag);
  }
  return `FONT_READ ROUTE ${route} system=${sys.size} at-risk-screens=${atRisk.join(',') || '-'}${unknown.length ? ` unknown-screens=${unknown.join(',')}` : ''}`;
};

export const emitRowReports = (rows, emit) => {
  let emitted = 0;
  for (const r of rows || []) {
    for (const line of fmtRowReport(r)) { emit('::notice::' + line); emitted++; }
    for (const line of fmtFold(r)) { emit('::notice::' + line); emitted++; }
  }
  return emitted;
};

/** Calibration for --selftest: validates fmtScreens and fmtRowReport over variable-cardinality fixtures without a browser. */
export function selftest() {
  const row = {
    route: 'freeze-tap',
    vp: '320x568',
    screens: [
      { press: 0, overflowPx: 17, scrollPx: 17, clippedPx: 0, overflowXPx: 0, widthFillPct: 95.0, inkCount: 10 },
      { press: 1, overflowPx: 92, scrollPx: 92, clippedPx: 0, overflowXPx: 0, widthFillPct: 98.5, inkCount: 14 },
      { press: 2, overflowPx: 187, scrollPx: 187, clippedPx: 0, overflowXPx: 0, widthFillPct: 99.1, inkCount: 22 },
    ],
  };
  const lines = fmtScreens(row);
  assert.equal(lines.length, 3, 'fmtScreens must emit one line per measured screen on a 3-screen row');
  assert.match(lines[0], /press 0/, 'press 0 identity must be emitted');
  assert.match(lines[0], /\b17px\b/, 'press 0 overflow (17px) must be reported');
  assert.match(lines[1], /press 1/, 'press 1 identity must be emitted');
  assert.match(lines[1], /\b92px\b/, 'press 1 overflow (92px) must be reported');
  assert.match(lines[2], /press 2/, 'press 2 identity must be emitted');
  assert.match(lines[2], /\b187px\b/, 'press 2 overflow (187px) must be reported');

  const single = {
    route: 'croc-bite',
    vp: '320x568',
    screens: [
      { press: 0, overflowPx: 0, scrollPx: 0, clippedPx: 0, overflowXPx: 0, widthFillPct: 90.0, inkCount: 8 },
    ],
  };
  const singleLines = fmtScreens(single);
  assert.equal(singleLines.length, 1, 'fmtScreens must emit one line for a single-screen row');
  assert.match(singleLines[0], /press 0/, 'single-screen identity must appear');
  assert.match(singleLines[0], /\b0px\b/, 'single-screen measurement (0px) must appear');
  assert.deepEqual(fmtScreens({ screens: [] }), [], 'an empty screen set yields no lines');

  const reportLines = fmtRowReport(row);
  assert.equal(reportLines.length, 4, 'fmtRowReport must emit summary plus all 3 screens');
  assert.match(reportLines[0], /freeze-tap.*320x568/, 'first line must be the per-row summary');
  assert.match(reportLines[1], /press 0.*17px/, 'screen 0 line must follow summary');
  assert.match(reportLines[2], /press 1.*92px/, 'screen 1 line must follow');
  assert.match(reportLines[3], /press 2.*187px/, 'screen 2 line must follow');

  console.log('play-screen-fit-probe --selftest: per-screen formatter calibrated (every measured screen emitted)');
}

/**
 * The driver child, stdout to `outFd`, stderr captured. gh#287: under FONT_READ only, this process's
 * stdout (or `stdoutFd`) rides along as the child's descriptor 3, so its FONT_READ lines stream straight
 * out while its own stdout stays the JSON file. Exported so a test can run a REAL child through it.
 */
export function spawnDriverChild(args, { cwd, outFd, env, fontRead = FONT_READ, stdoutFd = process.stdout.fd, forward = (t) => process.stdout.write(t) } = {}) {
  const run = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', outFd, 'pipe', ...(fontRead ? [stdoutFd] : [])],
    env: { ...env, ...(fontRead ? { FONT_READ_FD: '3' } : {}) },
  });
  // A line the child could not write to descriptor 3 fell back to its stderr, which the caller prints
  // only for a failed child. So under the knob, a green child's FONT_READ stderr lines are forwarded.
  if (fontRead && run.status === 0) {
    const lines = (run.stderr || '').split('\n').filter((l) => l.startsWith('FONT_READ'));
    if (lines.length) forward(lines.join('\n') + '\n');
  }
  return run;
}

/**
 * Measurement-acquisition seam: runs the browser driver and parses its JSON output.
 * Exported so tests can supply pre-recorded or fixture measurements without requiring
 * a built dist/ or a running Chrome browser.
 */
export function acquireMeasurements() {
  const fixtureJson = process.env.PROBE_OUT_JSON;
  const fixturePath = process.env.PROBE_OUT_FIXTURE;
  // The same rule scripts/play-exit-probe.mjs applies to its own calibration knobs. These two exist
  // to drive main()'s reporting over a recorded `out` with no browser at all, and they are honoured
  // only when this module is IMPORTED. A CLI run is the gate, and they would skip the dist check,
  // the driver and the browser entirely — a gate verdict computed from an environment variable is a
  // verdict about the harness, not about the site. Refuse rather than measure the wrong thing.
  if (isEntryPoint() && (fixtureJson || fixturePath)) {
    throw new Error(`refusing to run the gate with a measurement fixture set (PROBE_OUT_JSON=${fixtureJson ? `${fixtureJson.length} bytes` : ''}, PROBE_OUT_FIXTURE=${fixturePath ?? ''}) -- both exist to drive this probe's reporting to a known outcome by hand, and a CLI run measured through them would skip the build check, the driver and the browser entirely`);
  }
  if (fixtureJson) {
    return JSON.parse(fixtureJson);
  }
  if (fixturePath) {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }
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
    run = spawnDriverChild([path.join(repoRoot, 'scripts/driver.mjs'), fileURLToPath(import.meta.url)], {
      cwd: repoRoot, outFd: fd, env: { ...process.env, CDP_PORT, BASE },
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
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`::error::the browser leg produced no parseable JSON (${raw.length} bytes):\n${raw.slice(0, 500)}`);
    process.exit(1);
  }
}

export function main({
  acquireMeasurements: acquire = acquireMeasurements,
  emit = console.log,
  log = console.log,
} = {}) {
  if (process.argv.includes('--selftest')) return selftest();

  if (noWebgl()) assertNoWebglAlone();
  let out = acquire();
  if (Array.isArray(out)) out = { rows: out };
  if (noWebgl()) return noWebglMain(out, log);

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
  for (const r of out.rows.filter((r) => r.vp === DESKTOP_VP)) log('::notice::' + fmtComposition(r));

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
    log(shardWalkedLine(walked));
    log(`OK control: all ${out.rows.length} route/viewport row(s) stayed on the fresh screen with both the seeding and the presses disabled — so the walk invariant CAN fail, and the screen signature is stable across the ${PRESS_CAP} press intervals the clean leg spends walking (a signature that drifted on its own would report "it left setup" about a walk that never moved).`);
    return;
  }

  for (const r of stuck) {
    console.error(`::error::${r.url} at ${r.vp}: every screen this walk reached still carries the signature of the screen a fresh device opens on — it never left setup, so any fit number from it would describe the setup screen. ${PRESS_CAP} presses, ${r.freshSigLen} chars of fresh copy.`);
  }
  if (stuck.length) process.exit(1);

  // The inverted guard. Only the rows recorded as scroll-free are asserted; the rest are reported.
  // A narrowed run cannot judge the pins it never walked, and must not be read as if it had.
  const narrowed = Boolean(process.env.ROUTES_ONLY?.trim());
  if (narrowed) log(`NARROWED by ROUTES_ONLY=${process.env.ROUTES_ONLY} — ${out.routesWalked} of ${games.filter((g) => g.playRoute).length} play route(s). This is a debug run, not a gate.`);
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
    .map((r) => ({ r, w: gatedWorstOf(r) }))
    .filter((x) => x.w.overflowPx > OVERFLOW_TOLERANCE_PX);
  // gh#264: a player-screen state the owner excepted is still REPORTED, with its recorded px, so the
  // exception can never grow silently. A warning, not a gate, for the same machine-px reason as (iv).
  for (const r of out.rows.filter((row) => PLAYER_SCREEN_SCROLLS.has(rowKey(row)))) {
    const recorded = recordedPx(PLAYER_SCREEN_SCROLLS.get(rowKey(r)));
    for (const sc of (r.screens || []).filter((x) => x.playerScreen && x.overflowPx > recorded + OVERFLOW_TOLERANCE_PX)) {
      console.warn(`::warning::${r.url} at ${r.vp}: the shared player screen measured ${Math.round(sc.overflowPx)}px (press ${sc.press}) against PLAYER_SCREEN_SCROLLS's recorded ${recorded}px. Same machine? Something grew on the player screen -- re-measure before re-recording.`);
    }
  }
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
  // runner's fallback fonts (the workflow installed none then; the src diff between the two runs
  // touched only a test file). gh#287 measured the cause on 2026-10-24 and the workflow now installs
  // fonts-noto-core, which narrows the gap without closing it: Noto Sans Thai is not this Mac's face. A
  // recorded px is therefore the number ONE machine saw; the only environment-stable claims here are
  // "classified" and "fits within tolerance", and those two stay gates.
  const knownRegressions = out.rows
    .filter((r) => KNOWN_OVERFLOW.has(rowKey(r)))
    .map((r) => ({ r, w: worstOf(r), recorded: recordedPx(KNOWN_OVERFLOW.get(rowKey(r))) }))
    .filter((x) => x.w.overflowPx > x.recorded + OVERFLOW_TOLERANCE_PX);
  for (const x of knownRegressions) {
    console.warn(`::warning::${x.r.url} at ${x.r.vp} measured ${Math.round(x.w.overflowPx)}px against a recorded ${x.recorded}px (press ${x.w.press}). Same machine as the recording? Then something grew — fix it or re-record with the reason. Different machine? Fonts, not layout: leave the number alone.`);
  }
  // gh#284 — the GATED companion of (iv). (iv) cannot gate a px, but which CLASS of screen the row's
  // worst is does not move with the machine, and a row whose worst left the class its ruling names is
  // grading a screen nobody ruled on. See KNOWN_OVERFLOW_SCREEN for why every row is covered.
  const classMoved = screenClassMismatches(out.rows);
  for (const m of classMoved) {
    console.error(`::error::${m.r.url} at ${m.r.vp}: KNOWN_OVERFLOW_SCREEN declares this row's ruling was made on a ${m.declared ?? '(missing)'} screen, but no screen within ${OVERFLOW_TOLERANCE_PX}px of its worst (${Math.round(m.worst.overflowPx)}px, press ${m.worst.press}) is one: the band holds ${m.band.map((s) => `press ${s.press} ${screenClass(s)} ${Math.round(s.overflowPx)}px`).join(', ')}. The row now grades a screen nobody ruled on. Find which screen moved, then put it to the owner and re-record the reason and its class together — never flip the class alone to make a run pass.`);
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
  // ::notice:: so it survives a PASS: standalone() in ci-probes.sh discards a green leg's log, and this
  // table carries the per-row "worst of" field, which the FIT_SHARDS comment names as the signal to
  // drop a shard (gh#239 reworded it from "worst at press" so the press number can no longer read as
  // the set of screens visited -- it names the worst-SCORING screen, and being read as the set cost
  // one session a wrong diagnosis carried into an agent brief).
  // A rollback trigger that only exists in an uploaded artifact is a rollback trigger nobody reads.
  // gh#182 reporting: emit the per-row summary and every measured screen line before the verdict exit
  // so a failing run retains the evidence in its log instead of discarding it on exit 1.
  emitRowReports(out.rows, emit);

  if (unclassified.length || inBoth.length || regressions.length || sideways.length || classMoved.length) process.exit(1);

  log(shardWalkedLine(walked));

  const measured = out.rows.reduce((n, r) => n + r.screens.length, 0);
  // Every number here comes from the expression that describes it: the asserted count is the rows
  // this run actually walked AND has a pin for, never FITS_ROWS.size, which a narrowed run would
  // print as coverage it does not have.
  const asserted = out.rows.filter((r) => FITS_ROWS.has(rowKey(r))).length;
  const excepted = out.rows.filter((r) => KNOWN_OVERFLOW.has(rowKey(r))).length;
  const routesCount = out.routesWalked ?? [...new Set(out.rows.map((r) => r.route))].length;
  const vpsCount = out.viewports ?? [...new Set(out.rows.map((r) => r.vp))].length;
  log(`OK ${out.rows.length} route/viewport row(s) left the fresh screen; ${measured} distinct play screen(s) measured across ${routesCount} route(s) x ${vpsCount} viewport(s). ${asserted} row(s) asserted to fit within ${OVERFLOW_TOLERANCE_PX}px and ${excepted} row(s) held as recorded exceptions in KNOWN_OVERFLOW (their px reported, never gated: growth or a 0px reading prints a warning; the screen class each ruling names IS gated, gh#284) — every produced row is in exactly one of the two sets. SIDEWAYS (gh#202) is a separate gate on its own set: all ${out.rows.length} row(s) are asserted to clip no more than ${OVERFLOW_TOLERANCE_PX}px horizontally except the ${out.rows.filter((r) => KNOWN_OVERFLOW_X.has(rowKey(r))).length} in KNOWN_OVERFLOW_X.`);
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
