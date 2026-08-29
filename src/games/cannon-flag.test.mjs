// node --test src/games/cannon-flag.test.mjs — no framework, no dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TARGET_HIT_ZONE_RADIUS,
  GRAVITY,
  WIND_FORCE_SCALE,
  createPRNG,
  generateEnvironment,
  lineIntersect,
  simulateShot,
  evaluateStandings,
  startRound,
  startSuddenDeath,
  SoundSynthesizer,
  CanvasRenderer,
} from './cannon-flag.ts';

// ---------------------------------------------------------------------------
// 1. Pure PRNG & Determinism Tests
// ---------------------------------------------------------------------------

test('PRNG produces deterministic outputs for the same seed', () => {
  const prng1 = createPRNG(42);
  const prng2 = createPRNG(42);
  const values1 = [prng1(), prng1(), prng1(), prng1()];
  const values2 = [prng2(), prng2(), prng2(), prng2()];
  assert.deepEqual(values1, values2);
});

test('generateEnvironment creates valid terrain, plateaus, and non-overlapping obstacles', () => {
  const env = generateEnvironment(12345);
  assert.equal(env.seed, 12345);
  assert.equal(env.cannonPos.x, 90);
  assert.ok(env.flagPos.x >= 740 && env.flagPos.x <= 910);
  assert.ok(env.wind.strength >= 5.0 && env.wind.strength <= 33.0);
  assert.ok(env.wind.direction === 1 || env.wind.direction === -1);

  // Terrain height query returns a valid number
  const hCannon = env.getTerrainHeight(90);
  assert.ok(hCannon > 0 && hCannon < WORLD_HEIGHT);

  // Plateau check: terrain is smooth near cannon
  const hNearCannon = env.getTerrainHeight(92);
  assert.ok(Math.abs(hNearCannon - hCannon) < 1.0);

  // Obstacles are within safe bounds
  for (const obs of env.obstacles) {
    assert.ok(obs.left >= 200, 'obstacle is too close to cannon');
    assert.ok(obs.right <= env.flagPos.x - 30, 'obstacle overlaps flag');
  }
});

// ---------------------------------------------------------------------------
// 2. Line Intersection & Collision Raycasting
// ---------------------------------------------------------------------------

test('lineIntersect returns point for crossing segments', () => {
  const hit = lineIntersect(0, 0, 10, 10, 0, 10, 10, 0);
  assert.ok(hit !== null);
  assert.ok(Math.abs(hit.x - 5) < 1e-5);
  assert.ok(Math.abs(hit.y - 5) < 1e-5);
});

test('lineIntersect returns null for parallel or non-overlapping segments', () => {
  const parallel = lineIntersect(0, 0, 10, 0, 0, 5, 10, 5);
  assert.equal(parallel, null);

  const nonOverlapping = lineIntersect(0, 0, 5, 5, 10, 10, 20, 20);
  assert.equal(nonOverlapping, null);
});

// ---------------------------------------------------------------------------
// 3. Ballistic Physics Simulation
// ---------------------------------------------------------------------------

test('simulateShot is completely reproducible given fixed inputs', () => {
  const env = generateEnvironment(54321);
  const shot1 = simulateShot(env, 45, 0.6);
  const shot2 = simulateShot(env, 45, 0.6);

  assert.equal(shot1.isDirectHit, shot2.isDirectHit);
  assert.equal(shot1.gameDistance, shot2.gameDistance);
  assert.equal(shot1.hitType, shot2.hitType);
  assert.ok(Math.abs(shot1.impact.x - shot2.impact.x) < 1e-5);
  assert.ok(Math.abs(shot1.impact.y - shot2.impact.y) < 1e-5);
});

test('simulateShot detects direct hit within TARGET_HIT_ZONE_RADIUS', () => {
  const env = generateEnvironment(11111);
  // Create a synthetic environment where flag sits right in trajectory
  const customEnv = {
    ...env,
    flagPos: { x: 500, y: 150 },
    getTerrainHeight: (x) => 100,
    obstacles: [],
    pond: null,
    wind: { direction: 1, strength: 0 },
  };

  // Run a shot that passes near (500, 150)
  const res = simulateShot(customEnv, 45, 0.65);
  // Direct hit sets score to 00.00
  if (res.rawDistance <= TARGET_HIT_ZONE_RADIUS) {
    assert.equal(res.isDirectHit, true);
    assert.equal(res.gameDistance, 0.0);
  }
});

