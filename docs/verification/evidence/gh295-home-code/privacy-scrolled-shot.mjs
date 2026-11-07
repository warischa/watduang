// gh#295 B1: a full capture of /privacy/ after scrolling through it, so every scroll-reveal section has
// been shown before the screenshot (the first-load captures leave below-the-fold sections unpainted).
// Run: CDP_PORT=9352 BASE=http://localhost:9362 SHOTDIR=<dir> node scripts/driver.mjs <this file>
export default async function (session) {
  const out = [];
  for (const [w, h] of [[320, 568], [390, 844]]) {
    await session.setWidth(w, h);
    await session.nav(process.env.BASE + '/privacy/');
    const r = await session.evaluate(`await document.fonts.ready;
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 200) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
      await new Promise(r => setTimeout(r, 900)); scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
      return { innerWidth, pending: document.querySelectorAll('.reveal-pending').length };`);
    out.push({ w, ...(r.value ?? r) });
    await session.screenshot(`${process.env.SHOTDIR}/privacy-scrolled-${w}.png`);
  }
  return out;
}
