// node --test — gh#308: the projector's QR lobby. Before the first round of a QR-mode event the main screen
// shows the join QR, the PIN and the joined count (design/Gh302Projector.dc.html, frame proj-lobby,
// direction B, picked 2026-11-11). Pins:
//   - the lobby is read from the record the setup page writes (qr-event.ts), and only while it is there;
//     the stored event takes the screen back the moment it goes;
//   - the QR module (lobby-qr.ts, the one importer of lean-qr) is loaded lazily, only for a lobby: an
//     admin-mode screen never asks for it, and no static import from the route's entry reaches it;
//   - what the QR encodes is the join link, id and PIN in the fragment, drawn at correction M on a canvas.
// No decoder is installed in this repo, so there is no round-trip decode here: the payload string, the
// module call and the drawn pixels against lean-qr's own matrix at the same options are what is asserted.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { correction, generate } from 'lean-qr';
import { fakeOrigin, mount, press, storedEvent } from './stage-harness.mjs';
import { QR_OPTIONS, drawJoinQr } from './lobby-qr.ts';
import { encodeLobby, joinLink, parseLobby } from '../../prize-event/qr-event.ts';

const EV = 'AbCdEfGhIjKlMnOpQrStUv';
const SESSION = { eventId: EV, pin: '048213', adminToken: 'T'.repeat(43), expiresAt: '2999-01-01T00:00:00.000Z' };
const ORIGIN = 'https://watduang.com';

/** A lobby source over one string, as main.ts builds it over localStorage; `set` notifies like a storage event. */
function lobbySource(text = null) {
  let raw = text;
  const subs = [];
  return {
    read: () => parseLobby(raw, Date.now()),
    subscribe: (fn) => (subs.push(fn), () => {}),
    set(next) {
      raw = next;
      for (const fn of subs) fn();
    },
  };
}

/** A QR module double: records every draw; `loads` counts how often the module was asked for. */
function qrDouble() {
  const draws = [];
  let loads = 0;
  return {
    draws,
    loads: () => loads,
    loadQr: async () => {
      loads++;
      return { drawJoinQr: (canvas, text) => draws.push({ canvas, text }) };
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

test('a lobby record shows the lobby: event name, the scan heading, the PIN, the joined count, a QR canvas of the join link', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 20 });
  const lobby = lobbySource(encodeLobby(SESSION, 'Party 2570', 3));
  const qr = qrDouble();
  const s = await mount({ origin, lobby, loadQr: qr.loadQr, joinOrigin: ORIGIN });
  await flush();
  assert.equal(s.frame.getAttribute('data-screen'), 'lobby');
  const text = s.frame.textContent;
  for (const part of ['Party 2570', 'สแกนเพื่อเข้าร่วม', 'ใช้ชื่อเล่นหรือชื่อเรียก 1 เครื่อง 1 ชื่อ', 'PIN', '048213', 'เข้าร่วมแล้ว 3 คน']) {
    assert.ok(text.includes(part), `lobby misses ${part}`);
  }
  assert.equal(s.root.querySelector('.pd-mc').querySelectorAll('button').length, 0, 'the lobby has no MC control');
  const canvas = s.frame.querySelector('canvas');
  assert.ok(canvas, 'no QR canvas');
  assert.equal(qr.loads(), 1);
  assert.deepEqual(qr.draws.map((d) => d.text), [joinLink(ORIGIN, EV, '048213')]);
  assert.equal(qr.draws[0].canvas, canvas);
  assert.equal(qr.draws[0].text, `${ORIGIN}/game/prize-draw/join/#event=${EV}&pin=048213`);
  assert.ok(!qr.draws[0].text.includes('T'.repeat(43)));
});

test('a count update rewrites the text and keeps the drawn QR; the record going hands the screen to the stored event', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 20 });
  const lobby = lobbySource(encodeLobby(SESSION, 'Party 2570', 3));
  const qr = qrDouble();
  const s = await mount({ origin, lobby, loadQr: qr.loadQr, joinOrigin: ORIGIN });
  await flush();
  const canvas = s.frame.querySelector('canvas');
  lobby.set(encodeLobby(SESSION, 'Party 2570', 41));
  await flush();
  assert.ok(s.frame.textContent.includes('เข้าร่วมแล้ว 41 คน'));
  assert.equal(s.frame.querySelector('canvas'), canvas, 'a count update rebuilt the QR');
  assert.equal(qr.draws.length, 1);
  lobby.set(null);
  await flush();
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
  assert.ok(s.go(), 'the MC control is back with the event');
});