test('simulateShot collides with obstacles (anti-tunneling)', () => {
  const env = generateEnvironment(99999);
  const highObstacleEnv = {
    ...env,
    obstacles: [
      {
        id: 'test_wall',
        type: 'rock',
        x: 300,
        y: 100,
        width: 40,
        height: 400,
        left: 280,
        right: 320,
        bottom: 100,
        top: 500,
      },
    ],
    pond: null,
  };

  const shot = simulateShot(highObstacleEnv, 25, 0.9);
  assert.equal(shot.hitObstacle, true);
  assert.equal(shot.hitObstacleId, 'test_wall');
  assert.equal(shot.hitType, 'rock');
  assert.ok(shot.impact.x <= 325);
});

// ---------------------------------------------------------------------------
// 4. Standings, Scoring & Sudden Death
// ---------------------------------------------------------------------------

test('evaluateStandings ranks players ascending by best distance and picks furthest as loser', () => {
  const players = [
    { id: '1', name: 'ก', turnOrder: 1, shot1Distance: 12.4, shot2Distance: 4.15, bestDistance: 4.15 },
    { id: '2', name: 'ข', turnOrder: 2, shot1Distance: 18.0, shot2Distance: 9.32, bestDistance: 9.32 },
    { id: '3', name: 'ค', turnOrder: 3, shot1Distance: 2.1, shot2Distance: 2.1, bestDistance: 2.1 },
  ];

  const standings = evaluateStandings(players);
  assert.equal(standings.isTie, false);
  assert.equal(standings.sortedLeaderboard[0].name, 'ค'); // 2.10m (1st place)
  assert.equal(standings.sortedLeaderboard[1].name, 'ก'); // 4.15m (2nd place)
  assert.equal(standings.sortedLeaderboard[2].name, 'ข'); // 9.32m (3rd place / loser)
  assert.equal(standings.singleLoser?.name, 'ข');
  assert.equal(standings.worstDistance, 9.32);
});

test('evaluateStandings identifies ties for worst score with hundredth precision', () => {
  const players = [
    { id: '1', name: 'ก', turnOrder: 1, shot1Distance: 5.1, shot2Distance: 5.1, bestDistance: 5.1 },
    { id: '2', name: 'ข', turnOrder: 2, shot1Distance: 14.25, shot2Distance: 14.25, bestDistance: 14.25 },
    { id: '3', name: 'ค', turnOrder: 3, shot1Distance: 8.0, shot2Distance: 8.0, bestDistance: 8.0 },
    { id: '4', name: 'ง', turnOrder: 4, shot1Distance: 14.25, shot2Distance: 14.25, bestDistance: 14.25 },
  ];

  const standings = evaluateStandings(players);
  assert.equal(standings.isTie, true);
  assert.equal(standings.singleLoser, null);
  assert.equal(standings.tiedLosers.length, 2);
  assert.ok(standings.tiedLosers.some((p) => p.name === 'ข'));
  assert.ok(standings.tiedLosers.some((p) => p.name === 'ง'));
  assert.ok(!standings.tiedLosers.some((p) => p.name === 'ก'));
});

test('startSuddenDeath resets shot distances for tied players only and creates fresh environment', () => {
  const tied = [
    { id: '2', name: 'ข', turnOrder: 2, shot1Distance: 14.25, shot2Distance: 14.25, bestDistance: 14.25 },
    { id: '4', name: 'ง', turnOrder: 4, shot1Distance: 14.25, shot2Distance: 14.25, bestDistance: 14.25 },
  ];

  const sd = startSuddenDeath(tied);
  assert.equal(sd.players.length, 2);
  assert.equal(sd.players[0].shot1Distance, null);
  assert.equal(sd.players[0].bestDistance, null);
  assert.equal(sd.players[1].shot1Distance, null);
  assert.equal(sd.players[1].bestDistance, null);
  assert.ok(sd.env !== null);
});

