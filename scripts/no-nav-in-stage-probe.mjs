// Site-wide double-tap hazard: every game tap-transitions by calling stage.replaceChildren(), so the
// screen that lands under the finger is a brand-new node set. If any of those nodes is a navigation
// target, a double-tap navigates the group off their round mid-game (first CONFIRMED in daily-fortune
// by scripts/daily-fortune-double-tap-probe.mjs).
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
// every game must report FAIL with a `/games/` anchor hit. A green pre-fix run means the harness is
// measuring nothing and its post-fix green is worthless.
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
    const g = box(el);
    const pts = [[g.cx, g.cy], [g.cx, g.top + 2], [g.cx, g.bottom - 2]];
    const inViewport = g.cy >= 0 && g.cy <= window.innerHeight;
    if (trigger) { await trigger(); } else { el.click(); await sleep(250); }
    const hits = pts.map(([x, y]) => hit(x, y));
    // Claim 0's count, plus how near a miss claim 1 was: the vertical gap between the tapped control
    // and the anchor that replaced its screen. A small positive gap means the same code is one line of
    // Thai copy away from being reachable, which is what makes the coordinate a bad thing to guard.
    const stageAnchors = [...stage.querySelectorAll('a[href]')];
    const first = stageAnchors[0] ? box(stageAnchors[0]) : null;
    return {
      label, tappedTag: el.tagName, tappedId: el.id || null, inViewport,
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
const WALKS = {
  'daily-fortune': {
    minTransitions: 2,
    body: `
      const chips = () => [...stage.querySelectorAll('button')].filter((b) => b.id !== 'df-go');
      taps.push(await tap('chip(last) -> result', chips().at(-1)));
      taps.push(await tap('#df-again -> ask', document.getElementById('df-again')));
      return taps;`,
  },
  siamsi: {
    minTransitions: 18, // start + 8 draws + 8 passes + again
    body: `
      taps.push(await tap('#ss-start -> turn', document.getElementById('ss-start')));
      for (let i = 0; i < 40 && !document.getElementById('ss-again'); i++) {
        const draw = document.getElementById('ss-draw');
        if (draw) { taps.push(await tap('#ss-draw -> drawn', draw)); continue; }
        const pass = document.getElementById('ss-pass');
        if (!pass) break;
        const t = await tap('#ss-pass', pass);
        t.label = document.getElementById('ss-again') ? '#ss-pass -> summary' : '#ss-pass -> turn';
        taps.push(t);
      }
      taps.push(await tap('#ss-again -> idle', document.getElementById('ss-again')));
      return taps;`,
  },
  'pick-loser': {
    minTransitions: 2,
    body: `
      taps.push(await tap('#pl-pick -> result', document.getElementById('pl-pick')));
      taps.push(await tap('#pl-again -> idle', document.getElementById('pl-again')));
      return taps;`,
  },
  'short-stick': {
    minTransitions: 2, // the short stick can come on the first draw
    body: `
      for (let i = 0; i < 40 && !document.getElementById('ss-again'); i++) {
        const pass = document.getElementById('ss-pass');
        if (pass) { taps.push(await tap('#ss-pass -> draw', pass)); continue; }
        const stick = stage.querySelector('button[aria-label="จับไม้"]');
        if (!stick) break;
        const t = await tap('stick', stick);
        t.label = document.getElementById('ss-again') ? 'stick -> result' : 'stick -> passing';
        taps.push(t);
      }
      taps.push(await tap('#ss-again -> draw', document.getElementById('ss-again')));
      return taps;`,
  },
  timebomb: {
    minTransitions: 3,
    body: `
      taps.push(await tap('#tb-start -> ticking', document.getElementById('tb-start')));
      // The boom is timer-driven (15-45s fuse), not tap-driven — but the finger's last position is
      // #tb-pass, so the same coordinate collision applies and this is the honest analogue.
      const pass = document.getElementById('tb-pass');
      let waitedMs = null;
      const t = await transition('detonation -> boom (finger last on #tb-pass)', pass, async () => {
        pass.click();
        const t0 = Date.now();
        while (!document.getElementById('tb-again') && Date.now() - t0 < 60000) await sleep(250);
        waitedMs = Date.now() - t0;
      });
      t.boomWaitedMs = waitedMs;
      t.boomScreenReached = !!document.getElementById('tb-again');
      taps.push(t);
      taps.push(await tap('#tb-again -> idle', document.getElementById('tb-again')));
      return taps;`,
  },
  'love-match': {
    minTransitions: 3,
    body: `
      const chips = () => [...stage.querySelectorAll('button')].filter((b) => b.id !== 'lm-reset' && b.id !== 'lm-again');
      taps.push(await tap('chip(first) -> in-place pick', chips()[0]));
      taps.push(await tap('chip(last) -> result', chips().at(-1)));
      taps.push(await tap('#lm-again -> pick', document.getElementById('lm-again')));
      return taps;`,
  },
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
               staticHubLinks: [...document.querySelectorAll('a[href="/games/"]')].length,
               setupPanelVisible: !!document.querySelector('#start-round')?.offsetParent };`);

    const ticked = await session.evaluate(`
      const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
      for (const b of boxes) if (!b.checked) b.click();
      return { boxCount: boxes.length, allChecked: boxes.length > 0 && boxes.every((b) => b.checked) };`);

    await session.evaluate(`document.getElementById('start-round').click(); return true;`);
    await new Promise((r) => setTimeout(r, 900)); // [id].astro awaits a dynamic import before mount()

    // Detector calibration (trap 2), read both ways: before the start the panel is visible and #stage is
    // empty, after it the panel is hidden and #stage has children. A walk measured without both halves
    // flipping is void, not a pass.
    const started = await session.evaluate(`
      return { setupPanelVisible: !!document.querySelector('#start-round')?.offsetParent,
               stageChildren: document.getElementById('stage').children.length,
               staticHubLinks: [...document.querySelectorAll('a[href="/games/"]')].length,
               innerWidth: window.innerWidth };`);

    const walked = await session.evaluate(HELPERS + walk.body);
    const taps = Array.isArray(walked.value) ? walked.value : [];
    const walkUsable =
      !walked.error &&
      env.value?.innerWidth === 320 &&
      env.value?.seededRosterLength === PLAYERS.length &&
      env.value?.stageChildren === 0 &&
      env.value?.setupPanelVisible === true &&
      ticked.value?.allChecked === true &&
      started.value?.innerWidth === 320 &&
      started.value?.setupPanelVisible === false &&
      started.value?.stageChildren > 0 &&
      taps.length >= walk.minTransitions &&
      taps.every((t) => !t.missing);

    const screensWithStageAnchor = taps.filter((t) => t.stageAnchorCount > 0).length;
    const inStageAnchorHits = taps.filter((t) => t.anchorInStageHit).length;
    const gameNextHits = taps.filter((t) => t.gameNextHit).length;

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
      stageHasNoAnchor: walkUsable && screensWithStageAnchor === 0 ? 'PASS' : 'FAIL',
      noNavTargetHitInStage: walkUsable && inStageAnchorHits === 0 ? 'PASS' : 'FAIL',
      hitNeverInGameNext: walkUsable && gameNextHits === 0 ? 'PASS' : 'FAIL',
      taps,
    };
  }

  const ids = Object.keys(games);
  const by = (claim, want) => ids.filter((i) => games[i][claim] === want);
  return {
    summary: {
      games: ids.length,
      claim0_stageHasNoAnchor: { pass: by('stageHasNoAnchor', 'PASS'), fail: by('stageHasNoAnchor', 'FAIL') },
      claim1_noNavTargetHitInStage: { pass: by('noNavTargetHitInStage', 'PASS'), fail: by('noNavTargetHitInStage', 'FAIL') },
      claim2_hitNeverInGameNext: { pass: by('hitNeverInGameNext', 'PASS'), fail: by('hitNeverInGameNext', 'FAIL') },
      perGame: Object.fromEntries(
        ids.map((i) => [
          i,
          {
            stageHasNoAnchor: games[i].stageHasNoAnchor,
            noNavTargetHitInStage: games[i].noNavTargetHitInStage,
            hitNeverInGameNext: games[i].hitNeverInGameNext,
            walkUsable: games[i].walkUsable,
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