test('closing a notice that a lobby arrived under brings back no control of the event it replaced (ADR-0057)', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 20 });
  const lobby = lobbySource(null);
  const qr = qrDouble();
  const s = await mount({ origin, lobby, loadQr: qr.loadQr, joinOrigin: ORIGIN });
  origin.faults.abortCommits = 1;
  press(s);
  await origin.idle();
  assert.equal(s.notice.hidden, false, 'the notice did not open on an aborted store: this test measures nothing');
  lobby.set(encodeLobby(SESSION, 'Party 2570', 3));
  await flush();
  assert.equal(s.frame.getAttribute('data-screen'), 'lobby');
  const close = s.notice.querySelector('button');
  close.disabled = false;
  close.click();
  assert.equal(s.notice.hidden, true);
  assert.equal(s.frame.getAttribute('data-screen'), 'lobby');
  assert.equal(s.go(), null, 'the close path put the replaced event\'s MC control over the lobby');
  assert.equal(s.root.querySelector('.pd-picks').querySelectorAll('button').length, 0);
  // The record going hands the screen back to the stored event, its control rebuilt there.
  lobby.set(null);
  await flush();
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
  assert.ok(s.go(), 'the MC control is back with the event');
});

/** A QR module that fails to load `failures` times (a chunk the network dropped), then loads. */
function flakyQr(failures) {
  const ok = qrDouble();
  let calls = 0;
  return {
    draws: ok.draws,
    calls: () => calls,
    loadQr: () => (++calls <= failures ? Promise.reject(new Error('chunk offline')) : ok.loadQr()),
  };
}

const card = (s) => s.frame.querySelector('.pd-qrcard');

test('a QR module that fails to load is asked for again with backoff, and its card stays hidden until a code is drawn', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    const lobby = lobbySource(encodeLobby(SESSION, 'Party 2570', 3));
    const qr = flakyQr(2);
    const s = await mount({ origin, lobby, loadQr: qr.loadQr, joinOrigin: ORIGIN });
    await flush();
    assert.equal(qr.calls(), 1);
    assert.ok(card(s).hasAttribute('data-pending'), 'a blank QR box is on screen as if it were a code');
    assert.ok(s.frame.textContent.includes('048213'), 'the lobby is not usable while the QR waits');
    // Not asked again at once: the next attempt waits, and each wait is longer than the last.
    await flush();
    assert.equal(qr.calls(), 1, 'the retry did not back off');
    mock.timers.tick(1000);
    await flush();
    assert.equal(qr.calls(), 2);
    mock.timers.tick(1000);
    await flush();
    assert.equal(qr.calls(), 2, 'the second wait is no longer than the first');
    mock.timers.tick(1000);
    await flush();
    assert.equal(qr.calls(), 3);
    await flush();
    assert.deepEqual(qr.draws.map((d) => d.text), [joinLink(ORIGIN, EV, '048213')]);
    assert.equal(qr.draws[0].canvas, s.frame.querySelector('canvas'));
    assert.ok(!card(s).hasAttribute('data-pending'), 'the drawn QR is still hidden');
  } finally {
    mock.timers.reset();
  }
});

test('the QR retries are bounded, stop once the lobby leaves, and a never-loading module leaves no blank box', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    const lobby = lobbySource(encodeLobby(SESSION, 'Party 2570', 3));
    const never = flakyQr(Infinity);
    const s = await mount({ origin, lobby, loadQr: never.loadQr, joinOrigin: ORIGIN });
    for (let i = 0; i < 40; i++) {
      await flush();
      mock.timers.tick(60_000);
    }
    await flush();
    const bound = never.calls();
    assert.ok(bound > 2 && bound < 12, `retries are unbounded or absent: ${bound} loads`);
    assert.ok(card(s).hasAttribute('data-pending'), 'a failed load left a blank QR box on screen');
    assert.equal(s.frame.getAttribute('data-screen'), 'lobby');

    // A lobby that goes while a retry waits: the wait ends without loading.
    const lobby2 = lobbySource(encodeLobby(SESSION, 'Party 2570', 3));
    const flaky = flakyQr(Infinity);
    await mount({ origin: fakeOrigin(), lobby: lobby2, loadQr: flaky.loadQr, joinOrigin: ORIGIN });
    await flush();
    assert.equal(flaky.calls(), 1);
    lobby2.set(null);
    await flush();
    mock.timers.tick(60_000);
    await flush();
    assert.equal(flaky.calls(), 1, 'a retry loaded the QR module for a lobby no longer on screen');
  } finally {
    mock.timers.reset();
  }
});

test('the waiting QR card is hidden by the stylesheet, its place in the grid kept', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, 'play.css'), 'utf8');
  assert.match(css, /\.pd-qrcard\[data-pending\]\s*\{[^}]*visibility:\s*hidden/);
});

test('admin mode never loads the QR module: no record, an expired record, a malformed record', async () => {
  for (const text of [null, encodeLobby({ ...SESSION, expiresAt: '2000-01-01T00:00:00.000Z' }, 'x', 1), '{"eventId":"../x","pin":"048213"}']) {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 20 });
    const qr = qrDouble();
    const s = await mount({ origin, lobby: lobbySource(text), loadQr: qr.loadQr, joinOrigin: ORIGIN });
    await flush();
    assert.equal(s.frame.getAttribute('data-screen'), 'round', String(text));
    assert.equal(qr.loads(), 0, `the QR module loaded for ${text}`);
  }
});

