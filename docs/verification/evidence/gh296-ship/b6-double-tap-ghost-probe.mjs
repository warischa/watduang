// gh#296 copy of the gh#295 double-tap ghost probe: the phone legs are unchanged, and desktop legs at
// 1100x900, 1280x900 and 1440x900 (mobile:false), both motion settings, are added now that the desktop
// page ships the two-track card from 1100px. Every assertion and the control are the original's.
//
// gh#295 B6 follow-on: the names-in scroll moves the page under the finger, so the second contact of
// one physical double-tap on the name panel's CTA lands on whatever the scroll brought there. Measured
// first at 320x568: the eliminate checkbox label. A ghost there ticks a setting nobody chose.
//
// Each leg places the CTA on screen so that, once the scroll settles, the CTA tap point sits over the
// eliminate checkbox label (the geometry is read off the page, never typed in), then fires a real
// touch double-tap: two touchStart/touchEnd pairs GAP_MS apart at that one point. Pass = the ghost
// changed nothing: checkbox unticked, no spin started, result line empty.
//
// Control (every leg): after the page has been quiet well past the arm window, a deliberate touch tap
// on the same checkbox label must still tick it, so a gate that simply kills the checkbox fails here.
//
// Run (driver.mjs attaches to an already-running Chrome; ports are per-run, see the runbook):
//   CDP_PORT=9334 PROBE_BASE=http://localhost:9344 PROBE_OUT=<result.json> node scripts/driver.mjs <this file>
// Red = the probe throws after writing PROBE_OUT, so driver.mjs exits 1.
import { writeFileSync } from 'node:fs';

