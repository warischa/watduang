// gh#254 evidence: rendered link-box height per target group, per page and width (min / max / n).
//
//   BASE=http://localhost:4371 CDP_PORT=9371 node scripts/driver.mjs docs/verification/evidence/gh254/heights.mjs
const BASE = process.env.BASE || 'http://localhost:4371';
const PAGES = (process.env.PAGES || '/c/party/,/c/fortune/,/tool/wheel/,/tool/number/,/tool/draw/,/tool/team/,/game/siamsi/,/game/daily-fortune/,/game/love-match/').split(',');
const GROUPS = { gamenav: 'nav li a', allTools: '#how-to-use p a', categoryCrumb: '.breadcrumb a', toolCrumb: '.tool-breadcrumb a', toolBack: 'a.tool-back', topbarBack: '.game-topbar a' };
const PROBE = `
  await document.fonts.ready;
  const groups = ${JSON.stringify(GROUPS)};
  const out = {};
  for (const [k, sel] of Object.entries(groups)) {
    const hs = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }).map((e) => +e.getBoundingClientRect().height.toFixed(2));
    if (hs.length) out[k] = { n: hs.length, min: Math.min(...hs), max: Math.max(...hs) };
  }
  return { path: location.pathname, groups: out };
`;
export default async function (session) {
  const out = [];
  for (const w of [320, 1440]) {
    await session.setWidth(w, w < 640 ? 640 : 900, w < 640);
    for (const p of PAGES) {
      await session.nav(`${BASE}${p}`);
      const r = await session.evaluate(PROBE);
      out.push({ width: w, ...(r.value ?? { path: p, error: r.error }) });
    }
  }
  await session.close();
  return out;
}
