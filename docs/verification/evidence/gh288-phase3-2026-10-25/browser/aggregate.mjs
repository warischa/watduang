// Reads results-<w>-<lane>.json (same dir) and judges the nine assertion groups.
// Usage: node aggregate.mjs  -> writes summary.json, prints counts + failures.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const TOOLS = ['/tool/draw/', '/tool/team/', '/tool/number/', '/tool/wheel/'];
const FORTUNE = ['/game/siamsi/', '/game/love-match/', '/game/daily-fortune/'];
const WEB = ['/', '/tools/', '/c/party/', '/c/fortune/', ...TOOLS, ...FORTUNE, '/404.html'];
const PLAY = '/game/bangkok-drift/play/';
const groups = {};
const fails = [];
const rows = [];
const g = (id, page, w, lane, label, ok, measured) => {
  groups[id] ??= { n: 0, pass: 0 };
  groups[id].n++;
  if (ok) groups[id].pass++;
  else fails.push({ group: id, page, width: w, lane, assertion: label, measured });
  rows.push({ group: id, page, width: w, lane, assertion: label, ok: !!ok, measured });
};
for (const lane of ['normal', 'reduced']) for (const w of [320, 390, 1440]) {
  const f = `${dir}/results-${w}-${lane}.json`;
  if (!existsSync(f)) { g('0-run', 'all', w, lane, 'results file present', false, 'missing'); continue; }
  const R = JSON.parse(readFileSync(f, 'utf8'));
  const P = R.pages;
  const red = lane === 'reduced';
  for (const p of [...WEB, PLAY]) {
    const r = P[p];
    if (!r) { g('0-run', p, w, lane, 'page ran', false, 'missing'); continue; }
    if (r.error) g('0-run', p, w, lane, 'page ran without script error', false, r.error);
    // lane proof
    g('0-run', p, w, lane, 'media emulation took (reduce matches lane, hover true, innerWidth)', r.mediaAtLoad && r.mediaAtLoad.reduce === red && r.mediaAtLoad.hover === true && r.mediaAtLoad.innerWidth === w, r.mediaAtLoad);
    // 1 focus
    if (p !== PLAY) g('1-focus', p, w, lane, 'real Tab: 3px solid ink offset 3px (gold in bar/band)', r.focus && r.focus.pass, r.focus && { first: r.focus.firstBar && r.focus.firstBar.outlineColor, firstOutside: r.focus.firstOutside, sun: r.focus.sun, tabs: r.focus.tabs });
    // 8 console + resources
    g('8-smoke', p, w, lane, 'no console errors / exceptions', (r.consoleErrors || []).length === 0, r.consoleErrors);
    g('8-smoke', p, w, lane, 'no 4xx/5xx subresources', (r.badResources || []).length === 0, r.badResources);
    // 9 layout
    const L = r.layoutEnd || r.loadLayout;
    g('9-layout', p, w, lane, 'scrollWidth === clientWidth and innerWidth === width', L && L.scrollWidth === L.clientWidth && L.innerWidth === w, L);
    const C = r.scroll && r.scroll.cls && r.scroll.cls.afterScroll ? r.scroll.cls.afterScroll : L;
    g('9-layout', p, w, lane, 'CLS <= 0.05 over load + first interaction', C && C.cls <= 0.05, C && { cls: C.cls, clsIncludingInputShifts: C.clsAll });
    if (r.scroll && r.scroll.cls && r.scroll.cls.afterReload) g('9b-cls-reload', p, w, lane, 'CLS <= 0.05 in the document reloaded from mid-page (beyond the brief)', r.scroll.cls.afterReload.cls <= 0.05, { cls: r.scroll.cls.afterReload.cls, clsAll: r.scroll.cls.afterReload.clsAll });
    // 7 view-transition rule
    if (p === PLAY) g('7-vt', p, w, lane, 'play route carries no @view-transition', r.vt && r.vt.n === 0, r.vt);
    else g('7-vt', p, w, lane, 'page carries @view-transition', r.vt && r.vt.ctorExists && r.vt.n >= 1, r.vt);
  }
  for (const p of TOOLS) {
    const r = P[p]; if (!r || r.error) continue;
    const st = r.structure || {};
    g('3-tools', p, w, lane, 'one .tool-band + one h1', st.toolBand === 1 && st.h1 === 1, { toolBand: st.toolBand, h1: st.h1 });
    g('3-tools', p, w, lane, 'ad slot label ช่องโฆษณา, no 728, dashed', st.adText === 'ช่องโฆษณา' && st.ad728 === false && st.adBorderStyle === 'dashed', { text: st.adText, ad728: st.ad728, border: st.adBorderStyle, box: st.adBox });
    g('3-tools', p, w, lane, 'ad slot box unchanged idle -> after result', JSON.stringify(st.adBoxIdle) === JSON.stringify(st.adBoxAfter), { idle: st.adBoxIdle, after: st.adBoxAfter });
    if (p === '/tool/draw/') g('3-tools', p, w, lane, 'idle dashed placeholder visible before result', r.idle.borderStyle === 'dashed' && r.idle.visible && r.idle.text === '', r.idle);
    if (p === '/tool/team/') g('3-tools', p, w, lane, 'idle dashed placeholder visible before result', r.idle.borderStyle === 'dashed' && r.idle.visible && r.idle.empty, r.idle);
    if (p === '/tool/wheel/') g('3-tools', p, w, lane, 'idle disc drawn before names', r.idle.discW > 0 && r.idle.drawn > 0, r.idle);
    g('2-hover', p, w, lane, `enabled go: ${red ? 'no transform, shadow 6px 6px 0 ink; press 0 0 0' : 'lift -2,-2 shadow 6px; press 4,4 shadow 0'}`, r.hoverEnabledPass, r.hoverEnabled && { hovDelta: r.hoverEnabled.hovDelta, actDelta: r.hoverEnabled.actDelta, rest: r.hoverEnabled.rest.boxShadow, hov: r.hoverEnabled.hov.boxShadow, act: r.hoverEnabled.act.boxShadow });
    g('2-hover', p, w, lane, 'disabled go: opacity .4, shadow none, cursor default, no lift', r.hoverDisabledPass, r.hoverDisabled && { rest: r.hoverDisabled.rest, hovDelta: r.hoverDisabled.hovDelta });
    g('4-reveal', p, w, lane, `wd-reveal${red ? '-rm 200ms' : ' 280ms'} animation on result node + role=status text is the result`, r.revealPass, { anims: r.reveal && r.reveal.anims, status: r.reveal && r.reveal.status });
    g('8-smoke', p, w, lane, 'tool produces a result', !!(r.result && r.result.length), r.result);
  }
  for (const p of FORTUNE) {
    const r = P[p]; if (!r || r.error) continue;
    g('2-hover', p, w, lane, 'fortune .game-btn has no ui-press and does not lift', r.hoverGameBtn && r.hoverGameBtn.noPress, r.hoverGameBtn && { rest: r.hoverGameBtn.h.rest, hovDelta: r.hoverGameBtn.h.hovDelta });
    g('4-reveal', p, w, lane, `idle stage has no wd-reveal animation (must-red control)`, r.idleRevealAnims === 0, r.idleRevealAnims);
    g('4-reveal', p, w, lane, `wd-reveal${red ? '-rm 200ms' : ' 280ms'} on result node`, r.reveal && r.reveal.revealPass, r.reveal && r.reveal.anims);
    g('4-reveal', p, w, lane, 'reveal ends before stage buttons arm', r.reveal && r.reveal.orderPass, r.reveal && { revealEnd: r.reveal.revealEnd, armAt: r.reveal.armAt, marginMs: r.reveal.marginMs });
    g('4-reveal', p, w, lane, 'role=status live region carries the result (brief premise)', r.reveal && r.reveal.status.some((x) => x.text.length > 0), r.reveal && { roleStatusNodes: r.reveal.status.length });
    g('8-smoke', p, w, lane, 'flow reaches result and again path works', r.againOk === true && (p !== '/game/siamsi/' || (r.holdLanded && r.keepScreen)), { again: r.againOk, hold: r.holdLanded, keep: r.keepScreen, result: (r.resultText || '').slice(0, 40) });
  }
  for (const p of ['/', '/c/party/']) {
    const r = P[p]; if (!r || r.error || !r.scroll) continue;
    const s = r.scroll;
    g('5-scroll', p, w, lane, `load: none above fold pending, never-hit set clear, pending hidden${red ? ', no translate' : ', translate 0 16px'}`, s.loadPass, s.load);
    g('5-scroll', p, w, lane, s.afterScroll ? 'scrolled into view: opacity 1, translate none, classes removed' : 'no below-fold section pending (n/a at this size)', s.afterScroll ? s.afterScroll.pass : s.load.pending === 0, s.afterScroll || s.load);
    g('5-scroll', p, w, lane, 'reload from mid-page: nothing in view stays hidden', s.reloadPass, s.reload);
  }
  { const r = P['/']; if (r && r.hero) {
    const h = r.hero;
    const ok = h.count >= 1 && h.ariaHidden === 'true' && (red ? h.animations.length === 0 && h.opacity === '0.06' : h.opacity === '0.12' && h.animations.some((a) => a.state === 'running' && a.props.includes('transform')));
    g('6-hero', '/', w, lane, red ? '.ambient aria-hidden, opacity .06, no animation' : '.ambient aria-hidden, opacity .12, running transform animation', ok, h);
  } }
  for (const k of ['nav:web-to-web', 'nav:web-to-play']) {
    const t = P[k]; if (!t) { g('7-vt', k, w, lane, 'navigation ran', false, 'missing'); continue; }
    if (k === 'nav:web-to-web') g('7-vt', k, w, lane, 'real link click web->web lands, VT finished, no errors', t.ok && t.landed && t.landed.p === '/tools/' && t.vtState === 'finished' && t.errors.length === 0, t);
    else g('7-vt', k, w, lane, 'real link click web->play lands, play works, no VT, no errors', t.ok && t.playWorks && !t.playHasVT && t.errors.length === 0, t);
  }
  { const r = P[PLAY]; if (r && r.play) g('7-vt', PLAY, w, lane, 'play route: no web.css effects, no reveal-pending, stage mounted', r.play.uiPress === 0 && r.play.wdReveal === 0 && r.play.pending === 0 && r.play.pendingAfterScroll === 0 && r.play.stageChildren > 0 && !r.play.webCssLinked, r.play); }
}
const summary = { groups, failCount: fails.length, fails };
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 1));
writeFileSync(`${dir}/assertions.json`, JSON.stringify(rows, null, 0));
console.log(JSON.stringify(groups));
for (const f of fails) console.log('FAIL', f.group, f.page, f.width, f.lane, f.assertion, JSON.stringify(f.measured).slice(0, 260));
