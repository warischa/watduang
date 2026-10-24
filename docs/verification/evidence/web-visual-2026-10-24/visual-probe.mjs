// gh#288 Phase 0 — do the B and A prototypes PAINT what they claim? The cost rows only prove work was
// done. Crops of the top bar over scrolled content (none / B1 frosted / B2 SVG glass) and of the hero
// (none / A2 shader), each written to shots/ and hashed: identical hashes mean the effect paints nothing.
// The hero animates on its own (twinkle, bob), so its hashes always differ: judge those images by eye.
//   CDP_PORT=<port> LANE=<name> node <this file>
import { open } from './cdp-lib.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const BASE = process.env.BASE || 'http://localhost:4410', LANE = process.env.LANE || 'nogpu';
const D = new URL('./effects/', import.meta.url), SHOTS = new URL('./shots/', import.meta.url).pathname;
const s = await open(); await s.setWidth(390, 844, true);
const css = async (f) => `const st = document.createElement('style'); st.textContent = ${JSON.stringify(await readFile(new URL(f, D), 'utf8'))}; document.head.appendChild(st); return 1`;
const hash = async (p) => createHash('sha1').update(await readFile(p)).digest('hex').slice(0, 10);
const out = {};
for (const [id, injects] of [['bar-none', [await css('b0-sticky-solid.css')]], ['bar-b1', [await css('b0-sticky-solid.css'), await css('b1-frosted.css')]], ['bar-b2', [(await readFile(new URL('b2-svg-glass.js', D), 'utf8'))]]]) {
  await s.nav(BASE + '/'); await s.sleep(600);
  for (const i of injects) await s.ev(i);
  await s.ev(`scrollTo(0, 760); await new Promise((r) => setTimeout(r, 500)); return 1`);
  const p = `${SHOTS}visual-${id}-${LANE}.png`;
  // clip is in document coordinates: the sticky bar sits at the current scrollY, not at 0.
  const y = await s.ev(`return scrollY`);
  await s.shot(p, { clip: { x: 0, y, width: 390, height: 120, scale: 1 } });
  out[id] = await hash(p);
}
for (const [id, inject] of [['hero-none', null], ['hero-a2', await readFile(new URL('a2-shader.js', D), 'utf8')]]) {
  await s.nav(BASE + '/'); await s.sleep(600);
  const r = inject ? await s.ev(inject) : null;
  await s.sleep(800);
  const p = `${SHOTS}visual-${id}-${LANE}.png`;
  await s.shot(p, { clip: { x: 0, y: 109, width: 390, height: 420, scale: 0.5 } });
  out[id] = (await hash(p)) + (r ? ' ' + r : '');
}
await s.close();
console.log(LANE, JSON.stringify(out));
process.exit(0);
