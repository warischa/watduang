// Site-wide double-tap hazard: every game tap-transitions by calling stage.replaceChildren(), so the
// screen that lands under the finger is a brand-new node set. If any of those nodes is a navigation
// target, a double-tap navigates the group off their round mid-game (first CONFIRMED in daily-fortune
// by docs/verification/evidence/34/12-daily-fortune-tap1-target.json; the one-game probe that produced
// it was superseded by this file and deleted).
//
// Three claims, scored separately — one check per invariant, because they fail for different reasons
// and only the first two are owned by the in-stage-anchor removal.
//
// Claim 0, the mechanism (a set we own and can make empty): after EVERY tap-driven transition in EVERY
// game, #stage contains zero `a[href]`. This is the one that must be red on all six before the fix —
// every game's result screen ships one — and green on all six after it.
//
// Claim 1, the harm: no point of the control the finger just used resolves — via
// document.elementFromPoint — to an element with an `a[href]` ancestor inside #stage. Reachability is a
// function of Thai text length x roster size x layout engine, so this is red only where the collision
// actually lands (measured: daily-fortune) even while claim 0 is red everywhere. That asymmetry is the
// reason the fix targets claim 0's set instead of the coordinates.
//
// Claim 2, the approach fork's untested assumption, measured here rather than inherited: that same point
// never lands inside nav.game-next. Scored apart from claims 0/1 on purpose — nav.game-next is page
// chrome governed by ADR-0013, so a red here is a finding about the page layout, not about #stage.
//
// Sampling: three points per tapped control (centre, top edge, bottom edge at centre-x). A real finger
// taps anywhere inside the control, so centre-only sampling under-measures the hazard; the fix has to
// hold for all three.
//
// Calibrated by construction: run this against the code BEFORE the in-stage hub anchors are removed and
// every game must report FAIL with an in-stage anchor hit. A green pre-fix run means the harness is
// measuring nothing and its post-fix green is worthless.
//
// That pre-fix build is no longer reachable from this tree, so the same calibration is now available on
// demand: BREAK_GUARD=1 appends one `<a href="/games/">` INTO #stage after every transition, positioned
// over the box the finger just used. Claim 0 and claim 1 must BOTH go red under it. A clean run's zeros
// are only worth reading when that armed run has been seen to report non-zero — a probe whose pass
// signal is "nothing found" and which has never found anything cannot be told from one that measured
// nothing (docs/verification/probe-triage-2026-08-26.md).
//
// ponytail: COVERAGE CEILING — 2 walked pages (gh#149, down from 4), and the set is bounded by the
// hazard's own precondition rather than by effort. This probe needs a tap that REPLACES #stage; only
// two pages still have one. ADR-0040 (2026-08-25) made daily-fortune and siamsi solo pages ([1, 1]): no
// PlayerSetup, no #start-round, and an EMPTY group (`soloSession.players = []`,
// src/pages/game/[id].astro), so neither renders the roster chips the old walks tapped — both are
// walked through their own solo screens instead. Every game registered since (cannon-flag, freeze-tap,
// power-meter, dice-loser, how-close-is-near, pinocchio-luck) runs full screen at its `playRoute`, and
// its /game/<id>/ landing renders prose with no button, so it has no in-#stage transition to walk.
// A green here is therefore NOT site-wide: it is every page that can tap-transition #stage. (love-match was delisted pending its "เนื้อคู่" redesign, gh#101, and no longer resolves
// at all — it carries no WALKS entry and no notCovered entry, the same way a deleted page carries
// neither.) Static coverage of the same invariant lives in scripts/no-nav-in-stage-check.mjs, which
// enumerates src/games/*.ts straight off disk rather than from the manifest — so it still grades the
// delisted love-match module, which this walk no longer reaches. Wider there than here, not narrower.
//
// Run: node scripts/driver.mjs scripts/no-nav-in-stage-probe.mjs
// (needs `npx serve dist/ -l 4321` and headless Chrome on CDP_PORT — see scripts/driver.mjs's header)

