// One-off measurement probe (gh#39 family hypothesis): does #clear-cancel's pre-collapse box overlap
// #stage's own live controls after the cancel tap hides #clear-choice? Not committed to scripts/ —
// this is a single-use measurement, not a regression gate.
//
// Run: node scripts/driver.mjs <this file>
// (needs `npx serve dist/ -l 4321` and headless Chrome on CDP_PORT — see scripts/driver.mjs's header)
//
// gh#55 fork (S2026-08-21): PROBE_GAME / PROBE_ROSTER_SIZE let this same scan run against other
// configs. SECOND_START_ID is the per-game button that enters the phase with a live #stage control
// (mirrors PlayerSetup.astro's shared start-round, which every game reuses identically).
const SECOND_START_ID = { siamsi: 'ss-start', timebomb: 'tb-start' };
const NAME_POOL = ['เอ', 'บี', 'ซี', 'ดี', 'อี', 'เอฟ', 'จี', 'เอช', 'ไอ', 'เจ'];
const GAME = process.env.PROBE_GAME || 'siamsi';
const ROSTER_SIZE = Number(process.env.PROBE_ROSTER_SIZE || 3);
const PLAYERS = JSON.stringify(JSON.stringify(NAME_POOL.slice(0, ROSTER_SIZE)));

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4321';
  const shotDir = process.env.SHOT_DIR;

  await session.nav(`${base}/game/${GAME}/`);
  const width = await session.setWidth(320, 568);
  const widthCheck = await session.evaluate('return { innerWidth, outerWidth: window.outerWidth };');

  // wipe ON the origin (not about:blank), then reload to a clean, seeded roster.
  await session.wipe();
  await session.evaluate(`localStorage.setItem('watduang:roster', ${PLAYERS}); return true;`);
  await session.nav(`${base}/game/${GAME}/`);

  const rosterCheck = await session.evaluate(`return localStorage.getItem('watduang:roster');`);

  // tick every roster box, start the round (same pattern as gamenav-again-grid-probe.mjs)
  const started = await session.evaluate(`
    const boxes = [...document.querySelectorAll('#roster-list input[type=checkbox]')];
    for (const b of boxes) if (!b.checked) b.click();
    document.getElementById('start-round').click();
    return true;`);
  await new Promise((r) => setTimeout(r, 900));

  const secondStartId = SECOND_START_ID[GAME];
  const mounted = await session.evaluate(`
    return { rootHidden: document.getElementById('player-setup').hidden,
             ssStart: !!document.getElementById('${secondStartId}') };`);

  // enter the phase that carries #stage's own live control (#ss-draw for siamsi, #tb-pass for timebomb)
  const turnEntered = await session.evaluate(`
    const btn = document.getElementById('${secondStartId}');
    if (!btn) return { error: 'no #${secondStartId}' };
    btn.click();
    return true;`);
  await new Promise((r) => setTimeout(r, 900)); // clear ARM_DELAY_MS (400ms) + settle

  const stageBefore = await session.evaluate(`
    const stage = document.getElementById('stage');
    const els = [...stage.querySelectorAll('button, a[href], input, select, textarea')];
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.id || null, tag: e.tagName, text: (e.textContent || '').trim().slice(0, 30),
               rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
    });`);

  if (shotDir) await session.screenshot(`${shotDir}/1-before-clear-tap.png`);

  // reveal #clear-choice (outside #player-setup, always reachable mid-round — PlayerSetup.astro:54-69)
  const revealed = await session.evaluate(`
    const btn = document.getElementById('clear-group');
    if (!btn || btn.hidden) return { error: 'clear-group missing or hidden' };
    btn.click();
    return true;`);
  await new Promise((r) => setTimeout(r, 200));

  const preCollapseRect = await session.evaluate(`
    const el = document.getElementById('clear-choice');
    const cancel = document.getElementById('clear-cancel');
    if (!el || el.hidden || !cancel) return { error: 'clear-choice not visible or #clear-cancel missing' };
    const r = cancel.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  `);

  if (preCollapseRect.error || preCollapseRect.value?.error) {
    return {
      verdict: 'INCONCLUSIVE',
      reason: 'could not reveal #clear-choice / read #clear-cancel box',
      widthCheck: widthCheck.value, rosterCheck: rosterCheck.value, mounted: mounted.value,
      turnEntered: turnEntered.value ?? turnEntered.error, revealed: revealed.value ?? revealed.error,
      preCollapseRect,
    };
  }
  const rect = preCollapseRect.value;

  if (shotDir) await session.screenshot(`${shotDir}/2-clear-choice-open.png`);

  // real touch tap at the cancel button's centre — proves the actual tap path, not just .click()
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  await session.tap(cx, cy);
  await new Promise((r) => setTimeout(r, 300)); // let the collapse reflow settle

  if (shotDir) await session.screenshot(`${shotDir}/3-after-cancel-tap.png`);

  const postState = await session.evaluate(`
    return { clearChoiceHidden: document.getElementById('clear-choice').hidden };
  `);

  const stageAfter = await session.evaluate(`
    const stage = document.getElementById('stage');
    const els = [...stage.querySelectorAll('button, a[href], input, select, textarea')];
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.id || null, tag: e.tagName, text: (e.textContent || '').trim().slice(0, 30),
               rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
    });`);

  // PROBE_POSITIVE_CONTROL: aim the SAME grid-scan algorithm at the live #stage control's own
  // post-collapse rect instead of #clear-cancel's box — must report a collision, or the scan itself
  // is broken and every "0" elsewhere is worthless. Does not touch the tap (still real: cancel the
  // real #clear-choice), only which box feeds the grid below.
  const scanRect = process.env.PROBE_POSITIVE_CONTROL ? stageAfter.value?.[0]?.rect : rect;

  // grid-scan the WHOLE target box, every 4px both axes (pre-collapse #clear-cancel, or in positive-
  // control mode the live #stage control's own rect)
  const scan = scanRect ? await session.evaluate(`
    const rect = ${JSON.stringify(scanRect)};
    const pts = [];
    for (let x = rect.left; x <= rect.right; x += 4)
      for (let y = rect.top; y <= rect.bottom; y += 4) pts.push([x, y]);
    const stage = document.getElementById('stage');
    const hits = pts.map(([x, y]) => {
      const at = document.elementFromPoint(x, y);
      const inStage = !!(at && stage.contains(at));
      const interactive = at ? at.closest('button, a[href], input, select, textarea') : null;
      const stageInteractive = interactive && stage.contains(interactive) ? interactive : null;
      return {
        x: Math.round(x), y: Math.round(y),
        atId: at ? at.id || null : null, atTag: at ? at.tagName : null,
        inStage,
        stageInteractiveId: stageInteractive ? stageInteractive.id || null : null,
        stageInteractiveTag: stageInteractive ? stageInteractive.tagName : null,
      };
    });
    return { total: pts.length, hits };
  `) : { value: { total: 0, hits: [] }, error: 'no target rect for scan (positive-control stage control missing)' };

  const hits = scan.value?.hits ?? [];
  const collisions = hits.filter((h) => h.stageInteractiveId || h.stageInteractiveTag);
  const positiveControl = !!process.env.PROBE_POSITIVE_CONTROL;

  // positive-control mode is a THREE-way outcome, never sharing a verdict string with a real
  // refutation: no target rect (apparatus never got to scan) is a different failure than "scanned
  // and found nothing" — collapsing them would make an apparatus failure wear the all-clear shape.
  let verdict;
  if (positiveControl) {
    verdict = !scanRect ? 'CONTROL_INCONCLUSIVE'
      : collisions.length > 0 ? 'CONTROL_PASSED' : 'CONTROL_FAILED';
  } else {
    verdict = collisions.length > 0 ? 'CONFIRMED' : 'REFUTED';
  }

  return {
    verdict,
    game: GAME,
    rosterSize: ROSTER_SIZE,
    positiveControl,
    widthCheck: widthCheck.value,
    rosterCheck: rosterCheck.value,
    mounted: mounted.value,
    turnEntered: turnEntered.value ?? turnEntered.error,
    stageBefore: stageBefore.value,
    preCollapseClearCancelRect: rect,
    scanRect,
    postState: postState.value,
    stageAfter: stageAfter.value,
    scanTotalPoints: scan.value?.total ?? null,
    collisionCount: collisions.length,
    collisions: collisions.slice(0, 20),
    nonCollisionSample: hits.filter((h) => !h.stageInteractiveId && !h.stageInteractiveTag).slice(0, 5),
  };
}
