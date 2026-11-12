// gh#304 review round 1: two projector tabs on one stored event, in a real Chrome over CDP (two targets on one
// browser, so they share localStorage and see each other's storage events). Run: node <this> with CDP_PORT and
// BASE set (README names the pair). Prints one JSON object; screenshots land beside this file.
//
// Observers, installed before the page's own script, change nothing they watch:
//   - navigator.locks.request is wrapped to log each call's name and whether its callback was entered;
//   - Storage.prototype.setItem is wrapped to count this tab's writes to the event key;
//   - the page's 'storage' listener is wrapped so the harness can make tab B miss events (window.__drop), the
//     only way to put B on a stale screen while A moves the event on.
// Leg 1: A presses the reveal; B must follow to the same survivors with zero writes of its own.
// Leg 2: B drops storage events, A advances and draws the next round, B is left on a stale ready screen whose
//   button would draw; B presses it and must take up the stored state with zero writes.
// Leg 3 (review round 2): the setup page submits while the projector holds the event lock. The lock wrapper
//   can keep A's own press's lock held after its callback ran (window.__holdNext: the wrapped callback
//   returns a pending promise, which is how Web Locks keep a lock), so the projector is the holder. Tab C, the
//   setup page, submits a new event through a real click on its start button. While A holds: C made a lock
//   request, never entered it, wrote nothing, did not navigate, and the stored text is A's. After release: C
//   wrote and navigated, the stored event is C's (fresh key), and A follows to its round 1 with zero writes.
//   Must-red for this leg (TWO_TAB_MUTANT=1): C's lock request runs its callback at once, unlocked.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const { createEvent, encodeEvent, STORAGE_KEY } = await import(path.join(ROOT, 'src/prize-event/event.ts'));
const { proposeSchedule } = await import(path.join(ROOT, 'src/prize-draw/schedule.ts'));
const { writeFile } = await import('node:fs/promises');
const PORT = process.env.CDP_PORT || '9335';
const BASE = process.env.BASE || 'http://localhost:4324';
const STAGE = `${BASE}/game/prize-draw/play/`;
const SETUP = `${BASE}/game/prize-draw/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seed() {
  let n = 11;
  const float = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rng = { float, int: (k) => Math.floor(float() * k), hex: (b) => Array.from({ length: b }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join('') };
  const names = Array.from({ length: 40 }, (_, i) => `Guest ${i + 1}`);
  return encodeEvent(createEvent({ eventName: 'Two tabs', names, schedule: proposeSchedule(40), prizes: ['A', 'B', 'C', 'D', 'E'] }, rng));
}

const OBSERVERS = `(() => {
  const KEY = ${JSON.stringify(STORAGE_KEY)};
  const L = navigator.locks;
  const log = (window.__locks = { present: !!L, secure: isSecureContext, calls: [] });
  if (L) {
    const orig = L.request.bind(L);
    L.request = function (name, ...rest) {
      const entry = { name, entered: false, mode: null };
      log.calls.push(entry);
      const cb = rest[rest.length - 1];
      rest[rest.length - 1] = (lock) => {
        entry.entered = true;
        entry.mode = lock ? lock.mode : null;
        const r = cb(lock);
        if (!window.__holdNext) return r;
        window.__holdNext = false;
        entry.held = true;
        return new Promise((res) => (window.__release = () => { entry.released = true; res(r); }));
      };
      return orig(name, ...rest);
    };
  }
  // The count survives a navigation of this tab (sessionStorage is per tab): the setup page leaves for the
  // projector route right after its write, and a page-local counter would read 0 on the next document.
  const set = Storage.prototype.setItem;
  window.__writes = Number(sessionStorage.getItem('__twotab_writes') || 0);
  Storage.prototype.setItem = function (k, v) {
    if (k === KEY) set.call(sessionStorage, '__twotab_writes', String(++window.__writes));
    return set.call(this, k, v);
  };
  window.__drop = false;
  window.__dropped = 0;
  const add = window.addEventListener;
  window.addEventListener = function (type, fn, opts) {
    if (type !== 'storage') return add.call(this, type, fn, opts);
    return add.call(this, type, (ev) => { if (window.__drop) { window.__dropped++; return; } fn(ev); }, opts);
  };
})();`;

async function openTab(name) {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  let onLoad = null;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) return void pending.get(m.id)(m);
    if (m.method === 'Page.loadEventFired' && onLoad) { onLoad(); onLoad = null; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args?.map((a) => a.value ?? a.description).join(' '));
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const tab = {
    name, errors, id: t.id,
    async eval(body) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(`${name}: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
      return r.result?.result?.value;
    },
    async nav(url) { const p = new Promise((r) => (onLoad = r)); await send('Page.navigate', { url }); await p; await sleep(1200); },
    // `before` runs ahead of the observers, so the observers wrap whatever it installs.
    async observe(before) {
      if (before) await send('Page.addScriptToEvaluateOnNewDocument', { source: before });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVERS });
    },
    async click(selector) {
      await this.front();
      const at = await this.eval(`
        const b = document.querySelector(${JSON.stringify(selector)});
        if (!b) return null;
        b.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 100));
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
      if (!at) return false;
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
      return true;
    },
    async front() { await send('Page.bringToFront'); await sleep(150); },
    async shot(file) { await this.front(); const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(HERE, file), Buffer.from(r.result.data, 'base64')); },
    // A real mouse press at the MC button's centre, once the arm window has opened it.
    async press() {
      await this.front();
      const at = await this.eval(`
        const b = document.querySelector('.pd-mc button');
        for (let i = 0; i < 60 && b && b.disabled; i++) await new Promise((r) => setTimeout(r, 50));
        if (!b || b.disabled) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.textContent.trim() };`);
      if (!at) return { pressed: false };
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
      return { pressed: true, label: at.label };
    },
    async read() {
      return this.eval(`
        const raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
        let h = 0; for (let i = 0; i < (raw || '').length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
        const b = document.querySelector('.pd-mc button');
        let ev = null; try { const e = JSON.parse(raw); ev = { name: e.setup.eventName, key: e.eventKey, rounds: e.rounds.length, at: e.at }; } catch {}
        return { path: location.pathname, event: ev, screen: document.getElementById('pd-frame')?.getAttribute('data-screen'), button: b ? b.textContent.trim() : null,
          passed: [...document.querySelectorAll('.pd-field .pd-chip.in')].map((c) => c.textContent),
          field: [...document.querySelectorAll('.pd-field .pd-chip:not(.pd-legend-chip)')].map((c) => c.textContent),
          stored: { len: raw ? raw.length : 0, hash: h }, writes: window.__writes, dropped: window.__dropped,
          locks: window.__locks, hasLocksApi: 'locks' in navigator };`);
    },
    close: () => fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`),
  };
  return tab;
}

