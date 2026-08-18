// Proves: the committed no-nav-in-stage-probe.mjs clicks #start-round with zero hit-sampling, so the
// setup-panel-collapse transition was structurally unmeasured. This probe grid-scans the WHOLE
// #start-round button box instead. Result on the post-fix build: pick-loser, roster 10 — the panel
// collapse drops <a href="/game/timebomb/"> under the button, 8 of 45 grid points (x 8-66, y 529-553).
// See docs/verification/evidence/34/15-no-nav-in-stage.json for the full writeup.
//
// Run: ROSTER_JSON='[...]' GAME_ID=pick-loser node scripts/driver.mjs scripts/gamenav-start-grid-probe.mjs
// (needs `npx serve dist/ -l 4321` and headless Chrome on CDP_PORT — see scripts/driver.mjs's header)
//
// Grid-scan the #start-round button box across the panel-collapse transition.
// A real finger taps anywhere inside the button; the committed probe samples nothing here.
// STATUS (gh#43): CLOSED EVIDENCE, not a regression suite. ADR-0015 decided nothing moves and only the consequence changes, so the collision counts recorded above are the permanent accepted state — this probe is EXPECTED to report collisions and a green run is not the goal. What can regress is the marker set, now gated by scripts/stable-exit-markers-check.mjs.
const PLAYERS = JSON.parse(process.env.ROSTER_JSON);
export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const id = process.env.GAME_ID;
  await session.nav(`${base}/game/${id}/`);
  await session.setWidth(320, 900);
  await session.wipe();
  await session.evaluate(`localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(PLAYERS))}); return true;`);
  await session.nav(`${base}/game/${id}/`);
  const ticked = await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    return { boxCount: boxes.length, allChecked: boxes.length > 0 && boxes.every((b) => b.checked) };`);
  const scan = await session.evaluate(`
    const btn = document.getElementById('start-round');
    const r = btn.getBoundingClientRect();
    const rect = { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    const pts = [];
    for (let x = r.left + 2; x <= r.right - 2; x += 6)
      for (let y = r.top + 2; y <= r.bottom - 2; y += 5) pts.push([x, y]);
    btn.click();
    await new Promise((res) => setTimeout(res, 900));
    const hits = pts.map(([x, y]) => {
      const at = document.elementFromPoint(x, y);
      const a = at && at.closest ? at.closest('a[href]') : null;
      return { x: Math.round(x), y: Math.round(y),
               anchorHref: a ? a.getAttribute('href') : null,
               anchorText: a ? (a.textContent || '').trim() : null,
               inGameNext: !!(at && at.closest && at.closest('nav.game-next')) };
    });
    return { rect, total: pts.length,
             anchorHits: hits.filter((h) => h.anchorHref),
             gameNextCount: hits.filter((h) => h.inGameNext).length };`);
  return { game: id, roster: PLAYERS.length, ticked: ticked.value, scan: scan.error ? { error: scan.error } : scan.value };
}
