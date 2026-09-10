// Companion to fold-probe.mjs: freeze-tap's overflow is clipped by an ancestor chain that a
// html/body override alone does not release, so this walks the primary control's own ancestors and
// releases each one. INSTRUMENTED shot only — every number in the evidence comes from fold-probe.mjs
// before any style is touched. Runs on its own load so it cannot contaminate that run.
const BASE = process.env.BASE || 'http://localhost:4324';
const SHOTS = process.env.SHOT_DIR;
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

export default async function (session) {
  const url = `${BASE}/game/freeze-tap/play/`;
  await session.nav(url);
  await session.setWidth(320, 568);
  await session.wipe();
  await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(320, 568);
  await sleep(1200);
  // One press of the largest non-header button reaches the pass screen, as in fold-probe's walk.
  const press = await session.evaluate(`
    const cands = [...document.querySelectorAll('#app, #app-container, #appRoot').values()]
      .flatMap((r) => [...r.querySelectorAll('button:not([disabled])')])
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header'); })
      .sort((a, z) => { const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect(); return rz.width * rz.height - ra.width * ra.height; });
    cands[0].click();
    return (cands[0].textContent || '').trim();
  `);
  await sleep(900);
  const before = await session.evaluate(`
    const p = document.querySelector('#playerReadyBtn');
    if (!p) return { ok: false };
    return { ok: true, primaryTop: p.getBoundingClientRect().top, docScrollHeight: document.documentElement.scrollHeight };
  `);
  const released = await session.evaluate(`
    const p = document.querySelector('#playerReadyBtn');
    const chain = [];
    for (let e = p; e; e = e.parentElement) chain.push(e);
    for (const e of [document.documentElement, document.body, ...chain]) {
      e.style.setProperty('overflow', 'visible', 'important');
      e.style.setProperty('height', 'auto', 'important');
      e.style.setProperty('max-height', 'none', 'important');
    }
    return { primaryTop: p.getBoundingClientRect().top, docScrollHeight: document.documentElement.scrollHeight,
             chain: chain.map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')) };
  `);
  await sleep(300);
  const shot = `${SHOTS}/freeze-tap-320x568-fullpage-clip-released.png`;
  await session.screenshot(shot);
  return { pressed: press.value, before: before.value, released: released.value, shot };
}
