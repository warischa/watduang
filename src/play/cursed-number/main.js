// LIFTED from ~/claude/mockup-games/cursed-number/index.html by scripts/extract-mockup.mjs, then
// adapted for this site. What changed, and why, is recorded here because every other line is the
// mockup's own:
//
//   1. The mockup's twenty-row MASCOT_PLAYERS literal is GONE. The cast is single-sourced in
//      src/play/_mascots.ts (gh#152, ADR-0054) and the mockup's own list disagreed with it, so
//      keeping the literal would have shipped a second cast. The rule that consumed it moved out
//      with it -- see item 2.
//   2. CursedNumberGameModel is imported from src/games/cursed-number.ts instead of declared here.
//      One implementation, reachable by a node test. The mockup's in-page assertion runner, its
//      header button and its modal were DELETED rather than hidden -- see the note where the
//      function used to sit; its cases live in src/games/cursed-number.test.mjs now.
//   3. ParticleEngine no longer assumes a canvas or a 2D context exists (ADR-0051: a play route
//      never blanks the page).
//   4. A prefers-reduced-motion branch was added, because the mockup had none (ADR-0046: reduce the
//      motion, do not remove it).
//
// THE CAST IS SUPPLIED FROM HERE, not read by the engine. gh#140 keeps the shared animal list out of
// src/games entirely -- a test in src/shell/player-setup.test.mjs scans every file under that folder
// for it -- so identity is injected into the model as plain seat data and the engine holds no
// knowledge that a cast exists. This file is on the play side, where the import is allowed.
//
// The .ts extension is spelled out in full, the way manifest.ts does it.
import { CursedNumberGameModel } from '../../games/cursed-number.ts';
import { MASCOTS } from '../_mascots.ts';
// Ghost-tap gate (ADR-0014/ADR-0017). This route never rebuilds a stage: it reveals pre-existing
// markup, and it does so on EIGHT paths, each wired to armAllButtons at the reveal itself.
//   1. showScreen()  -- toggles `.screen.active`. Every screen-to-screen move.
//   2. the constructor -- screenSetup ships `active` in markup.html and never passes showScreen.
//   3. the rulesBtn handler -- `#rulesModal.classList.add('active')`, 2 buttons, no showScreen.
//   4. setInputMode() -- shows #sliderModeContainer / #keypadModeContainer by `style.display`
//      INSIDE a screen that is already up, so showScreen's call has long since armed and left.
//   5. the resetNamesBtn handler (gh#177) -- `#resetNamesModal.classList.add('active')`, 3 buttons,
//      and they land directly over the trigger that was just pressed.
//   6. the reset CONFIRM handler -- not a reveal by a class or a display write, which is why the
//      pattern in arm-reveal-paths.test.mjs cannot see it: closing the modal uncovers the setup
//      screen, whose own arming fired and left when the screen was shown. #screenSetup is re-armed
//      there. Two things need it: the count pills and #startGameBtn, which sit under the modal card,
//      and the name rows the reset itself rebuilds through innerHTML.
//   7. closeResetNames (gh#187) -- the close X and the cancel button. Same reveal as 6 without the
//      rebuild, which is the point: the rebuild was never the hazard, the modal closing is.
//   8. closeRules (gh#187) -- the same for #rulesModal, re-arming whichever screen is live.
// A fifth display toggle, #penaltyResultBox, contains no button and needs no call.
// This list is the coverage claim, and it is only true while it is complete: a new reveal path that
// does not appear here ships ungated, and scripts/arm-gate-coverage-check.mjs CANNOT catch that --
// it asks whether the route imports and calls armAllButtons at all, not whether every reveal does.
import { armAllButtons } from '../../games/_arm-gate.ts';


    /**
     * Web Audio Procedural Sound Synthesizer
     * 100% Self-Contained Zero External Audio Files
     */
    class SoundSynth {
      constructor() {
        this.ctx = null;
        this.enabled = true;
      }

      init() {
        if (!this.ctx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) this.ctx = new AudioContextClass();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }

      playClick(freq = 520) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.05);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.06);
      }

      playTick() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(750, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.03);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.035);
      }

      playHeartbeat(isUrgent = false) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isUrgent ? 85 : 65, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + (isUrgent ? 0.08 : 0.12));
        gain.gain.setValueAtTime(isUrgent ? 0.45 : 0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + (isUrgent ? 0.08 : 0.12));
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.13);
      }

      playDirectionChime(isHigher = true) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = isHigher ? [523.25, 659.25, 783.99, 1046.50] : [783.99, 659.25, 523.25, 392.00];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.05;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.18, st);
          gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.28);
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.start(st); osc.stop(st + 0.3);
        });
      }

      playCursedExplosion() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Sub bass drop
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(25, t + 0.9);
        oscGain.gain.setValueAtTime(0.65, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        osc.connect(oscGain); oscGain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.95);

        // Noise buffer
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.85);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);
        filter.frequency.exponentialRampToValueAtTime(60, t + 0.8);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.75, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

        whiteNoise.connect(filter); filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        whiteNoise.start(t); whiteNoise.stop(t + 0.85);
      }
    }

    /**
     * High-Performance 2D Canvas Particle Emitter & Screen Trauma
     */
    class ParticleEngine {
      constructor(canvasId, appWrapperId) {
        this.canvas = document.getElementById(canvasId);
        // ADR-0051: a play route never blanks the page. `canvas` can be absent and `getContext`
        // returns null on a device that refuses a 2D context -- the mockup assumed both and would
        // have thrown here, from the AppController constructor, before a single screen rendered.
        // `enabled` false means the decoration is gone and the round is untouched: every method
        // below returns early and the game is played entirely in DOM text.
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.enabled = Boolean(this.ctx);
        this.wrapper = document.getElementById(appWrapperId);
        this.particles = [];
        this.trauma = 0.0;
        this.ambientEmbers = [];
        this.lastDrawAt = 0;

        // ADR-0046: prefers-reduced-motion is a CSS media feature and does not reach anything drawn
        // from script, so it is read HERE, in the same file as the motion. The literal string is
        // what scripts/js-motion-guard-check.mjs looks for, and that gate now scans this route
        // directory too. CORRECTED 2026-08-31: this comment used to say the file was outside the
        // gate's glob. It no longer is -- and the sentence hid the mirror-image defect for months.
        // This query covers the CANVAS ONLY. It cannot opt a stylesheet out: the route's CSS-declared
        // transitions and keyframes are guarded by the @media (prefers-reduced-motion: reduce) block
        // in overrides.css, and neither guard substitutes for the other.
        this.motionQuery =
          typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
        this.reduceMotion = this.motionQuery ? this.motionQuery.matches : false;
        if (this.motionQuery && this.motionQuery.addEventListener) {
          // Mid-round switch: the setting can change while a round is being played.
          this.motionQuery.addEventListener('change', (ev) => {
            this.reduceMotion = ev.matches;
            this.initAmbient();
          });
        }

        if (!this.enabled) return;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initAmbient();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
      }

      resize() {
        if (!this.enabled) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }

      /** REDUCE, never remove. Under prefers-reduced-motion the canvas keeps drawing -- embers, every
       *  burst and the shake all still happen -- at a smaller AMPLITUDE: fewer particles, slower
       *  travel, a shake a few pixels wide instead of eighteen. Cadence is capped too, but that is
       *  the second half: gh#151 shipped a version that dropped only the write rate, which leaves a
       *  full-amplitude jump between frames and reads worse, not better. */
      amp(normal, reduced) {
        return this.reduceMotion ? reduced : normal;
      }

      initAmbient() {
        if (!this.enabled) return;
        this.ambientEmbers = [];
        const emberCount = this.amp(35, 12);
        const drift = this.amp(1, 0.35);
        for (let i = 0; i < emberCount; i++) {
          this.ambientEmbers.push({
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            size: Math.random() * 2.5 + 1,
            speedY: (Math.random() * 0.4 + 0.15) * drift,
            speedX: (Math.random() - 0.5) * 0.25 * drift,
            opacity: Math.random() * 0.5 + 0.2,
            hue: Math.random() > 0.5 ? 270 : 190
          });
        }
      }

      addTrauma(amount = 0.8) {
        this.trauma = Math.min(1.0, this.trauma + amount);
        if (navigator.vibrate) navigator.vibrate([80, 40, 150, 40, 300]);
      }

      spawnSafeSparkles(originX, originY) {
        if (!this.enabled) return;
        const x = originX || this.canvas.width / 2;
        const y = originY || this.canvas.height / 2;
        const count = this.amp(40, 16);
        const travel = this.amp(1, 0.35);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (Math.random() * 6 + 2) * travel;
          this.particles.push({
            type: 'sparkle',
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            gravity: 0.15,
            size: Math.random() * 4 + 2,
            life: 1.0,
            decay: (Math.random() * 0.02 + 0.02) * this.amp(1, 3),
            color: Math.random() > 0.4 ? '#38bdf8' : '#10b981'
          });
        }
      }

      spawnCursedDetonation(originX, originY) {
        if (!this.enabled) return;
        const x = originX || this.canvas.width / 2;
        const y = originY || this.canvas.height / 2;
        this.addTrauma(1.0);

        const count = this.amp(80, 28);
        const travel = this.amp(1, 0.35);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (Math.random() * 10 + 3) * travel;
          this.particles.push({
            type: 'fire',
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: 0.1,
            size: Math.random() * 7 + 3,
            life: 1.0,
            decay: (Math.random() * 0.025 + 0.015) * this.amp(1, 3),
            color: Math.random() > 0.5 ? '#ef4444' : (Math.random() > 0.5 ? '#f59e0b' : '#a855f7')
          });
        }
      }

      loop(now) {
        // rAF always re-arms, so the canvas is never abandoned. Under reduced motion the DRAW is
        // capped at roughly 20fps; at full motion `interval` is 0 and every frame paints.
        requestAnimationFrame(this.loop);
        const t = typeof now === 'number' ? now : 0;
        const interval = this.amp(0, 50);
        if (interval > 0 && t - this.lastDrawAt < interval) return;
        this.lastDrawAt = t;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update & Render Ambient Embers
        for (let ember of this.ambientEmbers) {
          ember.y -= ember.speedY;
          ember.x += ember.speedX;
          if (ember.y < -10) {
            ember.y = this.canvas.height + 10;
            ember.x = Math.random() * this.canvas.width;
          }
          this.ctx.fillStyle = `hsla(${ember.hue}, 80%, 70%, ${ember.opacity})`;
          this.ctx.beginPath();
          this.ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Update & Render Burst Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.life -= p.decay;
          if (p.life <= 0) {
            this.particles.splice(i, 1);
            continue;
          }
          p.x += p.vx;
          p.y += p.vy;
          if (p.gravity) p.vy += p.gravity;

          this.ctx.save();
          this.ctx.globalAlpha = Math.max(0, p.life);
          this.ctx.fillStyle = p.color;
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();
        }

        // Trauma Screen Shake
        if (!this.wrapper) {
          this.trauma = Math.max(0, this.trauma - 0.04);
        } else if (this.trauma > 0) {
          this.trauma = Math.max(0, this.trauma - 0.04);
          const shake = Math.pow(this.trauma, 2);
          const maxOffset = this.amp(18, 4);
          const offsetX = (Math.random() - 0.5) * maxOffset * shake;
          const offsetY = (Math.random() - 0.5) * maxOffset * shake;
          this.wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        } else {
          this.wrapper.style.transform = 'none';
        }
      }
    }


    /**
     * UI Controller & State Coordinator
     */
    class AppController {
      constructor() {
        this.sound = new SoundSynth();
        this.fx = new ParticleEngine('particlesCanvas', 'app');
        this.game = new CursedNumberGameModel(MASCOTS);
        
        this.currentScreen = 'screenSetup';
        this.inputMode = 'slider'; // 'slider' | 'keypad'
        this.keypadBuffer = '';

        this.bindEvents();
        this.renderCountPills();
        this.renderMascotsList();

        const first = document.getElementById(this.currentScreen);
        if (first) armAllButtons(first);
      }

      /** Speaks `text` into the route's live region. Nothing here may name the cursed number: the
       *  round only works while it is secret, and a live region is read out loud on the phone that
       *  is being passed around. Whose turn it is, and that a turn began, is all that is announced. */
      announce(text) {
        const live = document.getElementById('cn-live');
        if (live) live.textContent = text;
      }

      bindEvents() {
        // Top actions
        document.getElementById('soundToggleBtn').addEventListener('click', () => {
          this.sound.enabled = !this.sound.enabled;
          document.getElementById('soundToggleBtn').textContent = this.sound.enabled ? '🔊' : '🔇';
          if (this.sound.enabled) this.sound.playClick();
        });

        document.getElementById('rulesBtn').addEventListener('click', () => {
          this.sound.playClick();
          // A modal is a reveal path like any other (ADR-0017): this puts 2 buttons (closeRulesBtn,
          // rulesOkBtn) under the finger that just tapped rulesBtn, and the close control sits in
          // the same top-right corner rulesBtn does. armAllButtons is called on the revealed
          // element, not through showScreen -- showScreen never runs on this path.
          const modal = document.getElementById('rulesModal');
          modal.classList.add('active');
          armAllButtons(modal);
        });
        // Reveal path 7 (gh#187). CLOSING #rulesModal is itself a reveal: the screen under it was
        // armed when it was shown and its 400ms window expired long ago, so the second contact of a
        // double-tap on the close X -- which sits in the same top-right corner as rulesBtn -- lands
        // on whatever live control is there. Armed in one shared closer so neither branch can miss
        // it. `this.currentScreen` is the only record of which screen is live.
        const closeRules = () => {
          document.getElementById('rulesModal').classList.remove('active');
          const screen = document.getElementById(this.currentScreen);
          if (screen) armAllButtons(screen);
        };
        document.getElementById('closeRulesBtn').addEventListener('click', closeRules);
        document.getElementById('rulesOkBtn').addEventListener('click', () => {
          this.sound.playClick();
          closeRules();
        });

        document.getElementById('homeResetBtn').addEventListener('click', () => {
          this.sound.playClick();
          this.showScreen('screenSetup');
        });

        // Reset player names (gh#177). THREE controls on this route can be confused for one another,
        // so the split is deliberate and a player has to be able to predict which one costs them a
        // name. Two of them NAVIGATE and change nothing: #homeResetBtn above (the header house icon,
        // on every screen) and #editPlayersBtn (game over) both just show #screenSetup with the
        // roster intact. This one MUTATES. It is a third control rather than a behaviour bolted onto
        // either of those, because:
        //   - #homeResetBtn is an icon-only button reachable from mid-round on every screen. Wiping
        //     names from there would put the destruction one tap away with nothing on the control
        //     saying so, and its `Reset` is a mockup id no player ever sees -- the label they read is
        //     `กลับหน้าแรก`. The id is left alone on purpose; renaming it changes no behaviour.
        //   - #editPlayersBtn's label promises editing the names, which is the opposite of
        //     discarding them, and it is exactly the path a group takes to fix ONE name after a round.
        // What makes the three tellable apart is not the label alone: this is the only one that lives
        // on the setup screen beside the rows it rewrites, the only one whose label names what happens
        // to the names, and the only one that asks first. The control that asks is the control that
        // destroys.
        //
        // The copy in markup.html is short-stick's, reused verbatim (gh#174): every clause of it is
        // true here. Typed names go and do not come back -- updatePlayerName(i, '') clears rawName,
        // which is the only place a typed name is kept. The count survives: nothing here touches
        // playerCount, and renderMascotsList rebuilds only #mascotsListContainer. `กติกาที่ตั้งไว้`
        // survives too -- the penalty select and #customPenaltyInput are read at handleStartGame and
        // are outside everything this path writes.
        // Stated ceiling, deliberately NOT put in the copy: the device roster from ADR-0010 is a
        // different store. A reset leaves it alone, so a later visit can seed the old names back
        // through roster-bridge.ts. That is not a loss this confirm causes, and the rule names losses.
        // Shared closer, and the arming lives here rather than in the two listeners (gh#187):
        // dismissing the card IS the reveal. The count pills and #startGameBtn sit under it, still
        // enabled, their own gate long expired -- which is exactly why a second contact fires one.
        const closeResetNames = () => {
          document.getElementById('resetNamesModal').classList.remove('active');
          const setup = document.getElementById('screenSetup');
          if (setup) armAllButtons(setup);
        };
        document.getElementById('resetNamesBtn').addEventListener('click', () => {
          this.sound.playClick();
          // Reveal path 5: three buttons appear over the one just pressed, so the revealed card is
          // armed here -- showScreen never runs on this path.
          const resetModal = document.getElementById('resetNamesModal');
          resetModal.classList.add('active');
          armAllButtons(resetModal);
        });
        document.getElementById('closeResetNamesBtn').addEventListener('click', closeResetNames);
        document.getElementById('cancelResetNamesBtn').addEventListener('click', closeResetNames);
        document.getElementById('confirmResetNamesBtn').addEventListener('click', () => {
          closeResetNames();
          this.sound.playClick(420);
          this.resetPlayerNames();
          this.renderMascotsList();
          // Reveal path 6. Dismissing the card uncovers a setup screen whose gate fired long ago, and
          // renderMascotsList has just replaced the rows underneath it. The second contact of a
          // double-tap on the confirm lands on whatever is now there -- a count pill would change the
          // player count, which is the one thing this dialog's own copy promises survives.
          const setup = document.getElementById('screenSetup');
          if (setup) armAllButtons(setup);
        });

        // Setup Screen - Stepper buttons
        document.getElementById('countMinusBtn').addEventListener('click', () => {
          if (this.game.playerCount > 2) {
            this.sound.playClick(480);
            this.setPlayerCount(this.game.playerCount - 1);
          }
        });
        document.getElementById('countPlusBtn').addEventListener('click', () => {
          if (this.game.playerCount < 20) {
            this.sound.playClick(580);
            this.setPlayerCount(this.game.playerCount + 1);
          }
        });

        // Penalty Select
        document.getElementById('penaltySelect').addEventListener('change', (e) => {
          const customInput = document.getElementById('customPenaltyInput');
          if (e.target.value === 'custom') {
            customInput.style.display = 'block';
            customInput.focus();
          } else {
            customInput.style.display = 'none';
          }
        });

        document.getElementById('startGameBtn').addEventListener('click', () => this.handleStartGame());

        // Handoff Screen
        document.getElementById('readyBtn').addEventListener('click', () => {
          this.sound.playClick(600);
          this.showScreen('screenSelection');
          this.syncSelectionUI();
        });

        // Selection Screen Tabs
        document.getElementById('tabSliderBtn').addEventListener('click', () => {
          this.sound.playClick();
          this.setInputMode('slider');
        });
        document.getElementById('tabKeypadBtn').addEventListener('click', () => {
          this.sound.playClick();
          this.setInputMode('keypad');
        });

        // Stepper Buttons
        document.querySelectorAll('.step-btn[data-step]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const step = parseInt(e.currentTarget.getAttribute('data-step'), 10);
            this.adjustSelectedNumber(step);
          });
        });

        // Quick Bookmark Buttons
        document.getElementById('quickMinBtn').addEventListener('click', () => {
          this.setSelectedNumber(this.game.min);
        });
        document.getElementById('quickMidBtn').addEventListener('click', () => {
          this.setSelectedNumber(Math.floor((this.game.min + this.game.max) / 2));
        });
        document.getElementById('quickMaxBtn').addEventListener('click', () => {
          this.setSelectedNumber(this.game.max);
        });

        // Slider
        const slider = document.getElementById('numberSlider');
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          this.setSelectedNumber(val, false);
          this.sound.playTick();
        });

        // Keypad buttons
        document.querySelectorAll('.key-btn[data-key]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const key = e.currentTarget.getAttribute('data-key');
            this.handleKeypadInput(key);
          });
        });
        document.getElementById('keypadClearBtn').addEventListener('click', () => {
          this.sound.playClick(400);
          this.keypadBuffer = '';
          this.setSelectedNumber(this.game.min);
        });
        document.getElementById('keypadBackspaceBtn').addEventListener('click', () => {
          this.sound.playClick(450);
          this.keypadBuffer = this.keypadBuffer.slice(0, -1);
          const val = this.keypadBuffer ? parseInt(this.keypadBuffer, 10) : this.game.min;
          this.setSelectedNumber(Math.max(this.game.min, Math.min(this.game.max, val)));
        });

        // Confirm Lock Button
        document.getElementById('confirmLockBtn').addEventListener('click', () => this.handleConfirmGuess());

        // Safe Result Screen
        document.getElementById('passToNextBtn').addEventListener('click', () => {
          this.sound.playClick(600);
          this.game.advanceTurn();
          
          if (this.game.min === this.game.max) {
            this.setupForcedRevealScreen();
            this.showScreen('screenForcedReveal');
          } else {
            this.setupHandoffScreen();
            this.showScreen('screenHandoff');
          }
        });

        // Forced Reveal Screen
        document.getElementById('revealCursedBtn').addEventListener('click', () => {
          this.handleForcedReveal();
        });

        // Game Over Screen Buttons
        document.getElementById('replayMatchBtn').addEventListener('click', () => {
          this.sound.playClick(580);
          this.handleStartGame();
        });
        document.getElementById('editPlayersBtn').addEventListener('click', () => {
          this.sound.playClick();
          this.showScreen('screenSetup');
        });
      }

      showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) {
          target.classList.add('active');
          armAllButtons(target);
          this.currentScreen = screenId;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      setInputMode(mode) {
        this.inputMode = mode;
        const sliderTab = document.getElementById('tabSliderBtn');
        const keypadTab = document.getElementById('tabKeypadBtn');
        const sliderCont = document.getElementById('sliderModeContainer');
        const keypadCont = document.getElementById('keypadModeContainer');

        if (mode === 'slider') {
          sliderTab.classList.add('active');
          keypadTab.classList.remove('active');
          sliderCont.style.display = 'block';
          keypadCont.style.display = 'none';
        } else {
          sliderTab.classList.remove('active');
          keypadTab.classList.add('active');
          sliderCont.style.display = 'none';
          keypadCont.style.display = 'flex';
          this.keypadBuffer = String(this.game.selectedNumber);
        }
        // The THIRD reveal path on this route, and the one with the tightest geometry: the tab
        // strip sits directly above both containers, so the second contact of a double-tap on
        // tabKeypadBtn lands on the keypad's top row (9 step buttons under slider, 12 keys under
        // keypad). showScreen already armed the screen when it was shown; this reveal happens
        // inside a screen that is already up, so it needs its own call. ADR-0016's premise holds
        // per control: the 400ms is spent once per MODE SWITCH, not between two digits -- the gate
        // stops disabling as soon as it arms, so rapid entry after the first tap is untouched.
        armAllButtons(mode === 'slider' ? sliderCont : keypadCont);
      }

      setPlayerCount(count) {
        this.game.setPlayerCount(count);
        this.renderCountPills();
        this.renderMascotsList();
      }

      renderCountPills() {
        const container = document.getElementById('countPillsContainer');
        container.innerHTML = '';
        document.getElementById('playerCountBadge').textContent = `${this.game.playerCount} คน`;

        const quickCounts = [2, 3, 4, 5, 6, 8, 10];
        // Ensure current count is included in pills
        const pillValues = Array.from(new Set([...quickCounts, this.game.playerCount])).sort((a,b) => a - b);

        pillValues.forEach(n => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `count-pill ${n === this.game.playerCount ? 'active' : ''}`;
          pill.textContent = n;
          pill.addEventListener('click', () => {
            this.sound.playClick(520 + n * 15);
            this.setPlayerCount(n);
          });
          container.appendChild(pill);
        });
      }

      renderMascotsList() {
        const container = document.getElementById('mascotsListContainer');
        container.innerHTML = '';

        this.game.players.forEach((p, idx) => {
          const row = document.createElement('div');
          row.className = 'mascot-row';
          row.style.setProperty('--pColor', p.color);

          // The aria-label below stays NUMBERED, and that is a decision, not a site gh#177 missed.
          // It is the field's accessible name, not a player's default name: it answers "which row am
          // I in", and no one ever reads it as an identity -- the visible default is the placeholder,
          // which already comes from the cast through p.defaultName. Naming the field after the
          // animal would make it drift from its own value the moment a row is renamed (the label
          // would still say `แมวส้ม` while the box holds a typed name), and because an aria-label
          // suppresses the placeholder as the accessible name, the seat ordinal would be the only
          // positional cue lost. Numbered here is correct; numbered on a visible-name path is not.
          row.innerHTML = `
            <div class="mascot-avatar-badge">${p.avatar}</div>
            <input type="text" class="mascot-name-input" value="${escapeHtml(p.rawName || '')}" placeholder="${escapeHtml(p.defaultName)}" maxlength="20" aria-label="ชื่อผู้เล่น ${idx + 1}">
          `;

          const input = row.querySelector('.mascot-name-input');
          input.addEventListener('input', (e) => {
            this.game.updatePlayerName(idx, e.target.value);
          });

          container.appendChild(row);
        });
      }

      /** gh#177. The wipe the reset confirm guards: every seat goes back to its animal name and the
       *  party keeps its size.
       *
       *  It writes an EMPTY string through the model's own updatePlayerName rather than pushing
       *  resetCastNames() from _mascots.ts back over the roster, and that is the whole reason the
       *  count cannot move: this route does not hold names in a flat array the way short-stick does.
       *  A seat here carries rawName (what was typed) beside name (what is shown), and empty rawName
       *  IS the untouched state -- the model then falls back to seat(i).name, which comes from the
       *  MASCOTS handed to the constructor. Writing cast strings into rawName would restore the same
       *  visible names while marking every seat as hand-typed, so the placeholder would vanish and
       *  the next count change would treat an animal name as a name to preserve.
       *
       *  Deliberately free of DOM and storage: the redraw and the re-arm belong to the handler, which
       *  leaves this a pure state move that reset-names.test.mjs can lift out and run without a
       *  browser. */
      resetPlayerNames() {
        this.game.players.forEach((_, i) => this.game.updatePlayerName(i, ''));
      }

      renderPlayerStrip(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const current = this.game.getActivePlayer();

        this.game.players.forEach(p => {
          const isCurrent = current && p.id === current.id;
          const badge = document.createElement('div');
          badge.className = `player-card-badge ${isCurrent ? 'active' : ''}`;
          badge.style.setProperty('--pColor', p.color);
          badge.innerHTML = `
            <span class="card-avatar">${p.avatar}</span>
            <span>${escapeHtml(p.name)}</span>
          `;
          container.appendChild(badge);
        });
      }

      handleStartGame() {
        // Penalty setup
        const select = document.getElementById('penaltySelect');
        if (select.value === 'custom') {
          const custom = document.getElementById('customPenaltyInput').value.trim();
          this.game.penalty = custom || 'เลี้ยงน้ำเพื่อนทั้งวง';
        } else if (select.value === 'none') {
          this.game.penalty = '';
        } else {
          this.game.penalty = select.value;
        }

        this.game.startNewGame();
        this.sound.playClick(620);
        this.setupHandoffScreen();
        this.showScreen('screenHandoff');
      }

      setupHandoffScreen() {
        const player = this.game.getActivePlayer();
        document.getElementById('handoffAvatar').textContent = player.avatar;
        document.getElementById('handoffAvatar').style.borderColor = player.color;
        document.getElementById('handoffPlayerName').textContent = player.name;
        document.getElementById('handoffMin').textContent = this.game.min;
        document.getElementById('handoffMax').textContent = this.game.max;

        this.renderPlayerStrip('handoffPlayerStrip');
        this.announce(`เริ่มตาใหม่ ถึงตาของ ${player.name} ส่งเครื่องให้ผู้เล่นคนนี้`);
      }

      syncSelectionUI() {
        const player = this.game.getActivePlayer();
        document.getElementById('activePlayerAvatar').textContent = player.avatar;
        document.getElementById('activePlayerAvatar').style.borderColor = player.color;
        document.getElementById('activePlayerName').textContent = player.name;
        document.getElementById('turnIndicatorLabel').textContent = `ตาของ ${player.name}`;
        
        const banner = document.getElementById('activePlayerBanner');
        banner.style.setProperty('--pColor', player.color);

        document.getElementById('currentMin').textContent = this.game.min;
        document.getElementById('currentMax').textContent = this.game.max;

        // Sync slider min/max
        const slider = document.getElementById('numberSlider');
        slider.min = this.game.min;
        slider.max = this.game.max;

        // Quick bookmarks
        document.getElementById('quickMinVal').textContent = this.game.min;
        const midVal = Math.floor((this.game.min + this.game.max) / 2);
        document.getElementById('quickMidVal').textContent = midVal;
        document.getElementById('quickMaxVal').textContent = this.game.max;

        // Range progress bar
        const total = 100;
        const leftPercent = (this.game.min / total) * 100;
        const widthPercent = ((this.game.max - this.game.min) / total) * 100;
        const bar = document.getElementById('rangeBarActive');
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${Math.max(2, widthPercent)}%`;

        // Odds are no longer shown on the play screen (owner ruling 2026-09-01: the roster strip
        // stays, the odds pill goes). calculateOdds still drives the heartbeat tension audio.
        const odds = this.game.calculateOdds();
        if (odds.isCritical) this.sound.playHeartbeat(true);
        else if (odds.isWarning) this.sound.playHeartbeat(false);

        this.renderPlayerStrip('selectionPlayerStrip');

        // Always reset selected number to midpoint of current range on turn change
        this.setSelectedNumber(midVal, true);
        this.keypadBuffer = String(midVal);

        this.game.isSubmitting = false;
        document.getElementById('confirmLockBtn').disabled = false;
      }

      setSelectedNumber(val, updateSlider = true) {
        const clamped = Math.max(this.game.min, Math.min(this.game.max, val));
        this.game.selectedNumber = clamped;
        const display = document.getElementById('selectedNumberDisplay');
        display.textContent = clamped;
        display.classList.add('glow-change');
        setTimeout(() => display.classList.remove('glow-change'), 150);

        if (updateSlider) {
          document.getElementById('numberSlider').value = clamped;
        }
      }

      adjustSelectedNumber(delta) {
        this.sound.playClick(500 + delta * 15);
        this.setSelectedNumber(this.game.selectedNumber + delta);
      }

      handleKeypadInput(digit) {
        this.sound.playClick(520 + parseInt(digit, 10) * 20);
        if (this.keypadBuffer.length >= 3) return;
        this.keypadBuffer += digit;
        let num = parseInt(this.keypadBuffer, 10);
        if (num > this.game.max) num = this.game.max;
        this.setSelectedNumber(num);
      }

      handleConfirmGuess() {
        if (this.game.isSubmitting) return;
        document.getElementById('confirmLockBtn').disabled = true;

        const guess = this.game.selectedNumber;
        const outcome = this.game.resolveGuess(guess);

        if (!outcome.valid) {
          this.game.isSubmitting = false;
          document.getElementById('confirmLockBtn').disabled = false;
          return;
        }

        if (outcome.result === 'LOSE') {
          // Explode & Game Over
          this.sound.playCursedExplosion();
          this.fx.spawnCursedDetonation();
          this.setupGameOverScreen(outcome);
          this.showScreen('screenGameOver');
        } else {
          // Safe Guess
          const isHigher = outcome.direction === 'HIGHER';
          this.sound.playDirectionChime(isHigher);
          this.fx.spawnSafeSparkles();
          this.setupSafeResultScreen(outcome);
          this.showScreen('screenSafeResult');
        }
      }

      setupSafeResultScreen(outcome) {
        document.getElementById('safeGuessNum').textContent = outcome.guess;
        document.getElementById('safePlayerQuote').textContent = `${outcome.activePlayer.name} รอดพ้นจากเลขอาถรรพ์ในตานี้!`;
        
        const dirEl = document.getElementById('directionTitle');
        if (outcome.direction === 'HIGHER') {
          dirEl.className = 'direction-title higher';
          dirEl.innerHTML = `⬆️ เลขอาถรรพ์ <strong>สูงกว่านี้</strong> (HIGHER)`;
        } else {
          dirEl.className = 'direction-title lower';
          dirEl.innerHTML = `⬇️ เลขอาถรรพ์ <strong>ต่ำกว่านี้</strong> (LOWER)`;
        }

        document.getElementById('nextMin').textContent = outcome.min;
        document.getElementById('nextMax').textContent = outcome.max;
        document.getElementById('nextPlayerNameTarget').textContent = outcome.nextPlayer.name;

        this.renderPlayerStrip('safePlayerStrip');

        // Render history list
        const historyList = document.getElementById('safeHistoryList');
        document.getElementById('safeHistoryCount').textContent = this.game.history.length;
        historyList.innerHTML = '';
        this.game.history.slice().reverse().forEach((h, idx) => {
          const item = document.createElement('div');
          item.className = 'history-item';
          const dirText = h.direction === 'HIGHER' ? '⬆️ สูงกว่า' : '⬇️ ต่ำกว่า';
          const dirClass = h.direction === 'HIGHER' ? 'higher' : 'lower';
          item.innerHTML = `
            <div class="history-player">
              <span>${h.player.avatar}</span>
              <span style="color:${h.player.color}; font-weight:800;">${escapeHtml(h.player.name)}</span>
            </div>
            <div class="history-guess ${dirClass}">
              เลือก ${h.guess} (${dirText})
            </div>
          `;
          historyList.appendChild(item);
        });
      }

      setupForcedRevealScreen() {
        const player = this.game.getActivePlayer();
        document.getElementById('forcedPlayerAvatar').textContent = player.avatar;
        document.getElementById('forcedPlayerAvatar').style.borderColor = player.color;
        document.getElementById('forcedPlayerName').textContent = player.name;
        document.getElementById('forcedRemainingNumber').textContent = this.game.min;
        document.getElementById('forcedPlayerBanner').style.setProperty('--pColor', player.color);
      }

      handleForcedReveal() {
        const outcome = this.game.resolveForcedReveal();
        this.sound.playCursedExplosion();
        this.fx.spawnCursedDetonation();
        this.setupGameOverScreen(outcome);
        this.showScreen('screenGameOver');
      }

      setupGameOverScreen(outcome) {
        document.getElementById('revealedCursedNumber').textContent = outcome.cursedNumber;
        document.getElementById('loserAvatar').textContent = outcome.loser.avatar;
        document.getElementById('loserAvatar').style.borderColor = outcome.loser.color;
        document.getElementById('loserPlayerName').textContent = `${outcome.loser.name} โดนเลขอาถรรพ์!`;

        const penaltyBox = document.getElementById('penaltyResultBox');
        if (this.game.penalty) {
          penaltyBox.style.display = 'flex';
          document.getElementById('penaltyResultText').textContent = this.game.penalty;
        } else {
          penaltyBox.style.display = 'none';
        }

        // Render entire history in game over screen
        const list = document.getElementById('gameOverHistoryList');
        list.innerHTML = '';
        this.game.history.forEach((h, idx) => {
          const item = document.createElement('div');
          item.className = 'history-item';
          let dirText = '';
          let dirClass = '';
          if (h.direction === 'HIGHER') {
            dirText = '⬆️ สูงกว่า (HIGHER)';
            dirClass = 'higher';
          } else if (h.direction === 'LOWER') {
            dirText = '⬇️ ต่ำกว่า (LOWER)';
            dirClass = 'lower';
          } else {
            dirText = '💥 โดนเลขอาถรรพ์ (LOST)';
            dirClass = 'lost';
          }

          item.innerHTML = `
            <div class="history-player">
              <span>${idx + 1}.</span>
              <span>${h.player.avatar}</span>
              <span style="color:${h.player.color}; font-weight:800;">${escapeHtml(h.player.name)}</span>
            </div>
            <div class="history-guess ${dirClass}">
              เลือก ${h.guess} ➔ ${dirText}
            </div>
          `;
          list.appendChild(item);
        });
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }

    /**
     * Deterministic In-Browser Unit Test Suite
     */
    // The mockup's in-page runDeterministicTestSuite() lived here, with a header button and a modal
    // to run it. Both are DELETED, not hidden: it was ~200 lines of assertions shipped to every
    // player, and a rule only a browser can execute is a rule no gate can pin. Its cases were
    // re-homed against the hoisted model in src/games/cursed-number.test.mjs, which node --test runs.

    // Initialize App
    const app = new AppController();
    window.gameEngine = app.game;
