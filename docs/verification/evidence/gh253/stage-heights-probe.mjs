// gh#253: the mounted first-screen height of #stage on each solo landing, swept over widths. This is
// the instrument the reserve values were read from; it is not the outcome check (cls-probe.mjs is).
//   PAGES=/game/siamsi/,... WIDTHS=320,390,1440 node scripts/driver.mjs <this file>
const BASE = process.env.BASE || 'http://localhost:4361';
const PAGES = (process.env.PAGES || '/game/siamsi/,/game/daily-fortune/,/game/love-match/').split(',');
const WIDTHS = (process.env.WIDTHS || '320,1440').split(',').map(Number);

export default async function (s) {
  const out = [];
  for (const w of WIDTHS) {
    await s.setWidth(w, w < 640 ? 640 : 900, w < 640);
    for (const p of PAGES) {
      await s.nav(BASE + p);
      await new Promise((r) => setTimeout(r, 400));
      const r = await s.evaluate(`
        const st = document.getElementById('stage'), how = document.getElementById('how-to-play');
        const cs = getComputedStyle(st);
        return { h: +st.getBoundingClientRect().height.toFixed(1), stageTop: Math.round(st.getBoundingClientRect().top + scrollY),
          howY: Math.round(how.getBoundingClientRect().top + scrollY), iw: innerWidth, minBlock: cs.minBlockSize,
          state: st.dataset.stage ?? null, fontsOk: document.fonts.status };
      `);
      out.push({ w, page: p, ...(r.value ?? { error: r.error }) });
    }
  }
  await s.close();
  return out;
}
