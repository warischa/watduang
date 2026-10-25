// Control for the web->play console exception: NO script injected by the probe (no onNewDocument), plain
// real link click, console captured by the driver. Usage: CDP_PORT=9444 node scripts/driver.mjs <this file>
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function (s) {
  const out = {};
  for (const [label, from, sel] of [
    ['web-to-play', '/c/party/', 'a[href^="/game/"][href$="/play/"]'],
    ['web-to-web', '/', 'a.chrome-pill[href="/tools/"]'],
    ['play-to-web', '/game/timebomb/play/', null],
  ]) {
    await s.nav('http://localhost:4333' + from);
    await s.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const m0 = s.consoleErrors.length;
    if (!sel) { out[label] = { skipped: 'no link selector' }; continue; }
    const c = (await s.evaluate(`const a = document.querySelector(${JSON.stringify(sel)}); a.scrollIntoView({block:'center'}); const r = a.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2, href: a.getAttribute('href')};`)).value;
    await s.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', buttons: 0 });
    await s.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
    await s.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(2500);
    const where = (await s.evaluate('return location.pathname')).value;
    out[label] = { href: c.href, landed: where, errors: s.consoleErrors.slice(m0).map((e) => `${e.kind}: ${String(e.text).slice(0, 200)}`) };
  }
  return out;
}
