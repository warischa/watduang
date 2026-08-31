// gh#149 STALE TARGET — this file drives /game/<id>/ landing pages that ADR-0050 ruling 2 deleted.
// It is a manual tool wired into no gate, so it cannot red anything; run it and it navigates to a
// URL that only Azure resolves, via a 301 to the play route, and measures the wrong page. Re-point
// it at /game/<id>/play/ (a different DOM) or delete it — do not read a run of it as evidence.
// #40 — real-touch proof that src/games/_arm-gate.ts's 400ms window actually stops a ghost tap in
// short-stick and timebomb, and that the probe itself can go RED. Uses scripts/driver.mjs's
// session.tap() (Input.dispatchTouchEvent) — a real touch, not .click()+elementFromPoint, per the
// #39 lesson (browser-verification.md trap set): a synthetic click proves an element sits at a
// point, never that a real tap there fires anything.
//
// The hazard, concretely, in both games: a control that just replaced a same-position control
// (ss-pass -> the next draw screen's stick bundle; tb-again -> the idle screen's "เริ่มจับเวลา") sits
// under a finger mid-double-tap. Contact 1 is the legitimate tap that causes the swap. Contact 2,
// arriving under ARM_DELAY_MS later, must not register on the new control.
//
// Contact 2's coordinate is NOT assumed to equal contact 1's raw pixel. A first pass at this probe
// did exactly that and got a false "suppressed" verdict for timebomb on the UNFIXED build: #tb-again
// and #tb-start sit ~54px apart once `lastLoser` adds its extra idle-screen line (present after any
// boom, i.e. every real "again" the player can ever tap), so a same-pixel "ghost" tap misses the
// control entirely — a positive-control failure, not a pass. Instead this probe grid-scans the real
// control's box for the point nearest contact 1's own tap, the way #39's lesson (never sample only
// the centre line) generalises: measure where contact 2 actually lands, do not assume it.
//
// ghostDoubleTap works around one constraint in scripts/driver.mjs's session.tap(x,y): it always
// sleeps a fixed 400ms after dispatching, before its own promise resolves — so two sequential
// `await`ed calls can never land less than ~400ms apart, and this probe needs 100ms/350ms gaps too.
// The fix needs no change to driver.mjs: session.tap(x,y) dispatches its CDP touchStart/touchEnd
// synchronously (before its first internal await), so calling it WITHOUT awaiting starts the real
// touch immediately; the 400ms sleep only delays when that call's own promise settles, not when the
// touch fires. Two un-awaited calls separated by our own setTimeout(gapMs) land the two touches
// gapMs apart for real, then both promises are awaited together.
//
// ARM_DELAY_MS is duplicated here (not imported) — _arm-gate.ts is a TS module meant for the Vite
// bundle, and this repo ships 3 packages on purpose (no ts-node) — see browser-verification.md.
//
// Port isolation: pass CDP_PORT and PROBE_BASE explicitly, never assume the defaults are free.
// Run:
//   PROBE_BASE=http://localhost:4322 CDP_PORT=9333 node scripts/driver.mjs scripts/arm-gate-probe.mjs
// (needs `npx serve dist/ -l 4322` and headless Chrome on --remote-debugging-port=9333)
// STATUS (gh#43): coverage is now gated statically by scripts/arm-gate-coverage-check.mjs (every render function must call armAllButtons). This probe stays manual — it proves the physical layer that no source scan reaches: a real touch on a disabled button still bubbles pointerdown to #stage.

const ARM_DELAY_MS = 400; // mirrors src/games/_arm-gate.ts

