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

const ARM_DELAY_MS = 400; // mirrors src/games/_arm-gate.ts

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
    const sticks = [...stage.querySelectorAll('div > button')];
    const paras = [...stage.querySelectorAll('p')].map((p) => p.textContent.trim());
    let screen, player, next, stickCount;
    if (hasAgain) {
      screen = 'result';
      const m = paras[1] ? paras[1].match(/^(.*) โดน$/) : null;
      player = m ? m[1] : null;
    } else if (hasPass) {
      screen = 'passing';
      const m = paras[1] ? paras[1].match(/^(.*) รอดไปได้ ส่งมือถือให้ (.*) ต่อเลย$/) : null;
      player = m ? m[1] : null;
      next = m ? m[2] : null;
    } else {
      screen = 'draw';
      const m0 = paras[0] ? paras[0].match(/^ตาของ (.*)$/) : null;
      const m1 = paras[1] ? paras[1].match(/เหลือ (\\d+) อัน$/) : null;
      player = m0 ? m0[1] : null;
      stickCount = m1 ? Number(m1[1]) : sticks.length;
    }
    return { screen, player, next, stickCount, stickButtons: sticks.length, paragraphs: paras };
  `,
  );
}

async function tapFirstStickDeliberately(session) {
  await sleep(500); // clear any pending arm window — this advance is setup, not the measured tap
  const rect = await ev(
    session,
    `
    const b = document.querySelector('#stage div > button');
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
    const btns = [...document.querySelectorAll('#stage div > button')];
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
      if (!setup.ok) {
        result.gapTests.push({ gapMs, verdict: 'FAIL', note: 'could not reach a passing screen — unmeasurable' });
        continue;
      }

      const expectedNext = setup.state.next;
      const passRect = await getRect(session, '#ss-pass');
      if (!passRect) {
        result.gapTests.push({ gapMs, verdict: 'FAIL', note: '#ss-pass not found — unmeasurable' });
        continue;
      }
      await ghostDoubleTap(session, passRect.cx, passRect.cy, contact2.contact2.x, contact2.contact2.y, gapMs);
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
        verdict = registered ? 'PASS' : 'FAIL';
        note = registered
          ? 'deliberate post-window tap registered — exactly one turn advanced'
          : `did not register as expected — screen=${after.screen} player=${after.player}`;
      }
      result.gapTests.push({
        gapMs,
        expectedNext,
        contact1: { x: Math.round(passRect.cx), y: Math.round(passRect.cy) },
        contact2: contact2.contact2,
        after,
        verdict,
        note,
      });

      if (gapMs < ARM_DELAY_MS && !result.pointerdownOnDisabled) {
        result.pointerdownOnDisabled = await ev(session, `return (document.getElementById('stage').__pdLog || []).slice(-5);`);
      }

      setup = await reachShortStickPassing(session, base, roster, width); // handles all 3 outcome screens
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
    return { hasStart: !!document.getElementById('tb-start'),
             hasPulse: !!document.getElementById('tb-pulse'),
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
    // Patch Date.now so the 15-45s real fuse can be fast-forwarded in this probe without waiting it
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
  const suppressedOk = after.hasStart === true && after.hasPulse === false && after.hasPass === false;
  const registeredOk = after.hasStart === false && after.hasPulse === true && after.hasPass === true;
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
      if (s2.hasPulse) {
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

// ---- run --------------------------------------------------------------------------------------

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';

  const shortStick = [];
  for (const scenario of SHORT_STICK_SCENARIOS) shortStick.push(await runShortStickScenario(session, base, scenario));

  const timebomb = [];
  for (const scenario of TIMEBOMB_SCENARIOS) timebomb.push(await runTimebombScenario(session, base, scenario));

  const allGapTests = [
    ...shortStick.flatMap((s) => s.gapTests.map((g) => ({ game: 'short-stick', scenario: s.label, ...g }))),
    ...timebomb.flatMap((s) => s.gapTests.map((g) => ({ game: 'timebomb', scenario: s.label, ...g }))),
  ];
  const scenarioErrors = [...shortStick, ...timebomb].filter((s) => s.scenarioError);
  const failing = allGapTests.filter((g) => g.verdict !== 'PASS');

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
      totalGapTests: allGapTests.length,
      failing: failing.map((g) => `${g.game}/${g.scenario}/${g.gapMs}ms`),
      scenarioErrors: scenarioErrors.map((s) => `${s.label}: ${s.scenarioError}`),
      overall: failing.length === 0 && scenarioErrors.length === 0 ? 'PASS' : 'FAIL',
    },
    pointerdownOnDisabled,
    shortStick,
    timebomb,
    consoleErrors: session.consoleErrors,
  };
}
