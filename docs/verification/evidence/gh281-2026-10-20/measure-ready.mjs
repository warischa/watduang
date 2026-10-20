// gh#281 boxes 2 and 3: #playerReadyBtn at 320x568 on every forced draw of TRIGGER_CONDITIONS.
// Run: CDP_PORT=<port> BASE=<url> node scripts/driver.mjs docs/verification/evidence/gh281-2026-10-20/measure-ready.mjs > out.json
// Same walk as scripts/play-screen-fit-probe.mjs (seeded roster, forced Math.random, start, rule-ready), one
// load per draw, real emulated viewport. Pass = top >= BAND and bottom <= 568 and the button's centre is what
// elementFromPoint hits.
const BASE = process.env.BASE || 'http://localhost:4621';
const N = 9;
// SEED=names is the fit probe's own three-name roster; SEED=default seeds nothing, so the route opens on its default
// roster: the one the gh281 board replays and gh268's box3-freeze-tap-ready-320.json was taken on.
const SEEDED = (process.env.SEED || 'default') === 'names';
const BAND = 56;
const VP = { w: 320, h: 568 };
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const KEY = 'watduang:__fit-draw';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OVERRIDE = `(() => { try { const raw = localStorage.getItem(${JSON.stringify(KEY)});
  if (raw !== null) { const v = Number(raw); if (v >= 0 && v < 1) Math.random = () => v; } } catch (e) {} })();`;
const SEED = `localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))}); return true;`;
const CLICK = (sel) => `const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return { found: false };
  b.click(); return { found: true };`;
const READ = `const el = document.querySelector('#playerReadyBtn'); if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return { found: true, top: r.top, bottom: r.bottom, height: r.height, centreY: cy,
    centreHitsButton: hit === el || el.contains(hit), centreHit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null,
    disabled: el.disabled, innerHeight, innerWidth, docScroll: document.documentElement.scrollTop };`;

export default async function (session) {
  await session.onNewDocument(OVERRIDE);
  const url = `${BASE}/game/freeze-tap/play/`;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const v = (i + 0.5) / N;
    await session.nav(url);
    await session.setWidth(VP.w, VP.h);
    await session.wipe();
    if (SEEDED) await session.evaluate(SEED);
    await session.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(String(v))}); return true;`);
    await session.nav(url);
    await session.setWidth(VP.w, VP.h);
    await sleep(2500);
    const notes = [];
    for (const sel of ['[data-ps=start]', '#ruleReadyBtn']) {
      await sleep(900);
      const c = await session.evaluate(CLICK(sel));
      notes.push(`${sel}:${c.value?.found ? 'clicked' : 'MISSING'}`);
      await sleep(900);
    }
    const forced = (await session.evaluate('return Math.random();')).value;
    const m = (await session.evaluate(READ)).value;
    const visibleBelowBand = m.found ? Math.max(0, Math.min(m.bottom, VP.h) - Math.max(m.top, BAND)) : 0;
    const pass = Boolean(m.found && m.top >= BAND && m.bottom <= VP.h && m.centreHitsButton && m.innerWidth === VP.w && forced === v);
    rows.push({ draw: i, v, forced, notes, ...m, visibleBelowBand, pass });
  }
  return {
    n: N, seed: SEEDED ? 'names' : 'default', vp: `${VP.w}x${VP.h}`, band: BAND,
    note: 'one load per forced draw of TRIGGER_CONDITIONS; visibleBelowBand = px of the button between the band bottom and the viewport bottom; pass = top>=band && bottom<=568 && centre hit',
    minVisibleBelowBand: Math.min(...rows.map((r) => r.visibleBelowBand)),
    allPass: rows.every((r) => r.pass),
    rows,
  };
}
