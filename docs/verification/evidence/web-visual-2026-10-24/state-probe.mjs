// gh#288 Phase 0 — post-interaction states, the gap the gh#262 audit listed first under "Not covered".
// Drives the control a player touches (real Input.* events, Input.insertText for names), never the
// app's own events. After each state is reached it runs the same AUDIT block as ./audit-probe.mjs plus
// EXTRAS2, samples document.getAnimations() 150ms after the press (what moved), and screenshots the
// viewport. Read-only: it changes no file, and storage is per-profile (fresh --user-data-dir).
//
//   CDP_PORT=9310 W=390 H=844 MOBILE=1 RM=0 OUT=<json> SHOTS=<dir> node <this file>
import { open } from './cdp-lib.mjs';
import { AUDIT, EXTRAS2 } from './audit-probe.mjs';
import { writeFile } from 'node:fs/promises';

const BASE = process.env.BASE || 'http://localhost:4410';
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);
const MOBILE = process.env.MOBILE ? process.env.MOBILE === '1' : W < 640;
const RM = process.env.RM === '1';
const SHOTS = process.env.SHOTS || null;
const NAMES = 'ต้น\nแบม\nโอ๊ต\nมิว\nปุ้ย\nเจ';

const s = await open();
await s.setWidth(W, H, MOBILE);
await s.reducedMotion(RM);

const center = (sel) => s.ev(`const e = ${sel}; if (!e) return null; e.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 300)); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, disabled: !!e.disabled };`);
const q = (id) => `document.querySelector(${JSON.stringify(id)})`;
const byText = (t) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(t)} && b.getBoundingClientRect().width > 0)`;
// Waits until the control is enabled (the arm window, ADR-0057), then 300ms more, then presses it.
async function press(sel, { hold = 0 } = {}) {
  for (let i = 0; i < 40; i++) { const c = await center(sel); if (c && !c.disabled) break; await s.sleep(100); }
  await s.sleep(300);
  const c = await center(sel);
  if (!c) throw new Error('not found: ' + sel);
  const t0 = Date.now();
  await s.mouse('mouseMoved', c.x, c.y); await s.mouse('mousePressed', c.x, c.y, 1);
  if (hold) await s.sleep(hold);
  await s.mouse('mouseReleased', c.x, c.y);
  return t0;
}
const moved = () => s.ev(`return [...new Set(document.getAnimations().map((a) => a.constructor.name + ':' + (a.animationName || a.transitionProperty || 'js') + '@' + (a.effect?.target?.id || a.effect?.target?.className?.toString?.().split(' ')[0] || a.effect?.target?.tagName || '?')))];`);
async function waitText(sel, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const n = await s.ev(`return (${sel}?.textContent || '').trim().length`); if (n > 0) return Date.now() - t0; await s.sleep(100); }
  return null;
}
async function names(label) {
  const c = await center(q('#name-input'));
  await s.click(c.x, c.y); await s.type(NAMES); await s.sleep(200);
  await press(byText(label));
  await s.sleep(800);
}

const STATES = [
  { id: 'wheel-result', shot: '#wheel-result', path: '/tool/wheel/', run: async () => { await names('ใส่ชื่อลงวงล้อ'); const t0 = await press(q('#wheel-spin')); await s.sleep(150); const m = await moved(); const ms = await waitText(q('#wheel-result')); return { moved: m, msToResult: ms === null ? null : Date.now() - t0 - 0 }; } },
  { id: 'draw-result', shot: '#draw-result', path: '/tool/draw/', run: async () => { await names('ใส่ชื่อลงกล่อง'); const t0 = await press(q('#draw-go')); await s.sleep(150); const m = await moved(); const ms = await waitText(q('#draw-result')); return { moved: m, msToResult: ms === null ? null : Date.now() - t0 }; } },
  { id: 'team-result', shot: '#team-result', path: '/tool/team/', run: async () => { await names('ใส่ชื่อลงสนาม'); const t0 = await press(q('#team-split')); await s.sleep(150); const m = await moved(); const ms = await waitText(q('#team-result')); return { moved: m, msToResult: ms === null ? null : Date.now() - t0 }; } },
  { id: 'number-result', shot: '#number-result', path: '/tool/number/', run: async () => { const t0 = await press(q('#number-go')); await s.sleep(150); const m = await moved(); const ms = await waitText(q('#number-result')); return { moved: m, msToResult: ms === null ? null : Date.now() - t0 }; } },
  { id: 'siamsi-slip', shot: '#stage', path: '/game/siamsi/', run: async () => { await press(byText('ความรัก')); await s.sleep(600); await press(q('#ss-intent-done')); await s.sleep(1200); await press(q('#ss-hold'), { hold: 2500 }); await s.sleep(1500); const t0 = await press(q('#ss-open-slip')); await s.sleep(150); const m = await moved(); await s.sleep(2500); return { moved: m, msToResult: Date.now() - t0, stage: await s.ev(`return document.querySelector('#stage').textContent.trim().replace(/\\s+/g, ' ').slice(0, 120)`) }; } },
  { id: 'daily-fortune-result', shot: '#stage', path: '/game/daily-fortune/', run: async () => { const t0 = await press(q('#df-go')); await s.sleep(150); const m = await moved(); await s.sleep(2500); return { moved: m, msToResult: Date.now() - t0, stage: await s.ev(`return document.querySelector('#stage').textContent.trim().replace(/\\s+/g, ' ').slice(0, 120)`) }; } },
  { id: 'love-match-result', shot: '#stage', path: '/game/love-match/', run: async () => { await press(q('#lm-me-m')); await s.sleep(400); await press(q('#lm-band-1')); await s.sleep(400); await press(q('#lm-want-f')); await s.sleep(400); const t0 = await press(q('#lm-go')); await s.sleep(150); const m = await moved(); await s.sleep(3000); return { moved: m, msToResult: Date.now() - t0, stage: await s.ev(`return document.querySelector('#stage').textContent.trim().replace(/\\s+/g, ' ').slice(0, 120)`) }; } },
];

const bangkokDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' }).format(new Date());
const out = { width: W, height: H, mobile: MOBILE, reducedMotion: RM, bangkokAtStart: bangkokDay, states: [] };
for (const st of STATES) {
  await s.nav(BASE + st.path);
  await s.ev(`localStorage.clear(); sessionStorage.clear(); return 1`);
  await s.nav(BASE + st.path);
  let drive;
  try { drive = await st.run(); } catch (e) { drive = { error: String(e).slice(0, 200) }; }
  if (SHOTS) {
    await s.ev(`const e = document.querySelector(${JSON.stringify(st.shot)}); e.scrollIntoView({ block: ${JSON.stringify(st.shot === '#stage' ? 'start' : 'center')} }); await new Promise((r) => setTimeout(r, 300)); return 1`);
    await s.shot(`${SHOTS}/state-${st.id}-${W}${RM ? '-rm' : ''}.jpg`, { format: 'jpeg', quality: 70 });
  }
  const audit = await s.ev(AUDIT);
  const x2 = await s.ev(EXTRAS2);
  out.states.push({ id: st.id, path: st.path, drive, audit, extras2: x2 });
}
out.bangkokAtEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' }).format(new Date());
out.consoleErrors = s.events;
await s.close();
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.states.map((x) => ({ id: x.id, err: x.drive?.error ?? x.audit?.__error ?? null, ms: x.drive?.msToResult, moved: x.drive?.moved?.length, cf: x.audit?.contrastFails?.length }))), out.bangkokAtStart, out.bangkokAtEnd, 'events=' + s.events.length);
process.exit(0);
