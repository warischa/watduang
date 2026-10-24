// gh#288 Phase 0 — drill-downs the other probes point at: (1) disabled vs enabled look of each go
// button, read on the same element before and after names are entered; (2) the wheel hub label's
// painted fill (the audit's contrast detector reads CSS color, gh#262 "detector limit" row); (3) a
// crop of Chrome's UA focus ring on the tool band, to judge the paint the computed outline-color
// cannot describe; (4) the hover colour --color-primary against the grounds it sits on.
//   CDP_PORT=9310 OUT=<json> SHOTS=<dir> node <this file>
import { open } from './cdp-lib.mjs';
import { writeFile } from 'node:fs/promises';
const BASE = process.env.BASE || 'http://localhost:4410', SHOTS = process.env.SHOTS;
const s = await open();
await s.setWidth(390, 844, true);
const out = { buttons: {} };
const look = (sel) => s.ev(`const e = document.querySelector(${JSON.stringify(sel)}); const cs = getComputedStyle(e); return { disabled: e.disabled, bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, opacity: cs.opacity, cursor: cs.cursor, shadow: cs.boxShadow.slice(0, 60), filter: cs.filter };`);
const center = (sel) => s.ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 200)); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };`);
for (const [path, btn] of [['/tool/wheel/', '#wheel-spin'], ['/tool/draw/', '#draw-go'], ['/tool/team/', '#team-split']]) {
  await s.nav(BASE + path); await s.sleep(800);
  const before = await look(btn);
  const c = await center('#name-input'); await s.click(c.x, c.y); await s.type('ต้น\nแบม\nโอ๊ต'); await s.sleep(200);
  const st = await center('#name-start'); await s.sleep(400); await s.click(st.x, st.y); await s.sleep(900);
  out.buttons[path + btn] = { before, after: await look(btn) };
  if (path === '/tool/wheel/') out.buttons['/tool/wheel/#wheel-disc'] = { after: await look('#wheel-disc') };
}
await s.nav(BASE + '/game/love-match/'); await s.sleep(900);
const lmBefore = await look('#lm-go');
for (const id of ['#lm-me-m', '#lm-band-1', '#lm-want-f']) { const c = await center(id); await s.sleep(400); await s.click(c.x, c.y); await s.sleep(400); }
out.buttons['/game/love-match/#lm-go'] = { before: lmBefore, after: await look('#lm-go') };
// (2) wheel hub label: what paints it
await s.nav(BASE + '/tool/wheel/'); await s.sleep(800);
out.wheelHub = await s.ev(`const t = [...document.querySelectorAll('#wheel-disc text, svg text')].find((x) => x.textContent.trim() === 'หมุน'); if (!t) return null; const cs = getComputedStyle(t); const circ = t.parentElement.querySelector('circle'); return { fillComputed: cs.fill, colorComputed: cs.color, fillAttr: t.getAttribute('fill'), circleFill: circ ? getComputedStyle(circ).fill : null };`);
// (3) UA focus ring on the blue band: Tab to the band's first link, crop around it
await s.nav(BASE + '/tool/draw/'); await s.sleep(800);
let hit = null;
for (let i = 0; i < 12 && !hit; i++) { await s.tab(); await s.sleep(60); hit = await s.ev(`const a = document.activeElement; const band = a.closest('.tool-band, .band, header'); const bg = band ? getComputedStyle(band).backgroundColor : null; if (bg !== 'rgb(43, 123, 255)') return null; const r = a.getBoundingClientRect(); return { el: a.tagName + ' ' + a.textContent.trim().slice(0, 20), bg, x: r.x, y: r.y, w: r.width, h: r.height, outline: getComputedStyle(a).outline };`); }
out.focusOnBand = hit;
if (hit && SHOTS) await s.shot(`${SHOTS}/focus-ua-ring-on-band-390.png`, { clip: { x: Math.max(0, hit.x - 12), y: Math.max(0, hit.y - 12), width: Math.min(390, hit.w + 24), height: hit.h + 24, scale: 3 } });
// first band-free focus stop as a comparison crop (cream ground)
await s.nav(BASE + '/tool/draw/'); await s.sleep(800); await s.tab(); await s.sleep(60);
const first = await s.ev(`const a = document.activeElement; const r = a.getBoundingClientRect(); return { el: a.tagName + ' ' + a.textContent.trim().slice(0, 20), x: r.x, y: r.y, w: r.width, h: r.height };`);
if (SHOTS) await s.shot(`${SHOTS}/focus-ua-ring-on-cream-390.png`, { clip: { x: Math.max(0, first.x - 12), y: Math.max(0, first.y - 12), width: Math.min(390, first.w + 24), height: first.h + 24, scale: 3 } });
out.focusOnCream = first;
// (4) --color-primary contrast against cream and white
out.primaryContrast = await s.ev(`const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }; const r = (a, b) => +((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)).toFixed(2); return { onCream: r('#d6336c', '#fff6e0'), onWhite: r('#d6336c', '#ffffff'), inkOnCream: r('#14142b', '#fff6e0'), control_inkOnWhite: r('#000000', '#ffffff') };`);
out.events = s.events;
await s.close();
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