const GAP_MS = 120;
const LEGS = [
  { w: 320, h: 568, reduce: true },
  { w: 390, h: 844, reduce: true },
  { w: 320, h: 568, reduce: false },
  { w: 390, h: 844, reduce: false },
  { w: 1100, h: 900, reduce: true, mobile: false },
  { w: 1280, h: 900, reduce: true, mobile: false },
  { w: 1440, h: 900, reduce: true, mobile: false },
  { w: 1100, h: 900, reduce: false, mobile: false },
  { w: 1280, h: 900, reduce: false, mobile: false },
  { w: 1440, h: 900, reduce: false, mobile: false },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Before the tap: where the CTA, the checkbox label and the disc sit in the document. The label sits
// above the chip list, so the chips the start event adds do not move it; the CTA moves down after the
// tap, which does not matter because the finger is already down.
const GEOMETRY = `
  const ta = document.getElementById('name-input');
  ta.value = 'ก\\nข\\nค';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  window.scrollTo(0, 0);
  const doc = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right }; };
  return {
    cta: doc(document.getElementById('name-start')),
    label: doc(document.querySelector('label[for="wheel-eliminate"]')),
    disc: doc(document.getElementById('wheel-disc')),
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
`;

const STATE = `
  const p = window.__tapPoint;
  const under = document.elementFromPoint(p.x, p.y);
  const ctl = under && under.closest('a,button,input,label,textarea,select');
  return {
    scrollY,
    eliminateChecked: document.getElementById('wheel-eliminate').checked,
    eliminateDisabled: document.getElementById('wheel-eliminate').disabled,
    note: document.getElementById('wheel-note').textContent.trim(),
    result: document.getElementById('wheel-result').textContent.trim(),
    rotation: document.getElementById('wheel-group').style.transform,
    chips: document.querySelectorAll('#wheel-names li').length,
    underPoint: ctl ? ctl.tagName.toLowerCase() + (ctl.id ? '#' + ctl.id : '') + (ctl.htmlFor ? '[for=' + ctl.htmlFor + ']' : '') : (under ? under.tagName.toLowerCase() + (under.id ? '#' + under.id : '') : null),
    active: document.activeElement ? document.activeElement.tagName.toLowerCase() + (document.activeElement.id ? '#' + document.activeElement.id : '') : null,
  };
`;

const SETTLE = `
  let last = -1, same = 0;
  for (let i = 0; i < 40 && same < 3; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (scrollY === last) same++; else { same = 0; last = scrollY; }
  }
  return scrollY;
`;

async function touch(session, x, y) {
  await session.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await session.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:9344';
  const url = `${base}/tool/wheel/`;
  const legs = [];
  const fails = [];
  for (const leg of LEGS) {
    const name = `${leg.w}x${leg.h} ${leg.reduce ? 'reduced' : 'normal'} motion`;
    await session.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: leg.reduce ? 'reduce' : 'no-preference' }],
    });
    await session.setWidth(leg.w, leg.h, leg.mobile ?? true);
    await session.nav(url);
    await session.wipe();
    await session.nav(url);
    const g = (await session.evaluate(GEOMETRY)).value;
    if (g.reduce !== leg.reduce) fails.push(`${name}: reduced-motion emulation did not take`);

    // After a 'nearest' scroll from below, the disc top meets the viewport top: scrollY ends at the
    // disc top. Pick the pre-tap scroll that maps the CTA tap point onto the label centre afterwards.
    const labelY = (g.label.top + g.label.bottom) / 2;
    const ctaY = (g.cta.top + g.cta.bottom) / 2;
    const before = Math.round(ctaY - labelY + g.disc.top);
    const x = Math.round(Math.max(g.cta.left, g.label.left) + 12);
    const y = Math.round(ctaY - before);
    const out = { name, ...leg, geometry: g, scrollBefore: before, tapPoint: { x, y } };
    if (y < 10 || y > leg.h - 10 || x > Math.min(g.cta.right, g.label.right)) {
      fails.push(`${name}: no CTA position maps the tap point onto the label (y ${y}, x ${x}), run void`);
      legs.push(out);
      continue;
    }
    await session.evaluate(`window.scrollTo(0, ${before}); window.__tapPoint = { x: ${x}, y: ${y} }; return scrollY;`);
    out.preTap = (await session.evaluate(STATE)).value;

    await touch(session, x, y);
    await sleep(GAP_MS);
    await touch(session, x, y);
    await session.evaluate(SETTLE);
    out.afterDoubleTap = (await session.evaluate(STATE)).value;
    const a = out.afterDoubleTap;

    if (out.preTap.underPoint !== 'button#name-start') fails.push(`${name}: first contact not on the CTA (${out.preTap.underPoint}), run void`);
    if (a.chips !== 3) fails.push(`${name}: names did not arrive (${a.chips} chips), run void`);
    if (a.eliminateChecked) fails.push(`${name}: ghost contact ticked the eliminate checkbox`);
    if (a.result) fails.push(`${name}: ghost contact produced a result "${a.result}"`);
    if (a.rotation && a.rotation !== 'none') fails.push(`${name}: ghost contact started a spin (${a.rotation})`);
    // Mid-scroll the ghost can land on the name textarea instead (measured at 390x844, normal motion):
    // on a phone that focus raises the keyboard and scrolls the field back, hiding the feedback again.
    if (a.active === 'textarea#name-input') fails.push(`${name}: ghost contact focused the name textarea`);

    // Control: quiet past the window, then one deliberate tap on the label.
    await sleep(1000);
    const was = (await session.evaluate(`return document.getElementById('wheel-eliminate').checked;`)).value;
    const lr = (await session.evaluate(`const r = document.querySelector('label[for="wheel-eliminate"]').getBoundingClientRect(); return { x: r.left + 12, y: (r.top + r.bottom) / 2 };`)).value;
    await touch(session, lr.x, lr.y);
    await sleep(300);
    const now = (await session.evaluate(`return document.getElementById('wheel-eliminate').checked;`)).value;
    out.control = { was, now, at: lr };
    if (now === was) fails.push(`${name}: control: a deliberate tap after the window did not toggle the checkbox`);
    legs.push(out);
  }
  await session.cdp('Emulation.setEmulatedMedia', { features: [] });

  const result = { probe: 'gh296-b6-double-tap-ghost', base, gapMs: GAP_MS, n: legs.length, pass: fails.length === 0, fails, legs };
  if (process.env.PROBE_OUT) writeFileSync(process.env.PROBE_OUT, JSON.stringify(result, null, 2) + '\n');
  if (fails.length) throw new Error(`ghost red (${fails.length}): ${fails.join(' | ')}`);
  return result;
}
