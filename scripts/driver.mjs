// One-tab CDP driver — needed for two things scripts/cdp.mjs cannot do:
//   1. real Page.navigate to a DIFFERENT url in the SAME tab (sessionStorage is per-tab, per-origin)
//   2. capture Runtime.consoleAPICalled / Runtime.exceptionThrown (cdp.mjs drops non-id messages)
//
// Usage: node scripts/driver.mjs <script.mjs>
// <script.mjs> default-exports an async function(session) that gets:
//   session.nav(url)              -> Page.navigate + wait for load, returns nothing
//   session.setWidth(w,h)         -> Emulation.setDeviceMetricsOverride
//   session.evaluate(exprString)  -> Runtime.evaluate, returns {value, error}
//   session.wipe()                -> localStorage.clear(); sessionStorage.clear()
//   session.screenshot(path)
//   session.consoleErrors         -> array, appended live from Runtime.exceptionThrown + console.error
//   session.close()
const [scriptPath] = process.argv.slice(2);
const { pathToFileURL } = await import('node:url');
const { writeFile } = await import('node:fs/promises');
const mod = await import(pathToFileURL(scriptPath).href);

const PORT = process.env.CDP_PORT || 9222;
const api = async (p, method = 'GET') =>
  (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();

const target = await api(`/json/new?about:blank`, 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const consoleErrors = [];

const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

let loadResolve = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
  if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push({ kind: 'exception', text: m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text });
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push({ kind: 'console.error', text: m.params.args?.map((a) => a.value ?? a.description).join(' ') });
  }
});
await new Promise((r) => ws.addEventListener('open', r));

await send('Page.enable');
await send('Runtime.enable');

const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));

const session = {
  consoleErrors,
  async nav(url) {
    const p = new Promise((r) => { loadResolve = r; });
    await send('Page.navigate', { url });
    await p;
    await settle();
  },
  async setWidth(width, height = 900) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await settle(300);
  },
  async wipe() {
    await this.evaluate('localStorage.clear(); sessionStorage.clear(); return true;');
  },
  async evaluate(body) {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const r = res?.result;
    if (r?.exceptionDetails) {
      return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    }
    return { value: r?.result?.value ?? null };
  },
  async screenshot(path) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path, Buffer.from(shot.result.data, 'base64'));
  },
  async close() {
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
    ws.close();
  },
};

const out = await mod.default(session);
await session.close();
console.log(JSON.stringify(out, null, 2));
process.exit(0);
