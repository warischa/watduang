const URL = 'http://127.0.0.1:4321/game/croc-bite/play/';
export default async function (session) {
  await session.nav(URL);
  await session.wipe();
  await session.nav(URL);
  await session.setWidth(320, 640); // matches play-exit-probe.mjs's M2 viewport exactly

  // Replicates play-exit-probe.mjs's M2 candidate finder: largest visible non-header button in the
  // game root.
  const scan = await session.evaluate(`
    const root = document.querySelector('#app, #app-container, #appRoot');
    const all = [...root.querySelectorAll('button')];
    const cands = all.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header') && getComputedStyle(b).visibility !== 'hidden' && b.offsetParent !== null;
    }).sort((a, z) => z.getBoundingClientRect().width * z.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
    const b = cands[0];
    if (!b) return { found: false };
    const r = b.getBoundingClientRect();
    return { found: true, id: b.id, label: (b.textContent||'').trim().slice(0,24), x: r.left + r.width/2, y: r.top + r.height/2 };
  `);
  if (!scan.value?.found) return { error: 'no candidate found', scan: scan.value };
  const { x, y, id } = scan.value;

  await session.tap(x, y);

  const after = await session.evaluate(`
    const el = document.elementFromPoint(${x}, ${y});
    if (!el) return { elementAtPoint: null };
    const toothBtn = el.closest ? el.closest('[data-tooth]') : null;
    return {
      tag: el.tagName, id: el.id || null, className: el.className || null,
      isDataTooth: !!toothBtn, toothId: toothBtn ? toothBtn.dataset.tooth : null,
      disabled: toothBtn ? toothBtn.disabled : (el.disabled ?? null),
      phase: window.__khengApp.state.phase,
    };
  `);
  return { triggerCandidate: { id, x, y }, elementAtSamePointAfterClick: after.value };
}
