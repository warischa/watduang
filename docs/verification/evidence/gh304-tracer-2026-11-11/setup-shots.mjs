// gh#304: setup page captures at 320 and 1280, run through scripts/driver.mjs. The site's scroll reveal
// (src/scripts/scroll-reveal.ts) keeps below-the-fold blocks hidden until they scroll in, so a full-page
// capture would show them blank: every block is scrolled through first, which is what a reader does.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:4324';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function run(session) {
  const out = {};
  for (const [w, h] of [[320, 568], [1280, 800]]) {
    await session.nav(`${BASE}/game/prize-draw/`);
    await session.wipe();
    await session.setWidth(w, h);
    await session.nav(`${BASE}/game/prize-draw/`);
    await session.setWidth(w, h);
    await sleep(800);
    out[w] = (await session.evaluate(`
      await document.fonts.ready;
      const ta = document.getElementById('pd-names');
      ta.value = Array.from({ length: 200 }, (_, i) => 'Guest ' + (i + 1)).join('\\n');
      ta.dispatchEvent(new Event('input'));
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 200) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
      scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 500));
      return { pending: document.querySelectorAll('.reveal-pending:not(.is-in)').length, height: document.documentElement.scrollHeight };
    `)).value;
    await session.screenshot(path.join(HERE, `setup-${w}.png`));
  }
  return out;
}
