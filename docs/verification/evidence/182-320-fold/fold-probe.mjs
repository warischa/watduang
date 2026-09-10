// gh#182 evidence run: below-fold position of the primary control on freeze-tap and wire-snip-panic
// at 320x568, on the play screen the walk reaches after setup. Measurement only, no layout change.
// Seeding and press heuristic copied from scripts/play-screen-fit-probe.mjs so the numbers are
// comparable with its recorded rows.
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4324';
const SHOTS = process.env.SHOT_DIR;
const VP = { w: 320, h: 568 };
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  { id: 'freeze-tap', container: 'main#mainContent', primary: '#playerReadyBtn', block: '.pass-player-card', loads: Number(process.env.FT_LOADS || 6) },
  { id: 'wire-snip-panic', container: '#screen-game', primary: '#btn-trigger-scan', block: '#bomb-chassis', loads: Number(process.env.WSP_LOADS || 3) },
];

const HELPERS = `
  const ROOT_SEL = '#app, #app-container, #appRoot';
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
`;

const SIGNATURE = `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { ok: false, why: 'no mockup root' };
  const parts = [];
  for (const e of root.querySelectorAll('*')) {
    if (e.children.length || !visible(e)) continue;
    const t = (e.textContent || '').trim();
    if (t) parts.push(t);
  }
  const sig = parts.join(' ').toLowerCase().replace(/[0-9\\u0E50-\\u0E59]+/g, '').replace(/\\s+/g, ' ').trim();
  return { ok: true, sig, len: sig.length };
`;

const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

const clickTransition = (skip) => `
  ${HELPERS}
  const root = document.querySelector(ROOT_SEL);
  if (!root) return { found: false, why: 'no mockup root' };
  const cands = [...root.querySelectorAll('button:not([disabled])')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 60 && r.height > 30 && r.top >= 0 && !b.closest('header') && visible(b);
  }).sort((a, z) => {
    const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
    return rz.width * rz.height - ra.width * ra.height;
  });
  const btn = cands[${JSON.stringify(skip)}];
  if (!btn) return { found: false, why: 'nothing left to press at rank ${skip}' };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim().slice(0, 40) };
`;

// Everything reported comes out of getBoundingClientRect on the rendered box, per the repo rule that
// a layout number is measured and never computed.
const describe = (containerSel, primarySel, blockSel) => `
  ${HELPERS}
  const desc = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const id = e.id ? '#' + e.id : '';
    const cls = e.classList.length ? '.' + [...e.classList].join('.') : '';
    return { sel: e.tagName.toLowerCase() + id + cls, top: r.top, bottom: r.bottom, height: r.height,
             children: e.children.length, overflowY: getComputedStyle(e).overflowY,
             clientHeight: e.clientHeight, scrollHeight: e.scrollHeight, scrollTop: e.scrollTop };
  };
  const root = document.querySelector(ROOT_SEL);
  const container = document.querySelector(${JSON.stringify(containerSel)});
  const primary = document.querySelector(${JSON.stringify(primarySel)});
  const block = document.querySelector(${JSON.stringify(blockSel)});
  // The clip/scroll edge the container itself imposes, which is not the 568px line when page chrome
  // sits above it.
  const cRect = container ? container.getBoundingClientRect() : null;
  const foldEdge = cRect ? cRect.top + container.clientHeight : null;
  const pRect = primary ? primary.getBoundingClientRect() : null;
  const clip = (top, bottom, lo, hi) => Math.max(0, Math.min(bottom, hi) - Math.max(top, lo));
  // Every visible in-flow box inside the mockup root, tallest first. children === 0 marks a leaf, so a
  // wrapper can be told from a content block by hand rather than by a guessed rule.
  const boxes = [...root.querySelectorAll('*')].filter(visible).map(desc)
    .sort((a, b) => b.height - a.height).slice(0, 12);
  return { ok: true, innerWidth, innerHeight,
    container: desc(container), foldEdge,
    primary: pRect ? { ...desc(primary),
      topPastViewportBottom: pRect.top - innerHeight,
      bottomPastViewportBottom: pRect.bottom - innerHeight,
      visiblePxInViewport: clip(pRect.top, pRect.bottom, 0, innerHeight),
      topPastContainerFold: foldEdge === null ? null : pRect.top - foldEdge,
      visiblePxInContainer: foldEdge === null ? null : clip(pRect.top, pRect.bottom, cRect.top, foldEdge),
    } : null,
    recordedBlock: desc(block),
    tallest: boxes };
`;

