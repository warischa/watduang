// Proves: the committed no-nav-in-stage-probe.mjs samples only 3 points on centre-x per transition,
// which misses siamsi/love-match's "again" button anchors sitting ~7px off that axis (x=52 vs the
// sampled x=45). This probe grid-scans the WHOLE button box instead. Result on the post-fix build:
// roster 7 with 24-char names — 25 of 60 sampled points resolve to GameNav a[href] links
// (/game/pick-loser/, /game/short-stick/ at roster 7; /game/daily-fortune/, /game/love-match/ at
// roster 8) — a double-tap on "again" can land the group in a different game. See
// docs/verification/evidence/34/15-no-nav-in-stage.json for the full writeup.
//
// Run: ROSTER_JSON='[...]' GAME_ID=siamsi node scripts/driver.mjs scripts/gamenav-again-grid-probe.mjs
// (needs `npx serve dist/ -l 4321` and headless Chrome on CDP_PORT — see scripts/driver.mjs's header)
// GAME_ID also accepts love-match (WALKS/AGAIN below are already keyed per game id — no code change
// needed to target a different game, just swap GAME_ID and its ROSTER_JSON roster size).
//
// Grid-scan the whole box of the end-of-round "again" button across its tap-transition,
// walking the real game to reach it (siamsi: draw/pass to summary; love-match: two picks).
const PLAYERS = JSON.parse(process.env.ROSTER_JSON);
const WALKS = {
  siamsi: `
    document.getElementById('ss-start').click(); await sleep(250);
    for (let i = 0; i < 60 && !document.getElementById('ss-again'); i++) {
      const d = document.getElementById('ss-draw'); if (d) { d.click(); await sleep(250); continue; }
      const p = document.getElementById('ss-pass'); if (!p) break; p.click(); await sleep(250);
    }
    return !!document.getElementById('ss-again');`,
  'love-match': `
    const chips = () => [...stage.querySelectorAll('button')].filter((b) => b.id !== 'lm-reset' && b.id !== 'lm-again');
    chips()[0].click(); await sleep(250);
    chips().at(-1).click(); await sleep(250);
    return !!document.getElementById('lm-again');`,
};
const AGAIN = { siamsi: 'ss-again', 'love-match': 'lm-again' };
export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const id = process.env.GAME_ID;
  await session.nav(`${base}/game/${id}/`);
  await session.setWidth(320, 900);
  await session.wipe();
  await session.evaluate(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(PLAYERS))}); return true;`);
  await session.nav(`${base}/game/${id}/`);
  await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click(); return true;`);
  await new Promise((r) => setTimeout(r, 900));
  const reached = await session.evaluate(`
    const stage = document.getElementById('stage');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    ${WALKS[id]}`);
  const scan = await session.evaluate(`
    const btn = document.getElementById('${AGAIN[id]}');
    if (!btn) return { missing: true };
    const r = btn.getBoundingClientRect();
    const rect = { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    const pts = [];
    for (let x = r.left + 2; x <= r.right - 2; x += 6)
      for (let y = r.top + 2; y <= r.bottom - 2; y += 5) pts.push([x, y]);
    btn.click();
    await new Promise((res) => setTimeout(res, 400));
    const hits = pts.map(([x, y]) => {
      const at = document.elementFromPoint(x, y);
      const a = at && at.closest ? at.closest('a[href]') : null;
      return { x: Math.round(x), y: Math.round(y),
               anchorHref: a ? a.getAttribute('href') : null,
               anchorText: a ? (a.textContent || '').trim() : null,
               inGameNext: !!(at && at.closest && at.closest('nav.game-next')) };
    });
    return { rect, total: pts.length, anchorHits: hits.filter((h) => h.anchorHref),
             gameNextCount: hits.filter((h) => h.inGameNext).length };`);
  const result = { game: id, roster: PLAYERS.length, reachedAgain: reached.value ?? reached.error,
           scan: scan.error ? { error: scan.error } : scan.value };

  // #39: the grid scan above only proves a GameNav a[href] sits under a screen point — it uses
  // .click() + elementFromPoint, which never proves a real tap there navigates. This drives the same
  // coordinate with a real touch event (session.tap), the way the actual double-tap hazard does, and
  // watches location.pathname. A third tap at the identical point is the anti-recursion check: once
  // the guard has intercepted once, an immediate repeat tap must not slip through a second time.
  const hits = result.scan?.anchorHits ?? [];
  const target = hits.find((h) => h.inGameNext);
  if (!target) { result.doubleTap = { skipped: 'no inGameNext hit in the grid scan' }; return result; }

  await session.tap(target.x, target.y);
  const after = await session.evaluate(`
    const dlg = document.getElementById('leave-confirm');
    const go = document.getElementById('leave-go');
    const r = go ? go.getBoundingClientRect() : null;
    return {
      pathname: location.pathname,
      dialogOpen: dlg ? dlg.open : null,
      leaveGoRect: r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null,
    };`);

  await session.tap(target.x, target.y); // third tap overall, second at this exact point post-guard
  const third = await session.evaluate('return { pathname: location.pathname };');

  // Point-to-rect clearance in px, 0 if the tap point is inside the rect — computed here rather than
  // trusted from a threshold inside the page, so the number this returns is the number that gets read.
  const rect = after.value?.leaveGoRect ?? null;
  const clearancePx = rect
    ? Math.hypot(
        Math.max(rect.left - target.x, 0, target.x - rect.right),
        Math.max(rect.top - target.y, 0, target.y - rect.bottom),
      )
    : null;

  result.doubleTap = {
    tapCoord: { x: target.x, y: target.y },
    pathnameAfterTap: after.value?.pathname ?? after.error,
    dialogOpen: after.value?.dialogOpen ?? null,
    leaveGoRect: rect,
    leaveGoClearancePx: clearancePx,
    pathnameAfterThirdTap: third.value?.pathname ?? third.error,
  };
  return result;
}
