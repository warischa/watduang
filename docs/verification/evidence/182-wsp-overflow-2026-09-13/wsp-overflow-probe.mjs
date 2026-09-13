// gh#182 measurement-only: what content overflows #screen-game on wire-snip-panic at 320x568,
// on the CURRENT tree (uncommitted #screen-game{overflow:hidden} present in
// src/play/wire-snip-panic/overrides.css). Reuses the exact drive path proven in
// docs/verification/evidence/182-320-fold-fix/fold-probe-fix.mjs (seed roster -> nav -> arm wait ->
// measure; no click needed, wire-snip-panic has no interstitial before #screen-game). Adds two things
// neither committed probe reports: (a) the full list of elements inside #screen-game whose bottom
// exceeds the container's own visible bottom edge, (b) a runtime-only (no source edit) toggle of
// #screen-game's overflow property to compare scrollHeight with/without `overflow:hidden` in effect.
const BASE = process.env.BASE || 'http://localhost:4178';
const VP = { w: 320, h: 568 };
const LOADS = Number(process.env.LOADS || 3);
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARM_WAIT = 700;

const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

async function freshLoad(session, url) {
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await session.wipe();
  await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1200);
  await sleep(ARM_WAIT);
}

const MEASURE = `
  const clip = (top, bottom, lo, hi) => Math.max(0, Math.min(bottom, hi) - Math.max(top, lo));
  const primary = document.querySelector('#btn-trigger-scan');
  const container = document.querySelector('#screen-game');
  if (!primary || !container) return { ok: false, why: 'primary or container missing' };
  const pRect = primary.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  const cs = getComputedStyle(container);
  const visibleBottomEdge = cRect.top + container.clientHeight; // border-box bottom, respects overflow:hidden clip

  const isInteractive = (e) => {
    const tag = e.tagName.toLowerCase();
    if (['button','input','select','textarea','a'].includes(tag)) return true;
    if (e.hasAttribute('onclick')) return true;
    const role = e.getAttribute('role');
    if (role && ['button','link','checkbox','switch','menuitem'].includes(role)) return true;
    if (e.hasAttribute('tabindex') && e.getAttribute('tabindex') !== '-1') return true;
    if (getComputedStyle(e).cursor === 'pointer') return true;
    return false;
  };

  const overflowing = [...container.querySelectorAll('*')].map((e) => {
    const r = e.getBoundingClientRect();
    return { e, r };
  }).filter(({ r }) => r.bottom > visibleBottomEdge + 0.5)
    .map(({ e, r }) => ({
      tag: e.tagName.toLowerCase(),
      id: e.id || null,
      classList: [...e.classList],
      rectBottom: r.bottom,
      interactive: isInteractive(e),
      hasVisibleText: (e.textContent || '').trim().length > 0 && e.children.length === 0,
      ownTextTrimmed: e.children.length === 0 ? (e.textContent || '').trim().slice(0, 60) : null,
    }));

  return {
    ok: true,
    innerWidth, innerHeight,
    primary: {
      sel: '#btn-trigger-scan', top: pRect.top, bottom: pRect.bottom,
      topPastFold: pRect.top - innerHeight, visiblePx: clip(pRect.top, pRect.bottom, 0, innerHeight),
    },
    container: {
      sel: 'div#screen-game', clientHeight: container.clientHeight, scrollHeight: container.scrollHeight,
      clientWidth: container.clientWidth, scrollWidth: container.scrollWidth,
      overflowY: cs.overflowY, overflowX: cs.overflowX, rectTop: cRect.top, visibleBottomEdge,
    },
    overflowing,
  };
`;

// Runtime-only toggle (no source file touched): force overflow:visible on #screen-game via an
// injected <style> element, re-read scrollHeight, then remove the style and confirm it returns.
// This answers "does overflow:hidden change scrollHeight" without editing overrides.css.
const TOGGLE = `
  const container = document.querySelector('#screen-game');
  if (!container) return { ok: false, why: 'container missing' };
  const before = { overflowY: getComputedStyle(container).overflowY, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
  const style = document.createElement('style');
  style.id = 'wsp-overflow-toggle-probe';
  style.textContent = '#screen-game { overflow: visible !important; }';
  document.head.appendChild(style);
  const forced = { overflowY: getComputedStyle(container).overflowY, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
  style.remove();
  const after = { overflowY: getComputedStyle(container).overflowY, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
  return { before, forced, after, scrollHeightChanged: forced.scrollHeight !== before.scrollHeight, returned: after.overflowY === before.overflowY && after.scrollHeight === before.scrollHeight };
`;

export default async function main(session) {
  const url = `${BASE}/game/wire-snip-panic/play/`;
  const loads = [];
  for (let i = 1; i <= LOADS; i++) {
    await freshLoad(session, url);
    const m = await session.evaluate(MEASURE);
    loads.push({ load: i, measured: m.value ?? { ok: false, error: m.error } });
  }
  // Toggle test on one fresh load (item 4)
  await freshLoad(session, url);
  const t = await session.evaluate(TOGGLE);
  const toggle = t.value ?? { error: t.error };

  // Red calibration: shrink the viewport height so the SAME primary control is provably below the
  // fold (visiblePx must drop to 0 / topPastFold flip strongly positive), proving the instrument
  // actually measures real layout rather than returning a cached/green-by-default number.
  await session.nav(url);
  await session.setWidth(320, 200); // deliberately too short
  await session.wipe();
  await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(320, 200);
  await sleep(1200);
  await sleep(ARM_WAIT);
  const calib = await session.evaluate(MEASURE);

  return { loads, toggle, calibration_320x200: calib.value ?? { error: calib.error } };
}
