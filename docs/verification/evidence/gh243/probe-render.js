await document.fonts.ready;
const imgs = [...document.images];
await Promise.all(imgs.filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); })));
const croc = imgs.filter((i) => i.src.endsWith('/croc-bite.webp'));
const root = document.querySelector('x-dc > div');
return {
  innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  rootWidth: root ? root.getBoundingClientRect().width : null,
  height: document.documentElement.scrollHeight,
  crocCount: croc.length,
  crocLoaded: croc.map((i) => i.naturalWidth),
  pendingBroken: imgs.filter((i) => !i.src.endsWith('/croc-bite.webp') && i.naturalWidth === 0).length,
  pendingLoaded: imgs.filter((i) => !i.src.endsWith('/croc-bite.webp') && i.naturalWidth > 0).length,
  mitr: document.fonts.check('700 20px Mitr'),
  overflowingEls: [...document.querySelectorAll('x-dc *')].filter((e) => {
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5))) return false;
    for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'clip') return false; }
    return true;
  }).map((e) => e.tagName + '.' + e.className).slice(0, 5),
  helmetStyleApplied: [...document.styleSheets].length,
};
