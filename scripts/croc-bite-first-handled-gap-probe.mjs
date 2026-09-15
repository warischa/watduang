// gh#235: confirms or refutes the deferred-arming account for croc-bite's first *handled* pointer
// gap, from OUTSIDE the shipped engine. `window.__khengApp` is the handle the engine already
// publishes; this file only attaches listeners to it through CDP at runtime. It writes nothing into
// any file under src/play/croc-bite/, and nothing it records feeds any arm-gate decision (ADR-0059
// reads the browser's input stamp, never handler time).
//
// The account: a press during ROUND_INTRO is silently dropped (GameState.pressTooth returns null
// outside PLAYER_TURN), and only the roundReset handler's own 1200ms timer flips the phase and lets a
// later press take effect.
//
// A single "measured gap == 1200 - (contact - roundReset)" check is NOT independent evidence of the
// drop: playerTurnAt is (by construction of the source) roundResetAt + 1200 regardless of what any
// press did, so that subtraction is tautological -- it would read exactly the same whether or not the
// press was ever handled. So this probe checks the two things that formula cannot: (1) the pressed
// tooth's own state and the phase do NOT change as a direct result of the intro-window press -- no
// RESOLVING_* phaseChange appears between the press and PLAYER_TURN -- and (2) the SAME control, hit
// again once PLAYER_TURN has begun, succeeds (a RESOLVING_* phaseChange follows it). Only together do
// these establish "deferred arming", not just "a timer exists".
//
// Usage: node scripts/driver.mjs scripts/croc-bite-first-handled-gap-probe.mjs
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const RUNS = Number(process.env.RUNS || 6);
const URL = `${BASE}/game/croc-bite/play/`;

const ATTACH = `
  const app = window.__khengApp;
  if (!app) return { attached: false };
  window.__gapProbe = { roundResetAt: null, contactAt: null, playerTurnAt: null, phaseLog: [], introContact: null };
  app.state.on('roundReset', () => {
    if (window.__gapProbe.roundResetAt === null) window.__gapProbe.roundResetAt = performance.now();
  });
  app.state.on('phaseChange', (payload) => {
    window.__gapProbe.phaseLog.push({ t: performance.now(), newPhase: payload.newPhase });
    if (payload.newPhase === 'PLAYER_TURN' && window.__gapProbe.playerTurnAt === null) {
      window.__gapProbe.playerTurnAt = performance.now();
    }
  });
  // Capturing phase: runs BEFORE main.ts's own bubble-phase [data-tooth] handler, so the tooth state
  // read here is the state the press walked INTO, not whatever it produced.
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('[data-tooth]');
    if (!btn || window.__gapProbe.contactAt !== null) return;
    const toothId = btn.dataset.tooth;
    const tooth = app.state.teeth.get(toothId);
    window.__gapProbe.contactAt = performance.now();
    window.__gapProbe.introContact = { toothId, phaseAtContact: app.state.phase, stateBefore: tooth ? tooth.state : null };
  }, true);
  return { attached: true };
`;

const CALIBRATE = `
  const c = document.createElement('canvas');
  const app = window.__khengApp;
  return {
    webgl2: !!c.getContext('webgl2'),
    webgl: !!c.getContext('webgl'),
    appPresent: !!app,
    animationFrameId: app ? app.animationFrameId : 'no-app',
    phase: app ? app.state.phase : 'no-app',
  };
`;

const RECT = (selector) => `
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
`;

