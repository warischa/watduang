// node --test — the projector stage wires the owner's gh#319 picks: a hold game's settled picture stays up
// over the committed 2D frame and is disposed on every screen change (PD-315-02 a, PD-317-06 a, PD-318-01 a);
// the code card and claim line paint above the held 3D layer (z-order); the free-name row takes real pixels
// below the board's scale threshold (PD-317-03 a, PD-317-11 b, PD-318-04 b); a marbles round draws its own idle
// (PD-316-02 a); and each prize beat writes one live-region line through the name sink (PD-318-10 a, PD-317-10 a).
// The CSS legs read rule text, never a laid-out page (the repo's stated ceiling); paint order and the row's
// wrapped height are the browser's to measure (gh#319 acceptance).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fakeOrigin, mount, mountSetupPage, press, seedRaw, seeded, storedEvent, storedRaw } from './stage-harness.mjs';
import { advance, createEvent, decodeEvent, drawNext, encodeEvent, liveIds, revealDrawn } from '../../prize-event/event.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { settleFor } from '../_prize-reveal/game-registry.ts';
import * as fp from './final-picks.ts';
const { NAMES_Y, PLATE_Y } = fp;
const ROW_GAP = fp.ROW_GAP;
const ROW_THRESHOLD = fp.ROW_THRESHOLD;
const freeRowTop = fp.freeRowTop;

const PLAY_CSS = fs.readFileSync(path.join(import.meta.dirname, 'play.css'), 'utf8');
const REVEAL_CSS = fs.readFileSync(path.join(import.meta.dirname, '../_prize-reveal/reveal.css'), 'utf8');
const stored = (origin) => decodeEvent(storedRaw(origin));
const screen = (s) => s.frame.getAttribute('data-screen');
const layer3d = (s) => s.root.querySelector('.pd-3d');
const canvasUp = (s) => layer3d(s).querySelectorAll('canvas').length > 0;

/**
 * A recording host that models the shared host's HOLD contract (game-host.ts): a hold game's settle keeps its
 * canvas in the container and draws the 2D frame once behind it; dispose releases the canvas and never draws
 * again. A handback game's settle (or any fallback) releases at once. The stage reads settleFor itself, so the
 * fake only has to keep/remove the canvas the way the host does.
 */
function heldHosts() {
  const hosts = [];
  const start = (options) => {
    const doc = options.container.ownerDocument;
    const h = {
      options,
      state: 'loading',
      disposed: 0,
      canvas: null,
      draws: 0,
      run() {
        h.state = 'running';
        options.onState?.('running');
      },
      settle() {
        if (h.state === 'settled' || h.state === 'fallback' || h.state === 'disposed') return;
        h.state = 'settled';
        if (settleFor(options.game) === 'hold') {
          h.canvas = doc.createElement('canvas');
          options.container.appendChild(h.canvas);
        }
        h.draws++;
        options.render2D(options.input.outcome);
        options.onState?.('settled');
      },
      exit(kind) {
        if (h.state === 'settled' || h.state === 'fallback' || h.state === 'disposed') return;
        h.state = kind;
        h.draws++;
        options.render2D(options.input.outcome);
        options.onState?.(kind);
      },
      dispose() {
        h.disposed++;
        if (h.canvas) {
          h.canvas.remove();
          h.canvas = null;
          options.onRelease?.();
        }
        if (h.state !== 'settled' && h.state !== 'fallback' && h.state !== 'disposed') {
          h.state = 'disposed';
          h.draws++;
          options.render2D(options.input.outcome);
          options.onState?.('disposed');
        }
      },
      /** The host's releaseHeld: the picture goes, the state stays settled, and onRelease tells the caller. */
      release() {
        if (h.canvas) {
          h.canvas.remove();
          h.canvas = null;
        }
        options.onRelease?.();
      },
      command() {},
      done: new Promise(() => {}),
    };
    hosts.push(h);
    options.onState?.('loading');
    return h;
  };
  return { hosts, start };
}

const tap = (b) => {
  assert.ok(b, 'no such control on screen');
  b.disabled = false;
  b.click();
};

/** A stored zones event (QR mode, so the settled round carries a code card over the held picture). */
function storedZones(origin, n = 50) {
  return storedEvent(origin, { n, games: { rounds: ['zones', 'zones', null, null], final: null } });
}

/** A stored pick-final event at its final, ready, with five empty objects. */
function atPickFinal(origin, game) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: game } });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

