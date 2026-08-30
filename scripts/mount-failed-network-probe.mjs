// gh#149 STALE TARGET — this file drives /game/<id>/ landing pages that ADR-0050 ruling 2 deleted.
// It is a manual tool wired into no gate, so it cannot red anything; run it and it navigates to a
// URL that only Azure resolves, via a 301 to the play route, and measures the wrong page. Re-point
// it at /game/<id>/play/ (a different DOM) or delete it — do not read a run of it as evidence.
// gh#54 — the two DoD boxes the source-structural tests (player-setup.test.mjs, session.test.mjs)
// cannot settle, because the island cannot be imported there: they pin the dispatch order and the
// notice string against SOURCE TEXT, never against a rendered page.
//
//   - "The leave-confirm interceptor does not arm on a page where no round started"
//   - "A test drives the failure path — a rejected module load — rather than only the happy path"
//
// docs/verification/evidence/54/ already has a real-browser walk of this mechanism, but its own
// README says exactly what it left out: "a rejected load() is stubbed by a throwing module, not by
// a real network failure" and the leave-confirm interceptor is never touched there at all. This probe
// is the real network failure: CDP Fetch domain (scripts/driver.mjs's failRequests) aborts every
// request for the game's own chunk, so `await load()` in src/pages/game/[id].astro rejects because
// the fetch genuinely failed — not because a stand-in chunk was swapped onto disk.
//
// Run:
//   npm run build && npx serve dist/ -l 4321 &
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 \
//     --user-data-dir=/tmp/mount-failed-prof &
//   node scripts/driver.mjs scripts/mount-failed-network-probe.mjs
// STATUS (gh#43 precedent — issue closed, "no browser probe was wired into CI, not on cost, on
// evidence"): stays MANUAL, same as every other probe in that table. No cheap static tripwire can
// replace it — the invariant here is about a REAL rejected fetch and REAL DOM state after it, which
// is exactly what a source scan cannot see. Run by hand when [id].astro's catch or the leave-confirm
// gate (`gameId === undefined || !root.hidden`) changes.

const GAME_ID = 'timebomb'; // players:[2,10] — same roster the #39 probes use
const PLAYERS = ['สมชาย', 'ปูเป้', 'บีม', 'เจี๊ยบ'];
const NOTICE = 'รอบนี้ยังไม่ได้เริ่ม — เปิดเกมไม่สำเร็จ ชื่อที่เลือกไว้ยังอยู่ครบ กดเริ่มรอบอีกครั้งได้เลย';

const READ_PANEL = `
  const root = document.getElementById('player-setup');
  const errorEl = document.getElementById('setup-error');
  const names = [...document.querySelectorAll('#roster-list li')].map((li) => li.textContent.trim());
  const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
  return {
    panelHidden: root.hidden,
    panelVisible: !!document.querySelector('#start-round')?.offsetParent, // trap #2: calibrated boolean, not #draw-go
    noticeHidden: errorEl.hidden,
    noticeText: errorEl.textContent,
    rosterNames: names,
    rosterChecked: boxes.map((b) => b.checked),
    stageKids: document.getElementById('stage')?.children.length ?? null,
    group: localStorage.getItem('watduang:group'),
  };
`;

