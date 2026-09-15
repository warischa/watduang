// gh#182 rule-reveal screen (press 0) measurement at 320x568.
// Seeding/walk pattern copied from docs/verification/evidence/182-320-fold/fold-probe.mjs.
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4321';
const VP = { w: 320, h: 568 };
const NAMES = ['QQAAX', 'QQBBY', 'QQCCZ'];
const LOADS = Number(process.env.LOADS || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELPERS = `
  const ROOT_SEL = '#app, #app-container, #appRoot';
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
`;

const SEED = `
  localStorage.setItem('watduang:roster', ${JSON.stringify(JSON.stringify(NAMES))});
  localStorage.setItem('watduang:group', ${JSON.stringify(JSON.stringify(NAMES))});
  return true;
`;

const clickFirstBigButton = `
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
  const btn = cands[0];
  if (!btn) return { found: false, why: 'nothing to press' };
  btn.click();
  return { found: true, label: (btn.textContent || '').trim().slice(0, 40) };
`;

const MEASURE = `
  const container = document.querySelector('main#mainContent');
  const primary = document.querySelector('#ruleReadyBtn');
  const cRect = container ? container.getBoundingClientRect() : null;
  const pRect = primary ? primary.getBoundingClientRect() : null;
  const clip = (top, bottom, lo, hi) => Math.max(0, Math.min(bottom, hi) - Math.max(top, lo));
  return {
    innerWidth, innerHeight,
    hasRuleContainer: !!document.querySelector('.rule-reveal-container'),
    containerClientHeight: container ? container.clientHeight : null,
    containerScrollHeight: container ? container.scrollHeight : null,
    overflow: container ? (container.scrollHeight - container.clientHeight) : null,
    buttonFound: !!primary,
    buttonTop: pRect ? pRect.top : null,
    buttonBottom: pRect ? pRect.bottom : null,
    buttonHeight: pRect ? pRect.height : null,
    visiblePx: pRect ? clip(pRect.top, pRect.bottom, 0, innerHeight) : null,
  };
`;

async function loadFresh(session, url) {
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await session.wipe();
  const seed = await session.evaluate(SEED);
  if (!seed.value) throw new Error(`seed failed: ${JSON.stringify(seed)}`);
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1200);
}

export default async function (session) {
  const url = `${BASE}/game/freeze-tap/play/`;
  const out = { base: BASE, viewport: `${VP.w}x${VP.h}`, runs: [] };
  for (let i = 1; i <= LOADS; i += 1) {
    await loadFresh(session, url);
    const w = await session.evaluate('return [innerWidth, innerHeight];');
    if (w.value?.[0] !== VP.w || w.value?.[1] !== VP.h) {
      out.runs.push({ load: i, error: `void read: ${JSON.stringify(w.value)}` });
      continue;
    }
    let m = await session.evaluate(MEASURE);
    let clicked = null;
    // Seeding a ready roster can land straight on rule-reveal (press 0) without a click; if not,
    // press the biggest non-header button once to advance from setup.
    if (!m.value?.hasRuleContainer) {
      const click = await session.evaluate(clickFirstBigButton);
      if (!click.value?.found) {
        out.runs.push({ load: i, error: `no transition button: ${click.value?.why ?? click.error}` });
        continue;
      }
      clicked = click.value.label;
      await sleep(700);
      m = await session.evaluate(MEASURE);
    }
    if (!m.value?.hasRuleContainer) {
      out.runs.push({ load: i, error: `did not land on rule-reveal screen: ${JSON.stringify(m.value)}`, clicked });
      continue;
    }
    out.runs.push({ load: i, clicked, ...m.value });
  }
  return out;
}
