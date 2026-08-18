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

// ---- #42: daily-fortune, love-match, pick-loser, siamsi -----------------------------------------
// Same real-touch method as short-stick/timebomb above, simplified where the geometry allows it: every
// control here is a single full-width button (no stick/card bundle to grid-scan), so getRect's own
// centre point IS the real, current position of the real button — `disabled` blocks a click uniformly
// across the whole element, so there is no separate collision-geometry question to answer here the way
// there was for short-stick's stick bundle (#39). A short untimed dry run still learns each control's
// rect before the timed gap test, exactly as above, because the target does not exist until the prior
// screen's tap creates it.

const DF_NAMES = ['ทดสอบเอ', 'ทดสอบบี'];

async function rosterTick(session) {
  await ev(
    session,
    `
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click(); return true;`,
  );
  await sleep(900);
}

async function seedRoster(session, base, path, roster, width) {
  await session.nav(`${base}${path}`);
  await session.setWidth(width, 900);
  await session.wipe();
  await ev(session, `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(roster))}); return true;`);
  await session.nav(`${base}${path}`);
  await ev(session, INSTALL_PDLOG);
}

async function chipRect(session, name) {
  return ev(
    session,
    `
    const btns = [...document.querySelectorAll('#stage div > button')];
    const b = btns.find((x) => x.textContent === ${JSON.stringify(name)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
  `,
  );
}

// ---- daily-fortune ------------------------------------------------------------------------------

async function readDFState(session) {
  return ev(
    session,
    `
    const paras = [...document.querySelectorAll('#stage p')].map((p) => p.textContent.trim());
    const hasGo = !!document.getElementById('df-go');
    const hasAgain = !!document.getElementById('df-again');
    const hasHint = paras.includes('ใส่ชื่อก่อนนะ ถึงจะดูดวงวันนี้ได้');
    const nameLine = paras.find((p) => p.startsWith('ดวงวันนี้ของ '));
    return {
      screen: hasAgain ? 'result' : hasGo ? 'ask' : 'unknown',
      hasHint,
      name: nameLine ? nameLine.slice('ดวงวันนี้ของ '.length) : null,
    };
  `,
  );
}

