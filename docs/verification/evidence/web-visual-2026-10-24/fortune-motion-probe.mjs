// gh#288 Phase 0 — what moves on the three fortune pages, sampled through the whole interaction. The
// state probe sampled getAnimations() 150ms after the last press, while these results arrive 2.6-3.2s
// later, and an animation whose class is dropped on animationend leaves no trace in a final-state read.
// So this polls every 100ms from each press until 4s after it, and keeps every animation it ever saw.
// Must-green: siamsi's shake must show motion while the hold button is pressed (ADR-0046 names its
// devicemotion-driven transform), or the poll cannot see this page's motion at all.
//   CDP_PORT=9310 RM=0|1 OUT=<json> node <this file>
import { open } from './cdp-lib.mjs';
import { writeFile } from 'node:fs/promises';
const BASE = process.env.BASE || 'http://localhost:4410', RM = process.env.RM === '1';
const s = await open();
await s.setWidth(390, 844, true);
await s.reducedMotion(RM);
const center = (sel) => s.ev(`const e = ${sel}; if (!e) return null; e.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 200)); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, disabled: !!e.disabled };`);
const q = (id) => `document.querySelector(${JSON.stringify(id)})`;
const byText = (t) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(t)} && b.getBoundingClientRect().width > 0)`;
// Installs an in-page sampler that records every animation and every inline transform/opacity write.
const SAMPLER = `
  window.__seen = new Map(); window.__styleWrites = 0;
  const lab = (t) => t ? (t.id ? '#' + t.id : (t.tagName || '?').toLowerCase() + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(' ')[0]) : '?';
  window.__tick = setInterval(() => { for (const a of document.getAnimations()) { const k = a.constructor.name + ' ' + (a.animationName || a.transitionProperty || 'web-animation') + ' @' + lab(a.effect?.target) + (a.effect?.pseudoElement || ''); const d = Math.round(a.effect?.getTiming?.().duration || 0); if (!window.__seen.has(k)) window.__seen.set(k, { durMs: d, firstAtMs: Math.round(performance.now() - window.__t0) }); } }, 100);
  new MutationObserver((ms) => { for (const m of ms) if (m.attributeName === 'style' && /transform|opacity|translate|rotate/.test(m.target.getAttribute('style') || '')) window.__styleWrites++; }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });
  window.__t0 = performance.now(); return 1;
`;
const READ = `return { seen: [...window.__seen].map(([k, v]) => k + ' ' + v.durMs + 'ms @+' + v.firstAtMs + 'ms'), inlineMotionStyleWrites: window.__styleWrites };`;
async function press(sel, hold = 0) {
  for (let i = 0; i < 40; i++) { const c = await center(sel); if (c && !c.disabled) break; await s.sleep(100); }
  await s.sleep(300);
  const c = await center(sel);
  await s.mouse('mouseMoved', c.x, c.y); await s.mouse('mousePressed', c.x, c.y, 1);
  if (hold) await s.sleep(hold);
  await s.mouse('mouseReleased', c.x, c.y);
}
const out = { reducedMotion: RM, bangkok: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' }).format(new Date()), steps: {} };
async function step(id, fn) { await s.ev(SAMPLER); await fn(); await s.sleep(4000); out.steps[id] = await s.ev(READ); await s.ev(`clearInterval(window.__tick); return 1`); }
const fresh = async (p) => { await s.nav(BASE + p); await s.ev(`localStorage.clear(); sessionStorage.clear(); return 1`); await s.nav(BASE + p); await s.sleep(600); };
await fresh('/game/siamsi/');
await step('siamsi-1-pick-chip-and-intent', async () => { await press(byText('ความรัก')); await s.sleep(500); await press(q('#ss-intent-done')); });
await step('siamsi-2-hold-to-shake', async () => { await press(q('#ss-hold'), 2500); });
await step('siamsi-3-open-slip', async () => { await press(q('#ss-open-slip')); });
await fresh('/game/daily-fortune/');
await step('daily-fortune-go', async () => { await press(q('#df-go')); });
await fresh('/game/love-match/');
await step('love-match-go', async () => { await press(q('#lm-me-m')); await s.sleep(300); await press(q('#lm-band-1')); await s.sleep(300); await press(q('#lm-want-f')); await s.sleep(300); await press(q('#lm-go')); });
out.events = s.events;
await s.close();
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
