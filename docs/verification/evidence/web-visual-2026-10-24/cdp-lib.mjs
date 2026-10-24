// gh#288 Phase 0 — raw CDP session shared by this dir's probes. driver.mjs has no raw send(), and these
// probes need Emulation.setEmulatedMedia (reduced motion), Input.* (real Tab / mouse / text) and
// Network/CPU throttling. One tab per session; nav() waits on load with a timeout (driver.mjs has none).
export async function open(port = process.env.CDP_PORT || 9310) {
  const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let loadRes = null; const events = []; const listeners = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method && listeners.has(m.method)) for (const fn of listeners.get(m.method)) fn(m.params);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Page.loadEventFired' && loadRes) { loadRes(); loadRes = null; }
    if (m.method === 'Runtime.exceptionThrown') events.push({ exception: m.params.exceptionDetails?.exception?.description?.slice(0, 200) ?? m.params.exceptionDetails?.text });
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') events.push({ consoleError: m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200) });
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable');
  const s = {
    send, sleep, events,
    on(method, fn) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); },
    // Trace one async action; returns the trace events (ReportEvents mode, so no stream handling).
    async trace(categories, action) {
      const evs = []; let done; const fin = new Promise((r) => { done = r; });
      s.on('Tracing.dataCollected', (p) => evs.push(...p.value));
      s.on('Tracing.tracingComplete', () => done());
      await send('Tracing.start', { categories, transferMode: 'ReportEvents' });
      const result = await action();
      await send('Tracing.end'); await fin;
      listeners.delete('Tracing.dataCollected'); listeners.delete('Tracing.tracingComplete');
      return { result, events: evs };
    },
    async nav(url, timeout = 30000) {
      const p = new Promise((r) => { loadRes = r; });
      await send('Page.navigate', { url });
      const t = await Promise.race([p.then(() => 'load'), sleep(timeout).then(() => 'timeout')]);
      await sleep(400);
      return t;
    },
    async setWidth(width, height, mobile) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      else await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    },
    async reducedMotion(on) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] });
    },
    // Function BODY, like driver.mjs: write `return x`.
    async ev(body) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description?.slice(0, 300) ?? r.result.exceptionDetails.text };
      return r.result?.result?.value;
    },
    async shot(path, opts = {}) {
      const { writeFile } = await import('node:fs/promises');
      const r = await send('Page.captureScreenshot', { format: opts.format || 'png', quality: opts.quality, captureBeyondViewport: !!opts.full, clip: opts.clip });
      await writeFile(path, Buffer.from(r.result.data, 'base64'));
    },
    async key(key, code, keyCode, shift = false) {
      const mod = shift ? 8 : 0;
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers: mod });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers: mod });
    },
    tab(shift = false) { return s.key('Tab', 'Tab', 9, shift); },
    async mouse(type, x, y, buttons = 0) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
    },
    async click(x, y) { await s.mouse('mouseMoved', x, y); await s.mouse('mousePressed', x, y, 1); await s.mouse('mouseReleased', x, y); },
    async tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async type(text) { await send('Input.insertText', { text }); },
    async close() { await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`); ws.close(); },
  };
  return s;
}