// Same technique leave-confirm-probe.mjs's assertion D uses: a bubble-phase blocker records whether
// the site's own CAPTURE-phase guard already called preventDefault, then stops the real navigation so
// the tab stays put. guardIntercepted === false is the observable for "interceptor did not arm".
const PROBE_LEAVE_GUARD = `
  const link = document.querySelector('nav.game-next a[href^="/game/"]');
  const dlg = document.getElementById('leave-confirm');
  if (!link || !dlg) return { missing: true, hasLink: !!link, hasDialog: !!dlg };
  let seen = null;
  const blocker = (e) => { seen = { defaultPrevented: e.defaultPrevented }; e.preventDefault(); };
  document.addEventListener('click', blocker, false);
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  document.removeEventListener('click', blocker, false);
  const out = { guardIntercepted: seen ? seen.defaultPrevented : null, dialogOpen: dlg.open, pathname: location.pathname };
  if (dlg.open) dlg.close();
  return out;
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function verdictAttempt(panel, leaveGuard) {
  return {
    noticeShown: panel.noticeHidden === false && panel.noticeText === NOTICE,
    panelVisibleAgain: panel.panelHidden === false && panel.panelVisible === true,
    rosterIntact:
      panel.rosterNames.length === PLAYERS.length &&
      PLAYERS.every((n) => panel.rosterNames.includes(n)) &&
      panel.rosterChecked.length === PLAYERS.length &&
      panel.rosterChecked.every(Boolean),
    leaveConfirmNotArmed: leaveGuard.guardIntercepted === false && leaveGuard.dialogOpen === false,
    stageEmpty: panel.stageKids === 0,
  };
}

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const url = `${base}/game/${GAME_ID}/`;

  // Origin first, then wipe, then reload — a wipe on about:blank clears nothing (trap 4).
  await session.nav(url);
  await session.setWidth(320, 900);
  await session.wipe();
  await session.evaluate(
    `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(PLAYERS))}); return true;`,
  );
  await session.nav(url); // reload same tab so PlayerSetup reads the seeded roster

  const before = (await session.evaluate(READ_PANEL)).value;
  const rosterSeededCorrectly =
    before?.rosterNames.length === PLAYERS.length && PLAYERS.every((n) => before.rosterNames.includes(n));

  // Arm interception AFTER the seeding reload (the seeding reload must succeed, or there is no
  // roster to lose) and BEFORE the first Start press — everything from here on, every request for
  // this game's own chunk is aborted at the network layer, a REAL rejected dynamic import().
  await session.failRequests(`*_astro/${GAME_ID}.*.js`, { reason: 'Failed' });

  await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click();
    return true;`);
  await sleep(1200); // covers the network round-trip + queueMicrotask restore, generous margin over the 900ms other probes use

  const afterFirst = (await session.evaluate(READ_PANEL)).value;
  const leaveGuardFirst = (await session.evaluate(PROBE_LEAVE_GUARD)).value;
  const requestsAfterFirst = session.failedRequests.length;

  // Second start on the SAME page, no reload — the module's fetch has already been attempted and
  // failed once, so this presses whatever path a page that already tried and failed takes on retry.
  // requestStart's own showError('') clears the first notice on the way in; if nothing restored it
  // afterwards this would read as noticeShown:false, which is exactly the re-hide race gh#54 names.
  await session.evaluate(`document.getElementById('start-round').click(); return true;`);
  await sleep(1200);

  const afterSecond = (await session.evaluate(READ_PANEL)).value;
  const leaveGuardSecond = (await session.evaluate(PROBE_LEAVE_GUARD)).value;
  const requestsAfterSecond = session.failedRequests.length;

  const verdict1 = afterFirst && leaveGuardFirst ? verdictAttempt(afterFirst, leaveGuardFirst) : null;
  const verdict2 = afterSecond && leaveGuardSecond ? verdictAttempt(afterSecond, leaveGuardSecond) : null;
  const allPass = (v) => !!v && Object.values(v).every(Boolean);

  return {
    meta: {
      gameId: GAME_ID,
      players: PLAYERS,
      notice: NOTICE,
      mechanism: 'CDP Fetch domain (session.failRequests) aborts every request for the game chunk — a real network-level rejection of the dynamic import, not a swapped-in throwing module',
    },
    preconditions: {
      before,
      rosterSeededCorrectly,
      panelVisibleBeforeStart: before?.panelVisible === true,
      noticeHiddenBeforeStart: before?.noticeHidden === true,
    },
    firstLoad: { after: afterFirst, leaveGuard: leaveGuardFirst, verdict: verdict1, requestsPausedSoFar: requestsAfterFirst },
    secondStartSamePage: { after: afterSecond, leaveGuard: leaveGuardSecond, verdict: verdict2, requestsPausedSoFar: requestsAfterSecond },
    failedRequestsLog: session.failedRequests,
    consoleErrors: session.consoleErrors,
    summary: {
      rosterSeededCorrectly,
      firstLoad: allPass(verdict1) ? 'PASS' : 'FAIL',
      secondStartSamePage: allPass(verdict2) ? 'PASS' : 'FAIL',
      overall: rosterSeededCorrectly && allPass(verdict1) && allPass(verdict2) ? 'PASS' : 'FAIL',
    },
    scopeNotCovered: [
      'Only one game (timebomb) is driven — the catch/showError/leave-confirm wiring is shared by all six game pages through PlayerSetup.astro and [id].astro, but only one was walked here.',
      'Only one retry deep — a third or fourth failed start on the same page is not driven.',
      'The exact microtask-vs-synchronous branch [id].astro\'s own comment describes ("second start, module cached, thrown synchronously inside dispatchEvent") is NOT reproduced here: that branch requires `game` to already hold a successfully loaded module, and a network-level Fetch abort can never produce that — `await load()` always yields at least one microtask regardless of how fast the rejection resolves, by JS language guarantee, so a probe built only on failing the fetch cannot force the synchronous-throw branch. "Second start on the same page" here means a same-page retry against a module load that keeps failing, which is the real, observable end-state this DoD box cares about (does the panel/roster/guard stay correct on retry) — not a reproduction of that specific code-comment branch. docs/verification/evidence/54/ covers the synchronous branch instead, by swapping in a throwing mount().',
      'saveGroup([]) / pressing Clear group itself is never pressed here — same gap docs/verification/evidence/54/README.md already names.',
      'Desktop-width CDP only (320x900 emulated viewport, not real iOS WebKit).',
    ],
  };
}
