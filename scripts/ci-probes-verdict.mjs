// Verdict table for scripts/ci-probes.sh -- one predicate per probe leg.
//
// Usage: node scripts/ci-probes-verdict.mjs <label> <out.json> <driver-exit-code> <stderr-file>
// Prints one line of reason and exits 0 (leg passed) or 1 (leg failed).
//
// A separate file, not a heredoc inside ci-probes.sh: macOS ships bash 3.2, which mis-parses a
// single apostrophe inside a heredoc nested in $( ) -- `bash -n` there fails with "unexpected EOF
// while looking for matching `''" on a script GitHub Actions (bash 5) parses fine. Reproduced on
// this machine before splitting. A verdict file that cannot be parsed locally cannot be calibrated
// locally, which is the whole point of this gate.
const [label, outFile, rcStr, errFile] = process.argv.slice(2);
const rc = Number(rcStr);
const fs = await import('node:fs');
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const tail = () => read(errFile).trim().split('\n').filter(Boolean).slice(-3).join(' | ');
const ok = (m) => { console.log(m); process.exit(0); };
const bad = (m) => { console.log(m); process.exit(1); };
const all = (xs, f) => Array.isArray(xs) && xs.length > 0 && xs.every(f);
// Every "nothing moved" probe gets a positive control leg, and a control leg is judged on its own
// MEASUREMENT reporting the planted breakage -- never on a non-zero exit code, which is equally what a
// watchdog kill (rc 137), a dead Chrome or a page that never fired load looks like. A control that
// comes back green means the probe is inert and its green sibling proves nothing; a control that comes
// back dead means nothing was measured at all. Both fail. That is the false-green the triage found.
const sawInjected = (cal) => all(cal, (c) => c.sawInjectedOverflow === true);

if (rc !== 0) bad(`driver exited ${rc}${rc === 137 ? ' (killed by this script\'s watchdog -- probe hung)' : ''}${label.endsWith('-control') ? ' -- a CONTROL leg that was killed, crashed or never loaded the page never exercised the detector, so it cannot satisfy the control' : ''}: ${tail()}`);

let out;
try { out = JSON.parse(read(outFile)); } catch { bad(`output was not JSON${label.endsWith('-control') ? ' -- the control leg produced no measurement' : ''}: ${tail()}`); }

