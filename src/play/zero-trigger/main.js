// watduang: the one cast, defined once (ADR-0054 rulings 1-3). Adding this import costs the file its
// thai-comments verbatim-lift exemption, which is why the escaping helper below stayed local -- so
// every comment in this file is now scanned, and none of them may hold a Thai character.
//
// The .ts extension is spelled out in full, the way cursed-number/main.js does it.
import { MASCOTS } from '../_mascots.ts';

// Ghost-tap gate (ADR-0014 / ADR-0016 / ADR-0017): every panel a transition reveals re-arms, because
// the second contact of a double-tap aimed at the screen that just went away must not activate the
// control that replaced it. Armed at the reveal seam, never inside a re-render of an already-visible
// panel -- the roster re-renders on every add/remove tap, and gating there would disable the very
// button the player is tapping twice on purpose (the per-control ceiling _arm-gate.ts records).
import { armAllButtons } from '../../games/_arm-gate.ts';

    /**
     * PROCEDURAL WEB AUDIO SYNTHESIZER
     * Implements gamedev-skills/skills/web-audio-sound-synth specification
     */
    class SoundSynth {
      constructor() {
        this.ctx = null;
        this.enabled = true;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }

      resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }

      toggleAudio() {
        this.enabled = !this.enabled;
        return this.enabled;
      }

      playClick(freq = 520) {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.07);
      }

      playHover() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, t);
        osc.frequency.exponentialRampToValueAtTime(650, t + 0.04);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.05);
      }

      playTick() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.03);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.035);
      }

      playSafeChime() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.045;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.18, st);
          gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.38);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(st);
          osc.stop(st + 0.4);
        });
      }

      playExplosion() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;

        // Layer 1: Sub-bass sawtooth punch
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.8);
        oscGain.gain.setValueAtTime(0.6, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.85);

        // Layer 2: Filtered White Noise Blast
        const bufferSize = this.ctx.sampleRate * 0.8;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, t);
        filter.frequency.exponentialRampToValueAtTime(80, t + 0.75);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.7, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
        whiteNoise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        whiteNoise.start(t);
        whiteNoise.stop(t + 0.8);
      }

      playHeartbeat() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(65, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.15);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      }

      playTierUp() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.3);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.32);
      }

      playRoll() {
        if (!this.enabled || !this.ctx) return;
        this.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(700, t + 0.08);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      }
    }

    // watduang: ADR-0046 and ADR-0051. Reduced motion REDUCES the motion, it never deletes it, and
    // what drops is the AMPLITUDE, not only the write rate -- so the canvas keeps being drawn, the
    // burst still happens, and every decorative distance below shrinks instead. The query string is
    // written as a literal because that is what the repo's motion gate matches on.
    // Read once and kept live: a visitor who flips the setting mid-round is obeyed on the next frame.
    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let prefersReducedMotion = reducedMotionQuery ? reducedMotionQuery.matches : false;
    if (reducedMotionQuery && reducedMotionQuery.addEventListener) {
      reducedMotionQuery.addEventListener('change', (event) => {
        prefersReducedMotion = event.matches;
      });
    }
    /** The single knob every decorative amplitude in this file multiplies by. Never 0: at 0 the
     *  particles and the shake are gone rather than reduced, which is the thing ADR-0046 forbids. */
    const motionScale = () => (prefersReducedMotion ? 0.3 : 1);
    /** Counts scale with the same knob, but never below one particle -- a burst of zero is a deletion. */
    const scaledCount = (n) => Math.max(1, Math.round(n * motionScale()));

    /**
     * PARTICLE & SCREEN SHAKE ENGINE
     * Implements gamedev-skills/skills/game-juice-and-polish specification
     */
    class FXEngine {
      constructor(canvas) {
        this.canvas = canvas;
        // watduang: ADR-0051 -- a play route must never blank the page when the context is
        // unavailable. Everything this class does is decoration (particles, screen shake, haptics),
        // so a missing context degrades to no decoration and the round is played exactly as before.
        // getContext itself is wrapped: it throws rather than returning null when the element is
        // already bound to a different context type.
        this.ctx = null;
        try {
          this.ctx = canvas ? canvas.getContext('2d') : null;
        } catch {
          this.ctx = null;
        }
        this.particles = [];
        this.trauma = 0.0;
        if (!this.ctx) return;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.lastTime = performance.now();
        this.renderLoop();
      }

      resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }

      addTrauma(amount = 0.8) {
        if (!this.ctx) return;
        this.trauma = Math.min(1.0, this.trauma + amount * motionScale());
        // Haptics are motion too, and a phone in the hand is where it is felt most.
        if (navigator.vibrate && !prefersReducedMotion) {
          navigator.vibrate([100, 50, 200, 50, 400]);
        }
      }

      spawnSafeSparkles(x, y) {
        if (!this.ctx) return;
        if (navigator.vibrate && !prefersReducedMotion) navigator.vibrate(40);
        const count = scaledCount(30);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (2 + Math.random() * 5) * motionScale();
          this.particles.push({
            type: 'sparkle',
            x: x || this.canvas.width / 2,
            y: y || this.canvas.height / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            size: 3 + Math.random() * 4,
            color: ['#10b981', '#34d399', '#6ee7b7', '#fef08a'][Math.floor(Math.random() * 4)],
            life: 1.0,
            decay: 0.02 + Math.random() * 0.02
          });
        }
      }

      spawnExplosion(x, y) {
        if (!this.ctx) return;
        const cx = x || this.canvas.width / 2;
        const cy = y || this.canvas.height / 2;

        // Fireballs
        const fireballs = scaledCount(50);
        for (let i = 0; i < fireballs; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (3 + Math.random() * 9) * motionScale();
          this.particles.push({
            type: 'fire',
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            size: 6 + Math.random() * 8,
            color: ['#ef4444', '#f97316', '#fbbf24', '#ffffff'][Math.floor(Math.random() * 4)],
            life: 1.0,
            decay: 0.025 + Math.random() * 0.02
          });
        }

        // Shrapnel Debris
        const shrapnel = scaledCount(25);
        for (let i = 0; i < shrapnel; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (2 + Math.random() * 6) * motionScale();
          this.particles.push({
            type: 'debris',
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3,
            rot: Math.random() * Math.PI,
            vRot: (Math.random() - 0.5) * 0.2,
            size: 8 + Math.random() * 6,
            color: '#475569',
            life: 1.0,
            decay: 0.015 + Math.random() * 0.01
          });
        }
      }

      spawnConfetti() {
        if (!this.ctx) return;
        const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
        const count = scaledCount(70);
        for (let i = 0; i < count; i++) {
          this.particles.push({
            type: 'confetti',
            x: Math.random() * this.canvas.width,
            y: -20 - Math.random() * 50,
            vx: (Math.random() - 0.5) * 4 * motionScale(),
            vy: (2 + Math.random() * 4) * motionScale(),
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.15,
            size: 6 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 1.0,
            decay: 0.008 + Math.random() * 0.006
          });
        }
      }

      renderLoop() {
        if (!this.ctx) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Screen Shake processing
        const appContainer = document.getElementById('app-container');
        if (this.trauma > 0) {
          this.trauma = Math.max(0, this.trauma - dt * 2.2);
          const shake = Math.pow(this.trauma, 2);
          // The amplitude, and the one line reduced motion changes about the shake. It is scaled,
          // not zeroed: the hit still registers as a hit, it just stops throwing the screen around.
          const maxOffset = 18 * motionScale(); // px
          const offsetX = (Math.random() - 0.5) * maxOffset * shake;
          const offsetY = (Math.random() - 0.5) * maxOffset * shake;
          appContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        } else {
          appContainer.style.transform = 'none';
        }

        // Particle updates
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.life -= p.decay;
          if (p.life <= 0) {
            this.particles.splice(i, 1);
            continue;
          }

          p.x += p.vx;
          p.y += p.vy;

          if (p.type === 'fire' || p.type === 'debris') {
            p.vy += 0.25; // gravity
          } else if (p.type === 'confetti') {
            p.rot += p.vRot;
          }

          this.ctx.save();
          this.ctx.globalAlpha = Math.max(0, p.life);
          this.ctx.fillStyle = p.color;

          if (p.type === 'sparkle') {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            this.ctx.fill();
          } else if (p.type === 'fire') {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * (0.3 + p.life * 0.7), 0, Math.PI * 2);
            this.ctx.fill();
          } else if (p.type === 'debris') {
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rot);
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          } else if (p.type === 'confetti') {
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rot);
            this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          }
          this.ctx.restore();
        }

        requestAnimationFrame(() => this.renderLoop());
      }
    }

    /**
     * PRESET AVATARS & PENALTIES
     */
    // watduang: the mockup shipped its own 15 emoji in its own order. ADR-0054 rulings 1 and 2 fix
    // ONE cast and ONE order for every party game -- player 1 is always the first row -- so the list
    // is read from _mascots.ts instead of forked here. The picker grid, the auto-assign in
    // addNewPlayer() and randomizeAllAvatars() all read this, so they all move together.
    const AVATAR_LIST = MASCOTS.map((m) => m.emoji);
    /** The default label for seat i, per ADR-0054 ruling 3: ready to play without typing a name.
     *  Falls back to the numbered form past the cast, which this game's 10-seat ceiling never
     *  reaches -- it is there so a shrunk cast degrades instead of writing "undefined" on a card. */
    const defaultPlayerName = (index) => MASCOTS[index]?.name ?? `ผู้เล่น ${index + 1}`;
    
    // watduang: roster names are typed by players and reach this file from the shared roster, so
    // they are untrusted text wherever it builds markup by string. Same helper and same idiom as
    // src/play/cannon-flag/main.js. It was kept local to preserve this file's thai-comments
    // verbatim-lift exemption; the cast import at the top spends that exemption, so the reason is
    // gone and only inertia keeps the copy. Applied at the three innerHTML sinks that print a name.
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // watduang: THREE strings in this port are edited, not lifted. Two are the placeholder inside
    // `#modal-penalty-text` in markup.html (which this file overwrites at runtime anyway) and this
    // file's first preset below: each was a drink-a-glass dare carrying a beer emoji, and this site
    // bars alcohol copy AND alcohol imagery outright, because the imagery alone triggers Thai
    // Alcohol Act s.32/1 -- an emoji of a glass IS that imagery. The third is the pushups-or-
    // jumping-jacks preset below: a dare toward real exertion/harm, an AdSense account-termination
    // risk. The note lives here rather than beside the markup one because an HTML comment SHIPS: it
    // was measured in dist/game/zero-trigger/play/index.html before being moved. All three are
    // replaced with harmless lines in the same register. Every other entry below is the mockup's
    // own copy.
    const PRESET_PENALTIES = [
      'ร้องเพลงท่อนฮิต 1 ท่อนให้ทั้งวงฟัง! 🎤',
      'เลี้ยงขนมเพื่อนคนละ 1 อย่าง! 🧋',
      'โดนทำหน้าตลกให้ทุกคนถ่ายรูป! 📸',
      'นับถอยหลังรอบต่อไปแทนทุกคน! 🔢',
      'พูดลงท้ายด้วย "เมี๊ยว" ตลอด 2 รอบถัดไป! 🐱',
      'สารภาพความลับมา 1 เรื่อง! 🤫',
      'เต้นเพลงฮิต 10 วินาทีแบบใส่สุด! 💃',
      'ออกไปจ่ายค่าบิลรอบนี้! 💸'
    ];

    /**
     * GAME STATE MANAGEMENT
     */
    class GameEngine {
      constructor() {
        this.synth = new SoundSynth();
        this.fx = new FXEngine(document.getElementById('fx-canvas'));

        this.state = {
          screen: 'MENU', // 'MENU' | 'SETUP' | 'GAME'
          tier: 1,        // 1: 0.0s | 2: 0.00s | 3: 0.000s
          roundNumber: 1,
          cycleCount: 1,
          turnIndex: 0,
          forbiddenDigit: 7, // Shared forbidden digit for all players in this round
          // The two seats the game opens with ARE the first two rows of the cast, in order
          // (ADR-0054 ruling 2): player 1 is always the first, player 2 always the second.
          players: [
            { id: 1, name: defaultPlayerName(0), avatar: AVATAR_LIST[0], score: 0 },
            { id: 2, name: defaultPlayerName(1), avatar: AVATAR_LIST[1], score: 0 }
          ],
          penaltyMode: 'preset', // 'preset' | 'custom' | 'none'
          customPenaltyList: [...PRESET_PENALTIES],
          timer: {
            isRunning: false,
            isLocked: false, // 1.00s anti-cheat lock
            startTime: 0,
            elapsedMs: 0,
            rafId: null,
            minLockDurationMs: 1000,
            formattedString: '00.0'
          },
          editingPlayerIndex: null
        };

        this.loadStorage();
        this.initUIBindings();
        this.renderPlayerRoster();

        // First paint is a transition too: the tap that opened this route can still be mid-double.
        const firstScreen = document.querySelector('.screen.active');
        if (firstScreen) armAllButtons(firstScreen);
      }

      loadStorage() {
        try {
          const saved = localStorage.getItem('ZERO_TRIGGER_DATA_V1');
          if (saved) {
            const data = JSON.parse(saved);
            if (data.players && data.players.length >= 2) {
              this.state.players = data.players.map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar || AVATAR_LIST[0],
                score: 0
              }));
            }
            if (data.penaltyMode) {
              this.state.penaltyMode = data.penaltyMode;
            }
          }
        } catch (e) {
          console.warn('LocalStorage error:', e);
        }
      }

      saveStorage() {
        try {
          localStorage.setItem('ZERO_TRIGGER_DATA_V1', JSON.stringify({
            players: this.state.players,
            penaltyMode: this.state.penaltyMode
          }));
        } catch (e) {
          console.warn('LocalStorage save error:', e);
        }
      }

      showToast(msg) {
        const toast = document.getElementById('toast-banner');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2200);
      }

      switchScreen(newScreen) {
        this.state.screen = newScreen;
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(`screen-${newScreen.toLowerCase()}`);
        if (target) {
          target.classList.add('active');
          armAllButtons(target);
        }

        // Header buttons control
        const homeBtn = document.getElementById('btn-home-menu');
        homeBtn.style.display = (newScreen === 'MENU') ? 'none' : 'flex';

        this.synth.playClick();
      }

      initUIBindings() {
        // Audio resume on first pointer
        window.addEventListener('pointerdown', () => this.synth.resume(), { once: true });

        // Nav buttons
        document.getElementById('btn-audio-toggle').addEventListener('click', (e) => {
          const enabled = this.synth.toggleAudio();
          e.target.textContent = enabled ? '🔊' : '🔇';
          this.showToast(enabled ? 'เปิดเสียงแล้ว' : 'ปิดเสียง');
        });

        document.getElementById('btn-open-rules').addEventListener('click', () => {
          this.openModal('modal-rules');
        });

        document.getElementById('btn-close-rules').addEventListener('click', () => {
          this.closeModal('modal-rules');
        });

        document.getElementById('btn-home-menu').addEventListener('click', () => {
          if (this.state.timer.isRunning) {
            this.stopTimerLoop();
          }
          this.switchScreen('MENU');
        });

        // Menu buttons
        document.getElementById('btn-quick-start').addEventListener('click', () => {
          this.startNewMatch();
        });

        document.getElementById('btn-goto-setup').addEventListener('click', () => {
          this.renderPlayerRoster();
          this.switchScreen('SETUP');
        });

        // Setup buttons
        document.getElementById('btn-add-player').addEventListener('click', () => {
          this.addNewPlayer();
        });

        document.getElementById('btn-random-avatars').addEventListener('click', () => {
          this.randomizeAllAvatars();
        });

        // gh#177 / ADR-0054. Reset is asked first because its answer is destructive: it overwrites
        // every name a player typed AND every emoji a player picked. The question is put through
        // openModal, so both answers arrive gated -- they appear directly over the control just
        // pressed. The copy in markup.html names both losses and what survives (the player count and
        // the penalty setting), which is what docs/agents/src-edit-rules.md requires: over-naming is
        // acceptable, under-naming is not.
        // Do NOT read the cancel-before-confirm ordering as the guard. openModal arms the modal
        // immediately after revealing it, and that blanket disable drops focus onto <body>, so
        // nothing is focused at all; the 400ms gate is what protects this answer, not the order.
        document.getElementById('btn-open-reset-cast').addEventListener('click', () => {
          this.openModal('modal-reset-cast');
        });

        document.getElementById('btn-cancel-reset-cast').addEventListener('click', () => {
          this.closeModal('modal-reset-cast');
        });

        document.getElementById('btn-confirm-reset-cast').addEventListener('click', () => {
          this.closeModal('modal-reset-cast');
          this.resetPlayerCast();
          this.saveStorage();
          // ADR-0017. This rebuilds every roster row through innerHTML, putting a fresh avatar-btn
          // where the finger that just confirmed still is, and the modal that was on top of it is
          // gone by now. renderPlayerRoster arms the container it rebuilds, which covers this path;
          // ./arm-reveal-paths.test.mjs pins both halves so a later edit cannot take that arming
          // away and leave the confirm's second contact live on a row control.
          this.renderPlayerRoster();
          this.synth.playClick(400);
          this.showToast('↺ กลับไปใช้ชื่อและรูปสัตว์เริ่มต้นแล้ว');
        });

        document.querySelectorAll('.penalty-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            document.querySelectorAll('.penalty-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.state.penaltyMode = btn.dataset.mode;
            this.saveStorage();
            this.synth.playClick(600);
          });
        });

        document.getElementById('btn-confirm-start-game').addEventListener('click', () => {
          this.startNewMatch();
        });

        // Big Action Button (START / STOP)
        document.getElementById('btn-big-action').addEventListener('click', () => {
          this.handleBigActionClick();
        });

        // Modals
        document.getElementById('btn-next-round').addEventListener('click', () => {
          this.closeModal('modal-result');
          this.startNextRound();
        });

        document.getElementById('btn-result-menu').addEventListener('click', () => {
          this.closeModal('modal-result');
          this.switchScreen('MENU');
        });

        document.getElementById('btn-close-avatar-picker').addEventListener('click', () => {
          this.closeModal('modal-avatar-picker');
        });

        // Generate Avatar Picker Buttons
        const avatarGrid = document.getElementById('avatar-picker-grid');
        AVATAR_LIST.forEach(emoji => {
          const btn = document.createElement('button');
          btn.className = 'avatar-pick-btn';
          btn.textContent = emoji;
          btn.addEventListener('click', () => this.selectAvatar(emoji));
          avatarGrid.appendChild(btn);
        });
      }

      openModal(modalId) {
        this.synth.playClick();
        const modal = document.getElementById(modalId);
        if (modal) {
          modal.classList.add('active');
          armAllButtons(modal);
        }
      }

      // gh#187 (owner ruling 2026-09-01), openModal's counterpart: CLOSING a modal is itself a reveal
      // ADR-0017 gates. The screen underneath was armed when switchScreen showed it and that window
      // closed long ago -- which is exactly why the second contact of a double-tap on a close or
      // cancel control fires the button behind it. No rebuild is involved, which is why the reset
      // confirm's renderPlayerRoster() arming never covered cancel, close-rules or close-avatar.
      // Every modal on this route overlays the live screen and every dismissal goes through here, so
      // one call covers all of them; the live screen is looked up rather than named because a modal
      // is reachable from more than one screen.
      //
      // gh#188 box 13 -- no exception list is passed, and none is needed: this route writes `disabled`
      // on NOTHING. Every control here is enabled whenever it is on screen, so re-enabling all of
      // them is re-asserting the state the route already holds. That is the whole argument, and it is
      // a countable one rather than a judgement -- arm-reveal-paths.test.mjs asserts the count is
      // zero, so the day a control here gains a game-owned `disabled` this claim fails and whoever
      // added it decides. (The gate also preserves an already-disabled control since gh#188, so the
      // fix is not load-bearing here either way.)
      closeModal(modalId) {
        this.synth.playClick();
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
        const screen = document.querySelector('.screen.active');
        if (screen) armAllButtons(screen);
      }

      /* =========================================
         PLAYER ROSTER SETUP MANAGEMENT
         ========================================= */
      renderPlayerRoster() {
        const container = document.getElementById('player-roster-container');
        container.innerHTML = '';

        document.getElementById('setup-player-count-badge').textContent = `${this.state.players.length} / 10 คน`;

        this.state.players.forEach((player, index) => {
          const row = document.createElement('div');
          row.className = 'player-row glass-card';

          row.innerHTML = `
            <button class="avatar-btn" data-index="${index}" title="เปลี่ยน Avatar">${player.avatar}</button>
            <input type="text" class="player-name-input" data-index="${index}" value="${escapeHtml(player.name)}" maxlength="12" placeholder="ชื่อผู้เล่น" />
            ${this.state.players.length > 2 ? `<button class="remove-player-btn" data-index="${index}" title="ลบผู้เล่น">✕</button>` : '<div></div>'}
          `;

          // Event listeners
          row.querySelector('.avatar-btn').addEventListener('click', () => {
            this.state.editingPlayerIndex = index;
            this.openModal('modal-avatar-picker');
          });

          const nameInput = row.querySelector('.player-name-input');
          nameInput.addEventListener('input', (e) => {
            this.state.players[index].name = e.target.value.trim() || defaultPlayerName(index);
            this.saveStorage();
          });

          const removeBtn = row.querySelector('.remove-player-btn');
          if (removeBtn) {
            removeBtn.addEventListener('click', () => {
              this.removePlayer(index);
            });
          }

          container.appendChild(row);
        });

        // ADR-0017, the ghost-tap gate. Same shape as wire-snip-panic's renderSetupPlayerList:
        // switchScreen arms the setup screen once, but every add, every remove and every avatar
        // pick rebuilds these rows through innerHTML afterwards, putting a fresh `avatar-btn` or
        // `remove-player-btn` under the finger that just pressed one, at the same coordinates and
        // with no arming of its own. It is a reveal with no screen change to hang it on, so it is
        // armed here. Pinned by ./arm-reveal-paths.test.mjs.
        armAllButtons(container);

        // Sync penalty buttons state
        document.querySelectorAll('.penalty-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.mode === this.state.penaltyMode);
        });
      }

      addNewPlayer() {
        if (this.state.players.length >= 10) {
          this.showToast('ผู้เล่นสูงสุด 10 คนแล้ว');
          return;
        }
        const nextId = this.state.players.length + 1;
        const availableAvatars = AVATAR_LIST.filter(a => !this.state.players.some(p => p.avatar === a));
        const randomAvatar = availableAvatars.length ? availableAvatars[0] : AVATAR_LIST[nextId % AVATAR_LIST.length];

        this.state.players.push({
          id: nextId,
          name: defaultPlayerName(nextId - 1),
          avatar: randomAvatar,
          score: 0
        });

        this.saveStorage();
        this.renderPlayerRoster();
        this.synth.playClick(650);
      }

      removePlayer(index) {
        if (this.state.players.length <= 2) return;
        this.state.players.splice(index, 1);
        this.saveStorage();
        this.renderPlayerRoster();
        this.synth.playClick(400);
      }

      randomizeAllAvatars() {
        const shuffled = [...AVATAR_LIST].sort(() => 0.5 - Math.random());
        this.state.players.forEach((p, idx) => {
          p.avatar = shuffled[idx % shuffled.length];
        });
        this.saveStorage();
        this.renderPlayerRoster();
        this.synth.playClick(700);
        this.showToast('🎲 สุ่ม Avatar ใหม่ให้ทุกคนแล้ว');
      }

      /** gh#177. The wipe the reset confirm guards: every seat goes back to the cast row that owns
       *  it, and the party keeps its size.
       *  ADR-0054 ruling 1 makes name + emoji ONE identity and ruling 2 fixes the order, so both
       *  halves come from a SINGLE MASCOTS lookup per seat -- a second lookup for the emoji is
       *  exactly what would let the pair drift apart. The modulo wrap keeps them on the same row
       *  past the end of the cast, where defaultPlayerName's numbered fallback would not; the
       *  10-seat ceiling reaches neither.
       *  It reads only the roster's length and each seat's position, never an entry's name or
       *  avatar, so nothing a player typed or picked can survive it -- that is the loss the confirm
       *  names. id and score are carried through: neither belongs to the mascot identity, and score
       *  is a per-match value this pre-match screen has no business touching.
       *  No DOM and no storage call on purpose -- the redraw and the save belong to the handler,
       *  which leaves this a pure state move that ./reset-cast.test.mjs lifts out and runs without
       *  a browser. */
      resetPlayerCast() {
        this.state.players = this.state.players.map((player, index) => {
          const mascot = MASCOTS[index % MASCOTS.length];
          return { ...player, name: mascot.name, avatar: mascot.emoji };
        });
      }

      selectAvatar(emoji) {
        if (this.state.editingPlayerIndex !== null) {
          this.state.players[this.state.editingPlayerIndex].avatar = emoji;
          this.saveStorage();
          this.renderPlayerRoster();
          this.closeModal('modal-avatar-picker');
        }
      }

      /* =========================================
         MATCH PROGRESSION & GAMEPLAY FLOW
         ========================================= */
      rollSharedForbiddenDigit() {
        // Roll 1 number (0-9) as the forbidden digit for everyone
        this.state.forbiddenDigit = Math.floor(Math.random() * 10);
        
        // Visual roll animation on badge
        const badge = document.getElementById('game-forbidden-digit');
        let rolls = 0;
        const rollInterval = setInterval(() => {
          badge.textContent = Math.floor(Math.random() * 10);
          // Reduced motion keeps the digit rolling -- the roll IS the announcement of the round's
          // forbidden number -- and shrinks only how far the badge pumps.
          badge.style.transform = `scale(${1 + (rolls % 2) * 0.15 * motionScale()})`;
          this.synth.playRoll();
          rolls++;
          if (rolls > 8) {
            clearInterval(rollInterval);
            badge.textContent = this.state.forbiddenDigit;
            badge.style.transform = 'scale(1)';
            this.showToast(`🎯 สุ่มเลขต้องห้ามประจำรอบได้เลข [ ${this.state.forbiddenDigit} ]`);
          }
        }, 60);
      }

      startNewMatch() {
        this.state.roundNumber = 1;
        this.state.cycleCount = 1;
        this.state.tier = 1;
        this.state.turnIndex = 0;
        this.state.players.forEach(p => p.score = 0);
        this.switchScreen('GAME');
        this.rollSharedForbiddenDigit();
        this.prepareTurn();
      }

      startNextRound() {
        this.state.roundNumber++;
        this.state.cycleCount = 1;
        this.state.tier = 1;
        this.state.turnIndex = (this.state.turnIndex + 1) % this.state.players.length;
        this.rollSharedForbiddenDigit();
        this.prepareTurn();
      }

      prepareTurn() {
        const activePlayer = this.state.players[this.state.turnIndex];
        const timerState = this.state.timer;
        timerState.isRunning = false;
        timerState.isLocked = false;
        timerState.elapsedMs = 0;

        // Reset LCD display
        const displayFormat = this.getDisplayPlaceholder(this.state.tier);
        document.getElementById('lcd-timer-display').textContent = displayFormat;
        document.getElementById('lcd-timer-display').className = 'lcd-digital-timer';

        // Update active player info
        document.getElementById('game-active-avatar').textContent = activePlayer.avatar;
        document.getElementById('game-active-name').textContent = activePlayer.name;
        document.getElementById('game-forbidden-digit').textContent = this.state.forbiddenDigit;

        // Update Tier Badge
        const tierBadge = document.getElementById('tier-badge-indicator');
        tierBadge.className = `tier-badge tier-${this.state.tier}`;
        const tierNames = [
          'Tier 1 · Speed 0.0s',
          'Tier 2 · Speed 0.00s',
          'CRITICAL · Speed 0.000s'
        ];
        tierBadge.innerHTML = `<span>⚡</span> ${tierNames[this.state.tier - 1] || tierNames[2]}`;

        document.getElementById('round-number-indicator').textContent = `รอบที่ ${this.state.roundNumber} (วงที่ ${this.state.cycleCount})`;

        // Odds meter update
        const hint = this.state.tier === 1 ? '(กะจังหวะง่าย 100ms)' : (this.state.tier === 2 ? '(เริ่มเร็ว 10ms)' : '(ความเร็วเสี้ยววิ 1ms!)');
        document.getElementById('odds-percentage').textContent = `รอด 90% · โดน 10%`;
        document.getElementById('tier-speed-hint').textContent = hint;

        // Reset Action Button
        const btn = document.getElementById('btn-big-action');
        btn.className = 'big-trigger-btn';
        document.getElementById('action-btn-main-text').textContent = 'START';
        document.getElementById('action-btn-sub-text').textContent = 'แตะเพื่อเริ่ม';
        document.getElementById('lock-status-text').innerHTML = `<span>ส่งมือถือให้ <strong>${escapeHtml(activePlayer.name)}</strong> (หลบเลข ${this.state.forbiddenDigit})</span>`;

        this.renderPlayerStrip();
        this.announceTurn(activePlayer);
      }

      /** Speaks the round change into #zt-live (gh#170). Carries only what the header already shows
       *  on screen -- round, cycle, whose turn, and the shared forbidden digit that #game-forbidden-digit
       *  displays to everyone. Nothing hidden from a sighted player is spoken here: the stopped time
       *  is the outcome and is announced by nothing. Cleared first so an identical repeat still fires. */
      announceTurn(activePlayer) {
        const live = document.getElementById('zt-live');
        if (!live) return;
        live.textContent = '';
        live.textContent =
          `รอบที่ ${this.state.roundNumber} วงที่ ${this.state.cycleCount} · ` +
          `ตาของ ${activePlayer.name} · หลบเลข ${this.state.forbiddenDigit}`;
      }

      renderPlayerStrip() {
        const strip = document.getElementById('game-player-strip');
        strip.innerHTML = '';

        this.state.players.forEach((player, index) => {
          const chip = document.createElement('div');
          chip.className = `strip-player-chip ${index === this.state.turnIndex ? 'active-turn' : ''}`;
          chip.innerHTML = `
            <span>${player.avatar}</span>
            <span>${escapeHtml(player.name)}</span>
          `;
          strip.appendChild(chip);
        });
      }

      getDisplayPlaceholder(tier) {
        if (tier === 1) return '00.0';
        if (tier === 2) return '00.00';
        return '00.000';
      }

      formatTime(ms, tier) {
        const totalSeconds = ms / 1000;
        const sec = Math.floor(totalSeconds);
        const secStr = sec.toString().padStart(2, '0');

        if (tier === 1) {
          const dec = Math.floor((ms % 1000) / 100);
          return `${secStr}.${dec}`;
        } else if (tier === 2) {
          const dec = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
          return `${secStr}.${dec}`;
        } else {
          const dec = Math.floor(ms % 1000).toString().padStart(3, '0');
          return `${secStr}.${dec}`;
        }
      }

      handleBigActionClick() {
        const timerState = this.state.timer;

        if (!timerState.isRunning) {
          // START TIMER
          this.startTimerLoop();
        } else {
          // STOP TIMER
          if (timerState.isLocked) {
            // Anti-cheat warning
            this.synth.playClick(300);
            this.showToast('⚠️ ต้องรอครบ 1.00 วินาทีเพื่อป้องกันการสแปม!');
            return;
          }
          this.resolveTurn();
        }
      }

      startTimerLoop() {
        const timerState = this.state.timer;
        timerState.isRunning = true;
        timerState.isLocked = true; // Lock STOP for 1.00s
        timerState.startTime = performance.now();

        const btn = document.getElementById('btn-big-action');
        btn.className = 'big-trigger-btn state-locked';
        document.getElementById('action-btn-main-text').textContent = '🔒 รอ...';
        document.getElementById('action-btn-sub-text').textContent = 'ระบบล็อก 1.0s';

        const lcd = document.getElementById('lcd-timer-display');
        lcd.className = 'lcd-digital-timer running';

        this.synth.playClick(600);

        let lastTickSec = -1;
        let lastHeartbeatSec = -1;

        const updateLoop = () => {
          if (!timerState.isRunning) return;

          const now = performance.now();
          timerState.elapsedMs = now - timerState.startTime;

          // Check 1.00s anti-cheat lock release
          if (timerState.isLocked) {
            const remainingLockMs = Math.max(0, timerState.minLockDurationMs - timerState.elapsedMs);
            if (remainingLockMs <= 0) {
              timerState.isLocked = false;
              btn.className = 'big-trigger-btn state-stop';
              document.getElementById('action-btn-main-text').textContent = 'STOP';
              document.getElementById('action-btn-sub-text').textContent = 'แตะเพื่อหยุด!';
              document.getElementById('lock-status-text').innerHTML = `<span style="color: #4ade80;">✅ ปลดล็อกแล้ว! หยุดให้ไม่โดนเลข <strong>${this.state.forbiddenDigit}</strong></span>`;
              this.synth.playHover();
            } else {
              const lockSeconds = (remainingLockMs / 1000).toFixed(1);
              document.getElementById('lock-status-text').innerHTML = `<span>🔒 ล็อกเพื่อความยุติธรรม (${lockSeconds}s)</span>`;
            }
          }

          // Audio Metronome / Heartbeat rhythm
          const currentSec = Math.floor(timerState.elapsedMs / 1000);
          if (this.state.tier === 1) {
            const dec100 = Math.floor((timerState.elapsedMs % 1000) / 250);
            if (dec100 !== lastTickSec) {
              lastTickSec = dec100;
              this.synth.playTick();
            }
          } else if (this.state.tier === 2) {
            const dec100 = Math.floor((timerState.elapsedMs % 1000) / 180);
            if (dec100 !== lastTickSec) {
              lastTickSec = dec100;
              this.synth.playTick();
            }
          } else {
            // Tier 3: Sub-bass Heartbeat
            if (currentSec !== lastHeartbeatSec) {
              lastHeartbeatSec = currentSec;
              this.synth.playHeartbeat();
            }
          }

          // Render LCD string. DELIBERATELY not coarsened under reduced motion, unlike every other
          // moving thing on this route: the running digits are the mechanic, not decoration -- the
          // player stops the clock by reading them, and a slower cadence would make stopping off the
          // forbidden digit easier. ADR-0046's rule is to reduce the motion without removing the
          // game; here reducing the cadence WOULD remove the game, so the decoration was reduced
          // instead. The route stays readable: the digits are text in the DOM, not a canvas.
          timerState.formattedString = this.formatTime(timerState.elapsedMs, this.state.tier);
          lcd.textContent = timerState.formattedString;

          timerState.rafId = requestAnimationFrame(updateLoop);
        };

        timerState.rafId = requestAnimationFrame(updateLoop);
      }

      stopTimerLoop() {
        const timerState = this.state.timer;
        timerState.isRunning = false;
        if (timerState.rafId) {
          cancelAnimationFrame(timerState.rafId);
          timerState.rafId = null;
        }
      }

      resolveTurn() {
        this.stopTimerLoop();
        const activePlayer = this.state.players[this.state.turnIndex];
        const timeStr = this.state.timer.formattedString;
        const lastDigit = parseInt(timeStr.slice(-1), 10);
        const forbidden = this.state.forbiddenDigit;

        const lcd = document.getElementById('lcd-timer-display');
        const stage = document.getElementById('stopwatch-stage-box');

        if (lastDigit === forbidden) {
          // ==============================
          // HAZARD EXPLOSION! (DEFEAT)
          // ==============================
          lcd.className = 'lcd-digital-timer exploded';
          stage.classList.add('hazard-flash');
          setTimeout(() => stage.classList.remove('hazard-flash'), 600);

          this.synth.playExplosion();
          this.fx.addTrauma(1.0);
          this.fx.spawnExplosion();

          // Open Defeat Modal
          setTimeout(() => {
            this.showDefeatModal(activePlayer, timeStr, lastDigit);
          }, 700);

        } else {
          // ==============================
          // SAFE DODGE! (PASS TO NEXT)
          // ==============================
          lcd.className = 'lcd-digital-timer safe';
          this.synth.playSafeChime();
          this.fx.spawnSafeSparkles();
          this.showToast(`🎉 ปลอดภัย! เลขท้าย ${lastDigit} ไม่ตรงกับเลขห้าม (${forbidden})`);

          // Award score
          activePlayer.score += 1;

          setTimeout(() => {
            this.advanceTurn();
          }, 1200);
        }
      }

      advanceTurn() {
        this.state.turnIndex++;

        // If completed a full cycle across all players
        if (this.state.turnIndex >= this.state.players.length) {
          this.state.turnIndex = 0;
          this.state.cycleCount++;

          // Precision Escalation
          if (this.state.tier < 3) {
            this.state.tier++;
            this.synth.playTierUp();
            this.showToast(`🚀 เลื่อนระดับความเร็วเป็น Tier ${this.state.tier}!`);
          } else {
            this.showToast(`🔥 วงที่ ${this.state.cycleCount} ใน Tier มหาภัย!`);
          }
        }

        this.prepareTurn();
      }

      showDefeatModal(loser, stoppedTime, matchedDigit) {
        document.getElementById('modal-loser-avatar').textContent = loser.avatar;
        document.getElementById('modal-loser-name').textContent = loser.name;
        document.getElementById('modal-stopped-time').textContent = stoppedTime;
        document.getElementById('modal-matched-digit').textContent = matchedDigit;

        // Handle Penalty Mode
        const penaltyBox = document.getElementById('modal-penalty-box');
        if (this.state.penaltyMode === 'none') {
          penaltyBox.style.display = 'none';
        } else {
          penaltyBox.style.display = 'block';
          const randomPenalty = PRESET_PENALTIES[Math.floor(Math.random() * PRESET_PENALTIES.length)];
          document.getElementById('modal-penalty-text').textContent = randomPenalty;
        }

        this.openModal('modal-result');
      }
    }

    // Launch engine on DOMContentLoaded
    window.addEventListener('DOMContentLoaded', () => {
      window.game = new GameEngine();
    });