async function runDailyFortuneScenario(session, base) {
  const result = { label: 'df-go/df-again gate + chip exception', gapTests: [], chipException: null, scenarioError: null };
  try {
    await seedRoster(session, base, '/game/daily-fortune/', DF_NAMES, 320);
    await rosterTick(session); // -> ask screen (mount)

    const chip0 = await chipRect(session, DF_NAMES[0]);
    if (!chip0) throw new Error('daily-fortune: roster chip not found on ask screen');
    await session.tap(chip0.cx, chip0.cy); // dry run: reach result screen for real, learns df-again's rect
    const againRect = await getRect(session, '#df-again');
    if (!againRect) throw new Error('daily-fortune: #df-again not found');

    // ---- chip exception: a real second contact 60ms after df-again's own tap (which (re)creates the
    // ask screen) must still reveal — chips are exempt from the gate. `session.tap()` always sleeps
    // ~400ms internally before its own promise resolves (driver.mjs), so wrapping Date.now() around an
    // awaited tap can never read under 400ms regardless of the real behaviour — that measurement would
    // always report FAIL and prove nothing (browser-verification.md trap #2: calibrate the detector).
    // This reuses ghostDoubleTap's un-awaited-dispatch trick instead, for a genuine, controlled 60ms
    // gap between two real touches — contact1 = #df-again (real, causes the ask screen to (re)appear),
    // contact2 = the roster chip (real, must register despite the short gap). ----
    await ghostDoubleTap(session, againRect.cx, againRect.cy, chip0.cx, chip0.cy, 60);
    const exceptionState = await readDFState(session);
    result.chipException = {
      gapMs: 60,
      after: exceptionState,
      verdict: exceptionState.screen === 'result' && exceptionState.name === DF_NAMES[0] ? 'PASS' : 'FAIL',
      note: 'roster chip is exempt from the gate — a real touch 60ms after the ask screen is (re)created must still reveal',
    };

    // ---- df-go's gate (created by tapping df-again) ----
    // The exception test above may have left the page on either screen depending on its own outcome
    // (result if the chip correctly registered, ask if it was wrongly suppressed) — normalize to
    // result before continuing, rather than assuming which branch it took.
    await sleep(500);
    const preGoState = await readDFState(session);
    if (preGoState.screen !== 'result') {
      const chipB = await chipRect(session, DF_NAMES[0]);
      if (!chipB) throw new Error('daily-fortune: expected a chip to reach the result screen');
      await session.tap(chipB.cx, chipB.cy);
      await sleep(500);
    }
    const againRect2 = await getRect(session, '#df-again');
    if (!againRect2) throw new Error('daily-fortune: #df-again not found before learning df-go\'s rect');
    await session.tap(againRect2.cx, againRect2.cy); // dry run: reach ask screen for real
    const goRect = await getRect(session, '#df-go');
    if (!goRect) throw new Error('daily-fortune: #df-go not found');

    for (const gapMs of [100, 500]) {
      // df-again: contact1 = chip tap (reveals result screen, arms df-again's gate)
      await sleep(500);
      const c1 = await chipRect(session, DF_NAMES[0]);
      await ghostDoubleTap(session, c1.cx, c1.cy, againRect.cx, againRect.cy, gapMs);
      const afterAgain = await readDFState(session);
      const suppressedAgain = afterAgain.screen === 'result' && afterAgain.name === DF_NAMES[0];
      const registeredAgain = afterAgain.screen === 'ask';
      const verdictAgain = gapMs < ARM_DELAY_MS ? (suppressedAgain ? 'PASS' : 'FAIL') : registeredAgain ? 'PASS' : 'FAIL';
      result.gapTests.push({
        control: 'df-again',
        gapMs,
        after: afterAgain,
        verdict: verdictAgain,
        note: gapMs < ARM_DELAY_MS ? 'ghost tap on df-again must not fire — same name, same result screen' : 'deliberate post-window tap on df-again must fire — back on ask screen',
      });
      if (afterAgain.screen === 'result') await session.tap(againRect.cx, againRect.cy); // normalize to ask before the df-go block

      // df-go: contact1 = df-again tap (reveals ask screen, arms df-go's gate) — so this block must
      // start from the RESULT screen, not the ask screen the df-again block above just normalized to.
      // Empty input on the fresh ask screen makes a fired click observable without DOM injection:
      // reveal('') shows the hint paragraph, a real and unambiguous state change distinct from
      // "nothing happened".
      await sleep(500);
      const chipD = await chipRect(session, DF_NAMES[0]);
      await session.tap(chipD.cx, chipD.cy); // deliberate, real — reach the result screen
      await sleep(500);
      const c1b = await getRect(session, '#df-again');
      if (!c1b) throw new Error('daily-fortune: expected to be on the result screen before the df-go gap test');
      await ghostDoubleTap(session, c1b.cx, c1b.cy, goRect.cx, goRect.cy, gapMs);
      const afterGo = await readDFState(session);
      const suppressedGo = afterGo.screen === 'ask' && afterGo.hasHint === false;
      const registeredGo = afterGo.screen === 'ask' && afterGo.hasHint === true;
      const verdictGo = gapMs < ARM_DELAY_MS ? (suppressedGo ? 'PASS' : 'FAIL') : registeredGo ? 'PASS' : 'FAIL';
      result.gapTests.push({
        control: 'df-go',
        gapMs,
        after: afterGo,
        verdict: verdictGo,
        note: gapMs < ARM_DELAY_MS ? 'ghost tap on df-go must not fire — no hint paragraph appears' : 'deliberate post-window tap on df-go must fire — hint paragraph appears (empty input)',
      });
      // afterGo.screen is always 'ask' (reveal('') can never reach 'result') — already positioned for
      // the next iteration's df-again block, no extra reset tap needed.
    }
  } catch (e) {
    result.scenarioError = String((e && e.stack) || e);
  }
  return result;
}

// ---- love-match -----------------------------------------------------------------------------------

const LM_NAMES = ['ทดสอบเอ', 'ทดสอบบี', 'ทดสอบซี'];

