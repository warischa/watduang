// Ghost-tap gate (ADR-0014 / ADR-0016 / ADR-0017): the second contact of a double-tap aimed at the
// screen that just went away must not activate the control that replaced it. This route is the gate's
// original consumer -- _arm-gate.ts names it -- and the play-route port dropped the wiring.
// Armed at reveal seams only (setView, each dialog, and every renderDraw, which IS a turn handover).
// NOT armed inside renderSetup: the +/- stick and add-player buttons re-render themselves on every
// tap, and gating those is the per-control exception _arm-gate.ts warns about.
import { armAllButtons } from '../../games/_arm-gate.ts';
// gh#174 / ADR-0054: the party opens on the shared animal cast, never on a column of numbers. Every
// default name on this route comes from here -- the state array it boots with, the placeholder a row
// shows while empty, the fallback for a field left blank, and the seat that + adds. resetCastNames is
// the reset control's wipe: it keeps the count and discards whatever the players typed.
import { MASCOTS, mascotNames, resetCastNames } from '../_mascots.ts';
// gh#184: the inert `+N` seat counter for the scrolling player strip. Behaviour is shared; the look
// lives in this route's overrides.css.
import { mountStripOverflowCounter } from '../_strip-overflow.ts';

    (() => {
      'use strict';

      /* ====================================================
         1. PROCEDURAL SOUND SYNTHESIZER (Web Audio API)
         ==================================================== */
      class SoundSynth {
        constructor() {
          this.ctx = null;
          this.enabled = true;
        }

        init() {
          if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
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
          osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.06);
        }

        playWoodSlide() {
          if (!this.enabled) return;
          this.init();
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          const bufferSize = Math.floor(this.ctx.sampleRate * 0.18);
          const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(800, t);
          filter.frequency.exponentialRampToValueAtTime(1400, t + 0.16);
          filter.Q.setValueAtTime(3.0, t);

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.17);

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          noise.start(t);
          noise.stop(t + 0.18);
        }

        playSafeChime() {
          if (!this.enabled) return;
          this.init();
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          const notes = [523.25, 659.25, 783.99, 1046.50];
          notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const st = t + idx * 0.045;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, st);
            gain.gain.setValueAtTime(0.16, st);
            gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(st);
            osc.stop(st + 0.38);
          });
        }

        playHazardExplosion() {
          if (!this.enabled) return;
          this.init();
          if (!this.ctx) return;
          const t = this.ctx.currentTime;

          const osc = this.ctx.createOscillator();
          const oscGain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(25, t + 0.7);
          oscGain.gain.setValueAtTime(0.5, t);
          oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
          osc.connect(oscGain);
          oscGain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.75);

          const bufSize = Math.floor(this.ctx.sampleRate * 0.6);
          const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
          const out = buf.getChannelData(0);
          for (let i = 0; i < bufSize; i++) out[i] = Math.random() * 2 - 1;
          const noise = this.ctx.createBufferSource();
          noise.buffer = buf;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1200, t);
          filter.frequency.exponentialRampToValueAtTime(80, t + 0.55);

          const nGain = this.ctx.createGain();
          nGain.gain.setValueAtTime(0.6, t);
          nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
          noise.connect(filter);
          filter.connect(nGain);
          nGain.connect(this.ctx.destination);
          noise.start(t);
          noise.stop(t + 0.6);
        }

        playHeartbeat() {
          if (!this.enabled) return;
          this.init();
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(60, t);
          osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.14);
        }

        playVictory() {
          if (!this.enabled) return;
          this.init();
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
          notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const st = t + idx * 0.08;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, st);
            gain.gain.setValueAtTime(0.2, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.45);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(st);
            osc.stop(st + 0.5);
          });
        }
      }

      /* ====================================================
         2. PARTICLE ENGINE (Canvas 2D)
         ==================================================== */
      class ParticleSystem {
        constructor(canvas) {
          this.canvas = canvas;
          this.ctx = canvas.getContext('2d');
          this.particles = [];
          this.resize();
          window.addEventListener('resize', () => this.resize());
          this.loop();
        }

        resize() {
          this.canvas.width = window.innerWidth;
          this.canvas.height = window.innerHeight;
        }

        spawnSparkles(x, y) {
          for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            this.particles.push({
              x, y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 1.5,
              size: 3 + Math.random() * 4,
              color: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6'][Math.floor(Math.random() * 4)],
              alpha: 1,
              decay: 0.03 + Math.random() * 0.02,
              type: 'sparkle'
            });
          }
        }

        spawnConfetti() {
          const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
          for (let i = 0; i < 80; i++) {
            this.particles.push({
              x: Math.random() * this.canvas.width,
              y: -20 - Math.random() * 40,
              vx: (Math.random() - 0.5) * 4,
              vy: 3 + Math.random() * 5,
              rot: Math.random() * 360,
              vRot: (Math.random() - 0.5) * 10,
              size: 8 + Math.random() * 6,
              color: colors[Math.floor(Math.random() * colors.length)],
              alpha: 1,
              decay: 0.008 + Math.random() * 0.005,
              type: 'confetti'
            });
          }
        }

        loop() {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;

            if (p.type === 'confetti') {
              p.rot += p.vRot;
              this.ctx.save();
              this.ctx.translate(p.x, p.y);
              this.ctx.rotate((p.rot * Math.PI) / 180);
              this.ctx.fillStyle = p.color;
              this.ctx.globalAlpha = Math.max(0, p.alpha);
              this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
              this.ctx.restore();
            } else {
              this.ctx.beginPath();
              this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              this.ctx.fillStyle = p.color;
              this.ctx.globalAlpha = Math.max(0, p.alpha);
              this.ctx.fill();
            }

            if (p.alpha <= 0 || p.y > this.canvas.height + 50) {
              this.particles.splice(i, 1);
            }
          }
          requestAnimationFrame(() => this.loop());
        }
      }

      /* ====================================================
         3. GAME STATE & PRESETS
         ==================================================== */
      const GameState = Object.freeze({
        MENU: 'MENU',
        SETUP: 'SETUP',
        ROUND_START: 'ROUND_START',
        TURN_WAIT: 'TURN_WAIT',
        RESOLVING: 'RESOLVING',
        HAZARD_TRIGGERED: 'HAZARD_TRIGGERED',
        ROUND_OVER: 'ROUND_OVER'
      });

      // watduang: three of the mockup's presets are edited, not lifted. The alcohol one ("dium 1 shot"
      // with a clinking-glasses emoji) is barred outright by this site's content rule -- alcohol
      // imagery alone triggers Thai Alcohol Act s.32/1, and the emoji IS an image of branded glasses.
      // The ice-in-the-mouth one and the forehead-flick one are dares toward real physical harm,
      // which is an AdSense account-termination risk. All three are replaced with harmless
      // equivalents in the same register. Everything else in this array is the mockup's own copy.
      const PENALTY_PRESETS = [
        '💸 จ่ายค่าน้ำ / ค่าขนมรอบนี้',
        '🕺 เต้นท่าประจำตัว 15 วินาที',
        '🤫 เล่าความลับ 1 เรื่องที่ไม่มีใครรู้',
        '😜 ให้เพื่อนตั้งฉายาให้ 1 วัน',
        '🎤 ร้องเพลงท่อนฮิต 1 ท่อน',
        '👑 ทำตามคำสั่งคนข้างขวา 1 ข้อ',
        '🤪 ทำหน้าตลกให้ทั้งวงถ่ายรูปเก็บไว้'
      ];

      // The badge beside each name row. Taken from the shared cast rather than kept as the mockup's
      // own list, because the names now come from that cast too and the two lists disagreed row for
      // row -- seat 1 read "แมวส้ม" next to a fox. Longer than the 10-seat ceiling; the modulo below
      // never reaches the tail.
      const AVATARS = MASCOTS.map((m) => m.emoji);

      // One seat's default name. Routed through mascotNames so the wrap past the end of the cast has
      // exactly one definition, in _mascots.ts, and none here.
      const defaultName = (i) => mascotNames(i + 1)[i];

      const draftKey = 'short-stick-pro-v2';
      const sounds = new SoundSynth();
      const particles = new ParticleSystem(document.getElementById('particle-canvas'));

      const game = {
        state: GameState.MENU,
        players: mascotNames(4),
        stickCount: 6,
        shortCount: 1,
        penaltyMode: 'none', // 'none' | 'preset' | 'custom'
        selectedPenalty: '',
        lengths: [],
        shortIndices: [],
        used: [],
        turn: 0,
        drawIndex: 0,
        history: [],
        loser: null,
        isResolving: false
      };

      const $ = (id) => document.getElementById(id);

      // Roster names are typed by players and restored from a saved draft, so they are untrusted
      // text wherever this file builds markup by string. Same helper, same idiom as
      // src/play/freeze-tap/main.js — kept local because each main.js is a verbatim lift with no
      // imports. Pinned by src/play/name-escaping.test.mjs.
      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      /* Trigger Haptic Feedback */
      const triggerHaptic = (pattern) => {
        if ('vibrate' in navigator) {
          try { navigator.vibrate(pattern); } catch (_) {}
        }
      };

      /* Trigger Trauma Shake */
      const triggerShake = () => {
        const app = $('app');
        app.classList.remove('shake-impact');
        void app.offsetWidth;
        app.classList.add('shake-impact');
      };

      /* Storage persistence */
      const loadDraft = () => {
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data.players) && data.players.length >= 2) {
              game.players = data.players.slice(0, 10);
            }
            if (Number.isInteger(data.stickCount)) game.stickCount = Math.max(game.players.length, Math.min(20, data.stickCount));
            if (Number.isInteger(data.shortCount)) game.shortCount = Math.max(1, Math.min(3, data.shortCount));
            if (['none', 'preset', 'custom'].includes(data.penaltyMode)) game.penaltyMode = data.penaltyMode;
            if (typeof data.selectedPenalty === 'string') game.selectedPenalty = data.selectedPenalty;
          }
        } catch (_) {}
      };

      const saveDraft = () => {
        try {
          localStorage.setItem(draftKey, JSON.stringify({
            players: game.players,
            stickCount: game.stickCount,
            shortCount: game.shortCount,
            penaltyMode: game.penaltyMode,
            selectedPenalty: game.selectedPenalty
          }));
        } catch (_) {}
      };

      /* ====================================================
         4. SCREEN & FSM MANAGEMENT
         ==================================================== */
      const setView = (viewName) => {
        ['start', 'setup', 'draw', 'result'].forEach((name) => {
          const el = $(`view-${name}`);
          if (el) {
            const active = name === viewName;
            el.classList.toggle('active', active);
            el.hidden = !active;
          }
        });
        // Every view goes through here, so a view added later is gated with no list to remember.
        const shown = $(`view-${viewName}`);
        if (shown) armAllButtons(shown);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      /** Opens a <dialog> and gates its buttons. The hazard dialog is the sharpest case: it pops
       *  300ms after the tap that revealed the short stick, squarely inside the ghost-tap window. */
      const openDialog = (id) => {
        const dlg = $(id);
        if (!dlg) return;
        dlg.showModal();
        armAllButtons(dlg);
      };

      /** openDialog's counterpart (gh#187): CLOSING a dialog is itself a reveal ADR-0017 gates. The
       *  view underneath was armed when setView showed it and that window closed long ago, which is
       *  exactly why the second contact of a double-tap on a close or cancel control fires the
       *  button behind it -- no rebuild is involved and none is needed. Re-arms whichever view is
       *  live rather than a named one, so a dialog reachable from more than one screen (the rules
       *  dialog opens from both #rules-nav-button and #btn-quick-rules) is covered from all of
       *  them. Closers that transition instead -- the hazard dialog, the leave confirm -- keep
       *  their own setView() call, which arms the view it switches to. */
      const closeDialog = (id) => {
        $(id)?.close();
        const shown = document.querySelector('.view.active');
        if (shown) armAllButtons(shown);
      };

      const calculateOdds = () => {
        const remainingTotal = game.used.filter((u) => !u).length;
        const remainingShorts = game.shortIndices.filter((idx) => !game.used[idx]).length;
        if (remainingTotal === 0 || remainingShorts === 0) {
          return { remaining: 0, percent: 0, text: '0%', isWarning: false, isCritical: false };
        }
        const percent = Number(((remainingShorts / remainingTotal) * 100).toFixed(1));
        return {
          remaining: remainingTotal,
          fraction: `${remainingShorts} in ${remainingTotal}`,
          percent,
          text: `${remainingShorts} in ${remainingTotal} (${percent}%)`,
          isWarning: percent >= 20.0 && percent < 33.3,
          isCritical: percent >= 33.3
        };
      };

      /* ====================================================
         5. RENDER ROUTINES
         ==================================================== */
      // watduang: FAIRNESS LOCK -- one stick per player, exactly one short. Not a style choice.
      // With N sticks for N players and the round ending the instant the short surfaces, the short
      // sits at a uniformly random index (generateLengths shuffles Fisher-Yates), so whichever stick
      // anyone taps, P(the player drawing on turn t is the loser) = 1/N for every t. Let stickCount
      // exceed the player count -- the mockup's default is 6 sticks for 4 players -- and the turn
      // order wraps: the earliest seats get a second draw and a strictly higher chance of losing,
      // which is invisible on screen and is the exact bias src/games/short-stick.ts was written to
      // avoid. shortCount > 1 breaks it the other way: the first short still ends the round, so the
      // hazard front-loads onto the early seats. src/play/short-stick/fairness.test.mjs drives the
      // real generateLengths below and reds against the unlocked counts. The two setup steppers that
      // would change these are hidden in overrides.css.
      const lockFairCounts = () => {
        game.stickCount = game.players.length;
        game.shortCount = 1;
      };

      const renderSetup = () => {
        lockFairCounts();
        $('val-stick-count').textContent = `${game.stickCount} ไม้`;
        $('val-short-count').textContent = `${game.shortCount} คน`;

        $('btn-fewer-sticks').disabled = game.stickCount <= game.players.length;
        $('btn-more-sticks').disabled = game.stickCount >= 20;
        $('btn-fewer-shorts').disabled = game.shortCount <= 1;
        $('btn-more-shorts').disabled = game.shortCount >= Math.min(3, game.players.length - 1);
        $('btn-add-player').disabled = game.players.length >= 10;
        $('btn-add-player').textContent = game.players.length >= 10 ? 'ครบ 10 คนแล้ว' : '+ เพิ่มผู้เล่น';

        // Penalty Mode Selector
        const modeSelect = $('penalty-mode-select');
        modeSelect.value = game.penaltyMode;
        $('penalty-preset-wrapper').style.display = game.penaltyMode === 'preset' ? 'block' : 'none';
        $('penalty-custom-wrapper').style.display = game.penaltyMode === 'custom' ? 'block' : 'none';

        // Render Preset Chips
        const presetContainer = $('preset-chips-container');
        presetContainer.innerHTML = '';
        PENALTY_PRESETS.forEach((preset) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = `chip${game.selectedPenalty === preset ? ' active' : ''}`;
          chip.textContent = preset;
          chip.addEventListener('click', () => {
            sounds.playClick(600);
            game.selectedPenalty = preset;
            saveDraft();
            renderSetup();
          });
          presetContainer.appendChild(chip);
        });

        const customInput = $('penalty-custom-input');
        if (game.penaltyMode === 'custom') {
          customInput.value = game.selectedPenalty;
        }

        // Render Players Input
        const list = $('player-inputs-container');
        list.innerHTML = '';
        game.players.forEach((name, i) => {
          const row = document.createElement('div');
          row.className = 'player-row';
          row.innerHTML = `
            <div class="player-avatar-badge">${AVATARS[i % AVATARS.length]}</div>
            <input class="input player-input" maxlength="15" value="${escapeHtml(name)}" placeholder="${escapeHtml(defaultName(i))}" data-index="${i}">
            <button class="icon-btn remove-p-btn" type="button" data-index="${i}" ${game.players.length <= 2 ? 'disabled' : ''}>✕</button>
          `;
          list.appendChild(row);
        });

        list.querySelectorAll('.player-input').forEach((inp) => {
          inp.addEventListener('input', (e) => {
            game.players[Number(e.target.dataset.index)] = e.target.value.trim() || defaultName(Number(e.target.dataset.index));
            saveDraft();
          });
        });

        list.querySelectorAll('.remove-p-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            // The `disabled` attribute this button renders with is a UI hint, never the invariant, so
            // the floor is enforced HERE. Without it a 2-player party can be cut to 1, and to 0 on a
            // second visit to setup, after which renderDraw divides by a roster of zero.
            // Same condition as the `disabled` expression that renders this button; they move together.
            // gh#188 narrowed the gate -- armAllButtons now preserves a control that was already
            // disabled when it was called, so in a real browser the reflected attribute survives the
            // window. This check stays: it is one line, it does not depend on attribute reflection,
            // and it is the only leg that holds if the row is re-rendered mid-window.
            if (game.players.length <= 2) return;
            sounds.playClick(420);
            game.players.splice(Number(btn.dataset.index), 1);
            saveDraft();
            renderSetup();
          });
        });
      };

      /** gh#174. The wipe the reset confirm guards: the cast goes back to its animal names and the
       *  party keeps its size. resetCastNames only reads the length and never looks inside an entry,
       *  so a typed name cannot survive this call -- that is exactly the loss the confirm names.
       *  Deliberately free of any DOM or storage call: the redraw and the draft write belong to the
       *  handler, which leaves this a pure state move that reset-names.test.mjs can lift out of
       *  main.js and execute without a browser. */
      const resetPlayerNames = () => {
        game.players = resetCastNames(game.players);
      };

      const renderDraw = () => {
        const currentPlayer = game.players[game.turn % game.players.length];
        const odds = calculateOdds();

        $('draw-player-name').textContent = `ตาของ ${currentPlayer}`;
        $('draw-player-avatar').textContent = AVATARS[(game.turn % game.players.length) % AVATARS.length];
        $('draw-round-step').textContent = `ดึงครั้งที่ ${game.drawIndex + 1} · เหลือ ${odds.remaining} ไม้`;

        // The tension pill is gone from the draw board (owner ruling 2026-09-01: roster strip stays,
        // odds pill goes). calculateOdds still feeds the remaining-sticks line and the heartbeat.
        if (odds.isCritical) {
          sounds.playHeartbeat();
        }

        // Render Player Strip
        const strip = $('draw-player-strip');
        strip.innerHTML = '';
        game.players.forEach((p, idx) => {
          const isActive = idx === (game.turn % game.players.length);
          const chip = document.createElement('div');
          chip.className = `strip-chip${isActive ? ' active' : ''}`;
          chip.innerHTML = `<span>${AVATARS[idx % AVATARS.length]}</span> <span>${escapeHtml(p)}</span>`;
          strip.appendChild(chip);
        });
        // After the chips, always: the rebuild above wipes the counter with everything else, and N is
        // measured from the chips that are now in the DOM.
        mountStripOverflowCounter(strip);

        // Render Straws in Cup
        const grid = $('stick-grid');
        grid.innerHTML = '';
        game.lengths.forEach((len, idx) => {
          const isUsed = game.used[idx];
          const isShort = game.shortIndices.includes(idx);

          const unit = document.createElement('div');
          unit.className = `straw-unit${isUsed ? ' used' : ''}${isUsed && isShort ? ' is-short' : ''}`;

          const minLen = Math.min(...game.lengths);
          const maxLen = Math.max(...game.lengths);
          const stickPx = Math.round(55 + (((len - minLen) / Math.max(maxLen - minLen, 1)) * 125));

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'straw-btn';
          btn.disabled = isUsed || game.isResolving;
          btn.style.height = isUsed ? `${stickPx}px` : '180px';
          btn.setAttribute('aria-label', isUsed ? `ไม้ความยาว ${len} ซม.` : `เลือกไม้ที่ ${idx + 1}`);

          btn.addEventListener('click', (e) => {
            const rect = btn.getBoundingClientRect();
            handleDrawStick(idx, unit, rect.left + rect.width / 2, rect.top);
          });

          const label = document.createElement('div');
          label.className = 'straw-length-tag';
          label.textContent = isUsed ? `${len} ซม.` : '';

          unit.appendChild(btn);
          unit.appendChild(label);
          grid.appendChild(unit);
        });

        // The straw buttons are built here, after setView already revealed the panel, and every
        // re-render is a handover to the next player -- so this is the ghost-tap seam, not setView.
        // stick-canvas.ts adds no control of its own: it paints inside these same button boxes.
        const drawView = $('view-draw');
        if (drawView) armAllButtons(drawView);
      };

      const renderResult = () => {
        const loserName = game.loser ? game.loser.player : 'ไม่มีผู้แพ้';
        const loserLen = game.loser ? `${game.loser.length} ซม.` : '';
        $('result-loser-title').textContent = `${loserName} โดนเลือก!`;
        $('result-loser-desc').textContent = `จับได้ไม้สั้นความยาวเพียง ${loserLen}`;

        // Penalty Display Box: Only show if penaltyMode is NOT 'none' and has content
        const penaltyBox = $('result-penalty-box');
        const penaltyText = $('result-penalty-text');
        if (game.penaltyMode !== 'none' && game.selectedPenalty && game.selectedPenalty.trim() !== '') {
          penaltyBox.style.display = 'block';
          penaltyText.textContent = game.selectedPenalty;
        } else {
          penaltyBox.style.display = 'none';
        }

        // History Rows
        const histContainer = $('history-rows-container');
        histContainer.innerHTML = '';
        game.history.forEach((h, i) => {
          const row = document.createElement('div');
          row.className = `history-row${h.isShort ? ' loser' : ''}`;
          row.innerHTML = `
            <div>
              <strong>${i + 1}. ${escapeHtml(h.player)}</strong>
              <span style="font-size:12px; color:var(--muted); margin-left:6px;">(ไม้ที่ ${h.stickIndex + 1})</span>
            </div>
            <div>
              <span style="font-family:var(--font-mono); margin-right:10px;">${h.length} ซม.</span>
              <span>${h.isShort ? '💥 ไม้สั้นสุด' : '✅ รอด'}</span>
            </div>
          `;
          histContainer.appendChild(row);
        });
      };

      /* ====================================================
         6. CORE GAME LOGIC & INTERACTIONS
         ==================================================== */
      const generateLengths = (totalSticks, shortCount) => {
        const lengths = [];
        for (let i = 0; i < shortCount; i++) {
          lengths.push(Math.floor(Math.random() * 5) + 1);
        }
        while (lengths.length < totalSticks) {
          lengths.push(Math.floor(Math.random() * 15) + 6);
        }
        for (let i = lengths.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [lengths[i], lengths[j]] = [lengths[j], lengths[i]];
        }
        return lengths;
      };

      const startMatch = (reusePlayers = false) => {
        sounds.init();
        sounds.playClick(600);
        if (!reusePlayers) {
          const inputs = document.querySelectorAll('.player-input');
          if (inputs.length >= 2) {
            game.players = [...inputs].map((inp, idx) => inp.value.trim() || defaultName(idx));
          }
          if (game.penaltyMode === 'custom') {
            game.selectedPenalty = $('penalty-custom-input').value.trim();
          }
        }
        // watduang: re-applied here, not only in renderSetup -- btn-replay-round calls startMatch
        // directly, and a stickCount restored from an older localStorage draft never passes through
        // renderSetup on that path.
        lockFairCounts();
        saveDraft();

        game.lengths = generateLengths(game.stickCount, game.shortCount);
        
        const sorted = [...game.lengths].sort((a, b) => a - b);
        const shortestValues = sorted.slice(0, game.shortCount);
        game.shortIndices = [];
        game.lengths.forEach((len, idx) => {
          if (shortestValues.includes(len) && game.shortIndices.length < game.shortCount) {
            game.shortIndices.push(idx);
          }
        });

        game.used = Array(game.lengths.length).fill(false);
        game.turn = 0;
        game.drawIndex = 0;
        game.history = [];
        game.loser = null;
        game.isResolving = false;
        game.state = GameState.TURN_WAIT;

        setView('draw');
        renderDraw();
      };

      const handleDrawStick = (stickIndex, unitEl, clientX, clientY) => {
        if (game.used[stickIndex] || game.isResolving) return;

        game.isResolving = true;
        sounds.playWoodSlide();
        triggerHaptic([30]);

        unitEl.classList.add('drawing');

        setTimeout(() => {
          const player = game.players[game.turn % game.players.length];
          const length = game.lengths[stickIndex];
          const isShort = game.shortIndices.includes(stickIndex);

          game.used[stickIndex] = true;
          game.history.push({ player, length, isShort, stickIndex });
          game.drawIndex += 1;
          unitEl.classList.remove('drawing');

          if (isShort) {
            // HAZARD!
            game.loser = { player, length, stickIndex };
            game.state = GameState.HAZARD_TRIGGERED;
            sounds.playHazardExplosion();
            triggerShake();
            triggerHaptic([100, 50, 200, 50, 400]);

            renderDraw();

            setTimeout(() => {
              $('hazard-player-name').textContent = `${player} โดนแล้ว!`;
              $('hazard-stick-len').textContent = `${length} ซม.`;
              openDialog('short-reveal-dialog');
            }, 300);

          } else {
            // SAFE!
            sounds.playSafeChime();
            particles.spawnSparkles(clientX || window.innerWidth / 2, clientY || window.innerHeight / 2);
            triggerHaptic([40]);
            game.turn += 1;
            game.isResolving = false;
            renderDraw();
          }
        }, 450);
      };

      /* ====================================================
         7. EVENT LISTENERS
         ==================================================== */
      loadDraft();

      // Navigation & Dialogs
      $('btn-start-setup').addEventListener('click', () => { sounds.playClick(); renderSetup(); setView('setup'); });
      $('btn-setup-back').addEventListener('click', () => { sounds.playClick(); setView('start'); });
      $('btn-begin-game').addEventListener('click', () => startMatch());
      $('btn-replay-round').addEventListener('click', () => { sounds.playVictory(); particles.spawnConfetti(); startMatch(true); });
      $('btn-edit-players').addEventListener('click', () => { sounds.playClick(); renderSetup(); setView('setup'); });

      // Rules Dialog
      const openRules = () => { sounds.playClick(); openDialog('rules-dialog'); };
      const closeRules = () => { sounds.playClick(); closeDialog('rules-dialog'); };
      $('rules-nav-button').addEventListener('click', openRules);
      $('btn-quick-rules').addEventListener('click', openRules);
      $('btn-close-rules').addEventListener('click', closeRules);
      $('btn-rules-ok').addEventListener('click', closeRules);

      // Short Straw Hazard Dialog
      $('btn-close-hazard').addEventListener('click', () => {
        $('short-reveal-dialog').close();
        game.state = GameState.ROUND_OVER;
        sounds.playVictory();
        particles.spawnConfetti();
        setView('result');
        renderResult();
      });

      // Home & Leave Dialog
      $('home-button').addEventListener('click', () => {
        if (game.state === GameState.TURN_WAIT || game.state === GameState.RESOLVING) {
          sounds.playClick();
          openDialog('leave-dialog');
        } else {
          sounds.playClick();
          setView('start');
        }
      });
      $('btn-close-leave').addEventListener('click', () => closeDialog('leave-dialog'));
      $('btn-cancel-leave').addEventListener('click', () => closeDialog('leave-dialog'));
      $('btn-confirm-leave').addEventListener('click', () => {
        $('leave-dialog').close();
        game.state = GameState.MENU;
        setView('start');
      });

      // Reset Player Names Dialog (gh#174). The question is asked because the answer is destructive:
      // every name a player typed is replaced. The dialog is opened through openDialog, so its two
      // buttons arrive gated -- they appear directly over the control that was just pressed.
      //
      // The copy in markup.html names every loss this causes, which is what
      // docs/agents/src-edit-rules.md requires: all typed names go, and they do not come back. It
      // also names what survives -- the player count and the round settings -- because over-naming
      // is acceptable there and under-naming is not. Both safe branches -- the close X and cancel --
      // precede the destructive button in the markup, so showModal() autofocuses a control that only
      // closes. That ordering is worth keeping, but do NOT rely on it as the guard: openDialog arms
      // the dialog immediately after showModal(), and the blanket disable that follows drops focus
      // off the autofocused X onto <body>. Past that point no button is focused at all, so an Enter
      // still held from the tap that opened this answers nothing -- safer than the ordering claim,
      // but a different mechanism. What actually protects this dialog is the 400ms gate, not the
      // markup order (same outcome as the clear-round confirms in "PlayerSetup.astro", different route).
      $('btn-reset-names').addEventListener('click', () => {
        sounds.playClick();
        openDialog('reset-names-dialog');
      });
      const closeResetNames = () => closeDialog('reset-names-dialog');
      $('btn-close-reset-names').addEventListener('click', closeResetNames);
      $('btn-cancel-reset-names').addEventListener('click', closeResetNames);
      $('btn-confirm-reset-names').addEventListener('click', () => {
        closeResetNames();
        sounds.playClick(420);
        resetPlayerNames();
        saveDraft();
        renderSetup();
        // ADR-0017. renderSetup rebuilds the row X buttons and the preset chips through innerHTML,
        // and the gate setView installed on entry has long since fired and removed itself, so
        // without this the rows come back LIVE under the finger that just confirmed. The second
        // contact of a double-tap on the confirm would land on a row X and remove a player -- the
        // one thing this dialog's own copy promises survives. Same class as zero-trigger's
        // renderPlayerRoster and dice-loser's renderTurn; a reveal with no view change to hang the
        // arming on, so it is armed here.
        const setupView = $('view-setup');
        if (setupView) armAllButtons(setupView);
      });

      // Audio Toggle
      $('audio-toggle').addEventListener('click', () => {
        sounds.enabled = !sounds.enabled;
        $('audio-toggle').textContent = sounds.enabled ? '🔊' : '🔇';
        if (sounds.enabled) sounds.playClick(600);
      });

      // Penalty Mode Dropdown Handler
      $('penalty-mode-select').addEventListener('change', (e) => {
        sounds.playClick(500);
        game.penaltyMode = e.target.value;
        if (game.penaltyMode === 'none') {
          game.selectedPenalty = '';
        } else if (game.penaltyMode === 'preset' && !game.selectedPenalty) {
          game.selectedPenalty = PENALTY_PRESETS[0];
        }
        saveDraft();
        renderSetup();
      });

      $('penalty-custom-input').addEventListener('input', (e) => {
        game.selectedPenalty = e.target.value;
        saveDraft();
      });

      // Setup Steppers
      $('btn-fewer-sticks').addEventListener('click', () => {
        if (game.stickCount > game.players.length) {
          sounds.playClick(440);
          game.stickCount -= 1;
          saveDraft();
          renderSetup();
        }
      });
      $('btn-more-sticks').addEventListener('click', () => {
        if (game.stickCount < 20) {
          sounds.playClick(560);
          game.stickCount += 1;
          saveDraft();
          renderSetup();
        }
      });
      $('btn-fewer-shorts').addEventListener('click', () => {
        if (game.shortCount > 1) {
          sounds.playClick(440);
          game.shortCount -= 1;
          saveDraft();
          renderSetup();
        }
      });
      $('btn-more-shorts').addEventListener('click', () => {
        if (game.shortCount < Math.min(3, game.players.length - 1)) {
          sounds.playClick(560);
          game.shortCount += 1;
          saveDraft();
          renderSetup();
        }
      });
      $('btn-add-player').addEventListener('click', () => {
        if (game.players.length < 10) {
          sounds.playClick(580);
          game.players.push(defaultName(game.players.length));
          saveDraft();
          renderSetup();
        }
      });

    })();