/** Place all five finalists on objects and draw, leaving the final's host mounted. */
async function drawPickFinal(s, origin, game) {
  const ev = stored(origin);
  const finalists = liveIds(ev);
  const byId = new Map(ev.setup.people.map((p) => [p.id, p.name]));
  for (const [object, id] of finalists.entries()) {
    tap(s.laneButtons()[object]);
    tap(s.nameButtons().find((b) => b.textContent === byId.get(id)));
    await origin.idle();
  }
  assert.equal(press(s), true);
  await origin.idle();
}

// ---- 1. A held picture is disposed on every screen change ----

test('held zones round: stepping to the next round disposes the held host (canvas gone) before the next screen', async () => {
  const origin = fakeOrigin();
  storedZones(origin);
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(9), startReveal: start });
  assert.equal(screen(s), 'zones');
  press(s);
  await origin.idle();
  const h = hosts[0];
  h.run();
  h.settle();
  assert.equal(screen(s), 'reveal');
  assert.equal(h.draws, 1, 'the 2D frame is drawn once behind the held picture');
  assert.ok(canvasUp(s), 'a hold game keeps its canvas over the 2D frame');
  assert.equal(h.disposed, 0);
  // The MC steps on (QR mode: close the code card first, then next). The held picture must go before the next screen.
  // The code card lifts into .pd-over while held, so look across the root, not just the frame.
  if (s.root.querySelector('.pd-codebox')) {
    press(s);
    await origin.idle();
  }
  press(s);
  await origin.idle();
  assert.equal(h.disposed, 1, 'the step forward did not dispose the held host');
  assert.ok(!canvasUp(s), 'the held canvas covers the next screen');
  assert.equal(screen(s), 'zones');
  assert.equal(h.draws, 1, 'disposing a held picture drew the 2D frame a second time');
});

test('held envelopes final: a setup replacement (reset) disposes the held host', async () => {
  const origin = fakeOrigin();
  atPickFinal(origin, 'envelopes');
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(5), startReveal: start });
  await drawPickFinal(s, origin, 'envelopes');
  const h = hosts[0];
  h.run();
  h.settle();
  assert.equal(screen(s), 'result');
  assert.ok(canvasUp(s), 'the held final picture is up');
  const setup = mountSetupPage({ origin });
  setup.submit();
  await origin.idle();
  await s.deliver();
  await origin.idle();
  assert.equal(h.disposed, 1, 'the reset did not dispose the held final');
  assert.ok(!canvasUp(s), 'the held canvas covers the reset screen');
  assert.equal(s.stage.current().setup.eventName, 'Replacement');
});

test('held flipcards final: taking up another tab\'s commit disposes the held host', async () => {
  const origin = fakeOrigin();
  atPickFinal(origin, 'flipcards');
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(5), startReveal: start });
  await drawPickFinal(s, origin, 'flipcards');
  const h = hosts[0];
  h.run();
  h.settle();
  assert.ok(canvasUp(s));
  // Another tab moves the event on (a fresh event), and this tab follows its commit notice.
  const setup = mountSetupPage({ origin, env: origin.tab('other') });
  setup.submit();
  await origin.idle();
  await s.deliver();
  await origin.idle();
  assert.equal(h.disposed, 1, 'the take-up did not dispose the held final');
  assert.ok(!canvasUp(s));
});

test('held zones round: a QR lobby arriving disposes the held host and shows the lobby', async () => {
  const origin = fakeOrigin();
  storedZones(origin);
  let lobby = null;
  const subs = [];
  const lobbySource = { read: () => lobby, subscribe: (fn) => (subs.push(fn), () => {}) };
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(9), startReveal: start, lobby: lobbySource, loadQr: async () => ({ drawJoinQr() {} }), joinOrigin: 'https://x' });
  press(s);
  await origin.idle();
  hosts[0].run();
  hosts[0].settle();
  assert.ok(canvasUp(s));
  lobby = { eventId: 'e', pin: '048213', eventName: 'Lobby', joined: 3 };
  for (const fn of subs) fn();
  await origin.idle();
  assert.equal(hosts[0].disposed, 1, 'the lobby did not dispose the held host');
  assert.ok(!canvasUp(s));
  assert.equal(screen(s), 'lobby');
});

test('a handback game still hands the screen back: its settle keeps no canvas and no handle', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: { rounds: ['fireworks', null, null, null], final: null } });
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(9), startReveal: start });
  press(s);
  await origin.idle();
  hosts[0].run();
  hosts[0].settle();
  assert.equal(screen(s), 'reveal');
  assert.ok(!canvasUp(s), 'a handback game kept its canvas');
  // Stepping on does not dispose a handle that was never retained.
  press(s);
  await origin.idle();
  assert.equal(hosts[0].disposed, 0);
});

// ---- 2. The code card and claim line paint above the held 3D layer (z-order only) ----