const out = { mutant: process.env.TWO_TAB_MUTANT === '1' };
const A = await openTab('A');
const B = await openTab('B');
await A.observe();
await B.observe();
await A.nav(STAGE);
await A.eval(`localStorage.clear(); localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(seed())}); sessionStorage.removeItem("__twotab_writes"); return true;`);
await A.nav(STAGE);
await B.nav(STAGE);
out.start = { A: await A.read(), B: await B.read() };

// Leg 1
out.leg1 = { pressA: await A.press() };
await sleep(2500);
out.leg1.A = await A.read();
out.leg1.B = await B.read();
out.leg1.sameSurvivors = JSON.stringify(out.leg1.A.passed) === JSON.stringify(out.leg1.B.passed) && out.leg1.A.passed.length > 0;
out.leg1.storedChanged = out.leg1.A.stored.hash !== out.start.A.stored.hash;
out.leg1.writes = { A: out.leg1.A.writes, B: out.leg1.B.writes };
if (!out.mutant) {
  await A.shot('two-tab-leg1-A.png');
  await B.shot('two-tab-leg1-B.png');
}

// Leg 2: A advances (B follows), then B goes deaf and A draws the next round.
out.leg2 = { nextA: await A.press() };
await sleep(1500);
out.leg2.afterNext = { A: await A.read(), B: await B.read() };
await B.eval('window.__drop = true; return true;');
// Must-red (TWO_TAB_MUTANT=1): B's storage reads keep returning the text it held before A's draw, the shape of a
// press that never re-reads. B should then draw over A's round, and the write count and stored text must show it.
if (process.env.TWO_TAB_MUTANT === '1') {
  await B.eval(`const KEY = ${JSON.stringify(STORAGE_KEY)}; const stale = localStorage.getItem(KEY); const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { return k === KEY ? stale : get.call(this, k); }; return true;`);
}
out.leg2.revealA = await A.press();
await sleep(2500);
out.leg2.beforeB = { A: await A.read(), B: await B.read() };
await B.shot(out.mutant ? 'two-tab-mutant-B-stale.png' : 'two-tab-leg2-B-stale.png');
out.leg2.pressB = await B.press();
await sleep(1500);
out.leg2.afterB = { A: await A.read(), B: await B.read() };
await B.shot(out.mutant ? 'two-tab-mutant-B-after-press.png' : 'two-tab-leg2-B-after-press.png');
const b0 = out.leg2.beforeB.B;
const b1 = out.leg2.afterB.B;
out.leg2.verdict = {
  bWasStale: b0.screen !== out.leg2.beforeB.A.screen || JSON.stringify(b0.passed) !== JSON.stringify(out.leg2.beforeB.A.passed),
  bDroppedEvents: b0.dropped,
  bWritesDuringPress: b1.writes - b0.writes,
  storedUnchangedByB: (await A.read()).stored.hash === out.leg2.beforeB.A.stored.hash,
  bNowMatchesA: b1.screen === out.leg2.afterB.A.screen && JSON.stringify(b1.passed) === JSON.stringify(out.leg2.afterB.A.passed),
  bLockCallsInPress: b1.locks.calls.length - b0.locks.calls.length,
};
// Leg 3: the setup page submits while the projector holds the event lock.
const C = await openTab('C');
// Must-red: the setup page's lock request runs its callback at once, outside any lock.
await C.observe(out.mutant ? `(() => { const L = navigator.locks; if (!L) return;
  L.request = function (name, ...rest) { const cb = rest[rest.length - 1]; return Promise.resolve().then(() => cb(null)); }; })();` : undefined);
