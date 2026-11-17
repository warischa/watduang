// Every reveal on the prize-draw projector route arms what it reveals (ADR-0017), including the close path
// (ADR-0057): closing the storage notice uncovers the MC's button, which is a reveal like any other.
//
// Two halves, the shape the other play routes use:
//   1. SOURCE: stage.ts routes every un-hide through ONE helper, show(), which calls armAllButtons on the
//      region it shows. The set this test enumerates is show()'s call sites, which stage.ts owns; a new
//      un-hide written outside show() fails here on the day it is added, and a stale expectation fails too.
//   2. BEHAVIOUR: the route is mounted for real on the prize fake DOM with the real arm gate
//      (src/games/_arm-gate.ts) and walked through every transition. After each one, the button the room
//      now sees is disabled (inside its 400ms window); after the window it is live. The notice's close path
//      is driven the same way.
// Stated ceiling: half 2 proves the window is opened on every path; the input-clock half of the gate
// (ADR-0059) is the shared gate's own, tested in src/games/_arm-gate.test.mjs.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ARM_DELAY_MS } from '../../games/_arm-gate.ts';
import { fakeHosts, fakeOrigin, mount, seedRaw, seeded, storedEvent, storedRaw } from './stage-harness.mjs';
import { advance, createEvent, drawNext, encodeEvent, revealDrawn } from '../../prize-event/event.ts';

const SOURCE = fs
  .readFileSync(path.join(import.meta.dirname, 'stage.ts'), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

test('show() is the only un-hide, and it arms the region it shows', () => {
  const unhides = [...SOURCE.matchAll(/(\w+)\.hidden\s*=\s*false/g)].map((m) => m[1]);
  assert.deepEqual(unhides, ['region'], `un-hide outside show(): ${unhides.join(', ')}`);
  assert.match(SOURCE, /const show = \(region: HTMLElement\): void => \{\s*region\.hidden = false;\s*armAllButtons\(region\);\s*\};/);
});

// receiver -> why it is shown. Every entry is a decision.
const EXPECTED_SHOWS = new Map([
  ['viewport', 'every render (cold, refused, round, reveal, final, result, and the QR lobby of gh#308, which holds no control; and the close of a QR-mode code card, gh#309, which uncovers the frame and brings the step\'s own button back) rebuilds the frame and the MC bar inside the viewport and arms it, including a follower render (another tab moved the event: taken up on its commit notice or on this screen\'s own stale press) and the render a 3D reveal\'s first exit draws (gh#305); every ladder lane tap and name tap, and every envelopes or flipcards object tap and name tap (gh#317, gh#318, the ladder\'s placement reused), repaints the placement frame, the picks and the MC bar inside it and re-arms it; and the notice close path rebuilds the MC\'s button, held while the notice was open, and uncovers it again (ADR-0057)'],
  ['notice', 'the storage-failure notice, which carries its own close button'],
]);

test('every show() call site is a known reveal', () => {
  const calls = [...SOURCE.matchAll(/\bshow\((\w+)\)/g)].map((m) => m[1]);
  assert.ok(calls.length > 0, 'no show() calls: this test would pass vacuously');
  const unknown = [...new Set(calls)].filter((c) => !EXPECTED_SHOWS.has(c));
  assert.deepEqual(unknown, [], `new reveal(s) ${unknown.join(', ')}: arm them through show() and add them here with the reason`);
  const stale = [...EXPECTED_SHOWS.keys()].filter((k) => !calls.includes(k));
  assert.deepEqual(stale, [], `expected reveals that no longer exist: ${stale.join(', ')}`);
  // The frame is rebuilt by renderScreen; the arm must follow it in the same render.
  assert.match(SOURCE, /renderScreen\(frame,[^;]*\);[\s\S]*?show\(viewport\);\s*\};/);
});

