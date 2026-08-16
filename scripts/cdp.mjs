// Minimal Chrome DevTools Protocol driver — zero dependencies (Node 22 has a global WebSocket).
//
//   node scripts/cdp.mjs <url> <probe.js>
//
// <probe.js> is evaluated inside the page as an async function body; whatever it returns is
// printed as JSON. Everything else is env-var flags, documented in docs/agents/browser-verification.md.
// Every env flag that names a probe (CDP_STAGE2) takes a FILE PATH, same as <probe.js> — not
// inline script text.
//
// This exists because the tool pages' 320px and reduced-motion claims can only be settled in a
// real browser, and installing Playwright for that would triple this project's dependency list.
const [url, scriptPath] = process.argv.slice(2);
const { readFile, writeFile } = await import('node:fs/promises');
const expr = await readFile(scriptPath, 'utf8');

const PORT = process.env.CDP_PORT || 9222;
const api = async (p, method = 'GET') =>
  (await fetch(`http://127.0.0.1:${PORT}${p}`, { method })).json();

// /json/new requires PUT on current Chrome; /json/close returns plain text, not JSON.
const target = await api(`/json/new?${encodeURIComponent(url)}`, 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
});
await new Promise((r) => ws.addEventListener('open', r));

const settle = (ms = 1800) => new Promise((r) => setTimeout(r, ms));
const evaluate = (body) =>
  send('Runtime.evaluate', {
    expression: `(async () => { ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
const report = (res) => {
  const r = res?.result;
  if (!r) return console.log(JSON.stringify({ error: 'no result from Runtime.evaluate', raw: res }));
  if (r.exceptionDetails) {
    return console.log(JSON.stringify({
      error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
    }));
  }
  console.log(JSON.stringify(r.result?.value ?? null));
};

await send('Page.enable');
await send('Runtime.enable');

// CDP_WIDTH gives a REAL narrow viewport. Chrome's --window-size does NOT: --dump-dom always
// renders at innerWidth=500, and --screenshot yields a correctly-sized PNG that is a CROP of a
// wider layout. Only setDeviceMetricsOverride actually reflows the page.
if (process.env.CDP_WIDTH) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(process.env.CDP_WIDTH),
    height: Number(process.env.CDP_HEIGHT || 900),
    deviceScaleFactor: 1,
    mobile: true,
  });
}
await settle(1000);

// roster/group live in localStorage and survive across tabs, so a probe would otherwise measure
// whatever the previous probe left behind. CDP_KEEP=1 keeps that state deliberately — needed to
// ask "what does a RETURNING user see on first paint?".
if (!process.env.CDP_KEEP) {
  await evaluate('localStorage.clear(); sessionStorage.clear();');
}
// The reload is always required, wipe or no wipe: without it the initial navigation's execution
// context is stale by evaluate time and Runtime.evaluate fails "target navigated or closed".
await send('Page.reload');
await settle();

const out = await evaluate(expr);

// CDP_STAGE2 reloads IN THE SAME TAB and evaluates a second probe, returning ITS result.
// Mandatory for anything touching a game checkpoint: those live in sessionStorage, which is
// per-tab, so a second cdp.mjs run opens a fresh tab and can never observe one. Getting this
// wrong makes a positive control silently pass nothing.
//
// CDP_STAGE2 is a PATH to a probe file, same as the positional <probe.js> argument — not inline
// script text. Prints stage-1's result first, then stage-2's: two-stage calibration in ONE
// invocation is two JSON lines on stdout, not two separate cdp.mjs runs.
if (process.env.CDP_STAGE2) {
  report(out);
  let stage2Src;
  try {
    stage2Src = await readFile(process.env.CDP_STAGE2, 'utf8');
  } catch (err) {
    console.log(JSON.stringify({
      error: `CDP_STAGE2 must be a path to a probe file, not inline script text: readFile(${JSON.stringify(process.env.CDP_STAGE2)}) failed — ${err.message}`,
    }));
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
    ws.close();
    process.exit(1);
  }
  await send('Page.reload');
  await settle();
  report(await evaluate(stage2Src));
} else {
  // Captures through the emulated viewport, so the image reflects a real reflow at CDP_WIDTH.
  if (process.env.CDP_SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(process.env.CDP_SHOT, Buffer.from(shot.result.data, 'base64'));
  }
  report(out);
}

await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
process.exit(0);