// Calibration of the exact instrument being reported: force the block above the button to a large
// min-height and confirm the button rect and the block height both move, then remove the override and
// confirm both return to the baseline reading.
const calibrate = (containerSel, primarySel, blockSel) => `
  const read = () => {
    const c = document.querySelector(${JSON.stringify(containerSel)});
    const p = document.querySelector(${JSON.stringify(primarySel)});
    const b = document.querySelector(${JSON.stringify(blockSel)});
    return { blockHeight: b.getBoundingClientRect().height,
             primaryTop: p.getBoundingClientRect().top,
             containerScrollHeight: c.scrollHeight };
  };
  const b = document.querySelector(${JSON.stringify(blockSel)});
  const before = read();
  b.style.setProperty('min-height', '2000px', 'important');
  const forced = read();
  b.style.removeProperty('min-height');
  const after = read();
  return { before, forced, after,
           moved: forced.primaryTop - before.primaryTop,
           returned: after.primaryTop === before.primaryTop && after.blockHeight === before.blockHeight
                     && after.containerScrollHeight === before.containerScrollHeight };
`;

async function load(session, url, seeded) {
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await session.wipe(); // on-origin, per docs/agents/browser-verification.md trap 4
  if (seeded) await session.evaluate(SEED);
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1200);
}

export default async function (session) {
  const out = { base: BASE, viewport: `${VP.w}x${VP.h}`, runs: [] };
  for (const r of ROUTES) {
    const url = `${BASE}/game/${r.id}/play/`;
    for (let load_i = 1; load_i <= r.loads; load_i += 1) {
      const run = { route: r.id, load: load_i, presses: [], error: null };
      out.runs.push(run);
      await load(session, url, false);
      const fresh = await session.evaluate(SIGNATURE);
      if (!fresh.value?.ok) { run.error = `fresh signature unreadable: ${fresh.error ?? fresh.value?.why}`; continue; }
      await load(session, url, true);
      const w = await session.evaluate('return [innerWidth, innerHeight];');
      if (w.value?.[0] !== VP.w || w.value?.[1] !== VP.h) {
        run.error = `void read: innerWidth/Height ${JSON.stringify(w.value)} not ${VP.w}x${VP.h} (browser-verification trap 1)`;
        continue;
      }
      // Walk with the same largest-visible-non-header-button heuristic and the same self-correcting
      // skip, measuring EVERY distinct screen, and stop at the one that carries the primary control —
      // the first screen off setup is not always that screen.
      let skip = 0;
      let press = 0;
      const seen = new Set([fresh.value.sig]);
      run.screens = [];
      for (; press <= 6; press += 1) {
        const sig = await session.evaluate(SIGNATURE);
        if (!sig.value?.ok) { run.error = 'signature unreadable mid-walk'; break; }
        if (sig.value.sig !== fresh.value.sig && !seen.has(sig.value.sig)) {
          seen.add(sig.value.sig);
          const m = await session.evaluate(describe(r.container, r.primary, r.block));
          if (!m.value?.ok) { run.error = `measure failed: ${m.error ?? m.value?.why}`; break; }
          run.screens.push({ press, hasPrimary: !!m.value.primary, sigLen: sig.value.len });
          if (m.value.primary) { run.pressIndex = press; run.measure = m.value; break; }
        }
        const before = sig.value.sig;
        const click = await session.evaluate(clickTransition(skip));
        if (!click.value?.found) { run.error = `walk stranded: ${click.value?.why}`; break; }
        run.presses.push({ rank: skip, label: click.value.label });
        await sleep(700);
        const after = await session.evaluate(SIGNATURE);
        skip = after.value?.sig === before ? skip + 1 : 0;
      }
      if (!run.measure) { run.error = run.error || 'never reached a screen carrying the primary control'; continue; }

      if (SHOTS) {
        const stem = `${SHOTS}/${r.id}-320x568-load${load_i}`;
        await session.screenshot(`${stem}-first-paint.png`);
        run.shotFirstPaint = `${stem}-first-paint.png`;
        // Same layout, container scrolled to its own bottom: shows where the control sits without
        // changing a single style.
        await session.evaluate(`document.querySelector(${JSON.stringify(r.container)}).scrollTop = 99999; return true;`);
        await session.screenshot(`${stem}-scrolled-to-control.png`);
        run.shotScrolled = `${stem}-scrolled-to-control.png`;
        await session.evaluate(`document.querySelector(${JSON.stringify(r.container)}).scrollTop = 0; return true;`);
      }

      const cal = await session.evaluate(calibrate(r.container, r.primary, r.block));
      run.calibration = cal.value ?? { error: cal.error };

      if (SHOTS) {
        // Instrumented full-page shot LAST, after every number is taken: html/body/container are
        // pinned on these mockups, so the overflow is only visible once the clip is released.
        await session.evaluate(`
          const s = document.createElement('style');
          s.textContent = 'html,body{overflow:visible !important;height:auto !important}' +
            ${JSON.stringify(r.container)} + '{overflow:visible !important;height:auto !important;max-height:none !important}';
          document.head.appendChild(s);
          return true;`);
        await sleep(300);
        const stem = `${SHOTS}/${r.id}-320x568-load${load_i}`;
        await session.screenshot(`${stem}-fullpage-clip-released.png`);
        run.shotFullPage = `${stem}-fullpage-clip-released.png`;
      }
    }
  }
  if (SHOTS) fs.writeFileSync(`${SHOTS}/fold-probe.json`, JSON.stringify(out, null, 2));
  return out;
}
