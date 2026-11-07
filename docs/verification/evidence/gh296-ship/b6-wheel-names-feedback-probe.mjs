// gh#296 copy of the gh#295 B6 feedback probe: the phone legs are unchanged, and desktop legs at
// 1100x900, 1280x900 and 1440x900 (mobile:false) are added, now that the desktop page ships the
// two-track card from 1100px. The feedback set and every assertion are the original's.
//
// gh#295 B6 (feedback row only): after the reader enters names on /tool/wheel/ and presses the name
// panel's CTA, the feedback must be on screen. The panel sits below the disc, so the feedback is
// above it: the redrawn disc (#wheel-disc), the status note (#wheel-note, which carries text when
// fewer than 2 names arrived) and the now-enabled spin control (#wheel-spin). Each must sit fully
// inside the viewport once scrolling has settled.
//
// Tap legs drive the real CTA with a touch tap (seed through the trigger). The reduced-motion legs
// click in the same evaluate that reads scrollY: an instant scroll has already moved scrollY when
// click() returns, a smooth one has not, so one synchronous read tells the two branches apart. The
// normal-motion sync leg is the control that the read can see the smooth branch at all.
//
// underControlAfterScroll is RECORDED, not asserted: the interactive element (if any) now under the
// CTA tap point, where a second tap of a double-tap would land after an instant scroll.
//
// Run (driver.mjs attaches to an already-running Chrome; ports are per-run, see the runbook):
//   CDP_PORT=9334 PROBE_BASE=http://localhost:9344 PROBE_OUT=<result.json> node scripts/driver.mjs <this file>
// Red = the probe throws after writing PROBE_OUT, so driver.mjs exits 1.
import { writeFileSync } from 'node:fs';

const THREE = 'ก\\nข\\nค';
const ONE = 'ก';
const LEGS = [
  { name: '390x844 three names tap', w: 390, h: 844, names: THREE, how: 'tap', reduce: false },
  { name: '320x568 three names tap', w: 320, h: 568, names: THREE, how: 'tap', reduce: false },
  { name: '320x568 one name tap', w: 320, h: 568, names: ONE, how: 'tap', reduce: false },
  { name: '390x844 reduced motion sync', w: 390, h: 844, names: THREE, how: 'sync', reduce: true },
  { name: '320x568 reduced motion sync', w: 320, h: 568, names: THREE, how: 'sync', reduce: true },
  { name: '390x844 normal motion sync (control)', w: 390, h: 844, names: THREE, how: 'sync', reduce: false },
  { name: '1100x900 three names tap', w: 1100, h: 900, names: THREE, how: 'tap', reduce: false, mobile: false },
  { name: '1280x900 three names tap', w: 1280, h: 900, names: THREE, how: 'tap', reduce: false, mobile: false },
  { name: '1440x900 three names tap', w: 1440, h: 900, names: THREE, how: 'tap', reduce: false, mobile: false },
  { name: '1100x900 one name tap', w: 1100, h: 900, names: ONE, how: 'tap', reduce: false, mobile: false },
  { name: '1100x900 reduced motion sync', w: 1100, h: 900, names: THREE, how: 'sync', reduce: true, mobile: false },
  { name: '1280x900 reduced motion sync', w: 1280, h: 900, names: THREE, how: 'sync', reduce: true, mobile: false },
  { name: '1440x900 reduced motion sync', w: 1440, h: 900, names: THREE, how: 'sync', reduce: true, mobile: false },
  { name: '1280x900 normal motion sync (control)', w: 1280, h: 900, names: THREE, how: 'sync', reduce: false, mobile: false },
];
const FEEDBACK = ['wheel-disc', 'wheel-note', 'wheel-spin'];

const PREP = (names) => `
  const ta = document.getElementById('name-input');
  ta.value = '${names}';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  const b = document.getElementById('name-start');
  b.scrollIntoView({ block: 'end' });
  const r = b.getBoundingClientRect();
  window.__ctaPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return { ...window.__ctaPoint, scrollY, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches };
`;

const SETTLE = `
  let last = -1, same = 0;
  for (let i = 0; i < 40 && same < 3; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (scrollY === last) same++; else { same = 0; last = scrollY; }
  }
  return scrollY;
`;

