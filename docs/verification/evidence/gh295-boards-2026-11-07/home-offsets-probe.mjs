const body = `
await document.fonts.ready;
await new Promise(r => setTimeout(r, 300));
const top = (el) => { if (!el) return null; let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
const sec = (id) => document.getElementById(id)?.closest('section');
const h1 = document.querySelector('h1');
const popTitles = [...document.querySelectorAll('#popular ~ * .name, section[aria-labelledby=popular] .name')].map(e => e.textContent.trim());
const shelfTitles = [...document.querySelectorAll('section[aria-labelledby=party] .tile .name')].map(e => e.textContent.trim());
const featured = document.querySelector('.featured .fname, .featured [class*=name]')?.textContent.trim() ?? null;
const shelfGrid = document.querySelector('section[aria-labelledby=party] .grid');
const de = document.documentElement;
return {
  innerWidth, innerHeight, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
  docHeight: de.scrollHeight,
  h1Html: h1.innerHTML.replace(/ data-astro-cid-[a-z0-9]+/g, ''),
  heroBottom: Math.round(document.querySelector('header.hero').getBoundingClientRect().bottom + scrollY),
  adTop: top(document.querySelector('.ad-slot')),
  popularTop: top(sec('popular')), partyBandTop: top(document.querySelector('.band')), partyTop: top(sec('party')),
  shelfTop: top(shelfGrid), shelfBottom: shelfGrid ? top(shelfGrid) + shelfGrid.offsetHeight : null,
  fortuneTop: top(sec('fortune')), toolsTop: top(sec('tools')),
  faqTop: top(document.getElementById('faq')),
  shelfCount: shelfTitles.length, shelfCols: getComputedStyle(shelfGrid).gridTemplateColumns.split(' ').length,
  popTitles, shelfTitles, featured,
  dupes: popTitles.filter(t => shelfTitles.includes(t)),
};`;
export default async function (session) {
  const out = [];
  for (const [w, h] of [[390, 844], [320, 568], [1280, 800]]) {
    for (let i = 0; i < 3; i++) {
      await session.setWidth(w, h);
      await session.nav('http://localhost:9342/');
      const r = await session.evaluate(body);
      out.push({ w, h, run: i + 1, ...(r.value ?? r) });
      if (i === 0 && w !== 320) await session.screenshot(process.env.SHOTDIR + '/today-' + w + '.png');
    }
  }
  out.push({ consoleErrors: session.consoleErrors });
  return out;
}