async function readLMState(session) {
  return ev(
    session,
    `
    const stage = document.getElementById('stage');
    const hasAgain = !!document.getElementById('lm-again');
    const header = document.querySelector('#stage p')?.textContent.trim() ?? null;
    const resetBtn = document.getElementById('lm-reset');
    const chips = [...stage.querySelectorAll('div > button')];
    return {
      screen: hasAgain ? 'result' : 'pick',
      header,
      resetDisabled: resetBtn ? resetBtn.disabled : null,
      resetHidden: resetBtn ? resetBtn.hidden : null,
      anyChipPicked: chips.some((c) => c.disabled),
      pairLine: hasAgain ? ([...document.querySelectorAll('#stage p')][1]?.textContent.trim() ?? null) : null,
    };
  `,
  );
}

async function runLoveMatchScenario(session, base) {
  const result = { label: 'lm chips/lm-reset/lm-again gate', gapTests: [], lmResetStructural: null, scenarioError: null };
  try {
    await seedRoster(session, base, '/game/love-match/', LM_NAMES, 320);

    // ---- lm-reset: structural proof it is part of the same gated set as the chips (it cannot be
    // tapped while hidden, so there is no real-touch collision scenario to construct for it — see the
    // brief's calibration note; the invariant that matters is that armAllButtons found and disabled it).
    // Reads `.disabled` ~150ms after mount — inside the 400ms window on purpose: rosterTick()'s usual
    // 900ms settle would run past arm() re-enabling everything, and read a false negative here. ----
    await ev(
      session,
      `
      const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
      for (const b of boxes) if (!b.checked) b.click();
      document.getElementById('start-round').click(); return true;`,
    );
    await sleep(150);
    const resetAtMount = await ev(session, `const b = document.getElementById('lm-reset'); return b ? { disabled: b.disabled, hidden: b.hidden } : null;`);
    result.lmResetStructural = {
      atMount: resetAtMount,
      verdict: resetAtMount && resetAtMount.disabled === true ? 'PASS' : 'FAIL',
      note: 'lm-reset must be disabled at the same mount that gates the chips, even though it is hidden until a pick',
    };
    // Functional half: once armed and revealed, lm-reset must actually work.
    await sleep(500); // let the round settle fully (mirrors rosterTick()'s usual wait) before continuing
    const chipFirst = await chipRect(session, LM_NAMES[0]);
    await session.tap(chipFirst.cx, chipFirst.cy); // real pick, well past the window
    await ev(session, `document.getElementById('lm-reset').click(); return true;`); // functional check only — not a gate probe
    const afterReset = await readLMState(session);
    result.lmResetStructural.functionalAfterArm = afterReset;
    result.lmResetStructural.functionalVerdict = afterReset.screen === 'pick' && afterReset.anyChipPicked === false ? 'PASS' : 'FAIL';

    // ---- chips' gate: contact1 = lm-again tap (reveals a fresh pick screen), contact2 = ghost tap on
    // the nearest chip. This is also the real hazard the gate exists for (#42): the swap that creates
    // the chips is itself a tap. ----
    // Reach a result screen for real first. A fresh nav lands back on PlayerSetup's roster panel, not
    // straight into the game — rosterTick() re-ticks and re-taps start-round to mount it again.
    await session.nav(`${base}/game/love-match/`); // fresh mount, clears any residual pick state
    await ev(session, INSTALL_PDLOG);
    await rosterTick(session);
    const chipA = await chipRect(session, LM_NAMES[0]);
    await session.tap(chipA.cx, chipA.cy);
    const chipB = await chipRect(session, LM_NAMES[1]);
    await session.tap(chipB.cx, chipB.cy); // now on result screen (lm-again gated)
    const againRect = await getRect(session, '#lm-again');
    if (!againRect) throw new Error('love-match: #lm-again not found');
    await session.tap(againRect.cx, againRect.cy); // dry run: reach a fresh pick screen for real
    const chipRectFresh = await chipRect(session, LM_NAMES[0]);
    if (!chipRectFresh) throw new Error('love-match: chip not found on fresh pick screen');
    // Return to a result screen for real — every iteration below starts there, since the chips-gate
    // block's contact1 is a tap on #lm-again, which only exists on the result screen.
    await sleep(500);
    const backA0 = await chipRect(session, LM_NAMES[0]);
    await session.tap(backA0.cx, backA0.cy);
    const backB0 = await chipRect(session, LM_NAMES[1]);
    await session.tap(backB0.cx, backB0.cy); // now on a result screen again

    for (const gapMs of [100, 500]) {
      // chips gate
      await sleep(500);
      const c1 = await getRect(session, '#lm-again');
      if (!c1) throw new Error('love-match: expected result screen before the chip gap test');
      await ghostDoubleTap(session, c1.cx, c1.cy, chipRectFresh.cx, chipRectFresh.cy, gapMs);
      const afterChip = await readLMState(session);
      const suppressedChip = afterChip.screen === 'pick' && afterChip.anyChipPicked === false;
      const registeredChip = afterChip.screen === 'pick' && afterChip.anyChipPicked === true;
      const verdictChip = gapMs < ARM_DELAY_MS ? (suppressedChip ? 'PASS' : 'FAIL') : registeredChip ? 'PASS' : 'FAIL';
      result.gapTests.push({
        control: 'lm-chip',
        gapMs,
        after: afterChip,
        verdict: verdictChip,
        note: gapMs < ARM_DELAY_MS ? 'ghost tap on a chip must not pick — no chip disabled yet' : 'deliberate post-window tap must pick — a chip is disabled',
      });
      // Reset to a fresh pick screen (or complete the pick then bounce back) for the next iteration.
      if (afterChip.anyChipPicked) {
        const chipNext = await chipRect(session, LM_NAMES[1]);
        await session.tap(chipNext.cx, chipNext.cy); // completes the pick -> result screen
        await sleep(500);
        const ag = await getRect(session, '#lm-again');
        await session.tap(ag.cx, ag.cy); // back to a fresh pick screen
      }

      // lm-again gate: contact1 = second chip tap (reveals result screen)
      await sleep(500);
      const p1 = await chipRect(session, LM_NAMES[0]);
      await session.tap(p1.cx, p1.cy); // deliberate first pick, unmeasured
      const p2 = await chipRect(session, LM_NAMES[1]);
      await ghostDoubleTap(session, p2.cx, p2.cy, againRect.cx, againRect.cy, gapMs);
      const afterAgain = await readLMState(session);
      const suppressedAgain = afterAgain.screen === 'result';
      const registeredAgain = afterAgain.screen === 'pick' && afterAgain.anyChipPicked === false;
      const verdictAgain = gapMs < ARM_DELAY_MS ? (suppressedAgain ? 'PASS' : 'FAIL') : registeredAgain ? 'PASS' : 'FAIL';
      result.gapTests.push({
        control: 'lm-again',
        gapMs,
        after: afterAgain,
        verdict: verdictAgain,
        note: gapMs < ARM_DELAY_MS ? 'ghost tap on lm-again must not fire — still on the result screen' : 'deliberate post-window tap on lm-again must fire — fresh pick screen',
      });
      // Normalize to a result screen for the next iteration's chips-gate block, which needs #lm-again.
      if (afterAgain.screen === 'pick') {
        const backA = await chipRect(session, LM_NAMES[0]);
        await session.tap(backA.cx, backA.cy);
        const backB = await chipRect(session, LM_NAMES[1]);
        await session.tap(backB.cx, backB.cy); // -> result screen
      }
    }
  } catch (e) {
    result.scenarioError = String((e && e.stack) || e);
  }
  return result;
}

