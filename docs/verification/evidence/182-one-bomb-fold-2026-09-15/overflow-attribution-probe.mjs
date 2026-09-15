// Follow-up to fold-probe.mjs, same evidence run: WHICH elements inside div#menuOverlay.menuOverlay
// actually consume the 97px between its clientHeight (568) and scrollHeight (665), on one-bomb at
// 320x568. Reuses the same session helpers (nav/setWidth/wipe/evaluate) and the same seed as
// fold-probe.mjs, so this is a reading, not a new instrument. Measurement only, no layout change.
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4390';
const VP = { w: 320, h: 568 };
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const LOADS = Number(process.env.OB_LOADS || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

// Every visible descendant of #menuOverlay whose own bottom edge sits past the 568px fold, plus
// which one sets the container's scrollHeight. Read via getBoundingClientRect only, never computed
// from CSS.
const ATTRIBUTE = `
  const cont = document.querySelector('#menuOverlay');
  if (!cont) return { ok: false, why: 'no #menuOverlay' };
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const desc = (e) => {
    const r = e.getBoundingClientRect();
    const id = e.id ? '#' + e.id : '';
    const cls = e.classList.length ? '.' + [...e.classList].join('.') : '';
    return { sel: e.tagName.toLowerCase() + id + cls, top: r.top, bottom: r.bottom,
             height: r.height, pastFold: r.bottom - 568 };
  };
  const cRect = cont.getBoundingClientRect();
  const cs = getComputedStyle(cont);
  const all = [cont, ...cont.querySelectorAll('*')].filter(visible).map(desc);
  const past = all.filter((d) => d.bottom > 568).sort((a, b) => b.bottom - a.bottom);
  const maxBottom = all.reduce((m, d) => (d.bottom > m.bottom ? d : m), all[0]);
  return { ok: true, innerWidth, innerHeight,
    containerClientHeight: cont.clientHeight, containerScrollHeight: cont.scrollHeight,
    containerPaddingBottom: cs.paddingBottom, containerPaddingTop: cs.paddingTop,
    containerTop: cRect.top, past, maxBottomElement: maxBottom };
`;

async function load(session, url) {
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await session.wipe(); // on-origin, per docs/agents/browser-verification.md trap 4
  await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1200);
}

export default async function (session) {
  const url = `${BASE}/game/one-bomb/play/`;
  const out = { base: BASE, viewport: `${VP.w}x${VP.h}`, runs: [] };
  for (let i = 1; i <= LOADS; i += 1) {
    const run = { load: i, error: null };
    out.runs.push(run);
    await load(session, url);
    const w = await session.evaluate('return [innerWidth, innerHeight];');
    if (w.value?.[0] !== VP.w || w.value?.[1] !== VP.h) {
      run.error = `void read: innerWidth/Height ${JSON.stringify(w.value)} not ${VP.w}x${VP.h} (browser-verification trap 1)`;
      continue;
    }
    const r = await session.evaluate(ATTRIBUTE);
    if (!r.value?.ok) { run.error = `attribute failed: ${r.error ?? r.value?.why}`; continue; }
    Object.assign(run, r.value);
  }
  return out;
}