// ponytail: COVERAGE CEILING — 3 of 5 games, and the missing 2 are named rather than averaged away.
// This file used to carry daily-fortune and siamsi scenarios built on PlayerSetup's
// #roster-list / #start-round and on roster chips. ADR-0040 (2026-08-25) made both solo ([1, 1]):
// no panel, no #start-round (every one of those legs threw "Cannot read properties of null (reading
// 'click')"), and an empty group, so daily-fortune renders no chips at all and siamsi has
// no turn to pass until its own redesign ticket lands. The scenarios were deleted
// rather than rewritten against screens that are about to be replaced. What they proved is not lost:
// scripts/arm-gate-coverage-check.mjs statically gates that EVERY render function in EVERY game arms
// its buttons (armAllButtons); what only this probe can prove — that a real touch on a `disabled`
// button still bubbles pointerdown to #stage — is a physical property of the browser, not of a game,
// so 3 games exercise it as convincingly as 5.
// (love-match was delisted pending its "เนื้อคู่" redesign, gh#101, and no longer resolves at all — it
// carries no scenario and no NOT_COVERED entry, the same way a deleted page carries neither.)
const NOT_COVERED = {
  'daily-fortune': 'ADR-0040 solo page: renders no roster chips (empty group), so the chip-exception and chip-driven legs have no chips to tap.',
  'dice-loser': 'gh#139 port: the landing renders prose and no button, the game runs full screen at its playRoute — no in-#stage button exists here for a gate to arm. Same for cannon-flag, freeze-tap, power-meter, how-close-is-near and pinocchio-luck.',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(session, body) {
  const r = await session.evaluate(body);
  if (r.error) throw new Error(`evaluate failed: ${r.error}`);
  return r.value;
}

// Two independent real touches, gapMs apart. (x1,y1) is contact 1's point, (x2,y2) is contact 2's —
// see the header note on why these are not assumed equal.
async function ghostDoubleTap(session, x1, y1, x2, y2, gapMs) {
  const p1 = session.tap(x1, y1); // dispatches touchStart/touchEnd synchronously, before its own await
  await sleep(gapMs);
  const p2 = session.tap(x2, y2);
  await Promise.all([p1, p2]);
}

async function getRect(session, selector) {
  return ev(
    session,
    `
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
             cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
  `,
  );
}

// Attached once per page load, directly on #stage (a stable element — only its children are
// replaced by every render in these games), capture phase so nothing downstream can hide it from us.
// This is the instrument for the open question: does a real touch on a `disabled` control dispatch
// a pointerdown that bubbles here at all?
const INSTALL_PDLOG = `
  const stage = document.getElementById('stage');
  // Positive control (BREAK_GUARD=1): keep every button in #stage enabled, which is exactly what the
  // pre-_arm-gate build did. Every gap test below ARM_DELAY_MS must then report FAIL — the ghost tap
  // registers. A suppression leg whose PASS condition is "the screen did not change" is worth nothing
  // until it has been seen to go red on a build where the ghost tap DOES get through, and the build
  // that predates the gate is no longer reachable from this tree. It disables the RULE under test on
  // purpose and only under this flag; the detector (the state reads below) is untouched.
  if (stage && ${process.env.BREAK_GUARD ? 'true' : 'false'} && !stage.__ungateInstalled) {
    stage.__ungateInstalled = true;
    const ungate = () => { for (const b of stage.querySelectorAll('button')) b.disabled = false; };
    new MutationObserver(ungate).observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    setInterval(ungate, 20);
    ungate();
  }
  if (stage && !stage.__pdLogInstalled) {
    stage.__pdLogInstalled = true;
    stage.__pdLog = [];
    stage.addEventListener('pointerdown', (e) => {
      stage.__pdLog.push({ tag: e.target.tagName, disabled: !!e.target.disabled, t: performance.now() });
    }, true);
  }
  return true;
`;

// Grid-scan a box for real button hits — not a 3-point centre line (browser-verification.md trap:
// a prior probe passed at 3 centre points while a real collider sat 7px off axis). `target`, if
// given, also returns the scanned hit point nearest to it (the realistic "finger barely moved" spot).
const SCAN_BOX_FN = `
  function scanBox(b, stepX, stepY, target) {
    const pts = [];
    for (let x = b.left + 1; x <= b.right - 1; x += stepX)
      for (let y = b.top + 1; y <= b.bottom - 1; y += stepY) pts.push([x, y]);
    let hits = 0; const samples = []; let nearest = null; let nearestDist = Infinity;
    for (const [x, y] of pts) {
      const at = document.elementFromPoint(x, y);
      const btn = at && at.closest ? at.closest('button') : null;
      if (btn) {
        hits++;
        if (samples.length < 3) samples.push({ x: Math.round(x), y: Math.round(y) });
        if (target) {
          const d = Math.hypot(x - target.x, y - target.y);
          if (d < nearestDist) { nearestDist = d; nearest = { x, y }; }
        }
      }
    }
    return { points: pts.length, hits, samples, nearest, nearestDist };
  }
`;

// ---- Fixtures ----------------------------------------------------------------------------------

// Same 8-name roster the #39 probes use — a mix of ordinary and long stacked-tone-mark Thai names.
const ROSTER8 = [
  'สมชายใจดีมากพี่น้อง',
  'ปู่ย่าตายาย',
  'ก้องภพสุดหล่อ',
  'น้ำหวานคนสวย',
  'บีม',
  'เจี๊ยบ',
  'ต้นกล้าแห่งทุ่งนา',
  'แพรวพราวสาวน้อย',
];
// Name-length extremes: a 1-char name and a long stacked-tone-mark name in the same 2-player roster.
const ROSTER_EXTREME = ['ก', 'สมชายใจดีมากพี่น้องสุดที่สุดในโลกทั้งใบนี้เท่านั้นเอง'];

const SHORT_STICK_SCENARIOS = [
  { label: '320px roster8 delay-sweep', width: 320, roster: ROSTER8, gaps: [100, 350, 490] },
  { label: '390px roster8', width: 390, roster: ROSTER8, gaps: [350] },
  { label: '320px name-extremes', width: 320, roster: ROSTER_EXTREME, gaps: [350] },
];
const TIMEBOMB_SCENARIOS = [
  { label: '320px roster8 delay-sweep', width: 320, roster: ROSTER8, gaps: [100, 350, 490] },
  { label: '390px roster8', width: 390, roster: ROSTER8, gaps: [350] },
  { label: '320px name-extremes', width: 320, roster: ROSTER_EXTREME, gaps: [350] },
];

// ---- short-stick --------------------------------------------------------------------------------

async function readShortStickState(session) {
  return ev(
    session,
    `
    const stage = document.getElementById('stage');
    const hasAgain = !!document.getElementById('ss-again');
    const hasPass = !!document.getElementById('ss-pass');
    const sticks = [...stage.querySelectorAll('button.st-stick')];
    // Read off the classes short-stick.ts actually renders. This used to index stage <p> elements:
    // paras[1] on the result and passing screens, paras[0]/paras[1] on the draw screen. The holder name
    // has been a <span class="st-holder-name"> and the shout lines <span class="st-shout"> for long
    // enough that every player/next value came back null — which made the <400ms "suppressed"
    // assertions pass vacuously (null === null) and the >=400ms "registered" assertion unpassable by
    // construction (docs/verification/probe-triage-2026-08-26.md).
    const shouts = [...stage.querySelectorAll('.st-shout')].map((e) => e.textContent.trim());
    const remarkEl = stage.querySelector('.st-remark');
    const remark = remarkEl ? remarkEl.textContent.trim() : null;
    const holderEl = stage.querySelector('.st-holder-name');
    const holder = holderEl ? holderEl.textContent.trim() : null;
    let screen, player, next, stickCount;
    if (hasAgain) {
      screen = 'result';
      const m = shouts.map((t) => t.match(/^(.*) โดน$/)).find(Boolean);
      player = m ? m[1] : null;
    } else if (hasPass) {
      screen = 'passing';
      const m = remark ? remark.match(/^(.*) รอดไปได้ ส่งมือถือให้ (.*) ต่อเลย$/) : null;
      player = m ? m[1] : null;
      next = m ? m[2] : null;
    } else {
      screen = 'draw';
      const m0 = holder ? holder.match(/^ตาของ (.*)$/) : null;
      player = m0 ? m0[1] : null;
      stickCount = sticks.length;
    }
    return { screen, player, next, stickCount, stickButtons: sticks.length, shouts, remark, holder };
  `,
  );
}

async function tapFirstStickDeliberately(session) {
  await sleep(500); // clear any pending arm window — this advance is setup, not the measured tap
  const rect = await ev(
    session,
    `
    const b = document.querySelector('#stage button.st-stick');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
  `,
  );
  if (!rect) throw new Error('short-stick: no stick button to tap');
  await session.tap(rect.cx, rect.cy);
}

async function playShortStickToPassing(session, maxSteps = 8) {
  for (let i = 0; i < maxSteps; i++) {
    const s = await readShortStickState(session);
    if (s.screen === 'passing') return { ok: true, state: s };
    if (s.screen === 'result') return { ok: false, ended: true, state: s };
    await tapFirstStickDeliberately(session);
  }
  return { ok: false, ended: false, state: null, error: 'maxSteps exceeded' };
}

async function startShortStickRound(session, base, roster, width) {
  await session.nav(`${base}/game/short-stick/`);
  await session.setWidth(width, 900);
  await session.wipe();
  await ev(session, `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(roster))}); return true;`);
  await session.nav(`${base}/game/short-stick/`);
  await ev(session, INSTALL_PDLOG);
  await ev(
    session,
    `
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click(); return true;`,
  );
  await sleep(900);
}

// Reaches a passing screen from wherever the page currently is, restarting the round (fresh
// startShortStickRound) whenever the current round ends before one is reached — short-stick's loser
// stick is random, so a fresh round can hit it on turn 0.
async function reachShortStickPassing(session, base, roster, width, maxRetries = 8) {
  let setup = await playShortStickToPassing(session);
  let retries = 0;
  while (!setup.ok && retries < maxRetries) {
    await startShortStickRound(session, base, roster, width);
    setup = await playShortStickToPassing(session);
    retries += 1;
  }
  return setup;
}

// One-time, non-timed dry run: taps #ss-pass for real, then grid-scans the resulting stick bundle
// for the real hit nearest that same tap point. Leaves the page on a 'draw' screen — the caller
// must reach a fresh passing screen before the timed gap tests. Returns null (unmeasurable) if no
// real collision exists anywhere in the bundle's box.
async function measureShortStickContact2(session) {
  const passRect = await getRect(session, '#ss-pass');
  if (!passRect) return null;
  await session.tap(passRect.cx, passRect.cy);
  const bundleRect = await ev(
    session,
    `
    const btns = [...document.querySelectorAll('#stage button.st-stick')];
    if (!btns.length) return null;
    const ls = btns.map((b) => b.getBoundingClientRect());
    return { left: Math.min(...ls.map((r) => r.left)), top: Math.min(...ls.map((r) => r.top)),
             right: Math.max(...ls.map((r) => r.right)), bottom: Math.max(...ls.map((r) => r.bottom)) };
  `,
  );
  if (!bundleRect) return null;
  const scan = await ev(
    session,
    `
    ${SCAN_BOX_FN}
    return scanBox(${JSON.stringify(bundleRect)}, 6, 5, ${JSON.stringify({ x: passRect.cx, y: passRect.cy })});
  `,
  );
  if (!scan.nearest) return null;
  return { contact1: { x: passRect.cx, y: passRect.cy }, contact2: scan.nearest, bundleRect, scan };
}

// One timed gap test. Returns { entry } with a scored leg, or { entry: null, stalePoint } when the
// >=400ms tap did not register AND contact 2's point is no longer a live stick — a leg that measured
// nothing, which must never be scored as either a pass or a real failure.
async function shortStickGapTest(session, setup, contact2Point, gapMs) {
  const expectedNext = setup.state.next;
  const passRect = await getRect(session, '#ss-pass');
  if (!passRect) return { entry: { gapMs, verdict: 'FAIL', note: '#ss-pass not found — unmeasurable' } };
  await ghostDoubleTap(session, passRect.cx, passRect.cy, contact2Point.x, contact2Point.y, gapMs);
  const after = await readShortStickState(session);

  let verdict, note;
  if (gapMs < ARM_DELAY_MS) {
    const suppressed = after.screen === 'draw' && after.player === expectedNext;
    verdict = suppressed ? 'PASS' : 'FAIL';
    note = suppressed
      ? 'ghost tap suppressed — same player, same screen'
      : `ghost tap registered when it should have been suppressed — screen=${after.screen} player=${after.player ?? after.next}`;
  } else {
    const registered =
      (after.screen === 'passing' && after.player === expectedNext) ||
      (after.screen === 'result' && after.player === expectedNext);
    if (!registered) {
      const pointNow = await ev(
        session,
        `
        const el = document.elementFromPoint(${Math.round(contact2Point.x)}, ${Math.round(contact2Point.y)});
        const btn = el && el.closest ? el.closest('button.st-stick') : null;
        return { tag: el ? el.tagName : null, className: el ? String(el.className) : null, liveStick: !!btn };`,
      );
      if (!pointNow.liveStick) return { entry: null, stalePoint: pointNow };
    }
    verdict = registered ? 'PASS' : 'FAIL';
    note = registered
      ? 'deliberate post-window tap registered — exactly one turn advanced'
      : `did not register as expected, and contact 2's point IS a live stick — screen=${after.screen} player=${after.player}`;
  }
  return {
    entry: {
      gapMs,
      expectedNext,
      contact1: { x: Math.round(passRect.cx), y: Math.round(passRect.cy) },
      contact2: contact2Point,
      after,
      verdict,
      note,
    },
  };
}

async function runShortStickScenario(session, base, scenario) {
  const { label, width, roster, gaps } = scenario;
  const result = {
    label,
    width,
    rosterSize: roster.length,
    gapTests: [],
    collisionEvidence: null,
    pointerdownOnDisabled: null,
    scenarioError: null,
  };
  try {
    await startShortStickRound(session, base, roster, width);
    let setup = await reachShortStickPassing(session, base, roster, width);
    if (!setup.ok) {
      result.scenarioError = 'could not reach an initial passing screen after retries';
      return result;
    }

    let contact2 = await measureShortStickContact2(session);
    let retries = 0;
    while (!contact2 && retries < 4) {
      await startShortStickRound(session, base, roster, width);
      setup = await reachShortStickPassing(session, base, roster, width);
      if (setup.ok) contact2 = await measureShortStickContact2(session);
      retries += 1;
    }
    if (!contact2) {
      result.scenarioError = 'could not find a real collision point for contact 2 — unmeasurable';
      return result;
    }
    result.collisionEvidence = contact2;

    setup = await reachShortStickPassing(session, base, roster, width); // dry run left us at 'draw'

    for (const gapMs of gaps) {
      // Every leg starts from a FRESH round, not from wherever the previous leg left the game. The
      // spent-slot pattern is what makes contact 2's learned point valid: on the first passing screen
      // of a fresh round exactly one slot is spent (slot 0 — tapFirstStickDeliberately always takes the
      // first live stick), which is the same state the point was learned in. Continuing the round
      // instead accumulated spent slots until the learned point was a dead <div> and the >=400ms leg
      // reported a failure that was really a mis-aimed tap.
      await startShortStickRound(session, base, roster, width);
      setup = await reachShortStickPassing(session, base, roster, width);
      if (!setup.ok) {
        result.gapTests.push({ gapMs, verdict: 'FAIL', note: 'could not reach a passing screen — unmeasurable' });
        continue;
      }

      // Contact 2's point is learned once, on a dry run, but short-stick re-renders the whole stick
      // bundle every turn and leaves a TAKEN stick in place as a spent <div> with no handler. A point
      // that was a live button when it was learned can be a spent slot two turns later, and a tap
      // there cannot register — which is indistinguishable from a gate that wrongly suppressed it.
      // shortStickGapTest returns entry:null in exactly that case; the point is re-learned against the
      // current round and the leg re-run, rather than scored on a target that was never tappable.
      let res = await shortStickGapTest(session, setup, contact2.contact2, gapMs);
      if (!res.entry) {
        setup = await reachShortStickPassing(session, base, roster, width);
        const relearned = setup.ok ? await measureShortStickContact2(session) : null;
        if (relearned) {
          contact2 = relearned;
          result.collisionEvidence = relearned;
          setup = await reachShortStickPassing(session, base, roster, width);
          if (setup.ok) res = await shortStickGapTest(session, setup, contact2.contact2, gapMs);
        }
      }
      result.gapTests.push(
        res.entry ?? {
          gapMs,
          verdict: 'FAIL(unmeasurable)',
          contact2: contact2.contact2,
          stalePoint: res.stalePoint,
          note: `contact 2's point is not a live stick this turn (${JSON.stringify(res.stalePoint)}) — the tap had nothing to register on, so this leg measured nothing`,
        },
      );

      if (gapMs < ARM_DELAY_MS && !result.pointerdownOnDisabled) {
        result.pointerdownOnDisabled = await ev(session, `return (document.getElementById('stage').__pdLog || []).slice(-5);`);
      }

      // No re-position here: the next leg restarts the round itself (see the top of this loop).
    }
  } catch (e) {
    result.scenarioError = String((e && e.stack) || e);
  }
  return result;
}

// ---- timebomb -------------------------------------------------------------------------------------

async function readTimebombState(session) {
  return ev(
    session,
    `
    // #tb-fuse is the ticking screen's fuse fill (src/games/timebomb.ts). The id read here used to be
    // #tb-pulse, which does not exist anywhere in the game — so hasPulse was permanently false, the
    // ">=400ms registered" assertion required it to be true, and that leg was unpassable by
    // construction regardless of the real behaviour (docs/verification/probe-triage-2026-08-26.md).
    return { hasStart: !!document.getElementById('tb-start'),
             hasFuse: !!document.getElementById('tb-fuse'),
             hasPass: !!document.getElementById('tb-pass'),
             hasAgain: !!document.getElementById('tb-again') };
  `,
  );
}

async function startTimebombRound(session, base, roster, width) {
  await session.nav(`${base}/game/timebomb/`);
  await session.setWidth(width, 900);
  await session.wipe();
  await ev(session, `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(roster))}); return true;`);
  await session.nav(`${base}/game/timebomb/`);
  await ev(session, INSTALL_PDLOG);
  await ev(
    session,
    `
    // Patch Date.now so the 30-90s real fuse can be fast-forwarded in this probe without waiting it
    // out — game logic samples Date.now() fresh every frame (never accumulates), so this is safe.
    if (!window.__realNow) { window.__realNow = Date.now; window.__nowOffset = 0; Date.now = () => window.__realNow() + window.__nowOffset; }
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click(); return true;`,
  );
  await sleep(900);
}

async function fastDetonate(session) {
  await sleep(500); // clear any pending arm window before this deliberate, unmeasured start
  await ev(session, `window.__nowOffset = 0; document.getElementById('tb-start').click(); return true;`);
  await sleep(50);
  await ev(session, `window.__nowOffset += 999999; return true;`);
  await sleep(150);
}

// One-time, non-timed dry run: taps #tb-again for real, then grid-scans #tb-start's resulting box
// for the real hit nearest that same tap point. Leaves the page armed nowhere in particular — the
// caller must fastDetonate() again before the timed gap tests. Null (unmeasurable) if #tb-start
// never appears or the scan finds no hit at all (defensive; #tb-start is a single element, so a
// non-empty box always yields a hit at its own centre — this only trips if the box is empty/zero).
async function measureTimebombContact2(session) {
  const againRect = await getRect(session, '#tb-again');
  if (!againRect) return null;
  await session.tap(againRect.cx, againRect.cy);
  const startRect = await getRect(session, '#tb-start');
  if (!startRect) return null;
  const scan = await ev(
    session,
    `
    ${SCAN_BOX_FN}
    return scanBox(${JSON.stringify({ left: startRect.left, top: startRect.top, right: startRect.right, bottom: startRect.bottom })}, 6, 5, ${JSON.stringify({ x: againRect.cx, y: againRect.cy })});
  `,
  );
  if (!scan.nearest) return null;
  return { contact1: { x: againRect.cx, y: againRect.cy }, contact2: scan.nearest, startRect, scan };
}

async function timebombGapTest(session, gapMs, contact2Target) {
  const rect = await getRect(session, '#tb-again');
  if (!rect) throw new Error('timebomb: #tb-again not found');
  await ghostDoubleTap(session, rect.cx, rect.cy, contact2Target.x, contact2Target.y, gapMs);
  const after = await readTimebombState(session);
  const suppressedOk = after.hasStart === true && after.hasFuse === false && after.hasPass === false;
  const registeredOk = after.hasStart === false && after.hasFuse === true && after.hasPass === true;
  const verdict = gapMs < ARM_DELAY_MS ? (suppressedOk ? 'PASS' : 'FAIL') : registeredOk ? 'PASS' : 'FAIL';
  const note =
    gapMs < ARM_DELAY_MS
      ? suppressedOk
        ? 'ghost tap suppressed — idle screen still up, fuse not armed'
        : `ghost tap registered when it should have been suppressed — ${JSON.stringify(after)}`
      : registeredOk
        ? 'deliberate post-window tap registered — fuse armed'
        : `did not arm as expected — ${JSON.stringify(after)}`;
  return {
    gapMs,
    contact1: { x: Math.round(rect.cx), y: Math.round(rect.cy) },
    contact2: contact2Target,
    after,
    verdict,
    note,
  };
}

async function runTimebombScenario(session, base, scenario) {
  const { label, width, roster, gaps } = scenario;
  const result = {
    label,
    width,
    rosterSize: roster.length,
    gapTests: [],
    collisionEvidence: null,
    pointerdownOnDisabled: null,
    scenarioError: null,
  };
  try {
    await startTimebombRound(session, base, roster, width);
    await fastDetonate(session);

    const contact2 = await measureTimebombContact2(session);
    if (!contact2) {
      result.scenarioError = 'could not find a real collision point for contact 2 — unmeasurable';
      return result;
    }
    result.collisionEvidence = contact2;

    await fastDetonate(session); // dry run left us on idle, un-armed — arm and detonate again for real

    for (const gapMs of gaps) {
      const before = await readTimebombState(session);
      if (!before.hasAgain) throw new Error('timebomb: not on the boom screen before a gap test');

      const t = await timebombGapTest(session, gapMs, contact2.contact2);
      result.gapTests.push(t);

      if (gapMs < ARM_DELAY_MS && !result.pointerdownOnDisabled) {
        result.pointerdownOnDisabled = await ev(session, `return (document.getElementById('stage').__pdLog || []).slice(-5);`);
      }

      const s2 = await readTimebombState(session);
      if (s2.hasFuse) {
        await ev(session, `window.__nowOffset += 999999; return true;`); // already armed — straight to next boom
        await sleep(150);
      } else {
        await fastDetonate(session); // still idle — arm deliberately, then fast-forward
      }
    }
  } catch (e) {
    result.scenarioError = String((e && e.stack) || e);
  }
  return result;
}

// ---- #42 / gh#153: siamsi -----------------------------------------------------------------------
// Same real-touch method as short-stick/timebomb above, simplified where the geometry allows it: every
// control here is a single full-width button (no stick/card bundle to grid-scan), so getRect's own
// centre point IS the real, current position of the real button — `disabled` blocks a click uniformly
// across the whole element, so there is no separate collision-geometry question to answer here the way
// there was for short-stick's stick bundle (#39). A short untimed dry run still learns each control's
// rect before the timed gap test, exactly as above, because the target does not exist until the prior
// screen's tap creates it.
//
// gh#153 — this scenario was pick-loser's; siamsi inherits it because it has the property the leg
// tests: three screens that each call stage.replaceChildren() and then armAllButtons(stage), so a
// control lands under the finger that caused the swap. Every game registered since ADR-0040 runs full
// screen at a playRoute and renders no button in #stage, so none of them can host this leg.
//
// LOST with pick-loser, and not replaced: its `pl-pick exception` leg. That was the recorded owner
// decision (arm-gate-coverage-check.mjs, UNGATED_EXCEPTIONS) where a button rendered BY a preceding
// gated control's tap is deliberately left live at t0, and siamsi gates all three of its screens, so
// nothing in this probe's page set can host it.
//
// gh#154 correction, checked against the tree rather than carried forward: the earlier wording here
// said "there is no ungated in-#stage button left on the site", and that is FALSE — UNGATED_EXCEPTIONS
// still holds short-stick.ts::renderPassing, timebomb.ts::renderTicking and timebomb.ts::renderBoom,
// each of which really does build an in-#stage button with no armAllButtons call (ADR-0017 left them
// ungated on purpose). What has no subject is the narrower shape above. Whether one of those three
// can host a repointed leg is an OPEN question, not a settled no — it needs the same real-touch
// scenario written against it, which this ticket did not do.

async function seedSolo(session, base, path, width) {
  // ADR-0040 solo page: no roster, no #start-round. [id].astro's isSolo branch mounts the module on
  // load, so navigation IS the start. Wipe from the real origin, then reload — a wipe on about:blank
  // clears nothing (docs/agents/browser-verification.md trap 4).
  await session.nav(`${base}${path}`);
  await session.setWidth(width, 900);
  await session.wipe();
  await session.nav(`${base}${path}`);
  await ev(session, INSTALL_PDLOG);
}

async function readSiamsiState(session) {
  return ev(
    session,
    `
    return { hasStart: !!document.getElementById('ss-start'), hasDraw: !!document.getElementById('ss-draw'),
             hasAgain: !!document.getElementById('ss-again') };
  `,
  );
}

// idle(#ss-start) -> turn(#ss-draw) -> drawn(#ss-again) -> idle. The gate under test is the one on the
// turn screen: tapping #ss-start swaps #stage under the finger and puts #ss-draw where it just was.
async function runSiamsiScenario(session, base) {
  const result = { label: 'ss-draw gate (idle -> turn swap under the finger)', gapTests: [], scenarioError: null };
  try {
    await seedSolo(session, base, '/game/siamsi/', 320);

    // Dry run: learn each control's rect, then come back to idle for real so the loop starts there.
    const startRect0 = await getRect(session, '#ss-start');
    if (!startRect0) throw new Error('siamsi: #ss-start not found on the idle screen');
    await session.tap(startRect0.cx, startRect0.cy);
    const drawRect = await getRect(session, '#ss-draw');
    if (!drawRect) throw new Error('siamsi: #ss-draw not found on the turn screen');
    await session.tap(drawRect.cx, drawRect.cy);
    const againRect0 = await getRect(session, '#ss-again');
    if (!againRect0) throw new Error('siamsi: #ss-again not found on the drawn screen');
    await session.tap(againRect0.cx, againRect0.cy); // back to idle, for real

    for (const gapMs of [100, 500]) {
      await sleep(500);
      const c1 = await getRect(session, '#ss-start');
      if (!c1) throw new Error('siamsi: expected the idle screen before the gap test');
      await ghostDoubleTap(session, c1.cx, c1.cy, drawRect.cx, drawRect.cy, gapMs);
      const after = await readSiamsiState(session);
      const suppressed = after.hasDraw === true && after.hasAgain === false;
      const registered = after.hasAgain === true && after.hasDraw === false;
      const verdict = gapMs < ARM_DELAY_MS ? (suppressed ? 'PASS' : 'FAIL') : registered ? 'PASS' : 'FAIL';
      result.gapTests.push({
        control: 'ss-draw',
        gapMs,
        after,
        verdict,
        note:
          gapMs < ARM_DELAY_MS
            ? 'ghost tap on ss-draw must not fire — still on the turn screen'
            : 'deliberate post-window tap on ss-draw must fire — on the drawn screen with ss-again',
      });
      // Return to idle for the next iteration, from whichever screen this landed on.
      if (!after.hasStart) {
        if (!after.hasAgain) {
          const dr = await getRect(session, '#ss-draw');
          if (dr) await session.tap(dr.cx, dr.cy);
        }
        const ag = await getRect(session, '#ss-again');
        if (ag) await session.tap(ag.cx, ag.cy);
      }
    }
  } catch (e) {
    result.scenarioError = String((e && e.stack) || e);
  }
  return result;
}

// ---- run --------------------------------------------------------------------------------------

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';

  const shortStick = [];
  for (const scenario of SHORT_STICK_SCENARIOS) shortStick.push(await runShortStickScenario(session, base, scenario));

  const timebomb = [];
  for (const scenario of TIMEBOMB_SCENARIOS) timebomb.push(await runTimebombScenario(session, base, scenario));

  const siamsi = [await runSiamsiScenario(session, base)];

  const allGapTests = [
    ...shortStick.flatMap((s) => s.gapTests.map((g) => ({ game: 'short-stick', scenario: s.label, ...g }))),
    ...timebomb.flatMap((s) => s.gapTests.map((g) => ({ game: 'timebomb', scenario: s.label, ...g }))),
    ...siamsi.flatMap((s) => s.gapTests.map((g) => ({ game: 'siamsi', scenario: s.label, ...g }))),
  ];
  const scenarioErrors = [...shortStick, ...timebomb, ...siamsi].filter((s) => s.scenarioError);
  const failing = allGapTests.filter((g) => g.verdict !== 'PASS');
  // The suppression legs are the ones whose PASS condition is "nothing happened", so they are the ones
  // BREAK_GUARD has to be able to turn red. Counted, not averaged with the >=400ms legs, which stay
  // green under the control by design.
  const suppressionLegs = allGapTests.filter((g) => g.gapMs < ARM_DELAY_MS);

  // The open question: does a real touch on a `disabled` control dispatch a pointerdown that bubbles
  // to #stage? Answered from the captured log, never inferred — an empty log FAILS this reading
  // rather than silently reporting a made-up answer.
  const pdEvidence = [
    ...shortStick.map((s) => ({ game: 'short-stick', scenario: s.label, log: s.pointerdownOnDisabled })),
    ...timebomb.map((s) => ({ game: 'timebomb', scenario: s.label, log: s.pointerdownOnDisabled })),
  ].filter((e) => e.log && e.log.length);
  const disabledEntry = pdEvidence.flatMap((e) => e.log.map((l) => ({ ...l, game: e.game, scenario: e.scenario }))).find((l) => l.disabled === true);
  const pointerdownOnDisabled = {
    answer:
      pdEvidence.length === 0
        ? 'UNMEASURABLE — no pointerdown log entries captured'
        : disabledEntry
          ? 'YES — a real touch on a disabled control DOES dispatch a pointerdown that bubbles to #stage'
          : 'NO — no pointerdown from a disabled-target contact reached #stage in the captured log',
    evidence: pdEvidence,
  };

  return {
    summary: {
      breakGuard: !!process.env.BREAK_GUARD,
      gamesCovered: ['short-stick', 'timebomb', 'siamsi'],
      gamesNotCovered: NOT_COVERED,
      // gh#154 / ADR-0019 — emitted so the loss is READ, not only commented. The `pl-pick exception`
      // leg (a freshly rendered button deliberately left ungated by owner decision, proven still
      // tappable at t0) had exactly one subject on the site, and that page is deleted. Nothing here
      // measures it now, and no surviving page can: siamsi gates all three of its screens, and every
      // game registered since ADR-0040 renders no button in #stage at all. This string must not be
      // removed until a page with an ungated in-#stage button exists and a leg is pointed at it.
      ungatedExceptionLeg: 'NOT MEASURED — gh#154 deleted the only page carrying the shape (a control rendered by a preceding gated control\'s tap and deliberately left live at t0). The leg is gone, not passing. Three ungated in-#stage buttons DO still ship (short-stick renderPassing, timebomb renderTicking/renderBoom); repointing at one of them is an open question, not done.',
      totalGapTests: allGapTests.length,
      suppressionLegs: suppressionLegs.length,
      // Under BREAK_GUARD every one of these must be FAIL; under a clean run, none of them.
      suppressionLegsRed: suppressionLegs.filter((g) => g.verdict !== 'PASS').length,
      failing: failing.map((g) => `${g.game}/${g.scenario}/${g.gapMs}ms`),
      scenarioErrors: scenarioErrors.map((s) => `${s.label}: ${s.scenarioError}`),
      overall: failing.length === 0 && scenarioErrors.length === 0 ? 'PASS' : 'FAIL',
    },
    pointerdownOnDisabled,
    shortStick,
    timebomb,
    siamsi,
    consoleErrors: session.consoleErrors,
  };
}
