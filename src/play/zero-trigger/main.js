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

    /**
     * PARTICLE & SCREEN SHAKE ENGINE
     * Implements gamedev-skills/skills/game-juice-and-polish specification
     */
    class FXEngine {
      constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.trauma = 0.0;
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
        this.trauma = Math.min(1.0, this.trauma + amount);
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 200, 50, 400]);
        }
      }

      spawnSafeSparkles(x, y) {
        if (navigator.vibrate) navigator.vibrate(40);
        for (let i = 0; i < 30; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 5;
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
        const cx = x || this.canvas.width / 2;
        const cy = y || this.canvas.height / 2;

        // Fireballs
        for (let i = 0; i < 50; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 9;
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
        for (let i = 0; i < 25; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 6;
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
        const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
        for (let i = 0; i < 70; i++) {
          this.particles.push({
            type: 'confetti',
            x: Math.random() * this.canvas.width,
            y: -20 - Math.random() * 50,
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 4,
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
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Screen Shake processing
        const appContainer = document.getElementById('app-container');
        if (this.trauma > 0) {
          this.trauma = Math.max(0, this.trauma - dt * 2.2);
          const shake = Math.pow(this.trauma, 2);
          const maxOffset = 18; // px
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
    const AVATAR_LIST = ['🦊', '🐼', '🐯', '🐰', '🐸', '🐱', '🐶', '🦄', '🦁', '🐨', '🐵', '🐙', '🦖', '🐲', '👽'];
    
    // watduang: roster names are typed by players and reach this file from the shared roster, so
    // they are untrusted text wherever it builds markup by string. Same helper and same idiom as
    // src/play/cannon-flag/main.js -- kept local because a lift file with an import loses the
    // thai-comments verbatim exemption. Applied at the three innerHTML sinks that print a name.
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // watduang: TWO strings in this port are edited, not lifted, and both for the same reason -- the
    // mockup's first preset here, and the placeholder inside `#modal-penalty-text` in markup.html
    // (which this file overwrites at runtime anyway). Each was a drink-a-glass dare carrying a beer
    // emoji; this site bars alcohol copy AND alcohol imagery outright, because the imagery alone
    // triggers Thai Alcohol Act s.32/1 -- and an emoji of a glass IS that imagery. The note lives
    // here rather than beside the markup one because an HTML comment SHIPS: it was measured in
    // dist/game/zero-trigger/play/index.html before being moved. Replaced with harmless lines in the
    // same register. Every other entry below is the mockup's own copy.
    const PRESET_PENALTIES = [
      'ร้องเพลงท่อนฮิต 1 ท่อนให้ทั้งวงฟัง! 🎤',
      'เลี้ยงขนมเพื่อนคนละ 1 อย่าง! 🧋',
      'โดนทำหน้าตลกให้ทุกคนถ่ายรูป! 📸',
      'วิดพื้น 10 ครั้ง หรือกระโดดตบ 15 ครั้ง! 💪',
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
          players: [
            { id: 1, name: 'ผู้เล่น 1', avatar: '🦊', score: 0 },
            { id: 2, name: 'ผู้เล่น 2', avatar: '🐼', score: 0 }
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
                avatar: p.avatar || '🦊',
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
        if (target) target.classList.add('active');

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
        if (modal) modal.classList.add('active');
      }

      closeModal(modalId) {
        this.synth.playClick();
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
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
            this.state.players[index].name = e.target.value.trim() || `ผู้เล่น ${index + 1}`;
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
          name: `ผู้เล่น ${nextId}`,
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
          badge.style.transform = `scale(${1 + (rolls % 2) * 0.15})`;
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

          // Render LCD string
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