test('z-order: the code card and claim line sit above the 3D layer; nothing else is raised', () => {
  const z = (css, sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.match(new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, 'm'));
    assert.ok(m, `no rule for ${sel}`);
    const zi = m[1].match(/z-index:\s*(-?\d+)/);
    return zi ? Number(zi[1]) : null;
  };
  const layer = z(PLAY_CSS, '.pd-3d');
  const codebox = z(REVEAL_CSS, '.pd-codebox');
  const claim = z(REVEAL_CSS, '.pd-claim');
  assert.ok(layer !== null, 'the 3D layer has no z-index');
  assert.ok(codebox !== null && codebox > layer, 'the code card is not above the 3D layer');
  assert.ok(claim !== null && claim > layer, 'the claim line is not above the 3D layer');
  // Nothing else of the frame is raised above the layer.
  for (const sel of ['.pd-scaled', '.pd-frame', '.pd-field', '.pd-spot', '.pd-wcards', '.pd-veil']) {
    const css = REVEAL_CSS.includes(`${sel} {`) || REVEAL_CSS.includes(`${sel}\n`) ? REVEAL_CSS : PLAY_CSS;
    assert.ok(z(css, sel) === null || z(css, sel) <= layer, `${sel} was raised above the 3D layer`);
  }
});

// ---- 3. The free-name row below the scale threshold (the boards' env-row / card-row frames) ----

test('free-name row: below the threshold the row top is the board\'s real-pixel value at 640/720/845', () => {
  const cases = [
    ['envelopes', 640, 272.0],
    ['envelopes', 720, 299.5],
    ['envelopes', 845, 342.5],
    ['flipcards', 640, 292.0],
    ['flipcards', 720, 322.0],
    ['flipcards', 845, 368.9],
  ];
  for (const [game, w, want] of cases) {
    const s = w / 1920;
    assert.ok(s < ROW_THRESHOLD[game], `${game} at ${w} is not below its threshold`);
    assert.ok(Math.abs(freeRowTop(game, s) - want) < 0.05, `${game} at ${w}: row top ${freeRowTop(game, s)} != ${want}`);
  }
  // The threshold is the board's: (44 + 8) / (NAMES_Y - PLATE_Y).
  assert.ok(Math.abs(ROW_THRESHOLD.envelopes - 0.52) < 1e-9);
  assert.ok(Math.abs(ROW_THRESHOLD.flipcards - 0.65) < 1e-9);
  assert.equal(ROW_GAP, 8);
});

test('free-name row: at and above the threshold the row keeps NAMES_Y (frame px), unchanged', async () => {
  for (const game of ['envelopes', 'flipcards']) {
    const origin = fakeOrigin();
    atPickFinal(origin, game);
    const s = await mount({ origin });
    const row = s.root.querySelector('.pd-names');
    assert.ok(row, 'no free-name row');
    // No layout in node (scale 0): the stage keeps the frame-px row, never the real-pixel branch.
    assert.equal(row.style.getPropertyValue('--names-y'), `${NAMES_Y[game]}px`);
    assert.ok(!row.hasAttribute('data-real'), 'the row took real pixels without a layout scale');
  }
});

// ---- 4. A marbles round draws its own idle, not the shared field ----

test('marbles round pre-draw: the stage draws the marbles idle (plates, hint), not the shared field', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: { rounds: ['marbles', null, null, null], final: null } });
  const s = await mount({ origin });
  assert.equal(screen(s), 'marbles');
  assert.ok(s.frame.querySelector('.pd-mfield'), 'no marbles track');
  assert.ok(s.frame.querySelectorAll('.pd-mplate').length > 0, 'no plates');
  assert.equal(s.frame.querySelector('.pd-rt').textContent, 'พิธีกรกดเริ่ม แล้วลูกแก้วจะวิ่งเข้าเส้นชัย');
  assert.equal(s.frame.querySelector('.pd-field'), null, 'the shared field still shows for a marbles round');
});

// ---- 5. One live-region line per prize beat, through the name sink ----

test('a prize beat writes one live line: รางวัลที่ N · prize, then the finalist through writeName', async () => {
  const origin = fakeOrigin();
  const ev = atPickFinal(origin, 'envelopes');
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(5), startReveal: start });
  await drawPickFinal(s, origin, 'envelopes');
  const h = hosts[0];
  h.run();
  const final = stored(origin).final;
  const byId = new Map(ev.setup.people.map((p) => [p.id, p.name]));
  const rank = 0;
  h.options.onEvent({ type: 'beat', beat: 'prize', index: rank });
  const name = byId.get(final.order[rank]);
  const prize = ev.setup.prizes[rank];
  const runs = s.live.all().filter((el) => el.getAttribute('dir') === 'auto');
  assert.deepEqual(runs.map((r) => r.textContent), [name], 'the beat line does not carry the finalist as one isolated run');
  assert.equal(s.live.textContent, `รางวัลที่ ${rank + 1} · ${prize} · ${name}`);
  // A second beat replaces the line (one line, not appended).
  h.options.onEvent({ type: 'beat', beat: 'prize', index: 1 });
  assert.deepEqual(s.live.all().filter((el) => el.getAttribute('dir') === 'auto').map((r) => r.textContent), [byId.get(final.order[1])]);
});

