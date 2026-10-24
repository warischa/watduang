// gh#288 Phase 0/1 — candidate E, cross-document view transitions, measured in this Chrome (not read
// from docs). The opt-in `@view-transition { navigation: auto }` is injected at document start into the
// pages an OPT_IN rule names, exactly as a stylesheet would carry it; pageswap/pagereveal record whether
// the browser created a transition (event.viewTransition) and which ::view-transition animations ran.
// Navigations are renderer-initiated (location.href), as a link tap is; an address-bar navigation would
// not run a transition at all, so it would read null for the wrong reason.
// Cases (each is its own must-red/must-green against the others):
//   0 neither page opted in                  -> expect null (control)
//   1 opted -> opted                         -> expect a transition
//   2 opted -> a play route that is not      -> expect null (play routes untouched)
//   3 opted -> opted, prefers-reduced-motion -> what Chrome does on its own (no author media query)
//   4 the ad slot box on the destination after a transition vs without one (placeholder only: gh#29)
//   CDP_PORT=9310 OUT=<json> node <this file>
import { open } from './cdp-lib.mjs';
import { writeFile } from 'node:fs/promises';
const BASE = process.env.BASE || 'http://localhost:4410';
const s = await open();
await s.setWidth(390, 844, true);
const AT_START = (optIn) => `
  (() => {
    const optIn = ${optIn};
    // documentElement is null at document start: append the rule the moment <html> exists, still before
    // the first render, which is when the new document's opt-in is read.
    const add = () => { const st = document.createElement('style'); st.textContent = '@view-transition { navigation: auto; }'; document.documentElement.appendChild(st); };
    if (optIn(location.pathname)) { if (document.documentElement) add(); else { const mo = new MutationObserver(() => { if (document.documentElement) { mo.disconnect(); add(); } }); mo.observe(document, { childList: true }); } }
    addEventListener('pageswap', (e) => { sessionStorage.setItem('__swap', JSON.stringify({ from: location.pathname, vt: !!e.viewTransition })); });
    addEventListener('pagereveal', (e) => {
      const vt = e.viewTransition;
      const anims = () => document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement && a.effect.pseudoElement.startsWith('::view-transition')).map((a) => a.effect.pseudoElement + ' ' + a.animationName + ' ' + Math.round(a.effect.getTiming().duration) + 'ms');
      window.__vt = { at: location.pathname, vt: !!vt, anims: vt ? anims() : [] };
      // The ::view-transition animations exist only once the transition is ready, not at pagereveal.
      if (vt) { vt.ready.then(() => { window.__vt.anims = anims(); }).catch((err) => { window.__vt.readyError = String(err).slice(0, 80); }); vt.finished.then(() => { window.__vt.finished = true; }); }
    });
  })();
`;
const out = { chrome: null, cases: {} };
out.chrome = (await s.ev(`return navigator.userAgent`)).match(/Chrome\/[\d.]+/)?.[0];
async function run(id, optIn, from, to, rm = false) {
  await s.reducedMotion(rm);
  const reg = await s.send('Page.addScriptToEvaluateOnNewDocument', { source: AT_START(optIn) });
  await s.nav(BASE + from); await s.sleep(500);
  await s.ev(`sessionStorage.removeItem('__swap'); return 1`);
  await s.ev(`setTimeout(() => { location.href = ${JSON.stringify(BASE + to)}; }, 50); return 1`);
  await s.sleep(2500);
  const r = await s.ev(`return { landed: location.pathname, swap: JSON.parse(sessionStorage.getItem('__swap') || 'null'), reveal: window.__vt || null, ad: (() => { const a = document.querySelector('.ad-slot'); if (!a) return null; const b = a.getBoundingClientRect(); return { y: Math.round(b.top + scrollY), h: Math.round(b.height), w: Math.round(b.width) }; })() };`);
  await s.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: reg.result.identifier });
  out.cases[id] = { from, to, reducedMotion: rm, ...r };
}
const NONE = '() => false';
const WEB = "(p) => !p.endsWith('/play/')";
await run('0-neither-opted', NONE, '/', '/tools/');
await run('1-opted-to-opted', WEB, '/', '/tools/');
await run('2-opted-to-play-route', WEB, '/c/party/', '/game/one-bomb/play/');
await run('3-opted-reduced-motion', WEB, '/', '/tools/', true);
await run('4a-ad-slot-with-vt', WEB, '/tools/', '/c/fortune/');
await run('4b-ad-slot-without-vt', NONE, '/tools/', '/c/fortune/');
out.events = s.events;
await s.close();
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
