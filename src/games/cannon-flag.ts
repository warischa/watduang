// Cannon Flag ("ยิงธง") — 2D ballistic physics artillery duel on one phone.
// Players pass the phone around in turn order, each taking 2 consecutive shots with 30s aim time.
// Closest landing to the target flag base (within 18 units = 00.00 direct hit) is their best score;
// the furthest player in the group is the loser ("โดน"). Ties for the worst distance trigger
// Sudden Death on a newly generated terrain environment.
//
// No checkpoint by design: the round derives from ctx.session.players at mount, lives in this
// closure, and dies on refresh and on dispose(). A refresh restarts the round from the setup panel.
// The only session write here is markPlayed at round end (ADR-0010).
//
// The canvas renders procedural terrain, water ponds, obstacles (trees, rocks), animated flag wave,
// particle effects, and screen shake. prefers-reduced-motion is checked literally via
// matchMedia('(prefers-reduced-motion: reduce)') to gate particles and screen shake (ADR-0046).
//
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept both.
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

// ---- Environment & Ballistic Physics Engine: Pure & Calculable ----

export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 600;
export const TARGET_HIT_ZONE_RADIUS = 18; // world units (within this = 00.00 score)

export const GRAVITY = 280; // world units / s^2 downwards
export const WIND_FORCE_SCALE = 2.4; // scales wind speed to horizontal accel
export const MIN_POWER_SPEED = 180;
export const MAX_POWER_SPEED = 560;
export const AIM_TIME_LIMIT_SEC = 30.0;
export const SHOTS_PER_PLAYER = 2;

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface PondObstacle {
  readonly id: string;
  readonly x: number;
  readonly left: number;
  readonly right: number;
  readonly waterLevel: number;
  readonly width: number;
}

export interface TerrainObstacle {
  readonly id: string;
  readonly type: 'tree' | 'rock';
  readonly subType?: 'pine' | 'oak';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly points?: readonly Point2D[];
}

export interface WindState {
  readonly direction: -1 | 1;
  readonly strength: number; // 5.0 to 33.0 m/s
}

export interface Environment {
  readonly seed: number;
  readonly cannonPos: Point2D;
  readonly flagPos: Point2D;
  readonly obstacles: readonly TerrainObstacle[];
  readonly pond: PondObstacle | null;
  readonly wind: WindState;
  getTerrainHeight(x: number): number;
}

export function createPRNG(seedNumber: number): () => number {
  let a = (seedNumber >>> 0) || 12345;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateEnvironment(seedInput?: number): Environment {
  const seed = typeof seedInput === 'number' ? seedInput : Math.floor(Math.random() * 90000) + 10000;
  let attempts = 0;
  let env: Environment | null = null;

  while (attempts < 50) {
    const currentSeed = seed + attempts;
    const prng = createPRNG(currentSeed);

    const baseHeight = 160 + prng() * 30;
    const h1A = 35 + prng() * 30,
      h1F = 0.003 + prng() * 0.002,
      h1P = prng() * Math.PI * 2;
    const h2A = 20 + prng() * 20,
      h2F = 0.007 + prng() * 0.003,
      h2P = prng() * Math.PI * 2;
    const h3A = 10 + prng() * 15,
      h3F = 0.015 + prng() * 0.005,
      h3P = prng() * Math.PI * 2;

    const rawTerrain = (x: number): number => {
      return (
        baseHeight +
        Math.sin(x * h1F + h1P) * h1A +
        Math.cos(x * h2F + h2P) * h2A +
        Math.sin(x * h3F + h3P) * h3A
      );
    };

    const cannonX = 90;
    const cannonBaseY = rawTerrain(cannonX);

    const flagX = 740 + prng() * 170;
    const flagBaseY = rawTerrain(flagX);

    let pond: PondObstacle | null = null;
    if (prng() > 0.3) {
      const pondX = 380 + prng() * 180;
      const pondWidth = 90 + prng() * 60;
      const pondGroundY = rawTerrain(pondX);
      const waterLevel = pondGroundY + 12 + prng() * 10;
      pond = {
        id: 'water_pond',
        x: pondX,
        left: pondX - pondWidth / 2,
        right: pondX + pondWidth / 2,
        waterLevel,
        width: pondWidth,
      };
    }

    const obstacleCount = 2 + (prng() > 0.5 ? 1 : 0);
    const obstacles: TerrainObstacle[] = [];
    const slots = [260 + prng() * 80, 460 + prng() * 80, 640 + prng() * 60];

    for (let i = 0; i < obstacleCount; i++) {
      const obsX = slots[i] || 300 + i * 180;
      if (pond && obsX >= pond.left + 20 && obsX <= pond.right - 20) {
        continue;
      }

      const isTree = prng() > 0.45;
      const obsGround = rawTerrain(obsX);

      if (isTree) {
        const treeHeight = 75 + prng() * 45;
        const treeWidth = 40 + prng() * 20;
        obstacles.push({
          id: `tree_${i}`,
          type: 'tree',
          subType: prng() > 0.5 ? 'pine' : 'oak',
          x: obsX,
          y: obsGround,
          width: treeWidth,
          height: treeHeight,
          left: obsX - treeWidth / 2,
          right: obsX + treeWidth / 2,
          bottom: obsGround,
          top: obsGround + treeHeight,
        });
      } else {
        const rockHeight = 45 + prng() * 40;
        const rockWidth = 45 + prng() * 35;
        const points: Point2D[] = [
          { x: -rockWidth * 0.45, y: 0 },
          { x: -rockWidth * 0.5, y: rockHeight * 0.4 },
          { x: -rockWidth * 0.2, y: rockHeight * 0.95 },
          { x: rockWidth * 0.25, y: rockHeight * 0.9 },
          { x: rockWidth * 0.48, y: rockHeight * 0.45 },
          { x: rockWidth * 0.42, y: 0 },
        ];
        obstacles.push({
          id: `rock_${i}`,
          type: 'rock',
          x: obsX,
          y: obsGround,
          width: rockWidth,
          height: rockHeight,
          points,
          left: obsX - rockWidth / 2,
          right: obsX + rockWidth / 2,
          bottom: obsGround,
          top: obsGround + rockHeight,
        });
      }
    }

    const windDir: -1 | 1 = prng() > 0.5 ? 1 : -1;
    const windSpeed = Number((5 + prng() * 28).toFixed(1));

    const getTerrainHeight = (x: number): number => {
      let h = rawTerrain(x);
      const dCannon = Math.abs(x - cannonX);
      if (dCannon < 45) {
        const blend = 0.5 + 0.5 * Math.cos((dCannon / 45) * Math.PI);
        h = h * (1 - blend) + cannonBaseY * blend;
      }
      const dFlag = Math.abs(x - flagX);
      if (dFlag < 40) {
        const blend = 0.5 + 0.5 * Math.cos((dFlag / 40) * Math.PI);
        h = h * (1 - blend) + flagBaseY * blend;
      }
      return h;
    };

    let isValid = true;
    for (const obs of obstacles) {
      if (obs.left < 200 || obs.right > flagX - 30) {
        isValid = false;
        break;
      }
      if (flagX >= obs.left - 10 && flagX <= obs.right + 10) {
        isValid = false;
        break;
      }
    }

    if (isValid) {
      env = {
        seed: currentSeed,
        cannonPos: { x: cannonX, y: cannonBaseY + 12 },
        flagPos: { x: flagX, y: flagBaseY },
        obstacles,
        pond,
        wind: { direction: windDir, strength: windSpeed },
        getTerrainHeight,
      };
      break;
    }
    attempts++;
  }

  return (
    env ?? {
      seed: 12345,
      cannonPos: { x: 90, y: 172 },
      flagPos: { x: 800, y: 160 },
      obstacles: [],
      pond: null,
      wind: { direction: 1, strength: 12.0 },
      getTerrainHeight: () => 160,
    }
  );
}

export function lineIntersect(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
): Point2D | null {
  const s1_x = p1x - p0x;
  const s1_y = p1y - p0y;
  const s2_x = p3x - p2x;
  const s2_y = p3y - p2y;

  const denom = -s2_x * s1_y + s1_x * s2_y;
  if (Math.abs(denom) < 1e-8) return null;

  const s = (-s1_y * (p0x - p2x) + s1_x * (p0y - p2y)) / denom;
  const t = (s2_x * (p0y - p2y) - s2_y * (p0x - p2x)) / denom;

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return {
      x: p0x + t * s1_x,
      y: p0y + t * s1_y,
    };
  }
  return null;
}