test('the close handler shows the frame again (the close path is armed at its own site)', () => {
  const at = SOURCE.indexOf("close.addEventListener('click'");
  assert.ok(at > -1, 'no close handler: this test measures nothing');
  const body = SOURCE.slice(at, SOURCE.indexOf('});', at));
  assert.match(body, /notice\.hidden = true;[\s\S]*show\(viewport\);/);
});

function armedThenLive(button, label) {
  assert.ok(button, `${label}: no button on screen`);
  assert.equal(button.disabled, true, `${label}: the revealed button is live at once; a double tap would land on it`);
  mock.timers.tick(ARM_DELAY_MS);
  assert.equal(button.disabled, false, `${label}: the button never armed`);
}

test('every transition arms the button it reveals, round 1 to the result', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 50 });
    const s = await mount({ origin, rng: seeded(9) });
    armedThenLive(s.go(), 'first screen');
    for (let r = 1; r <= 4; r++) {
      s.go().click(); // reveal
      await origin.idle();
      assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
      armedThenLive(s.go(), `round ${r} reveal`);
      s.go().click(); // next
      await origin.idle();
      armedThenLive(s.go(), `after round ${r}`);
    }
    assert.equal(s.frame.getAttribute('data-screen'), 'final');
    s.go().click();
    await origin.idle();
    assert.equal(s.frame.getAttribute('data-screen'), 'result');
    assert.equal(s.go(), null, 'the result ends the event: no MC button');
  } finally {
    mock.timers.reset();
  }
});

/** A QR-mode event (gh#309): server-shaped ids and a PIN key, so its steps paint round codes. */
function storedQrEvent(origin, games) {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const people = Array.from({ length: 80 }, (_, i) => ({ id: B64[i >> 6] + B64[i & 63] + 'x'.repeat(20), name: `P${i + 1}` }));
  const ev = createEvent(
    { eventName: 'Party', names: people.map((p) => p.name), schedule: [80, 40, 20, 10, 5], prizes: ['TV', 'Bike'], games, qr: { pin: '048213', roster: people } },
    seeded(5),
  );
  seedRaw(origin, encodeEvent(ev));
}

test('QR mode (gh#309): each code card comes up with its close armed, and the close re-arms the step\'s own button', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    storedQrEvent(origin, { rounds: [null, 'cards', null, null], final: null });
    // The card round's 3D deal falls back at once, so its 2D view (where the code card is) draws.
    const { start } = fakeHosts();
    const instant = (options) => {
      const h = start(options);
      h.exit('fallback');
      return h;
    };
    const s = await mount({ origin, rng: seeded(9), startReveal: instant });
    const codeUp = () => s.frame.querySelector('.pd-codebox') !== null;
    const close = async (label, last = false) => {
      assert.ok(codeUp(), `${label}: no code card`);
      armedThenLive(s.go(), `${label}: the code card's close`);
      assert.equal(s.go().textContent, 'ตกลง');
      s.go().click();
      await origin.idle();
      assert.ok(!codeUp(), `${label}: the close left the card up`);
      if (!last) armedThenLive(s.go(), `${label}: the button the close uncovered`);
    };
    armedThenLive(s.go(), 'first screen');
    for (let r = 1; r <= 4; r++) {
      if (r === 2) {
        s.go().click(); // deal
        await origin.idle();
        await close(`round ${r} deal`);
      }
      s.go().click(); // reveal
      await origin.idle();
      assert.equal(s.frame.getAttribute('data-screen'), 'reveal', `round ${r}`);
      if (r !== 2) await close(`round ${r} reveal`);
      else {
        assert.ok(!codeUp(), 'a card round paints its code at the deal only');
        armedThenLive(s.go(), `round ${r} reveal`);
      }
      s.go().click(); // next
      await origin.idle();
      armedThenLive(s.go(), `after round ${r}`);
    }
    s.go().click();
    await origin.idle();
    assert.equal(s.frame.getAttribute('data-screen'), 'result');
    assert.ok(s.frame.querySelector('.pd-claim'), 'the claim line');
    await close('result', true);
    assert.equal(s.go(), null, 'the result ends the event: no MC button once the code is closed');
    // PD-309-11 (owner pick 2026-11-14): with the card closed, the result keeps the final's code in small type.
    const kept = s.frame.querySelector('.pd-fcode');
    assert.ok(kept, 'the final code left the result with its card');
    assert.equal(kept.querySelector('.pd-er').textContent, 'รหัสรอบชิง');
    assert.match(kept.querySelector('.pd-ed').textContent, /^\d{4} \d{3}$/);
    // PD-309-07: the claim line keeps the staff compound whole with the site's no-wrap span.
    assert.deepEqual(s.frame.querySelector('.pd-claim').querySelectorAll('.nw').map((n) => n.textContent), ['ทีมงาน']);
  } finally {
    mock.timers.reset();
  }
});

