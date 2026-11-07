// gh#296 desktop layout: at 1100, 1280 and 1440 (mobile:false), /tool/wheel/ ships one 940px column,
// the disc track 460px left of the controls (name list last in that stack) inside the card, the name panel below the card, the ad
// slot and the how-to below that, and no sideways scroll. Read off the page, never typed in.
//
// Run: CDP_PORT=9381 PROBE_BASE=http://localhost:4402 PROBE_OUT=<result.json> node scripts/driver.mjs <this file>
// Red = the probe throws after writing PROBE_OUT.
import { writeFileSync } from 'node:fs';

const WIDTHS = [1100, 1280, 1440];
const READ = `
  await document.fonts.ready;
  const box = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left * 10) / 10, t: Math.round((r.top + scrollY) * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const wheel = document.getElementById('wheel');
  const before = getComputedStyle(wheel, '::before');
  const de = document.documentElement;
  const ctl = ['#wheel-result', '#wheel-note', '.wheel-actions', '.wheel-toggle', '#wheel-names'].map(box);
  return {
    innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
    over: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > de.clientWidth + 0.5).length,
    column: box('.wheel-column'), wheel: box('#wheel'), head: box('.wheel-head'), mode: box('.wheel-mode'),
    stage: box('.wheel-stage'), disc: box('#wheel-disc'), result: ctl[0], note: ctl[1], actions: ctl[2], toggle: ctl[3],
    names: box('#wheel-names'), entry: box('#tool-name-entry'), nav: box('.wheel-next'), ad: box('.ad-slot'), howto: box('#how-to-use'),
    adMinHeight: getComputedStyle(document.querySelector('.ad-slot')).minHeight,
    card: { content: before.content, gridRow: before.gridRowStart + '/' + before.gridRowEnd, width: before.width, height: before.height, border: before.borderTopWidth, shadow: before.boxShadow },
    controlsTop: ctl[0].t, controlsBottom: ctl[4].t + ctl[4].h,
    modeRows: new Set([...document.querySelectorAll('.wheel-mode-option')].map((e) => Math.round(e.getBoundingClientRect().top))).size,
  };
`;

export default async function (session) {
  const base = process.env.PROBE_BASE || 'http://localhost:4402';
  const rows = [];
  const fails = [];
  for (const w of WIDTHS) {
    await session.setWidth(w, 900, false);
    await session.nav(`${base}/tool/wheel/`);
    await session.wipe();
    await session.nav(`${base}/tool/wheel/`);
    const r = await session.evaluate(READ);
    if (r.error) throw new Error(`${w}: ${r.error}`);
    const v = r.value;
    rows.push({ width: w, ...v });
    const f = (m) => fails.push(`${w}: ${m}`);
    if (v.innerWidth !== w) f(`innerWidth ${v.innerWidth}, run void`);
    if (v.scrollWidth !== v.clientWidth || v.over) f(`sideways overflow: scrollWidth ${v.scrollWidth} clientWidth ${v.clientWidth} over ${v.over}`);
    if (v.column.w !== 940) f(`column ${v.column.w}px, want 940`);
    if (v.stage.w !== 460) f(`disc track ${v.stage.w}px, want 460`);
    if (v.disc.w !== 400) f(`disc ${v.disc.w}px, want 400`);
    if (!(v.result.l >= v.stage.l + v.stage.w + 30 - 0.1)) f('controls not right of the disc track by the 30px gap');
    if (v.card.content === 'none') f('no card drawn');
    // Owner popup 2026-11-07: no empty full-width band at the card's foot. The name list sits in the
    // controls column, so the card ends one padding (28.5px) below the taller of disc track and stack.
    const inner = Math.max(v.stage.t + v.stage.h, v.controlsBottom);
    if (!(v.names.l >= v.stage.l + v.stage.w + 30 - 0.1)) f('name list not in the controls column');
    if (Math.abs(v.entry.t - 36 - inner - 28.5) > 1) f(`card foot ${Math.round(v.entry.t - 36 - inner)}px below its content, want 28.5`);
    if (!(v.entry.t >= inner + 28.5 + 36 - 0.1)) f('name panel not below the card by 36px');
    if (v.entry.w !== 940) f(`name panel ${v.entry.w}px, want 940`);
    if (!(v.nav.t > v.entry.t && v.ad.t > v.nav.t && v.howto.t > v.ad.t)) f('order below the card is not panel, nav, ad, how-to');
    if (v.adMinHeight !== '250px') f(`ad min-height ${v.adMinHeight}`);
    if (v.modeRows !== 1) f(`mode radios on ${v.modeRows} rows`);
    // Centre alignment, the board's: the controls stack and the disc track share a midline.
    const cMid = (v.controlsTop + v.controlsBottom) / 2, dMid = v.stage.t + v.stage.h / 2;
    if (Math.abs(cMid - dMid) > 1) f(`controls midline ${cMid} vs disc midline ${dMid}`);
  }
  const out = { probe: 'gh296-desktop-layout', base, pass: fails.length === 0, fails, rows };
  if (process.env.PROBE_OUT) writeFileSync(process.env.PROBE_OUT, JSON.stringify(out, null, 2) + '\n');
  if (fails.length) throw new Error(`layout red (${fails.length}): ${fails.join(' | ')}`);
  return { pass: true, rows: rows.map((r) => `${r.width}: sw ${r.scrollWidth}/${r.clientWidth} over ${r.over} col ${r.column.w} stage ${r.stage.h} controls ${r.controlsBottom - r.controlsTop}`) };
}
