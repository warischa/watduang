// gh#262 detail probe: drill-downs the main probe's counts point at (driver.mjs; env W, BASE, OUT).
//   CDP_PORT=9310 W=320 OUT=<dir> node scripts/driver.mjs <this file>
const BASE = process.env.BASE || 'http://localhost:4410', W = Number(process.env.W || 320), OUT = process.env.OUT || '.';
export default async function (s) {
  await s.setWidth(W, W < 640 ? 640 : 900, W < 640);
  const r = {};
  await s.nav(BASE + '/404.html');
  r.p404 = (await s.evaluate(`const g = (e) => getComputedStyle(e); const rect = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return { html: document.documentElement.outerHTML.length, linkedCss: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')), inlineStyleTags: document.querySelectorAll('style').length,
      body: { family: g(document.body).fontFamily, bg: g(document.body).backgroundColor, color: g(document.body).color, margin: g(document.body).margin, fontSize: g(document.body).fontSize },
      els: [...document.body.querySelectorAll('*')].filter((e) => !['SCRIPT'].includes(e.tagName)).map((e) => ({ tag: e.tagName.toLowerCase(), text: (e.textContent || '').trim().slice(0, 30), family: g(e).fontFamily.slice(0, 24), size: g(e).fontSize, color: g(e).color, deco: g(e).textDecorationLine, rect: rect(e) })),
      nav: !!document.querySelector('header, nav'), footer: !!document.querySelector('footer'), canvasBgVar: getComputedStyle(document.documentElement).getPropertyValue('--bg') }`)).value;
  await s.screenshot(`${OUT}/shot-404-${W}.png`);
  await s.nav(BASE + '/tool/draw/');
  r.eyebrow = (await s.evaluate(`const e = document.querySelector('.tool-eyebrow'); const out = []; for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x); out.push(x.tagName.toLowerCase() + '.' + String(x.className).split(' ').filter((k) => !k.startsWith('astro')).join('.') + ' bg=' + c.backgroundColor + ' bgimg=' + c.backgroundImage.slice(0, 30) + ' color=' + c.color); } return out;`)).value;
  await s.nav(BASE + '/');
  r.homeToolTiles = (await s.evaluate(`const g = (e) => getComputedStyle(e); return [...document.querySelectorAll('a.tile[data-kind=tool]')].map((a) => ({ href: a.getAttribute('href'), bg: g(a).backgroundColor, name: g(a.querySelector('.name')).color, desc: a.querySelector('.desc') ? g(a.querySelector('.desc')).color + ' ' + g(a.querySelector('.desc')).display : null }));`)).value;
  await s.nav(BASE + '/tool/wheel/');
  r.checkboxes = (await s.evaluate(`return [...document.querySelectorAll('input')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const l = e.closest('label') || document.querySelector('label[for="' + e.id + '"]'); const lb = l ? l.getBoundingClientRect() : null; return { type: e.type, id: e.id, box: [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)], label: lb ? [Math.round(lb.width), Math.round(lb.height)] : null, labelText: l ? l.textContent.trim().slice(0, 20) : null }; });`)).value;
  return { W, ...r };
}
