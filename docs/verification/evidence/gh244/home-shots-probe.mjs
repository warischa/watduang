// gh#244 box 4 — full-page captures of the built home page at the widths the box names, for judging
// against the canvas D captures in docs/verification/evidence/gh243/. Every lazy image is scrolled
// into range first, so a capture never shows an empty art box that a reader would have seen filled.
// The run reports innerWidth per capture; a capture whose innerWidth is not the width asked for is
// void (docs/agents/browser-verification.md, trap 1).
//   OUT=<dir> node scripts/driver.mjs docs/verification/evidence/gh244/home-shots-probe.mjs
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = process.env.OUT || '.';
const WIDTHS = (process.env.WIDTHS || '320,768,1440').split(',').map(Number);
const TAG = process.env.TAG || 'normal';

export default async function (session) {
  const rows = [];
  for (const w of WIDTHS) {
    await session.setWidth(w, w < 640 ? 640 : 900, w < 640);
    await session.nav(`${BASE}/`);
    const read = await session.evaluate(`
      for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
      await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((r) => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', r, { once: true });
        setTimeout(r, 5000);
      })));
      scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
      return { innerWidth, height: document.documentElement.scrollHeight,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
    `);
    const path = `${OUT}/home-${w}-${TAG}.png`;
    await session.screenshot(path);
    rows.push({ width: w, ...read.value, path });
  }
  await session.close();
  return rows;
}
