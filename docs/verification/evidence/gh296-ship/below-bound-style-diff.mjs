// gh#296 bound proof: below the 1100px desktop bound, /tool/wheel/ must be computed-style identical
// to the base build. Dumps a fixed property list (plus the box rect and the ::before/::after content)
// for every element under <main> on two servers and diffs them, element by element.
// Elements are keyed by tag#id.classes plus their index among same-key elements, so an added or
// moved element shows up as one row, not a cascade.
//
// Run (driver.mjs attaches to an already-running Chrome; ports are per-run, see the runbook):
//   CDP_PORT=9381 BASE_A=http://localhost:4401 BASE_B=http://localhost:4402 PROBE_OUT=<result.json> \
//     node scripts/driver.mjs <this file>
// Red = any diff at any viewport: the probe throws after writing PROBE_OUT.
import { writeFileSync } from 'node:fs';

const VIEWPORTS = [
  { w: 320, h: 568, mobile: true },
  { w: 390, h: 844, mobile: true },
  { w: 768, h: 1024, mobile: true },
  { w: 1099, h: 900, mobile: false },
];
const PROPS = [
  'display', 'position', 'box-sizing', 'width', 'height', 'min-height', 'max-width',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'box-shadow', 'background-color', 'color',
  'font-size', 'font-family', 'font-weight', 'line-height',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-basis', 'gap', 'align-items', 'align-self', 'justify-self',
  'grid-template-columns', 'grid-template-rows', 'grid-row-start', 'grid-row-end', 'grid-column-start', 'grid-column-end',
  'transform', 'visibility', 'overflow-y',
];

const DUMP = `
  const props = ${JSON.stringify(PROPS)};
  const seen = {};
  const out = {};
  for (const el of [document.querySelector('main'), ...document.querySelectorAll('main *')]) {
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
    const sig = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls.trim().split(/\\s+/).sort().join('.') : '');
    const n = (seen[sig] = (seen[sig] || 0) + 1);
    const cs = getComputedStyle(el);
    const row = {};
    for (const p of props) row[p] = cs.getPropertyValue(p);
    const r = el.getBoundingClientRect();
    row.rect = [r.left, r.top + scrollY, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(',');
    row.before = getComputedStyle(el, '::before').content;
    row.after = getComputedStyle(el, '::after').content;
    out[sig + '[' + n + ']'] = row;
  }
  return { innerWidth, innerHeight, n: Object.keys(out).length, out };
`;

export default async function (session) {
  const A = process.env.BASE_A, B = process.env.BASE_B;
  if (!A || !B) throw new Error('BASE_A and BASE_B are required');
  await session.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const legs = [];
  const fails = [];
  for (const vp of VIEWPORTS) {
    const dumps = {};
    for (const [label, base] of [['A', A], ['B', B]]) {
      await session.setWidth(vp.w, vp.h, vp.mobile);
      await session.nav(`${base}/tool/wheel/`);
      await session.wipe();
      await session.nav(`${base}/tool/wheel/`);
      await session.evaluate('await document.fonts.ready; return true;');
      const d = await session.evaluate(DUMP);
      if (d.error) throw new Error(`${label}@${vp.w}: ${d.error}`);
      if (d.value.innerWidth !== vp.w) fails.push(`${label}@${vp.w}: innerWidth ${d.value.innerWidth}, run void`);
      dumps[label] = d.value;
    }
    const diffs = [];
    const keys = new Set([...Object.keys(dumps.A.out), ...Object.keys(dumps.B.out)]);
    for (const k of keys) {
      const a = dumps.A.out[k], b = dumps.B.out[k];
      if (!a || !b) { diffs.push({ el: k, only: a ? 'A' : 'B' }); continue; }
      for (const p of Object.keys(a)) if (a[p] !== b[p]) diffs.push({ el: k, prop: p, A: a[p], B: b[p] });
    }
    legs.push({ viewport: `${vp.w}x${vp.h}`, mobile: vp.mobile, elementsA: dumps.A.n, elementsB: dumps.B.n, propsPerElement: PROPS.length + 3, diffCount: diffs.length, diffs: diffs.slice(0, 40) });
    if (diffs.length) fails.push(`${vp.w}x${vp.h}: ${diffs.length} diffs`);
  }
  await session.cdp('Emulation.setEmulatedMedia', { features: [] });
  const result = { probe: 'gh296-below-bound-style-diff', A, B, pass: fails.length === 0, fails, legs };
  if (process.env.PROBE_OUT) writeFileSync(process.env.PROBE_OUT, JSON.stringify(result, null, 2) + '\n');
  if (fails.length) throw new Error(`bound red (${fails.length}): ${fails.join(' | ')}`);
  return { pass: true, legs: legs.map((l) => `${l.viewport} ${l.elementsA}/${l.elementsB} diffs=${l.diffCount}`) };
}
