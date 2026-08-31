// Ghost-tap gate (ADR-0014 / ADR-0016 / ADR-0017): every screen this route reveals re-arms its own
// buttons, because the second contact of a double-tap aimed at the screen that just went away must
// not activate the control that replaced it. Armed at the reveal seam only. The aiming controls are
// excepted by name at the call sites below -- they are the per-control ceiling _arm-gate.ts records,
// where the same player taps twice on purpose.
// The .ts extension is spelled out in full, the way src/play/zero-trigger/main.js does it.
import { armAllButtons } from '../../games/_arm-gate.ts';

    /**
     * CANNON FLAG (route id: cannon-flag) - ZERO EXTERNAL ASSET GAME ENGINE
     */

    // ADR-0046: prefers-reduced-motion is a CSS media feature and it does not reach the `.style`
    // writes and requestAnimationFrame loops in this file, so the query is read HERE, in the same
    // file as the motion it gates. style.css carrying an @media block does NOT cover any of it.
    // Read PER CALL rather than cached into a boolean: a cached flag is a value an edit can pin to
    // false while this file still reads as guarded, and reading live also means a player who flips
    // the OS setting mid-round gets the new cadence with no reload. Same shape as
    // src/play/how-close-is-near/main.js.
    // REDUCE, not remove: the canvas keeps rendering, the aim timer keeps counting and the power
    // gauge keeps filling -- on a coarse cadence instead of once per frame -- so the round is still
    // playable and still shows its state. Only the screen shake is dropped outright: it carries no
    // state at all, and it is the one effect that exists purely to move the picture.
    function prefersReducedMotion() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // Reduced-motion repaint cadence: a few coarse steps a second, the shape src/games/timebomb.ts
    // uses for its fuse. The simulation itself is never throttled -- it is dt-based, so a shot fired
    // under reduced motion lands exactly where the same shot lands without it.
    const REDUCED_PAINT_MS = 125;
    let nextCoarsePaintAt = 0;


    // ---------------------------------------------------------
    // 1. SOUND SYNTHESIZER (Web Audio API)
    // ---------------------------------------------------------
    class SoundSynthesizer {
      constructor() {
        this.ctx = null;
        this.enabled = true;
        this.chargeOsc = null;
        this.chargeGain = null;
      }

      init() {
        if (typeof window === 'undefined') return;
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) this.ctx = new AudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }

      playClick() {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.05);
      }

      startChargeHum() {
        if (!this.enabled || !this.ctx) return;
        this.init();
        if (this.chargeOsc) return;
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
      }

      updateChargePitch(progress) {
        if (!this.enabled || !this.ctx || !this.chargeOsc) return;
        const t = this.ctx.currentTime;
        const freq = 180 + progress * 500;
        this.chargeOsc.frequency.setValueAtTime(freq, t);
        this.chargeGain.gain.setValueAtTime(0.04 + progress * 0.08, t);
      }

      stopChargeHum() {
        if (!this.chargeOsc) return;
        try {
          this.chargeOsc.stop();
          this.chargeOsc.disconnect();
        } catch(e){}
        this.chargeOsc = null;
        this.chargeGain = null;
      }

      playCannonFire() {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        
        // 1. Deep Boom Oscillator
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.45);
        oscGain.gain.setValueAtTime(0.8, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(oscGain); oscGain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.5);

        // 2. Muzzle White Noise Blast
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
        noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + 0.36);
      }

      playWaterSplash() {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;

        // Water bloop sine
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.25);
        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.26);

        // Splashing foam noise
        const bufSize = Math.floor(this.ctx.sampleRate * 0.3);
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, t);
        filter.frequency.exponentialRampToValueAtTime(400, t + 0.28);
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.35, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        noise.connect(filter); filter.connect(nGain); nGain.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + 0.3);
      }

      playWoodHit() {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.2);
      }

      playImpact(type = 'ground') {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;

        if (type === 'water') {
          this.playWaterSplash();
        } else if (type === 'tree') {
          this.playWoodHit();
        } else if (type === 'rock') {
          // Clang / Stone hit sound
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(820, t);
          osc.frequency.exponentialRampToValueAtTime(140, t + 0.25);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.start(t); osc.stop(t + 0.26);
        } else {
          // Dirt Thud Explosion
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(25, t + 0.35);
          gain.gain.setValueAtTime(0.65, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.start(t); osc.stop(t + 0.38);
        }
      }

      playTargetDirectHit() {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.06;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.28, st);
          gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.4);
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.start(st); osc.stop(st + 0.45);
        });
      }

      playTick(isUrgent = false) {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isUrgent ? 880 : 540, t);
        osc.frequency.exponentialRampToValueAtTime(isUrgent ? 400 : 200, t + 0.03);
        gain.gain.setValueAtTime(isUrgent ? 0.25 : 0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.035);
      }

      playFanfare(isWin = true) {
        if (!this.enabled || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const notes = isWin ? [440, 554.37, 659.25, 880] : [440, 415.30, 392.00, 349.23];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.12;
          osc.type = isWin ? 'triangle' : 'sawtooth';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.25, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.start(st); osc.stop(st + 0.55);
        });
      }
    }

    const sound = new SoundSynthesizer();

    // ---------------------------------------------------------
    // 2. DETERMINISTIC PSEUDO-RANDOM NUMBER GENERATOR (Mulberry32)
    // ---------------------------------------------------------
    function createPRNG(seedNumber) {
      let a = (seedNumber >>> 0) || 12345;
      return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ---------------------------------------------------------
    // 3. ENVIRONMENT GENERATOR & VALIDATOR (Trees, Rocks, Ponds)
    // ---------------------------------------------------------
    const WORLD_WIDTH = 1000;
    const WORLD_HEIGHT = 600;
    const TARGET_HIT_ZONE_RADIUS = 18; // world units (within this = 00.00 score)

    function generateEnvironment(seedInput) {
      let seed = typeof seedInput === 'number' ? seedInput : (Math.floor(Math.random() * 90000) + 10000);
      let attempts = 0;
      let env = null;

      while (attempts < 50) {
        const prng = createPRNG(seed + attempts);
        
        // Terrain harmonics
        const baseHeight = 160 + prng() * 30;
        const h1A = 35 + prng() * 30, h1F = 0.003 + prng() * 0.002, h1P = prng() * Math.PI * 2;
        const h2A = 20 + prng() * 20, h2F = 0.007 + prng() * 0.003, h2P = prng() * Math.PI * 2;
        const h3A = 10 + prng() * 15, h3F = 0.015 + prng() * 0.005, h3P = prng() * Math.PI * 2;

        const rawTerrain = (x) => {
          return baseHeight + 
            Math.sin(x * h1F + h1P) * h1A + 
            Math.cos(x * h2F + h2P) * h2A + 
            Math.sin(x * h3F + h3P) * h3A;
        };

        // Cannon location (fixed left side)
        const cannonX = 90;
        const cannonBaseY = rawTerrain(cannonX);

        // Flag location (randomized right plateau area)
        const flagX = 740 + prng() * 170; // 740 to 910
        const flagBaseY = rawTerrain(flagX);

        // 1. Procedural Water Pond in a terrain dip
        let pond = null;
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
            width: pondWidth
          };
        }

        // 2. Procedural Obstacles (Random Trees & Rocks)
        const obstacleCount = 2 + (prng() > 0.5 ? 1 : 0);
        const obstacles = [];
        const slots = [
          260 + prng() * 80,
          460 + prng() * 80,
          640 + prng() * 60
        ];

        for (let i = 0; i < obstacleCount; i++) {
          const obsX = slots[i] || (300 + i * 180);
          
          // Skip obstacle if right inside the pond center
          if (pond && obsX >= pond.left + 20 && obsX <= pond.right - 20) {
            continue;
          }

          const isTree = prng() > 0.45;
          const obsGround = rawTerrain(obsX);

          if (isTree) {
            // Organic Tree Obstacle (Pine / Oak)
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
              top: obsGround + treeHeight
            });
          } else {
            // Craggy Boulder / Rock Obstacle
            const rockHeight = 45 + prng() * 40;
            const rockWidth = 45 + prng() * 35;
            // Generate polygonal rock contour points
            const points = [
              { x: -rockWidth * 0.45, y: 0 },
              { x: -rockWidth * 0.5, y: rockHeight * 0.4 },
              { x: -rockWidth * 0.2, y: rockHeight * 0.95 },
              { x: rockWidth * 0.25, y: rockHeight * 0.9 },
              { x: rockWidth * 0.48, y: rockHeight * 0.45 },
              { x: rockWidth * 0.42, y: 0 }
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
              top: obsGround + rockHeight
            });
          }
        }

        // Wind: direction -1 (against shot) or 1 (with shot), strength (5 to 35 m/s)
        const windDir = prng() > 0.5 ? 1 : -1;
        const windSpeed = Number((5 + prng() * 28).toFixed(1));

        // Smooth plateau blending around cannon and flag
        const getTerrainHeight = (x) => {
          let h = rawTerrain(x);
          // Cannon plateau
          const dCannon = Math.abs(x - cannonX);
          if (dCannon < 45) {
            const blend = 0.5 + 0.5 * Math.cos((dCannon / 45) * Math.PI);
            h = h * (1 - blend) + cannonBaseY * blend;
          }
          // Flag plateau
          const dFlag = Math.abs(x - flagX);
          if (dFlag < 40) {
            const blend = 0.5 + 0.5 * Math.cos((dFlag / 40) * Math.PI);
            h = h * (1 - blend) + flagBaseY * blend;
          }
          return h;
        };

        // Validity check: no obstacle right in front of cannon or overlapping flag
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
            seed: seed + attempts,
            cannonPos: { x: cannonX, y: cannonBaseY + 12 },
            flagPos: { x: flagX, y: flagBaseY },
            obstacles,
            pond,
            wind: { direction: windDir, strength: windSpeed },
            getTerrainHeight
          };
          break;
        }

        attempts++;
      }

      return env;
    }

    // ---------------------------------------------------------
    // 4. DETERMINISTIC CONTINUOUS 2D PHYSICS SIMULATOR
    // ---------------------------------------------------------
    const GRAVITY = 280; // world units / s^2 downwards
    const WIND_FORCE_SCALE = 2.4; // scales wind speed to horizontal accel
    const MIN_POWER_SPEED = 180;
    const MAX_POWER_SPEED = 560;

    /**
     * Line segment intersection test
     */
    function lineIntersect(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
      const s1_x = p1x - p0x;
      const s1_y = p1y - p0y;
      const s2_x = p3x - p2x;
      const s2_y = p3y - p2y;

      const s = (-s1_y * (p0x - p2x) + s1_x * (p0y - p2y)) / (-s2_x * s1_y + s1_x * s2_y);
      const t = ( s2_x * (p0y - p2y) - s2_y * (p0x - p2x)) / (-s2_x * s1_y + s1_x * s2_y);

      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return {
          x: p0x + (t * s1_x),
          y: p0y + (t * s1_y)
        };
      }
      return null;
    }

    /**
     * Simulates the full projectile trajectory until first impact.
     * Returns sampled trajectory points, impact coordinates, and impact metadata.
     */
    function simulateShot(env, angleDeg, powerFraction) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const speed = MIN_POWER_SPEED + powerFraction * (MAX_POWER_SPEED - MIN_POWER_SPEED);
      
      const barrelLength = 32;
      let posX = env.cannonPos.x + Math.cos(angleRad) * barrelLength;
      let posY = env.cannonPos.y + Math.sin(angleRad) * barrelLength;

      let velX = Math.cos(angleRad) * speed;
      let velY = Math.sin(angleRad) * speed;

      const windAccelX = env.wind.direction * env.wind.strength * WIND_FORCE_SCALE;
      const accelY = -GRAVITY;

      const dt = 0.016; // 60 FPS standard tick
      const subSteps = 8;
      const subDt = dt / subSteps;

      const path = [{ x: posX, y: posY }];
      let impact = null;
      let hitObstacle = false;
      let hitObstacleId = null;
      let hitType = 'ground'; // 'ground' | 'rock' | 'tree' | 'water'

      let totalTime = 0;
      const maxFlightTime = 12.0; // safety ceiling

      while (totalTime < maxFlightTime && !impact) {
        for (let s = 0; s < subSteps; s++) {
          const prevX = posX;
          const prevY = posY;

          // Integrate
          posX += velX * subDt;
          posY += velY * subDt;
          velX += windAccelX * subDt;
          velY += accelY * subDt;

          totalTime += subDt;

          // 1. Test Obstacles collision (Trees, Rocks)
          for (const obs of env.obstacles) {
            // Check top edge
            const topHit = lineIntersect(prevX, prevY, posX, posY, obs.left, obs.top, obs.right, obs.top);
            if (topHit) {
              impact = topHit;
              hitObstacle = true;
              hitObstacleId = obs.id;
              hitType = obs.type || 'rock';
              break;
            }
            // Check left edge
            const leftHit = lineIntersect(prevX, prevY, posX, posY, obs.left, obs.bottom, obs.left, obs.top);
            if (leftHit) {
              impact = leftHit;
              hitObstacle = true;
              hitObstacleId = obs.id;
              hitType = obs.type || 'rock';
              break;
            }
            // Check right edge
            const rightHit = lineIntersect(prevX, prevY, posX, posY, obs.right, obs.bottom, obs.right, obs.top);
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

          // 4. Boundary bounds (bottom / far bounds fallback)
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

      // Calculate 2D Euclidean Distance to flag base
      const rawDistance = Math.sqrt(
        Math.pow(impact.x - env.flagPos.x, 2) + 
        Math.pow(impact.y - env.flagPos.y, 2)
      );

      // Direct hit zone check
      let finalGameDistance = 0;
      let isDirectHit = false;

      if (rawDistance <= TARGET_HIT_ZONE_RADIUS) {
        finalGameDistance = 0.00;
        isDirectHit = true;
      } else {
        // Convert world units to display meters (scale: 10 world units = 1.00 m)
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
        flightDuration: totalTime
      };
    }

    // ---------------------------------------------------------
    // 5. TURN-BASED MATCH ENGINE & SCORING MODEL
    // ---------------------------------------------------------
    class MatchEngine {
      constructor() {
        this.playerCount = 4;
        this.players = [];
        this.currentTurnIndex = 0; // index in randomized order
        this.currentShotNumber = 1; // 1 or 2
        this.mainEnvironment = null;
        this.suddenDeathEnvironment = null;
        this.suddenDeathRound = 0;
        this.isSuddenDeath = false;
        this.activePlayerPool = [];
        this.aimTimerRemaining = 30.0;
        this.aimTimerActive = false;
      }

      setupMatch(playerNames) {
        this.isSuddenDeath = false;
        this.suddenDeathRound = 0;
        this.playerCount = playerNames.length;
        
        // Construct player records with deterministic Thai fallbacks
        const roster = playerNames.map((name, idx) => ({
          id: `p_${Date.now()}_${idx}`,
          name: (name && name.trim().length > 0) ? name.trim() : `ผู้เล่น ${idx + 1}`,
          originalIndex: idx,
          turnOrder: 0,
          shot1Distance: null,
          shot2Distance: null,
          bestDistance: null
        }));

        // Randomize turn order once at start of main match (Fisher-Yates)
        for (let i = roster.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [roster[i], roster[j]] = [roster[j], roster[i]];
        }
        roster.forEach((p, idx) => { p.turnOrder = idx + 1; });

        this.players = roster;
        this.activePlayerPool = [...roster];
        this.currentTurnIndex = 0;
        this.currentShotNumber = 1;

        // Generate static main match environment
        this.mainEnvironment = generateEnvironment();
        return this.mainEnvironment;
      }

      getCurrentPlayer() {
        return this.activePlayerPool[this.currentTurnIndex] || null;
      }

      getCurrentEnvironment() {
        return this.isSuddenDeath ? this.suddenDeathEnvironment : this.mainEnvironment;
      }

      recordShotResult(distance) {
        const player = this.getCurrentPlayer();
        if (!player) return;

        // Format to strict hundredth precision
        const formattedDist = Number(distance.toFixed(2));

        if (this.currentShotNumber === 1) {
          player.shot1Distance = formattedDist;
        } else {
          player.shot2Distance = formattedDist;
          player.bestDistance = Math.min(player.shot1Distance, player.shot2Distance);
          // Canonical rounded score
          player.bestDistance = Number(player.bestDistance.toFixed(2));
        }
      }

      advanceTurn() {
        if (this.currentShotNumber === 1) {
          // Advance to shot 2 for the same player
          this.currentShotNumber = 2;
          return { nextPlayer: false, matchComplete: false };
        } else {
          // Advance to next player
          this.currentShotNumber = 1;
          this.currentTurnIndex++;

          if (this.currentTurnIndex >= this.activePlayerPool.length) {
            // All active players finished their 2 shots
            return { nextPlayer: false, matchComplete: true };
          } else {
            return { nextPlayer: true, matchComplete: false };
          }
        }
      }

      calculateStandings() {
        // Sort ascending by bestDistance (lowest is best, highest is loser)
        const sorted = [...this.activePlayerPool].sort((a, b) => {
          return a.bestDistance - b.bestDistance;
        });

        // Find the worst distance (largest bestDistance)
        const worstDistance = sorted[sorted.length - 1].bestDistance;

        // Filter players tied for the worst distance at hundredth precision
        const tiedLosers = sorted.filter(p => p.bestDistance === worstDistance);

        return {
          sortedLeaderboard: sorted,
          worstDistance,
          isTie: tiedLosers.length > 1,
          tiedLosers,
          singleLoser: tiedLosers.length === 1 ? tiedLosers[0] : null
        };
      }

      startSuddenDeath(tiedPlayers) {
        this.isSuddenDeath = true;
        this.suddenDeathRound++;
        
        // Reset shots for tied players ONLY
        this.activePlayerPool = tiedPlayers.map((p, idx) => ({
          ...p,
          turnOrder: idx + 1,
          shot1Distance: null,
          shot2Distance: null,
          bestDistance: null
        }));

        this.currentTurnIndex = 0;
        this.currentShotNumber = 1;

        // Generate a fresh shared sudden death environment
        this.suddenDeathEnvironment = generateEnvironment();
        return this.suddenDeathEnvironment;
      }
    }

    const gameEngine = new MatchEngine();

    // ---------------------------------------------------------
    // 6. 2D CANVAS RENDERER & VISUAL JUICE (Trees, Rocks, Ponds)
    // ---------------------------------------------------------
    class CanvasRenderer {
      constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
        this.trauma = 0.0;
        this.particles = [];
        this.waterTime = 0;
        this.clouds = [
          { x: 100, y: 480, speed: 0.12, r: 40 },
          { x: 450, y: 520, speed: 0.18, r: 55 },
          { x: 800, y: 460, speed: 0.15, r: 45 }
        ];

        // Active animation states
        this.flyingBall = null;
        this.shot1Ghost = null; // Ghost impact and trajectory for shot 2 calibration
        this.lastImpact = null;
        this.flagWaveAngle = 0;

        if (this.canvas && typeof window !== 'undefined') {
          this.resize();
          window.addEventListener('resize', () => this.resize());
        }
      }

      resize() {
        if (!this.canvas || !this.canvas.parentElement) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.width = rect.width;
        this.height = rect.height;
        this.dpr = dpr;
      }

      addTrauma(amount = 0.6) {
        // ADR-0046: screen shake is the one effect here that carries no state -- the shot result is
        // in the numbers and the impact particles, not in the camera jolt -- so under the reduce
        // query it is dropped rather than slowed. Nothing else in this class is skipped.
        if (prefersReducedMotion()) return;
        this.trauma = Math.min(1.0, this.trauma + amount);
      }

      worldToScreen(wx, wy) {
        // Fit world (1000 x 600) into canvas viewport
        const scaleX = (this.width || 800) / WORLD_WIDTH;
        const scaleY = (this.height || 480) / WORLD_HEIGHT;
        const scale = Math.min(scaleX, scaleY);

        const offsetX = ((this.width || 800) - WORLD_WIDTH * scale) / 2;
        const offsetY = ((this.height || 480) - WORLD_HEIGHT * scale) / 2;

        return {
          sx: offsetX + wx * scale,
          sy: (this.height || 480) - (offsetY + wy * scale),
          scale
        };
      }

      emitParticles(type, wx, wy, count = 20) {
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
            color: pColor
          });
        }
      }

      update(dt) {
        // Flag wave & Water ripples animation
        this.flagWaveAngle += dt * 5;
        this.waterTime += dt * 3;

        // Trauma screen shake decay
        if (this.trauma > 0) {
          this.trauma = Math.max(0, this.trauma - dt * 2.5);
        }

        // Particle updates
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

        // Cloud breeze
        const env = gameEngine.getCurrentEnvironment();
        const windSpeed = env ? env.wind.direction * env.wind.strength * 0.4 : 2;
        this.clouds.forEach(c => {
          c.x += windSpeed * dt * 10;
          if (c.x > WORLD_WIDTH + 100) c.x = -100;
          if (c.x < -100) c.x = WORLD_WIDTH + 100;
        });
      }

      render(env, currentAngle, isCharging, chargeProgress) {
        if (!env || !this.ctx) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.scale(this.dpr || 1, this.dpr || 1);

        // Screen shake offset
        let shakeX = 0, shakeY = 0;
        if (this.trauma > 0) {
          const mag = Math.pow(this.trauma, 2) * 16;
          shakeX = (Math.random() - 0.5) * mag;
          shakeY = (Math.random() - 0.5) * mag;
        }
        ctx.translate(shakeX, shakeY);

        // 1. Sky Gradient & Stars
        const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
        skyGrad.addColorStop(0, '#090d1a');
        skyGrad.addColorStop(0.6, '#142038');
        skyGrad.addColorStop(1, '#23385d');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, this.width, this.height);

        // 2. Distant Mountains (Parallax Silhouette)
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

        // 3. Clouds & Wind Streaks
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        this.clouds.forEach(c => {
          const sp = this.worldToScreen(c.x, c.y);
          ctx.beginPath();
          ctx.arc(sp.sx, sp.sy, c.r * sp.scale, 0, Math.PI * 2);
          ctx.arc(sp.sx + 25 * sp.scale, sp.sy - 10 * sp.scale, (c.r * 0.8) * sp.scale, 0, Math.PI * 2);
          ctx.arc(sp.sx - 25 * sp.scale, sp.sy - 5 * sp.scale, (c.r * 0.7) * sp.scale, 0, Math.PI * 2);
          ctx.fill();
        });

        // 4. Procedural Irregular Terrain
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

        // Terrain Top Edge Glow (Grass / Neon Ridge)
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(34, 197, 94, 0.5)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(startP.sx, startP.sy);
        for (let wx = 0; wx <= WORLD_WIDTH; wx += 8) {
          const wy = env.getTerrainHeight(wx);
          const sp = this.worldToScreen(wx, wy);
          ctx.lineTo(sp.sx, sp.sy);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 5. Water pond rendering
        if (env.pond) {
          const pLeft = this.worldToScreen(env.pond.left, env.pond.waterLevel);
          const pRight = this.worldToScreen(env.pond.right, env.pond.waterLevel);
          const pBottom = this.worldToScreen(env.pond.x, env.getTerrainHeight(env.pond.x));

          // Translucent Water Basin Fill
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

          // Animated Water Surface Waves
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

          // Water surface highlight sparkles
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          for (let i = 0; i < 4; i++) {
            const sparkleX = env.pond.left + 15 + i * (env.pond.width / 4);
            const sparkleY = env.pond.waterLevel + Math.sin(sparkleX * 0.08 + this.waterTime) * 2;
            const sp = this.worldToScreen(sparkleX, sparkleY);
            ctx.beginPath();
            ctx.arc(sp.sx, sp.sy, 2 * sp.scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 6. Procedural Trees & Rocks Rendering
        env.obstacles.forEach(obs => {
          if (obs.type === 'tree') {
            // Render Procedural Tree
            const treeBase = this.worldToScreen(obs.x, obs.y);
            const trunkW = 12 * treeBase.scale;
            const trunkH = (obs.height * 0.35) * treeBase.scale;

            // Wooden Trunk
            ctx.fillStyle = '#78350f';
            ctx.fillRect(treeBase.sx - trunkW / 2, treeBase.sy - trunkH, trunkW, trunkH);

            // Foliage Layers
            const sway = Math.sin(this.flagWaveAngle + obs.x) * 3 * treeBase.scale;
            
            if (obs.subType === 'pine') {
              // 3-Tier Pine Tree
              const tiers = 3;
              for (let t = 0; t < tiers; t++) {
                const tierY = treeBase.sy - trunkH - (t * 18 * treeBase.scale);
                const tierW = (obs.width * (1 - t * 0.22)) * treeBase.scale;
                const tierH = 28 * treeBase.scale;

                ctx.fillStyle = t === 2 ? '#22c55e' : (t === 1 ? '#16a34a' : '#15803d');
                ctx.beginPath();
                ctx.moveTo(treeBase.sx - tierW / 2, tierY);
                ctx.lineTo(treeBase.sx + tierW / 2, tierY);
                ctx.lineTo(treeBase.sx + sway * (t + 1) * 0.3, tierY - tierH);
                ctx.closePath();
                ctx.fill();
              }
            } else {
              // Leafy Round Oak Tree
              const canopyCenterY = treeBase.sy - (obs.height * 0.65) * treeBase.scale;
              const r = (obs.width * 0.5) * treeBase.scale;
              
              ctx.fillStyle = '#15803d';
              ctx.beginPath();
              ctx.arc(treeBase.sx - 8 * treeBase.scale + sway, canopyCenterY + 4 * treeBase.scale, r * 0.8, 0, Math.PI * 2);
              ctx.arc(treeBase.sx + 8 * treeBase.scale + sway, canopyCenterY + 4 * treeBase.scale, r * 0.8, 0, Math.PI * 2);
              ctx.arc(treeBase.sx + sway, canopyCenterY - 6 * treeBase.scale, r * 0.9, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#22c55e';
              ctx.beginPath();
              ctx.arc(treeBase.sx + sway, canopyCenterY - 2 * treeBase.scale, r * 0.65, 0, Math.PI * 2);
              ctx.fill();
            }

          } else if (obs.type === 'rock') {
            // Render Procedural Craggy Boulder
            const rockBase = this.worldToScreen(obs.x, obs.y);
            
            ctx.save();
            ctx.translate(rockBase.sx, rockBase.sy);
            
            // Stone base gradient
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

            // Boulder shading facet
            ctx.fillStyle = '#334155';
            ctx.beginPath();
            ctx.moveTo(0, -(obs.height * 0.9) * rockBase.scale);
            ctx.lineTo((obs.width * 0.45) * rockBase.scale, -(obs.height * 0.4) * rockBase.scale);
            ctx.lineTo((obs.width * 0.35) * rockBase.scale, 0);
            ctx.lineTo(0, 0);
            ctx.closePath();
            ctx.fill();

            // Moss cap on top
            ctx.strokeStyle = '#84cc16';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-(obs.width * 0.35) * rockBase.scale, -(obs.height * 0.85) * rockBase.scale);
            ctx.lineTo(0, -(obs.height * 0.95) * rockBase.scale);
            ctx.lineTo((obs.width * 0.3) * rockBase.scale, -(obs.height * 0.88) * rockBase.scale);
            ctx.stroke();

            ctx.restore();
          }
        });

        // 7. Target Flag & Hit Zone
        const flagBase = this.worldToScreen(env.flagPos.x, env.flagPos.y);
        const flagTop = this.worldToScreen(env.flagPos.x, env.flagPos.y + 48);

        // Bullseye concentric circles at flag base
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

        // Pole
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(flagBase.sx, flagBase.sy);
        ctx.lineTo(flagTop.sx, flagTop.sy);
        ctx.stroke();

        // Waving Flag Cloth
        const wave = Math.sin(this.flagWaveAngle) * 6;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(flagTop.sx, flagTop.sy);
        ctx.quadraticCurveTo(flagTop.sx + 15 * flagBase.scale, flagTop.sy + wave, flagTop.sx + 30 * flagBase.scale, flagTop.sy + 8);
        ctx.lineTo(flagTop.sx + 30 * flagBase.scale, flagTop.sy + 22);
        ctx.quadraticCurveTo(flagTop.sx + 15 * flagBase.scale, flagTop.sy + 14 + wave, flagTop.sx, flagTop.sy + 18);
        ctx.closePath();
        ctx.fill();

        // 8. Ghost Shot 1 Trajectory & Impact Marker (for Shot 2 Calibration)
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

          // Ghost impact marker
          const gImp = this.worldToScreen(this.shot1Ghost.impact.x, this.shot1Ghost.impact.y);
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(gImp.sx, gImp.sy, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '11px sans-serif';
          ctx.fillText(`นัดที่ 1: ${this.shot1Ghost.gameDistance.toFixed(2)} ม.`, gImp.sx - 35, gImp.sy - 12);
        }

        // 9. Historical Cannon (Left)
        const cannonBase = this.worldToScreen(env.cannonPos.x, env.cannonPos.y);
        const rad = (currentAngle * Math.PI) / 180;
        const barrelLenScreen = 32 * cannonBase.scale;

        // Aim dotted line preview near muzzle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(cannonBase.sx + Math.cos(rad) * barrelLenScreen, cannonBase.sy - Math.sin(rad) * barrelLenScreen);
        ctx.lineTo(cannonBase.sx + Math.cos(rad) * barrelLenScreen * 2.2, cannonBase.sy - Math.sin(rad) * barrelLenScreen * 2.2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cannon Barrel
        ctx.save();
        ctx.translate(cannonBase.sx, cannonBase.sy);
        ctx.rotate(-rad);
        
        ctx.fillStyle = '#475569';
        ctx.fillRect(0, -6 * cannonBase.scale, barrelLenScreen, 12 * cannonBase.scale);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -6 * cannonBase.scale, barrelLenScreen, 12 * cannonBase.scale);

        // Charging fuse spark
        if (isCharging) {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(-4, -8, (3 + Math.random() * 4) * cannonBase.scale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Cannon Wooden Carriage & Wheel
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.arc(cannonBase.sx, cannonBase.sy + 4, 12 * cannonBase.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 10. Active Flying Ball & Trail
        if (this.flyingBall) {
          const ballPos = this.worldToScreen(this.flyingBall.x, this.flyingBall.y);
          
          // Ball smoke trail
          ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
          ctx.beginPath();
          ctx.arc(ballPos.sx, ballPos.sy, 5 * ballPos.scale, 0, Math.PI * 2);
          ctx.fill();
        }

        // 11. Particles Rendering
        this.particles.forEach(p => {
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

    // ---------------------------------------------------------
    // 7. APP CONTROLLER & STATE MACHINE
    // ---------------------------------------------------------
    let renderer = null;
    let currentAngle = 45.0;
    let powerCharge = 0.15; // 0.15 to 1.0
    let isChargingPower = false;
    let chargeDirection = 1;
    let isAimingLocked = false;
    let aimTimerInterval = null;
    let lastAnimTime = (typeof performance !== 'undefined' ? performance.now() : 0);

    let DOM = null;

    if (typeof document !== 'undefined') {
      DOM = {
        // Screens
        screenSetup: document.getElementById('screen-setup'),
        screenPassDevice: document.getElementById('screen-pass-device'),
        screenGameplay: document.getElementById('screen-gameplay'),
        screenResults: document.getElementById('screen-results'),
        testModal: document.getElementById('test-modal'),

        // Setup inputs
        displayPlayerCount: document.getElementById('display-player-count'),
        labelPlayerCount: document.getElementById('label-player-count'),
        btnDecPlayers: document.getElementById('btn-dec-players'),
        btnIncPlayers: document.getElementById('btn-inc-players'),
        playerNamesContainer: document.getElementById('player-names-container'),
        btnStartMatch: document.getElementById('btn-start-match'),

        // Pass device
        passPlayerName: document.getElementById('pass-player-name'),
        passTurnOrder: document.getElementById('pass-turn-order'),
        btnReadyToAim: document.getElementById('btn-ready-to-aim'),

        // Gameplay HUD & Controls
        canvas: document.getElementById('game-canvas'),
        hudPlayerName: document.getElementById('hud-player-name'),
        hudShotBadge: document.getElementById('hud-shot-badge'),
        hudTimerNum: document.getElementById('hud-timer-num'),
        hudTimerBar: document.getElementById('hud-timer-bar'),
        hudWindArrow: document.getElementById('hud-wind-arrow'),
        hudWindVal: document.getElementById('hud-wind-val'),
        hudMatchSeed: document.getElementById('hud-match-seed'),

        sliderAngle: document.getElementById('slider-angle'),
        displayAngleVal: document.getElementById('display-angle-val'),
        btnAngleDec: document.getElementById('btn-angle-dec'),
        btnAngleInc: document.getElementById('btn-angle-inc'),

        powerGaugeFill: document.getElementById('power-gauge-fill'),
        powerGaugeText: document.getElementById('power-gauge-text'),
        btnFireCannon: document.getElementById('btn-fire-cannon'),

        shotModalOverlay: document.getElementById('shot-modal-overlay'),
        shotModalTitle: document.getElementById('shot-modal-title'),
        shotModalDistance: document.getElementById('shot-modal-distance'),
        shotModalDetail: document.getElementById('shot-modal-detail'),
        btnModalNextShot: document.getElementById('btn-modal-next-shot'),

        // Results
        leaderboardTbody: document.getElementById('leaderboard-tbody'),
        resultsVerdictContainer: document.getElementById('results-verdict-container'),
        btnReplayMatch: document.getElementById('btn-replay-match'),
        btnNewSetup: document.getElementById('btn-new-setup'),

        // Tools
        btnSoundToggle: document.getElementById('btn-sound-toggle'),
        btnOpenTests: document.getElementById('btn-open-tests'),
        btnCloseTests: document.getElementById('btn-close-tests'),
        testOutputList: document.getElementById('test-output-list')
      };

      if (DOM.canvas) {
        renderer = new CanvasRenderer(DOM.canvas);
      }
    }

    // ---------------------------------------------------------
    // SCREEN NAVIGATION
    // ---------------------------------------------------------
    // gh#170: this route owns its announcement channel -- #cf-live in markup.html, resolved here and
    // nowhere else. No helper: the shared src/games/_round-start.ts speaks for shell-mounted games,
    // and this page has no shell. The node is re-read per call rather than cached because markup.html
    // is injected by the Astro page, not by this file. Written as text, never as markup.
    function announceRound(text) {
      const region = document.getElementById('cf-live');
      if (region) region.textContent = text;
    }

    // The controls a player deliberately taps twice in a row, so the 400ms window must never cover
    // them. _arm-gate.ts records this ceiling as PER CONTROL: the counter steppers are held down and
    // repeated, the angle nudges are tapped in bursts, and the FIRE button is press-and-hold -- a
    // gate that disabled any of them would take the game away rather than protect it. Everything
    // else on these screens is a one-shot transition control and is gated.
    function rapidTapControls() {
      if (!DOM) return [];
      return [DOM.btnDecPlayers, DOM.btnIncPlayers, DOM.btnAngleDec, DOM.btnAngleInc, DOM.btnFireCannon]
        .filter(Boolean);
    }

    // One arm at a time. armAllButtons returns a canceller and this route reveals panels in a strict
    // sequence, so holding the last one and cancelling it before the next reveal keeps a pointerdown
    // listener from accumulating on every screen for the life of the page.
    let disarmActive = null;
    function armPanel(panelEl) {
      if (!panelEl) return;
      if (disarmActive) disarmActive();
      disarmActive = armAllButtons(panelEl, rapidTapControls());
    }

    // #test-modal gets a SEPARATE slot instead of armPanel's. Its trigger, #btn-open-tests, sits in
    // the header outside every game-screen, so it is never gated and can be tapped while a screen
    // reveal is still inside its window. Through armPanel that tap would cancel the pending screen
    // arm, and the canceller does not re-enable: the setup screen's buttons would stay disabled with
    // no control left that could call showScreen() again.
    let disarmTestModal = null;
    function armTestModal() {
      if (!DOM || !DOM.testModal) return;
      if (disarmTestModal) disarmTestModal();
      disarmTestModal = armAllButtons(DOM.testModal);
    }

    function showScreen(screenEl) {
      if (!DOM) return;
      [DOM.screenSetup, DOM.screenPassDevice, DOM.screenGameplay, DOM.screenResults].forEach(s => {
        if (s) s.classList.remove('active');
      });
      if (screenEl) screenEl.classList.add('active');
      if (screenEl === DOM.screenGameplay && renderer) {
        renderer.resize();
      }
      armPanel(screenEl);
    }

    // ---------------------------------------------------------
    // SETUP SCREEN CONTROLS
    // ---------------------------------------------------------
    let setupPlayerCount = 4;

    // Roster names are typed by players, so they are untrusted text wherever this file builds
    // markup by string. Same helper, same idiom as src/play/freeze-tap/main.js — kept local because
    // each main.js is a verbatim lift whose only imports are the shared gates the site's own CI
    // demands. Pinned by src/play/name-escaping.test.mjs.
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function renderSetupPlayerInputs() {
      if (!DOM || !DOM.displayPlayerCount) return;
      DOM.displayPlayerCount.textContent = setupPlayerCount;
      DOM.labelPlayerCount.textContent = `${setupPlayerCount} คน`;

      // Preserve existing typed names
      const existingNames = Array.from(DOM.playerNamesContainer.querySelectorAll('.player-name-input')).map(i => i.value);
      DOM.playerNamesContainer.innerHTML = '';

      for (let i = 0; i < setupPlayerCount; i++) {
        const row = document.createElement('div');
        row.className = 'player-name-row';
        row.innerHTML = `
          <span class="player-tag">#${i + 1}</span>
          <input type="text" class="player-name-input" placeholder="ผู้เล่น ${i + 1}" maxlength="20" value="${escapeHtml(existingNames[i] || '')}">
        `;
        DOM.playerNamesContainer.appendChild(row);
      }
    }

    if (DOM) {
      DOM.btnDecPlayers.addEventListener('click', () => {
        if (setupPlayerCount > 2) {
          setupPlayerCount--;
          sound.playClick();
          renderSetupPlayerInputs();
        }
      });

      DOM.btnIncPlayers.addEventListener('click', () => {
        if (setupPlayerCount < 20) {
          setupPlayerCount++;
          sound.playClick();
          renderSetupPlayerInputs();
        }
      });

      DOM.btnStartMatch.addEventListener('click', () => {
        sound.init();
        sound.playClick();
        const inputs = DOM.playerNamesContainer.querySelectorAll('.player-name-input');
        const names = Array.from(inputs).map(inp => inp.value);
        
        const env = gameEngine.setupMatch(names);
        DOM.hudMatchSeed.textContent = `SEED: #${env.seed}`;
        
        showPassDeviceScreen();
      });
    }

    // ---------------------------------------------------------
    // PASS DEVICE TRANSITION
    // ---------------------------------------------------------
    function showPassDeviceScreen() {
      if (!DOM) return;
      const p = gameEngine.getCurrentPlayer();
      DOM.passPlayerName.textContent = p.name;
      DOM.passTurnOrder.textContent = `ลำดับที่ ${gameEngine.currentTurnIndex + 1} / ${gameEngine.activePlayerPool.length}`;
      showScreen(DOM.screenPassDevice);
      // gh#170: the round starts on this screen, so it is announced here. Same two facts the screen
      // itself shows -- whose turn, and where in the order -- and nothing about the aim timer.
      announceRound(`ตาของ ${p.name} ลำดับที่ ${gameEngine.currentTurnIndex + 1} จาก ${gameEngine.activePlayerPool.length}`);
    }

    if (DOM) {
      DOM.btnReadyToAim.addEventListener('click', () => {
        sound.playClick();
        startPlayerAiming();
      });
    }

    // ---------------------------------------------------------
    // AIMING & 30-SECOND COUNTDOWN TIMER
    // ---------------------------------------------------------
    function startPlayerAiming() {
      if (!DOM) return;
      const p = gameEngine.getCurrentPlayer();
      const env = gameEngine.getCurrentEnvironment();

      DOM.hudPlayerName.textContent = p.name;
      DOM.hudShotBadge.textContent = `นัดที่ ${gameEngine.currentShotNumber} / 2`;
      DOM.hudWindVal.textContent = env.wind.strength.toFixed(1);
      DOM.hudWindArrow.textContent = env.wind.direction === 1 ? '➔' : '⬅';
      DOM.hudWindArrow.style.transform = env.wind.direction === 1 ? 'none' : 'scaleX(-1)';

      // Clear shot 1 ghost if starting shot 1 for new player
      if (gameEngine.currentShotNumber === 1 && renderer) {
        renderer.shot1Ghost = null;
      }

      // Randomize cannon angle on every turn / player switch (20.0° - 75.0°)
      const randomDeg = Math.round((20 + Math.random() * 55) * 2) / 2;
      setAngle(randomDeg);

      isAimingLocked = false;
      DOM.btnFireCannon.disabled = false;
      powerCharge = 0.0;
      updatePowerUI();

      // Reset 30s timer
      gameEngine.aimTimerRemaining = 30.0;
      updateTimerDisplay();

      clearInterval(aimTimerInterval);
      aimTimerInterval = setInterval(() => {
        if (isAimingLocked) return;
        gameEngine.aimTimerRemaining = Math.max(0, gameEngine.aimTimerRemaining - 0.1);
        updateTimerDisplay();

        // Audio tick for final 5 seconds
        if (gameEngine.aimTimerRemaining <= 5.0 && gameEngine.aimTimerRemaining > 0) {
          sound.playTick(true);
        }

        if (gameEngine.aimTimerRemaining <= 0.001) {
          clearInterval(aimTimerInterval);
          // Auto fire on timeout
          autoFireOnTimeout();
        }
      }, 100);

      showScreen(DOM.screenGameplay);
    }

    function updateTimerDisplay() {
      if (!DOM) return;
      const rem = gameEngine.aimTimerRemaining;
      DOM.hudTimerNum.textContent = `${rem.toFixed(1)}s`;
      DOM.hudTimerBar.style.width = `${(rem / 30) * 100}%`;

      DOM.hudTimerNum.classList.remove('warning', 'danger');
      if (rem <= 5.0) {
        DOM.hudTimerNum.classList.add('danger');
        DOM.hudTimerBar.style.backgroundColor = 'var(--accent-crimson)';
      } else if (rem <= 12.0) {
        DOM.hudTimerNum.classList.add('warning');
        DOM.hudTimerBar.style.backgroundColor = 'var(--accent-amber)';
      } else {
        DOM.hudTimerBar.style.backgroundColor = 'var(--accent-emerald)';
      }
    }

    // ---------------------------------------------------------
    // ANGLE & POWER CONTROLS
    // ---------------------------------------------------------
    function setAngle(deg) {
      if (!DOM) return;
      currentAngle = Math.max(5, Math.min(85, deg));
      DOM.sliderAngle.value = currentAngle;
      DOM.displayAngleVal.textContent = currentAngle.toFixed(1);
    }

    if (DOM) {
      DOM.sliderAngle.addEventListener('input', (e) => {
        setAngle(parseFloat(e.target.value));
      });

      DOM.btnAngleDec.addEventListener('click', () => {
        setAngle(currentAngle - 1);
        sound.playClick();
      });

      DOM.btnAngleInc.addEventListener('click', () => {
        setAngle(currentAngle + 1);
        sound.playClick();
      });
    }

    function updatePowerUI() {
      if (!DOM) return;
      const pct = Math.round(powerCharge * 100);
      DOM.powerGaugeFill.style.width = `${pct}%`;
      DOM.powerGaugeText.textContent = `พลัง: ${pct}%`;
    }

    function autoFireOnTimeout() {
      if (isAimingLocked) return;
      // Default power fallback if not charged
      if (powerCharge < 0.25) powerCharge = 0.5;
      executeShot();
    }

    // Press-and-Hold Power Charging Mechanic
    function startPowerCharging(e) {
      if (e && e.type === 'touchstart') e.preventDefault();
      if (isAimingLocked || !DOM) return;
      sound.init();
      isChargingPower = true;
      chargeDirection = 1;
      DOM.btnFireCannon.classList.add('charging');
      sound.startChargeHum();
    }

    function releasePowerCharging(e) {
      if (e && e.type === 'touchend') e.preventDefault();
      if (!isChargingPower || isAimingLocked || !DOM) return;
      isChargingPower = false;
      DOM.btnFireCannon.classList.remove('charging');
      sound.stopChargeHum();
      executeShot();
    }

    if (DOM) {
      // Mouse & Touch events for FIRE button
      DOM.btnFireCannon.addEventListener('mousedown', startPowerCharging);
      window.addEventListener('mouseup', releasePowerCharging);

      DOM.btnFireCannon.addEventListener('touchstart', startPowerCharging, { passive: false });
      window.addEventListener('touchend', releasePowerCharging, { passive: false });
      window.addEventListener('touchcancel', releasePowerCharging, { passive: false });
    }

    // ---------------------------------------------------------
    // SHOT EXECUTION & TRAJECTORY ANIMATION
    // ---------------------------------------------------------
    function executeShot() {
      if (isAimingLocked || !DOM) return;
      isAimingLocked = true;
      clearInterval(aimTimerInterval);
      DOM.btnFireCannon.disabled = true;

      const env = gameEngine.getCurrentEnvironment();
      const simResult = simulateShot(env, currentAngle, powerCharge);

      sound.playCannonFire();
      if (renderer) {
        renderer.addTrauma(0.7);
        renderer.emitParticles('fire', env.cannonPos.x + 30, env.cannonPos.y + 10, 25);
        renderer.emitParticles('smoke', env.cannonPos.x + 30, env.cannonPos.y + 10, 15);
      }

      // Animate Ball along trajectory path
      let frameIndex = 0;
      const totalFrames = simResult.path.length;

      function animBall() {
        if (frameIndex < totalFrames) {
          const pt = simResult.path[frameIndex];
          // ADR-0046: under the reduce query the ball walks the SAME trajectory in bigger strides --
          // a few stepped positions instead of a smooth arc. It is not frozen and it is not hidden,
          // because where the shot went is the round's result and the player has to see it.
          const reduced = prefersReducedMotion();
          if (renderer) {
            renderer.flyingBall = pt;
            if (!reduced && frameIndex % 3 === 0) {
              renderer.emitParticles('smoke', pt.x, pt.y, 2);
            }
          }
          frameIndex += reduced ? 8 : 2;
          requestAnimationFrame(animBall);
        } else {
          // Impact reached!
          if (renderer) renderer.flyingBall = null;
          handleShotImpact(simResult);
        }
      }

      requestAnimationFrame(animBall);
    }

    function handleShotImpact(simResult) {
      if (renderer) {
        renderer.addTrauma(simResult.isDirectHit ? 1.0 : 0.5);
        if (simResult.hitType === 'water') {
          renderer.emitParticles('water', simResult.impact.x, simResult.impact.y, 40);
        } else if (simResult.hitType === 'tree') {
          renderer.emitParticles('wood', simResult.impact.x, simResult.impact.y, 25);
          renderer.emitParticles('smoke', simResult.impact.x, simResult.impact.y, 15);
        } else {
          renderer.emitParticles(simResult.isDirectHit ? 'sparkle' : 'fire', simResult.impact.x, simResult.impact.y, 35);
          renderer.emitParticles('smoke', simResult.impact.x, simResult.impact.y, 20);
        }
      }

      if (simResult.isDirectHit) {
        sound.playTargetDirectHit();
      } else {
        sound.playImpact(simResult.hitType);
      }

      // Record result
      gameEngine.recordShotResult(simResult.gameDistance);

      // Save ghost trajectory if Shot 1 for player calibration
      if (gameEngine.currentShotNumber === 1 && renderer) {
        renderer.shot1Ghost = simResult;
      }

      // Show In-Game Modal Overlay
      setTimeout(() => {
        showShotResultModal(simResult);
      }, 700);
    }

    function showShotResultModal(simResult) {
      if (!DOM) return;
      DOM.shotModalTitle.textContent = `ผลการยิงนัดที่ ${gameEngine.currentShotNumber}`;
      
      let impactNote = '';
      if (simResult.isDirectHit) {
        DOM.shotModalDistance.textContent = '00.00 ม. (เข้าเป้า!)';
        DOM.shotModalDistance.classList.add('direct-hit');
        impactNote = '🎯 ยิงเข้าเป้าตรงกลางฐานธงอย่างสมบูรณ์แบบ!';
      } else {
        DOM.shotModalDistance.textContent = `${simResult.gameDistance.toFixed(2)} ม.`;
        DOM.shotModalDistance.classList.remove('direct-hit');
        if (simResult.hitType === 'water') impactNote = '🌊 ตกกระทบผิวน้ำในแอ่งน้ำ!';
        else if (simResult.hitType === 'tree') impactNote = '🌲 ชนเข้ากับต้นไม้!';
        else if (simResult.hitType === 'rock') impactNote = '🪨 ชนเข้ากับก้อนหินผา!';
        else impactNote = `ห่างจากฐานธง ${simResult.gameDistance.toFixed(2)} เมตร`;
      }
      DOM.shotModalDetail.textContent = impactNote;

      if (gameEngine.currentShotNumber === 1) {
        DOM.btnModalNextShot.innerHTML = '<span>🎯 ยิงนัดที่ 2 ทันที</span>';
      } else {
        DOM.btnModalNextShot.innerHTML = '<span>📊 ดูผลคะแนน / คนถัดไป</span>';
      }

      DOM.shotModalOverlay.classList.add('active');
      // The sharpest ghost tap on this route: the modal lands on top of the FIRE button the player
      // was just holding, so the release tap can arrive as the modal's own control appears.
      armPanel(DOM.shotModalOverlay);
    }

    if (DOM) {
      DOM.btnModalNextShot.addEventListener('click', () => {
        DOM.shotModalOverlay.classList.remove('active');
        sound.playClick();

        const { nextPlayer, matchComplete } = gameEngine.advanceTurn();

        if (matchComplete) {
          showResultsScreen();
        } else if (nextPlayer) {
          showPassDeviceScreen();
        } else {
          // Shot 2 for same player
          startPlayerAiming();
        }
      });
    }

    // ---------------------------------------------------------
    // RESULTS & SUDDEN DEATH ENGINE
    // ---------------------------------------------------------
    function showResultsScreen() {
      if (!DOM) return;
      const standings = gameEngine.calculateStandings();
      DOM.leaderboardTbody.innerHTML = '';

      standings.sortedLeaderboard.forEach((p, idx) => {
        const isLoser = (p.bestDistance === standings.worstDistance);
        const tr = document.createElement('tr');
        tr.className = `leaderboard-row ${isLoser ? 'loser-row' : ''}`;
        tr.innerHTML = `
          <td>${idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`))}</td>
          <td>
            <strong>${escapeHtml(p.name)}</strong>
            ${isLoser ? '<span class="loser-badge-tag">อันดับสุดท้าย</span>' : ''}
          </td>
          <td style="text-align:center;">${p.shot1Distance !== null ? p.shot1Distance.toFixed(2) : '-'}</td>
          <td style="text-align:center;">${p.shot2Distance !== null ? p.shot2Distance.toFixed(2) : '-'}</td>
          <td>${p.bestDistance.toFixed(2)} ม.</td>
        `;
        DOM.leaderboardTbody.appendChild(tr);
      });

      // Handle Tie vs Final Loser
      DOM.resultsVerdictContainer.innerHTML = '';

      if (standings.isTie) {
        // Multiple tied players for worst score -> Sudden Death!
        sound.playFanfare(false);
        const tiedNames = standings.tiedLosers.map(p => p.name).join(', ');
        const banner = document.createElement('div');
        banner.className = 'tie-banner';
        banner.innerHTML = `
          <div style="font-size: 1.15rem; margin-bottom: 4px;">🚨 เสมอกันที่คะแนน ${standings.worstDistance.toFixed(2)} ม.!</div>
          <div style="color: var(--text-primary); margin-bottom: 10px;">ผู้เล่นที่ต้องดวลรอบตัดสิน: <strong>${escapeHtml(tiedNames)}</strong></div>
          <button id="btn-start-sudden-death" class="btn-primary" style="margin: 6px auto 0; background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);">
            <span>⚡ เข้าสู่รอบตัดสิน Sudden Death</span>
          </button>
        `;
        DOM.resultsVerdictContainer.appendChild(banner);

        document.getElementById('btn-start-sudden-death').addEventListener('click', () => {
          sound.playClick();
          const newEnv = gameEngine.startSuddenDeath(standings.tiedLosers);
          DOM.hudMatchSeed.textContent = `SD-${gameEngine.suddenDeathRound}: #${newEnv.seed}`;
          showPassDeviceScreen();
        });
      } else {
        // Exactly one single loser!
        sound.playFanfare(false);
        const loser = standings.singleLoser;
        const banner = document.createElement('div');
        banner.className = 'final-loser-banner';
        banner.innerHTML = `
          <div class="loser-crown">💥 ➔ 🏆 (ผู้แพ้)</div>
          <div style="font-size: 0.95rem; color: var(--text-secondary);">ผู้แพ้ประจำแมตช์นี้คือ</div>
          <div class="loser-name">${escapeHtml(loser.name)}</div>
          <div style="font-size: 0.88rem; color: var(--text-muted);">ระยะดีที่สุดห่างจากฐานธง ${loser.bestDistance.toFixed(2)} เมตร</div>
        `;
        DOM.resultsVerdictContainer.appendChild(banner);
      }

      showScreen(DOM.screenResults);
    }

    if (DOM) {
      DOM.btnReplayMatch.addEventListener('click', () => {
        sound.playClick();
        const names = gameEngine.players.map(p => p.name);
        const env = gameEngine.setupMatch(names);
        DOM.hudMatchSeed.textContent = `SEED: #${env.seed}`;
        showPassDeviceScreen();
      });

      DOM.btnNewSetup.addEventListener('click', () => {
        sound.playClick();
        showScreen(DOM.screenSetup);
      });

      // ---------------------------------------------------------
      // SOUND & TOOLS TOGGLE
      // ---------------------------------------------------------
      DOM.btnSoundToggle.addEventListener('click', () => {
        sound.enabled = !sound.enabled;
        DOM.btnSoundToggle.textContent = sound.enabled ? '🔊' : '🔇';
      });
    }

    // ---------------------------------------------------------
    // MAIN RAF GAME LOOP
    // ---------------------------------------------------------
    function gameLoop(now) {
      const dt = Math.min(0.1, (now - lastAnimTime) / 1000);
      lastAnimTime = now;

      // ADR-0046, the reduce-not-remove half. Under the reduce query the PAINT is throttled to
      // REDUCED_PAINT_MS; the charge oscillation and the renderer's own state update still run every
      // frame, so the power a player releases at is the same number either way. Skipping the paint is
      // what makes the gauge and the scene step instead of glide -- it never freezes them, and it
      // never changes what the shot does.
      const reduced = prefersReducedMotion();
      const paint = !reduced || now >= nextCoarsePaintAt;
      if (reduced && paint) nextCoarsePaintAt = now + REDUCED_PAINT_MS;

      // Update power charge oscillation if button is held
      if (isChargingPower && !isAimingLocked) {
        powerCharge += chargeDirection * dt * 0.9;
        if (powerCharge >= 1.0) {
          powerCharge = 1.0;
          chargeDirection = -1;
        } else if (powerCharge <= 0.0) {
          powerCharge = 0.0;
          chargeDirection = 1;
        }
        if (paint) updatePowerUI();
        sound.updateChargePitch(powerCharge);
      }

      if (renderer) {
        renderer.update(dt);
        if (paint) renderer.render(
          gameEngine.getCurrentEnvironment(),
          currentAngle,
          isChargingPower,
          powerCharge
        );
      }

      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(gameLoop);
      }
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(gameLoop);
    }

    // Initial setup display
    renderSetupPlayerInputs();

    // First paint is a transition too: the tap that opened this route can still be mid-double, and
    // the setup screen ships `active` in markup.html without ever going through showScreen().
    if (DOM) armPanel(DOM.screenSetup);

    // ---------------------------------------------------------
    // 8. AUTOMATED IN-BROWSER & HEADLESS TEST SUITE
    // ---------------------------------------------------------
    function runAllAutomatedTests() {
      const results = [];

      function assert(name, condition, details = '') {
        results.push({ name, pass: !!condition, details });
      }

      try {
        // Test A - Best shot selection & ranking
        const testEngine = new MatchEngine();
        testEngine.setupMatch(['ผู้เล่น A', 'ผู้เล่น B', 'ผู้เล่น C']);
        testEngine.players.find(p => p.name === 'ผู้เล่น A').shot1Distance = 18.42;
        testEngine.players.find(p => p.name === 'ผู้เล่น A').shot2Distance = 4.17;
        testEngine.players.find(p => p.name === 'ผู้เล่น A').bestDistance = 4.17;

        testEngine.players.find(p => p.name === 'ผู้เล่น B').shot1Distance = 7.20;
        testEngine.players.find(p => p.name === 'ผู้เล่น B').shot2Distance = 9.83;
        testEngine.players.find(p => p.name === 'ผู้เล่น B').bestDistance = 7.20;

        testEngine.players.find(p => p.name === 'ผู้เล่น C').shot1Distance = 21.91;
        testEngine.players.find(p => p.name === 'ผู้เล่น C').shot2Distance = 11.50;
        testEngine.players.find(p => p.name === 'ผู้เล่น C').bestDistance = 11.50;

        const standingsA = testEngine.calculateStandings();
        assert('Test A: การเลือกผลงานที่ดีที่สุดและการจัดอันดับ (Best Shot Selection & Ranking)', 
          standingsA.sortedLeaderboard[0].name === 'ผู้เล่น A' &&
          standingsA.sortedLeaderboard[1].name === 'ผู้เล่น B' &&
          standingsA.sortedLeaderboard[2].name === 'ผู้เล่น C' &&
          standingsA.singleLoser.name === 'ผู้เล่น C',
          `ผลลัพธ์ผู้แพ้: ${standingsA.singleLoser?.name}`
        );

        // Test B - Losing tie & sudden death participant filtering
        const testEngineB = new MatchEngine();
        testEngineB.setupMatch(['ผู้เล่น A', 'ผู้เล่น B', 'ผู้เล่น C', 'ผู้เล่น D']);
        testEngineB.players.find(p => p.name === 'ผู้เล่น A').bestDistance = 5.10;
        testEngineB.players.find(p => p.name === 'ผู้เล่น B').bestDistance = 22.45;
        testEngineB.players.find(p => p.name === 'ผู้เล่น C').bestDistance = 11.32;
        testEngineB.players.find(p => p.name === 'ผู้เล่น D').bestDistance = 22.45;

        const standingsB = testEngineB.calculateStandings();
        assert('Test B: การคัดเลือกเฉพาะผู้ที่เสมอกันเข้า Sudden Death (Participant Filtering)',
          standingsB.isTie === true &&
          standingsB.tiedLosers.length === 2 &&
          standingsB.tiedLosers.some(p => p.name === 'ผู้เล่น B') &&
          standingsB.tiedLosers.some(p => p.name === 'ผู้เล่น D') &&
          !standingsB.tiedLosers.some(p => p.name === 'ผู้เล่น A' || p.name === 'ผู้เล่น C'),
          `จำนวนผู้เล่นที่เสมอ: ${standingsB.tiedLosers.length}`
        );

        // Test C - Hundredth precision tie comparison
        const scoreB = Number((22.4541).toFixed(2));
        const scoreD = Number((22.4544).toFixed(2));
        assert('Test C: การเปรียบเทียบทศนิยม 2 ตำแหน่ง (Hundredth Precision Tie)',
          scoreB === 22.45 && scoreD === 22.45 && scoreB === scoreD,
          `คะแนนปัดเศษ B: ${scoreB}, D: ${scoreD}`
        );

        // Test D - Deterministic physics reproducibility across repeated runs
        const envFixed = generateEnvironment(12345);
        const shot1 = simulateShot(envFixed, 45, 0.75);
        const shot2 = simulateShot(envFixed, 45, 0.75);
        assert('Test D: ความแน่นอนของการคำนวณฟิสิกส์ (Deterministic Physics Reproducibility)',
          Math.abs(shot1.gameDistance - shot2.gameDistance) < 0.0001 &&
          shot1.impact.x === shot2.impact.x &&
          shot1.impact.y === shot2.impact.y,
          `ระยะนัด 1: ${shot1.gameDistance}, ระยะนัด 2: ${shot2.gameDistance}`
        );

        // Test E - Environment persistence
        const envOriginal = testEngine.mainEnvironment;
        assert('Test E: สภาพแวดล้อมคงที่ตลอดทั้งแมตช์ (Environment Persistence)',
          envOriginal !== null &&
          envOriginal.cannonPos.x === 90 &&
          envOriginal.flagPos.x > 700,
          `ตำแหน่งปืน X: ${envOriginal.cannonPos.x}, ตำแหน่งธง X: ${envOriginal.flagPos.x}`
        );

        // Test F - Sudden Death environment replacement
        const sdEnv = testEngineB.startSuddenDeath(standingsB.tiedLosers);
        assert('Test F: การสร้างด่านใหม่ในรอบ Sudden Death (Sudden Death Environment Replacement)',
          sdEnv !== null &&
          testEngineB.isSuddenDeath === true &&
          testEngineB.activePlayerPool.length === 2,
          `ผู้เล่นในรอบดวล: ${testEngineB.activePlayerPool.length}`
        );

        // Test G - Continuous Collision Anti-Tunneling with Dynamic Obstacles
        const envHighObs = generateEnvironment(55555);
        envHighObs.obstacles = [{
          id: 'test_tree_wall',
          type: 'tree',
          x: 400, y: 150, width: 30, height: 300,
          left: 385, right: 415, bottom: 150, top: 450
        }];
        const wallShot = simulateShot(envHighObs, 25, 1.0);
        assert('Test G: ระบบตรวจจับการชนสิ่งกีดขวางแบบต่อเนื่อง (Anti-Tunneling Obstacle Collision)',
          wallShot.hitObstacle === true && wallShot.impact.x <= 416 && wallShot.hitType === 'tree',
          `จุดกระทบ X: ${wallShot.impact.x.toFixed(1)}, ชนิดการชน: ${wallShot.hitType}`
        );

      } catch (err) {
        results.push({ name: 'ข้อผิดพลาดในการประมวลผล', pass: false, details: err.message });
      }

      return results;
    }

    if (DOM) {
      // Modal Test Trigger
      DOM.btnOpenTests.addEventListener('click', () => {
        DOM.testModal.classList.add('active');
        // Same reveal seam as the shot modal: a double-tap on 🧪 would land its second contact on
        // the modal's own close button. Armed before the rows are appended -- they are <div>s, so
        // the button set does not change. Its own slot, never armPanel's: see disarmTestModal.
        armTestModal();
        DOM.testOutputList.innerHTML = '';
        const testResults = runAllAutomatedTests();
        testResults.forEach(res => {
          const row = document.createElement('div');
          row.className = `test-row ${res.pass ? 'pass' : 'fail'}`;
          row.innerHTML = `
            <div>
              <strong>${res.pass ? '✅ ผ่าน (PASS)' : '❌ ไม่ผ่าน (FAIL)'}: ${res.name}</strong>
              ${res.details ? `<div style="font-size: 0.75rem; opacity: 0.8; margin-top: 2px;">${escapeHtml(res.details)}</div>` : ''}
            </div>
          `;
          DOM.testOutputList.appendChild(row);
        });
      });

      DOM.btnCloseTests.addEventListener('click', () => {
        DOM.testModal.classList.remove('active');
      });
    }

    // Expose for Headless CLI Node Testing
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        generateEnvironment,
        simulateShot,
        MatchEngine,
        runAllAutomatedTests
      };
    }