// ---- pick-loser -----------------------------------------------------------------------------------

const PL_NAMES = ['ทดสอบเอ', 'ทดสอบบี'];

async function readPLState(session) {
  return ev(
    session,
    `
    return { hasPick: !!document.getElementById('pl-pick'), hasAgain: !!document.getElementById('pl-again') };
  `,
  );
}

async function runPickLoserScenario(session, base) {
  const result = { label: 'pl-again gate + pl-pick exception', gapTests: [], pickException: null, scenarioError: null };
  try {
    await seedRoster(session, base, '/game/pick-loser/', PL_NAMES, 320);
    await rosterTick(session);

    // Dry run: learn pl-again's rect, then return to idle for real so the loop below can start there.
    const pickRect0 = await getRect(session, '#pl-pick');
    if (!pickRect0) throw new Error('pick-loser: #pl-pick not found on idle screen');
    await session.tap(pickRect0.cx, pickRect0.cy);
    const againRect = await getRect(session, '#pl-again');
    if (!againRect) throw new Error('pick-loser: #pl-again not found');
    await session.tap(againRect.cx, againRect.cy); // back to idle, for real

    for (const gapMs of [100, 500]) {
      await sleep(500);
      const c1 = await getRect(session, '#pl-pick');
      if (!c1) throw new Error('pick-loser: expected idle screen before the gap test');
      await ghostDoubleTap(session, c1.cx, c1.cy, againRect.cx, againRect.cy, gapMs);
      const after = await readPLState(session);
      const suppressed = after.hasAgain === true && after.hasPick === false;
      const registered = after.hasPick === true && after.hasAgain === false;
      const verdict = gapMs < ARM_DELAY_MS ? (suppressed ? 'PASS' : 'FAIL') : registered ? 'PASS' : 'FAIL';
      result.gapTests.push({
        control: 'pl-again',
        gapMs,
        after,
        verdict,
        note: gapMs < ARM_DELAY_MS ? 'ghost tap on pl-again must not fire — still on the result screen' : 'deliberate post-window tap on pl-again must fire — back on idle with pl-pick',
      });
      if (!after.hasPick) {
        // still on result — reset to idle for the next iteration
        const ag = await getRect(session, '#pl-again');
        if (ag) await session.tap(ag.cx, ag.cy);
      }
    }

    // ---- pl-pick exception: a real second contact 60ms after pl-again's own tap (the swap that
    // remounts the idle screen and creates a fresh pl-pick) must still register. `session.tap()`
    // always sleeps ~400ms internally before its own promise resolves (driver.mjs), so wrapping
    // Date.now() around an awaited tap can never read under 400ms regardless of the real behaviour —
    // this reuses ghostDoubleTap's un-awaited-dispatch trick for a genuine, controlled 60ms gap
    // between two real touches instead (browser-verification.md trap #2: calibrate the detector). ----
    await sleep(500);
    let preExceptionState = await readPLState(session);
    if (!preExceptionState.hasAgain) {
      // The loop above may have ended on idle (its last iteration registered normally) — reach the
      // result screen for real before the exception test needs it.
      const p = await getRect(session, '#pl-pick');
      if (!p) throw new Error('pick-loser: neither pl-again nor pl-pick found before the exception test');
      await session.tap(p.cx, p.cy);
      await sleep(500);
      preExceptionState = await readPLState(session);
    }
    if (!preExceptionState.hasAgain) throw new Error('pick-loser: expected the result screen before the pl-pick exception test');
    const ag2 = await getRect(session, '#pl-again');
    if (!ag2) throw new Error('pick-loser: #pl-again not found before the pl-pick exception test');
    // The idle screen's pl-pick sits at the same place every time (deterministic layout) — reuse pickRect0.
    await ghostDoubleTap(session, ag2.cx, ag2.cy, pickRect0.cx, pickRect0.cy, 60);
    const s = await readPLState(session);
    result.pickException = {
      gapMs: 60,
      after: s,
      verdict: s.hasAgain === true && s.hasPick === false ? 'PASS' : 'FAIL',
      note: 'pl-pick is exempt from the gate — a real touch 60ms after pl-again must still register a pick, landing on the result screen',
    };
  } catch (e) {
    result.scenarioError = String((e && e.stack) || e);
  }
  return result;
}

