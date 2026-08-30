// The one rule this game turns on, imported rather than re-implemented — see src/games/how-close-is-near.ts
// for why it lives there and how-close-is-near.test.mjs for what pins it. The .ts extension is
// spelled out the way manifest.ts does it.
import {
  MIN_NUMBER,
  MAX_NUMBER,
  NEAREST_LOSES,
  FARTHEST_LOSES,
  distanceTo,
  pickConflict,
  resolveLoser,
  drawTarget,
} from '../../games/how-close-is-near.ts';

    /**
     * Procedural Web Audio Synthesizer
     * Zero external asset dependencies.
     */
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

      toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
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
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.06);
      }

      playReject() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        // Buzz sawtooth
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.setValueAtTime(110, t + 0.1);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      }

      playLock() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [587.33, 880].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.07;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.22, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(st);
          osc.stop(st + 0.26);
        });
      }

      playReveal() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [440, 554.37, 659.25, 880, 1108.73];
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const st = t + idx * 0.08;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.28, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.6);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(st);
          osc.stop(st + 0.65);
        });
      }

      playLoser() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(65, t + 0.7);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.8);
      }
    }

    const sound = new SoundSynth();

    /**
     * Particle FX Engine (2D Canvas)
     */
    // ADR-0046: the CSS media query cannot reach JS-driven motion, so the query is spelled here, in
    // the same file as the motion it gates — a comment mentioning it does not count. It is READ PER
    // CALL rather than cached, so toggling the OS setting mid-round takes effect without a reload.
    // The answer is REDUCE, not remove: 0.25, never 0.
    function motionScale() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 1;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    }

    class ParticleEngine {
      constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        // ADR-0051: this route must NEVER blank the page when the drawing context is unavailable.
        // This engine is constructed at module top level, above every render call, so an unguarded
        // `this.canvas.getContext(...)` throwing here aborted the whole module and left
        // #screenContainer empty — a blank screen, not a game missing its confetti. The particles are
        // decoration; the game is the numbers. Degrade to a no-op and let the round run.
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.enabled = Boolean(this.ctx);
        this.particles = [];
        if (!this.enabled) return;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
      }

      resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }

      burst(x, y, count = 60) {
        if (!this.enabled) return;
        // ADR-0046: reduced motion REDUCES the burst, it does not delete it. A player who asked for
        // less motion still gets the "you lost" moment, at a fraction of the particles.
        count = Math.max(1, Math.round(count * motionScale()));
        const colors =['#f472b6', '#a855f7', '#6366f1', '#38bdf8', '#34d399', '#fbbf24', '#f87171'];
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 8;
          this.particles.push({
            x: x !== undefined ? x : this.canvas.width / 2,
            y: y !== undefined ? y : this.canvas.height * 0.4,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            gravity: 0.15,
            size: 4 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            decay: 0.012 + Math.random() * 0.018,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.2
          });
        }
      }

      loop() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.rot += p.vRot;
          p.alpha -= p.decay;

          if (p.alpha <= 0) {
            this.particles.splice(i, 1);
            continue;
          }

          this.ctx.save();
          this.ctx.globalAlpha = Math.max(0, p.alpha);
          this.ctx.fillStyle = p.color;
          this.ctx.translate(p.x, p.y);
          this.ctx.rotate(p.rot);
          this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          this.ctx.restore();
        }
        requestAnimationFrame(this.loop);
      }
    }

    const fx = new ParticleEngine('particlesCanvas');

    /**
     * DOM Screen Trauma Shake
     */
    let trauma = 0;
    function addTrauma(amount = 0.5) {
      trauma = Math.min(1.0, trauma + amount);
      if (navigator.vibrate) {
        try { navigator.vibrate(80); } catch(e) {}
      }
    }
    function updateTraumaLoop() {
      const root = document.getElementById('appRoot');
      if (trauma > 0) {
        trauma = Math.max(0, trauma - 0.04);
        // ADR-0046 again: the screen still acknowledges the hit, at a quarter of the throw.
        const shake = Math.pow(trauma, 2) * 12 * motionScale();
        const ox = (Math.random() - 0.5) * shake;
        const oy = (Math.random() - 0.5) * shake;
        root.style.transform = `translate(${ox}px, ${oy}px)`;
      } else {
        root.style.transform = 'none';
      }
      requestAnimationFrame(updateTraumaLoop);
    }
    requestAnimationFrame(updateTraumaLoop);

    /**
     * Core Game Engine & FSM
     */
    const GameState = Object.freeze({
      PLAYER_COUNT: 'player_count',
      PLAYER_NAMES: 'player_names',
      LOSE_CONDITION: 'lose_condition',
      SECRECY_NOTICE: 'secrecy_notice',
      TURN_INTRO: 'turn_intro',
      NUMBER_ENTRY: 'number_entry',
      PICK_LOCKED: 'pick_locked',
      PASS_DEVICE: 'pass_device',
      REVEAL: 'reveal',
      RESULTS: 'results'
    });

    // The lose condition and the whole distance rule come from the game module, which is where the
    // site's ONE implementation of "who loses" lives and where how-close-is-near.test.mjs pins it.
    // The mockup's own copy of this logic was deleted with this import: two implementations of one
    // game is a debt paid at every future edit (the ruling recorded in src/games/power-meter.ts).
    const LoseCondition = Object.freeze({
      NEAREST_LOSES,
      FARTHEST_LOSES
    });

    class GameModel {
      constructor() {
        this.state = GameState.PLAYER_COUNT;
        this.playerCount = 3;
        this.players = []; // [{ id, name, originalOrder }]
        this.loseCondition = LoseCondition.NEAREST_LOSES;
        this.secretTarget = 0;
        this.currentTurnIndex = 0;
        this.acceptedPicks = {}; // { [playerId]: { number, distance } }
        // Bookkeeping only since the conflict decision moved into pickConflict, which reads
        // takenPicks(). Kept because the built-in deterministic test runner below asserts a rematch
        // clears them, and they are still cleared in lockstep with acceptedPicks.
        this.usedNumbers = new Set();
        this.usedDistances = new Set();
        this.finalLoserId = null;
        this.isSubmitting = false; // double-submit guard
        this.customRandomFn = null; // For deterministic test mocking
      }

      setCustomRandom(fn) {
        this.customRandomFn = fn;
      }

      generateSecretTarget() {
        if (typeof this.customRandomFn === 'function') {
          this.secretTarget = this.customRandomFn();
          return this.secretTarget;
        }

        // Crypto-quality source with rejection sampling, fed through drawTarget so the RANGE is
        // owned in one place (the module) and the ENTROPY here. The rejection loop keeps the modulo
        // unbiased; without it the low values of 0..100 would come up fractionally more often.
        if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
          const range = MAX_NUMBER - MIN_NUMBER + 1;
          const maxUint32 = 0x100000000;
          const limit = maxUint32 - (maxUint32 % range);
          const buf = new Uint32Array(1);
          let val;
          do {
            window.crypto.getRandomValues(buf);
            val = buf[0];
          } while (val >= limit);
          this.secretTarget = drawTarget(() => val / limit);
        } else {
          this.secretTarget = drawTarget();
        }
        return this.secretTarget;
      }

      initPlayers(names) {
        this.players = [];
        for (let i = 0; i < this.playerCount; i++) {
          const rawName = names && names[i] ? names[i].trim() : '';
          const displayName = rawName || `ผู้เล่น ${i + 1}`;
          this.players.push({
            id: `p_${i + 1}`,
            name: displayName,
            originalOrder: i
          });
        }
      }

      startNewGame() {
        this.generateSecretTarget();
        this.currentTurnIndex = 0;
        this.acceptedPicks = {};
        this.usedNumbers.clear();
        this.usedDistances.clear();
        this.finalLoserId = null;
        this.isSubmitting = false;
        this.state = GameState.SECRECY_NOTICE;
      }

      rematch() {
        this.generateSecretTarget();
        this.currentTurnIndex = 0;
        this.acceptedPicks = {};
        this.usedNumbers.clear();
        this.usedDistances.clear();
        this.finalLoserId = null;
        this.isSubmitting = false;
        this.state = GameState.SECRECY_NOTICE;
      }

      getCurrentPlayer() {
        return this.players[this.currentTurnIndex] || null;
      }

      /** Every pick committed so far, in turn order — the input pickConflict and resolveLoser take.
       *  Derived from acceptedPicks, which is the one record of what was actually committed. */
      takenPicks() {
        return this.players
          .map((p) => this.acceptedPicks[p.id])
          .filter((pick) => pick !== undefined);
      }

      validateAndCommitPick(candidateNumber) {
        if (this.isSubmitting) return { success: false, reason: 'BUSY' };
        this.isSubmitting = true;

        const num = Number(candidateNumber);
        // Range, duplicate number and duplicate DISTANCE are all one decision, taken by the module.
        // The reason codes stay local because they are this screen's copy, not the rule.
        const conflict = pickConflict(num, this.secretTarget, this.takenPicks());
        if (conflict === 'range') {
          this.isSubmitting = false;
          return { success: false, reason: 'INVALID_RANGE' };
        }
        if (conflict !== null) {
          this.isSubmitting = false;
          return { success: false, reason: 'CONFLICT_GENERIC' };
        }

        const distance = distanceTo(num, this.secretTarget);

        // Atomic commit
        const player = this.getCurrentPlayer();
        this.acceptedPicks[player.id] = { number: num, distance };
        this.usedNumbers.add(num);
        this.usedDistances.add(distance);

        this.isSubmitting = false;
        return { success: true, number: num, distance };
      }

      advanceTurn() {
        this.currentTurnIndex++;
        if (this.currentTurnIndex >= this.players.length) {
          this.resolveResults();
          this.state = GameState.REVEAL;
        } else {
          this.state = GameState.PASS_DEVICE;
        }
      }

      resolveResults() {
        const playerPicks = this.players.map(p => ({
          ...p,
          ...this.acceptedPicks[p.id]
        }));

        // The LOSER is decided by the module, off the round in TURN order — that is what makes a tie
        // resolve to the earliest player instead of to whatever the sort happened to leave in front.
        const loser = resolveLoser(playerPicks, this.loseCondition);

        // The sort below is presentation only: it orders the results table from the losing end down.
        // It must not decide anything, or there would be two answers to "who lost" again.
        if (this.loseCondition === LoseCondition.NEAREST_LOSES) {
          playerPicks.sort((a, b) => a.distance - b.distance);
        } else {
          playerPicks.sort((a, b) => b.distance - a.distance);
        }

        this.finalLoserId = loser.id;
        return {
          sortedPicks: playerPicks,
          loser
        };
      }
    }

    const game = new GameModel();

    /**
     * UI Renderer & Screen Controllers
     */
    const container = document.getElementById('screenContainer');

    function render() {
      container.innerHTML = '';
      switch (game.state) {
        case GameState.PLAYER_COUNT:
          renderPlayerCountScreen();
          break;
        case GameState.PLAYER_NAMES:
          renderPlayerNamesScreen();
          break;
        case GameState.LOSE_CONDITION:
          renderLoseConditionScreen();
          break;
        case GameState.SECRECY_NOTICE:
          renderSecrecyNoticeScreen();
          break;
        case GameState.TURN_INTRO:
          renderTurnIntroScreen();
          break;
        case GameState.NUMBER_ENTRY:
          renderNumberEntryScreen();
          break;
        case GameState.PICK_LOCKED:
          renderPickLockedScreen();
          break;
        case GameState.PASS_DEVICE:
          renderPassDeviceScreen();
          break;
        case GameState.REVEAL:
          renderRevealScreen();
          break;
        case GameState.RESULTS:
          renderResultsScreen();
          break;
      }
    }

    // 1. Player Count Screen
    function renderPlayerCountScreen() {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h1 class="screen-title">จำนวนผู้เล่น</h1>
        <p class="screen-subtitle">เลือกจำนวนผู้เล่นที่จะร่วมเล่นในเกมนี้ (2-10 คน)</p>
        <div class="player-count-grid" id="countGrid"></div>
        <button id="btnNextCount" class="btn-primary">ถัดไป ➔</button>
      `;

      const grid = card.querySelector('#countGrid');
      for (let i = 2; i <= 10; i++) {
        const chip = document.createElement('button');
        chip.className = `count-chip ${game.playerCount === i ? 'selected' : ''}`;
        chip.textContent = `${i} คน`;
        chip.onclick = () => {
          sound.playClick();
          game.playerCount = i;
          card.querySelectorAll('.count-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        };
        grid.appendChild(chip);
      }

      card.querySelector('#btnNextCount').onclick = () => {
        sound.playClick();
        game.state = GameState.PLAYER_NAMES;
        render();
      };

      container.appendChild(card);
    }

    // 2. Player Names Screen
    function renderPlayerNamesScreen() {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h2 class="screen-title">ชื่อผู้เล่น</h2>
        <p class="screen-subtitle">ระบุชื่อของผู้เล่นแต่ละคน (ไม่ระบุได้)</p>
        <div class="player-name-list" id="nameList"></div>
        <button id="btnNextNames" class="btn-primary">ถัดไป ➔</button>
        <button id="btnBackToCount" class="btn-secondary">ย้อนกลับ</button>
      `;

      const list = card.querySelector('#nameList');
      for (let i = 0; i < game.playerCount; i++) {
        const row = document.createElement('div');
        row.className = 'player-input-row';
        row.innerHTML = `
          <div class="player-badge">${i + 1}</div>
          <input type="text" class="player-text-input" placeholder="ผู้เล่น ${i + 1}" maxlength="20" data-index="${i}">
        `;
        list.appendChild(row);
      }

      card.querySelector('#btnNextNames').onclick = () => {
        sound.playClick();
        const inputs = card.querySelectorAll('.player-text-input');
        const names = Array.from(inputs).map(inp => inp.value);
        game.initPlayers(names);
        game.state = GameState.LOSE_CONDITION;
        render();
      };

      card.querySelector('#btnBackToCount').onclick = () => {
        sound.playClick();
        game.state = GameState.PLAYER_COUNT;
        render();
      };

      container.appendChild(card);
    }

    // 3. Lose Condition Screen
    function renderLoseConditionScreen() {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h2 class="screen-title">กติกาการแพ้</h2>
        <p class="screen-subtitle">เลือกว่ารอบนี้ใครจะเป็นผู้แพ้</p>
        <div class="mode-selection-grid">
          <div class="mode-card ${game.loseCondition === LoseCondition.NEAREST_LOSES ? 'selected' : ''}" id="modeNearest">
            <div class="mode-icon">🎯</div>
            <div>
              <div class="mode-title">ใกล้แพ้</div>
              <div class="mode-desc">ผู้เล่นที่เลือกตัวเลข<b>ใกล้กับเลขลับที่สุด</b>จะเป็นผู้แพ้</div>
            </div>
          </div>
          <div class="mode-card ${game.loseCondition === LoseCondition.FARTHEST_LOSES ? 'selected' : ''}" id="modeFarthest">
            <div class="mode-icon">🚀</div>
            <div>
              <div class="mode-title">ไกลแพ้</div>
              <div class="mode-desc">ผู้เล่นที่เลือกตัวเลข<b>ห่างจากเลขลับที่สุด</b>จะเป็นผู้แพ้</div>
            </div>
          </div>
        </div>
        <button id="btnStartGame" class="btn-primary">ยืนยันกติกา ➔</button>
        <button id="btnBackToNames" class="btn-secondary">ย้อนกลับ</button>
      `;

      const modeNearest = card.querySelector('#modeNearest');
      const modeFarthest = card.querySelector('#modeFarthest');

      modeNearest.onclick = () => {
        sound.playClick();
        game.loseCondition = LoseCondition.NEAREST_LOSES;
        modeNearest.classList.add('selected');
        modeFarthest.classList.remove('selected');
      };

      modeFarthest.onclick = () => {
        sound.playClick();
        game.loseCondition = LoseCondition.FARTHEST_LOSES;
        modeFarthest.classList.add('selected');
        modeNearest.classList.remove('selected');
      };

      card.querySelector('#btnStartGame').onclick = () => {
        sound.playClick();
        game.startNewGame();
        render();
      };

      card.querySelector('#btnBackToNames').onclick = () => {
        sound.playClick();
        game.state = GameState.PLAYER_NAMES;
        render();
      };

      container.appendChild(card);
    }

    // 4. Secrecy Notice Screen
    function renderSecrecyNoticeScreen() {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h2 class="screen-title">กติกาความลับ</h2>
        <div class="secrecy-box">
          <div class="secrecy-title">🤫 ห้ามบอกตัวเลขให้คนอื่นรู้</div>
          <div class="secrecy-desc">
            คนอื่นห้ามแอบดูหน้าจอในระหว่างที่เพื่อนกำลังเลือกตัวเลข<br><br>
            เมื่อเลือกเสร็จแล้ว ให้ส่งมือถือให้ผู้เล่นคนถัดไปทันที
          </div>
        </div>
        <button id="btnAckSecrecy" class="btn-primary">รับทราบ เริ่มเล่น ➔</button>
      `;

      card.querySelector('#btnAckSecrecy').onclick = () => {
        sound.playClick();
        game.state = GameState.TURN_INTRO;
        render();
      };

      container.appendChild(card);
    }

    // 5. Turn Intro Screen
    function renderTurnIntroScreen() {
      const player = game.getCurrentPlayer();
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="turn-status-bar">
          <span class="turn-pill">ตาที่ ${game.currentTurnIndex + 1} จาก ${game.players.length}</span>
          <span class="mode-pill">${game.loseCondition === LoseCondition.NEAREST_LOSES ? 'โหมด: ใกล้แพ้' : 'โหมด: ไกลแพ้'}</span>
        </div>
        <h2 class="screen-title" style="margin-top: 10px;">ส่งมือถือให้</h2>
        <div style="font-size: 2.2rem; font-weight: 900; text-align: center; color: #a5b4fc; margin: 16px 0;">
          ${escapeHtml(player.name)}
        </div>
        <p class="screen-subtitle" style="color: #f87171; font-weight: 600;">⚠️ คนอื่นห้ามดูหน้าจอ</p>
        <button id="btnReadyForTurn" class="btn-primary" style="margin-top: 20px;">พร้อมแล้ว ➔</button>
      `;

      card.querySelector('#btnReadyForTurn').onclick = () => {
        sound.playClick();
        game.state = GameState.NUMBER_ENTRY;
        render();
      };

      container.appendChild(card);
    }

    // 6. Number Entry Screen
    function renderNumberEntryScreen() {
      const player = game.getCurrentPlayer();
      let enteredVal = '';

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="turn-status-bar">
          <span class="turn-pill">ผู้เล่น: <b>${escapeHtml(player.name)}</b></span>
          <span class="mode-pill">${game.loseCondition === LoseCondition.NEAREST_LOSES ? '🎯 ใกล้แพ้' : '🚀 ไกลแพ้'}</span>
        </div>
        
        <div id="rejectionBanner" class="rejection-banner" role="alert">เลขนี้ใช้ไม่ได้ เลือกใหม่</div>

        <div class="number-display-box">
          <div id="numberDisplay" class="number-current-val placeholder">--</div>
          <div class="number-range-hint">เลือกตัวเลขจำนวนเต็ม 0 - 100</div>
        </div>

        <div class="numpad-grid">
          <button class="num-btn" data-key="1">1</button>
          <button class="num-btn" data-key="2">2</button>
          <button class="num-btn" data-key="3">3</button>
          <button class="num-btn" data-key="4">4</button>
          <button class="num-btn" data-key="5">5</button>
          <button class="num-btn" data-key="6">6</button>
          <button class="num-btn" data-key="7">7</button>
          <button class="num-btn" data-key="8">8</button>
          <button class="num-btn" data-key="9">9</button>
          <button class="num-btn fn-btn" data-key="clear">ล้าง</button>
          <button class="num-btn" data-key="0">0</button>
          <button class="num-btn fn-btn" data-key="backspace">⌫</button>
        </div>

        <button id="btnSubmitNumber" class="btn-primary">ล็อกคำตอบนี้ 🔒</button>
      `;

      const display = card.querySelector('#numberDisplay');
      const banner = card.querySelector('#rejectionBanner');
      const submitBtn = card.querySelector('#btnSubmitNumber');

      function updateDisplay() {
        if (enteredVal === '') {
          display.textContent = '--';
          display.classList.add('placeholder');
        } else {
          display.textContent = enteredVal;
          display.classList.remove('placeholder');
        }
      }

      function handleKey(key) {
        sound.playClick();
        banner.style.display = 'none';

        if (key === 'clear') {
          enteredVal = '';
        } else if (key === 'backspace') {
          enteredVal = enteredVal.slice(0, -1);
        } else if (['0','1','2','3','4','5','6','7','8','9'].includes(key)) {
          if (enteredVal === '0') {
            enteredVal = key; // replace leading 0
          } else {
            const next = enteredVal + key;
            if (Number(next) <= 100 && next.length <= 3) {
              enteredVal = next;
            }
          }
        }
        updateDisplay();
      }

      card.querySelectorAll('.num-btn').forEach(btn => {
        btn.onclick = () => handleKey(btn.getAttribute('data-key'));
      });

      // Keyboard listener
      const keyHandler = (e) => {
        if (game.state !== GameState.NUMBER_ENTRY) return;
        if (e.key >= '0' && e.key <= '9') {
          handleKey(e.key);
        } else if (e.key === 'Backspace') {
          handleKey('backspace');
        } else if (e.key === 'Enter') {
          submitBtn.click();
        } else if (e.key === 'Escape') {
          handleKey('clear');
        }
      };
      window.addEventListener('keydown', keyHandler);

      submitBtn.onclick = () => {
        if (enteredVal === '') {
          showError();
          return;
        }

        const candidate = Number(enteredVal);
        const result = game.validateAndCommitPick(candidate);

        if (!result.success) {
          showError();
        } else {
          sound.playLock();
          window.removeEventListener('keydown', keyHandler);
          game.state = GameState.PICK_LOCKED;
          render();
        }
      };

      function showError() {
        sound.playReject();
        addTrauma(0.6);
        banner.style.display = 'block';
        banner.style.animation = 'none';
        void banner.offsetWidth; // trigger reflow
        banner.style.animation = 'shakeToast 0.4s ease';
      }

      container.appendChild(card);
    }

    // 7. Pick Locked Screen
    function renderPickLockedScreen() {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.textAlign = 'center';
      card.innerHTML = `
        <div class="locked-indicator">✓</div>
        <h2 class="screen-title" style="color: #34d399;">ล็อกคำตอบแล้ว</h2>
        <p class="screen-subtitle" style="margin-top: 8px;">บันทึกตัวเลขลงในระบบเรียบร้อยแล้ว</p>
        <button id="btnContinuePass" class="btn-primary" style="margin-top: 24px;">ถัดไป ➔</button>
      `;

      card.querySelector('#btnContinuePass').onclick = () => {
        sound.playClick();
        game.advanceTurn();
        render();
      };

      container.appendChild(card);
    }

    // 8. Pass Device Screen
    function renderPassDeviceScreen() {
      const nextPlayer = game.getCurrentPlayer();
      const card = document.createElement('div');
      card.className = 'card';
      card.style.textAlign = 'center';
      card.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 12px;">📱 ➔ 👤</div>
        <h2 class="screen-title">ส่งมือถือให้</h2>
        <div style="font-size: 2.2rem; font-weight: 900; color: #a5b4fc; margin: 16px 0;">
          ${escapeHtml(nextPlayer.name)}
        </div>
        <p class="screen-subtitle" style="color: #f87171; font-weight: 600;">คนอื่นห้ามดูหน้าจอเด็ดขาด</p>
        <button id="btnReadyNextPlayer" class="btn-primary" style="margin-top: 20px;">[ ${escapeHtml(nextPlayer.name)} พร้อมแล้ว ]</button>
      `;

      card.querySelector('#btnReadyNextPlayer').onclick = () => {
        sound.playClick();
        game.state = GameState.NUMBER_ENTRY;
        render();
      };

      container.appendChild(card);
    }

    // 9. Reveal Screen (Dramatic Countdown / Teaser)
    function renderRevealScreen() {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.textAlign = 'center';
      card.innerHTML = `
        <div class="reveal-suspense-box">
          <div style="font-size: 3.5rem; margin-bottom: 10px;">🎲</div>
          <h2 class="screen-title">ทุกคนเลือกครบแล้ว!</h2>
          <p class="screen-subtitle">ถึงเวลาเปิดเผยเลขลับ และดูว่าใครคือผู้แพ้</p>
          <button id="btnDoReveal" class="btn-primary" style="margin-top: 24px; font-size: 1.25rem;">✨ เปิดเผยเลขลับ ✨</button>
        </div>
      `;

      card.querySelector('#btnDoReveal').onclick = () => {
        sound.playReveal();
        fx.burst(window.innerWidth / 2, window.innerHeight * 0.35, 90);
        game.state = GameState.RESULTS;
        render();
      };

      container.appendChild(card);
    }

    // 10. Results Screen
    function renderResultsScreen() {
      const { sortedPicks, loser } = game.resolveResults();
      sound.playLoser();
      addTrauma(0.5);

      const card = document.createElement('div');
      card.className = 'card';

      let resultsHtml = '';
      sortedPicks.forEach(p => {
        const isLoser = p.id === loser.id;
        resultsHtml += `
          <div class="result-row ${isLoser ? 'loser-row' : ''}">
            <div class="result-player-info">
              <span class="result-name">${escapeHtml(p.name)}</span>
              ${isLoser ? '<span class="result-loser-tag">แพ้</span>' : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 14px;">
              <span class="result-pick">เลือก <b>${p.number}</b></span>
              <span class="result-distance">ต่าง ${p.distance}</span>
            </div>
          </div>
        `;
      });

      card.innerHTML = `
        <div style="text-align: center;">
          <div class="secret-target-badge">เลขลับประจำรอบนี้</div>
          <div class="secret-target-number">${game.secretTarget}</div>
        </div>

        <div class="loser-callout">
          <div class="loser-title">💀 ${escapeHtml(loser.name)} แพ้!</div>
          <div class="loser-reason">
            ${game.loseCondition === LoseCondition.NEAREST_LOSES ? 'เลือกตัวเลขใกล้เลขลับที่สุด (ต่าง ' + loser.distance + ')' : 'เลือกตัวเลขไกลจากเลขลับที่สุด (ต่าง ' + loser.distance + ')'}
          </div>
        </div>

        <!-- Number Line Visualization -->
        <div class="numberline-wrapper">
          <div class="numberline-track" id="numberLineTrack"></div>
          <div class="numberline-labels">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>

        <div class="results-list">
          ${resultsHtml}
        </div>

        <button id="btnRematch" class="btn-primary" style="margin-top: 10px;">🔄 เล่นอีกรอบ (ผู้เล่นเดิม)</button>
        <button id="btnNewSetup" class="btn-secondary">⚙️ ตั้งค่าใหม่</button>
      `;

      // Populate Number Line Track
      const track = card.querySelector('#numberLineTrack');

      // Secret Target Pin
      const targetPin = document.createElement('div');
      targetPin.className = 'numberline-marker target';
      targetPin.style.left = `${game.secretTarget}%`;
      targetPin.title = `เลขลับ: ${game.secretTarget}`;
      track.appendChild(targetPin);

      // Player Pins
      sortedPicks.forEach(p => {
        const pin = document.createElement('div');
        const isLoser = p.id === loser.id;
        pin.className = `numberline-marker ${isLoser ? 'loser' : 'player'}`;
        pin.style.left = `${p.number}%`;
        pin.title = `${p.name}: ${p.number} (ต่าง ${p.distance})`;
        track.appendChild(pin);
      });

      card.querySelector('#btnRematch').onclick = () => {
        sound.playClick();
        game.rematch();
        render();
      };

      card.querySelector('#btnNewSetup').onclick = () => {
        sound.playClick();
        game.state = GameState.PLAYER_COUNT;
        render();
      };

      container.appendChild(card);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Audio Toggle Handler
    const audioBtn = document.getElementById('btnAudioToggle');
    audioBtn.onclick = () => {
      const enabled = sound.toggle();
      audioBtn.textContent = enabled ? '🔊' : '🔇';
      audioBtn.title = enabled ? 'ปิดเสียง' : 'เปิดเสียง';
    };

    /**
     * Deterministic Test Runner for Game Rules (Test Cases 1 - 8)
     */
    const testModal = document.getElementById('testModal');
    const testLog = document.getElementById('testLog');
    const btnTestRunner = document.getElementById('btnTestRunner');
    const btnCloseTestModal = document.getElementById('btnCloseTestModal');
    const btnRunTestsNow = document.getElementById('btnRunTestsNow');

    btnTestRunner.onclick = () => {
      sound.playClick();
      testModal.style.display = 'flex';
      runAllDeterministicTests();
    };

    btnCloseTestModal.onclick = () => {
      sound.playClick();
      testModal.style.display = 'none';
    };

    btnRunTestsNow.onclick = () => {
      sound.playClick();
      runAllDeterministicTests();
    };

    function runAllDeterministicTests() {
      const logs = [];
      let passCount = 0;
      let failCount = 0;

      function assert(cond, name, details = '') {
        if (cond) {
          logs.push(`✅ PASS: ${name}`);
          passCount++;
        } else {
          logs.push(`❌ FAIL: ${name} ${details}`);
          failCount++;
        }
      }

      logs.push(`=== เริ่มต้นรันชุดทดสอบเกม ไกลแค่ไหนคือใกล้ ===\n`);

      // Test 1: Nearest Loses Mode & Duplicate Distance Rejection
      {
        const m = new GameModel();
        m.playerCount = 4;
        m.initPlayers(['A', 'B', 'C', 'D']);
        m.loseCondition = LoseCondition.NEAREST_LOSES;
        m.setCustomRandom(() => 62);
        m.startNewGame();

        assert(m.secretTarget === 62, 'Case 1 - ตั้งค่าเลขลับ 62 สำเร็จ');

        // Turn 0: A picks 40 -> distance 22
        let resA = m.validateAndCommitPick(40);
        assert(resA.success && resA.distance === 22, 'Case 1 - A เลือก 40 (ต่าง 22) ผ่าน');
        m.advanceTurn();

        // Turn 1: B picks 70 -> distance 8
        let resB = m.validateAndCommitPick(70);
        assert(resB.success && resB.distance === 8, 'Case 1 - B เลือก 70 (ต่าง 8) ผ่าน');
        m.advanceTurn();

        // Turn 2: C picks 90 -> distance 28
        let resC = m.validateAndCommitPick(90);
        assert(resC.success && resC.distance === 28, 'Case 1 - C เลือก 90 (ต่าง 28) ผ่าน');
        m.advanceTurn();

        // Turn 3: D attempts 54 -> distance 8 (Conflict with B)
        let resD_fail = m.validateAndCommitPick(54);
        assert(!resD_fail.success && resD_fail.reason === 'CONFLICT_GENERIC', 'Case 1 - D พยายามเลือก 54 (ต่าง 8 ซ้ำกับ B) ต้องถูกปฏิเสธ');

        // D retries with 55 -> distance 7
        let resD_ok = m.validateAndCommitPick(55);
        assert(resD_ok.success && resD_ok.distance === 7, 'Case 1 - D เลือกใหม่เป็น 55 (ต่าง 7) ผ่าน');
        m.advanceTurn();

        const outcome = m.resolveResults();
        assert(outcome.loser.name === 'D' && outcome.loser.distance === 7, 'Case 1 - ในโหมดใกล้แพ้ D (ต่าง 7) ต้องเป็นผู้แพ้');
      }

      // Test 2: Farthest Loses Mode
      {
        const m = new GameModel();
        m.playerCount = 3;
        m.initPlayers(['A', 'B', 'C']);
        m.loseCondition = LoseCondition.FARTHEST_LOSES;
        m.setCustomRandom(() => 50);
        m.startNewGame();

        m.validateAndCommitPick(45); // distance 5
        m.advanceTurn();
        m.validateAndCommitPick(30); // distance 20
        m.advanceTurn();
        m.validateAndCommitPick(79); // distance 29
        m.advanceTurn();

        const outcome = m.resolveResults();
        assert(outcome.loser.name === 'C' && outcome.loser.distance === 29, 'Case 2 - ในโหมดไกลแพ้ C (ต่าง 29) ต้องเป็นผู้แพ้');
      }

      // Test 3: Duplicate Exact Number Rejection
      {
        const m = new GameModel();
        m.playerCount = 2;
        m.initPlayers(['A', 'B']);
        m.setCustomRandom(() => 20);
        m.startNewGame();

        let resA = m.validateAndCommitPick(35); // distance 15
        assert(resA.success, 'Case 3 - A เลือก 35 ผ่าน');
        m.advanceTurn();

        let resB = m.validateAndCommitPick(35); // duplicate number 35
        assert(!resB.success && resB.reason === 'CONFLICT_GENERIC', 'Case 3 - B เลือก 35 ซ้ำ ต้องถูกปฏิเสธด้วย CONFLICT_GENERIC');
        assert(m.currentTurnIndex === 1, 'Case 3 - เมื่อถูกปฏิเสธ ผู้เล่นต้องยังคงเป็น B (ไม่เลื่อนตา)');
      }

      // Test 4: Duplicate Distance With Different Number (Symmetric)
      {
        const m = new GameModel();
        m.playerCount = 2;
        m.initPlayers(['A', 'B']);
        m.setCustomRandom(() => 50);
        m.startNewGame();

        let resA = m.validateAndCommitPick(40); // distance 10
        assert(resA.success, 'Case 4 - A เลือก 40 (ต่าง 10) ผ่าน');
        m.advanceTurn();

        let resB = m.validateAndCommitPick(60); // distance 10 (Symmetric around 50)
        assert(!resB.success && resB.reason === 'CONFLICT_GENERIC', 'Case 4 - B เลือก 60 (ระยะต่าง 10 ซ้ำกับ A) ต้องถูกปฏิเสธด้วย CONFLICT_GENERIC เช่นเดียวกัน');
      }

      // Test 5: Exact Target (Distance 0)
      {
        const m = new GameModel();
        m.playerCount = 2;
        m.initPlayers(['A', 'B']);
        m.setCustomRandom(() => 0);
        m.startNewGame();

        let resA = m.validateAndCommitPick(0); // target 0, pick 0 -> distance 0
        assert(resA.success && resA.distance === 0, 'Case 5 - เลือกเลข 0 เมื่อเป้าหมายคือ 0 ต้องได้ระยะ 0 สำเร็จ (0 ไม่ใช่ falsy error)');
      }

      // Test 6: Boundary Target 100
      {
        const m = new GameModel();
        m.playerCount = 2;
        m.initPlayers(['A', 'B']);
        m.setCustomRandom(() => 100);
        m.startNewGame();

        let resA = m.validateAndCommitPick(100);
        assert(resA.success && resA.distance === 0, 'Case 6 - เลือกเลข 100 เมื่อเป้าหมายคือ 100 ต้องคำนวณระยะ 0 ถูกต้อง');

        let resInvalid = m.validateAndCommitPick(101);
        assert(!resInvalid.success, 'Case 6 - เลข 101 ต้องไม่อนุญาตให้ส่ง');
      }

      // Test 7: Double Submit Guard
      {
        const m = new GameModel();
        m.playerCount = 2;
        m.initPlayers(['A', 'B']);
        m.setCustomRandom(() => 50);
        m.startNewGame();

        m.isSubmitting = true;
        let resBusy = m.validateAndCommitPick(25);
        assert(!resBusy.success && resBusy.reason === 'BUSY', 'Case 7 - ขณะกำลังประมวลผล (isSubmitting = true) ต้องปฏิเสธ double-submit');
        m.isSubmitting = false;
      }

      // Test 8: Rematch State Reset
      {
        const m = new GameModel();
        m.playerCount = 2;
        m.initPlayers(['P1', 'P2']);
        m.setCustomRandom(() => 30);
        m.startNewGame();

        m.validateAndCommitPick(10);
        m.advanceTurn();
        m.validateAndCommitPick(20);
        m.advanceTurn();

        m.setCustomRandom(() => 75);
        m.rematch();

        assert(m.secretTarget === 75, 'Case 8 - Rematch ต้องสุ่มเลขลับใหม่ (75)');
        assert(m.currentTurnIndex === 0, 'Case 8 - Rematch ต้องรีเซ็ตตาเดินกลับมาที่ผู้เล่นแรก');
        assert(m.usedNumbers.size === 0 && m.usedDistances.size === 0, 'Case 8 - Rematch ต้องล้างประวัติ usedNumbers และ usedDistances ทั้งหมด');
        assert(m.players.length === 2 && m.players[0].name === 'P1', 'Case 8 - Rematch ต้องคงรายชื่อผู้เล่นเดิมไว้');
      }

      logs.push(`\n=== ผลสรุปการทดสอบ: ผ่าน ${passCount} ข้อ | ล้มเหลว ${failCount} ข้อ ===`);
      testLog.innerHTML = logs.map(l => {
        if (l.includes('PASS')) return `<span class="test-pass">${escapeHtml(l)}</span>`;
        if (l.includes('FAIL')) return `<span class="test-fail">${escapeHtml(l)}</span>`;
        return escapeHtml(l);
      }).join('\n');
    }

    // Expose model to global window for browser console testing
    window.gameEngine = game;
    window.runDeterministicTests = runAllDeterministicTests;

    // Start UI
    render();
