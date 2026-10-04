// gh#254 evidence: no link's grown hit box overlaps another interactive element's box (a, button,
// input, select, summary), so the extra vertical padding cannot steal a tap from a neighbour.
//
//   BASE=http://localhost:4371 CDP_PORT=9371 node scripts/driver.mjs docs/verification/evidence/gh254/overlap.mjs
//
// Prints per width and page the number of overlapping pairs (intersection wider and taller than
// 0.5px; a link and its own descendants are not a pair) and up to three examples.
const BASE = process.env.BASE || 'http://localhost:4371';
const PAGES = (process.env.PAGES || '/,/c/party/,/c/fortune/,/tools/,/tool/wheel/,/tool/number/,/tool/draw/,/tool/team/,/game/siamsi/,/game/daily-fortune/,/game/love-match/').split(',');
const PROBE = `
  await document.fonts.ready;
  const els = [...document.querySelectorAll('a, button, input, select, summary')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; });
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top + scrollY, b: r.bottom + scrollY }; };
  const pairs = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
    if (els[i].tagName !== 'A' && els[j].tagName !== 'A') continue;
    const a = box(els[i]), b = box(els[j]);
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (w > 0.5 && h > 0.5) pairs.push((els[i].textContent || els[i].tagName).trim().slice(0, 14) + ' x ' + (els[j].textContent || els[j].tagName).trim().slice(0, 14) + ' ' + w.toFixed(1) + 'x' + h.toFixed(1));
  }
  return { path: location.pathname, interactive: els.length, overlapping: pairs.length, examples: pairs.slice(0, 3) };
`;
export default async function (session) {
  const out = [];
  for (const w of [320, 1440]) {
    await session.setWidth(w, w < 640 ? 640 : 900, w < 640);
    for (const p of PAGES) {
      await session.nav(`${BASE}${p}`);
      const r = await session.evaluate(PROBE);
      out.push({ width: w, ...(r.value ?? { path: p, error: r.error }) });
    }
  }
  await session.close();
  return out;
}