// ---- siamsi ---------------------------------------------------------------------------------------

async function readSiamsiState(session) {
  return ev(
    session,
    `
    return {
      hasStart: !!document.getElementById('ss-start'),
      hasDraw: !!document.getElementById('ss-draw'),
      hasPass: !!document.getElementById('ss-pass'),
      hasAgain: !!document.getElementById('ss-again'),
    };
  `,
  );
}

// Full reset to a fresh idle screen (#ss-start), every time — nav + roster tick + a deck-seed reset.
// buildDeck() shuffles with Math.random(), and the drawn card's own text length (not just the roster)
// shifts #ss-pass's Y position — a rect learned on one round's random deck can miss entirely on the
// next round's. Patched to a fixed LCG (same technique as timebomb's Date.now patch above) so every
// fresh round in this probe draws the identical deck, in the identical order, every time.
// Unlike every other scenario, this one deliberately does NOT call seedRoster(): that helper starts
// with session.wipe(), which would erase the ADR-0010 checkpoint this scenario exists to exercise.
// The roster is inherited from the scenario that ran before it, so the hops below assume that round's
// player count. The dependency on ordering is real but it fails LOUDLY — the selector guards further
// down throw when a screen never advanced, so a reordered suite goes red rather than green-and-wrong.
// A dead SIAMSI_NAMES fixture used to sit above this, implying a seed that never happened (gh#38).
async function freshSiamsiIdle(session, base) {
  await session.nav(`${base}/game/siamsi/`);
  await session.setWidth(320, 900);
  await ev(session, INSTALL_PDLOG);
  await ev(
    session,
    `
    window.__siamsiSeed = 42;
    if (!window.__origRandom) {
      window.__origRandom = Math.random;
      Math.random = () => { window.__siamsiSeed = (window.__siamsiSeed * 1103515245 + 12345) & 0x7fffffff; return (window.__siamsiSeed % 10000) / 10000; };
    }
    return true;`,
  );
  // rosterTick() alone is not enough here: siamsi is the sole checkpoint writer (ADR-0010), so a
  // fresh nav right after a previous hop left a mid-round checkpoint makes "Start round" open the
  // resume-choice prompt instead of mounting — #ss-start never appears. Take the "start fresh" branch
  // every time so every hop genuinely starts from a clean idle screen, not a resumed one.
  await rosterTick(session);
  const resumeOpen = await ev(session, `const el = document.getElementById('resume-choice'); return !!el && !el.hidden;`);
  if (resumeOpen) {
    await ev(session, `document.getElementById('fresh-round').click(); return true;`);
    await sleep(900);
  }
}