// Same 8-name roster as the daily-fortune probe: long stacked-tone-mark Thai names are the tallest,
// widest chip row the product can produce, which is what pushes later screens' nodes around.
const PLAYERS = [
  'สมชายใจดีมากพี่น้อง',
  'ปู่ย่าตายาย',
  'ก้องภพสุดหล่อ',
  'น้ำหวานคนสวย',
  'บีม',
  'เจี๊ยบ',
  'ต้นกล้าแห่งทุ่งนา',
  'แพรวพราวสาวน้อย',
];

// Injected ahead of every walk body. `transition()` samples the tapped control's three points, fires
// the trigger, then re-reads those same viewport points on the screen that replaced it.
const HELPERS = `
  const BREAK_GUARD = ${process.env.BREAK_GUARD ? 'true' : 'false'};
  const stage = document.getElementById('stage');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = (e) => { const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, top: r.top, bottom: r.bottom }; };
  function hit(x, y) {
    const at = document.elementFromPoint(x, y);
    const a = at && at.closest ? at.closest('a[href]') : null;
    return {
      x: Math.round(x), y: Math.round(y),
      tag: at ? at.tagName : null,
      text: at ? (at.textContent || '').trim().slice(0, 24) : null,
      anchorHref: a ? a.getAttribute('href') : null,
      anchorInStage: !!(a && stage.contains(a)),
      inGameNext: !!(at && at.closest && at.closest('nav.game-next')),
    };
  }
  async function transition(label, el, trigger) {
    if (!el) return { label, missing: true };
    // src/games/_arm-gate.ts disables every freshly rendered button for 400ms. An el.click() inside
    // that window is a silent no-op: the tap array still grows, so the walk keeps its length and reads
    // as N transitions while the screen never changed. Wait the gate out, and record that we did.
    let wasDisabled = false;
    for (let i = 0; i < 20 && el.disabled; i++) { wasDisabled = true; await sleep(60); }
    const g = box(el);
    const pts = [[g.cx, g.cy], [g.cx, g.top + 2], [g.cx, g.bottom - 2]];
    // Every sampled point, not just the centre: the edge samples sit outside the centre row by
    // construction, so a centre-only test called a control measurable while two of its three points
    // were off-screen and silently returning null.
    const inViewport = pts.every(([x, y]) =>
      x >= 0 && x <= window.innerWidth && y >= 0 && y <= window.innerHeight);
    const htmlBefore = stage.innerHTML;
    if (trigger) { await trigger(); } else { el.click(); await sleep(250); }
    // Read before the control is injected, or the injection itself would answer this.
    const changed = stage.innerHTML !== htmlBefore;
    // Positive control (BREAK_GUARD=1): one real anchor, appended INTO #stage after the transition and
    // positioned over the box that is about to be sampled. Claim 0 counts it, claim 1's
    // elementFromPoint lands on it. It adds an intruder, it never disables the rule under test, so a
    // green here means the detector is inert rather than that the site is clean.
    if (BREAK_GUARD) {
      const a = document.createElement('a');
      a.href = '/games/';
      a.textContent = 'probe control';
      a.setAttribute('data-probe-control', '');
      a.style.cssText = 'position:fixed;left:' + Math.round(g.cx - 20) + 'px;top:' + Math.round(g.top)
        + 'px;width:60px;height:' + Math.max(8, Math.round(g.bottom - g.top)) + 'px;z-index:99999;';
      stage.appendChild(a);
      await sleep(60);
    }
    const hits = pts.map(([x, y]) => hit(x, y));
    // Claim 0's count, plus how near a miss claim 1 was: the vertical gap between the tapped control
    // and the anchor that replaced its screen. A small positive gap means the same code is one line of
    // Thai copy away from being reachable, which is what makes the coordinate a bad thing to guard.
    const stageAnchors = [...stage.querySelectorAll('a[href]')];
    const first = stageAnchors[0] ? box(stageAnchors[0]) : null;
    return {
      label, tappedTag: el.tagName, tappedId: el.id || null, inViewport, changed, wasDisabled,
      stageAnchorCount: stageAnchors.length,
      stageAnchor: first
        ? { href: stageAnchors[0].getAttribute('href'), top: Math.round(first.top),
            bottom: Math.round(first.bottom), gapBelowTappedBottomPx: Math.round(first.top - g.bottom) }
        : null,
      anchorInStageHit: hits.some((h) => h.anchorInStage),
      gameNextHit: hits.some((h) => h.inGameNext),
      anyAnchorHit: hits.some((h) => h.anchorHref !== null),
      hits,
    };
  }
  const tap = (label, el) => transition(label, el);
  const taps = [];
`;