test('close path: an aborted store opens the notice armed, and closing it re-arms the MC button (ADR-0057)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 50 });
    const s = await mount({ origin, rng: seeded(3) });
    mock.timers.tick(ARM_DELAY_MS);
    origin.faults.abortCommits = 1;
    s.go().click();
    await origin.idle();
    assert.equal(s.notice.hidden, false, 'the notice did not open on an aborted store');
    assert.equal(s.frame.getAttribute('data-screen'), 'round', 'a draw that was not stored was revealed');
    const close = s.notice.querySelector('button');
    armedThenLive(close, 'notice close');
    // The MC's button sits in the play band, outside the notice's veil (gh#314 1a B): it stays dead while
    // the notice is open, however long the room waits.
    assert.equal(s.go().disabled, true, 'the MC button is live while the notice is open');
    close.click();
    assert.equal(s.notice.hidden, true);
    armedThenLive(s.go(), 'MC button uncovered by the close');
  } finally {
    mock.timers.reset();
  }
});

/** Two tabs on one stored event, past their first arm window; A has revealed round 1. Messages between the
 *  tabs wait until a test delivers them. */
async function twoTabs() {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50 });
  const held = { A: [], B: [] };
  const tab = async (name, seed) => {
    const env = origin.tab(name);
    // Hold this tab's commit notices until the test delivers them.
    const Real = env.BroadcastChannel;
    env.BroadcastChannel = class extends Real {
      addEventListener(type, l) {
        super.addEventListener(type, (ev) => held[name].push(() => l(ev)));
      }
    };
    return { ...(await mount({ origin, env, rng: seeded(seed) })), deliver: async () => { for (const f of held[name].splice(0)) f(); await origin.idle(); } };
  };
  const tabs = { A: await tab('A', 21), B: await tab('B', 22) };
  mock.timers.tick(ARM_DELAY_MS);
  tabs.A.go().click();
  await origin.idle();
  return { ...tabs, origin };
}

test('follower path, commit notice: a tab that follows another tab\'s reveal arms the button it reveals', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { A, B } = await twoTabs();
    assert.equal(A.frame.getAttribute('data-screen'), 'reveal');
    assert.equal(B.frame.getAttribute('data-screen'), 'round', 'precondition: the follower has not heard yet');
    await B.deliver();
    assert.equal(B.frame.getAttribute('data-screen'), 'reveal', 'the follower did not re-render the stored reveal');
    armedThenLive(B.go(), 'follower, on the commit notice');
  } finally {
    mock.timers.reset();
  }
});

test('follower path, own press: a tab that was behind takes the stored step up on its tap, and the button under that finger is armed', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { A, B, origin } = await twoTabs();
    const behind = B.go();
    assert.equal(behind.disabled, false, 'precondition: the stale button is live');
    behind.click(); // no notice delivered: B learns of the reveal from its own compare-and-set
    await origin.idle();
    assert.equal(B.frame.getAttribute('data-screen'), 'reveal', 'the stale tab did not take up the stored reveal');
    assert.deepEqual(B.stage.current().rounds, A.stage.current().rounds, 'the stale tab drew its own round instead of taking up the stored one');
    armedThenLive(B.go(), 'follower, on its own press');
  } finally {
    mock.timers.reset();
  }
});