// One hop = "control `effectSelector`, freshly created by tapping `causeSelector`, must not activate
// under 400ms and must activate normally at/after it." `walkSteps` are the real, deliberate taps (in
// order, from a fresh idle screen) needed to reach the screen holding `causeSelector` untapped — each
// hop starts completely fresh (browser-verification.md trap #3/#4-adjacent: a chained walk that reuses
// a stale rect from an already-consumed control silently mis-taps once the round has moved on, which
// is exactly what happened here on the first attempt at this scenario).
async function siamsiHopSubtest(session, base, walkSteps, causeSelector, effectSelector, effectFlag, label) {
  const gapTests = [];
  // Learn effectSelector's rect via one untimed, fully deliberate dry run.
  await freshSiamsiIdle(session, base);
  for (const sel of walkSteps) {
    const r = await getRect(session, sel);
    if (!r) throw new Error(`siamsi ${label}: ${sel} not found while walking (learn pass)`);
    await session.tap(r.cx, r.cy);
  }
  const causeRectLearn = await getRect(session, causeSelector);
  if (!causeRectLearn) throw new Error(`siamsi ${label}: ${causeSelector} not found (learn pass)`);
  await session.tap(causeRectLearn.cx, causeRectLearn.cy);
  const effectRect = await getRect(session, effectSelector);
  if (!effectRect) throw new Error(`siamsi ${label}: ${effectSelector} not found (learn pass)`);

  for (const gapMs of [100, 500]) {
    await freshSiamsiIdle(session, base);
    for (const sel of walkSteps) {
      const r = await getRect(session, sel);
      if (!r) throw new Error(`siamsi ${label}: ${sel} not found while walking (gap=${gapMs})`);
      await session.tap(r.cx, r.cy);
    }
    const causeRect = await getRect(session, causeSelector);
    if (!causeRect) throw new Error(`siamsi ${label}: ${causeSelector} not found (gap=${gapMs})`);
    await ghostDoubleTap(session, causeRect.cx, causeRect.cy, effectRect.cx, effectRect.cy, gapMs);
    const after = await readSiamsiState(session);
    // Screens are mutually exclusive by construction (exactly one of hasStart/hasDraw/hasPass/hasAgain
    // is true at a time) — "still on the screen contact1 just created" is exactly effectFlag === true.
    const stillOnEffectScreen = after[effectFlag] === true;
    const verdict =
      gapMs < ARM_DELAY_MS ? (stillOnEffectScreen ? 'PASS' : 'FAIL') : !stillOnEffectScreen ? 'PASS' : 'FAIL';
    gapTests.push({
      control: label,
      gapMs,
      after,
      verdict,
      note:
        gapMs < ARM_DELAY_MS
          ? 'ghost tap on the freshly-created control must not fire — still on the same screen'
          : 'a real touch at/after the window must fire normally — advanced past that screen',
    });
  }
  return gapTests;
}

