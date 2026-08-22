// gh#61 check 4 — the collapse window is keyed on `gameId === undefined`, so a GAME page must be
// byte-for-byte what it was: panel collapses to display:none, the stage reveals, _arm-gate still gates
// the first control, and a link tap inside the first 400ms still reaches the #39 leave-confirm dialog
// instead of being eaten. That last one is the real measurement here: if the tool-page swallower were
// installed on a game page, the click would never reach the leave-confirm listener and the dialog would
// stay shut — which looks exactly like a guard working if you only check "did not navigate".
//
// Run: PROBE_BASE=http://localhost:4321 CDP_PORT=9222 node scripts/driver.mjs <this file>

const ROSTER = ['เอ', 'บี', 'ซี', 'ดี'];
const GAME_PATH = '/game/timebomb/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(session, body) {
  const r = await session.evaluate(body);
  if (r.error) throw new Error(`evaluate failed: ${r.error}`);
  return r.value;
}

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const out = { base, gamePath: GAME_PATH, at: new Date().toISOString() };

  await session.nav(`${base}${GAME_PATH}`);
  await session.setWidth(320, 568);
  await session.wipe();
  await ev(session, `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(ROSTER))}); return true;`);
  // navigate twice so the game chunk is already in the HTTP cache — the mount then lands well inside
  // the 400ms window we need the link tap to fall in, instead of racing a cold network fetch
  await session.nav(`${base}${GAME_PATH}`);
  await session.nav(`${base}${GAME_PATH}`);

  // start the round, then watch the stage: when did the first control appear, was it disabled (arm-gate),
  // and when did it arm? All timings are page-side, relative to the start click.
  out.start = await ev(
    session,
    `
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    const stage = document.getElementById('stage');
    window.__pd = [];
    document.addEventListener('pointerdown', (e) => {
      window.__pd.push({ t: performance.now() - window.__t0, tag: e.target.tagName });
    }, true);
    window.__t0 = performance.now();
    document.getElementById('start-round').click();
    let firstSeen = null, armedAt = null, btn = null;
    for (let i = 0; i < 400; i++) {
      btn = document.getElementById('tb-start');
      if (btn && firstSeen === null) firstSeen = { at: performance.now() - window.__t0, disabled: btn.disabled };
      if (btn && !btn.disabled) { armedAt = performance.now() - window.__t0; break; }
      await new Promise((r) => setTimeout(r, 10));
    }
    const panel = document.getElementById('player-setup');
    const cs = getComputedStyle(panel);
    const link = document.querySelector('a[href^="/game/"]:not([data-stable-exit])');
    const lr = link ? link.getBoundingClientRect() : null;
    return {
      panelHidden: panel.hidden, panelDisplay: cs.display, panelVisibility: cs.visibility,
      panelOffsetParentNull: panel.offsetParent === null,
      roundStartedDetector: !document.querySelector('#start-round')?.offsetParent,
      stageChildren: stage.children.length,
      stageVisible: stage.getBoundingClientRect().height > 0,
      firstControl: firstSeen, armedAtMs: armedAt,
      navLink: lr ? { href: link.getAttribute('href'), x: (lr.left + lr.right) / 2, y: (lr.top + lr.bottom) / 2 } : null,
    };
  `,
  );

  // second start of the same page is not available (the panel is gone), so measure the leave-confirm
  // reachability on a fresh start: reload, restart, and tap the nav link inside the window.
  await session.nav(`${base}${GAME_PATH}`);
  const startedAgain = await ev(
    session,
    `
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    window.__t0 = performance.now();
    window.__clicks = [];
    document.addEventListener('click', (e) => { window.__clicks.push(performance.now() - window.__t0); }, true);
    document.getElementById('start-round').click();
    for (let i = 0; i < 200; i++) {
      if (document.getElementById('tb-start')) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const link = document.querySelector('a[href^="/game/"]:not([data-stable-exit])');
    const lr = link.getBoundingClientRect();
    link.scrollIntoView({ block: 'center' });
    const r2 = link.getBoundingClientRect();
    return { mountedAt: performance.now() - window.__t0, href: link.getAttribute('href'),
             x: (r2.left + r2.right) / 2, y: (r2.top + r2.bottom) / 2 };
  `,
  );
  out.linkTap = { ...startedAgain };
  const p = session.tap(startedAgain.x, startedAgain.y); // un-awaited: the touch fires now
  await sleep(250);
  out.linkTapResult = await ev(
    session,
    `
    const dlg = document.getElementById('leave-confirm');
    return { dialogOpen: dlg.open, clickGapsMs: window.__clicks, href: location.pathname,
             activeElement: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null };
  `,
  );
  await p;

  out.verdict =
    out.start.panelDisplay === 'none' &&
    out.start.stageVisible &&
    out.start.firstControl?.disabled === true &&
    out.start.armedAtMs !== null &&
    out.linkTapResult.dialogOpen === true &&
    out.linkTapResult.href === GAME_PATH
      ? 'GAME_PAGE_UNAFFECTED'
      : 'CHANGED — read the fields';
  out.consoleErrors = session.consoleErrors;
  return out;
}