test('a 3D reveal\'s exit brings the MC button back armed, and a card round\'s deal -> rule press is armed at each step', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 200, games: { rounds: ['cards', 'fireworks', null, null], final: null } });
    const { hosts, start } = fakeHosts();
    const s = await mount({ origin, rng: seeded(9), startReveal: start });
    armedThenLive(s.go(), 'first screen');
    s.go().click(); // deal
    await origin.idle();
    assert.equal(s.go(), null, 'no MC button while the deal presents');
    hosts[0].run();
    hosts[0].settle();
    armedThenLive(s.go(), 'the rule press, revealed by the deal\'s exit');
    s.go().click(); // rule
    await origin.idle();
    hosts[1].settle();
    assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
    armedThenLive(s.go(), 'round 1 reveal, after the cards exit');
    s.go().click(); // next
    await origin.idle();
    armedThenLive(s.go(), 'round 2');
    s.go().click(); // fireworks draw
    await origin.idle();
    hosts[2].exit('fallback');
    armedThenLive(s.go(), 'round 2 reveal, after a fallback exit');
  } finally {
    mock.timers.reset();
  }
});

test('zones rounds (gh#315): the pre-draw zones come up with the draw button armed, and the 3D exit and the step into the next zones round re-arm it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 50, games: { rounds: ['zones', 'zones', null, null], final: null } });
    const { hosts, start } = fakeHosts();
    const s = await mount({ origin, rng: seeded(9), startReveal: start });
    assert.equal(s.frame.getAttribute('data-screen'), 'zones');
    armedThenLive(s.go(), 'round 1 zones, first screen');
    s.go().click(); // draw
    await origin.idle();
    assert.equal(s.go(), null, 'no MC button while the zones reveal presents');
    hosts[0].run();
    hosts[0].settle();
    armedThenLive(s.go(), 'round 1 reveal, after the zones exit');
    s.go().click(); // next
    await origin.idle();
    assert.equal(s.frame.getAttribute('data-screen'), 'zones');
    armedThenLive(s.go(), 'round 2 zones, after the step forward');
    s.go().click(); // draw
    await origin.idle();
    hosts[1].exit('fallback');
    armedThenLive(s.go(), 'round 2 reveal, after a fallback exit');
  } finally {
    mock.timers.reset();
  }
});

test('card round, two presses in one spot (design/Gh305GamePick.dc.html i3 B): the deal press and then the rule press, which re-enables armed, so a double tap on the deal never draws the rule (ADR-0057)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 200, games: { rounds: ['cards', null, null, null], final: null } });
    // The host falls back at once (no WebGL): the rule press is back in the same tick as the deal commits.
    const { hosts, start } = fakeHosts();
    const instant = (options) => {
      const h = start(options);
      h.exit('fallback');
      return h;
    };
    const s = await mount({ origin, rng: seeded(9), startReveal: instant });
    mock.timers.tick(ARM_DELAY_MS);
    const first = s.go();
    assert.equal(first.textContent, 'แจกไพ่', 'press 1 deals');
    const bar = s.root.querySelector('.pd-mc');
    first.click(); // press 1
    await origin.idle();
    assert.equal(hosts.length, 1);
    const second = s.go();
    assert.equal(second.textContent, 'เปิดผล', 'press 2 draws the rule');
    assert.equal(second.parentNode, bar, 'press 2 sits where press 1 was');
    second.click(); // the second contact of a double tap on press 1
    await origin.idle();
    const ev = JSON.parse(storedRaw(origin));
    assert.equal(ev.rounds.length, 0, 'the second contact drew the rule before the room saw the deal');
    assert.ok(ev.prepared, 'the deal is stored');
    armedThenLive(s.go(), 'the rule press after the deal');
  } finally {
    mock.timers.reset();
  }
});

/** A stored ladder event at its final, ready, with its slot layout (the MC's step into it stores it). */
function ladderFinal(origin) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: 'ladder' } });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

