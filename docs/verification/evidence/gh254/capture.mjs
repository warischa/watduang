// gh#254 evidence driver: per page and width, measure every visible link's rendered box, measure
// sideways overflow, and write a full-page screenshot.
//
//   OUT=<dir> BASE=http://localhost:4371 CDP_PORT=9371 node scripts/driver.mjs docs/verification/evidence/gh254/capture.mjs
//
// Env: OUT (screenshot dir, required), BASE, WIDTHS (default 320,1440), PAGES (comma list).
// Prints one JSON object: per width and page, the links under 24px tall and the overflow reading.
const BASE = process.env.BASE || 'http://localhost:4371';
const OUT = process.env.OUT;
const WIDTHS = (process.env.WIDTHS || '320,1440').split(',').map(Number);
const PAGES = (process.env.PAGES || '/,/c/party/,/c/fortune/,/tools/,/tool/wheel/,/tool/number/,/tool/draw/,/tool/team/,/game/siamsi/,/game/daily-fortune/,/game/love-match/').split(',');

const MEASURE = `
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 500));
  const de = document.documentElement;
  const links = [...document.querySelectorAll('a')].filter((a) => { const r = a.getBoundingClientRect(); const cs = getComputedStyle(a); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }).map((a) => {
    const r = a.getBoundingClientRect();
    const p = a.parentElement;
    return { text: a.textContent.trim().slice(0, 20), cls: a.className || '', parent: p.tagName.toLowerCase() + (p.className ? '.' + p.className : ''), display: getComputedStyle(a).display, h: +r.height.toFixed(2), w: +r.width.toFixed(2) };
  });
  return {
    path: location.pathname, innerWidth,
    scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
    over: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > de.clientWidth + 0.5).length,
    links: links.length, under24: links.filter((l) => l.h < 24),
  };
`;

export default async function (session) {
  const out = [];
  for (const w of WIDTHS) {
    await session.setWidth(w, w < 640 ? 640 : 900, w < 640);
    for (const p of PAGES) {
      await session.nav(`${BASE}${p}`);
      const r = await session.evaluate(MEASURE);
      const row = r.value ?? { path: p, error: r.error };
      row.width = w;
      // Animations are frozen only for the screenshot, so a before/after pixel diff does not read the
      // home page's own motion as a change. The measurement above ran with the page live.
      await session.evaluate("const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(s); await new Promise((r) => setTimeout(r, 300)); return true;");
      if (OUT) await session.screenshot(`${OUT}/${w}${p.replace(/\//g, '_')}.png`);
      out.push(row);
    }
  }
  await session.close();
  return out;
}