// ---- 6. The shared idle/result CSS moved to reveal.css (moved, not copied) ----

test('CSS move: the zones idle, final-picks idle and phone-result rules live in reveal.css exactly once', () => {
  // The base rule (the whole selector at line start), not a compound that merely ends in the class: the
  // projector's phone overrides (.pd-viewport[data-field] .pd-zfield) stay in play.css and are other selectors.
  const count = (css, sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (css.match(new RegExp(`^${esc}\\s*\\{`, 'gm')) ?? []).length;
  };
  for (const sel of ['.pd-zfield', '.pd-zpanel', '.pd-zgrid', '.pd-obj', '.pd-names', '.pd-name', '.pd-ohud']) {
    assert.equal(count(REVEAL_CSS, sel), 1, `${sel} is not in reveal.css exactly once`);
    assert.equal(count(PLAY_CSS, sel), 0, `${sel} was copied, not moved (still in play.css)`);
  }
  // The phone-result block generalized to both viewports, in reveal.css.
  assert.match(REVEAL_CSS, /:is\(\.pd-viewport, \.pr-viewport\)\[data-result\] \.pd-spot\s*\{/);
  assert.doesNotMatch(PLAY_CSS, /\.pd-viewport\[data-result\] \.pd-spot\s*\{/);
});

// ---- 2b. The lift: overlay-bound nodes move into .pd-over only while a held picture is up ----

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const qrPeople = (n) => Array.from({ length: n }, (_, i) => ({ id: B64[i >> 6] + B64[i & 63] + 'x'.repeat(20), name: `P${i + 1}` }));
/** A stored QR-mode event (server-shaped ids + a PIN roster), so its settled screens carry a code card / claim. */
function storedQrEvent(origin, games, n = 50) {
  const people = qrPeople(n);
  const ev = createEvent(
    { eventName: 'Party', names: people.map((p) => p.name), schedule: proposeSchedule(n), prizes: ['TV', 'Bike'], games, qr: { pin: '048213', roster: people } },
    seeded(5),
  );
  seedRaw(origin, encodeEvent(ev));
  return ev;
}
const overOf = (s) => s.root.querySelector('.pd-over');

test('lift: a held zones round lifts its code card into .pd-over (out of the frame); closing and disposing empty it', async () => {
  const origin = fakeOrigin();
  storedQrEvent(origin, { rounds: ['zones', 'zones', null, null], final: null });
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(9), startReveal: start });
  press(s);
  await origin.idle();
  hosts[0].run();
  hosts[0].settle();
  assert.ok(canvasUp(s), 'precondition: the picture is held');
  assert.ok(overOf(s).querySelector('.pd-codebox'), 'the code card did not lift into the overlay');
  assert.equal(s.frame.querySelector('.pd-codebox'), null, 'the code card stayed in the scaled frame under the canvas');
  // Closing the code card repaints the frame without it: the overlay empties, the picture stays held.
  press(s);
  await origin.idle();
  assert.equal(overOf(s).children.length, 0, 'closing the code card left a node in the overlay');
  assert.ok(canvasUp(s), 'closing the code card disposed the held picture');
  // Stepping forward disposes the held host: the overlay is empty and the canvas gone.
  press(s);
  await origin.idle();
  assert.equal(overOf(s).children.length, 0, 'the overlay was not emptied on dispose');
  assert.ok(!canvasUp(s));
});

test('lift: a held envelopes final keeps its claim line in the frame (the picture paints its own)', async () => {
  const origin = fakeOrigin();
  let ev = storedQrEvent(origin, { rounds: [null, null, null, null], final: 'envelopes' });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(5), startReveal: start });
  await drawPickFinal(s, origin, 'envelopes');
  hosts[0].run();
  hosts[0].settle();
  assert.ok(canvasUp(s));
  // Old assertion: the claim lifts into .pd-over and leaves the frame. New: the renderer's picture carries
  // the claim, so the DOM copy stays in the (hidden) frame -- lifting it printed the line twice (gh#319).
  assert.equal(overOf(s).querySelector('.pd-claim'), null, 'a DOM claim over the picture doubles the line');
  assert.ok(s.frame.querySelector('.pd-claim'), 'the claim line must stay in the frame for the release');
  assert.deepEqual(overOf(s).children.map((c) => c.className), ['pd-veil', 'pd-codebox']);
});

