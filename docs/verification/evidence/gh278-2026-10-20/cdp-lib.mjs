// Minimal raw CDP session on a fresh tab (port from CDP_PORT, default 9461).
export async function session(port = process.env.CDP_PORT || 9461) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); });
  const send = (method, params = {}) => new Promise((res) => { pend.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const d of ['Page', 'Runtime', 'DOM', 'CSS']) await send(`${d}.enable`);
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
  const nav = async (url) => { await send('Page.navigate', { url }); await sleep(1200); };
  const setVp = (w, h, dsf = 1) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: true });
  const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.click();return 'ok'})()`);
  const shot = async (path, clip) => { const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); (await import('node:fs')).writeFileSync(path, Buffer.from(r.result.data, 'base64')); };
  const fonts = async (sel) => { const d = await send('DOM.getDocument', { depth: 0 }); const q = await send('DOM.querySelector', { nodeId: d.result.root.nodeId, selector: sel }); if (!q.result?.nodeId) return null; const f = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId }); return (f.result?.fonts || []).map((x) => `${x.familyName}|${x.postScriptName}|${x.glyphCount}`); };
  const close = async () => { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`); };
  return { send, ev, nav, setVp, click, shot, fonts, sleep, close };
}