async function runSiamsiScenario(session, base) {
  const result = { label: 'ss-start/ss-draw/ss-pass/ss-again gate — one independent trial per hop', gapTests: [], scenarioError: null };
  try {
    // Every hop of one round, in order, each naming the real taps needed to reach it from a fresh idle
    // screen. ss-draw and ss-pass are each tested at both of their occurrences (once per player).
    const hops = [
      { walkSteps: [], cause: '#ss-start', effect: '#ss-draw', effectFlag: 'hasDraw', label: 'ss-draw (turn 1)' },
      { walkSteps: ['#ss-start'], cause: '#ss-draw', effect: '#ss-pass', effectFlag: 'hasPass', label: 'ss-pass (turn 1)' },
      { walkSteps: ['#ss-start', '#ss-draw'], cause: '#ss-pass', effect: '#ss-draw', effectFlag: 'hasDraw', label: 'ss-draw (turn 2)' },
      { walkSteps: ['#ss-start', '#ss-draw', '#ss-pass'], cause: '#ss-draw', effect: '#ss-pass', effectFlag: 'hasPass', label: 'ss-pass (turn 2)' },
      { walkSteps: ['#ss-start', '#ss-draw', '#ss-pass', '#ss-draw'], cause: '#ss-pass', effect: '#ss-again', effectFlag: 'hasAgain', label: 'ss-again' },
      { walkSteps: ['#ss-start', '#ss-draw', '#ss-pass', '#ss-draw', '#ss-pass'], cause: '#ss-again', effect: '#ss-start', effectFlag: 'hasStart', label: 'ss-start' },
    ];
    for (const hop of hops) {
      const gapTests = await siamsiHopSubtest(session, base, hop.walkSteps, hop.cause, hop.effect, hop.effectFlag, hop.label);
      result.gapTests.push(...gapTests);
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

  const dailyFortune = [await runDailyFortuneScenario(session, base)];
  const loveMatch = [await runLoveMatchScenario(session, base)];
  const pickLoser = [await runPickLoserScenario(session, base)];
  const siamsi = [await runSiamsiScenario(session, base)];

  const allGapTests = [
    ...shortStick.flatMap((s) => s.gapTests.map((g) => ({ game: 'short-stick', scenario: s.label, ...g }))),
    ...timebomb.flatMap((s) => s.gapTests.map((g) => ({ game: 'timebomb', scenario: s.label, ...g }))),
    ...dailyFortune.flatMap((s) => s.gapTests.map((g) => ({ game: 'daily-fortune', scenario: s.label, ...g }))),
    ...loveMatch.flatMap((s) => s.gapTests.map((g) => ({ game: 'love-match', scenario: s.label, ...g }))),
    ...pickLoser.flatMap((s) => s.gapTests.map((g) => ({ game: 'pick-loser', scenario: s.label, ...g }))),
    ...siamsi.flatMap((s) => s.gapTests.map((g) => ({ game: 'siamsi', scenario: s.label, ...g }))),
  ];
  const scenarioErrors = [...shortStick, ...timebomb, ...dailyFortune, ...loveMatch, ...pickLoser, ...siamsi].filter((s) => s.scenarioError);
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
    dailyFortune,
    loveMatch,
    pickLoser,
    siamsi,
    consoleErrors: session.consoleErrors,
  };
}