export interface SimulationResult {
  readonly path: readonly Point2D[];
  readonly impact: Point2D;
  readonly hitObstacle: boolean;
  readonly hitObstacleId: string | null;
  readonly hitType: 'ground' | 'rock' | 'tree' | 'water';
  readonly isDirectHit: boolean;
  readonly rawDistance: number;
  readonly gameDistance: number;
  readonly flightDuration: number;
}

export function simulateShot(
  env: Environment,
  angleDeg: number,
  powerFraction: number,
): SimulationResult {
  const angleRad = (angleDeg * Math.PI) / 180;
  const clampedPower = Math.max(0, Math.min(1, powerFraction));
  const speed = MIN_POWER_SPEED + clampedPower * (MAX_POWER_SPEED - MIN_POWER_SPEED);

  const barrelLength = 32;
  let posX = env.cannonPos.x + Math.cos(angleRad) * barrelLength;
  let posY = env.cannonPos.y + Math.sin(angleRad) * barrelLength;

  let velX = Math.cos(angleRad) * speed;
  let velY = Math.sin(angleRad) * speed;

  const windAccelX = env.wind.direction * env.wind.strength * WIND_FORCE_SCALE;
  const accelY = -GRAVITY;

  const dt = 0.016;
  const subSteps = 8;
  const subDt = dt / subSteps;

  const path: Point2D[] = [{ x: posX, y: posY }];
  let impact: Point2D | null = null;
  let hitObstacle = false;
  let hitObstacleId: string | null = null;
  let hitType: 'ground' | 'rock' | 'tree' | 'water' = 'ground';

  let totalTime = 0;
  const maxFlightTime = 12.0;

  while (totalTime < maxFlightTime && !impact) {
    for (let s = 0; s < subSteps; s++) {
      const prevX = posX;
      const prevY = posY;

      posX += velX * subDt;
      posY += velY * subDt;
      velX += windAccelX * subDt;
      velY += accelY * subDt;

      totalTime += subDt;

      // 1. Test Obstacles collision
      for (const obs of env.obstacles) {
        const topHit = lineIntersect(prevX, prevY, posX, posY, obs.left, obs.top, obs.right, obs.top);
        if (topHit) {
          impact = topHit;
          hitObstacle = true;
          hitObstacleId = obs.id;
          hitType = obs.type || 'rock';
          break;
        }
        const leftHit = lineIntersect(prevX, prevY, posX, posY, obs.left, obs.bottom, obs.left, obs.top);
        if (leftHit) {
          impact = leftHit;
          hitObstacle = true;
          hitObstacleId = obs.id;
          hitType = obs.type || 'rock';
          break;
        }
        const rightHit = lineIntersect(
          prevX,
          prevY,
          posX,
          posY,
          obs.right,
          obs.bottom,
          obs.right,
          obs.top,
        );
        if (rightHit) {
          impact = rightHit;
          hitObstacle = true;
          hitObstacleId = obs.id;
          hitType = obs.type || 'rock';
          break;
        }
      }
      if (impact) break;

      // 2. Test Water Pond Surface collision
      if (env.pond && posX >= env.pond.left && posX <= env.pond.right && posY <= env.pond.waterLevel) {
        impact = { x: posX, y: env.pond.waterLevel };
        hitType = 'water';
        break;
      }

      // 3. Test Terrain collision
      const terrainYAtPos = env.getTerrainHeight(Math.max(0, Math.min(WORLD_WIDTH, posX)));
      if (posY <= terrainYAtPos) {
        const prevTerrainY = env.getTerrainHeight(Math.max(0, Math.min(WORLD_WIDTH, prevX)));
        const groundHit = lineIntersect(prevX, prevY, posX, posY, prevX, prevTerrainY, posX, terrainYAtPos);
        impact = groundHit || { x: posX, y: terrainYAtPos };
        hitType = 'ground';
        break;
      }

      // 4. Boundary fallback
      if (posY <= 0 || posX < -100 || posX > WORLD_WIDTH + 200) {
        impact = { x: Math.max(0, Math.min(WORLD_WIDTH, posX)), y: 0 };
        hitType = 'ground';
        break;
      }
    }

    path.push({ x: posX, y: posY });
  }

  if (!impact) {
    impact = path[path.length - 1];
  }

  const rawDistance = Math.sqrt(
    Math.pow(impact.x - env.flagPos.x, 2) + Math.pow(impact.y - env.flagPos.y, 2),
  );

  let finalGameDistance = 0;
  let isDirectHit = false;

  if (rawDistance <= TARGET_HIT_ZONE_RADIUS) {
    finalGameDistance = 0.0;
    isDirectHit = true;
  } else {
    finalGameDistance = Number((rawDistance / 10).toFixed(2));
  }

  return {
    path,
    impact,
    hitObstacle,
    hitObstacleId,
    hitType,
    isDirectHit,
    rawDistance,
    gameDistance: finalGameDistance,
    flightDuration: totalTime,
  };
}

// ---- Match Engine & Scoring Model ----

export interface PlayerRecord {
  readonly id: string;
  readonly name: string;
  turnOrder: number;
  shot1Distance: number | null;
  shot2Distance: number | null;
  bestDistance: number | null;
}

export interface StandingsResult {
  readonly sortedLeaderboard: readonly PlayerRecord[];
  readonly worstDistance: number;
  readonly isTie: boolean;
  readonly tiedLosers: readonly PlayerRecord[];
  readonly singleLoser: PlayerRecord | null;
}

export function evaluateStandings(players: readonly PlayerRecord[]): StandingsResult {
  if (players.length === 0) {
    throw new Error('cannon-flag: ผู้เล่นว่างเปล่า');
  }

  const sorted = [...players].sort((a, b) => {
    const distA = a.bestDistance ?? 9999;
    const distB = b.bestDistance ?? 9999;
    return distA - distB;
  });

  const worstDistance = sorted[sorted.length - 1].bestDistance ?? 0;
  const tiedLosers = sorted.filter((p) => p.bestDistance === worstDistance);

  return {
    sortedLeaderboard: sorted,
    worstDistance,
    isTie: tiedLosers.length > 1,
    tiedLosers,
    singleLoser: tiedLosers.length === 1 ? tiedLosers[0] : null,
  };
}

export function startRound(
  playerNames: readonly string[],
  rand: () => number = Math.random,
): { players: PlayerRecord[]; env: Environment } {
  if (playerNames.length === 0) {
    throw new Error('cannon-flag: ผู้เล่นว่างเปล่า — ต้องมีอย่างน้อย 1 คนถึงจะเริ่มรอบได้');
  }

  const roster: PlayerRecord[] = playerNames.map((name, idx) => ({
    id: `p_${idx}`,
    name: name && name.trim().length > 0 ? name.trim() : `ผู้เล่น ${idx + 1}`,
    turnOrder: 0,
    shot1Distance: null,
    shot2Distance: null,
    bestDistance: null,
  }));

  // Fisher-Yates shuffle for turn order
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = roster[i];
    roster[i] = roster[j];
    roster[j] = temp;
  }
  roster.forEach((p, idx) => {
    p.turnOrder = idx + 1;
  });

  return {
    players: roster,
    env: generateEnvironment(),
  };
}