// One walk per game: every tap-driven transition that game can reach with an 8-name roster.
// minTransitions guards the other failure mode — a walk that silently did nothing must not read PASS.
// Solo pages ([1, 1], ADR-0040) have no roster panel and no group, so their walk gets `solo: true`
// and the runner mounts them by loading the page — the module mounts itself.
// gh#153 — siamsi moved OUT of this map and into WALKS above: the objection recorded here was that a
// party-shaped walk on a [1, 1] page measures a screen no player sees, and the solo walk added above
// is not party-shaped. Every other game on the site now runs at a playRoute and renders no button in
// #stage at all, so it has no tap-driven transition for this probe to walk — that is an absence of the
// hazard's precondition, not an uncovered page, and it is why this map is empty rather than long.
const NOT_COVERED = {};

const WALKS = {
  'daily-fortune': {
    solo: true,
    minTransitions: 2,
    // Rewritten for the solo screens: the old walk tapped roster chips, and a solo mount gets
    // `players: []` so renderAsk() appends none. #df-name + #df-go is the only path to the result
    // screen a real solo player has, and #df-again is the only way back.
    body: `
      const input = document.getElementById('df-name');
      if (input) { input.value = 'ทดสอบเอ'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      taps.push(await tap('#df-go -> result', document.getElementById('df-go')));
      taps.push(await tap('#df-again -> ask', document.getElementById('df-again')));
      return taps;`,
  },
  // gh#153 — siamsi replaces pick-loser here. Since gh#149 it is, with daily-fortune above, one of the
  // only two pages left that renders its own buttons INSIDE #stage: every other game runs full screen
  // at its own playRoute and has no /game/<id>/ page at all, so there is nothing there to tap-
  // transition and nothing for this probe to measure. Walked solo, which is what ADR-0040 made this
  // page: no roster panel, the module mounts itself on load, and #ss-start -> #ss-draw -> #ss-again is
  // the complete cycle a real solo player has. That is a longer walk than pick-loser's two taps, so
  // claim 0 is now sampled on 3 screens here instead of 2.
  siamsi: {
    solo: true,
    minTransitions: 3,
    body: `
      taps.push(await tap('#ss-start -> turn', document.getElementById('ss-start')));
      taps.push(await tap('#ss-draw -> drawn', document.getElementById('ss-draw')));
      taps.push(await tap('#ss-again -> idle', document.getElementById('ss-again')));
      return taps;`,
  },
  // gh#149 — the 'short-stick' and timebomb walks were deleted with their landing pages (ADR-0050
  // ruling 2): both games declare a playRoute, so /game/<id>/ no longer builds and there is nothing
  // to navigate to. That leaves TWO walks, both solo fortune pages, and the pinned count in
  // ci-probes-verdict.mjs drops from 4 to 2 with them. RETIRED, not relocated: the in-#stage
  // double-tap collision this probe measured on those two party games is not measured anywhere in
  // ci-probes today — their play routes put the exit control in chrome outside #stage (ADR-0050's
  // own ADR-0014 section) and scripts/play-exit-guard-probe.mjs measures that, but no lane in
  // scripts/ci-probes.sh runs it yet.
};

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const games = {};

  for (const [id, walk] of Object.entries(WALKS)) {
    // Origin first, then wipe, then reload: a wipe issued on about:blank clears nothing
    // (browser-verification.md trap 4). The roster is seeded in storage and the round is started
    // through the real #start-round button rather than by dispatching watduang:start directly — the
    // dispatch path leaves the setup panel on screen, and every y coordinate below it is then a layout
    // no player ever sees.
    await session.nav(`${base}/game/${id}/`);
    await session.setWidth(320, 900);
    await session.wipe();
    await session.evaluate(
      `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(PLAYERS))}); return true;`,
    );
    await session.nav(`${base}/game/${id}/`);

    const env = await session.evaluate(`
      return { innerWidth: window.innerWidth, innerHeight: window.innerHeight,
               seededRosterLength: JSON.parse(localStorage.getItem('watduang:roster') || '[]').length,
               sessionStorageLen: sessionStorage.length,
               stageChildren: document.getElementById('stage').children.length,
               staticHubLinks: [...document.querySelectorAll('a[data-stable-exit]')].length,
               setupPanelVisible: !!document.querySelector('#start-round')?.offsetParent };`);

    // A solo page has no panel and no checkboxes: [id].astro's `if (isSolo)` branch mounts the module
    // itself on load, so the only "start" is the navigation already done above. Ticking a roster there
    // used to throw on the null #start-round, which is how three legs read FAIL with nothing measured.
    const ticked = walk.solo
      ? { value: { solo: true, boxCount: 0, allChecked: null } }
      : await session.evaluate(`
      const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
      for (const b of boxes) if (!b.checked) b.click();
      return { boxCount: boxes.length, allChecked: boxes.length > 0 && boxes.every((b) => b.checked) };`);

    if (!walk.solo) await session.evaluate(`document.getElementById('start-round').click(); return true;`);
    await new Promise((r) => setTimeout(r, 900)); // [id].astro awaits a dynamic import before mount()

    // Detector calibration (trap 2), read both ways: before the start the panel is visible and #stage is
    // empty, after it the panel is hidden and #stage has children. A walk measured without both halves
    // flipping is void, not a pass.
    const started = await session.evaluate(`
      return { setupPanelVisible: !!document.querySelector('#start-round')?.offsetParent,
               stageChildren: document.getElementById('stage').children.length,
               staticHubLinks: [...document.querySelectorAll('a[data-stable-exit]')].length,
               innerWidth: window.innerWidth };`);

    const walked = await session.evaluate(HELPERS + walk.body);
    const taps = Array.isArray(walked.value) ? walked.value : [];
    const walkUsable =
      !walked.error &&
      env.value?.innerWidth === 320 &&
      env.value?.seededRosterLength === PLAYERS.length &&
      // The party half of the calibration (panel visible -> hidden, empty stage -> populated) does not
      // exist on a solo page: it mounts on load, so #stage already has children and there is no panel
      // to hide. The half that still reads both ways there is the walk itself — every transition must
      // have actually changed #stage.
      (walk.solo
        ? env.value?.stageChildren > 0 && env.value?.setupPanelVisible === false
        : env.value?.stageChildren === 0 &&
          env.value?.setupPanelVisible === true &&
          ticked.value?.allChecked === true &&
          started.value?.setupPanelVisible === false) &&
      started.value?.innerWidth === 320 &&
      started.value?.stageChildren > 0 &&
      taps.length >= walk.minTransitions &&
      taps.every((t) => !t.missing) &&
      // A click swallowed by the 400ms arm gate leaves the tap array full-length and the screen
      // unchanged; that is a walk that measured the same screen N times, not N transitions.
      taps.every((t) => t.changed === true);

    const screensWithStageAnchor = taps.filter((t) => t.stageAnchorCount > 0).length;
    const inStageAnchorHits = taps.filter((t) => t.anchorInStageHit).length;
    const gameNextHits = taps.filter((t) => t.gameNextHit).length;

    // Claims 1 and 2 are coordinate-based (document.elementFromPoint), which returns null for any point
    // outside the viewport — a control below the fold then hits nothing not because it's safe but
    // because it was never tested. Claim 0 is DOM-based (querySelectorAll) and immune to this, so it
    // stays scored on walkUsable alone. A tap out of viewport makes claims 1/2 unmeasured, not passing.
    const coordinateHitsMeasurable = taps.every((t) => t.inViewport !== false);
    // Hits are scored BEFORE measurability, and the order is the whole point. A positive hit is a
    // reproduction — some point in this walk really did land on a nav target — and no amount of
    // unmeasured coordinate elsewhere in the same walk can retract it. Testing measurability first
    // let one out-of-viewport tap downgrade a walk with real hits to INCONCLUSIVE, which is how a
    // deliberately RED calibration run (siamsi, love-match) could come back looking merely unproven.
    // INCONCLUSIVE therefore means exactly one thing: zero hits found, and at least one point that
    // was never actually tested.
    const scoreCoordinateClaim = (hits) =>
      !walkUsable ? 'FAIL' : hits > 0 ? 'FAIL' : !coordinateHitsMeasurable ? 'INCONCLUSIVE' : 'PASS';

    games[id] = {
      beforeStart: env.value,
      rosterTicks: ticked.value,
      afterStart: started.value,
      walkError: walked.error ?? null,
      walkUsable,
      transitions: taps.length,
      transitionsExpectedAtLeast: walk.minTransitions,
      screensWithStageAnchor,
      inStageAnchorHits,
      gameNextHits,
      anyAnchorHits: taps.filter((t) => t.anyAnchorHit).length,
      anchorHrefsHit: [
        ...new Set(taps.flatMap((t) => (t.hits ?? []).map((h) => h.anchorHref).filter(Boolean))),
      ],
      nearestStageAnchorGapsPx: taps
        .filter((t) => t.stageAnchor)
        .map((t) => ({ label: t.label, gapBelowTappedBottomPx: t.stageAnchor.gapBelowTappedBottomPx })),
      coordinateHitsMeasurable,
      stageHasNoAnchor: walkUsable && screensWithStageAnchor === 0 ? 'PASS' : 'FAIL',
      noNavTargetHitInStage: scoreCoordinateClaim(inStageAnchorHits),
      hitNeverInGameNext: scoreCoordinateClaim(gameNextHits),
      taps,
    };
  }

  const ids = Object.keys(games);
  const by = (claim, want) => ids.filter((i) => games[i][claim] === want);
  return {
    summary: {
      games: ids.length,
      // Read by a CI verdict predicate, not decoration: a control leg is only satisfied when
      // breakGuard is true AND the walks reported the planted anchor. Split per claim, never averaged.
      breakGuard: !!process.env.BREAK_GUARD,
      gamesWithUsableWalk: ids.filter((i) => games[i].walkUsable).length,
      totalTransitions: ids.reduce((n, i) => n + games[i].transitions, 0),
      totalScreensWithStageAnchor: ids.reduce((n, i) => n + games[i].screensWithStageAnchor, 0),
      totalInStageAnchorHits: ids.reduce((n, i) => n + games[i].inStageAnchorHits, 0),
      // The 2 games this run does NOT cover, and why — so no reader can take the lists below as
      // site-wide. See the ponytail ceiling note in this file's header.
      notCovered: NOT_COVERED,
      claim0_stageHasNoAnchor: { pass: by('stageHasNoAnchor', 'PASS'), fail: by('stageHasNoAnchor', 'FAIL') },
      claim1_noNavTargetHitInStage: { pass: by('noNavTargetHitInStage', 'PASS'), fail: by('noNavTargetHitInStage', 'FAIL'), inconclusive: by('noNavTargetHitInStage', 'INCONCLUSIVE') },
      claim2_hitNeverInGameNext: { pass: by('hitNeverInGameNext', 'PASS'), fail: by('hitNeverInGameNext', 'FAIL'), inconclusive: by('hitNeverInGameNext', 'INCONCLUSIVE') },
      perGame: Object.fromEntries(
        ids.map((i) => [
          i,
          {
            stageHasNoAnchor: games[i].stageHasNoAnchor,
            noNavTargetHitInStage: games[i].noNavTargetHitInStage,
            hitNeverInGameNext: games[i].hitNeverInGameNext,
            walkUsable: games[i].walkUsable,
            coordinateHitsMeasurable: games[i].coordinateHitsMeasurable,
            transitions: games[i].transitions,
            screensWithStageAnchor: games[i].screensWithStageAnchor,
            inStageAnchorHits: games[i].inStageAnchorHits,
            gameNextHits: games[i].gameNextHits,
            anyAnchorHits: games[i].anyAnchorHits,
            anchorHrefsHit: games[i].anchorHrefsHit,
            nearestStageAnchorGapsPx: games[i].nearestStageAnchorGapsPx,
          },
        ]),
      ),
    },
    games,
    consoleErrors: session.consoleErrors,
  };
}
