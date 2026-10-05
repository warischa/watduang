// Footer-pin measurement walk. PHASE=before|after decides the screenshot folder.
const ORIGIN = 'http://127.0.0.1:4393';
const PHASE = process.env.PHASE || 'before';
const OUT = `/Users/waris.c/claude/free-game/docs/verification/evidence/gh255/footer-pin/${PHASE}`;
const PAGES = ['/404.html', '/tools/', '/tool/wheel/', '/tool/draw/', '/tool/team/', '/tool/number/',
  '/', '/c/party/', '/c/fortune/', '/game/siamsi/', '/game/daily-fortune/', '/game/love-match/', '/game/timebomb/play/'];
const PROBE = `
  scrollTo(0, 0);
  const de = document.documentElement;
  const foot = document.querySelector('footer.chrome-footer');
  const all = [...document.body.querySelectorAll('*')].filter((el) => !['SCRIPT','STYLE','TEMPLATE'].includes(el.tagName));
  const above = foot ? all.filter((el) => !foot.contains(el) && el !== foot && (el.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING)) : all;
  const sig = above.map((el) => { const b = el.getBoundingClientRect(); return [el.tagName, Math.round(b.top*10)/10, Math.round(b.left*10)/10, Math.round(b.width*10)/10, Math.round(b.height*10)/10].join(','); }).join('|');
  const sigNoMain = above.filter((el) => !(el.tagName === 'MAIN' && el.parentElement === document.body)).map((el) => { const b = el.getBoundingClientRect(); return [el.tagName, Math.round(b.top*10)/10, Math.round(b.left*10)/10, Math.round(b.width*10)/10, Math.round(b.height*10)/10].join(','); }).join('|');
  let h2 = 0; for (let i = 0; i < sigNoMain.length; i++) h2 = (h2 * 31 + sigNoMain.charCodeAt(i)) >>> 0;
  const bm = document.querySelector('body > main'); const mainRect = bm ? (() => { const b = bm.getBoundingClientRect(); return [Math.round(b.top*10)/10, Math.round(b.height*10)/10]; })() : null;
  const bodyKids = [...document.body.children].filter((e) => e.tagName !== 'SCRIPT').map((e) => e.tagName.toLowerCase()).join(' ');
  let h = 0; for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) >>> 0;
  const fb = foot ? foot.getBoundingClientRect() : null;
  const bottomEl = document.elementFromPoint(Math.floor(innerWidth / 2), innerHeight - 1);
  return {
    innerWidth, innerHeight, scrollWidth: de.scrollWidth, scrollHeight: de.scrollHeight,
    footers: document.querySelectorAll('footer').length,
    footerTop: fb ? Math.round(fb.top * 10) / 10 : null, footerBottom: fb ? Math.round(fb.bottom * 10) / 10 : null,
    bottomRowInFooter: foot ? foot.contains(bottomEl) : null,
    aboveCount: above.length, aboveHash: h.toString(16), aboveHashNoMain: h2.toString(16), mainRect, bodyKids,
    stage: (() => { const s = document.getElementById('stage'); if (!s) return null; const b = s.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; })(),
  };
`;
export default async function (session) {
  const rows = [];
  for (const [w, h] of [[320, 640], [1440, 900]]) {
    await session.setWidth(w, h);
    for (const p of PAGES) {
      await session.nav(ORIGIN + p);
      await session.wipe();
      await session.nav(ORIGIN + p);
      await new Promise((r) => setTimeout(r, 600));
      const { value, error } = await session.evaluate(PROBE);
      const slug = p === '/' ? 'home' : p.replace(/^\/|\/$|\.html$/g, '').replace(/\//g, '-');
      if (!p.includes('/play/')) await session.screenshot(`${OUT}/${slug}-${w}.png`);
      rows.push({ p, w, ...(value || { error }) });
    }
  }
  return { phase: PHASE, consoleErrors: session.consoleErrors, rows };
}