test('ladder final: every lane tap and every name tap re-arms the picks, the fifth reveals the draw button armed, and the confirm path ends on the result', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const origin = fakeOrigin();
    ladderFinal(origin);
    const { hosts, start } = fakeHosts();
    const s = await mount({ origin, rng: seeded(5), startReveal: start });
    mock.timers.tick(ARM_DELAY_MS);
    assert.equal(s.go().disabled, true, 'the draw is live before any lane is picked');
    for (let lane = 0; lane < 5; lane++) {
      s.laneButtons()[lane].click();
      armedThenLive(s.nameButtons()[0], `the name row after the lane ${lane + 1} tap`);
      s.nameButtons()[0].click();
      await origin.idle(); // the pick is a stored write; the repaint follows its commit
      if (lane < 4) {
        armedThenLive(s.nameButtons()[0], `the name row after pick ${lane + 1}`);
        assert.equal(s.go().disabled, true, `the draw went live after ${lane + 1} picks`);
      }
    }
    // The fifth pick re-armed the viewport: the draw button is in its window, then live.
    armedThenLive(s.go(), 'the draw, after the fifth pick');
    // Emptying lane 2 sends the draw back to waiting, through the window too.
    s.laneButtons()[1].click();
    await origin.idle();
    mock.timers.tick(ARM_DELAY_MS);
    assert.equal(s.go().disabled, true, 'the draw stayed live with a lane emptied');
    s.nameButtons()[0].click();
    await origin.idle();
    armedThenLive(s.go(), 'the draw, after the picks are complete again');
    s.go().click(); // confirm the picks and draw
    await origin.idle();
    assert.equal(hosts.length, 1);
    assert.equal(s.laneButtons().length, 0, 'the lane picks stay on screen while the ladder presents');
    hosts[0].settle();
    assert.equal(s.frame.getAttribute('data-screen'), 'result');
    assert.equal(s.go(), null);
  } finally {
    mock.timers.reset();
  }
});

/** A stored envelopes or flipcards event at its final, ready, with five empty objects (its step stores them). */
function pickFinal(origin, game) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: game } });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

for (const game of ['envelopes', 'flipcards']) {
  test(`${game} final: every object tap, name tap and undo tap re-arms the picks, the fifth reveals the draw button armed, and the confirm path ends on the result`, async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const origin = fakeOrigin();
      pickFinal(origin, game);
      const { hosts, start } = fakeHosts();
      const s = await mount({ origin, rng: seeded(5), startReveal: start });
      mock.timers.tick(ARM_DELAY_MS);
      assert.equal(s.go().disabled, true, 'the draw is live before any object is picked');
      for (let object = 0; object < 5; object++) {
        s.laneButtons()[object].click();
        armedThenLive(s.nameButtons()[0], `the name row after the object ${object + 1} tap`);
        s.nameButtons()[0].click();
        await origin.idle(); // the pick is a stored write; the repaint follows its commit
        if (object < 4) {
          armedThenLive(s.nameButtons()[0], `the name row after pick ${object + 1}`);
          assert.equal(s.go().disabled, true, `the draw went live after ${object + 1} picks`);
        }
      }
      armedThenLive(s.go(), 'the draw, after the fifth pick');
      // Undo: emptying object 2 brings its finalist back armed and sends the draw back to waiting.
      s.laneButtons()[1].click();
      await origin.idle();
      armedThenLive(s.nameButtons()[0], 'the name row after the undo tap');
      assert.equal(s.go().disabled, true, 'the draw stayed live with an object emptied');
      s.nameButtons()[0].click();
      await origin.idle();
      armedThenLive(s.go(), 'the draw, after the picks are complete again');
      s.go().click(); // confirm the picks and draw
      await origin.idle();
      assert.equal(hosts.length, 1);
      assert.equal(s.laneButtons().length, 0, 'the object picks stay on screen while the final presents');
      hosts[0].settle();
      assert.equal(s.frame.getAttribute('data-screen'), 'result');
      assert.equal(s.go(), null);
    } finally {
      mock.timers.reset();
    }
  });
}