await C.nav(SETUP);
const typed = await C.eval(`
  document.getElementById('pd-event').value = 'Setup leg';
  const box = document.getElementById('pd-names');
  box.value = Array.from({ length: 12 }, (_, i) => 'Late ' + (i + 1)).join('\\n');
  box.dispatchEvent(new Event('input', { bubbles: true }));
  return document.getElementById('pd-count').textContent;`);
await B.eval('window.__drop = false; return true;');
await A.eval('window.__holdNext = true; return true;');
out.leg3 = { typed, pressA: await A.press() };
await sleep(800);
out.leg3.held = { A: await A.read(), B: await B.read() };
const heldEntry = out.leg3.held.A.locks.calls[out.leg3.held.A.locks.calls.length - 1];
out.leg3.clickC = await C.click('#pd-start');
await sleep(1500);
out.leg3.during = { A: await A.read(), C: await C.read() };
await A.eval('if (window.__release) window.__release(); return Boolean(window.__release);');
await sleep(2500);
out.leg3.after = { A: await A.read(), B: await B.read(), C: await C.read() };
const d = out.leg3.during;
const LATE = (field) => JSON.stringify(field) === JSON.stringify(Array.from({ length: 12 }, (_, i) => 'Late ' + (i + 1)));
const a3 = out.leg3.after;
out.leg3.verdict = {
  projectorHeldTheLock: Boolean(heldEntry && heldEntry.held && heldEntry.name === STORAGE_KEY && !(d.A.locks.calls.at(-1) || {}).released),
  setupLockCallsWhileHeld: d.C.locks.calls.length,
  setupEnteredWhileHeld: d.C.locks.calls.some((c) => c.entered),
  setupWritesWhileHeld: d.C.writes,
  setupNavigatedWhileHeld: d.C.path !== '/game/prize-draw/',
  storedUnchangedWhileHeld: d.A.stored.hash === out.leg3.held.A.stored.hash,
  setupNavigatedAfterRelease: a3.C.path === '/game/prize-draw/play/',
  storedIsSetupEvent: a3.A.event?.name === 'Setup leg' && a3.A.event?.key !== out.leg3.held.A.event?.key && a3.A.event?.rounds === 0,
  // What each projector SHOWS, not what storage holds: round 1 of the setup page's event, its 12 names on the field.
  projectorFollowed: a3.A.screen === 'round' && a3.A.button === 'เปิดผล' && LATE(a3.A.field) && a3.A.writes === d.A.writes,
  otherProjectorFollowed: a3.B.screen === 'round' && a3.B.button === 'เปิดผล' && LATE(a3.B.field) && a3.B.writes === out.leg3.held.B.writes,
};
await C.shot(out.mutant ? 'two-tab-mutant-leg3-C-after.png' : 'two-tab-leg3-C-after.png');
await A.shot(out.mutant ? 'two-tab-mutant-leg3-A-after.png' : 'two-tab-leg3-A-after.png');
out.errors = { A: A.errors, B: B.errors, C: C.errors };
await A.close();
await B.close();
await C.close();
console.log(JSON.stringify(out));