export function startSuddenDeath(
  tiedPlayers: readonly PlayerRecord[],
): { players: PlayerRecord[]; env: Environment } {
  const activePool: PlayerRecord[] = tiedPlayers.map((p, idx) => ({
    ...p,
    turnOrder: idx + 1,
    shot1Distance: null,
    shot2Distance: null,
    bestDistance: null,
  }));

  return {
    players: activePool,
    env: generateEnvironment(),
  };
}

// ---- Procedural Sound Synthesizer (Web Audio API) ----

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;

  init(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) this.ctx = new AudioContextClass();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {
      // AudioContext unavailable or restricted
    }
  }

  playClick(): void {
    if (!this.enabled || !this.ctx) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } catch {}
  }

  startChargeHum(): void {
    if (!this.enabled || !this.ctx) return;
    this.init();
    if (this.chargeOsc) return;
    try {
      const t = this.ctx.currentTime;
      this.chargeOsc = this.ctx.createOscillator();
      this.chargeGain = this.ctx.createGain();
      this.chargeOsc.type = 'sawtooth';
      this.chargeOsc.frequency.setValueAtTime(180, t);
      this.chargeGain.gain.setValueAtTime(0.05, t);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, t);

      this.chargeOsc.connect(filter);
      filter.connect(this.chargeGain);
      this.chargeGain.connect(this.ctx.destination);
      this.chargeOsc.start(t);
    } catch {}
  }

  updateChargePitch(progress: number): void {
    if (!this.enabled || !this.ctx || !this.chargeOsc || !this.chargeGain) return;
    try {
      const t = this.ctx.currentTime;
      const freq = 180 + progress * 500;
      this.chargeOsc.frequency.setValueAtTime(freq, t);
      this.chargeGain.gain.setValueAtTime(0.04 + progress * 0.08, t);
    } catch {}
  }

  stopChargeHum(): void {
    if (!this.chargeOsc) return;
    try {
      this.chargeOsc.stop();
      this.chargeOsc.disconnect();
    } catch {}
    this.chargeOsc = null;
    this.chargeGain = null;
  }

  playCannonFire(): void {
    if (!this.enabled || !this.ctx) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.45);
      oscGain.gain.setValueAtTime(0.8, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);

      const bufSize = Math.floor(this.ctx.sampleRate * 0.35);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, t);
      filter.frequency.exponentialRampToValueAtTime(100, t + 0.35);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.7, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(t);
      noise.stop(t + 0.36);
    } catch {}
  }

  playImpact(type: 'ground' | 'rock' | 'tree' | 'water' = 'ground'): void {
    if (!this.enabled || !this.ctx) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      if (type === 'water') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.25);
        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      } else if (type === 'tree') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (type === 'rock') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(820, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.25);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      } else {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(25, t + 0.35);
        gain.gain.setValueAtTime(0.65, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.38);
      }
    } catch {}
  }

  playTargetDirectHit(): void {
    if (!this.enabled || !this.ctx) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = t + idx * 0.06;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.28, st);
        gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(st);
        osc.stop(st + 0.45);
      });
    } catch {}
  }

  playTick(isUrgent: boolean = false): void {
    if (!this.enabled || !this.ctx) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isUrgent ? 880 : 540, t);
      osc.frequency.exponentialRampToValueAtTime(isUrgent ? 400 : 200, t + 0.03);
      gain.gain.setValueAtTime(isUrgent ? 0.25 : 0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    } catch {}
  }

  playFanfare(isWin: boolean = true): void {
    if (!this.enabled || !this.ctx) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const notes = isWin ? [440, 554.37, 659.25, 880] : [440, 415.3, 392.0, 349.23];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = t + idx * 0.12;
        osc.type = isWin ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.25, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(st);
        osc.stop(st + 0.55);
      });
    } catch {}
  }

  dispose(): void {
    this.stopChargeHum();
    if (this.ctx) {
      try {
        this.ctx.close().catch(() => {});
      } catch {}
      this.ctx = null;
    }
  }
}

// ---- Canvas Renderer ----

interface Particle {
  type: 'smoke' | 'fire' | 'sparkle' | 'water' | 'wood';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  decay: number;
  color: string;
}

export class CanvasRenderer {
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;
  public width: number = 800;
  public height: number = 480;
  public dpr: number = 1;
  public trauma: number = 0;
  public particles: Particle[] = [];
  public waterTime: number = 0;
  public flagWaveAngle: number = 0;
  public flyingBall: Point2D | null = null;
  public shot1Ghost: SimulationResult | null = null;
  public isReducedMotion: boolean = false;

  private clouds = [
    { x: 100, y: 480, speed: 0.12, r: 40 },
    { x: 450, y: 520, speed: 0.18, r: 55 },
    { x: 800, y: 460, speed: 0.15, r: 45 },
  ];

  constructor(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') ?? null;
    if (canvas && typeof window !== 'undefined') {
      this.resize();
    }
  }

