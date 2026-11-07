const body = (opt) => `
await document.fonts.ready;
await new Promise(r => setTimeout(r, 300));
const top = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
const sec = (id) => document.getElementById(id).closest('section');
const pop = [...sec('popular').querySelectorAll('.name')].map(e => e.textContent.trim());
const feat = document.querySelector('.featured .name').textContent.trim();
const grid = sec('party').querySelector('.grid');
let removed = [];
if (${JSON.stringify(opt)} !== 'A') {
  for (const a of [...grid.children]) { const n = a.querySelector('.name').textContent.trim(); if (pop.includes(n) || n === feat) { removed.push(n); a.remove(); } }
}
if (${JSON.stringify(opt)} === 'C' && matchMedia('(max-width: 639px)').matches) {
  [...grid.children].forEach((a, i) => { if (i >= 4) a.style.display = 'none'; });
}
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const vis = [...grid.children].filter(a => getComputedStyle(a).display !== 'none').length;
return { innerWidth, opt: ${JSON.stringify(opt)}, removed, shelfVisible: vis, shelfTop: top(grid), shelfBottom: top(grid) + grid.offsetHeight,
  fortuneTop: top(sec('fortune')), toolsTop: top(sec('tools')), docHeight: document.documentElement.scrollHeight };`;
export default async function (session) {
  const out = [];
  for (const [w, h] of [[390, 844], [320, 568], [1280, 800]]) for (const opt of ['A', 'B', 'C']) for (let i = 0; i < 2; i++) {
    await session.setWidth(w, h);
    await session.nav('http://localhost:9342/'); await session.evaluate('await new Promise(r => setTimeout(r, 200)); return 1');
    const r = await session.evaluate(body(opt));
    out.push({ w, run: i + 1, ...(r.value ?? r) });
  }
  return out;
}