const V = {
  'narrow-overflow': () => {
    // gh#149: 4 tools x 3 rosters = 12 screens, down from 22. The games half of this probe is retired
    // — see GAMES in scripts/narrow-overflow-probe.mjs for the measurement that retired it. Pinned,
    // not ">0": a run that silently stopped visiting pages reports bad:0 too.
    if (out.checked !== 12) return `visited ${out.checked} screens, expected 12 (0 game screens since gh#149 + 4 tools x 3 rosters)`;
    if (out.bad !== 0) return `${out.bad} screen(s) overflow at 320px`;
    return null;
  },
  // Judged on the MEASUREMENT, never on the exit code: the probe suppresses its throw under
  // BREAK_GUARD (see narrow-overflow-probe.mjs) precisely so that a non-zero exit here means the leg
  // died rather than that the detector fired. Both halves must go red -- the tools half alone passing
  // is how a silently-inert games half hid.
  'narrow-overflow-control': () => {
    if (out.breakGuard !== true) return `control leg ran without BREAK_GUARD (breakGuard=${JSON.stringify(out.breakGuard)}) -- it measured the guarded pages, not the stripped ones`;
    if (out.checked !== 12) return `visited ${out.checked} screens, expected 12 -- the control did not cover what the clean leg covers`;
    // gh#149 — the games half is GONE, not weakened: GAMES is empty, so there is no game screen for
    // this control to redden and asserting badGames > 0 would pin an outcome nothing can produce. The
    // tools assertion below is the whole calibration now, and the coverage that left is named in
    // scripts/narrow-overflow-probe.mjs rather than quietly absorbed here.
    if (out.checkedGames !== 0) return `the control visited ${out.checkedGames} GAME screen(s) -- gh#149 retired that half, so a non-zero count means the two files disagree about what is being measured`;
    if (!(out.badTools > 0)) return `positive control stayed GREEN on all ${out.checkedTools} TOOL screens with overflow-wrap stripped and a ${out.tokenLength}-char unbreakable token -- the tools half of the 320px detector is inert, so its clean leg measures nothing`;
    return null;
  },
  'ad-reflow': () => {
    if (!all(out.results, (r) => typeof r.deltaPx === 'number')) return `some rows unmeasurable: ${JSON.stringify(out.results.filter((r) => typeof r.deltaPx !== 'number'))}`;
    if (out.results.length !== 8) return `${out.results.length} rows, expected 8 (4 tool pages x 2 widths)`;
    if (out.allPass !== true) return `ad slot moved: ${JSON.stringify(out.results.filter((r) => r.verdict !== 'PASS'))}`;
    return null;
  },
  'ad-reflow-control': () => {
    const green = (out.results || []).filter((r) => !(r.verdict === 'FAIL' && Math.abs(r.deltaPx) >= 100));
    if (out.results?.length !== 8) return `${out.results?.length} rows, expected 8`;
    if (green.length) return `positive control stayed GREEN on ${green.length}/8 rows -- the before/after ad-slot read cannot see a real 200px shift there, so 0px on those rows measures nothing: ${JSON.stringify(green)}`;
    return null;
  },
  'category-pop': () => {
    const v = out.verdict;
    if (!sawInjected(out.calibration)) return `overflow detector calibration failed (${JSON.stringify(out.calibration)})`;
    for (const k of ['noSidewaysScroll320', 'noSidewaysScroll390', 'railAbsentBelow1100', 'billboardReservesHeightAt1440', 'railReservesHeightAt1440']) {
      if (v?.[k] !== true) return `${k} = ${JSON.stringify(v?.[k])}`;
    }
    if (v.accent?.accentsDiffer !== true || v.accent?.matchesCanvas !== true) return `accent: ${JSON.stringify(v.accent)}`;
    return null;
  },
  'home-direction-c': () => {
    const v = out.verdict;
    if (!sawInjected(out.calibration)) return `overflow detector calibration failed (${JSON.stringify(out.calibration)})`;
    if (!all(out.widthVerdicts, (w) => w.voidUnlessEqual === true)) return `a width did not reflow -- run is void, not a pass: ${JSON.stringify(out.widthVerdicts)}`;
    for (const k of ['noSidewaysScroll320', 'noSidewaysScroll390', 'railAbsentAt1024', 'noSidewaysScroll1024', 'railRenderedAt1440', 'noSidewaysScroll1440']) {
      if (v?.[k] !== true) return `${k} = ${JSON.stringify(v?.[k])}`;
    }
    // Which motion leg this is comes from the browser, not from the label: a --force-prefers-
    // reduced-motion flag that silently failed to apply would otherwise read as the reduced leg.
    const m = v.motion;
    if (label === 'home-direction-c-normal') {
      if (m?.state !== 'normal') return `expected the normal-motion browser, got state=${m?.state}`;
      if (m.motionActuallyPresent !== true) return 'no running animation found under normal motion -- the motion check cannot prove motion exists, so its reduced-motion sibling is N/A, not a pass';
    } else {
      if (m?.state !== 'reduced') return `expected --force-prefers-reduced-motion, got state=${m?.state} (the flag did not apply)`;
      if (m.allDecorationStopped !== true || m.noRunningAnimations !== true) return `motion still running under reduce: ${JSON.stringify(m)}`;
    }
    return null;
  },
  'mount-failed-network': () => {
    if (!(out.failedRequestsLog?.length > 0)) return 'no request was actually aborted -- the failed-import scenario never happened';
    if (out.summary?.overall !== 'PASS') return `summary: ${JSON.stringify(out.summary)}`;
    return null;
  },
  'stick-tap-target': () => {
    if (out.total !== 18) return `${out.total} rows, expected 18 (2 widths x roster sizes 2..10)`;
    if (!all(out.all, (r) => r.count === r.n && r.innerWidth === r.width)) return `a row measured the wrong screen (stick count != roster size, or the width did not reflow): ${JSON.stringify(out.all.filter((r) => r.count !== r.n || r.innerWidth !== r.width))}`;
    if (out.failing !== 0) return `${out.failing} combination(s) below 44px: ${JSON.stringify(out.bad)}`;
    return null;
  },
  'wheel-pointer-name': () => {
    if (out.runs?.length !== 2) return `${out.runs?.length} runs, expected 2 widths`;
    for (const run of out.runs) {
      if (run.error) return `width ${run.width}: ${run.error}`;
      if (run.innerWidth !== run.width) return `width ${run.width} did not reflow (innerWidth ${run.innerWidth}) -- run is void`;
      if (run.spins?.length !== 3) return `width ${run.width}: ${run.spins?.length} spins, expected 3`;
      for (const s of run.spins) {
        if (s.hitTag !== 'path' || !(s.pathCount > 0)) return `width ${run.width} spin ${s.spin}: hit-test landed on ${s.hitTag} (pathCount ${s.pathCount}) -- nothing was measured`;
        if ((s.resultText || '').trim() !== (s.pointerLabel || '').trim()) return `width ${run.width} spin ${s.spin}: announced "${s.resultText}" but the painted wedge under the pointer is "${s.pointerLabel}"`;
      }
    }
    return null;
  },
  // The three probes below report through a `summary` object, not at the top level, and their claim
  // keys carry the claim number in the name (claim0_stageHasNoAnchor, not claim0). Read from the real
  // shape; a predicate written against a guessed shape reads `undefined` and either always passes or
  // always fails, and neither is a measurement.
  'no-nav-in-stage': () => {
    const s = out.summary;
    if (!s) return 'no summary in probe output -- nothing was measured';
    if (s.breakGuard !== false) return `clean leg ran with BREAK_GUARD set (breakGuard=${JSON.stringify(s.breakGuard)}) -- it measured a planted anchor, not the shipped pages`;
    // Pinned to 2 (gh#149, down from 4 with the party landings), not ">0": the walk is what produces
    // every claim below, and a run whose taps stopped
    // landing reports empty fail lists too. Claim 2 is deliberately NOT gated -- a game can be
    // legitimately red on it (a sampled point lands inside nav.game-next's own box with
    // anchorHref: null, so there is no anchor and no navigation to leave the round). It was
    // pick-loser that measured that; gh#153 re-pointed that walk at siamsi, and claim 2 stays
    // ungated for the same reason -- nav.game-next is page chrome under ADR-0013, not #stage.
    if (s.gamesWithUsableWalk !== 2) return `${s.gamesWithUsableWalk} game(s) had a usable walk, expected 2 -- the claims below rest on walks that did not happen`;
    const c0 = s.claim0_stageHasNoAnchor?.fail;
    const c1 = s.claim1_noNavTargetHitInStage?.fail;
    if (!Array.isArray(c0) || !Array.isArray(c1)) return `claim 0/1 fail lists absent from the summary (${JSON.stringify([c0, c1])}) -- refusing to read a missing list as clean`;
    if (c0.length) return `claim 0 (no <a href> inside #stage) FAILED on: ${c0.join(', ')} -- ADR-0014`;
    if (c1.length) return `claim 1 (no nav target hit inside #stage) FAILED on: ${c1.join(', ')} -- a double-tap on a transition lands on a link`;
    return null;
  },
  'no-nav-in-stage-control': () => {
    const s = out.summary;
    if (!s) return 'control leg produced no summary -- it never exercised the detector';
    if (s.breakGuard !== true) return `control leg ran without BREAK_GUARD (breakGuard=${JSON.stringify(s.breakGuard)}) -- it measured the shipped pages, not the planted anchor`;
    // Liveness first: with 0 transitions the identity below is 0 === 0 and certifies nothing.
    if (!(s.totalTransitions > 0)) return `the control walked ${s.totalTransitions} transition(s) -- no anchor could have been planted, so nothing was measured`;
    if (s.totalInStageAnchorHits !== s.totalTransitions) return `the planted in-#stage anchor was hit on only ${s.totalInStageAnchorHits} of ${s.totalTransitions} transitions -- the coordinate hit-test misses anchors it must see, so its clean leg measures nothing`;
    const c0 = s.claim0_stageHasNoAnchor?.fail;
    if (!Array.isArray(c0)) return 'claim 0 fail list absent from the control summary -- nothing was measured';
    if (c0.length !== 2) return `positive control stayed GREEN on claim 0: ${c0.length}/2 games reported the planted <a href> inside #stage -- the DOM scan is inert on the rest`;
    return null;
  },
  'leave-confirm': () => {
    const s = out.summary;
    if (!s) return 'no summary in probe output -- nothing was measured';
    if (s.breakGuard !== false) return `clean leg ran with BREAK_GUARD set (breakGuard=${JSON.stringify(s.breakGuard)})`;
    if (s.pagesScanned !== 2) return `scanned ${s.pagesScanned} PlayerSetup page(s), expected 2`;
    // Two-way calibration, per page: assertion A passes on "no stray buttons", which is also what a
    // scan that found no buttons at all looks like. detectorCalibrated is that page's own proof it
    // CAN see the buttons while the dialog is open.
    if (s.assertionA_pagesWithCalibratedDetector !== 2) return `only ${s.assertionA_pagesWithCalibratedDetector}/2 pages proved the button detector can see buttons while the dialog is OPEN -- on the rest, "no stray buttons while closed" measures nothing`;
    const a = Object.entries(s.assertionA_closedDialogInert ?? {}).filter(([, v]) => v !== 'PASS');
    if (Object.keys(s.assertionA_closedDialogInert ?? {}).length !== 2) return `assertion A reported ${Object.keys(s.assertionA_closedDialogInert ?? {}).length} page verdicts, expected 2`;
    if (a.length) return `assertion A (closed #leave-confirm is inert) not PASS on: ${JSON.stringify(a)}`;
    for (const [name, map] of [['B (post-dismiss inertness)', s.assertionB_postDismissInert], ['D (modified clicks pass through)', s.assertionD_modifiedClicksPassThrough]]) {
      const e = Object.entries(map ?? {});
      // gh#149: 0, not 3. Every party landing page is deleted (ADR-0050 ruling 2) and only a party
      // page can arm the guard, so B and D are UNMEASURED here, not passing — see ROUND_PAGES in
      // scripts/leave-confirm-probe.mjs for where that coverage goes back.
      if (e.length !== 0) return `assertion ${name} reported ${e.length} game verdicts, expected 0 armed round pages (none exist since gh#149)`;
      const bad2 = e.filter(([, v]) => v !== 'PASS');
      if (bad2.length) return `assertion ${name} not PASS on: ${JSON.stringify(bad2)}`;
    }
    return null;
  },
  // gh#184. The counter's unit test proves the arithmetic of N and that each route hands its strip to
  // the shared mount, and says in its own header that it proves nothing about the RENDERED band. This
  // pair is the rendered half: no chip's tail may end in hard, unfaded text against the pill.
  // 9 = 3 routes with a player strip x 3 viewports. Pinned rather than counted from the output,
  // because a run that visited fewer combos and found nothing wrong looks exactly like a clean one.
  'strip-chip-visibility': () => {
    if (out.control !== false) return `clean leg ran with CONTROL set (control=${JSON.stringify(out.control)}) -- it measured the mutant, not the shipped page`;
    if (typeof out.seededName !== 'string' || !out.seededName) return `no roster name was seeded (seededName=${JSON.stringify(out.seededName)}) -- short chips may not overflow at all, so a clean result measures nothing`;
    if (out.checked !== 9) return `checked ${out.checked} combo(s), expected 9 (3 strip routes x 3 viewports) -- the clean leg did not cover what the control covers`;
    if (out.bad !== 0) return `clipped chip with no visible signal on ${out.bad} row(s): ${JSON.stringify(out.badRows)}`;
    return null;
  },
  'strip-chip-visibility-control': () => {
    if (out.control !== true) return `control leg ran without CONTROL (control=${JSON.stringify(out.control)}) -- it measured the shipped band, not the hidden one`;
    if (out.checked !== 9) return `checked ${out.checked} combo(s), expected 9 -- the control did not cover what the clean leg covers`;
    if (!(out.bad > 0)) return `positive control stayed GREEN on all ${out.checked} combo(s) with the band force-hidden -- the clipped-chip detector is inert, so its clean leg proves nothing`;
    return null;
  },
  'leave-confirm-control': () => {
    const s = out.summary;
    if (!s) return 'control leg produced no summary -- it never exercised the detector';
    if (s.breakGuard !== true) return `control leg ran without BREAK_GUARD (breakGuard=${JSON.stringify(s.breakGuard)}) -- the display:flex defect was never planted`;
    if (s.pagesScanned !== 2) return `the control scanned ${s.pagesScanned} page(s), expected 2 -- it does not cover what the clean leg covers`;
    if (s.assertionA_pagesWithStrayButtons !== 2) return `positive control stayed GREEN on ${2 - s.assertionA_pagesWithStrayButtons}/2 pages with the tokens.css display:flex defect re-planted -- assertion A's hit-test cannot see two live buttons in a closed dialog there, so its clean leg measures nothing`;
    return null;
  },
  'arm-gate': () => {
    const s = out.summary;
    if (!s) return 'no summary in probe output -- nothing was measured';
    if (s.breakGuard !== false) return `clean leg ran with BREAK_GUARD set (breakGuard=${JSON.stringify(s.breakGuard)}) -- every button in #stage was force-enabled`;
    if (s.totalGapTests !== 12) return `${s.totalGapTests} gap test(s), expected 12 -- a scenario did not run, and an empty failing list would read as a pass`;
    if (!Array.isArray(s.failing) || !Array.isArray(s.scenarioErrors)) return `failing/scenarioErrors absent from the summary (${JSON.stringify([s.failing, s.scenarioErrors])})`;
    if (s.scenarioErrors.length) return `scenario error(s): ${s.scenarioErrors.join(' | ')}`;
    if (s.failing.length) return `${s.failing.length} gap test(s) failed: ${s.failing.join(', ')}`;
    // The probe answers this from a captured pointerdown log; UNMEASURABLE means the log was empty,
    // which is not a pass -- it is the suppression legs having nothing to be suppressed.
    const ans = out.pointerdownOnDisabled?.answer ?? '';
    if (!ans.startsWith('YES')) return `pointerdown-on-disabled reading is "${ans}" -- the arm gate's suppression legs were not shown a real bubbling pointerdown, so their green measures nothing`;
    return null;
  },
  'arm-gate-control': () => {
    const s = out.summary;
    if (!s) return 'control leg produced no summary -- it never exercised the detector';
    if (s.breakGuard !== true) return `control leg ran without BREAK_GUARD (breakGuard=${JSON.stringify(s.breakGuard)}) -- the buttons were never force-enabled`;
    if (s.totalGapTests !== 12) {
      const cause = Array.isArray(s.scenarioErrors) && s.scenarioErrors.length
        ? `scenario error(s): ${s.scenarioErrors.join(' | ')}`
        : 'scenarioErrors is empty -- the lost leg left no recorded cause';
      return `the control ran ${s.totalGapTests} gap test(s), expected 12 (${cause}) -- it does not cover what the clean leg covers`;
    }
    if (s.suppressionLegs !== 9) return `${s.suppressionLegs} sub-400ms suppression leg(s), expected 9 -- the legs whose PASS condition is "nothing happened" were not all run`;
    if (s.suppressionLegsRed !== s.suppressionLegs) return `positive control stayed GREEN on ${s.suppressionLegs - s.suppressionLegsRed}/${s.suppressionLegs} suppression legs with every #stage button force-enabled -- the arm gate's early-tap detector is inert there, so its clean leg measures nothing`;
    return null;
  },
};
const key = label.startsWith('home-direction-c') ? 'home-direction-c' : label;
if (!V[key]) bad(`no verdict predicate for label "${label}" -- refusing to report a pass`);
const why = V[key]();
if (why) bad(why);
ok('ok');
