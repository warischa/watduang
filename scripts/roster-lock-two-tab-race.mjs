// Two-tab roster.add() concurrency harness for the navigator.locks fix in src/shell/roster.ts.
// Opens two independent CDP targets/WebSockets against a real headless Chrome and races two tabs'
// #roster-add-name + #roster-add-btn clicks via Promise.all, with neither tab's fireEval awaited
// before the other's request is sent — so both tabs' add() calls genuinely race the shared
// localStorage backing store. Same method as docs/verification/evidence/34/08-roster-race-two-tab.json
// and 11-roster-lock-two-tab-reproof.json.
//
// Needs BOTH a fixed and an unfixed build to prove anything: this harness carries no lock of its
// own, so "0 losses" on a single run only tells you that one build didn't lose a name — it does not
// tell you the fix is what prevented it. Run it once against the fixed build (expect ~0/N losses)
// and once against an unfixed build in a separate worktree/port (positive control — expect close to
// N/N losses, confirming the harness still detects the race). One arm alone is not a proof.
//
// Usage: node scripts/roster-lock-two-tab-race.mjs <port> <mode: race|sequential> <N> <url-path>
// race: both tabs add concurrently each round, N rounds, no early break — reports total losses/N.
// sequential: tabA add fully settles before tabB's starts — the arm-C non-race control.
// Requires: a built site being served at the given port (npm run build; npx serve dist/ -l <port>)
// and headless Chrome already running with --remote-debugging-port=9222 (see scripts/cdp.mjs).
const [portArg, mode, nArg, urlPath] = process.argv.slice(2);
const PORT = Number(portArg);
const N = Number(nArg);
const URL = `http://127.0.0.1:${PORT}${urlPath || '/game/love-match/'}`;

const api = async (p, method = 'GET') =>
  (await fetch(`http://127.0.0.1:9222${p}`, { method })).json();

async function openTab() {
  const target = await api(`/json/new?about:blank`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  let loadResolve = null;
  const consoleErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); return; }
    if (m.method === 'Page.loadEventFired' && loadResolve) { loadResolve(); loadResolve = null; }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) =>
    new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');

  return {
    consoleErrors,
    id: target.id,
    async nav() {
      const p = new Promise((r) => { loadResolve = r; });
      await send('Page.navigate', { url: URL });
      await p;
      await new Promise((r) => setTimeout(r, 250));
    },
    // fire-and-forget send: resolves once the WS message is on the wire, NOT once the page's
    // async click handler finishes — this is what lets two tabs' evaluate calls genuinely race.
    fireEval(expr) {
      return new Promise((res) => {
        pending.set(++id, res);
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: false, returnByValue: true } }));
      });
    },
    async evaluate(body) {
      const res = await send('Runtime.evaluate', {
        expression: `(async () => { ${body} })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      const r = res?.result;
      if (r?.exceptionDetails) return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
      return { value: r?.result?.value ?? null };
    },
    async close() {
      await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
      ws.close();
    },
  };
}

const addExpr = (name) => `(() => {
  const input = document.querySelector('#roster-add-name');
  const btn = document.querySelector('#roster-add-btn');
  input.value = ${JSON.stringify(name)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
  btn.click();
  return true;
})()`;

const tabA = await openTab();
const tabB = await openTab();

let losses = 0;
const rounds = [];

for (let i = 0; i < N; i++) {
  const nameA = `A${i}`;
  const nameB = `B${i}`;

  await tabA.evaluate('localStorage.clear(); return true;');
  await Promise.all([tabA.nav(), tabB.nav()]);

  if (mode === 'race') {
    // Neither fireEval is awaited before the other's WS send goes out.
    await Promise.all([tabA.fireEval(addExpr(nameA)), tabB.fireEval(addExpr(nameB))]);
  } else {
    await tabA.evaluate(`${addExpr(nameA)}; return true;`);
    await new Promise((r) => setTimeout(r, 300));
    await tabB.evaluate(`${addExpr(nameB)}; return true;`);
  }

  // add() now awaits a Web Locks critical section — give it real time to settle before reading.
  await new Promise((r) => setTimeout(r, 500));

  const read = await tabA.evaluate(`
    const raw = localStorage.getItem('watduang:roster');
    return raw ? JSON.parse(raw) : [];
  `);
  const finalRoster = Array.isArray(read.value) ? read.value : [];
  const hasA = finalRoster.includes(nameA);
  const hasB = finalRoster.includes(nameB);
  if (!hasA || !hasB) losses++;
  rounds.push({ i, nameA, nameB, hasA, hasB, finalRoster });
}

await tabA.close();
await tabB.close();

console.log(JSON.stringify({
  mode,
  N,
  losses,
  lostRounds: rounds.filter((r) => !r.hasA || !r.hasB),
  consoleErrorsA: tabA.consoleErrors,
  consoleErrorsB: tabB.consoleErrors,
}));
