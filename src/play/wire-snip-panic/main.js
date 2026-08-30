    /**
     * ตัดสายกู้ชีพ (Wire Snip Panic)
     * 6-Wire Progressive Difficulty + Countdown Timer Edition
     */

    // --- 1. PROCEDURAL SOUND SYNTHESIZER ---
    class GameSoundSynth {
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

      // UI Tactile Tap
      playClick(freq = 560) {
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

      // High-Voltage Spark / Arc Discharge
      playSparkZap(stepOrder = 0) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const bufSize = Math.floor(this.ctx.sampleRate * 0.08);
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400 + stepOrder * 500, t);
        filter.Q.setValueAtTime(3.0, t);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.38, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.07);

        noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + 0.08);
      }

      // Metallic Scissors Wire Snip
      playSnip() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1900, t);
        osc.frequency.exponentialRampToValueAtTime(280, t + 0.06);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.07);
      }

      // Ascending Step Chime for Sequence Progress
      playStepChime(stepIndex) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const scale = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];
        const freq = scale[Math.min(stepIndex, scale.length - 1)];

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.3);
      }

      // Safe Defusal Chime (Full Sequence Cleared)
      playDefuseSafe() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [659.25, 880.00, 1174.66, 1318.51];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.06;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.2, st);
          gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.38);
          osc.connect(gain); gain.connect(this.ctx.destination);
          osc.start(st); osc.stop(st + 0.4);
        });
      }

      // Dual-Layer Sub-Bass Detonation Blast
      playExplosion() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // Layer 1: Sub-bass punch
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + 0.85);
        oscGain.gain.setValueAtTime(0.7, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
        osc.connect(oscGain); oscGain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + 0.9);

        // Layer 2: Filtered rumble noise
        const bufSize = Math.floor(this.ctx.sampleRate * 0.75);
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const out = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) out[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);
        filter.frequency.exponentialRampToValueAtTime(60, t + 0.7);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.8, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        noise.connect(filter); filter.connect(nGain); nGain.connect(this.ctx.destination);
        noise.start(t); noise.stop(t + 0.75);
      }

      // Sub-Sine Tension Heartbeat Pulse
      playHeartbeat(fast = false) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(fast ? 80 : 65, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + (fast ? 0.09 : 0.14));
        gain.gain.setValueAtTime(fast ? 0.45 : 0.38, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + (fast ? 0.09 : 0.14));
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t); osc.stop(t + (fast ? 0.1 : 0.16));
      }
    }

    const soundSynth = new GameSoundSynth();

    // --- 2. PARTICLE ENGINE & SCREEN JUICE ---
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function spawnSparks(x, y, colorHex = '#06b6d4', count = 25) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 6.5;
        particles.push({
          type: 'spark',
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2 + Math.random() * 3,
          color: colorHex,
          alpha: 1.0,
          decay: 0.035 + Math.random() * 0.03
        });
      }
    }

    function spawnSafeBurst(x, y) {
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.5;
        particles.push({
          type: 'sparkle',
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          size: 3 + Math.random() * 3.5,
          color: '#10b981',
          alpha: 1.0,
          decay: 0.025 + Math.random() * 0.02
        });
      }
    }

    function spawnExplosionParticles(x, y) {
      for (let i = 0; i < 45; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3.5 + Math.random() * 8.5;
        particles.push({
          type: 'fire',
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 8,
          color: Math.random() > 0.4 ? '#ef4444' : '#f59e0b',
          alpha: 1.0,
          decay: 0.028 + Math.random() * 0.025
        });
      }
      for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.0;
        particles.push({
          type: 'smoke',
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          size: 8 + Math.random() * 14,
          color: '#475569',
          alpha: 0.8,
          decay: 0.015 + Math.random() * 0.015
        });
      }
    }

    function spawnConfetti() {
      const colors = ['#06b6d4', '#ef4444', '#f59e0b', '#10b981', '#a855f7', '#f97316'];
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < 70; i++) {
        particles.push({
          type: 'confetti',
          x: Math.random() * rect.width,
          y: -10 - Math.random() * 50,
          vx: (Math.random() - 0.5) * 3,
          vy: 2.5 + Math.random() * 4,
          rot: Math.random() * 360,
          vrot: (Math.random() - 0.5) * 12,
          w: 8 + Math.random() * 6,
          h: 4 + Math.random() * 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1.0,
          decay: 0.008 + Math.random() * 0.006
        });
      }
    }

    function updateAndRenderParticles() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.type === 'confetti') {
          p.rot += p.vrot;
          p.vy += 0.03;
        } else if (p.type === 'fire' || p.type === 'smoke') {
          p.size *= 0.98;
        }

        if (p.alpha <= 0 || p.y > rect.height + 40) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        if (p.type === 'confetti') {
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rot * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      requestAnimationFrame(updateAndRenderParticles);
    }
    requestAnimationFrame(updateAndRenderParticles);

    // Trauma Screen Shake & Haptics
    function triggerShake() {
      const app = document.getElementById('app');
      app.classList.remove('shake-impact');
      void app.offsetWidth;
      app.classList.add('shake-impact');

      const flash = document.getElementById('flash-overlay');
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), 250);
    }

    function triggerHaptics(type) {
      if (!('vibrate' in navigator)) return;
      try {
        if (type === 'spark') navigator.vibrate([20]);
        if (type === 'cut') navigator.vibrate([35]);
        if (type === 'explosion') navigator.vibrate([120, 50, 220, 50, 450]);
      } catch (_) {}
    }

    // --- 3. GAME STATE & 6-WIRE PALETTE ---
    const GameState = Object.freeze({
      MENU: 'MENU',
      SETUP: 'SETUP',
      TURN_WAIT: 'TURN_WAIT',
      SCANNING_HINTS: 'SCANNING_HINTS',
      CUT_DECISION: 'CUT_DECISION',
      SAFE_RESOLVE: 'SAFE_RESOLVE',
      HAZARD_DETONATE: 'HAZARD_DETONATE',
      ROUND_OVER: 'ROUND_OVER'
    });

    const WIRE_COLORS = [
      { name: 'สีแดง',   hex: '#ef4444', glow: 'rgba(239, 68, 68, 0.7)' },
      { name: 'สีฟ้า',    hex: '#06b6d4', glow: 'rgba(6, 182, 212, 0.7)' },
      { name: 'สีเหลือง', hex: '#f59e0b', glow: 'rgba(245, 158, 11, 0.7)' },
      { name: 'สีเขียว',  hex: '#10b981', glow: 'rgba(16, 185, 129, 0.7)' },
      { name: 'สีม่วง',   hex: '#a855f7', glow: 'rgba(168, 85, 247, 0.7)' },
      { name: 'สีส้ม',    hex: '#f97316', glow: 'rgba(249, 115, 22, 0.7)' }
    ];

    const PLAYER_AVATARS = ['🦊', '🐱', '🐼', '🐰', '🐸', '🐯', '🐵', '🐨', '🦁', '🦄'];

    // Countdown Time Limit Formula:
    // Round 1-3: 5.0s | Round 4-5: 4.0s | Round 6+: 3.0s
    function getRoundTimeLimit(round) {
      if (round <= 3) return 5.0;
      if (round <= 5) return 4.0;
      return 3.0;
    }

    // Game Core State Object
    const game = {
      state: GameState.MENU,
      players: ['ผู้เล่น 1', 'ผู้เล่น 2', 'ผู้เล่น 3', 'ผู้เล่น 4'],
      scores: [0, 0, 0, 0],
      penaltyMode: 'preset',
      selectedPenalty: '💸 เลี้ยงน้ำ/เลี้ยงขนมเพื่อนทั้งวง',
      
      // Match Data
      roundLevel: 1,
      turnRotationIndex: 0,
      currentPlayerIndex: 0,
      
      // 6 Wires Fixed Setup & Alternating Difficulty
      wireCount: 6,
      flashSequence: [],
      currentSequenceStep: 0,
      cutWires: new Set(),
      flashDelay: 520,
      isSpeedUp: false,
      
      // Countdown Timer
      timeLimit: 5.0,
      timeRemaining: 5.0,
      countdownInterval: null,
      
      // Heartbeat Sound Timer
      heartbeatTimer: null,
      scanInterval: null
    };

    // Load LocalStorage
    function loadSavedSettings() {
      try {
        const data = localStorage.getItem('wire-panic-v1');
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed.players) && parsed.players.length >= 2) {
            game.players = parsed.players;
            game.scores = game.players.map(() => 0);
          }
          if (parsed.penaltyMode) game.penaltyMode = parsed.penaltyMode;
          if (parsed.selectedPenalty) game.selectedPenalty = parsed.selectedPenalty;
        }
      } catch (_) {}
    }

    function saveSettings() {
      try {
        localStorage.setItem('wire-panic-v1', JSON.stringify({
          players: game.players,
          penaltyMode: game.penaltyMode,
          selectedPenalty: game.selectedPenalty
        }));
      } catch (_) {}
    }

    // --- 4. 6-WIRE PROCEDURAL ALTERNATING DIFFICULTY GENERATOR ---
    function generateTurnLevel(round) {
      const wireCount = 6;
      let sequenceLength = 2;
      let flashDelay = 520;
      let isSpeedUp = false;

      if (round === 1) {
        sequenceLength = 2;
        flashDelay = 520;
        isSpeedUp = false;
      } else if (round === 2) {
        sequenceLength = 3;
        flashDelay = 520;
        isSpeedUp = false;
      } else {
        const k = round - 3;
        if (k % 2 === 0) {
          // Speed up step!
          const tier = Math.floor(k / 2);
          sequenceLength = Math.min(6, 3 + tier);
          flashDelay = Math.max(220, 320 - (tier * 25));
          isSpeedUp = true;
        } else {
          // Increase flash count, normal base speed!
          const tier = Math.floor((k + 1) / 2);
          sequenceLength = Math.min(6, 3 + tier);
          flashDelay = 520;
          isSpeedUp = false;
        }
      }

      // Sample distinct wires randomly from the 6 wires
      const availableIndices = [0, 1, 2, 3, 4, 5];
      for (let i = availableIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIndices[i], availableIndices[j]] = [availableIndices[j], availableIndices[i]];
      }

      const sequence = availableIndices.slice(0, sequenceLength);
      const timeLimit = getRoundTimeLimit(round);

      return { wireCount, sequence, flashDelay, isSpeedUp, sequenceLength, timeLimit };
    }

    // --- 5. UI CONTROLLERS & RENDERING ---
    function showScreen(screenId) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const target = document.getElementById(screenId);
      if (target) target.classList.add('active');
    }

    function renderSetupPlayerList() {
      const container = document.getElementById('player-list-container');
      container.innerHTML = '';

      game.players.forEach((name, idx) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        const avatar = PLAYER_AVATARS[idx % PLAYER_AVATARS.length];

        row.innerHTML = `
          <div class="player-avatar">${avatar}</div>
          <input type="text" class="player-input" value="${name}" data-idx="${idx}" maxlength="15">
          ${game.players.length > 2 ? `<button class="player-remove-btn" data-idx="${idx}" title="ลบผู้เล่น">✕</button>` : ''}
        `;
        container.appendChild(row);
      });

      document.getElementById('player-count-badge').textContent = `${game.players.length} คน`;

      // Attach event listeners
      container.querySelectorAll('.player-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          const val = e.target.value.trim() || `ผู้เล่น ${idx + 1}`;
          game.players[idx] = val;
          saveSettings();
        });
      });

      container.querySelectorAll('.player-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.idx);
          if (game.players.length > 2) {
            soundSynth.playClick(440);
            game.players.splice(idx, 1);
            game.scores.splice(idx, 1);
            saveSettings();
            renderSetupPlayerList();
          }
        });
      });
    }

    function renderPenaltyUI() {
      document.querySelectorAll('.penalty-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === game.penaltyMode);
      });

      const presetsGrid = document.getElementById('penalty-presets-grid');
      const customInput = document.getElementById('input-custom-penalty');

      if (game.penaltyMode === 'preset') {
        presetsGrid.style.display = 'grid';
        customInput.style.display = 'none';
        document.querySelectorAll('.preset-chip').forEach(chip => {
          chip.classList.toggle('selected', chip.dataset.text === game.selectedPenalty);
        });
      } else if (game.penaltyMode === 'custom') {
        presetsGrid.style.display = 'none';
        customInput.style.display = 'block';
        customInput.value = game.selectedPenalty;
      } else {
        presetsGrid.style.display = 'none';
        customInput.style.display = 'none';
      }
    }

    function renderHUDPlayerStrip() {
      const strip = document.getElementById('hud-player-strip');
      strip.innerHTML = '';

      game.players.forEach((name, idx) => {
        const badge = document.createElement('div');
        badge.className = `player-card-badge ${idx === game.currentPlayerIndex ? 'current' : ''}`;
        const avatar = PLAYER_AVATARS[idx % PLAYER_AVATARS.length];
        badge.innerHTML = `
          <span>${avatar}</span>
          <span>${name}</span>
          <span style="font-size: 10px; opacity: 0.8;">(${game.scores[idx]}★)</span>
        `;
        strip.appendChild(badge);
      });

      const activeBadge = strip.querySelector('.current');
      if (activeBadge) {
        activeBadge.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }

    function renderWiresBay() {
      const bay = document.getElementById('wires-bay');
      bay.innerHTML = '';

      const targetCount = game.flashSequence.length;
      const currentStep = game.currentSequenceStep;

      // Update Odds / Sequence Pill with Speed & Time Status
      const oddsPill = document.getElementById('hud-odds-pill');
      const oddsText = document.getElementById('hud-odds-text');
      
      if (game.isSpeedUp) {
        oddsText.textContent = `⚡ เร่งความเร็ว! (${targetCount} เส้น • ${game.timeLimit.toFixed(1)}วิ)`;
        oddsPill.className = 'odds-pill speed-up';
      } else {
        oddsText.textContent = `🎯 เป้าหมาย ${targetCount} เส้น (เวลา ${game.timeLimit.toFixed(1)}วิ)`;
        oddsPill.className = 'odds-pill' + (targetCount >= 4 ? ' warning' : '');
      }

      // Update Header Text & Initial Timer Badge
      document.getElementById('hud-round-tag').textContent = `รอบที่ ${game.roundLevel}`;
      document.getElementById('lcd-step-indicator').textContent = `ขั้น ${currentStep}/${targetCount}`;
      
      const timerBadge = document.getElementById('lcd-timer-badge');
      timerBadge.textContent = `⏳ ${game.timeRemaining.toFixed(1)}วิ`;
      timerBadge.classList.remove('danger');

      const timerBar = document.getElementById('timer-bar-fill');
      timerBar.style.width = '100%';
      timerBar.className = 'timer-bar-fill';

      for (let i = 0; i < game.wireCount; i++) {
        const color = WIRE_COLORS[i % WIRE_COLORS.length];
        const isCut = game.cutWires.has(i);

        const col = document.createElement('div');
        col.className = `wire-column ${isCut ? 'cut' : ''} ${game.state !== GameState.CUT_DECISION ? 'disabled' : ''}`;
        col.dataset.wireIndex = i;
        col.style.setProperty('--wire-color', color.hex);
        col.style.setProperty('--wire-glow', color.glow);

        // Curve variation for 6 wires
        const curveOffset = (i - 2.5) * 12;
        const cp1x = 50 + curveOffset;
        const cp2x = 50 - curveOffset;

        col.innerHTML = `
          <div class="wire-terminal top">
            <div class="terminal-led" id="led-top-${i}"></div>
          </div>
          <div class="wire-svg-wrap">
            <svg class="wire-svg" viewBox="0 0 100 160" preserveAspectRatio="none">
              ${isCut ? `
                <!-- Severed Top Half -->
                <path d="M 50 0 C ${cp1x} 35, 40 55, 30 75" class="wire-path-shadow" />
                <path d="M 50 0 C ${cp1x} 35, 40 55, 30 75" stroke="${color.hex}" class="wire-path-main" />
                <circle cx="30" cy="75" r="3.5" fill="#f59e0b" filter="drop-shadow(0 0 4px #f59e0b)" />

                <!-- Severed Bottom Half -->
                <path d="M 70 85 C 60 105, ${cp2x} 125, 50 160" class="wire-path-shadow" />
                <path d="M 70 85 C 60 105, ${cp2x} 125, 50 160" stroke="${color.hex}" class="wire-path-main" />
                <circle cx="70" cy="85" r="3.5" fill="#f59e0b" filter="drop-shadow(0 0 4px #f59e0b)" />
              ` : `
                <!-- Intact Cable -->
                <path d="M 50 0 C ${cp1x} 50, ${cp2x} 110, 50 160" class="wire-path-shadow" />
                <path d="M 50 0 C ${cp1x} 50, ${cp2x} 110, 50 160" stroke="${color.hex}" class="wire-path-main" />
                <path d="M 50 0 C ${cp1x} 50, ${cp2x} 110, 50 160" class="wire-path-core" />
              `}
            </svg>
          </div>
          <div class="wire-terminal bottom">
            <div class="terminal-led" id="led-bottom-${i}"></div>
          </div>
          <div class="wire-label-tag">#${i + 1} ${color.name}</div>
        `;

        if (!isCut) {
          col.addEventListener('click', (e) => handleWireClick(i, e));
        }

        bay.appendChild(col);
      }
    }

    // --- 6. GAME ENGINE, TURN ACTIONS & COUNTDOWN TIMER ---
    function startMatch() {
      game.roundLevel = 1;
      game.currentPlayerIndex = 0;
      game.turnRotationIndex = 0;
      game.scores = game.players.map(() => 0);
      setupTurn();
    }

    function setupTurn() {
      // Clear previous states & timers
      clearInterval(game.scanInterval);
      clearInterval(game.heartbeatTimer);
      clearInterval(game.countdownInterval);
      game.cutWires.clear();
      game.currentSequenceStep = 0;

      // Generate turn level configuration
      const config = generateTurnLevel(game.roundLevel);
      game.wireCount = config.wireCount;
      game.flashSequence = config.sequence;
      game.flashDelay = config.flashDelay;
      game.isSpeedUp = config.isSpeedUp;
      game.timeLimit = config.timeLimit;
      game.timeRemaining = config.timeLimit;

      game.state = GameState.TURN_WAIT;

      showScreen('screen-game');
      renderHUDPlayerStrip();
      renderWiresBay();

      // UI Text
      const currentPlayerName = game.players[game.currentPlayerIndex];
      document.getElementById('current-turn-player-name').textContent = currentPlayerName;
      document.getElementById('lcd-main-status').textContent = 'พร้อมเริ่ม';
      document.getElementById('lcd-main-status').style.color = 'var(--electric-cyan)';
      
      const speedHint = game.isSpeedUp ? '⚡ [เร่งความเร็ว]' : '🎯 [ปกติ]';
      document.getElementById('lcd-sub-status').textContent = `ส่งให้ ${currentPlayerName} (${game.flashSequence.length} เส้น • ${game.timeLimit.toFixed(1)}วิ ${speedHint})`;
      
      const actionBanner = document.getElementById('turn-action-banner');
      actionBanner.style.display = 'flex';
      const scanBtn = document.getElementById('btn-trigger-scan');
      scanBtn.style.display = 'flex';
      scanBtn.disabled = false;
    }

    function triggerScanSequence() {
      if (game.state !== GameState.TURN_WAIT) return;
      soundSynth.playClick(620);
      triggerHaptics('spark');

      game.state = GameState.SCANNING_HINTS;
      document.getElementById('btn-trigger-scan').disabled = true;
      document.getElementById('lcd-main-status').textContent = game.isSpeedUp ? '⚡ กำลังสแกนความเร็วสูง...' : 'จำลำดับสายไฟ!';
      document.getElementById('lcd-main-status').style.color = game.isSpeedUp ? '#ef4444' : 'var(--warning)';
      document.getElementById('lcd-sub-status').textContent = `จำลำดับสายไฟ (${game.flashSequence.length} เส้น)...`;

      let step = 0;
      const sequence = game.flashSequence;

      setTimeout(() => {
        game.scanInterval = setInterval(() => {
          if (step >= sequence.length) {
            clearInterval(game.scanInterval);
            setTimeout(() => {
              enterCutDecision();
            }, 260);
            return;
          }

          const wireIdx = sequence[step];
          flashWire(wireIdx, step);
          step++;
        }, game.flashDelay);
      }, 200);
    }

    function flashWire(wireIndex, stepOrder) {
      const wireCol = document.querySelector(`.wire-column[data-wire-index="${wireIndex}"]`);
      if (!wireCol) return;

      wireCol.classList.add('flashing');
      soundSynth.playSparkZap(stepOrder);
      triggerHaptics('spark');

      const colorInfo = WIRE_COLORS[wireIndex % WIRE_COLORS.length];
      document.getElementById('lcd-sub-status').textContent = `เส้นที่ ${stepOrder + 1}/${game.flashSequence.length}: สาย #${wireIndex + 1} (${colorInfo.name})`;

      // Spark particles at wire center
      const rect = wireCol.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const px = rect.left - canvasRect.left + rect.width / 2;
      const py = rect.top - canvasRect.top + rect.height / 2;
      spawnSparks(px, py, colorInfo.hex, 20);

      setTimeout(() => {
        wireCol.classList.remove('flashing');
      }, game.flashDelay * 0.72);
    }

    function enterCutDecision() {
      game.state = GameState.CUT_DECISION;
      game.currentSequenceStep = 0;
      game.timeRemaining = game.timeLimit;

      document.getElementById('lcd-main-status').textContent = `ตัดตามลำดับ! (1/${game.flashSequence.length})`;
      document.getElementById('lcd-main-status').style.color = '#ef4444';
      document.getElementById('lcd-sub-status').textContent = `ตัดตามลำดับให้ทันเวลา! (เส้นที่ 1/${game.flashSequence.length})`;
      document.getElementById('btn-trigger-scan').style.display = 'none';

      renderWiresBay();

      // Start Heartbeat Sound Pulse
      game.heartbeatTimer = setInterval(() => {
        if (game.state === GameState.CUT_DECISION) {
          const isUrgent = game.timeRemaining <= 1.5;
          soundSynth.playHeartbeat(isUrgent);
        }
      }, 800);

      // Start High-Resolution Countdown Timer (50ms interval)
      const timerBadge = document.getElementById('lcd-timer-badge');
      const timerBar = document.getElementById('timer-bar-fill');

      game.countdownInterval = setInterval(() => {
        if (game.state !== GameState.CUT_DECISION) {
          clearInterval(game.countdownInterval);
          return;
        }

        game.timeRemaining = Math.max(0, game.timeRemaining - 0.05);
        const percent = (game.timeRemaining / game.timeLimit) * 100;
        
        timerBadge.textContent = `⏳ ${game.timeRemaining.toFixed(1)}วิ`;
        timerBar.style.width = `${percent}%`;

        if (game.timeRemaining <= 1.5) {
          timerBadge.classList.add('danger');
          timerBar.className = 'timer-bar-fill danger';
        } else if (game.timeRemaining <= game.timeLimit * 0.5) {
          timerBar.className = 'timer-bar-fill warning';
        }

        // TIMEOUT DETONATION!
        if (game.timeRemaining <= 0.001) {
          clearInterval(game.countdownInterval);
          handleDetonation(null, 'หมดเวลาการตัดสายไฟ! (TIMEOUT)');
        }
      }, 50);
    }

    function handleWireClick(wireIndex, event) {
      if (game.state !== GameState.CUT_DECISION) return;
      if (game.cutWires.has(wireIndex)) return;

      soundSynth.playSnip();
      triggerHaptics('cut');

      // Scissor tool animation
      const scissor = document.getElementById('scissor-tool');
      if (event && scissor) {
        scissor.style.left = `${event.clientX}px`;
        scissor.style.top = `${event.clientY}px`;
        scissor.style.display = 'block';
        scissor.style.transform = 'translate(-50%, -50%) scale(1.3) rotate(-20deg)';
        setTimeout(() => {
          scissor.style.transform = 'translate(-50%, -50%) scale(1.0) rotate(15deg)';
          setTimeout(() => scissor.style.display = 'none', 180);
        }, 100);
      }

      const expectedWireIndex = game.flashSequence[game.currentSequenceStep];

      // Check if player cut the correct wire in sequence
      if (wireIndex === expectedWireIndex) {
        // CORRECT WIRE IN SEQUENCE
        game.cutWires.add(wireIndex);
        soundSynth.playStepChime(game.currentSequenceStep);

        const wireCol = document.querySelector(`.wire-column[data-wire-index="${wireIndex}"]`);
        if (wireCol) {
          const rect = wireCol.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          const px = rect.left - canvasRect.left + rect.width / 2;
          const py = rect.top - canvasRect.top + rect.height / 2;
          spawnSafeBurst(px, py);
        }

        game.currentSequenceStep++;

        if (game.currentSequenceStep >= game.flashSequence.length) {
          // ALL WIRES CUT SUCCESSFULLY WITHIN TIME!
          handleSequenceCleared();
        } else {
          // PROCEED TO NEXT STEP IN SEQUENCE
          document.getElementById('lcd-main-status').textContent = `ตัดเส้นถัดไป! (${game.currentSequenceStep + 1}/${game.flashSequence.length})`;
          document.getElementById('lcd-sub-status').textContent = `ตัดเส้นถัดไป (เส้นที่ ${game.currentSequenceStep + 1}/${game.flashSequence.length})`;
          renderWiresBay();
        }
      } else {
        // WRONG WIRE OR WRONG ORDER -> BOOM!
        const targetColor = WIRE_COLORS[expectedWireIndex % WIRE_COLORS.length].name;
        handleDetonation(wireIndex, `ตัดผิดลำดับ! (ต้องเป็นสาย #${expectedWireIndex + 1} ${targetColor})`);
      }
    }

    function handleSequenceCleared() {
      game.state = GameState.SAFE_RESOLVE;
      clearInterval(game.heartbeatTimer);
      clearInterval(game.countdownInterval);
      soundSynth.playDefuseSafe();
      triggerHaptics('cut');

      document.getElementById('lcd-main-status').textContent = 'ปลดชนวนสำเร็จ!';
      document.getElementById('lcd-main-status').style.color = 'var(--success)';
      document.getElementById('lcd-sub-status').textContent = 'ถูกต้องครบทุกเส้น! ปลอดภัย';

      renderWiresBay();

      // Advance Turn after celebration delay
      setTimeout(() => {
        advanceTurn();
      }, 1200);
    }

    function advanceTurn() {
      // Award point for surviving a turn
      game.scores[game.currentPlayerIndex] += 1;

      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      game.turnRotationIndex++;

      // When full rotation completes, escalate round level
      if (game.turnRotationIndex % game.players.length === 0) {
        game.roundLevel++;
      }

      setupTurn();
    }

    function handleDetonation(wireIndex, reasonText = 'ตัดผิดลำดับสายไฟ!') {
      game.state = GameState.HAZARD_DETONATE;
      clearInterval(game.heartbeatTimer);
      clearInterval(game.countdownInterval);
      soundSynth.playExplosion();
      triggerShake();
      triggerHaptics('explosion');

      document.getElementById('lcd-main-status').textContent = 'ระเบิดทำงาน!';
      document.getElementById('lcd-main-status').style.color = '#ef4444';
      document.getElementById('lcd-sub-status').textContent = reasonText;
      document.getElementById('detonation-reason-text').textContent = reasonText;

      // Explosion Particles at bomb center
      const chassis = document.getElementById('bomb-chassis');
      const rect = chassis.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const px = rect.left - canvasRect.left + rect.width / 2;
      const py = rect.top - canvasRect.top + rect.height / 2;
      spawnExplosionParticles(px, py);

      renderWiresBay();

      // Show Round Over Modal after short dramatic delay
      setTimeout(() => {
        showDetonationModal();
      }, 850);
    }

    function showDetonationModal() {
      game.state = GameState.ROUND_OVER;
      const modal = document.getElementById('modal-detonation');
      const loserIndex = game.currentPlayerIndex;
      const loserName = game.players[loserIndex];

      document.getElementById('loser-avatar-display').textContent = PLAYER_AVATARS[loserIndex % PLAYER_AVATARS.length];
      document.getElementById('loser-name-display').textContent = loserName;

      // Penalty Display
      const penaltyBox = document.getElementById('penalty-result-container');
      const penaltyText = document.getElementById('penalty-result-text');
      if (game.penaltyMode !== 'none' && game.selectedPenalty) {
        penaltyBox.style.display = 'block';
        penaltyText.textContent = `บทลงโทษ: ${game.selectedPenalty}`;
      } else {
        penaltyBox.style.display = 'none';
      }

      // Scoreboard
      const scoreboard = document.getElementById('scoreboard-container');
      scoreboard.innerHTML = '';
      game.players.forEach((name, idx) => {
        const row = document.createElement('div');
        row.className = 'score-row';
        const isLoser = idx === loserIndex;
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>${PLAYER_AVATARS[idx % PLAYER_AVATARS.length]}</span>
            <span style="${isLoser ? 'color: var(--accent); text-decoration: line-through;' : ''}">${name}</span>
            ${isLoser ? '<span style="color: var(--accent); font-size: 11px;">(แพ้รอบนี้)</span>' : ''}
          </div>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--electric-cyan);">
            ${game.scores[idx]} แต้ม
          </div>
        `;
        scoreboard.appendChild(row);
      });

      modal.classList.add('active');
      spawnConfetti();
    }

    // --- 7. EVENT LISTENERS & INITIALIZATION ---
    function attachEventListeners() {
      // Audio autoplay unlock on any first touch/click
      document.addEventListener('pointerdown', () => soundSynth.init(), { once: true });
      document.addEventListener('keydown', () => soundSynth.init(), { once: true });

      // Header Buttons
      document.getElementById('btn-home').addEventListener('click', () => {
        soundSynth.playClick();
        clearInterval(game.scanInterval);
        clearInterval(game.heartbeatTimer);
        clearInterval(game.countdownInterval);
        document.getElementById('modal-detonation').classList.remove('active');
        document.getElementById('modal-rules').classList.remove('active');
        game.state = GameState.MENU;
        showScreen('screen-menu');
      });

      document.getElementById('btn-sound-toggle').addEventListener('click', () => {
        soundSynth.enabled = !soundSynth.enabled;
        document.getElementById('sound-icon').textContent = soundSynth.enabled ? '🔊' : '🔇';
        if (soundSynth.enabled) soundSynth.playClick();
      });

      document.getElementById('btn-rules').addEventListener('click', () => {
        soundSynth.playClick();
        document.getElementById('modal-rules').classList.add('active');
      });

      document.getElementById('btn-close-rules').addEventListener('click', () => {
        soundSynth.playClick();
        document.getElementById('modal-rules').classList.remove('active');
      });

      // Menu Buttons
      document.getElementById('btn-menu-start').addEventListener('click', () => {
        soundSynth.playClick();
        game.state = GameState.SETUP;
        showScreen('screen-setup');
        renderSetupPlayerList();
        renderPenaltyUI();
      });

      document.getElementById('btn-menu-rules').addEventListener('click', () => {
        soundSynth.playClick();
        document.getElementById('modal-rules').classList.add('active');
      });

      // Setup Buttons
      document.getElementById('btn-setup-back').addEventListener('click', () => {
        soundSynth.playClick();
        game.state = GameState.MENU;
        showScreen('screen-menu');
      });

      document.getElementById('btn-add-player').addEventListener('click', () => {
        const input = document.getElementById('input-new-player');
        const name = input.value.trim() || `ผู้เล่น ${game.players.length + 1}`;
        if (game.players.length < 10) {
          soundSynth.playClick(600);
          game.players.push(name);
          game.scores.push(0);
          input.value = '';
          saveSettings();
          renderSetupPlayerList();
        }
      });

      // Penalty Tab Selection
      document.querySelectorAll('.penalty-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          soundSynth.playClick();
          game.penaltyMode = e.currentTarget.dataset.mode;
          saveSettings();
          renderPenaltyUI();
        });
      });

      // Penalty Presets
      document.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          soundSynth.playClick();
          game.selectedPenalty = e.currentTarget.dataset.text;
          saveSettings();
          renderPenaltyUI();
        });
      });

      document.getElementById('input-custom-penalty').addEventListener('input', (e) => {
        game.selectedPenalty = e.target.value.trim();
        saveSettings();
      });

      // Start Match CTA
      document.getElementById('btn-start-match').addEventListener('click', () => {
        soundSynth.playClick(750);
        startMatch();
      });

      // Scan Hint CTA
      document.getElementById('btn-trigger-scan').addEventListener('click', () => {
        triggerScanSequence();
      });

      // Modal Detonation Action Buttons
      document.getElementById('btn-replay-match').addEventListener('click', () => {
        soundSynth.playClick(650);
        document.getElementById('modal-detonation').classList.remove('active');
        startMatch();
      });

      document.getElementById('btn-edit-players').addEventListener('click', () => {
        soundSynth.playClick();
        document.getElementById('modal-detonation').classList.remove('active');
        game.state = GameState.SETUP;
        showScreen('screen-setup');
        renderSetupPlayerList();
        renderPenaltyUI();
      });

      // Keyboard Shortcuts (Desktop Accessibility 1-6)
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.getElementById('modal-rules').classList.remove('active');
        } else if (e.key === ' ' || e.key === 'Enter') {
          if (game.state === GameState.TURN_WAIT) {
            triggerScanSequence();
          }
        } else if (e.key >= '1' && e.key <= '6') {
          const wireIdx = parseInt(e.key) - 1;
          if (wireIdx >= 0 && wireIdx < game.wireCount) {
            handleWireClick(wireIdx, null);
          }
        } else if (e.key === 'm' || e.key === 'M') {
          soundSynth.enabled = !soundSynth.enabled;
          document.getElementById('sound-icon').textContent = soundSynth.enabled ? '🔊' : '🔇';
        }
      });
    }

    // Initialize App on DOM Load
    window.addEventListener('DOMContentLoaded', () => {
      loadSavedSettings();
      attachEventListeners();
    });