// ---- 7. The held composite: the 2D frame must not paint through the held canvas (the gh#319 defect) ----

const DEMO_CSS = fs.readFileSync(path.join(import.meta.dirname, '../_prize-reveal/demo.css'), 'utf8');
const viewportOf = (s) => s.root.querySelector('.pd-viewport');
const HELD_RULE = /:is\(\.pd-viewport, \.pr-viewport\)\[data-held\] \.pd-scaled\s*\{([^}]*)\}/;
const PROPS_RULE = /\.pd-scaled,\s*\.pd-over\s*\{([^}]*)\}/;

/** A fake window that records its listeners so a test can dispatch resize / pagehide / pageshow (the fake
 *  DOM has no layout). The release no longer watches media: the host calls onRelease itself (gh#319). */
function navWin() {
  const listeners = new Map();
  const win = {
    innerWidth: 1440,
    addEventListener(t, fn) {
      if (!listeners.has(t)) listeners.set(t, []);
      listeners.get(t).push(fn);
    },
    removeEventListener() {},
  };
  const dispatch = (t, ev = {}) => {
    for (const fn of [...(listeners.get(t) ?? [])]) fn({ type: t, ...ev });
  };
  return { win, dispatch };
}

test('held: the viewport takes data-held, the shared rule stops the frame painting, and the veil lifts under the card', async () => {
  const origin = fakeOrigin();
  storedQrEvent(origin, { rounds: ['zones', 'zones', null, null], final: null });
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(9), startReveal: start });
  press(s);
  await origin.idle();
  hosts[0].run();
  hosts[0].settle();
  assert.ok(canvasUp(s), 'precondition: the picture is held');
  assert.ok(viewportOf(s).hasAttribute('data-held'), 'the held picture does not mark the viewport');
  const rule = HELD_RULE.exec(REVEAL_CSS);
  assert.ok(rule, 'reveal.css carries no shared data-held rule for both viewports');
  // Hidden from SIGHT only: opacity, not visibility/display, so the result stays in the accessibility tree
  // while the canvas is aria-hidden (gh#319), and takes no pointer events.
  assert.match(rule[1], /opacity:\s*0/, 'the data-held rule does not stop the frame painting');
  assert.match(rule[1], /pointer-events:\s*none/, 'the hidden frame still takes pointer events');
  assert.doesNotMatch(rule[1], /visibility:\s*hidden/, 'visibility:hidden drops the result from the accessibility tree');
  // Hidden paint, kept DOM: the frame and its field stay for the release render and the fit rule.
  assert.ok(s.frame.querySelector('.pd-field'), 'the held mark took the frame out of the DOM');
  // The approved veil travels with the card, below it, over the held picture.
  assert.deepEqual(overOf(s).children.map((c) => c.className), ['pd-veil', 'pd-codebox']);
  // The lifted nodes keep the frame's own values: the props are declared for the overlay too.
  const props = PROPS_RULE.exec(REVEAL_CSS);
  assert.ok(props, 'the overlay does not carry the frame custom properties');
  assert.match(props[1], /--pd-raised:/, 'the lifted card loses its night surface');
  assert.match(props[1], /--pd-veil:/, 'the lifted veil loses its colour');
});

test('held final: one claim line in the document, kept in the hidden frame -- the picture paints its own', async () => {
  const origin = fakeOrigin();
  let ev = storedQrEvent(origin, { rounds: [null, null, null, null], final: 'envelopes' });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(5), startReveal: start });
  await drawPickFinal(s, origin, 'envelopes');
  hosts[0].run();
  hosts[0].settle();
  assert.ok(canvasUp(s));
  assert.equal(s.root.querySelectorAll('.pd-claim').length, 1, 'the claim line is doubled while held');
  // The hold finals' renderers paint their own claim into the picture: the DOM copy stays in the hidden
  // frame, never lifted over it, so the room reads exactly one line.
  assert.ok(s.frame.querySelector('.pd-claim'), 'the claim line left the frame it must come back to');
  assert.deepEqual(overOf(s).children.map((c) => c.className), ['pd-veil', 'pd-codebox']);
  press(s); // the MC closes the code card; the picture stays held
  await origin.idle();
  assert.ok(canvasUp(s), 'closing the card released the picture');
  assert.ok(viewportOf(s).hasAttribute('data-held'), 'closing the card cleared the held mark');
  assert.equal(s.root.querySelectorAll('.pd-claim').length, 1, 'closing the card doubled the claim line');
  assert.ok(s.frame.querySelector('.pd-claim'), 'closing the card lost the frame claim');
  // Old: the overlay emptied on close. New: the persistent final code (PD-309-11) lifts into it, since the
  // frame's paint is off and no renderer paints that small code (gh#319).
  assert.deepEqual(overOf(s).children.map((c) => c.className), ['pd-fcode']);
  assert.equal(s.frame.querySelector('.pd-fcode'), null, 'the persistent code stayed in the hidden frame');
});

