// bfcache checkpoint-clobber probe for gh#49.
// Run via the repo's one-tab driver (this file only default-exports a function, it is
// not a standalone entry point): node scripts/driver.mjs docs/verification/evidence/49/probe.mjs
// Drives one tab through:
//   instance #1 (start round, draw -> checkpoint C1) -> tap data-stable-exit link -> /games/
//   -> instance #2 (resume same id, play on -> checkpoint C5, materially more progress)
//   -> history.back() x2 (bfcache restore attempt of instance #1)
//   -> tap ส่งต่อ on instance #1 -> read checkpoint before/after
const BASE = 'http://localhost:4321';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCREENSHOT_PATH = new URL('./after-step7.png', import.meta.url).pathname;

// Safe wrapper: history.back() destroys the current JS realm mid-navigation, which can make
// Runtime.evaluate's own promise never resolve cleanly. Never await it seriously — fire and settle.
async function fireAndForget(session, body) {
  try {
    await session.evaluate(body);
  } catch {
    // execution context destroyed by the navigation we just triggered — expected, not an error
  }
}

export default async function (session) {
  const out = { steps: [] };
  const log = (label, value) => {
    out.steps.push({ label, value });
    return value;
  };
  const readCheckpoint = async (label) => {
    const r = await session.evaluate("return sessionStorage.getItem('watduang:session');");
    return log(label, r.value ?? r.error ?? null);
  };
  const click = async (selector, label) => {
    const r = await session.evaluate(
      `const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'MISSING:${selector}'; el.click(); return 'clicked:${selector}';`,
    );
    log(label ?? `click ${selector}`, r.value ?? r.error);
    await sleep(700); // > ARM_DELAY_MS (400ms) so the next click is not eaten by the ghost-tap gate
  };

  // ---- setup: on-origin wipe (trap #4 — nav first, then wipe, then reload) ----
  await session.nav(`${BASE}/game/siamsi/`);
  await session.wipe();
  const wipedCheck = await session.evaluate(
    "return { ls: sessionStorage.getItem('watduang:session') };",
  );
  log('wipe verified on-origin', wipedCheck.value ?? wipedCheck.error);
  await session.nav(`${BASE}/game/siamsi/`); // reload onto the clean slate — this IS instance #1

  // set 4 players so the round survives several turns without ending
  await session.evaluate("document.getElementById('player-count').value = '4'; return true;");

  // ---- POSITIVE CONTROL: prove an ordinary write is observable at all ----
  await click('#start-numbered', 'instance#1: start-numbered clicked');
  const beforeOrdinaryWrite = await readCheckpoint('positive control: after setPlayers, before startRound');
  await click('#ss-start', 'instance#1: ss-start clicked (startRound)');
  const afterOrdinaryWrite = await readCheckpoint('positive control: after startRound (should have checkpoint)');

  let positiveControlPassed = false;
  try {
    const before = beforeOrdinaryWrite ? JSON.parse(beforeOrdinaryWrite) : null;
    const after = afterOrdinaryWrite ? JSON.parse(afterOrdinaryWrite) : null;
    positiveControlPassed =
      beforeOrdinaryWrite !== afterOrdinaryWrite && before?.checkpoint == null && after?.checkpoint?.phase === 'turn';
  } catch {
    positiveControlPassed = false;
  }
  out.positiveControlPassed = positiveControlPassed;
  if (!positiveControlPassed) {
    out.verdict = 'BLOCKED — positive control failed, apparatus cannot observe an ordinary checkpoint write';
    return out;
  }

  // ---- Instance #1: draw once so it lands on 'drawn' (ส่งต่อ button present) — this is C1 ----
  await click('#ss-draw', 'instance#1: ss-draw clicked (draw)');
  const C1 = await readCheckpoint('C1 (instance #1, drawn, held in its closure)');

  // arm a bfcache detector on THIS document before leaving it
  await session.evaluate(
    "window.__pageshowLog = []; window.addEventListener('pageshow', (e) => window.__pageshowLog.push({ persisted: e.persisted, t: Date.now() })); window.__instance1Marker = true; return true;",
  );

  // ---- Step 2: tap the stable-exit /games/ link — must not confirm-dialog ----
  await click('a[data-stable-exit]', 'instance#1: tap /games/ link (data-stable-exit)');
  await sleep(400);
  const pathAfterLeave = await session.evaluate('return location.pathname;');
  log('path after leave-click', pathAfterLeave.value ?? pathAfterLeave.error);

  // ---- Step 3/4: fresh instance #2 from /games/ ----
  await click('a[href="/game/siamsi/"]', '/games/: tap siamsi link (instance #2)');
  const pathInstance2 = await session.evaluate('return location.pathname;');
  log('path on instance #2', pathInstance2.value ?? pathInstance2.error);

  await session.evaluate("document.getElementById('player-count').value = '4'; return true;");
  await click('#start-numbered', 'instance#2: start-numbered clicked');
  const resumeChoiceShown = await session.evaluate(
    "return !document.getElementById('resume-choice').hidden;",
  );
  log('instance#2: resume-choice shown', resumeChoiceShown.value ?? resumeChoiceShown.error);
  await click('#resume-round', 'instance#2: resume-round clicked');
  const afterResume = await readCheckpoint('instance#2: checkpoint immediately after resume (should equal C1)');
  let resumeMatchesC1 = false;
  try {
    resumeMatchesC1 =
      JSON.stringify(JSON.parse(C1).checkpoint) === JSON.stringify(JSON.parse(afterResume).checkpoint);
  } catch {
    resumeMatchesC1 = false;
  }
  log('instance#2: resume checkpoint equals C1', resumeMatchesC1);
  out.resumeMatchesC1 = resumeMatchesC1;

  // ---- Step 5: play several turns on instance #2, deliberately NOT finishing the round ----
  for (let i = 0; i < 3; i++) {
    const phaseRes = await session.evaluate(
      "const raw = sessionStorage.getItem('watduang:session'); return raw ? (JSON.parse(raw).checkpoint?.phase ?? null) : null;",
    );
    const phase = phaseRes.value;
    if (phase === 'drawn') {
      await click('#ss-pass', `instance#2 turn ${i}: ss-pass`);
    } else {
      await click('#ss-draw', `instance#2 turn ${i}: ss-draw`);
    }
  }
  const C5 = await readCheckpoint('C5 (instance #2, materially more progress)');

  // ---- Step 6: history.back() x2 — attempt to restore instance #1 from bfcache ----
  await fireAndForget(session, 'history.back(); return true;');
  await sleep(1200);
  await fireAndForget(session, 'history.back(); return true;');
  await sleep(1200);

  const pathAfterBack2 = await session.evaluate('return location.pathname;');
  log('path after history.back() x2', pathAfterBack2.value ?? pathAfterBack2.error);

  const pageshowLog = await session.evaluate(
    "return { hasMarker: window.__instance1Marker === true, log: window.__pageshowLog ?? null };",
  );
  log('pageshow log read back on the (hopefully) restored instance #1', pageshowLog.value ?? pageshowLog.error);
  out.bfcacheRestored =
    pageshowLog.value?.hasMarker === true &&
    Array.isArray(pageshowLog.value?.log) &&
    pageshowLog.value.log.some((e) => e.persisted === true);

  if (!out.bfcacheRestored) {
    out.verdict =
      'REFUTED-in-this-environment — bfcache did not retain instance #1 across two back-steps (no restored JS realm / no persisted pageshow observed)';
    // still capture what we can for the record
    const checkpointNow = await readCheckpoint('checkpoint state when bfcache did not restore');
    out.checkpointNow = checkpointNow;
    return out;
  }

  // ---- Step 7: tap ส่งต่อ (#ss-pass) on the restored instance #1 ----
  const checkpointImmediatelyBeforeStep7 = await readCheckpoint('checkpoint immediately BEFORE step 7 tap');
  const step7Path = await session.evaluate('return location.pathname;');
  log('path right before step 7 tap', step7Path.value ?? step7Path.error);

  await click('#ss-pass', 'instance#1 (restored): tap ส่งต่อ — the alleged clobber');
  const checkpointImmediatelyAfterStep7 = await readCheckpoint('checkpoint immediately AFTER step 7 tap');

  try {
    await session.screenshot(SCREENSHOT_PATH);
  } catch (e) {
    // ponytail: a screenshot write failure (e.g. a read-only checkout) must not sink the verdict
    log('screenshot write failed (non-fatal)', String(e));
  }

  // ---- settle the claim ----
  let lostProgress = null;
  try {
    const before = JSON.parse(checkpointImmediatelyBeforeStep7);
    const after = JSON.parse(checkpointImmediatelyAfterStep7);
    const c5 = JSON.parse(C5);
    lostProgress = {
      c5_holder: c5.checkpoint?.holder,
      c5_results: c5.checkpoint?.results?.length,
      before_holder: before.checkpoint?.holder,
      before_results: before.checkpoint?.results?.length,
      after_holder: after.checkpoint?.holder,
      after_results: after.checkpoint?.results?.length,
      strictlyLessProgress:
        (after.checkpoint?.holder ?? 0) < (c5.checkpoint?.holder ?? 0) &&
        (after.checkpoint?.results?.length ?? 0) < (c5.checkpoint?.results?.length ?? 0),
    };
  } catch (e) {
    lostProgress = { parseError: String(e) };
  }
  out.lostProgress = lostProgress;
  out.verdict = lostProgress?.strictlyLessProgress ? 'CONFIRMED' : 'REFUTED';
  out.consoleErrors = session.consoleErrors;
  return out;
}
