const BASE = process.env.BASE || 'http://localhost:4178';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;
export default async function main(session) {
  const url = `${BASE}/game/wire-snip-panic/play/`;
  await session.nav(url);
  await session.setWidth(320, 568);
  await session.wipe();
  await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(320, 568);
  await sleep(1200 + 700);
  const r = await session.evaluate(`
    const ids = ['turn-action-banner', 'btn-trigger-scan'];
    const out = {};
    for (const id of ids) {
      const e = document.getElementById(id);
      out[id] = e ? { textContent: (e.textContent||'').trim(), hasClick: typeof e.onclick === 'function' } : null;
    }
    const span = document.querySelector('#btn-trigger-scan span');
    out['span-in-btn'] = span ? { textContent: (span.textContent||'').trim() } : null;
    return out;
  `);
  return r.value ?? { error: r.error };
}
