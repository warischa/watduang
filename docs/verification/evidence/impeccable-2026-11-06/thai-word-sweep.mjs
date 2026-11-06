// Width sweep: does any protected word span two line boxes on any page that renders the daily-fortune tagline?
// Protected words are the ones Chrome's ICU dictionary mis-segments: an Intl.Segmenter probe is blind to them by construction.
const BASE = 'http://localhost:4410';
const PAGES = ['/', '/c/fortune/', '/game/daily-fortune/'];
const WORDS = ['อ่านขำๆ', 'จิ๊บจ๊อยอะไร'];
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
      if (r.error) return { error: r.error, p, w };
      found = Math.max(found, r.value.found);
      for (const h of r.value.hits) broken.push(`${w}:${h}`);
    }
    res.push({ page: p, found, brokenCount: broken.length, broken: broken.slice(0, 10) });
  }
  return res;
}