test('release: dispose, reduced motion and narrowing each clear the mark and draw the frame back in one render', async () => {
  {
    const origin = fakeOrigin();
    storedQrEvent(origin, { rounds: ['zones', 'zones', null, null], final: null });
    const { hosts, start } = heldHosts();
    const s = await mount({ origin, rng: seeded(9), startReveal: start });
    press(s);
    await origin.idle();
    hosts[0].run();
    hosts[0].settle();
    assert.ok(viewportOf(s).hasAttribute('data-held'));
    press(s);
    await origin.idle();
    press(s);
    await origin.idle();
    assert.ok(!canvasUp(s));
    assert.ok(!viewportOf(s).hasAttribute('data-held'), 'dispose left the frame hidden');
    assert.equal(overOf(s).children.length, 0);
  }
  // The host releases a held picture on these triggers and calls onRelease (game-host.test.mjs owns the
  // trigger coverage): the state stays settled, the canvas goes, and the callback draws the frame back in
  // one render -- never a hidden frame on a bare ground, and no timer wait.
  for (const label of ['reduced motion', 'narrowing']) {
    const origin = fakeOrigin();
    storedQrEvent(origin, { rounds: ['zones', 'zones', null, null], final: null });
    const { hosts, start } = heldHosts();
    const s = await mount({ origin, rng: seeded(9), startReveal: start });
    press(s);
    await origin.idle();
    hosts[0].run();
    hosts[0].settle();
    assert.ok(viewportOf(s).hasAttribute('data-held'), `${label}: precondition`);
    hosts[0].release();
    assert.ok(!canvasUp(s), `${label}: the fake did not release the picture`);
    assert.ok(!viewportOf(s).hasAttribute('data-held'), `${label} left the frame hidden after the release`);
    assert.ok(s.frame.querySelector('.pd-codebox'), `${label}: the code card did not come back into the frame`);
    assert.equal(overOf(s).children.length, 0, `${label}: the overlay kept a lifted node`);
  }
});

test('CSS move: the lane plate base and the overlay geometry live in reveal.css once, copied nowhere', () => {
  const count = (css, sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (css.match(new RegExp(`^${esc}\\s*\\{`, 'gm')) ?? []).length;
  };
  for (const sel of ['.pd-plate', '.pd-plate-name', '.pd-plate-name:not(.nm-wrap)']) {
    assert.equal(count(REVEAL_CSS, sel), 1, `${sel} is not in reveal.css exactly once`);
    assert.equal(count(PLAY_CSS, sel), 0, `${sel} was copied, not moved (still in play.css)`);
    assert.equal(count(DEMO_CSS, sel), 0, `${sel} was copied, not moved (still in demo.css)`);
  }
  // The overlay's geometry rule once: the props block lists .pd-over as a second selector of one shared
  // rule, so count rules whose body carries the frame box, not selector mentions.
  const overGeo = (REVEAL_CSS.match(/^\.pd-over\s*\{[^}]*\}/gm) ?? []).filter((r) => /inline-size:\s*1920px/.test(r));
  assert.equal(overGeo.length, 1, 'the overlay geometry is not in reveal.css exactly once');
  assert.equal(count(PLAY_CSS, '.pd-over'), 0, '.pd-over was copied, not moved (still in play.css)');
  assert.equal(count(DEMO_CSS, '.pd-over'), 0, '.pd-over was copied, not moved (still in demo.css)');
});

test('lift: with no held host nothing moves -- the code card stays in the frame, the overlay is empty', async () => {
  const origin = fakeOrigin();
  storedQrEvent(origin, { rounds: ['fireworks', null, null, null], final: null });
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(9), startReveal: start });
  press(s);
  await origin.idle();
  hosts[0].run();
  hosts[0].settle(); // fireworks hands back
  assert.ok(!canvasUp(s));
  assert.ok(s.frame.querySelector('.pd-codebox'), 'the code card left the frame with no held host');
  assert.equal(overOf(s).children.length, 0, 'the overlay held a node with no held host');
});

// ---- 8. The reveal input carries the mode's claim truth: the picture's claim line is QR mode's ----