test('a lobby that arrives after the first screen takes the screen, with no event stored at all', async () => {
  const origin = fakeOrigin();
  const lobby = lobbySource(null);
  const qr = qrDouble();
  const s = await mount({ origin, lobby, loadQr: qr.loadQr, joinOrigin: ORIGIN });
  assert.equal(s.frame.getAttribute('data-screen'), 'cold');
  lobby.set(encodeLobby(SESSION, '', 0));
  await flush();
  assert.equal(s.frame.getAttribute('data-screen'), 'lobby');
  assert.equal(qr.loads(), 1);
});

/** The static import graph from `entry`: relative modules by path, bare packages by name. Type-only imports
 *  are erased by the build, and import() is a lazy edge, not a static one. */
function staticGraph(entry) {
  const seen = new Set();
  const packages = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gm)) {
      if (m[1]) continue;
      const spec = m[2];
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        if (/\.(ts|mjs|js)$/.test(target) && fs.existsSync(target)) walk(target);
      } else packages.add(spec);
    }
  };
  walk(entry);
  return { files: [...seen].map((f) => path.relative(path.join(import.meta.dirname, '../..'), f)), packages: [...packages] };
}

test('the QR module is outside the static import graph of the projector and of the setup page; stage.ts loads it lazily', () => {
  const projector = staticGraph(path.join(import.meta.dirname, 'main.ts'));
  assert.ok(projector.files.includes('play/prize-draw/stage.ts'), 'the walk did not reach stage.ts: it measures nothing');
  assert.ok(projector.files.includes('prize-event/qr-event.ts'), 'the walk did not reach the lobby reader');
  assert.ok(!projector.packages.includes('lean-qr'), 'lean-qr is in the projector entry graph');
  assert.ok(!projector.files.includes('play/prize-draw/lobby-qr.ts'), 'lobby-qr.ts is imported statically');
  const setup = staticGraph(path.join(import.meta.dirname, '../../prize-event/setup-page.ts'));
  assert.ok(setup.files.includes('prize-event/qr-event.ts'));
  assert.ok(!setup.packages.includes('lean-qr') && !setup.files.includes('play/prize-draw/lobby-qr.ts'));
  const stage = fs.readFileSync(path.join(import.meta.dirname, 'stage.ts'), 'utf8');
  assert.match(stage, /import\('\.\/lobby-qr\.ts'\)/, 'stage.ts no longer loads the QR module lazily');
  // And the module itself is the one importer of lean-qr, statically.
  assert.deepEqual(staticGraph(path.join(import.meta.dirname, 'lobby-qr.ts')).packages, ['lean-qr']);
});

/** A 2D canvas double: records the image lean-qr puts. */
function fakeCanvas() {
  const c = {
    width: 0,
    height: 0,
    image: null,
    getContext: (kind) =>
      kind === '2d'
        ? {
            createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: (img) => (c.image = img),
          }
        : null,
  };
  return c;
}

const modules = (bitmap) => {
  let s = '';
  for (let y = 0; y < bitmap.size; y++) for (let x = 0; x < bitmap.size; x++) s += bitmap.get(x, y) ? '1' : '0';
  return s;
};
/** The quiet zone the QR standard asks for, in modules: a literal, never QR_PAD, so a changed pad reds. */
const QUIET = 4;
const drawn = (canvas, size) => {
  let s = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) s += canvas.image.data[((y + QUIET) * canvas.width + (x + QUIET)) * 4] < 128 ? '1' : '0';
  }
  return s;
};
const light = (canvas, x, y) => canvas.image.data[(y * canvas.width + x) * 4] > 128;

test('drawJoinQr: correction M asked for explicitly, a quiet zone, dark modules exactly where lean-qr puts them', () => {
  assert.equal(QR_OPTIONS.minCorrectionLevel, correction.M);
  // The evidence README's 52-character shape: there the library default measured L, so this payload tells an
  // explicit M from a forgotten option. The join link itself is drawn too.
  for (const text of ['https://watduang.com/party/prize-draw/join/?e=48291', joinLink(ORIGIN, EV, '048213')]) {
    const want = generate(text, QR_OPTIONS);
    const canvas = fakeCanvas();
    drawJoinQr(canvas, text);
    assert.equal(canvas.width, want.size + 2 * QUIET);
    assert.equal(canvas.height, want.size + 2 * QUIET);
    assert.equal(drawn(canvas, want.size), modules(want), text);
    // The quiet zone is light all round, QUIET modules deep on every side.
    for (let i = 0; i < canvas.width; i++) {
      for (let d = 0; d < QUIET; d++) {
        for (const [x, y] of [[i, d], [i, canvas.height - 1 - d], [d, i], [canvas.width - 1 - d, i]]) {
          assert.ok(light(canvas, x, y), `quiet zone is not light at ${x},${y}`);
        }
      }
    }
    // The finder pattern's dark corner sits right inside it.
    assert.ok(!light(canvas, QUIET, QUIET), 'the symbol does not start at the quiet zone');
  }
  const text = 'https://watduang.com/party/prize-draw/join/?e=48291';
  const fallback = generate(text);
  const canvas = fakeCanvas();
  drawJoinQr(canvas, text);
  assert.notEqual(drawn(canvas, generate(text, QR_OPTIONS).size), fallback.size === generate(text, QR_OPTIONS).size ? modules(fallback) : '', 'the drawn symbol is the library default, not correction M');
});
