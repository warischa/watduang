// gh#288 Phase 0 — LCP and CLS on the LIVE site under CDP throttling. An APPROXIMATION, not a field
// metric: headless Chrome on a Mac, emulated network and CPU, n=3 cold loads per page, no AdSense
// (gh#29: no account, so the ad boxes are placeholders). Throttle: 150ms RTT, 1.6 Mbps down,
// 750 Kbps up, CPU 4x slowdown, cache disabled; 390x844 mobile emulation.
// Controls: (1) CLS must-red — the same page with a script that pushes a 200px block in at the top
// 600ms after load must read CLS > 0; (2) throttle control — one unthrottled load of / must read a
// lower LCP than the throttled ones, or the throttle never applied.
//   CDP_PORT=9310 ORIGIN=<live origin> OUT=<json> node <this file>
import { open } from './cdp-lib.mjs';
import { writeFile } from 'node:fs/promises';
const ORIGIN = process.env.ORIGIN || 'https://white-plant-05ad7c600.7.azurestaticapps.net';
const PAGES = (process.env.PAGES || '/,/tools/,/tool/wheel/,/tool/draw/,/tool/team/,/tool/number/,/c/fortune/,/c/party/,/game/siamsi/,/game/daily-fortune/,/game/love-match/,/404.html').split(',');
const N = Number(process.env.N || 3);
const s = await open();
await s.send('Network.enable');
await s.setWidth(390, 844, true);
const throttle = async (on) => {
  await s.send('Network.setCacheDisabled', { cacheDisabled: true });
  await s.send('Network.emulateNetworkConditions', on ? { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await s.send('Emulation.setCPUThrottlingRate', { rate: on ? 4 : 1 });
};
const READ = `
  await new Promise((r) => setTimeout(r, 3000));
  const lcp = await new Promise((res) => { let last = null; new PerformanceObserver((l) => { const es = l.getEntries(); last = es[es.length - 1]; }).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => res(last ? { ms: Math.round(last.startTime), el: last.element ? (last.element.tagName.toLowerCase() + (last.element.className && typeof last.element.className === 'string' ? '.' + last.element.className.split(' ')[0] : '') + ' ' + (last.element.textContent || last.url || '').trim().slice(0, 24)) : null, url: last.url ? last.url.split('/').pop() : null } : null), 200); });
  const cls = await new Promise((res) => { let sum = 0; const shifts = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { sum += e.value; shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: e.sources?.map((x) => x.node ? (x.node.nodeName + '.' + (x.node.className || '')).slice(0, 40) : '?').slice(0, 3) }); } }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => res({ sum: +sum.toFixed(4), shifts: shifts.slice(0, 5) }), 200); });
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const res = performance.getEntriesByType('resource');
  return { lcp, cls, fcp: fcp ? Math.round(fcp.startTime) : null, ttfb: Math.round(nav.responseStart), load: Math.round(nav.loadEventEnd), requests: res.length + 1, kb: Math.round((nav.transferSize + res.reduce((a, r) => a + (r.transferSize || 0), 0)) / 1024) };
`;
const out = { origin: ORIGIN, throttle: '150ms RTT · 1.6 Mbps down · 750 Kbps up · CPU 4x · cache off · 390x844 mobile', n: N, pages: {}, controls: {} };
await throttle(true);
for (const p of PAGES) {
  out.pages[p] = [];
  for (let i = 0; i < N; i++) { const t = await s.nav(ORIGIN + p, 60000); const r = await s.ev(READ); out.pages[p].push({ nav: t, ...r }); }
}
// (1) CLS must-red
const inj = await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('load', () => setTimeout(() => { const d = document.createElement('div'); d.style.height = '200px'; document.body.prepend(d); }, 600));` });
await s.nav(ORIGIN + '/tools/', 60000);
out.controls.clsMustRed = await s.ev(READ);
await s.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inj.result.identifier });
// (2) throttle control
await throttle(false);
await s.nav(ORIGIN + '/', 60000);
out.controls.unthrottledHome = await s.ev(READ);
out.events = s.events;
await s.close();
if (process.env.OUT) await writeFile(process.env.OUT, JSON.stringify(out, null, 1));
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
for (const [p, runs] of Object.entries(out.pages)) console.log(p.padEnd(22), 'LCP med', med(runs.map((r) => r.lcp?.ms ?? -1)), 'range', Math.min(...runs.map((r) => r.lcp?.ms ?? -1)) + '-' + Math.max(...runs.map((r) => r.lcp?.ms ?? -1)), 'CLS max', Math.max(...runs.map((r) => r.cls.sum)), 'FCP med', med(runs.map((r) => r.fcp)), 'kB', runs[0].kb, 'req', runs[0].requests, 'lcpEl', runs[0].lcp?.el);
console.log('CLS must-red', JSON.stringify(out.controls.clsMustRed.cls), 'unthrottled home LCP', out.controls.unthrottledHome.lcp?.ms, 'events', s.events.length);
process.exit(0);