test('a hold final\'s reveal carries the mode\'s claim truth: admin mode false, QR mode true', async () => {
  for (const game of ['envelopes', 'flipcards']) {
    // Admin mode: no phones, so the held picture must not paint the claim line.
    const admin = fakeOrigin();
    atPickFinal(admin, game);
    const a = heldHosts();
    const sa = await mount({ origin: admin, rng: seeded(5), startReveal: a.start });
    await drawPickFinal(sa, admin, game);
    assert.equal(a.hosts.length, 1, `${game}: the admin final mounted no reveal`);
    assert.equal(a.hosts[0].options.input.claim, false, `${game}: an admin-mode final asked for the claim line`);
    // QR mode: the same final on a PIN-keyed event asks for it, the truth the 2D result's claim reads.
    const qr = fakeOrigin();
    let ev = storedQrEvent(qr, { rounds: [null, null, null, null], final: game });
    const rng = seeded(4);
    for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
    seedRaw(qr, encodeEvent(ev));
    const q = heldHosts();
    const sq = await mount({ origin: qr, rng: seeded(5), startReveal: q.start });
    await drawPickFinal(sq, qr, game);
    assert.equal(q.hosts.length, 1, `${game}: the QR final mounted no reveal`);
    assert.equal(q.hosts[0].options.input.claim, true, `${game}: a QR-mode final did not ask for the claim line`);
  }
});

// ---- 9. The held picture's lifecycle edges (gh#319 cross-lineage review) ----

test('held final: closing the code card lifts the persistent final code into the overlay, never over the open card', async () => {
  for (const game of ['envelopes', 'flipcards']) {
    const origin = fakeOrigin();
    let ev = storedQrEvent(origin, { rounds: [null, null, null, null], final: game });
    const rng = seeded(4);
    for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
    seedRaw(origin, encodeEvent(ev));
    const { hosts, start } = heldHosts();
    const s = await mount({ origin, rng: seeded(5), startReveal: start });
    await drawPickFinal(s, origin, game);
    hosts[0].run();
    hosts[0].settle();
    assert.ok(canvasUp(s), `${game}: precondition, the picture is held`);
    // The card is open: the small code stays under the veil, not lifted over the card that already shows it.
    assert.deepEqual(overOf(s).children.map((c) => c.className), ['pd-veil', 'pd-codebox']);
    press(s); // the MC closes the code card
    await origin.idle();
    assert.ok(canvasUp(s), `${game}: closing the card released the picture`);
    const kept = overOf(s).querySelector('.pd-fcode');
    assert.ok(kept, `${game}: the persistent final code did not lift into the overlay`);
    assert.equal(s.frame.querySelector('.pd-fcode'), null, `${game}: the code stayed in the hidden frame`);
    assert.match(kept.querySelector('.pd-ed').textContent, /^\d{4} \d{3}$/, `${game}: the lifted code lost its digits`);
  }
});

test('free-name row: a refit recomputes its top on both sides of the threshold (envelopes and flipcards)', async () => {
  for (const game of ['envelopes', 'flipcards']) {
    const origin = fakeOrigin();
    atPickFinal(origin, game);
    const { win, dispatch } = navWin();
    const doc = makeDoc();
    doc.defaultView = win;
    const s = await mount({ origin, doc, rng: seeded(5) });
    const vp = s.root.querySelector('.pd-viewport');
    const row = () => s.root.querySelector('.pd-names');
    assert.ok(row(), `${game}: no free-name row on the pick screen`);
    const at = (w, h) => {
      vp.clientWidth = w;
      vp.clientHeight = h;
      win.innerWidth = w;
      dispatch('resize');
    };
    // 640x900: below both thresholds, the row takes real pixels.
    at(640, 900);
    const s640 = Math.min(640 / 1920, 900 / 1080);
    assert.ok(row().hasAttribute('data-real'), `${game} at 640: the row is not real-pixel`);
    assert.equal(row().style.getPropertyValue('--names-y'), `${freeRowTop(game, s640)}px`, `${game} at 640: wrong row top`);
    // 1247x900: flipcards is still below its threshold (0.6495 < 0.65), envelopes is above (>= 0.52).
    at(1247, 900);
    const s1247 = Math.min(1247 / 1920, 900 / 1080);
    if (s1247 < ROW_THRESHOLD[game]) {
      assert.ok(row().hasAttribute('data-real'), `${game} at 1247: the row left real pixels below its threshold`);
      assert.equal(row().style.getPropertyValue('--names-y'), `${freeRowTop(game, s1247)}px`, `${game} at 1247: the row kept the 640 offset`);
    } else {
      assert.ok(!row().hasAttribute('data-real'), `${game} at 1247: the row kept real pixels above its threshold`);
      assert.equal(row().style.getPropertyValue('--names-y'), `${NAMES_Y[game]}px`, `${game} at 1247: the row did not return to frame px`);
      assert.ok(!vp.hasAttribute('data-row-real'), `${game} at 1247: the band still yields to a frame-px row`);
    }
    // 1440x900: above both thresholds, the row keeps NAMES_Y in frame px.
    at(1440, 900);
    assert.ok(!row().hasAttribute('data-real'), `${game} at 1440: the row is still real-pixel`);
    assert.equal(row().style.getPropertyValue('--names-y'), `${NAMES_Y[game]}px`, `${game} at 1440: wrong frame-px row top`);
  }
});