const MEASURE = `
  const rect = (id) => { const q = document.getElementById(id).getBoundingClientRect(); return { top: q.top, bottom: q.bottom, height: q.height }; };
  const p = window.__ctaPoint;
  const under = document.elementFromPoint(p.x, p.y);
  const ctl = under && under.closest('a,button,input,label,textarea,select');
  return {
    innerWidth, innerHeight, scrollY,
    chips: document.querySelectorAll('#wheel-names li').length,
    noteLen: document.getElementById('wheel-note').textContent.trim().length,
    spinDisabled: document.getElementById('wheel-spin').disabled,
    rects: Object.fromEntries(${JSON.stringify(FEEDBACK)}.map((id) => [id, rect(id)])),
    underControlAfterScroll: ctl ? ctl.tagName.toLowerCase() + (ctl.id ? '#' + ctl.id : '') + ' ' + (ctl.textContent || '').trim().slice(0, 40) : null,
  };
`;

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:9344';
  const url = `${base}/tool/wheel/`;
  const legs = [];
  const fails = [];
  for (const leg of LEGS) {
    await session.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: leg.reduce ? 'reduce' : 'no-preference' }],
    });
    await session.setWidth(leg.w, leg.h, leg.mobile ?? true);
    await session.nav(url);
    await session.wipe();
    await session.nav(url);
    const prep = await session.evaluate(PREP(leg.names));
    if (prep.error) throw new Error(`${leg.name}: ${prep.error}`);
    const out = { ...leg, before: prep.value };
    if (prep.value.reduce !== leg.reduce) fails.push(`${leg.name}: reduced-motion emulation did not take (matches=${prep.value.reduce})`);

    if (leg.how === 'tap') {
      await session.tap(prep.value.x, prep.value.y);
    } else {
      const sync = await session.evaluate(`const y0 = scrollY; document.getElementById('name-start').click(); return { y0, y1: scrollY };`);
      out.sync = sync.value;
    }
    out.settledScrollY = (await session.evaluate(SETTLE)).value;
    const m = await session.evaluate(MEASURE);
    if (m.error) throw new Error(`${leg.name}: ${m.error}`);
    out.after = m.value;
    legs.push(out);

    const a = m.value;
    if (a.innerWidth !== leg.w || a.innerHeight !== leg.h) fails.push(`${leg.name}: viewport ${a.innerWidth}x${a.innerHeight}, run void`);
    // Preconditions: the names actually arrived, so there is feedback to look for.
    const want = leg.names.split('\\n').length;
    if (a.chips !== want) fails.push(`${leg.name}: ${a.chips} chips, expected ${want}`);
    if (want >= 2 && a.spinDisabled) fails.push(`${leg.name}: spin still disabled after names-in`);
    if (want < 2 && a.noteLen === 0) fails.push(`${leg.name}: note empty with one name`);
    // Measured at 320x568: scrollY settles on a whole number (425) while the disc sits at a fractional
    // document offset, so its top reads -0.42 after a scroll aligned to it. Inferred, not proven: the
    // offset is rounded to the nearest pixel, which bounds the miss at half a pixel. The unfixed page
    // misses by hundreds of pixels, so the tolerance does not blur the verdict.
    const SNAP = 0.5;
    for (const id of FEEDBACK) {
      const r = a.rects[id];
      if (r.top < -SNAP || r.bottom > a.innerHeight + SNAP) fails.push(`${leg.name}: #${id} top ${r.top} bottom ${r.bottom} outside 0..${a.innerHeight}`);
    }
    if (leg.how === 'sync') {
      const moved = out.sync.y1 !== out.sync.y0;
      // Reduced motion must be instant; the normal-motion control must not be.
      if (leg.reduce && !moved) fails.push(`${leg.name}: scroll not instant under reduced motion (${out.sync.y0} -> ${out.sync.y1} synchronously)`);
      if (!leg.reduce && moved) fails.push(`${leg.name}: control moved synchronously, so the sync read cannot tell smooth from instant`);
    }
  }
  await session.cdp('Emulation.setEmulatedMedia', { features: [] });

  const result = { probe: 'gh296-b6-wheel-names-feedback', base, n: legs.length, pass: fails.length === 0, fails, legs };
  if (process.env.PROBE_OUT) writeFileSync(process.env.PROBE_OUT, JSON.stringify(result, null, 2) + '\n');
  if (fails.length) throw new Error(`B6 red (${fails.length}): ${fails.join(' | ')}`);
  return result;
}
