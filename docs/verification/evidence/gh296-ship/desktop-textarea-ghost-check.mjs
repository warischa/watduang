// gh#296 follow-on to the copied B6 probes: on the desktop card the names-in scroll brings the name
// textarea under the CTA tap point (b6-after.json records underControlAfterScroll =
// textarea#name-input on every desktop leg; the base build recorded null). This drives a real touch
// double-tap at the CTA's natural position (scrolled into view, block end, as B6 places it) and
// asserts the ghost contact did not focus the textarea, tick the checkbox, or start a spin.
// Control: quiet past the arm window, a deliberate tap at the same point must focus the textarea.
//
// Run: CDP_PORT=9381 PROBE_BASE=http://localhost:4402 PROBE_OUT=<result.json> node scripts/driver.mjs <this file>
import { writeFileSync } from 'node:fs';

const GAP_MS = 120;
const LEGS = [1100, 1280, 1440].flatMap((w) => [true, false].map((reduce) => ({ w, h: 900, reduce })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATE = `
  const p = window.__pt; const under = document.elementFromPoint(p.x, p.y);
  return { scrollY, under: under ? under.tagName.toLowerCase() + (under.id ? '#' + under.id : '') : null,
    active: document.activeElement ? document.activeElement.tagName.toLowerCase() + (document.activeElement.id ? '#' + document.activeElement.id : '') : null,
    elim: document.getElementById('wheel-eliminate').checked, result: document.getElementById('wheel-result').textContent.trim(),
    rotation: document.getElementById('wheel-group').style.transform, chips: document.querySelectorAll('#wheel-names li').length };
`;
async function touch(s, x, y) {
  await s.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await s.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4402';
  const url = `${base}/tool/wheel/`;
  const legs = [], fails = [];
  for (const leg of LEGS) {
    const name = `${leg.w}x${leg.h} ${leg.reduce ? 'reduced' : 'normal'} motion`;
    await session.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: leg.reduce ? 'reduce' : 'no-preference' }] });
    await session.setWidth(leg.w, leg.h, false);
    await session.nav(url); await session.wipe(); await session.nav(url);
    const p = (await session.evaluate(`
      const ta = document.getElementById('name-input'); ta.value = 'ก\\nข\\nค'; ta.dispatchEvent(new Event('input', { bubbles: true }));
      const b = document.getElementById('name-start'); b.scrollIntoView({ block: 'end' });
      const r = b.getBoundingClientRect(); window.__pt = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; return window.__pt;`)).value;
    const pre = (await session.evaluate(STATE)).value;
    await touch(session, p.x, p.y); await sleep(GAP_MS); await touch(session, p.x, p.y);
    await session.evaluate(`let l=-1,s=0; for (let i=0;i<40&&s<3;i++){ await new Promise(r=>setTimeout(r,100)); if (scrollY===l) s++; else { s=0; l=scrollY; } } return scrollY;`);
    const after = (await session.evaluate(STATE)).value;
    await sleep(1000);
    await touch(session, p.x, p.y); await sleep(300);
    const control = (await session.evaluate(STATE)).value;
    legs.push({ name, point: p, pre, after, control });
    if (pre.under !== 'button#name-start') fails.push(`${name}: first contact not on the CTA (${pre.under}), run void`);
    if (after.chips !== 3) fails.push(`${name}: names did not arrive, run void`);
    if (after.under !== 'textarea#name-input') fails.push(`${name}: textarea not under the point after the scroll (${after.under}), leg measures nothing`);
    if (after.active === 'textarea#name-input') fails.push(`${name}: ghost contact focused the name textarea`);
    if (after.elim) fails.push(`${name}: ghost ticked the checkbox`);
    if (after.result || (after.rotation && after.rotation !== 'none')) fails.push(`${name}: ghost started a spin`);
    if (control.active !== 'textarea#name-input') fails.push(`${name}: control: a deliberate tap after the window did not focus the textarea (${control.active})`);
  }
  await session.cdp('Emulation.setEmulatedMedia', { features: [] });
  const out = { probe: 'gh296-desktop-textarea-ghost', base, gapMs: GAP_MS, pass: fails.length === 0, fails, legs };
  if (process.env.PROBE_OUT) writeFileSync(process.env.PROBE_OUT, JSON.stringify(out, null, 2) + '\n');
  if (fails.length) throw new Error(`textarea ghost red (${fails.length}): ${fails.join(' | ')}`);
  return { pass: true, legs: legs.map((l) => `${l.name}: after ${l.after.under} active ${l.after.active}; control ${l.control.active}`) };
}
