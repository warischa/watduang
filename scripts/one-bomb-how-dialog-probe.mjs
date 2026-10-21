// gh#286 box 1 -- one-bomb's how-to-play dialog, measured OPEN at 320x568.
//
// MANUAL, NOT WIRED into scripts/ci-probes.sh. It answers one ticket's question: the fit probe reads
// one-bomb 320x568 as 79px clipped by #app on the CI runner and names a `.glassPanel.modalBox` as the
// furthest-below box, but never opens the dialog. This probe opens it and records, against #app:
//   - the dialog box and its last rules line (the dialog's last list item), closed and open
//   - whether anything between that line and #app can scroll it into view
//   - the face Chrome actually shaped the rules text with (CSS.getPlatformFontsForNode). The computed
//     font-family only echoes the declared stack; it cannot say which member rendered.
//
// The two readings, fixed before the runner run:
//   lastLine.overhang > 0 and no scrollable ancestor -> rules text is unreachable: a layout defect
//   lastLine.overhang <= 0 while box.overhang > 0      -> only the box's bottom padding is cut: the
//                                                         "rules unreachable" half of gh#286 is refuted
// Open and closed geometry are expected to match (visibility and opacity do not lay out); the open
// read is there to catch a script that repositions the dialog on open.
//
// Emulation matches the fit probe's load(): mobile metrics, wiped storage, a second navigation.
// MUSTRED_PAD=1 injects a 200px top padding into the dialog box before measuring: the must-red leg,
// which has to read a positive overhang on BOTH deltas on a machine where the dialog fits.
// SHOT=<path> writes a screenshot of the open dialog.
//
// Usage: serve dist/, start Chrome with --remote-debugging-port, then
//   BASE=http://localhost:<port> CDP_PORT=<cdp> node scripts/driver.mjs scripts/one-bomb-how-dialog-probe.mjs
// Prints `::notice::` lines and returns the full reading as JSON.

const BASE = process.env.BASE || 'http://localhost:4321';
const CDP_PORT = process.env.CDP_PORT || 9222;
const MUSTRED = process.env.MUSTRED_PAD === '1';
const VP = { w: 320, h: 568 };
const URL_PATH = '/game/one-bomb/play/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = `
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const app = document.getElementById('app');
  const overlay = document.getElementById('howModal');
  const box = overlay?.querySelector('.modalBox');
  const items = overlay ? [...overlay.querySelectorAll('li')] : [];
  const last = items[items.length - 1] ?? null;
  const appR = rect(app);
  const scrollers = [];
  for (let el = last; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    scrollers.push({ el: el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].join('.') : ''),
      overflowY: cs.overflowY, scrollH: el.scrollHeight, clientH: el.clientHeight });
    if (el === app) break;
  }
  const canScroll = scrollers.some((s) => (s.overflowY === 'auto' || s.overflowY === 'scroll') && s.scrollH > s.clientH);
  const lineCount = (el) => { if (!el) return null; const lh = parseFloat(getComputedStyle(el).lineHeight); return lh ? +(el.getBoundingClientRect().height / lh).toFixed(2) : null; };
  const lastR = rect(last);
  let hit = null;
  if (lastR) { const e = document.elementFromPoint(lastR.x + Math.round(lastR.w / 2), lastR.bottom - 2); hit = e ? (e.id ? '#' + e.id : e.tagName.toLowerCase()) : null; }
  return {
    innerW: innerWidth, innerH: innerHeight,
    fontsStatus: document.fonts.status,
    fontFamily: box ? getComputedStyle(box).fontFamily : null,
    open: overlay?.classList.contains('open') ?? null,
    visibility: overlay ? getComputedStyle(overlay).visibility : null,
    app: appR, appScrollH: app?.scrollHeight ?? null, appClientH: app?.clientHeight ?? null,
    overlay: rect(overlay), box: rect(box), lastLine: lastR,
    boxOverhang: box && appR ? rect(box).bottom - appR.bottom : null,
    lastLineOverhang: lastR && appR ? lastR.bottom - appR.bottom : null,
    lines: { p: lineCount(box?.querySelector('p')), items: items.map(lineCount), h2: lineCount(box?.querySelector('h2')) },
    scrollers, canScroll, hitAtLastLineBottom: hit,
  };
`;

async function platformFonts(session, selector) {
  const doc = await session.cdp('DOM.getDocument', { depth: 0 });
  const q = await session.cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector });
  if (!q.result?.nodeId) return { selector, error: 'no node' };
  const f = await session.cdp('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId });
  if (f.error) return { selector, error: f.error.message };
  return { selector, fonts: f.result.fonts.map((x) => ({ family: x.familyName, postScript: x.postScriptName, custom: x.isCustomFont, glyphs: x.glyphCount })) };
}

export default async function (session) {
  const version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json().catch(() => ({}));
  const url = `${BASE}${URL_PATH}`;
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await session.wipe();
  await session.nav(url);
  await session.setWidth(VP.w, VP.h);
  await sleep(1500);
  if (MUSTRED) {
    await session.evaluate(`const s = document.createElement('style'); s.textContent = '#howModal .modalBox { padding-top: 200px !important; }'; document.head.appendChild(s); return true;`);
  }
  const closed = await session.evaluate(MEASURE);
  const opened = await session.evaluate(`
    const o = document.getElementById('howModal');
    if (!o) return { error: 'no #howModal' };
    o.classList.add('open');
    await new Promise((r) => setTimeout(r, 400));
    ${MEASURE}
  `);
  if (process.env.SHOT) await session.screenshot(process.env.SHOT);
  await session.cdp('DOM.enable');
  await session.cdp('CSS.enable');
  const fonts = [];
  for (const sel of ['#howModal .modalBox h2', '#howModal .modalBox p', '#howModal li:last-child']) fonts.push(await platformFonts(session, sel));

  const o = opened.value ?? {};
  const verdict = opened.error || o.error ? 'ERROR'
    : o.lastLineOverhang > 0 && !o.canScroll ? 'RULES-UNREACHABLE'
    : o.boxOverhang > 0 ? 'PADDING-ONLY-CLIPPED'
    : 'FITS';
  const fontLine = fonts.map((f) => `${f.selector} = ${f.error ?? f.fonts.map((x) => `${x.family}${x.custom ? '(web)' : ''}x${x.glyphs}`).join('+')}`).join(' | ');
  console.log(`::notice::one-bomb how-dialog ${VP.w}x${VP.h}${MUSTRED ? ' [MUSTRED_PAD]' : ''}: ${verdict} -- box ${o.box?.y},${o.box?.h} overhang ${o.boxOverhang}px, last rule bottom ${o.lastLine?.bottom} vs #app bottom ${o.app?.bottom} = ${o.lastLineOverhang}px, canScroll ${o.canScroll}, fonts.status ${o.fontsStatus}, ${version.Browser ?? 'browser ?'}`);
  console.log(`::notice::one-bomb how-dialog fonts: ${fontLine}`);
  console.log(`::notice::one-bomb how-dialog lines: p ${o.lines?.p} items ${JSON.stringify(o.lines?.items)} h2 ${o.lines?.h2}; closed boxOverhang ${closed.value?.boxOverhang} lastLineOverhang ${closed.value?.lastLineOverhang}`);
  return { verdict, mustred: MUSTRED, browser: version.Browser ?? null, userAgent: version['User-Agent'] ?? null, url: URL_PATH, vp: VP, closed, opened, fonts, anyRunErrored: verdict === 'ERROR' };
}