test('navigation: pagehide disposes the held host; a persisted pageshow repaints the 2D result', async () => {
  const origin = fakeOrigin();
  atPickFinal(origin, 'envelopes');
  const { hosts, start } = heldHosts();
  const { win, dispatch } = navWin();
  const doc = makeDoc();
  doc.defaultView = win;
  const s = await mount({ origin, doc, rng: seeded(5), startReveal: start });
  await drawPickFinal(s, origin, 'envelopes');
  hosts[0].run();
  hosts[0].settle();
  assert.ok(canvasUp(s), 'precondition: the final picture is held');
  dispatch('pagehide', { persisted: true });
  assert.equal(hosts[0].disposed, 1, 'pagehide did not dispose the held host');
  assert.ok(!canvasUp(s), 'the held canvas survived navigation');
  assert.ok(!viewportOf(s).hasAttribute('data-held'), 'pagehide left the frame hidden');
  dispatch('pageshow', { persisted: true });
  assert.equal(screen(s), 'result', 'a persisted restore did not repaint the 2D result');
  assert.ok(!canvasUp(s), 'a restored page held a picture again');
});

test('announce writes every line, even an identical one: a distinct final with matching text still announces', async () => {
  const { announce } = await import('../_prize-reveal/reveal.ts');
  const doc = makeDoc();
  const live = doc.createElement('p');
  const winners = [{ place: 1, prize: 'TV', name: 'P1' }, { place: 2, prize: 'Bike', name: 'P2' }];
  // Two DISTINCT committed finals (different events) whose result text happens to match: adopting the second
  // must still announce it. A dedupe on the line text would suppress it (gh#319 REFUTE round 2).
  const a = { kind: 'result', eventName: 'Event A', winners };
  const b = { kind: 'result', eventName: 'Event B', winners };
  let writes = 0;
  const real = live.replaceChildren.bind(live);
  live.replaceChildren = (...args) => {
    writes++;
    return real(...args);
  };
  announce(live, a, doc);
  announce(live, b, doc);
  assert.equal(writes, 2, 'announce suppressed a distinct final whose text matches');
});

test('a held picture\'s release repaints the frame without re-announcing the settled result', async () => {
  const origin = fakeOrigin();
  atPickFinal(origin, 'envelopes');
  const { hosts, start } = heldHosts();
  const s = await mount({ origin, rng: seeded(5), startReveal: start });
  await drawPickFinal(s, origin, 'envelopes');
  hosts[0].run();
  hosts[0].settle();
  const line = s.live.textContent;
  assert.ok(line.includes('ผู้ได้รับรางวัล'), 'precondition: the result was announced at settle');
  let writes = 0;
  const real = s.live.replaceChildren.bind(s.live);
  s.live.replaceChildren = (...args) => {
    writes++;
    return real(...args);
  };
  // The host's release fires onRelease: the repaint draws the frame back but must not touch the live region.
  hosts[0].release();
  assert.equal(writes, 0, 'the release repaint re-announced the settled result');
  assert.equal(s.live.textContent, line, 'the release repaint changed the live line');
  assert.ok(!viewportOf(s).hasAttribute('data-held'), 'the release did not draw the frame back');
  assert.ok(s.frame.querySelector('.pd-spot'), 'the release did not repaint the 2D result');
});

test('navigation: a loading-phase pagehide then a persisted pageshow leaves the stage usable (MC button back)', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: { rounds: ['fireworks', null, null, null], final: null } });
  const { hosts, start } = heldHosts();
  const { win, dispatch } = navWin();
  const doc = makeDoc();
  doc.defaultView = win;
  const s = await mount({ origin, doc, rng: seeded(9), startReveal: start });
  press(s); // commits the draw; the host is still LOADING
  await origin.idle();
  assert.equal(hosts[0].state, 'loading', 'precondition: the reveal was still loading');
  assert.equal(s.go(), null, 'precondition: the MC bar is empty while it presents');
  dispatch('pagehide', { persisted: true });
  dispatch('pageshow', { persisted: true });
  // The stage's restore re-renders the committed step AND its controls, so it has no loading-phase hole.
  assert.ok(s.go(), 'a persisted restore left the stage with no MC control');
  assert.equal(screen(s), 'reveal', 'the restore did not show the committed step');
});