export default async function (session) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    // roster-bridge.ts auto-drives #btn-start-game at boot once a >=2-name roster is saved -- and the
    // very first run's own start click saves that roster (saveOnSetupComplete), which then persists on
    // disk in this Chrome profile and auto-starts every later run before ANY evaluate can attach a
    // listener (observed here as roundResetAt staying null while the round was already in PLAYER_TURN
    // moments after nav()). Land on the origin, wipe, THEN reload -- a wipe issued from about:blank
    // clears nothing, and reading storage back only proves the wipe once a fresh load has happened.
    await session.nav(URL);
    await session.wipe();
    await session.nav(URL);
    await session.setWidth(390, 844);

    const calib = await session.evaluate(CALIBRATE);
    const noWebgl = calib.value && calib.value.webgl2 === false && calib.value.webgl === false;
    const noContextRoute = calib.value && calib.value.animationFrameId === null;
    const freshSetup = calib.value && calib.value.phase === 'SETUP';
    if (!noWebgl || !noContextRoute) {
      runs.push({ run: i, void: true, reason: 'lane has a WebGL context or engine took the 3D path', calib: calib.value });
      continue;
    }
    if (!freshSetup) {
      runs.push({ run: i, void: true, reason: 'roster-bridge auto-started the round before this run pressed anything', calib: calib.value });
      continue;
    }

    const attach = await session.evaluate(ATTACH);
    if (!attach.value || !attach.value.attached) {
      runs.push({ run: i, void: true, reason: 'window.__khengApp not reachable', attach: attach.value ?? attach.error });
      continue;
    }

    const startPt = await session.evaluate(RECT('#btn-start-game'));
    if (!startPt.value) { runs.push({ run: i, void: true, reason: 'no #btn-start-game' }); continue; }
    await session.tap(startPt.value.x, startPt.value.y);

    const toothPt = await session.evaluate(RECT('[data-tooth]'));
    if (!toothPt.value) { runs.push({ run: i, void: true, reason: 'no [data-tooth] board after start' }); continue; }
    await session.tap(toothPt.value.x, toothPt.value.y);

    const introAfter = await session.evaluate(`
      const app = window.__khengApp;
      const c = window.__gapProbe.introContact;
      const tooth = c ? app.state.teeth.get(c.toothId) : null;
      return { phaseImmediatelyAfter: app.state.phase, stateImmediatelyAfter: tooth ? tooth.state : null };
    `);

    // Recorded max was 1976.1ms after roundReset; wait comfortably past it so a late PLAYER_TURN is
    // still captured before reading back.
    await new Promise((r) => setTimeout(r, 2500));

    const midProbe = await session.evaluate('return window.__gapProbe;');

    // Second contact, once PLAYER_TURN has begun: if the control was only ever UNARMED (not broken),
    // the SAME kind of press on the SAME board now succeeds.
    const postArmPt = await session.evaluate(RECT('[data-tooth]:not(:disabled)'));
    if (postArmPt.value) {
      await session.tap(postArmPt.value.x, postArmPt.value.y);
      await new Promise((r) => setTimeout(r, 300));
    }

    const finalProbe = await session.evaluate('return window.__gapProbe;');
    const p = finalProbe.value ?? midProbe.value;
    const roundResetAt = p?.roundResetAt ?? null;
    const contactAt = p?.contactAt ?? null;
    const playerTurnAt = p?.playerTurnAt ?? null;
    const phaseLog = p?.phaseLog ?? [];

    const contactOffset = contactAt !== null && roundResetAt !== null ? contactAt - roundResetAt : null;
    const contactLandedInIntro = p?.introContact?.phaseAtContact === 'ROUND_INTRO';
    // The falsifiable drop check: nothing resolved between the intro press and PLAYER_TURN beginning.
    const resolvingBetweenContactAndArm = playerTurnAt !== null
      ? phaseLog.some((e) => e.t > (contactAt ?? -Infinity) && e.t < playerTurnAt && e.newPhase.startsWith('RESOLVING'))
      : null;
    const introPressWasDropped = contactLandedInIntro
      && p?.introContact?.stateBefore === 'unresolved'
      && introAfter.value?.stateImmediatelyAfter === 'unresolved'
      && introAfter.value?.phaseImmediatelyAfter === 'ROUND_INTRO'
      && resolvingBetweenContactAndArm === false;
    // The falsifiable re-arm check: a RESOLVING_* phaseChange logged strictly after PLAYER_TURN began.
    const postArmPressSucceeded = playerTurnAt !== null
      && phaseLog.some((e) => e.t > playerTurnAt && e.newPhase.startsWith('RESOLVING'));

    runs.push({
      run: i,
      calib: calib.value,
      roundResetAt,
      contactAt,
      playerTurnAt,
      contactOffsetFromRoundReset: contactOffset,
      timerImpliedGap: contactOffset !== null ? 1200 - contactOffset : null, // roundReset+1200 - contact; NOT independent proof, see header
      introContact: p?.introContact ?? null,
      introAfter: introAfter.value ?? null,
      contactLandedInIntro,
      introPressWasDropped,
      postArmPressSucceeded,
      phaseLog,
    });
  }
  return { url: URL, runs };
}
