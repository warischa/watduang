// Ghost-tap gate (ADR-0014 / ADR-0016 / ADR-0017): every view this route renders re-arms its own
// buttons, because the second contact of a double-tap aimed at the screen that just went away must
// not activate the control that replaced it. This route replaces #view-root wholesale on every state
// change, so arming once at init would gate nothing past the first screen.
// The .ts extension is spelled out in full, the way src/play/zero-trigger/main.js does it.
import { armAllButtons } from '../../games/_arm-gate.ts';
// gh#175 / ADR-0054: the party opens on the shared animal cast, never on a column of numbers. Every
// default name on this route -- the seat built when count is chosen, the placeholder an empty field
// shows, and the fallback for a name left blank at match start -- comes from here. resetCastNames is
// the reset control's wipe: it keeps the seat count and discards whatever a player typed.
import { mascotNames, resetCastNames } from '../_mascots.ts';

    /* ==========================================================================
       1. PURE LOGIC & DETERMINISTIC TIEBREAK ENGINE (2 DECIMAL PLACES)
       ========================================================================== */

    // ADR-0046: prefers-reduced-motion is a CSS media feature and it does not reach the `.style`
    // writes and requestAnimationFrame loops in this file, so the query is read HERE, in the same
    // file as the motion it gates. style.css carrying an @media block does NOT cover any of it.
    // Read PER CALL rather than cached into a boolean: a cached flag is a value an edit can pin to
    // false while this file still reads as guarded, and reading live also means a player who flips
    // the OS setting mid-round gets the new behaviour with no reload. Same shape as
    // src/play/how-close-is-near/main.js.
    // REDUCE, not remove, and this route is the sharp case: the gauge IS the mechanic, so it keeps
    // rising and falling on the same clock and locks the same score -- only its repaint steps on a
    // coarse cadence instead of every frame. What is dropped outright is the screen shake and most of
    // the confetti: decoration that carries no state.
    function prefersReducedMotion() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // Reduced-motion repaint cadence, the shape src/games/timebomb.ts uses for its fuse, and the
    // share of particles that still spawn, the shape src/play/how-close-is-near/main.js uses.
    const REDUCED_PAINT_MS = 120;
    const REDUCED_PARTICLE_SCALE = 0.25;

    /**
     * Stored as integer hundredths internally (e.g. 875 = 8.75)
     * Value range: 0..1000 per attempt, 0..3000 per round total
     */
    function formatScore(hundredths) {
      return (hundredths / 100).toFixed(2);
    }

    function sumAttempts(attemptsHundredths) {
      return attemptsHundredths.reduce((sum, val) => sum + val, 0);
    }

    /**
     * Determines round outcome among active players:
     * - Returns { isFinished: true, loserPlayerId, minTotalHundredths } if unique lowest score.
     * - Returns { isFinished: false, tiedPlayerIds, minTotalHundredths } if 2 or more players tie for lowest.
     */
    function evaluateRoundElimination(playerRoundResults) {
      if (!playerRoundResults || playerRoundResults.length === 0) {
        throw new Error("No player results to evaluate");
      }

      // Find minimum total score
      let minTotal = Infinity;
      for (const res of playerRoundResults) {
        if (res.totalHundredths < minTotal) {
          minTotal = res.totalHundredths;
        }
      }

      // Filter all candidates who share the lowest score
      const tiedCandidates = playerRoundResults
        .filter(res => res.totalHundredths === minTotal)
        .map(res => res.playerId);

      if (tiedCandidates.length === 1) {
        return {
          isFinished: true,
          loserPlayerId: tiedCandidates[0],
          tiedPlayerIds: [],
          minTotalHundredths: minTotal
        };
      } else {
        return {
          isFinished: false,
          loserPlayerId: null,
          tiedPlayerIds: tiedCandidates,
          minTotalHundredths: minTotal
        };
      }
    }

    /* ==========================================================================
       2. PROCEDURAL WEB AUDIO SOUND SYNTHESIZER (ZERO ASSETS)
       ========================================================================== */
    class WebAudioSoundSynth {
      constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem('powermeter_audio') !== 'disabled';
        this.activeHumOsc = null;
        this.activeHumGain = null;
        this.activeFilter = null;
      }

      initContext() {
        if (!this.ctx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            this.ctx = new AudioContextClass();
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }

      toggleAudio() {
        this.enabled = !this.enabled;
        localStorage.setItem('powermeter_audio', this.enabled ? 'enabled' : 'disabled');
        if (this.enabled) {
          this.initContext();
          this.playClick(600);
        } else {
          this.stopMeterHum();
        }
        return this.enabled;
      }

      playClick(freq = 540) {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.05);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.06);
      }

      startMeterHum() {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;
        this.stopMeterHum();

        const t = this.ctx.currentTime;
        this.activeHumOsc = this.ctx.createOscillator();
        this.activeHumGain = this.ctx.createGain();

        this.activeHumOsc.type = 'sawtooth';
        this.activeHumOsc.frequency.setValueAtTime(180, t);

        // Lowpass filter for smooth humming
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, t);

        this.activeHumGain.gain.setValueAtTime(0.02, t);
        this.activeHumGain.gain.linearRampToValueAtTime(0.12, t + 0.08);

        this.activeHumOsc.connect(filter);
        filter.connect(this.activeHumGain);
        this.activeHumGain.connect(this.ctx.destination);
        this.activeHumOsc.start(t);
        this.activeFilter = filter;
      }

      updateMeterHum(progress, isFalling) {
        if (!this.enabled || !this.activeHumOsc || !this.ctx) return;
        const t = this.ctx.currentTime;
        if (!isFalling) {
          // Climbing frequency: 180Hz -> 850Hz (rapid escalation)
          const freq = 180 + Math.pow(progress, 2.2) * 670;
          this.activeHumOsc.frequency.setTargetAtTime(freq, t, 0.02);
          if (this.activeFilter) {
            this.activeFilter.frequency.setTargetAtTime(400 + progress * 1500, t, 0.02);
          }
        } else {
          // Falling siren alarm
          const freq = Math.max(120, 750 * progress);
          this.activeHumOsc.frequency.setTargetAtTime(freq, t, 0.015);
          if (this.activeFilter) {
            this.activeFilter.frequency.setTargetAtTime(1200, t, 0.015);
          }
        }
      }

      stopMeterHum() {
        if (this.activeHumOsc) {
          try {
            this.activeHumOsc.stop();
            this.activeHumOsc.disconnect();
          } catch(e) {}
          this.activeHumOsc = null;
          this.activeHumGain = null;
          this.activeFilter = null;
        }
      }

      playLockScore(scoreHundredths) {
        this.stopMeterHum();
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        if (scoreHundredths === 1000) {
          // PERFECT 10.00 Fanfare (Ascending major chord + bell)
          const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
          notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const st = t + idx * 0.055;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, st);
            gain.gain.setValueAtTime(0.25, st);
            gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.45);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(st);
            osc.stop(st + 0.5);
          });
        } else if (scoreHundredths >= 800) {
          // High Score Chime
          const notes = [587.33, 739.99, 880.00];
          notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const st = t + idx * 0.05;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, st);
            gain.gain.setValueAtTime(0.22, st);
            gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(st);
            osc.stop(st + 0.4);
          });
        } else if (scoreHundredths >= 500) {
          // Mid Score Sound
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.15);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.2);
        } else {
          // Low score metallic thud
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.22);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.28);
        }
      }

      playTiebreakAlert() {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [220, 277.18, 329.63].forEach((f, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + i * 0.08;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, st);
          gain.gain.setValueAtTime(0.2, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(st);
          osc.stop(st + 0.45);
        });
      }

      playLoserDefeat() {
        if (!this.enabled) return;
        this.initContext();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [311.13, 293.66, 277.18, 261.63]; // Descending chromatic sad trombone
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.18;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.25, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.28);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(st);
          osc.stop(st + 0.32);
        });
      }
    }

    const soundSynth = new WebAudioSoundSynth();

    /* ==========================================================================
       3. GAME JUICE, PARTICLES & TRAUMA SCREEN SHAKE
       ========================================================================== */
    const particleCanvas = document.getElementById('particle-canvas');
    const pCtx = particleCanvas.getContext('2d');
    const appContainer = document.getElementById('app-container');

    let particles = [];
    let trauma = 0;
    let lastTime = performance.now();

    function resizeCanvas() {
      particleCanvas.width = window.innerWidth;
      particleCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function addTrauma(amount = 0.5) {
      // ADR-0046: the screen shake carries no state -- the score is in the number on the card -- so
      // under the reduce query it is dropped rather than slowed. The haptic below is NOT dropped:
      // prefers-reduced-motion is about moving pictures, and the buzz is the feedback a player who
      // asked for less motion still gets.
      if (!prefersReducedMotion()) trauma = Math.min(1.0, trauma + amount);
      if (navigator.vibrate) {
        try {
          if (amount >= 0.7) {
            navigator.vibrate([40, 30, 80]);
          } else {
            navigator.vibrate(35);
          }
        } catch(e) {}
      }
    }

    function spawnSparkles(x, y, count = 20, color = '#00f2fe') {
      // ADR-0046: thinned, not switched off -- a win still visibly celebrates.
      if (prefersReducedMotion()) count = Math.max(1, Math.round(count * REDUCED_PARTICLE_SCALE));
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.5;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          life: 1.0,
          decay: 0.02 + Math.random() * 0.03,
          size: 3 + Math.random() * 4,
          color,
          type: 'sparkle'
        });
      }
    }

    function spawnConfetti(count = 50) {
      // ADR-0046: thinned, not switched off -- see spawnSparkles.
      if (prefersReducedMotion()) count = Math.max(1, Math.round(count * REDUCED_PARTICLE_SCALE));
      const colors = ['#00f2fe', '#ffd700', '#ff2a5f', '#10b981', '#a855f7'];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * particleCanvas.width,
          y: -10,
          vx: (Math.random() - 0.5) * 3,
          vy: 2 + Math.random() * 4,
          rot: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.2,
          life: 1.0,
          decay: 0.008 + Math.random() * 0.01,
          size: 6 + Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          type: 'confetti'
        });
      }
    }

    function gameJuiceLoop(now) {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Screen Trauma Decay
      if (trauma > 0) {
        trauma = Math.max(0, trauma - dt * 2.5);
        const shake = Math.pow(trauma, 2);
        const maxOffset = 16;
        const offsetX = (Math.random() - 0.5) * maxOffset * shake;
        const offsetY = (Math.random() - 0.5) * maxOffset * shake;
        appContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      } else {
        appContainer.style.transform = 'none';
      }

      // Particles render & update
      pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // subtle gravity

        pCtx.save();
        pCtx.globalAlpha = Math.max(0, p.life);
        pCtx.fillStyle = p.color;

        if (p.type === 'sparkle') {
          pCtx.beginPath();
          pCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          pCtx.fill();
        } else if (p.type === 'confetti') {
          p.rot += p.vRot;
          pCtx.translate(p.x, p.y);
          pCtx.rotate(p.rot);
          pCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        pCtx.restore();
      }

      requestAnimationFrame(gameJuiceLoop);
    }
    requestAnimationFrame(gameJuiceLoop);

    /* ==========================================================================
       4. GAME STATE MACHINE & DATA MODEL
       ========================================================================== */
    const GameState = Object.freeze({
      SETUP_COUNT: 'SETUP_COUNT',
      SETUP_NAMES: 'SETUP_NAMES',
      TURN_INTRO: 'TURN_INTRO',
      ATTEMPT_READY: 'ATTEMPT_READY',
      ATTEMPT_RUNNING: 'ATTEMPT_RUNNING',
      ATTEMPT_RESULT: 'ATTEMPT_RESULT',
      PLAYER_ROUND_RESULT: 'PLAYER_ROUND_RESULT',
      ROUND_SUMMARY: 'ROUND_SUMMARY',
      TIEBREAK_INTRO: 'TIEBREAK_INTRO',
      FINAL_LOSER: 'FINAL_LOSER'
    });

    const PLAYER_AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐨', '🐰', '🦄', '🐙', '🐺'];
    const PLAYER_COLORS = [
      '#00f2fe', '#10b981', '#f59e0b', '#ff2a5f', '#a855f7',
      '#38bdf8', '#34d399', '#fbbf24', '#f43f5e', '#c084fc'
    ];

    // One seat's default name. Routed through mascotNames so the wrap past the end of the cast has
    // exactly one definition, in _mascots.ts, and none here. PLAYER_AVATARS/PLAYER_COLORS are left
    // as this route's own lists -- unlike short-stick's badge, nothing here claimed they had to match
    // the cast row for row, so they are out of scope for gh#175.
    const defaultName = (i) => mascotNames(i + 1)[i];

    const game = {
      state: GameState.SETUP_COUNT,
      playerCount: 4,
      players: [],          // Array of { id, name, avatar, color }
      activePlayerIds: [],  // Current players in this round (all, or tiebreak subset)
      currentTurnIndex: 0,  // Index in activePlayerIds
      currentAttempt: 1,    // 1, 2, or 3
      currentRoundNumber: 1,
      isTiebreak: false,
      roundResults: new Map(), // playerId -> { attempts: [number, number, number], totalHundredths }
      lastEvaluatedOutcome: null,

      // Meter Motion State (1.5x Speed: ~1460ms climb, ~560ms drop)
      meter: {
        startTime: 0,
        rafId: null,
        currentValueHundredths: 0,
        isFalling: false,
        lockedScoreHundredths: null,
        durationUpMs: 1460,   // 1.5x speed (1.46s upward)
        durationDownMs: 560   // 1.5x speed (0.56s downward drop)
      }
    };

    /* ==========================================================================
       5. VIEW RENDERERS & TRANSITIONS
       ========================================================================== */
    const viewRoot = document.getElementById('view-root');
    const srAnnouncer = document.getElementById('sr-announcer');

    function announceSR(text) {
      if (srAnnouncer) {
        srAnnouncer.textContent = text;
      }
    }

    function showToast(text) {
      const toast = document.getElementById('toast-msg');
      toast.textContent = text;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2400);
    }

    // One arm at a time. armAllButtons returns a canceller, and #view-root outlives every view drawn
    // into it, so without cancelling the previous arm a pointerdown listener would pile up on that one
    // node for every screen advance of the match.
    let disarmActive = null;

    /** Arms the buttons of the view just drawn (ADR-0017).
     *
     *  EXCEPTION, on the per-control ceiling _arm-gate.ts records: #main-tap-btn is the meter itself.
     *  The same player taps it twice inside about 1.5 seconds -- once to release the gauge, once to
     *  stop it at the peak -- and the stop tap is the entire game. A 400ms window over it would eat
     *  that tap, and the window's pointerdown restart would then keep eating it for as long as the
     *  player kept trying. Every other control this route renders is a one-shot transition and is
     *  gated. */
    function armRenderedView() {
      if (!viewRoot) return;
      if (disarmActive) disarmActive();
      const meterBtn = document.getElementById('main-tap-btn');
      disarmActive = armAllButtons(viewRoot, meterBtn ? [meterBtn] : []);
    }

    function renderUI() {
      switch (game.state) {
        case GameState.SETUP_COUNT:
          renderSetupCountView();
          break;
        case GameState.SETUP_NAMES:
          renderSetupNamesView();
          break;
        case GameState.TURN_INTRO:
          renderTurnIntroView();
          break;
        case GameState.ATTEMPT_READY:
        case GameState.ATTEMPT_RUNNING:
        case GameState.ATTEMPT_RESULT:
          renderAttemptView();
          break;
        case GameState.PLAYER_ROUND_RESULT:
          renderPlayerRoundResultView();
          break;
        case GameState.ROUND_SUMMARY:
          renderRoundSummaryView();
          break;
        case GameState.TIEBREAK_INTRO:
          renderTiebreakIntroView();
          break;
        case GameState.FINAL_LOSER:
          renderFinalLoserView();
          break;
      }
      // Every branch above replaced #view-root, so the arm runs here, once, after the new controls
      // exist -- not in each renderer, where a branch added later would ship ungated.
      armRenderedView();
    }

    /* --- VIEW 1: SETUP COUNT --- */
    function renderSetupCountView() {
      let countBtnsHtml = '';
      for (let i = 2; i <= 10; i++) {
        const isSel = (i === game.playerCount) ? 'selected' : '';
        countBtnsHtml += `
          <button class="count-btn ${isSel}" data-act="selectPlayerCount" data-arg="${i}" aria-label="${i} คน">
            ${i}
          </button>
        `;
      }

      viewRoot.innerHTML = `
        <div class="glass-card">
          <div style="font-size: 2.2rem; margin-bottom: 6px;">⚡</div>
          <h1 style="font-size: 1.6rem; font-weight: 800; margin-bottom: 4px;">เกมวัดพลัง</h1>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 16px;">
            เลือกจำนวนผู้เล่นในวง (2 - 10 คน) • สปีด 1.5x
          </p>

          <div class="count-grid" role="group" aria-label="เลือกจำนวนผู้เล่น">
            ${countBtnsHtml}
          </div>

          <button id="btn-primary-action" class="btn-primary" data-act="goToSetupNames">
            ถัดไป: ใส่ชื่อผู้เล่น ➔
          </button>
        </div>
      `;
      announceSR("หน้าเลือกจำนวนผู้เล่น");
    }

    function selectPlayerCount(num) {
      soundSynth.playClick(480 + num * 20);
      game.playerCount = num;
      renderSetupCountView();
    }

    function goToSetupNames() {
      soundSynth.playClick(620);
      const currentMap = new Map((game.players || []).map(p => [p.id, p.name]));
      game.players = [];
      for (let i = 0; i < game.playerCount; i++) {
        const id = `player_${i + 1}`;
        const existingName = currentMap.get(id);
        game.players.push({
          id,
          name: existingName || defaultName(i),
          avatar: PLAYER_AVATARS[i % PLAYER_AVATARS.length],
          color: PLAYER_COLORS[i % PLAYER_COLORS.length]
        });
      }
      game.state = GameState.SETUP_NAMES;
      renderUI();
    }

    // Roster names are typed by players, so they are untrusted text wherever this file builds
    // markup by string. Same helper, same idiom as src/play/freeze-tap/main.js — kept local because
    // each main.js is a verbatim lift with no imports. Pinned by src/play/name-escaping.test.mjs.
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /* --- VIEW 2: SETUP NAMES --- */
    function renderSetupNamesView() {
      let namesHtml = '';
      game.players.forEach((p, idx) => {
        namesHtml += `
          <div class="name-row">
            <div class="avatar-badge" style="border: 2px solid ${p.color};">${p.avatar}</div>
            <input type="text" class="name-input" id="input-name-${idx}"
                   value="${escapeHtml(p.name)}" placeholder="${escapeHtml(defaultName(idx))}"
                   maxlength="16" data-act="updatePlayerName" data-arg="${idx}"
                   aria-label="ชื่อผู้เล่นที่ ${idx + 1}">
          </div>
        `;
      });

      viewRoot.innerHTML = `
        <div class="glass-card">
          <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 4px;">ตั้งชื่อผู้เล่น</h2>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 12px;">
            จะเว้นว่างไว้ก็ได้ (ระบบจะใช้ชื่อเริ่มต้นให้)
          </p>

          <div class="names-list">
            ${namesHtml}
          </div>

          <!-- gh#175 -- sits with the rows it acts on. .btn-secondary is 48px tall already: 44px
               floor, no new rule. -->
          <button class="btn-secondary" data-act="openResetNamesModal" style="width:100%; margin-top:10px;">
            ↺ รีเซ็ตเป็นชื่อสัตว์
          </button>

          <button id="btn-primary-action" class="btn-primary" data-act="startNewMatch">
            🎮 เริ่มเกมทันที!
          </button>
          <button class="btn-secondary" data-act="backToSetupCount">
            ⬅ ย้อนกลับ
          </button>
        </div>
      `;
      announceSR("หน้าตั้งชื่อผู้เล่น");
    }

    function updatePlayerName(idx, val) {
      if (game.players[idx]) {
        game.players[idx].name = val;
      }
    }

    /** gh#175. The wipe the reset confirm guards: every seat keeps its id/avatar/color and gets an
     *  animal name back; resetCastNames only reads game.players.length and never looks inside an
     *  entry, so a typed name cannot survive this call -- that is exactly the loss the confirm's
     *  copy names. Deliberately free of any DOM write: the redraw belongs to the caller, which lets
     *  reset-names.test.mjs lift this out of main.js and run it without a browser. */
    function resetPlayerNames() {
      const names = resetCastNames(game.players);
      game.players.forEach((p, idx) => {
        p.name = names[idx];
      });
    }

    // The one inline handler that was an expression rather than a call:
    // `onclick="game.state = GameState.SETUP_COUNT; renderUI();"`. Named so the delegated dispatcher
    // below has a function to reach; the two statements are unchanged and in the same order.
    function backToSetupCount() {
      game.state = GameState.SETUP_COUNT;
      renderUI();
    }

    function startNewMatch() {
      soundSynth.playClick(700);
      game.players.forEach((p, idx) => {
        if (!p.name || p.name.trim() === '') {
          p.name = defaultName(idx);
        } else {
          p.name = p.name.trim();
        }
      });

      game.activePlayerIds = game.players.map(p => p.id);
      game.currentTurnIndex = 0;
      game.currentAttempt = 1;
      game.currentRoundNumber = 1;
      game.isTiebreak = false;
      game.roundResults = new Map();
      game.activePlayerIds.forEach(id => {
        game.roundResults.set(id, { attempts: [0, 0, 0], totalHundredths: 0 });
      });

      game.state = GameState.TURN_INTRO;
      renderUI();
    }

    /* --- VIEW 3: TURN INTRO (PASS DEVICE) --- */
    function getCurrentActivePlayer() {
      const pid = game.activePlayerIds[game.currentTurnIndex];
      return game.players.find(p => p.id === pid);
    }

    function renderTurnIntroView() {
      const curPlayer = getCurrentActivePlayer();
      const roundTitle = game.isTiebreak ? `รอบ Tiebreak ที่ ${game.currentRoundNumber}` : `รอบที่ ${game.currentRoundNumber}`;
      const tiebreakBadge = game.isTiebreak ? `<span class="turn-badge tiebreak-tag">⚡ รอบ Tiebreak</span>` : '';

      viewRoot.innerHTML = `
        <div class="glass-card">
          ${tiebreakBadge}
          <div style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600; margin-bottom: 8px;">
            ${roundTitle}
          </div>

          <div style="font-size: 1.15rem; font-weight: 700; margin-bottom: 12px; color: var(--accent-cyan);">
            📱 ส่งต่ออุปกรณ์ให้
          </div>

          <div class="player-hero-avatar" style="background: ${curPlayer.color}22; border-color: ${curPlayer.color};">
            ${curPlayer.avatar}
          </div>

          <div class="player-hero-name" style="color: ${curPlayer.color};">
            ${escapeHtml(curPlayer.name)}
          </div>

          <p style="color: var(--text-muted); font-size: 0.88rem; margin: 16px 0;">
            คุณจะได้รับโอกาสวัดพลัง <strong>3 ครั้ง (สปีด 1.5x)</strong> เพื่อสะสมคะแนนเต็ม 30.00
          </p>

          <button id="btn-primary-action" class="btn-primary" data-act="beginPlayerTurn">
            แตะเพื่อเริ่มตาของฉัน ➔
          </button>
        </div>
      `;
      announceSR(`ส่งต่ออุปกรณ์ให้ ${curPlayer.name}`);
    }

    function beginPlayerTurn() {
      soundSynth.playClick(600);
      game.currentAttempt = 1;
      game.state = GameState.ATTEMPT_READY;
      renderUI();
    }

    /* --- VIEW 4: ATTEMPT (READY / RUNNING / RESULT) --- */
    function renderAttemptView() {
      const curPlayer = getCurrentActivePlayer();
      const attemptNum = game.currentAttempt;
      const roundTitle = game.isTiebreak ? `รอบ Tiebreak (${game.currentRoundNumber})` : `รอบที่ ${game.currentRoundNumber}`;

      let dotsHtml = '';
      for (let i = 1; i <= 3; i++) {
        let cls = '';
        if (i < attemptNum) cls = 'done';
        else if (i === attemptNum) cls = 'active';
        dotsHtml += `
          <div class="attempt-dot ${cls}">
            <div class="dot-pill"></div>
            <span>ครั้งที่ ${i}</span>
          </div>
        `;
      }

      let buttonContent = '';
      let scoreRevealHtml = '';

      if (game.state === GameState.ATTEMPT_READY) {
        buttonContent = `
          <button id="main-tap-btn" class="tap-action-surface" data-act="startMeter" aria-label="แตะเพื่อเริ่มปล่อยเกจ">
            <span class="tap-main-text">🚀 แตะเพื่อเริ่ม</span>
            <span class="tap-sub-text">แตะเพื่อปล่อยเกจวัดพลัง (หรือกด Spacebar / Enter)</span>
          </button>
        `;
      } else if (game.state === GameState.ATTEMPT_RUNNING) {
        buttonContent = `
          <button id="main-tap-btn" class="tap-action-surface running" data-act="stopMeter" aria-label="แตะเพื่อหยุดเกจ">
            <span class="tap-main-text">🛑 แตะเพื่อหยุด!</span>
            <span class="tap-sub-text">หยุดที่จุดสูงสุด 10.00 ให้ได้! (หรือกด Spacebar / Enter)</span>
          </button>
        `;
      } else if (game.state === GameState.ATTEMPT_RESULT) {
        const valHundredths = game.meter.lockedScoreHundredths;
        const displayScore = formatScore(valHundredths);
        let scoreClass = 'score-mid';
        let comment = 'ยอดเยี่ยม!';

        if (valHundredths === 1000) {
          scoreClass = 'score-perfect';
          comment = '🌟 PERFECT 10.00 เต็มหลอด!';
        } else if (valHundredths >= 900) {
          scoreClass = 'score-high';
          comment = '🔥 พลังสูงมาก สุดยอด!';
        } else if (valHundredths >= 700) {
          scoreClass = 'score-high';
          comment = '👍 ยอดเยี่ยม!';
        } else if (valHundredths >= 400) {
          scoreClass = 'score-mid';
          comment = '⚡ ปานกลาง';
        } else {
          scoreClass = 'score-low';
          comment = '💥 วืดไปนิด สู้ต่อ!';
        }

        scoreRevealHtml = `
          <div class="result-score-box">
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 2px;">ผลครั้งที่ ${attemptNum}</div>
            <div class="score-number ${scoreClass}">${displayScore}</div>
            <div class="score-comment">${comment}</div>
          </div>
        `;

        const isLastAttempt = (attemptNum === 3);
        const nextActionText = isLastAttempt ? 'ดูผลคะแนนรวม ➔' : `ไปต่อครั้งที่ ${attemptNum + 1} ➔`;

        buttonContent = `
          <button id="btn-primary-action" class="btn-primary" data-act="proceedToNextAttempt">
            ${nextActionText}
          </button>
        `;
      }

      viewRoot.innerHTML = `
        <div class="glass-card">
          <!-- Header Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${roundTitle}</span>
            <span style="font-size: 0.95rem; font-weight: 700; color: ${curPlayer.color};">${curPlayer.avatar} ${escapeHtml(curPlayer.name)}</span>
          </div>

          <!-- Attempt tracker -->
          <div class="attempt-dots">
            ${dotsHtml}
          </div>

          <!-- Arcade Power Gauge -->
          <div class="meter-arena">
            <div class="gauge-wrapper">
              <div class="gauge-track">
                <div id="gauge-fill-bar" class="gauge-fill" style="height: ${getGaugeHeightPercent()}%;"></div>
              </div>
              <div class="gauge-ticks">
                <div class="tick-label peak"><div class="tick-line"></div> 10.00 (PEAK)</div>
                <div class="tick-label mid"><div class="tick-line"></div> 5.00</div>
                <div class="tick-label base"><div class="tick-line"></div> 0.00</div>
              </div>
            </div>
          </div>

          ${scoreRevealHtml}
          ${buttonContent}
        </div>
      `;
    }

    function getGaugeHeightPercent() {
      if (game.state === GameState.ATTEMPT_RESULT && game.meter.lockedScoreHundredths !== null) {
        return game.meter.lockedScoreHundredths / 10; // 0..1000 maps to 0..100%
      }
      return game.meter.currentValueHundredths / 10;
    }

    /* ==========================================================================
       6. METER TIMING ENGINE & MOTION ACCELERATION MODEL (1.5x SPEED)
       ========================================================================== */
    /**
     * Easing Timing Model (1.5x Speed):
     * - Total upward duration: ~1460ms
     * - Progress = Math.pow(elapsed / durationUp, 2.0)
     *   - 0.00 to 5.00 is readable
     *   - 5.00 to 8.00 is noticeably fast
     *   - 8.00 to 10.00 is hyper fast & tense
     * - At peak 10.00: Reverses direction immediately if not tapped
     * - Downward phase: ~560ms (very rapid drop)
     * - Downward Progress = Math.min(1.0, elapsedDown / durationDown)
     *   Value = (1.0 - Math.pow(progressDown, 1.25)) * 1000
     */
    function startMeter() {
      if (game.state !== GameState.ATTEMPT_READY) return;
      game.state = GameState.ATTEMPT_RUNNING;
      game.meter.startTime = performance.now();
      game.meter.isFalling = false;
      game.meter.currentValueHundredths = 0;
      game.meter.lockedScoreHundredths = null;

      soundSynth.startMeterHum();
      renderAttemptView();
      // Also bypasses renderUI. The only control it draws is the excepted meter button, so this arms
      // nothing today -- it is here so a button added to the running view later cannot ship ungated.
      armRenderedView();

      const gaugeFill = document.getElementById('gauge-fill-bar');

      // ADR-0046, and this is the line that decides whether the reduce query removes the game. The
      // meter's VALUE is recomputed every frame below, off performance.now() -- so the score a player
      // locks, and the score the result card then renders, are identical with or without the setting.
      // Only the repaint of the bar is throttled: the gauge steps a handful of times a second instead
      // of gliding. Freezing or hiding it would take the mechanic away, which ADR-0046 rejects.
      let nextGaugePaintAt = 0;

      function meterLoop(now) {
        if (game.state !== GameState.ATTEMPT_RUNNING) return;

        const reduced = prefersReducedMotion();
        const paintGauge = !reduced || now >= nextGaugePaintAt;
        if (reduced && paintGauge) nextGaugePaintAt = now + REDUCED_PAINT_MS;

        const elapsed = now - game.meter.startTime;
        const T_up = game.meter.durationUpMs;
        const T_down = game.meter.durationDownMs;

        if (elapsed <= T_up) {
          // UPWARD PHASE (Accelerating 1.5x)
          game.meter.isFalling = false;
          const progressNorm = Math.min(1.0, elapsed / T_up);
          const easedProgress = Math.pow(progressNorm, 2.0);
          game.meter.currentValueHundredths = Math.min(1000, Math.round(easedProgress * 1000));

          soundSynth.updateMeterHum(easedProgress, false);

          if (gaugeFill && paintGauge) {
            gaugeFill.style.height = `${game.meter.currentValueHundredths / 10}%`;
            if (game.meter.currentValueHundredths >= 980) {
              gaugeFill.classList.add('peak-active');
            } else {
              gaugeFill.classList.remove('peak-active');
            }
          }
        } else {
          // DOWNWARD PHASE (Fast drop)
          game.meter.isFalling = true;
          const elapsedDown = elapsed - T_up;
          const progressDown = Math.min(1.0, elapsedDown / T_down);
          const easedDown = 1.0 - Math.pow(progressDown, 1.25);
          game.meter.currentValueHundredths = Math.max(0, Math.round(easedDown * 1000));

          soundSynth.updateMeterHum(easedDown, true);

          if (gaugeFill && paintGauge) {
            gaugeFill.style.height = `${game.meter.currentValueHundredths / 10}%`;
            gaugeFill.classList.remove('peak-active');
          }

          // If reached 0.00 without tap, auto-lock at 0
          if (progressDown >= 1.0) {
            stopMeter();
            return;
          }
        }

        game.meter.rafId = requestAnimationFrame(meterLoop);
      }

      game.meter.rafId = requestAnimationFrame(meterLoop);
    }

    function stopMeter() {
      if (game.state !== GameState.ATTEMPT_RUNNING) return;
      if (game.meter.rafId) {
        cancelAnimationFrame(game.meter.rafId);
        game.meter.rafId = null;
      }

      // Lock current score in hundredths (0..1000)
      const lockedHundredths = Math.max(0, Math.min(1000, game.meter.currentValueHundredths));
      game.meter.lockedScoreHundredths = lockedHundredths;
      game.state = GameState.ATTEMPT_RESULT;

      // Record in current player results
      const curPlayer = getCurrentActivePlayer();
      const playerRes = game.roundResults.get(curPlayer.id);
      playerRes.attempts[game.currentAttempt - 1] = lockedHundredths;
      playerRes.totalHundredths = sumAttempts(playerRes.attempts);

      // Sound & Screen Trauma Feedback
      soundSynth.playLockScore(lockedHundredths);

      if (lockedHundredths === 1000) {
        addTrauma(0.9);
        spawnSparkles(window.innerWidth / 2, window.innerHeight * 0.4, 40, '#ffd700');
      } else if (lockedHundredths >= 800) {
        addTrauma(0.5);
        spawnSparkles(window.innerWidth / 2, window.innerHeight * 0.4, 25, '#00f2fe');
      } else if (lockedHundredths <= 200) {
        addTrauma(0.6);
      } else {
        addTrauma(0.3);
      }

      renderAttemptView();
      // Bypasses renderUI, so it arms for itself. This is the sharpest ghost tap on the route: the
      // player just tapped to stop the meter and the "next attempt" button lands under that finger.
      armRenderedView();
      announceSR(`ผลครั้งที่ ${game.currentAttempt}: ได้ ${formatScore(lockedHundredths)} คะแนน`);
    }

    function proceedToNextAttempt() {
      soundSynth.playClick(550);
      if (game.currentAttempt < 3) {
        game.currentAttempt++;
        game.state = GameState.ATTEMPT_READY;
        game.meter.currentValueHundredths = 0;
        game.meter.lockedScoreHundredths = null;
        renderUI();
      } else {
        // Player completed 3 attempts
        game.state = GameState.PLAYER_ROUND_RESULT;
        renderUI();
      }
    }

    /* --- VIEW 5: PLAYER ROUND RESULT --- */
    function renderPlayerRoundResultView() {
      const curPlayer = getCurrentActivePlayer();
      const res = game.roundResults.get(curPlayer.id);
      const isLastPlayer = (game.currentTurnIndex === game.activePlayerIds.length - 1);
      const nextBtnText = isLastPlayer ? '📊 ดูผลสรุปของรอบนี้ ➔' : '📱 ส่งต่อให้ผู้เล่นถัดไป ➔';

      viewRoot.innerHTML = `
        <div class="glass-card">
          <div class="player-hero-avatar" style="background: ${curPlayer.color}22; border-color: ${curPlayer.color};">
            ${curPlayer.avatar}
          </div>
          <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 4px; color: ${curPlayer.color};">
            ${escapeHtml(curPlayer.name)}
          </h2>
          <div style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 16px;">
            สรุปผลคะแนน 3 ครั้งของคุณ
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;">
            <div style="background: rgba(255,255,255,0.05); padding: 12px 6px; border-radius: 12px;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">ครั้งที่ 1</div>
              <div style="font-family: var(--font-mono); font-size: 1.25rem; font-weight: 800;">${formatScore(res.attempts[0])}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px 6px; border-radius: 12px;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">ครั้งที่ 2</div>
              <div style="font-family: var(--font-mono); font-size: 1.25rem; font-weight: 800;">${formatScore(res.attempts[1])}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px 6px; border-radius: 12px;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">ครั้งที่ 3</div>
              <div style="font-family: var(--font-mono); font-size: 1.25rem; font-weight: 800;">${formatScore(res.attempts[2])}</div>
            </div>
          </div>

          <div style="background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 16px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 0.88rem; color: var(--accent-cyan); font-weight: 600;">คะแนนรวม (เต็ม 30.00)</div>
            <div style="font-family: var(--font-mono); font-size: 3rem; font-weight: 900; color: #fff; line-height: 1.1;">
              ${formatScore(res.totalHundredths)}
            </div>
          </div>

          <button id="btn-primary-action" class="btn-primary" data-act="proceedToNextPlayer">
            ${nextBtnText}
          </button>
        </div>
      `;
      announceSR(`${curPlayer.name} ได้คะแนนรวม ${formatScore(res.totalHundredths)} จาก 30.00`);
    }

    function proceedToNextPlayer() {
      soundSynth.playClick(620);
      if (game.currentTurnIndex < game.activePlayerIds.length - 1) {
        // Next player in this round
        game.currentTurnIndex++;
        game.state = GameState.TURN_INTRO;
        renderUI();
      } else {
        // All active players finished this round -> Round Summary
        game.state = GameState.ROUND_SUMMARY;
        renderUI();
      }
    }

    /* --- VIEW 6: ROUND SUMMARY & TIEBREAK LOGIC --- */
    function renderRoundSummaryView() {
      const activeResults = game.activePlayerIds.map(pid => {
        const p = game.players.find(item => item.id === pid);
        const r = game.roundResults.get(pid);
        return {
          playerId: pid,
          name: p.name,
          avatar: p.avatar,
          color: p.color,
          attempts: r.attempts,
          totalHundredths: r.totalHundredths
        };
      });

      // Run pure elimination logic
      const outcome = evaluateRoundElimination(activeResults);
      game.lastEvaluatedOutcome = outcome;

      let listHtml = '';
      activeResults.forEach(item => {
        const isLowest = (item.totalHundredths === outcome.minTotalHundredths);
        let statusBadge = '';
        let rowClass = '';

        if (outcome.isFinished) {
          if (isLowest) {
            statusBadge = `<span class="status-badge status-danger">💀 ผู้แพ้</span>`;
            rowClass = 'is-lowest';
          } else {
            statusBadge = `<span class="status-badge status-safe">🛡️ รอด</span>`;
            rowClass = 'is-safe';
          }
        } else {
          // Tiebreak situation
          if (isLowest) {
            statusBadge = `<span class="status-badge status-danger">⚡ เข้า Tiebreak</span>`;
            rowClass = 'is-lowest';
          } else {
            statusBadge = `<span class="status-badge status-safe">🛡️ รอด (ปลอดภัย)</span>`;
            rowClass = 'is-safe';
          }
        }

        const breakdown = item.attempts.map(a => formatScore(a)).join(' + ');

        listHtml += `
          <div class="summary-item ${rowClass}">
            <div class="summary-left">
              <div class="avatar-badge" style="border: 2px solid ${item.color};">${item.avatar}</div>
              <div>
                <div style="font-weight: 700; color: ${item.color};">${escapeHtml(item.name)}</div>
                <div class="summary-score-breakdown">${breakdown}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div class="summary-total">${formatScore(item.totalHundredths)}</div>
              ${statusBadge}
            </div>
          </div>
        `;
      });

      let footerActionHtml = '';
      let roundHeaderMsg = '';

      if (outcome.isFinished) {
        roundHeaderMsg = `<div style="color: var(--accent-red); font-weight: 800; font-size: 1.1rem; margin-bottom: 8px;">🚨 ได้ตัวผู้แพ้แล้ว!</div>`;
        footerActionHtml = `
          <button id="btn-primary-action" class="btn-primary btn-danger" data-act="proceedToFinalLoser">
            ดูประกาศผู้แพ้ ➔
          </button>
        `;
      } else {
        soundSynth.playTiebreakAlert();
        const tiedCount = outcome.tiedPlayerIds.length;
        roundHeaderMsg = `
          <div style="color: var(--accent-yellow); font-weight: 800; font-size: 1.05rem; margin-bottom: 8px;">
            ⚡ คะแนนต่ำสุดเท่ากัน (${formatScore(outcome.minTotalHundredths)}) ${tiedCount} คน!
          </div>
        `;
        footerActionHtml = `
          <button id="btn-primary-action" class="btn-primary" data-act="proceedToTiebreakIntro">
            เข้าสู่รอบ Tiebreak ตัดสิน ➔
          </button>
        `;
      }

      viewRoot.innerHTML = `
        <div class="glass-card">
          <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 4px;">📊 สรุปคะแนน</h2>
          ${roundHeaderMsg}

          <div class="summary-list">
            ${listHtml}
          </div>

          ${footerActionHtml}
        </div>
      `;
      announceSR("หน้าสรุปคะแนนประจำรอบ");
    }

    function proceedToFinalLoser() {
      soundSynth.playClick(650);
      game.state = GameState.FINAL_LOSER;
      renderUI();
    }

    function proceedToTiebreakIntro() {
      soundSynth.playClick(650);
      game.state = GameState.TIEBREAK_INTRO;
      renderUI();
    }

    /* --- VIEW 7: TIEBREAK INTRO --- */
    function renderTiebreakIntroView() {
      const outcome = game.lastEvaluatedOutcome;
      const tiedPlayers = outcome.tiedPlayerIds.map(pid => game.players.find(p => p.id === pid));

      let avatarsHtml = '';
      tiedPlayers.forEach(p => {
        avatarsHtml += `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <div class="avatar-badge" style="width: 52px; height: 52px; font-size: 1.8rem; border: 2px solid ${p.color};">
              ${p.avatar}
            </div>
            <span style="font-size: 0.88rem; font-weight: 700; color: ${p.color};">${escapeHtml(p.name)}</span>
          </div>
        `;
      });

      viewRoot.innerHTML = `
        <div class="glass-card">
          <span class="turn-badge tiebreak-tag">⚡ รอบ Tiebreak ตัดสิน</span>
          <h2 style="font-size: 1.5rem; font-weight: 900; margin: 8px 0; color: var(--accent-red);">
            ศึกชิงหนีความพ่ายแพ้!
          </h2>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 20px;">
            ผู้เล่นต่อไปนี้มีคะแนนรวมต่ำสุดเท่ากัน (${formatScore(outcome.minTotalHundredths)}) จึงต้องแข่งขันใหม่คนละ 3 ครั้ง
          </p>

          <div style="display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; margin-bottom: 24px;">
            ${avatarsHtml}
          </div>

          <p style="color: var(--accent-green); font-size: 0.82rem; margin-bottom: 16px;">
            🛡️ ผู้เล่นคนอื่นที่คะแนนสูงกว่า ปลอดภัยแล้ว ไม่ต้องแข่งรอบนี้
          </p>

          <button id="btn-primary-action" class="btn-primary btn-danger" data-act="startTiebreakRound">
            เริ่มรอบ Tiebreak ➔
          </button>
        </div>
      `;
      announceSR("รอบ Tiebreak ตัดสินผู้เล่นที่เสมอกัน");
    }

    function startTiebreakRound() {
      soundSynth.playClick(720);
      const outcome = game.lastEvaluatedOutcome;

      // Active players become only tied players
      game.activePlayerIds = [...outcome.tiedPlayerIds];
      game.currentTurnIndex = 0;
      game.currentAttempt = 1;
      game.currentRoundNumber++;
      game.isTiebreak = true;

      // Reset attempt scores for tiebreak players
      game.roundResults = new Map();
      game.activePlayerIds.forEach(pid => {
        game.roundResults.set(pid, { attempts: [0, 0, 0], totalHundredths: 0 });
      });

      game.state = GameState.TURN_INTRO;
      renderUI();
    }

    /* --- VIEW 8: FINAL LOSER --- */
    function renderFinalLoserView() {
      const loserId = game.lastEvaluatedOutcome.loserPlayerId;
      const loserPlayer = game.players.find(p => p.id === loserId);
      const loserResult = game.roundResults.get(loserId);

      soundSynth.playLoserDefeat();
      addTrauma(0.8);

      viewRoot.innerHTML = `
        <div class="glass-card loser-crown-card">
          <div class="skull-icon">👑💀</div>
          <div style="font-size: 0.95rem; font-weight: 800; color: var(--accent-red); letter-spacing: 1px; text-transform: uppercase;">
            ผู้แพ้ประจำเกมนี้คือ
          </div>

          <div class="player-hero-avatar" style="background: ${loserPlayer.color}33; border-color: var(--accent-red); margin: 12px auto;">
            ${loserPlayer.avatar}
          </div>

          <h1 style="font-size: 2rem; font-weight: 900; color: #fff; margin-bottom: 4px;">
            ${escapeHtml(loserPlayer.name)}
          </h1>

          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 20px;">
            คะแนนรอบสุดท้าย: <strong style="color: var(--accent-red); font-family: var(--font-mono); font-size: 1.2rem;">${formatScore(loserResult.totalHundredths)}</strong> / 30.00
          </p>

          <button id="btn-primary-action" class="btn-primary" data-act="replaySamePlayers">
            🔄 เล่นอีกครั้ง (ผู้เล่นเดิม)
          </button>
          <button class="btn-secondary" data-act="resetToSetup">
            ⚙️ ตั้งค่าใหม่ / เปลี่ยนผู้เล่น
          </button>
        </div>
      `;
      announceSR(`ผู้แพ้คือ ${loserPlayer.name}`);
    }

    function replaySamePlayers() {
      soundSynth.playClick(650);
      game.activePlayerIds = game.players.map(p => p.id);
      game.currentTurnIndex = 0;
      game.currentAttempt = 1;
      game.currentRoundNumber = 1;
      game.isTiebreak = false;
      game.roundResults = new Map();
      game.activePlayerIds.forEach(id => {
        game.roundResults.set(id, { attempts: [0, 0, 0], totalHundredths: 0 });
      });

      game.state = GameState.TURN_INTRO;
      renderUI();
    }

    function resetToSetup() {
      soundSynth.playClick(500);
      game.state = GameState.SETUP_COUNT;
      renderUI();
    }

    /* ==========================================================================
       7. HARD GUARDRAILS, INPUT & EVENT LISTENERS
       ========================================================================== */

    // Tab / Window Focus Loss Guard:
    // If browser tab loses focus during an active attempt, cancel and reset attempt safely.
    window.addEventListener('blur', () => {
      if (game.state === GameState.ATTEMPT_RUNNING) {
        if (game.meter.rafId) {
          cancelAnimationFrame(game.meter.rafId);
          game.meter.rafId = null;
        }
        soundSynth.stopMeterHum();
        game.state = GameState.ATTEMPT_READY;
        game.meter.currentValueHundredths = 0;
        game.meter.lockedScoreHundredths = null;
        renderUI();
        showToast("⚠️ สลับหน้าจอ: รีเซ็ตครั้งนี้ใหม่เพื่อความยุติธรรม");
      }
    });

    // Global Keyboard Interaction (Spacebar / Enter to Start/Stop or trigger primary action)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        const activeElement = document.activeElement;
        // Avoid intercepting when user is typing in input fields
        if (activeElement && activeElement.tagName === 'INPUT') return;

        if (game.state === GameState.ATTEMPT_READY) {
          e.preventDefault();
          startMeter();
        } else if (game.state === GameState.ATTEMPT_RUNNING) {
          e.preventDefault();
          stopMeter();
        } else {
          // If a primary button exists and no other button is actively focused
          if (!activeElement || activeElement.tagName !== 'BUTTON') {
            const primaryBtn = document.getElementById('btn-primary-action');
            if (primaryBtn) {
              e.preventDefault();
              primaryBtn.click();
            }
          }
        }
      }
    });

    // Audio Toggle Button
    const btnAudioToggle = document.getElementById('btn-audio-toggle');
    btnAudioToggle.addEventListener('click', () => {
      const isEnabled = soundSynth.toggleAudio();
      btnAudioToggle.textContent = isEnabled ? '🔊' : '🔇';
      showToast(isEnabled ? 'เปิดเสียงแล้ว' : 'ปิดเสียงแล้ว');
    });
    btnAudioToggle.textContent = soundSynth.enabled ? '🔊' : '🔇';

    // Modal Helpers
    //
    // The modals get their OWN arm slot, not armRenderedView()'s. #btn-help-modal and
    // #btn-tests-modal live in the header, outside #view-root, so they are never gated and can be
    // tapped while a freshly rendered view is still inside its window. Sharing one slot would let
    // that tap cancel the pending view arm, and the canceller does not re-enable -- the view's
    // buttons would stay disabled until a renderUI() that only those buttons could trigger.
    let disarmModal = null;

    /** Arms the modal just revealed (ADR-0017): a double-tap on the header icon that opens it lands
     *  its second contact on the close button the reveal put under the finger. */
    function openModal(id) {
      soundSynth.playClick(500);
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.add('active');
      if (disarmModal) disarmModal();
      disarmModal = armAllButtons(modal);
    }
    function closeModal(id) {
      soundSynth.playClick(400);
      document.getElementById(id).classList.remove('active');
    }

    document.getElementById('btn-help-modal').addEventListener('click', () => openModal('help-modal'));
    document.getElementById('btn-tests-modal').addEventListener('click', () => {
      openModal('tests-modal');
      runAllDeterministicTests();
    });

    /* --- INLINE HANDLER REPLACEMENT (CSP) ---
       The mockup carried 18 inline `on*` attributes. This site serves `script-src 'self'` with no
       'unsafe-inline' (ADR-0005), so every one of them is dead HTML here — the button renders and
       does nothing. Each is now a `data-act` attribute (plus `data-arg` where the original passed a
       value) dispatched by the two delegated listeners below.

       DELEGATED ON `document`, not bound per render: renderUI() replaces #view-root's innerHTML on
       every state change, so a per-render bind would have to be re-run inside each of the eight view
       builders and one missed call is a silently dead button. Delegation binds once and covers the
       modals in markup.html too, which live outside #view-root. Behaviour is unchanged: same
       functions, same arguments, same click that triggered them — only the dispatch point moved from
       the element to the document, one bubble step later in the same event. */
    // gh#175. The reset overwrites every typed name, so it hides behind #reset-names-modal rather
    // than firing straight off the trigger, and the modal's own copy in markup.html names every loss
    // that causes (docs/agents/src-edit-rules.md). Do NOT read primary-before-secondary button order
    // as what protects it: openModal() arms every control the modal reveals, which disables the
    // autofocused element and drops focus to <body>, so nothing is focused by the time a held tap
    // from opening the modal could land -- the 400ms arm window is the guard, not the markup order.
    const openResetNamesModal = () => openModal('reset-names-modal');
    const confirmResetNames = () => {
      closeModal('reset-names-modal');
      soundSynth.playClick(420);
      resetPlayerNames();
      // renderUI() re-renders #view-root (still SETUP_NAMES) and calls armRenderedView() itself --
      // the same re-arm every state change already gets. Without it the rebuilt name inputs would
      // land live under a double-tap on the confirm; here they come back re-armed like every other
      // rebuild in this file.
      renderUI();
    };

    const clickActions = {
      selectPlayerCount: (el) => selectPlayerCount(Number(el.dataset.arg)),
      closeModal: (el) => closeModal(el.dataset.arg),
      goToSetupNames,
      backToSetupCount,
      startNewMatch,
      openResetNamesModal,
      confirmResetNames,
      beginPlayerTurn,
      startMeter,
      stopMeter,
      proceedToNextAttempt,
      proceedToNextPlayer,
      proceedToFinalLoser,
      proceedToTiebreakIntro,
      startTiebreakRound,
      replaySamePlayers,
      resetToSetup,
      runAllDeterministicTests
    };

    document.addEventListener('click', (e) => {
      // `closest?.` because e.target is not guaranteed to be an Element for every dispatch.
      const el = e.target.closest?.('[data-act]');
      if (!el) return;
      const action = clickActions[el.dataset.act];
      if (action) action(el);
    });

    document.addEventListener('input', (e) => {
      const el = e.target.closest?.('[data-act="updatePlayerName"]');
      if (!el) return;
      updatePlayerName(Number(el.dataset.arg), el.value);
    });

    /* ==========================================================================
       8. DETERMINISTIC UNIT TESTS (BUILT-IN SPEC VERIFICATION - 2 DECIMALS)
       ========================================================================== */
    function runAllDeterministicTests() {
      const log = [];
      let passed = 0;
      let total = 0;

      function assert(condition, name) {
        total++;
        if (condition) {
          passed++;
          log.push(`✅ PASS: ${name}`);
        } else {
          log.push(`❌ FAIL: ${name}`);
        }
      }

      // Test 1: Unique lowest (2 decimal format)
      // A=24.20 (2420), B=19.80 (1980), C=23.30 (2330) => B is final loser
      const t1 = evaluateRoundElimination([
        { playerId: 'A', totalHundredths: 2420 },
        { playerId: 'B', totalHundredths: 1980 },
        { playerId: 'C', totalHundredths: 2330 }
      ]);
      assert(t1.isFinished === true && t1.loserPlayerId === 'B', "Test 1: Unique lowest -> B is final loser");

      // Test 2: Two-way tie
      // A=2420, B=1980, C=1980, D=2510 => Tied B & C
      const t2 = evaluateRoundElimination([
        { playerId: 'A', totalHundredths: 2420 },
        { playerId: 'B', totalHundredths: 1980 },
        { playerId: 'C', totalHundredths: 1980 },
        { playerId: 'D', totalHundredths: 2510 }
      ]);
      assert(t2.isFinished === false && t2.tiedPlayerIds.length === 2 && t2.tiedPlayerIds.includes('B') && t2.tiedPlayerIds.includes('C'), "Test 2: Two-way tie -> B and C advance to tiebreak");

      // Test 3: Three-way tie
      // A=2100, B=1900, C=1900, D=1900 => Tied B, C, D
      const t3 = evaluateRoundElimination([
        { playerId: 'A', totalHundredths: 2100 },
        { playerId: 'B', totalHundredths: 1900 },
        { playerId: 'C', totalHundredths: 1900 },
        { playerId: 'D', totalHundredths: 1900 }
      ]);
      assert(t3.isFinished === false && t3.tiedPlayerIds.length === 3 && !t3.tiedPlayerIds.includes('A'), "Test 3: Three-way tie -> B, C, D advance, A is safe");

      // Test 4: Everyone ties
      // A=2200, B=2200, C=2200 => All three advance
      const t4 = evaluateRoundElimination([
        { playerId: 'A', totalHundredths: 2200 },
        { playerId: 'B', totalHundredths: 2200 },
        { playerId: 'C', totalHundredths: 2200 }
      ]);
      assert(t4.isFinished === false && t4.tiedPlayerIds.length === 3, "Test 4: Everyone ties -> All advance to tiebreak");

      // Test 5: Recursive tiebreak simulation
      // Round 1: B=1980, C=1980 (Tie)
      // Tiebreak 1: B=2415, C=2415 (Tie again)
      // Tiebreak 2: B=2600, C=2195 => C is final loser
      const r1 = evaluateRoundElimination([{ playerId: 'B', totalHundredths: 1980 }, { playerId: 'C', totalHundredths: 1980 }]);
      const tb1 = evaluateRoundElimination([{ playerId: 'B', totalHundredths: 2415 }, { playerId: 'C', totalHundredths: 2415 }]);
      const tb2 = evaluateRoundElimination([{ playerId: 'B', totalHundredths: 2600 }, { playerId: 'C', totalHundredths: 2195 }]);
      assert(!r1.isFinished && !tb1.isFinished && tb2.isFinished && tb2.loserPlayerId === 'C', "Test 5: Recursive tiebreak -> Resolves accurately to loser C");

      // Test 6: Attempt summation (2 decimal places)
      // 8.73 + 9.55 + 6.20 = 24.48 (873 + 955 + 620 = 2448)
      const sum1 = sumAttempts([873, 955, 620]);
      assert(sum1 === 2448 && formatScore(sum1) === "24.48", "Test 6: Attempt summation 8.73+9.55+6.20 = 24.48");

      // Test 7: Perfect attempts
      // 10.00 + 10.00 + 10.00 = 30.00 (1000 + 1000 + 1000 = 3000)
      const sum2 = sumAttempts([1000, 1000, 1000]);
      assert(sum2 === 3000 && formatScore(sum2) === "30.00", "Test 7: Perfect attempts 10.00+10.00+10.00 = 30.00");

      const resultsDiv = document.getElementById('test-results-container');
      if (resultsDiv) {
        resultsDiv.innerHTML = `<strong>ผลการทดสอบ (2 ตำแหน่ง): ${passed}/${total} ผ่านทั้งหมด</strong><br><br>` + log.join('<br>');
      }
      return { passed, total, log };
    }

    // Auto-run tests in background on load
    const testSummary = runAllDeterministicTests();
    console.log("Deterministic Test Suite Results (2 Decimals):", testSummary);

    // Initial View Render
    renderUI();
