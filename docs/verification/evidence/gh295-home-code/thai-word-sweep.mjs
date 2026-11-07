// gh#295 B1: the impeccable-2026-11-06 width sweep, retargeted. Does a protected word span two line
// boxes on the privacy page or on either page that links it, at any width from 300 to 1440 in 5px steps?
// The words are the policy title's compound (Chrome broke it mid-word at 390 on the board) and the
// feedback page's name; Intl.Segmenter shares the browser dictionary, so only a rendered read sees these.
// BASE comes from the environment. Copied from the original, which stays as recorded.
// Red = the default export throws after the sweep, listing every page that read nothing or broke a word,
// so driver.mjs exits non-zero. SWEEP_CONTROL=1 records a build that is expected to break (the keep
// removed) without throwing; the default asserts zero breaks.
const BASE = process.env.BASE;
const PAGES = ['/privacy/', '/', '/feedback/'];
const WORDS = ['ความเป็นส่วนตัว', 'ติชม', 'นโยบาย'];
const PROBE = `
  const WORDS = ${JSON.stringify(WORDS)};
  const strip = (s) => s.replace(/\\u2060/g, '');
  const hits = [];
  let found = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.data;
    const el = n.parentElement; if (!el) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    for (const w of WORDS) {
      // locate the word in the raw node text, tolerating joiners inside it
      const flat = []; for (let i = 0; i < t.length; i++) if (t[i] !== '\\u2060') flat.push(i);
      const k = strip(t).indexOf(w); if (k < 0) continue;
      found++;
      const a = flat[k], b = flat[k + w.length - 1];
      const range = document.createRange();
      const tops = new Set();
      for (let i = a; i <= b; i++) { range.setStart(n, i); range.setEnd(n, i + 1); const rc = range.getClientRects(); if (rc.length) tops.add(Math.round(rc[0].top)); }
      if (tops.size > 1) hits.push(w);
    }
  }
  return { found, hits };`;
export default async function (session) {
  const res = [];
  for (const p of PAGES) {
    let found = 0; const broken = [];
    for (let w = 300; w <= 1440; w += 5) {
      await session.setWidth(w, 844);
      if (w === 300) await session.nav(BASE + p);
      const r = await session.evaluate(PROBE);
      if (r.error) throw new Error(`thai word sweep: page read failed at ${p} ${w}px: ${r.error}`);
      found = Math.max(found, r.value.found);
      for (const h of r.value.hits) broken.push(`${w}:${h}`);
    }
    res.push({ page: p, found, brokenCount: broken.length, broken: broken.slice(0, 10) });
  }
  if (!process.env.SWEEP_CONTROL) {
    const fails = [];
    for (const r of res) {
      if (!(r.found > 0)) fails.push(`${r.page}: no protected word found, sweep void`);
      if (r.brokenCount !== 0) fails.push(`${r.page}: ${r.brokenCount} breaks, first ${JSON.stringify(r.broken)}`);
    }
    if (fails.length) throw new Error(`thai word sweep red (${fails.length}): ${fails.join(' | ')}`);
  }
  return res;
}