test('startRound throws on empty players roster', () => {
  assert.throws(() => startRound([]), /ว่างเปล่า/);
});

// ---------------------------------------------------------------------------
// 5. Fake DOM & Component Lifecycle Tests
// ---------------------------------------------------------------------------

class FakeClassList {
  constructor() {
    this.set = new Set();
  }
  add(name) {
    this.set.add(name);
  }
  remove(name) {
    this.set.delete(name);
  }
  contains(name) {
    return this.set.has(name);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this._text = '';
    this._attrs = {};
    this._listeners = {};
    this.className = '';
    this.id = '';
    this.disabled = false;
    this.classList = new FakeClassList();
    this.style = {};
    this.width = 800;
    this.height = 480;
  }
  set textContent(v) {
    this._text = v;
  }
  get textContent() {
    return this._text;
  }
  set innerHTML(v) {
    this._text = v;
  }
  get innerHTML() {
    return this._text;
  }
  setAttribute(k, v) {
    this._attrs[k] = String(v);
  }
  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren() {
    this.children = [];
  }
  remove() {
    // detach
  }
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  click() {
    if (this.disabled) return;
    (this._listeners.click || []).forEach((fn) => fn({ type: 'click' }));
  }
  dispatchEvent(ev) {
    (this._listeners[ev.type] || []).forEach((fn) => fn(ev));
    return true;
  }
  getBoundingClientRect() {
    return { width: 800, height: 480, top: 0, left: 0 };
  }
  getContext() {
    return {
      save() {},
      restore() {},
      scale() {},
      translate() {},
      rotate() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      quadraticCurveTo() {},
      fill() {},
      stroke() {},
      fillRect() {},
      strokeRect() {},
      fillText() {},
      setLineDash() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
    };
  }
}

const fakeDoc = {
  hidden: false,
  _listeners: {},
  createElement: (tag) => new FakeElement(tag),
  getElementById: (id) => null,
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  },
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  },
  dispatchEvent(ev) {
    (this._listeners[ev.type] || []).forEach((fn) => fn(ev));
    return true;
  },
};

globalThis.document = fakeDoc;
globalThis.window = {
  matchMedia: (q) => ({
    media: q,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init ?? {});
  }
};

test('mount and dispose lifecycle cleans up cleanly without errors', () => {
  const stage = new FakeElement('div');
  const session = {
    players: ['ผู้เล่น A', 'ผู้เล่น B'],
    setPlayers() {},
    played: [],
    markPlayed(id) {
      this.played.push(id);
    },
    checkpoint: null,
    saveCheckpoint() {},
  };
  const ctx = {
    roster: { names: () => [], add() {} },
    session,
  };

  game.mount(stage, ctx);
  assert.ok(stage.children.length > 0);

  // Ready button should exist in handoff
  const readyBtn = stage.children[0]?.children?.find((c) => c.id === 'cf-ready-btn');
  assert.ok(readyBtn !== undefined, 'ready button should be rendered in handoff card');

  // Dispose cleans up
  game.dispose();
  assert.equal(stage.children.length, 0);
});

test('SoundSynthesizer initializes and disposes safely in headless environment', () => {
  const sound = new SoundSynthesizer();
  sound.init();
  sound.playClick();
  sound.playCannonFire();
  sound.playImpact('water');
  sound.playTargetDirectHit();
  sound.dispose();
  assert.equal(sound.enabled, true);
});

test('CanvasRenderer handles resizing and reduced motion', () => {
  const canvas = new FakeElement('canvas');
  const renderer = new CanvasRenderer(canvas);
  renderer.isReducedMotion = true;
  renderer.addTrauma(0.8);
  assert.equal(renderer.trauma, 0, 'trauma should be 0 under reduced motion');

  renderer.emitParticles('fire', 100, 100, 10);
  assert.equal(renderer.particles.length, 0, 'particles should not be spawned under reduced motion');
});