  resize(): void {
    if (!this.canvas || !this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.canvas.width = Math.max(300, rect.width) * dpr;
    this.canvas.height = Math.max(200, rect.height) * dpr;
    this.width = Math.max(300, rect.width);
    this.height = Math.max(200, rect.height);
    this.dpr = dpr;
  }

  addTrauma(amount: number = 0.6): void {
    if (this.isReducedMotion) return;
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  worldToScreen(wx: number, wy: number): { sx: number; sy: number; scale: number } {
    const scaleX = this.width / WORLD_WIDTH;
    const scaleY = this.height / WORLD_HEIGHT;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (this.width - WORLD_WIDTH * scale) / 2;
    const offsetY = (this.height - WORLD_HEIGHT * scale) / 2;

    return {
      sx: offsetX + wx * scale,
      sy: this.height - (offsetY + wy * scale),
      scale,
    };
  }

  emitParticles(
    type: 'smoke' | 'fire' | 'sparkle' | 'water' | 'wood',
    wx: number,
    wy: number,
    count: number = 20,
  ): void {
    if (this.isReducedMotion) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      let spd = 20 + Math.random() * 120;
      let pColor = '#64748b';
      let vyBoost = 10;
      let pSize = 4 + Math.random() * 8;

      if (type === 'fire') {
        pColor = '#f97316';
      } else if (type === 'sparkle') {
        pColor = '#fbbf24';
      } else if (type === 'water') {
        pColor = Math.random() > 0.5 ? '#38bdf8' : '#e0f2fe';
        vyBoost = 60 + Math.random() * 40;
        spd = 15 + Math.random() * 60;
        pSize = 3 + Math.random() * 5;
      } else if (type === 'wood') {
        pColor = '#a16207';
      }

      this.particles.push({
        type,
        x: wx,
        y: wy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd + vyBoost,
        size: pSize,
        life: 1.0,
        decay: (type === 'smoke' ? 0.8 : 1.6) + Math.random() * 0.8,
        color: pColor,
      });
    }
  }

  update(dt: number, env: Environment | null): void {
    if (!this.isReducedMotion) {
      this.flagWaveAngle += dt * 5;
      this.waterTime += dt * 3;
    }

    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 2.5);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type !== 'smoke') p.vy -= GRAVITY * 0.6 * dt;
    }

    const windSpeed = env ? env.wind.direction * env.wind.strength * 0.4 : 2;
    this.clouds.forEach((c) => {
      c.x += windSpeed * dt * 10;
      if (c.x > WORLD_WIDTH + 100) c.x = -100;
      if (c.x < -100) c.x = WORLD_WIDTH + 100;
    });
  }

  render(
    env: Environment | null,
    currentAngle: number,
    isCharging: boolean,
  ): void {
    if (!env || !this.ctx) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    let shakeX = 0,
      shakeY = 0;
    if (this.trauma > 0 && !this.isReducedMotion) {
      const mag = Math.pow(this.trauma, 2) * 16;
      shakeX = (Math.random() - 0.5) * mag;
      shakeY = (Math.random() - 0.5) * mag;
    }
    ctx.translate(shakeX, shakeY);

    // 1. Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGrad.addColorStop(0, '#090d1a');
    skyGrad.addColorStop(0.6, '#142038');
    skyGrad.addColorStop(1, '#23385d');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Distant Mountains Silhouette
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.beginPath();
    const m1 = this.worldToScreen(0, 220);
    ctx.moveTo(0, this.height);
    ctx.lineTo(m1.sx, m1.sy);
    for (let x = 0; x <= WORLD_WIDTH; x += 100) {
      const my = 200 + Math.sin(x * 0.005 + 1) * 60 + Math.cos(x * 0.01) * 30;
      const sp = this.worldToScreen(x, my);
      ctx.lineTo(sp.sx, sp.sy);
    }
    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();

    // 3. Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    this.clouds.forEach((c) => {
      const sp = this.worldToScreen(c.x, c.y);
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, c.r * sp.scale, 0, Math.PI * 2);
      ctx.arc(sp.sx + 25 * sp.scale, sp.sy - 10 * sp.scale, c.r * 0.8 * sp.scale, 0, Math.PI * 2);
      ctx.arc(sp.sx - 25 * sp.scale, sp.sy - 5 * sp.scale, c.r * 0.7 * sp.scale, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Procedural Terrain
    const terrainGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    terrainGrad.addColorStop(0, '#1e293b');
    terrainGrad.addColorStop(0.4, '#0f172a');
    terrainGrad.addColorStop(1, '#020617');

    ctx.fillStyle = terrainGrad;
    ctx.beginPath();
    const startP = this.worldToScreen(0, env.getTerrainHeight(0));
    ctx.moveTo(0, this.height);
    ctx.lineTo(startP.sx, startP.sy);

    for (let wx = 0; wx <= WORLD_WIDTH; wx += 8) {
      const wy = env.getTerrainHeight(wx);
      const sp = this.worldToScreen(wx, wy);
      ctx.lineTo(sp.sx, sp.sy);
    }
    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();

    // Terrain Top Edge Glow
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startP.sx, startP.sy);
    for (let wx = 0; wx <= WORLD_WIDTH; wx += 8) {
      const wy = env.getTerrainHeight(wx);
      const sp = this.worldToScreen(wx, wy);
      ctx.lineTo(sp.sx, sp.sy);
    }
    ctx.stroke();

    // 5. Water Pond
    if (env.pond) {
      const pLeft = this.worldToScreen(env.pond.left, env.pond.waterLevel);
      const pRight = this.worldToScreen(env.pond.right, env.pond.waterLevel);
      const pBottom = this.worldToScreen(env.pond.x, env.getTerrainHeight(env.pond.x));

      const waterGrad = ctx.createLinearGradient(0, pLeft.sy, 0, pBottom.sy);
      waterGrad.addColorStop(0, 'rgba(14, 165, 233, 0.65)');
      waterGrad.addColorStop(1, 'rgba(3, 105, 161, 0.9)');

      ctx.fillStyle = waterGrad;
      ctx.beginPath();
      ctx.moveTo(pLeft.sx, pLeft.sy);
      for (let wx = env.pond.left; wx <= env.pond.right; wx += 6) {
        const wy = env.getTerrainHeight(wx);
        const sp = this.worldToScreen(wx, wy);
        ctx.lineTo(sp.sx, sp.sy);
      }
      ctx.lineTo(pRight.sx, pRight.sy);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pLeft.sx, pLeft.sy);
      for (let wx = env.pond.left; wx <= env.pond.right; wx += 4) {
        const waveY = env.pond.waterLevel + Math.sin(wx * 0.08 + this.waterTime) * 2;
        const sp = this.worldToScreen(wx, waveY);
        ctx.lineTo(sp.sx, sp.sy);
      }
      ctx.stroke();
    }

    // 6. Trees & Rocks
    env.obstacles.forEach((obs) => {
      if (obs.type === 'tree') {
        const treeBase = this.worldToScreen(obs.x, obs.y);
        const trunkW = 12 * treeBase.scale;
        const trunkH = obs.height * 0.35 * treeBase.scale;

        ctx.fillStyle = '#78350f';
        ctx.fillRect(treeBase.sx - trunkW / 2, treeBase.sy - trunkH, trunkW, trunkH);

        const sway = Math.sin(this.flagWaveAngle + obs.x) * 3 * treeBase.scale;

        if (obs.subType === 'pine') {
          const tiers = 3;
          for (let t = 0; t < tiers; t++) {
            const tierY = treeBase.sy - trunkH - t * 18 * treeBase.scale;
            const tierW = obs.width * (1 - t * 0.22) * treeBase.scale;
            const tierH = 28 * treeBase.scale;

            ctx.fillStyle = t === 2 ? '#22c55e' : t === 1 ? '#16a34a' : '#15803d';
            ctx.beginPath();
            ctx.moveTo(treeBase.sx - tierW / 2, tierY);
            ctx.lineTo(treeBase.sx + tierW / 2, tierY);
            ctx.lineTo(treeBase.sx + sway * (t + 1) * 0.3, tierY - tierH);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          const canopyCenterY = treeBase.sy - obs.height * 0.65 * treeBase.scale;
          const r = obs.width * 0.5 * treeBase.scale;

          ctx.fillStyle = '#15803d';
          ctx.beginPath();
          ctx.arc(
            treeBase.sx - 8 * treeBase.scale + sway,
            canopyCenterY + 4 * treeBase.scale,
            r * 0.8,
            0,
            Math.PI * 2,
          );
          ctx.arc(
            treeBase.sx + 8 * treeBase.scale + sway,
            canopyCenterY + 4 * treeBase.scale,
            r * 0.8,
            0,
            Math.PI * 2,
          );
          ctx.arc(treeBase.sx + sway, canopyCenterY - 6 * treeBase.scale, r * 0.9, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(treeBase.sx + sway, canopyCenterY - 2 * treeBase.scale, r * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (obs.type === 'rock') {
        const rockBase = this.worldToScreen(obs.x, obs.y);

        ctx.save();
        ctx.translate(rockBase.sx, rockBase.sy);

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        if (obs.points) {
          obs.points.forEach((pt, idx) => {
            const px = pt.x * rockBase.scale;
            const py = -pt.y * rockBase.scale;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
        }
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    });

    // 7. Target Flag
    const flagBase = this.worldToScreen(env.flagPos.x, env.flagPos.y);
    const flagTop = this.worldToScreen(env.flagPos.x, env.flagPos.y + 48);

    const hitRadiusScreen = TARGET_HIT_ZONE_RADIUS * flagBase.scale;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
    ctx.beginPath();
    ctx.arc(flagBase.sx, flagBase.sy, hitRadiusScreen, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(flagBase.sx, flagBase.sy);
    ctx.lineTo(flagTop.sx, flagTop.sy);
    ctx.stroke();

    const wave = Math.sin(this.flagWaveAngle) * 6;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(flagTop.sx, flagTop.sy);
    ctx.quadraticCurveTo(
      flagTop.sx + 15 * flagBase.scale,
      flagTop.sy + wave,
      flagTop.sx + 30 * flagBase.scale,
      flagTop.sy + 8,
    );
    ctx.lineTo(flagTop.sx + 30 * flagBase.scale, flagTop.sy + 22);
    ctx.quadraticCurveTo(
      flagTop.sx + 15 * flagBase.scale,
      flagTop.sy + 14 + wave,
      flagTop.sx,
      flagTop.sy + 18,
    );
    ctx.closePath();
    ctx.fill();

    // 8. Ghost Shot 1 Trajectory
    if (this.shot1Ghost) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      this.shot1Ghost.path.forEach((pt, idx) => {
        const sp = this.worldToScreen(pt.x, pt.y);
        if (idx === 0) ctx.moveTo(sp.sx, sp.sy);
        else ctx.lineTo(sp.sx, sp.sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      const gImp = this.worldToScreen(this.shot1Ghost.impact.x, this.shot1Ghost.impact.y);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(gImp.sx, gImp.sy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 9. Cannon
    const cannonBase = this.worldToScreen(env.cannonPos.x, env.cannonPos.y);
    const rad = (currentAngle * Math.PI) / 180;
    const barrelLenScreen = 32 * cannonBase.scale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(
      cannonBase.sx + Math.cos(rad) * barrelLenScreen,
      cannonBase.sy - Math.sin(rad) * barrelLenScreen,
    );
    ctx.lineTo(
      cannonBase.sx + Math.cos(rad) * barrelLenScreen * 2.2,
      cannonBase.sy - Math.sin(rad) * barrelLenScreen * 2.2,
    );
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(cannonBase.sx, cannonBase.sy);
    ctx.rotate(-rad);

    ctx.fillStyle = '#475569';
    ctx.fillRect(0, -6 * cannonBase.scale, barrelLenScreen, 12 * cannonBase.scale);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, -6 * cannonBase.scale, barrelLenScreen, 12 * cannonBase.scale);

    if (isCharging) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(-4, -8, (3 + Math.random() * 4) * cannonBase.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(cannonBase.sx, cannonBase.sy + 4, 12 * cannonBase.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 10. Flying Ball
    if (this.flyingBall) {
      const ballPos = this.worldToScreen(this.flyingBall.x, this.flyingBall.y);
      ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
      ctx.beginPath();
      ctx.arc(ballPos.sx, ballPos.sy, 5 * ballPos.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // 11. Particles
    this.particles.forEach((p) => {
      const sp = this.worldToScreen(p.x, p.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, p.size * sp.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();
  }
}

// ---- State Machine & Lifecycle ----

type Phase = 'handoff' | 'aiming' | 'results';

let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
let cleanup: Array<() => void> = [];
let phase: Phase = 'handoff';

let sound: SoundSynthesizer = new SoundSynthesizer();
let renderer: CanvasRenderer | null = null;
let reducedMotionMql: MediaQueryList | null = null;

let players: PlayerRecord[] = [];
let activePlayerPool: PlayerRecord[] = [];
let currentTurnIndex = 0;
let currentShotNumber = 1;
let currentEnvironment: Environment | null = null;
let isSuddenDeath = false;
let suddenDeathRound = 0;

let currentAngle = 45.0;
let powerCharge = 0.0;
let isChargingPower = false;
let chargeDirection = 1;
let isAimingLocked = false;
let aimTimerRemaining = AIM_TIME_LIMIT_SEC;
let aimTimerInterval: ReturnType<typeof setInterval> | null = null;
let lastAnimTime = 0;
let rafHandle: number | null = null;

function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

function watchReducedMotion(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  reducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => {
    if (renderer) renderer.isReducedMotion = !!reducedMotionMql?.matches;
  };
  update();
  if (reducedMotionMql.addEventListener) {
    reducedMotionMql.addEventListener('change', update);
    cleanup.push(() => reducedMotionMql?.removeEventListener('change', update));
  }
}

function stopAnimation(): void {
  if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

function startAnimationLoop(): void {
  stopAnimation();
  lastAnimTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  function loop(now: number): void {
    const dt = Math.min(0.1, (now - lastAnimTime) / 1000);
    lastAnimTime = now;

    if (isChargingPower && !isAimingLocked) {
      powerCharge += chargeDirection * dt * 0.9;
      if (powerCharge >= 1.0) {
        powerCharge = 1.0;
        chargeDirection = -1;
      } else if (powerCharge <= 0.0) {
        powerCharge = 0.0;
        chargeDirection = 1;
      }
      updatePowerUI();
      sound.updateChargePitch(powerCharge);
    }

    if (renderer) {
      renderer.update(dt, currentEnvironment);
      renderer.render(currentEnvironment, currentAngle, isChargingPower);
    }

    if (phase === 'aiming' && typeof requestAnimationFrame !== 'undefined') {
      rafHandle = requestAnimationFrame(loop);
    }
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    rafHandle = requestAnimationFrame(loop);
  }
}

function updatePowerUI(): void {
  const fill = document.getElementById('cf-power-fill');
  const text = document.getElementById('cf-power-text');
  const pct = Math.round(powerCharge * 100);
  if (fill) fill.style.width = `${pct}%`;
  if (text) text.textContent = `พลัง: ${pct}%`;
}

function updateTimerUI(): void {
  const num = document.getElementById('cf-timer-num');
  const bar = document.getElementById('cf-timer-bar');
  if (num) {
    num.textContent = `${aimTimerRemaining.toFixed(1)}s`;
    num.classList.remove('warning', 'danger');
    if (aimTimerRemaining <= 5.0) num.classList.add('danger');
    else if (aimTimerRemaining <= 12.0) num.classList.add('warning');
  }
  if (bar) {
    bar.style.width = `${(aimTimerRemaining / AIM_TIME_LIMIT_SEC) * 100}%`;
    if (aimTimerRemaining <= 5.0) bar.style.backgroundColor = '#b91c1c';
    else if (aimTimerRemaining <= 12.0) bar.style.backgroundColor = '#b45309';
    else bar.style.backgroundColor = '#15803d';
  }
}

function setAngle(deg: number): void {
  currentAngle = Math.max(5, Math.min(85, deg));
  const slider = document.getElementById('cf-slider-angle') as HTMLInputElement | null;
  const lcd = document.getElementById('cf-display-angle');
  if (slider) slider.value = String(currentAngle);
  if (lcd) lcd.textContent = `${currentAngle.toFixed(1)}°`;
}

// ---- Screen Rendering ----

function renderHandoff(): void {
  const stage = stageEl;
  if (!stage) return;
  phase = 'handoff';
  stopAnimation();
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const currentPlayer = activePlayerPool[currentTurnIndex];
  if (!currentPlayer) return;

  const card = document.createElement('div');
  card.className = 'cf-card';

  const icon = el('div', '📱 ➔ 🤝');
  icon.className = 'cf-pass-icon';
  card.appendChild(icon);

  const sub = el('div', 'ส่งเครื่องให้อยู่ในมือของ');
  sub.className = 'cf-card-subtitle';
  card.appendChild(sub);

  const nameEl = el('div', currentPlayer.name);
  nameEl.className = 'cf-pass-name';
  card.appendChild(nameEl);

  const turnText = isSuddenDeath
    ? `รอบตัดสิน SD-${suddenDeathRound}: ลำดับที่ ${currentTurnIndex + 1} / ${activePlayerPool.length}`
    : `ลำดับที่ ${currentTurnIndex + 1} / ${activePlayerPool.length}`;
  const badge = el('div', turnText);
  badge.className = 'cf-turn-badge';
  card.appendChild(badge);

  const inst = document.createElement('p');
  inst.className = 'cf-instructions';
  inst.innerHTML =
    'คุณจะได้ยิงปืนใหญ่ <strong>2 นัดติดต่อกัน</strong><br>ปรับมุม ชาร์จพลัง และกะแรงลมเพื่อยิงให้ใกล้ฐานธงที่สุด';
  card.appendChild(inst);

  const readyBtn = el('button', '🎯 พร้อมแล้ว! เริ่มนัดที่ 1');
  readyBtn.id = 'cf-ready-btn';
  readyBtn.className = 'game-btn game-btn-primary';
  readyBtn.type = 'button';
  on(readyBtn, 'click', () => {
    sound.playClick();
    startAiming();
  });
  card.appendChild(readyBtn);

  stage.appendChild(card);
  cleanup.push(armAllButtons(stage));
}

function startAiming(): void {
  const stage = stageEl;
  if (!stage) return;
  phase = 'aiming';
  stage.replaceChildren();
  stage.className = 'stage-screen';

  const currentPlayer = activePlayerPool[currentTurnIndex];
  if (!currentPlayer || !currentEnvironment) return;

  if (currentShotNumber === 1 && renderer) {
    renderer.shot1Ghost = null;
  }

  const viewport = document.createElement('div');
  viewport.className = 'cf-gameplay-viewport';

  // Canvas container
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'cf-canvas-container';

  const canvas = document.createElement('canvas');
  canvas.id = 'cf-game-canvas';
  canvas.className = 'cf-canvas';
  canvasContainer.appendChild(canvas);

  renderer = new CanvasRenderer(canvas);
  if (reducedMotionMql?.matches) renderer.isReducedMotion = true;

  // Floating HUD
  const hudTop = document.createElement('div');
  hudTop.className = 'cf-hud-top';

  // Player chip
  const playerChip = document.createElement('div');
  playerChip.className = 'cf-hud-chip';
  const pLabel = el('span', 'ผู้เล่นปัจจุบัน');
  pLabel.className = 'cf-hud-label';
  playerChip.appendChild(pLabel);

  const pName = el('div', currentPlayer.name);
  pName.className = 'cf-hud-value';
  playerChip.appendChild(pName);

  const shotBadge = el('span', `นัดที่ ${currentShotNumber} / 2`);
  shotBadge.className = 'cf-hud-label';
  playerChip.appendChild(shotBadge);
  hudTop.appendChild(playerChip);

  // Timer chip
  const timerChip = document.createElement('div');
  timerChip.className = 'cf-hud-chip';
  const tLabel = el('span', 'เวลาเล็ง');
  tLabel.className = 'cf-hud-label';
  timerChip.appendChild(tLabel);

  const timerNum = el('span', '30.0s');
  timerNum.id = 'cf-timer-num';
  timerNum.className = 'cf-timer-badge';
  timerChip.appendChild(timerNum);

  const barBg = document.createElement('div');
  barBg.className = 'cf-timer-bar-bg';
  const barFill = document.createElement('div');
  barFill.id = 'cf-timer-bar';
  barFill.className = 'cf-timer-bar-fill';
  barBg.appendChild(barFill);
  timerChip.appendChild(barBg);
  hudTop.appendChild(timerChip);

  // Wind chip
  const windChip = document.createElement('div');
  windChip.className = 'cf-hud-chip';
  const wLabel = el('span', 'ทิศทาง & แรงลม');
  wLabel.className = 'cf-hud-label';
  windChip.appendChild(wLabel);

  const windVal = document.createElement('div');
  windVal.className = 'cf-wind-val';
  const arrow = currentEnvironment.wind.direction === 1 ? '➔' : '⬅';
  windVal.textContent = `${arrow} ${currentEnvironment.wind.strength.toFixed(1)} ม./วิ`;
  windChip.appendChild(windVal);
  hudTop.appendChild(windChip);

  // Sound toggle
  const soundBtn = el('button', sound.enabled ? '🔊' : '🔇');
  soundBtn.id = 'cf-sound-toggle';
  soundBtn.className = 'cf-hud-sound-btn';
  soundBtn.type = 'button';
  soundBtn.title = 'เปิด/ปิดเสียง';
  on(soundBtn, 'click', () => {
    sound.enabled = !sound.enabled;
    soundBtn.textContent = sound.enabled ? '🔊' : '🔇';
  });
  hudTop.appendChild(soundBtn);

  canvasContainer.appendChild(hudTop);
  viewport.appendChild(canvasContainer);

  // Dashboard Controls
  const dashboard = document.createElement('div');
  dashboard.className = 'cf-controls-dashboard';

  // Angle adjustment
  const angleGroup = document.createElement('div');
  angleGroup.className = 'cf-angle-group';

  const decBtn = el('button', '-');
  decBtn.id = 'cf-angle-dec';
  decBtn.className = 'cf-step-btn';
  decBtn.type = 'button';
  on(decBtn, 'click', () => {
    setAngle(currentAngle - 1);
    sound.playClick();
  });
  angleGroup.appendChild(decBtn);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'cf-angle-slider-wrap';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'cf-slider-angle';
  slider.className = 'cf-angle-slider';
  slider.min = '5';
  slider.max = '85';
  slider.step = '0.5';
  slider.value = String(currentAngle);
  on(slider, 'input', (e) => {
    setAngle(parseFloat((e.target as HTMLInputElement).value));
  });
  sliderWrap.appendChild(slider);

  const angleLcd = el('div', `มุม: ${currentAngle.toFixed(1)}°`);
  angleLcd.id = 'cf-display-angle';
  angleLcd.className = 'cf-angle-lcd';
  sliderWrap.appendChild(angleLcd);
  angleGroup.appendChild(sliderWrap);

  const incBtn = el('button', '+');
  incBtn.id = 'cf-angle-inc';
  incBtn.className = 'cf-step-btn';
  incBtn.type = 'button';
  on(incBtn, 'click', () => {
    setAngle(currentAngle + 1);
    sound.playClick();
  });
  angleGroup.appendChild(incBtn);
  dashboard.appendChild(angleGroup);

  // Power gauge
  const powerWrap = document.createElement('div');
  powerWrap.className = 'cf-power-gauge-wrap';
  const powerFill = document.createElement('div');
  powerFill.id = 'cf-power-fill';
  powerFill.className = 'cf-power-gauge-fill';
  powerWrap.appendChild(powerFill);
  const powerText = el('div', 'พลัง: 0%');
  powerText.id = 'cf-power-text';
  powerText.className = 'cf-power-lcd-text';
  powerWrap.appendChild(powerText);
  dashboard.appendChild(powerWrap);

  // Fire button
  const fireBtn = el('button', '🔥 กดยิงค้างเพื่อชาร์จพลัง (HOLD FIRE)');
  fireBtn.id = 'cf-btn-fire';
  fireBtn.className = 'cf-btn-fire';
  fireBtn.type = 'button';

  const startCharge = (e: Event) => {
    if (e.type === 'touchstart') e.preventDefault();
    if (isAimingLocked) return;
    sound.init();
    isChargingPower = true;
    chargeDirection = 1;
    fireBtn.classList.add('charging');
    sound.startChargeHum();
  };

  const releaseCharge = (e: Event) => {
    if (e.type === 'touchend') e.preventDefault();
    if (!isChargingPower || isAimingLocked) return;
    isChargingPower = false;
    fireBtn.classList.remove('charging');
    sound.stopChargeHum();
    executeShot();
  };

  on(fireBtn, 'mousedown', startCharge);
  on(window, 'mouseup', releaseCharge);
  on(fireBtn, 'touchstart', startCharge);
  on(window, 'touchend', releaseCharge);
  on(window, 'touchcancel', releaseCharge);

  dashboard.appendChild(fireBtn);
  viewport.appendChild(dashboard);
  stage.appendChild(viewport);

  // Randomize initial angle for player fairness (20° - 75°)
  const randomDeg = Math.round((20 + Math.random() * 55) * 2) / 2;
  setAngle(randomDeg);

  isAimingLocked = false;
  powerCharge = 0.0;
  updatePowerUI();

  // Reset 30s countdown
  aimTimerRemaining = AIM_TIME_LIMIT_SEC;
  updateTimerUI();

  if (aimTimerInterval) clearInterval(aimTimerInterval);
  aimTimerInterval = setInterval(() => {
    if (isAimingLocked) return;
    aimTimerRemaining = Math.max(0, aimTimerRemaining - 0.1);
    updateTimerUI();

    if (aimTimerRemaining <= 5.0 && aimTimerRemaining > 0) {
      sound.playTick(true);
    }

    if (aimTimerRemaining <= 0.001) {
      if (aimTimerInterval) clearInterval(aimTimerInterval);
      if (powerCharge < 0.25) powerCharge = 0.5;
      executeShot();
    }
  }, 100);

  startAnimationLoop();
  cleanup.push(armAllButtons(stage));
}

function executeShot(): void {
  if (isAimingLocked || !currentEnvironment) return;
  isAimingLocked = true;
  if (aimTimerInterval) clearInterval(aimTimerInterval);

  const fireBtn = document.getElementById('cf-btn-fire') as HTMLButtonElement | null;
  if (fireBtn) fireBtn.disabled = true;

  const simResult = simulateShot(currentEnvironment, currentAngle, powerCharge);

  sound.playCannonFire();
  if (renderer) {
    renderer.addTrauma(0.7);
    renderer.emitParticles(
      'fire',
      currentEnvironment.cannonPos.x + 30,
      currentEnvironment.cannonPos.y + 10,
      25,
    );
    renderer.emitParticles(
      'smoke',
      currentEnvironment.cannonPos.x + 30,
      currentEnvironment.cannonPos.y + 10,
      15,
    );
  }

  // Animate ball along path
  let frameIndex = 0;
  const totalFrames = simResult.path.length;

  function animBall(): void {
    if (frameIndex < totalFrames) {
      const pt = simResult.path[frameIndex];
      if (renderer) {
        renderer.flyingBall = pt;
        if (frameIndex % 3 === 0) {
          renderer.emitParticles('smoke', pt.x, pt.y, 2);
        }
      }
      frameIndex += 2;
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(animBall);
      }
    } else {
      if (renderer) renderer.flyingBall = null;
      handleShotImpact(simResult);
    }
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(animBall);
  } else {
    handleShotImpact(simResult);
  }
}

function handleShotImpact(simResult: SimulationResult): void {
  if (renderer) {
    renderer.addTrauma(simResult.isDirectHit ? 1.0 : 0.5);
    if (simResult.hitType === 'water') {
      renderer.emitParticles('water', simResult.impact.x, simResult.impact.y, 40);
    } else if (simResult.hitType === 'tree') {
      renderer.emitParticles('wood', simResult.impact.x, simResult.impact.y, 25);
      renderer.emitParticles('smoke', simResult.impact.x, simResult.impact.y, 15);
    } else {
      renderer.emitParticles(
        simResult.isDirectHit ? 'sparkle' : 'fire',
        simResult.impact.x,
        simResult.impact.y,
        35,
      );
      renderer.emitParticles('smoke', simResult.impact.x, simResult.impact.y, 20);
    }
  }

  if (simResult.isDirectHit) sound.playTargetDirectHit();
  else sound.playImpact(simResult.hitType);

  const player = activePlayerPool[currentTurnIndex];
  if (player) {
    if (currentShotNumber === 1) {
      player.shot1Distance = simResult.gameDistance;
    } else {
      player.shot2Distance = simResult.gameDistance;
      const best = Math.min(player.shot1Distance ?? simResult.gameDistance, simResult.gameDistance);
      player.bestDistance = Number(best.toFixed(2));
    }
  }

  if (currentShotNumber === 1 && renderer) {
    renderer.shot1Ghost = simResult;
  }

  setTimeout(() => {
    showShotModal(simResult);
  }, 700);
}

function showShotModal(simResult: SimulationResult): void {
  const stage = stageEl;
  if (!stage) return;

  const overlay = document.createElement('div');
  overlay.id = 'cf-shot-overlay';
  overlay.className = 'cf-shot-overlay';

  const box = document.createElement('div');
  box.className = 'cf-shot-box';

  const title = el('div', `ผลการยิงนัดที่ ${currentShotNumber}`);
  title.className = 'cf-shot-title';
  box.appendChild(title);

  let impactNote = '';
  let distText = `${simResult.gameDistance.toFixed(2)} ม.`;
  if (simResult.isDirectHit) {
    distText = '00.00 ม. (เข้าเป้า!)';
    impactNote = '🎯 ยิงเข้าเป้าตรงกลางฐานธงอย่างสมบูรณ์แบบ!';
  } else if (simResult.hitType === 'water') {
    impactNote = '🌊 ตกกระทบผิวน้ำในแอ่งน้ำ!';
  } else if (simResult.hitType === 'tree') {
    impactNote = '🌲 ชนเข้ากับต้นไม้!';
  } else if (simResult.hitType === 'rock') {
    impactNote = '🪨 ชนเข้ากับก้อนหินผา!';
  } else {
    impactNote = `ห่างจากฐานธง ${simResult.gameDistance.toFixed(2)} เมตร`;
  }

  const distEl = el('div', distText);
  distEl.className = `cf-shot-dist ${simResult.isDirectHit ? 'direct-hit' : ''}`;
  box.appendChild(distEl);

  const detail = el('div', impactNote);
  detail.className = 'cf-shot-detail';
  box.appendChild(detail);

  const nextBtn = el(
    'button',
    currentShotNumber === 1 ? '🎯 ยิงนัดที่ 2 ทันที' : '📊 ดูผลคะแนน / คนถัดไป',
  );
  nextBtn.id = 'cf-next-shot-btn';
  nextBtn.className = 'game-btn game-btn-primary';
  nextBtn.type = 'button';

  on(nextBtn, 'click', () => {
    sound.playClick();
    overlay.remove();

    if (currentShotNumber === 1) {
      currentShotNumber = 2;
      startAiming();
    } else {
      currentShotNumber = 1;
      currentTurnIndex++;
      if (currentTurnIndex >= activePlayerPool.length) {
        showResultsScreen();
      } else {
        renderHandoff();
      }
    }
  });

  box.appendChild(nextBtn);
  overlay.appendChild(box);
  stage.appendChild(overlay);

  cleanup.push(armAllButtons(overlay));
}

function showResultsScreen(): void {
  const stage = stageEl;
  if (!stage) return;
  phase = 'results';
  stopAnimation();
  stage.replaceChildren();
  stage.className = 'stage-screen';

  gameCtx?.session.markPlayed('cannon-flag');

  const standings = evaluateStandings(activePlayerPool);

  const card = document.createElement('div');
  card.className = 'cf-card';

  const resTitle = el('h2', 'สรุปผลการแข่งขัน');
  resTitle.className = 'cf-card-title';
  card.appendChild(resTitle);

  const resSub = el('p', 'จัดอันดับจากผู้ที่ยิงใกล้ฐานธงที่สุด (ระยะทางน้อยสุด)');
  resSub.className = 'cf-card-subtitle';
  card.appendChild(resSub);

  const table = document.createElement('table');
  table.className = 'cf-leaderboard-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th style="text-align: center; width: 36px;">#</th>
      <th style="text-align: left;">ผู้เล่น</th>
      <th style="text-align: center;">นัดที่ 1</th>
      <th style="text-align: center;">นัดที่ 2</th>
      <th style="text-align: right;">ดีที่สุด</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  standings.sortedLeaderboard.forEach((p, idx) => {
    const isLoser = p.bestDistance === standings.worstDistance;
    const tr = document.createElement('tr');
    tr.className = `cf-leaderboard-row ${isLoser ? 'loser-row' : ''}`;
    const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
    tr.innerHTML = `
      <td style="text-align: center; font-weight: 700;">${rankBadge}</td>
      <td style="text-align: left;">
        <strong>${p.name}</strong>
        ${isLoser ? '<span class="cf-loser-badge">อันดับสุดท้าย</span>' : ''}
      </td>
      <td style="text-align: center;">${p.shot1Distance !== null ? p.shot1Distance.toFixed(2) : '-'}</td>
      <td style="text-align: center;">${p.shot2Distance !== null ? p.shot2Distance.toFixed(2) : '-'}</td>
      <td style="text-align: right; font-weight: 700;">${p.bestDistance !== null ? `${p.bestDistance.toFixed(2)} ม.` : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  card.appendChild(table);

  if (standings.isTie) {
    sound.playFanfare(false);
    const tiedNames = standings.tiedLosers.map((p) => p.name).join(', ');
    const banner = document.createElement('div');
    banner.className = 'cf-tie-banner';
    banner.innerHTML = `
      <div style="font-weight: 700; font-size: 16px;">🚨 เสมอกันที่คะแนน ${standings.worstDistance.toFixed(2)} ม.!</div>
      <div style="font-size: 14px;">ผู้เล่นที่ต้องดวลรอบตัดสิน: <strong>${tiedNames}</strong></div>
    `;
    const sdBtn = el('button', '⚡ เข้าสู่รอบตัดสิน Sudden Death');
    sdBtn.id = 'cf-btn-sudden-death';
    sdBtn.className = 'game-btn game-btn-primary';
    sdBtn.type = 'button';
    on(sdBtn, 'click', () => {
      sound.playClick();
      isSuddenDeath = true;
      suddenDeathRound++;
      const sd = startSuddenDeath(standings.tiedLosers);
      activePlayerPool = sd.players;
      currentEnvironment = sd.env;
      currentTurnIndex = 0;
      currentShotNumber = 1;
      renderHandoff();
    });
    banner.appendChild(sdBtn);
    card.appendChild(banner);
  } else if (standings.singleLoser) {
    sound.playFanfare(false);
    const loser = standings.singleLoser;
    const banner = document.createElement('div');
    banner.className = 'cf-loser-banner';

    const pIcon = el('div', '💥 ➔ 🏆 (ผู้แพ้)');
    pIcon.className = 'cf-pass-icon';
    banner.appendChild(pIcon);

    const loserSub = el('div', 'ผู้แพ้ประจำแมตช์นี้คือ');
    loserSub.className = 'cf-card-subtitle';
    banner.appendChild(loserSub);

    const loserNameEl = el('div', loser.name);
    loserNameEl.className = 'cf-loser-name';
    banner.appendChild(loserNameEl);

    const scoreSub = el(
      'div',
      `ระยะดีที่สุดห่างจากฐานธง ${loser.bestDistance?.toFixed(2) ?? '-'} เมตร`,
    );
    scoreSub.className = 'cf-card-subtitle';
    banner.appendChild(scoreSub);
    card.appendChild(banner);
  }

  // Replay match button
  const replayBtn = el('button', '🔄 เล่นซ้ำกลุ่มเดิม');
  replayBtn.id = 'cf-replay-btn';
  replayBtn.className = 'game-btn game-btn-primary';
  replayBtn.type = 'button';
  on(replayBtn, 'click', () => {
    sound.playClick();
    const names = players.map((p) => p.name);
    const r = startRound(names);
    players = r.players;
    activePlayerPool = [...players];
    currentEnvironment = r.env;
    isSuddenDeath = false;
    suddenDeathRound = 0;
    currentTurnIndex = 0;
    currentShotNumber = 1;
    renderHandoff();
  });
  card.appendChild(replayBtn);

  // Change players button
  const changeBtn = el('button', '🏠 ตั้งค่าผู้เล่นใหม่');
  changeBtn.id = 'cf-change-btn';
  changeBtn.className = 'game-btn game-btn-secondary';
  changeBtn.type = 'button';
  on(changeBtn, 'click', () => {
    teardown();
    document.dispatchEvent(new CustomEvent('watduang:change-players', { bubbles: true }));
  });
  card.appendChild(changeBtn);

  stage.appendChild(card);
  cleanup.push(armAllButtons(stage));
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  stage.className = 'stage-screen';

  const roster = ctx.session.players ?? [];
  const initialNames = roster.length > 0 ? roster : ['ผู้เล่น 1', 'ผู้เล่น 2'];

  const r = startRound(initialNames);
  players = r.players;
  activePlayerPool = [...players];
  currentEnvironment = r.env;
  isSuddenDeath = false;
  suddenDeathRound = 0;
  currentTurnIndex = 0;
  currentShotNumber = 1;

  watchReducedMotion();
  renderHandoff();
}

function teardown(): void {
  phase = 'handoff';
  stopAnimation();
  if (aimTimerInterval) {
    clearInterval(aimTimerInterval);
    aimTimerInterval = null;
  }
  sound.dispose();
  cleanup.forEach((fn) => fn());
  cleanup = [];
  reducedMotionMql = null;
  players = [];
  activePlayerPool = [];
  currentEnvironment = null;
  currentTurnIndex = 0;
  currentShotNumber = 1;
  isSuddenDeath = false;
  suddenDeathRound = 0;
  renderer = null;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'cannon-flag',
  names: { th: 'ยิงธง', en: 'Cannon Flag' },
  category: 'party',
  players: [2, 10],
  startsRound: true,
  keywords: [
    'ยิงธง',
    'เกมยิงปืนใหญ่',
    'เกมส่งมือถือ',
    'เกมปาร์ตี้',
    'เกมกลุ่มเล่นฟรี',
    'เกมเล่นบนเครื่องเดียว',
  ],
  tagline: 'ดวลปืนใหญ่ผลัดกันยิง ใครห่างธงสุดคนนั้นโดน',
  seo: {
    title: 'ยิงธง — เกมปืนใหญ่ประลองความแม่นยำ เล่นฟรีบนเครื่องเดียว',
    description:
      'ผลัดกันส่งมือถือยิงปืนใหญ่ 2 นัดติดต่อกัน ปรับมุม กะแรงลม ชาร์จพลังให้ลงใกล้ฐานธงที่สุด ใครทำผลงานแย่สุดในวงคนนั้นโดน เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'เลือกจำนวนคนเล่นในวง 2-10 คน',
      'ส่งมือถือวนทีละคน แต่ละคนจะได้ยิง 2 นัดติดต่อกัน',
      'ปรับมุม ชาร์จพลัง และกะแรงลมเพื่อยิงให้ใกล้ฐานธงที่สุด',
      'วัดผลจากนัดที่ใกล้ฐานธงที่สุด ใครห่างสุดคนนั้นโดน เสมอกันดวล Sudden Death',
    ],
  },
  og: 'cannon-flag.png',
  ads: true,

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
