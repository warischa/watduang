// ADR-0017's ghost-tap gate. Imported at the top of the file rather than inside the IIFE below
// because an import declaration is only legal at module top level; play.astro already loads this
// file as a module, so nothing about how it ships changes.
import { armAllButtons } from '../../games/_arm-gate.ts';

(() => {
  'use strict';

  /* ==========================================================================
     1. PROCEDURAL WEB AUDIO SYNTHESIZER
     ========================================================================== */
  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.initOnFirstTouch();
    }

    initOnFirstTouch() {
      const unlock = () => {
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            this.ctx = new AudioCtx();
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }

    playClick(freq = 540) {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.05);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    }

    playReady() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      [440, 660].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = t + i * 0.07;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.25, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(st);
        osc.stop(st + 0.15);
      });
    }

    playDecoyTick() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320 + Math.random() * 80, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.06);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    }

    playTrigger() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(300, t);
      osc2.frequency.exponentialRampToValueAtTime(80, t + 0.15);
      gain2.gain.setValueAtTime(0.4, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(t);
      osc2.stop(t + 0.16);
    }

    playValidTap() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      [587.33, 880, 1174.66].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = t + idx * 0.05;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.25, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.28);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(st);
        osc.stop(st + 0.3);
      });
    }

    playFalseStart() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      [150, 142].forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    }

    playSuddenDeath() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      [330, 493.88, 659.25, 987.77].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = t + idx * 0.08;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.28, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(st);
        osc.stop(st + 0.32);
      });
    }

    playVictory() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = t + idx * 0.09;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.3, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.45);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(st);
        osc.stop(st + 0.5);
      });
    }
  }

  const sound = new SoundSynth();

  /* ==========================================================================
     2. PARTICLES & SCREEN TRAUMA ENGINE
     ========================================================================== */
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  const shakeRoot = document.getElementById('shakeRoot');

  let particles = [];
  let trauma = 0.0;
  let lastFrameTime = performance.now();

  // ADR-0046. prefers-reduced-motion is a CSS media feature: it does not reach the two style writes
  // this file makes from script (shakeRoot's transform, the target button's colour), so the query is
  // read here as well as in style.css. Reduce, not remove — everything that carries the round's
  // STATE still happens on the normal path: the target still changes colour, text and symbol at the
  // same instant, the decoys still appear, the reaction time is still measured. What stops is the
  // decorative layer only: the camera shake, the haptic pulse and the particle spray.
  // Live, not a snapshot: a player who turns the setting on mid-round gets the quiet version from
  // that moment, and the shake already in flight is cancelled instead of finishing.
  const reducedMotionQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = reducedMotionQuery ? reducedMotionQuery.matches : false;
  if (reducedMotionQuery && typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', (event) => {
      reducedMotion = event.matches;
      if (reducedMotion) {
        // The loop paints 'none' on the next frame once trauma is spent, so clearing the two
        // sources is enough — no second transform write to keep in sync with the loop.
        trauma = 0;
        particles.length = 0;
      }
    });
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.scale(dpr, dpr);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function addTrauma(amount = 0.8) {
    // Decoration, not state: the screen shake and its haptic twin say nothing the screen does not
    // already say in words, so reduced motion drops both (ADR-0046).
    if (reducedMotion) return;
    trauma = Math.min(1.0, trauma + amount);
    if (navigator.vibrate) {
      try { navigator.vibrate(amount >= 0.7 ? [80, 40, 120] : 40); } catch(e) {}
    }
  }

  function spawnConfetti() {
    if (reducedMotion) return;
    const w = window.innerWidth;
    const colors = ['#38bdf8', '#f59e0b', '#10b981', '#ec4899', '#a855f7', '#f43f5e'];
    for (let i = 0; i < 70; i++) {
      particles.push({
        type: 'confetti',
        x: Math.random() * w,
        y: -20 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2,
        size: 6 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: 0.005 + Math.random() * 0.008
      });
    }
  }

  function spawnShockParticles(x, y, isHazard = false) {
    if (reducedMotion) return;
    const colors = isHazard 
      ? ['#ef4444', '#f87171', '#fca5a5', '#dc2626'] 
      : ['#38bdf8', '#60a5fa', '#a7f3d0', '#ffffff'];
    const count = isHazard ? 45 : 30;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * (isHazard ? 7 : 5);
      particles.push({
        type: 'sparkle',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * (isHazard ? 5 : 4),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03
      });
    }
  }

  function particleLoop(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    if (trauma > 0) {
      trauma = Math.max(0, trauma - dt * 2.8);
      const shakeMag = Math.pow(trauma, 2);
      const maxOffset = 18;
      const offsetX = (Math.random() - 0.5) * maxOffset * shakeMag;
      const offsetY = (Math.random() - 0.5) * maxOffset * shakeMag;
      shakeRoot.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    } else {
      shakeRoot.style.transform = 'none';
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;

      if (p.type === 'confetti') {
        p.rot += p.vRot;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    requestAnimationFrame(particleLoop);
  }
  requestAnimationFrame(particleLoop);

  /* ==========================================================================
     3. TRIGGER CONDITIONS & DECOY SPECIFICATIONS (THAI)
     ========================================================================== */
  const TRIGGER_CONDITIONS = [
    // Colour conditions
    {
      id: 'COLOR_RED',
      category: 'color',
      prompt: 'แตะเฉพาะเมื่อปุ่มเปลี่ยนเป็นสีแดง (RED)',
      targetBg: '#ef4444',
      targetText: 'สีแดง!',
      targetSymbol: '●',
      decoys: [
        { bg: '#3b82f6', text: 'สีน้ำเงิน', symbol: '●' },
        { bg: '#10b981', text: 'สีเขียว', symbol: '●' },
        { bg: '#eab308', text: 'สีเหลือง', symbol: '●' },
        { bg: '#a855f7', text: 'สีม่วง', symbol: '●' },
        { bg: '#06b6d4', text: 'สีฟ้า', symbol: '●' },
        { bg: '#64748b', text: 'สีเทา', symbol: '●' }
      ]
    },
    {
      id: 'COLOR_GREEN',
      category: 'color',
      prompt: 'แตะเฉพาะเมื่อปุ่มเปลี่ยนเป็นสีเขียว (GREEN)',
      targetBg: '#10b981',
      targetText: 'สีเขียว!',
      targetSymbol: '●',
      decoys: [
        { bg: '#ef4444', text: 'สีแดง', symbol: '●' },
        { bg: '#3b82f6', text: 'สีน้ำเงิน', symbol: '●' },
        { bg: '#eab308', text: 'สีเหลือง', symbol: '●' },
        { bg: '#ec4899', text: 'สีชมพู', symbol: '●' },
        { bg: '#8b5cf6', text: 'สีม่วง', symbol: '●' },
        { bg: '#64748b', text: 'สีเทา', symbol: '●' }
      ]
    },
    {
      id: 'COLOR_BLUE',
      category: 'color',
      prompt: 'แตะเฉพาะเมื่อปุ่มเปลี่ยนเป็นสีน้ำเงิน (BLUE)',
      targetBg: '#3b82f6',
      targetText: 'สีน้ำเงิน!',
      targetSymbol: '●',
      decoys: [
        { bg: '#ef4444', text: 'สีแดง', symbol: '●' },
        { bg: '#10b981', text: 'สีเขียว', symbol: '●' },
        { bg: '#eab308', text: 'สีเหลือง', symbol: '●' },
        { bg: '#f97316', text: 'สีส้ม', symbol: '●' },
        { bg: '#a855f7', text: 'สีม่วง', symbol: '●' },
        { bg: '#64748b', text: 'สีเทา', symbol: '●' }
      ]
    },
    {
      id: 'COLOR_YELLOW',
      category: 'color',
      prompt: 'แตะเฉพาะเมื่อปุ่มเปลี่ยนเป็นสีเหลือง (YELLOW)',
      targetBg: '#eab308',
      targetText: 'สีเหลือง!',
      targetSymbol: '●',
      decoys: [
        { bg: '#3b82f6', text: 'สีน้ำเงิน', symbol: '●' },
        { bg: '#10b981', text: 'สีเขียว', symbol: '●' },
        { bg: '#ef4444', text: 'สีแดง', symbol: '●' },
        { bg: '#ec4899', text: 'สีชมพู', symbol: '●' },
        { bg: '#06b6d4', text: 'สีฟ้า', symbol: '●' },
        { bg: '#64748b', text: 'สีเทา', symbol: '●' }
      ]
    },
    // Word conditions
    {
      id: 'TEXT_TAP',
      category: 'text',
      prompt: 'แตะเฉพาะเมื่อปุ่มขึ้นคำว่า กด (TAP)',
      targetBg: '#38bdf8',
      targetText: 'กดเลย!',
      targetSymbol: '⚡',
      decoys: [
        { bg: '#1e293b', text: 'อุ๊ย มือลั่น?', symbol: '✋' },
        { bg: '#334155', text: 'ใจเย็นไอ้สอง', symbol: '⏳' },
        { bg: '#1e293b', text: 'กดสิ... หลอกนะ!', symbol: '✖' },
        { bg: '#334155', text: 'อย่ามือลั่น!', symbol: '🛑' },
        { bg: '#1e293b', text: 'กูบอกให้รอ', symbol: '🔒' },
        { bg: '#334155', text: 'เลี้ยงน้ำเพื่อนนะ', symbol: '💸' }
      ]
    },
    {
      id: 'TEXT_NOW',
      category: 'text',
      prompt: 'แตะเฉพาะเมื่อปุ่มขึ้นคำว่า เดี๋ยวนี้ (NOW)',
      targetBg: '#10b981',
      targetText: 'เดี๋ยวนี้!',
      targetSymbol: '🎯',
      decoys: [
        { bg: '#1e293b', text: 'อย่าเพิ่งลั่น', symbol: '⏳' },
        { bg: '#334155', text: 'รอไปก่อน', symbol: '✋' },
        { bg: '#1e293b', text: 'ยังไม่ถึงตา', symbol: '...' },
        { bg: '#334155', text: 'ลั่นโดนแน่', symbol: '🕒' },
        { bg: '#1e293b', text: 'ห้ามแตะเด็ดขาด', symbol: '✋' },
        { bg: '#334155', text: 'ไม่ใช่คำนี้', symbol: '✖' }
      ]
    },
    {
      id: 'TEXT_GO',
      category: 'text',
      prompt: 'แตะเฉพาะเมื่อปุ่มขึ้นคำว่า ลุย (GO)',
      targetBg: '#22c55e',
      targetText: 'ลุยเลย!',
      targetSymbol: '🚀',
      decoys: [
        { bg: '#1e293b', text: 'ลั่น=แพ้นะ', symbol: '🛑' },
        { bg: '#334155', text: 'เตรียมตัว', symbol: '⏳' },
        { bg: '#1e293b', text: 'ระวังโดนหลอก', symbol: '⚖️' },
        { bg: '#334155', text: 'รอก๊อนนน', symbol: '✋' },
        { bg: '#1e293b', text: 'ช้าก่อนวัยรุ่น', symbol: '🐢' },
        { bg: '#334155', text: 'แข็งค้างไว้', symbol: '❄️' }
      ]
    },
    // Symbol conditions
    {
      id: 'SYMBOL_STAR',
      category: 'symbol',
      prompt: 'แตะเฉพาะเมื่อสัญลักษณ์กลายเป็นรูปดาว ★',
      targetBg: '#f59e0b',
      targetText: '★',
      targetSymbol: '★',
      decoys: [
        { bg: '#1e293b', text: '▲', symbol: '▲' },
        { bg: '#334155', text: '◆', symbol: '◆' },
        { bg: '#1e293b', text: '●', symbol: '●' },
        { bg: '#334155', text: '✖', symbol: '✖' },
        { bg: '#1e293b', text: '✦', symbol: '✦' },
        { bg: '#334155', text: '⬢', symbol: '⬢' }
      ]
    },
    {
      id: 'SYMBOL_CIRCLE',
      category: 'symbol',
      prompt: 'แตะเฉพาะเมื่อสัญลักษณ์กลายเป็นวงกลม ●',
      targetBg: '#ec4899',
      targetText: '●',
      targetSymbol: '●',
      decoys: [
        { bg: '#1e293b', text: '▲', symbol: '▲' },
        { bg: '#334155', text: '◆', symbol: '◆' },
        { bg: '#1e293b', text: '★', symbol: '★' },
        { bg: '#334155', text: '✖', symbol: '✖' },
        { bg: '#1e293b', text: '■', symbol: '■' },
        { bg: '#334155', text: '⬟', symbol: '⬟' }
      ]
    }
  ];

  /* ==========================================================================
     4. GAME STATE MACHINE & TIMING ENGINE
     ========================================================================== */
  const GameState = Object.freeze({
    SETUP: 'SETUP',
    RULE_REVEAL: 'RULE_REVEAL',
    PASS_DEVICE: 'PASS_DEVICE',
    WAITING: 'WAITING',
    TRIGGERED: 'TRIGGERED',
    PLAYER_RESULT: 'PLAYER_RESULT',
    FALSE_START_RESULT: 'FALSE_START_RESULT',
    SUDDEN_DEATH_ANNOUNCE: 'SUDDEN_DEATH_ANNOUNCE',
    FINAL_RESULTS: 'FINAL_RESULTS'
  });

  const MASCOT_PLAYERS = [
    { id: 'p1', defaultName: 'แมวส้ม', emoji: '🐱', color: '#FF6B35' },
    { id: 'p2', defaultName: 'ชิบะ', emoji: '🐶', color: '#2E86AB' },
    { id: 'p3', defaultName: 'บันนี่', emoji: '🐰', color: '#8E44AD' },
    { id: 'p4', defaultName: 'ฟร็อกกี้', emoji: '🐸', color: '#27AE60' },
    { id: 'p5', defaultName: 'หมีทอง', emoji: '🐻', color: '#F39C12' },
    { id: 'p6', defaultName: 'แพนด้า', emoji: '🐼', color: '#E84393' },
    { id: 'p7', defaultName: 'เพนกวิน', emoji: '🐧', color: '#00CEC9' },
    { id: 'p8', defaultName: 'ลูกเจี๊ยบ', emoji: '🐥', color: '#FDCB6E' },
    { id: 'p9', defaultName: 'หมูอ้วน', emoji: '🐷', color: '#FF7675' },
    { id: 'p10', defaultName: 'สไลม์ดาว', emoji: '⭐', color: '#6C5CE7' },
    { id: 'p11', defaultName: 'โคอาล่า', emoji: '🐨', color: '#74B9FF' },
    { id: 'p12', defaultName: 'จิ้งจอก', emoji: '🦊', color: '#E17055' },
    { id: 'p13', defaultName: 'กระรอก', emoji: '🐿️', color: '#D63031' },
    { id: 'p14', defaultName: 'นากน้อย', emoji: '🦦', color: '#A29BFE' },
    { id: 'p15', defaultName: 'สิงโต', emoji: '🦁', color: '#FFA502' },
    { id: 'p16', defaultName: 'กวางน้อย', emoji: '🦌', color: '#B33939' },
    { id: 'p17', defaultName: 'แฮมสเตอร์', emoji: '🐹', color: '#E58E26' },
    { id: 'p18', defaultName: 'แรคคูน', emoji: '🦝', color: '#57606F' },
    { id: 'p19', defaultName: 'แมวน้ำ', emoji: '🦭', color: '#70A1FF' },
    { id: 'p20', defaultName: 'มังกรน้อย', emoji: '🐲', color: '#2ED573' }
  ];

  class FreezeTapEngine {
    constructor() {
      this.state = GameState.SETUP;
      this.players = [];
      this.playerCount = 4;
      this.currentCondition = null;
      this.activeRoster = [];
      this.currentTurnIndex = 0;
      this.attempts = [];
      this.roundLoser = null;
      this.lossReason = '';
      this.isSuddenDeath = false;
      this.suddenDeathTiedPlayers = [];

      this.triggerTimestamp = 0;
      this.pendingTimeouts = [];
      this.interruptedState = null;
      this.activePointerHandled = false;

      this.initDefaultPlayers();
    }

    initDefaultPlayers() {
      const saved = this.loadSavedPlayers();
      if (saved && saved.length >= 2 && saved.length <= 20 && saved[0].emoji) {
        this.players = saved;
        this.playerCount = saved.length;
      } else {
        this.setPlayerCount(4);
      }
    }

    setPlayerCount(count) {
      this.playerCount = Math.max(2, Math.min(20, count));
      const newPlayers = [];
      for (let i = 0; i < this.playerCount; i++) {
        const mascot = MASCOT_PLAYERS[i % MASCOT_PLAYERS.length];
        const existing = this.players[i];
        if (existing && existing.name && existing.name !== MASCOT_PLAYERS[(i) % MASCOT_PLAYERS.length].defaultName && !existing.name.startsWith('Player')) {
          newPlayers.push({
            id: `p_${i + 1}`,
            name: existing.name,
            emoji: mascot.emoji,
            color: mascot.color,
            defaultName: mascot.defaultName
          });
        } else {
          newPlayers.push({
            id: `p_${i + 1}`,
            name: mascot.defaultName,
            emoji: mascot.emoji,
            color: mascot.color,
            defaultName: mascot.defaultName
          });
        }
      }
      this.players = newPlayers;
      this.savePlayers();
    }

    updatePlayerName(index, name) {
      if (this.players[index]) {
        const mascot = MASCOT_PLAYERS[index % MASCOT_PLAYERS.length];
        this.players[index].name = name.trim() || mascot.defaultName;
        this.savePlayers();
      }
    }

    // gh#177 (pattern from gh#174). The wipe the reset confirm guards: every seat's name goes back
    // to its mascot default and the roster keeps its size. Reads MASCOT_PLAYERS by index rather than
    // calling setPlayerCount, because setPlayerCount also resizes the array and deliberately keeps a
    // renamed player -- the opposite of what this reset promises.
    resetPlayerNames() {
      this.players = this.players.map((p, i) => ({
        ...p,
        name: MASCOT_PLAYERS[i % MASCOT_PLAYERS.length].defaultName
      }));
      this.savePlayers();
    }

    savePlayers() {
      try {
        localStorage.setItem('freeze_tap_players', JSON.stringify(this.players));
      } catch (e) {}
    }

    loadSavedPlayers() {
      try {
        const raw = localStorage.getItem('freeze_tap_players');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    clearTimers() {
      this.pendingTimeouts.forEach(id => clearTimeout(id));
      this.pendingTimeouts = [];
    }

    scheduleTimeout(fn, delayMs) {
      const id = setTimeout(() => {
        fn();
      }, delayMs);
      this.pendingTimeouts.push(id);
      return id;
    }

    startNewRound() {
      this.clearTimers();
      this.currentCondition = TRIGGER_CONDITIONS[Math.floor(Math.random() * TRIGGER_CONDITIONS.length)];
      this.activeRoster = [...this.players];
      this.currentTurnIndex = 0;
      this.attempts = [];
      this.roundLoser = null;
      this.lossReason = '';
      this.isSuddenDeath = false;
      this.suddenDeathTiedPlayers = [];
      this.state = GameState.RULE_REVEAL;
      renderApp();
    }

    proceedToPassDevice() {
      this.clearTimers();
      this.state = GameState.PASS_DEVICE;
      renderApp();
    }

    getCurrentPlayer() {
      return this.activeRoster[this.currentTurnIndex] || null;
    }

    beginActiveAttempt() {
      this.clearTimers();
      this.state = GameState.WAITING;
      this.activePointerHandled = false;
      renderApp();

      const currentPlayer = this.getCurrentPlayer();
      if (!currentPlayer) return;

      const minDelay = 1500;
      const maxDelay = 6000;
      const triggerDelay = minDelay + Math.random() * (maxDelay - minDelay);

      const decoyCount = Math.floor(Math.random() * 4) + 1;
      const decoyTimes = [];
      for (let i = 0; i < decoyCount; i++) {
        const t = 400 + Math.random() * (triggerDelay - 700);
        if (t > 300 && t < triggerDelay - 350) {
          decoyTimes.push(t);
        }
      }
      decoyTimes.sort((a, b) => a - b);

      decoyTimes.forEach(t => {
        this.scheduleTimeout(() => {
          if (this.state !== GameState.WAITING) return;
          this.applyRandomDecoy();
        }, t);
      });

      this.scheduleTimeout(() => {
        if (this.state !== GameState.WAITING) return;
        this.activateTrigger();
      }, triggerDelay);
    }

    applyRandomDecoy() {
      const decoys = this.currentCondition.decoys;
      const decoy = decoys[Math.floor(Math.random() * decoys.length)];
      sound.playDecoyTick();
      const targetEl = document.getElementById('gameTargetBtn');
      if (targetEl) {
        targetEl.style.backgroundColor = decoy.bg;
        targetEl.innerHTML = `<span style="font-size: 2.2rem;">${decoy.text}</span><span style="font-size: 1.1rem; opacity: 0.7; margin-top: 4px;">${decoy.symbol}</span>`;
        targetEl.classList.remove('decoy-pulse');
        void targetEl.offsetWidth;
        targetEl.classList.add('decoy-pulse');
      }
    }

    activateTrigger() {
      this.state = GameState.TRIGGERED;
      this.triggerTimestamp = performance.now();
      sound.playTrigger();
      addTrauma(0.4);

      const targetEl = document.getElementById('gameTargetBtn');
      if (targetEl) {
        targetEl.style.backgroundColor = this.currentCondition.targetBg;
        targetEl.innerHTML = `<span style="font-size: 2.6rem; font-weight: 900; color: #fff;">${this.currentCondition.targetText}</span><span style="font-size: 1.4rem; color: #fff; margin-top: 4px;">${this.currentCondition.targetSymbol}</span>`;
        targetEl.style.boxShadow = `0 0 50px ${this.currentCondition.targetBg}, 0 0 80px rgba(255,255,255,0.4)`;
      }
    }

    handleAttemptInput(e) {
      if (this.activePointerHandled) return;

      const clickX = e ? e.clientX : window.innerWidth / 2;
      const clickY = e ? e.clientY : window.innerHeight / 2;

      const currentPlayer = this.getCurrentPlayer();
      if (!currentPlayer) return;

      if (this.state === GameState.WAITING) {
        // FALSE START!
        this.activePointerHandled = true;
        this.clearTimers();
        sound.playFalseStart();
        addTrauma(1.0);
        spawnShockParticles(clickX, clickY, true);

        const attempt = {
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          emoji: currentPlayer.emoji || '🐱',
          color: currentPlayer.color || '#38bdf8',
          status: 'false_start',
          reactionMs: Infinity,
          attemptOrder: this.attempts.length + 1
        };
        this.attempts.push(attempt);
        this.roundLoser = currentPlayer;
        this.lossReason = `มือลั่นในตำนาน! แตะก่อนสัญญาณจริงปรากฏ`;
        this.state = GameState.FALSE_START_RESULT;
        renderApp();
      } else if (this.state === GameState.TRIGGERED) {
        // VALID REACTION TAP!
        this.activePointerHandled = true;
        const tapTime = performance.now();
        const reactionMs = Math.max(1, tapTime - this.triggerTimestamp);
        this.clearTimers();
        sound.playValidTap();
        addTrauma(0.3);
        spawnShockParticles(clickX, clickY, false);

        const attempt = {
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          emoji: currentPlayer.emoji || '🐱',
          color: currentPlayer.color || '#38bdf8',
          status: 'valid',
          reactionMs: reactionMs,
          attemptOrder: this.attempts.length + 1
        };
        this.attempts.push(attempt);
        this.state = GameState.PLAYER_RESULT;
        renderApp();
      }
    }

    proceedAfterPlayerResult() {
      this.currentTurnIndex++;
      if (this.currentTurnIndex < this.activeRoster.length) {
        this.state = GameState.PASS_DEVICE;
        renderApp();
      } else {
        this.evaluateRoundResults();
      }
    }

    evaluateRoundResults() {
      const falseStarter = this.attempts.find(a => a.status === 'false_start');
      if (falseStarter) {
        this.roundLoser = { id: falseStarter.playerId, name: falseStarter.playerName, emoji: falseStarter.emoji, color: falseStarter.color };
        this.lossReason = `มือลั่นในตำนาน! แตะก่อนสัญญาณจริงปรากฏ`;
        this.state = GameState.FINAL_RESULTS;
        sound.playVictory();
        spawnConfetti();
        renderApp();
        return;
      }

      const validAttempts = this.attempts.filter(a => a.status === 'valid');
      validAttempts.sort((a, b) => a.reactionMs - b.reactionMs);

      if (validAttempts.length === 0) {
        this.state = GameState.SETUP;
        renderApp();
        return;
      }

      const slowestAttempt = validAttempts[validAttempts.length - 1];
      const slowestMs = slowestAttempt.reactionMs;

      const tiedWithSlowest = validAttempts.filter(a => Math.abs(a.reactionMs - slowestMs) < 0.05);

      if (tiedWithSlowest.length > 1) {
        this.isSuddenDeath = true;
        this.suddenDeathTiedPlayers = tiedWithSlowest.map(a => ({ id: a.playerId, name: a.playerName, emoji: a.emoji, color: a.color }));
        this.activeRoster = [...this.suddenDeathTiedPlayers];
        this.currentTurnIndex = 0;
        this.attempts = [];
        this.state = GameState.SUDDEN_DEATH_ANNOUNCE;
        sound.playSuddenDeath();
        renderApp();
      } else {
        this.roundLoser = { id: slowestAttempt.playerId, name: slowestAttempt.playerName, emoji: slowestAttempt.emoji, color: slowestAttempt.color };
        this.lossReason = `ปฏิกิริยาช้าที่สุดในวง (${Math.round(slowestAttempt.reactionMs)} ms)`;
        this.state = GameState.FINAL_RESULTS;
        sound.playVictory();
        spawnConfetti();
        renderApp();
      }
    }

    proceedFromSuddenDeathAnnounce() {
      this.state = GameState.PASS_DEVICE;
      renderApp();
    }
  }

  const engine = new FreezeTapEngine();

  /* ==========================================================================
     5. VISIBILITY & FOCUS INTEGRITY HANDLER
     ========================================================================== */
  function handleVisibilityChange() {
    if (document.hidden || document.visibilityState === 'hidden') {
      if (engine.state === GameState.WAITING || engine.state === GameState.TRIGGERED) {
        engine.clearTimers();
        engine.interruptedState = engine.state;
        const modal = document.getElementById('interruptionModal');
        modal.style.display = 'flex';
        armPanel(modal);
      }
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', () => {
    if (engine.state === GameState.WAITING || engine.state === GameState.TRIGGERED) {
      engine.clearTimers();
      const modal = document.getElementById('interruptionModal');
      modal.style.display = 'flex';
      armPanel(modal);
    }
  });

  document.getElementById('resumeTurnBtn').addEventListener('click', () => {
    document.getElementById('interruptionModal').style.display = 'none';
    engine.state = GameState.PASS_DEVICE;
    renderApp();
  });

  /* ==========================================================================
     6. UI RENDERER & SCREEN TEMPLATES
     ========================================================================== */
  const mainContent = document.getElementById('mainContent');

  // ADR-0017: every screen this route shows is mounted by replacing an existing container's
  // innerHTML, so the gate has to be re-armed on each reveal — one call at init would arm the setup
  // screen's buttons and nothing after it. One canceller PER CONTAINER, because a container is
  // reused across screens: without it every render would leave another pointerdown listener on the
  // same node, each one still flipping `disabled` on buttons that are no longer in the document.
  const disarmers = new Map();
  function armPanel(el, except = []) {
    if (!el) return;
    const cancel = disarmers.get(el);
    if (cancel) cancel();
    disarmers.set(el, armAllButtons(el, except));
  }

  // The controls a player deliberately taps twice in a row, so the 400ms window must never cover
  // them. _arm-gate.ts records that ceiling as PER CONTROL, and the count steppers are the case it
  // names: a group of eight presses + six times in a burst, and a gate that swallowed presses 2..6
  // would take the setup away rather than protect it. Same list cannon-flag's rapidTapControls()
  // keeps for its own steppers. Re-queried per call because renderSetupScreen() replaces
  // #mainContent wholesale — a cached reference would name a detached node. Empty on every other
  // screen, where neither id exists, so one unconditional call covers the whole route.
  function rapidTapControls() {
    return [document.getElementById('decPlayerBtn'), document.getElementById('incPlayerBtn')]
      .filter(Boolean);
  }

  // The live region ships empty in markup.html; this is the only thing that writes it. Round state
  // ONLY — whose turn it is and what the round's rule is, both of which are already on screen in
  // large type. The trigger itself is never announced: a screen reader firing at the instant the
  // target goes live would hand one player a cue the others do not have, which is the whole game.
  const liveEl = document.getElementById('ftRoundLive');
  function announce(message) {
    if (liveEl) liveEl.textContent = message;
  }

  function announceForState() {
    const cond = engine.currentCondition;
    if (engine.state === GameState.RULE_REVEAL) {
      announce(`เริ่มรอบใหม่ กติกาของรอบนี้: ${cond ? cond.prompt : ''}`);
      return;
    }
    if (engine.state === GameState.PASS_DEVICE) {
      const player = engine.getCurrentPlayer();
      const who = player ? player.name : 'ผู้เล่นคนถัดไป';
      announce(engine.isSuddenDeath ? `รอบดวลตัดสิน ถึงตาของ ${who}` : `ถึงตาของ ${who} ส่งเครื่องให้เขา`);
    }
  }

  function renderApp() {
    mainContent.innerHTML = '';

    switch (engine.state) {
      case GameState.SETUP:
        renderSetupScreen();
        break;
      case GameState.RULE_REVEAL:
        renderRuleRevealScreen();
        break;
      case GameState.PASS_DEVICE:
        renderPassDeviceScreen();
        break;
      case GameState.WAITING:
      case GameState.TRIGGERED:
        renderActiveGameScreen();
        break;
      case GameState.PLAYER_RESULT:
        renderPlayerResultScreen();
        break;
      case GameState.FALSE_START_RESULT:
        renderFalseStartScreen();
        break;
      case GameState.SUDDEN_DEATH_ANNOUNCE:
        renderSuddenDeathAnnounceScreen();
        break;
      case GameState.FINAL_RESULTS:
        renderFinalResultsScreen();
        break;
    }

    // Every screen, setup included. Setup was excepted here until both of the reasons for it were
    // answered: (1) roster-bridge.ts seeds a saved group by clicking the setup controls and
    // .click() on a `disabled` button dispatches nothing — that bridge now routes every
    // programmatic press through its drive() helper, which clears the flag for the one call and
    // restores it, so seeding no longer depends on the screen being ungated; (2) nothing else in
    // this file writes .disabled, so arming cannot fight a second owner of the flag. And the hazard
    // is real rather than theoretical: #resetAppBtn calls renderApp() with no page reload, so the
    // second contact of a double-tap on it lands on a setup screen that was painted between the two
    // contacts — exactly the ghost tap ADR-0017 exists to stop.
    armPanel(mainContent, rapidTapControls());
    announceForState();
  }

  // 1. SETUP SCREEN
  function renderSetupScreen() {
    const presets = [2, 3, 4, 5, 8, 12, 16, 20];
    
    let rosterHtml = '';
    engine.players.forEach((p, idx) => {
      rosterHtml += `
        <div class="roster-item" style="border-left: 4px solid ${p.color || '#38bdf8'};">
          <span style="font-size: 1.3rem; line-height: 1;">${p.emoji || '🐱'}</span>
          <input type="text" class="roster-input" data-index="${idx}" value="${escapeHtml(p.name)}" maxlength="15" />
        </div>
      `;
    });

    let presetsHtml = presets.map(num => `
      <button class="preset-pill ${engine.playerCount === num ? 'active' : ''}" data-preset="${num}">${num} คน</button>
    `).join('');

    mainContent.innerHTML = `
      <div class="setup-container">
        <div class="setup-header">
          <span class="badge badge-primary">⚡ เกมวัดปฏิกิริยาคัดคนแพ้</span>
          <h1 style="margin-top: 8px;">ตั้งค่าผู้เล่น</h1>
          <p>ส่งต่อเครื่องเล่นด้วยกัน 2–20 คน</p>
        </div>

        <div class="glass-card" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="player-count-bar">
            <span style="font-weight: 700;">จำนวนผู้เล่น</span>
            <div class="count-control">
              <button id="decPlayerBtn" class="count-btn">−</button>
              <span class="count-display">${engine.playerCount}</span>
              <button id="incPlayerBtn" class="count-btn">+</button>
            </div>
          </div>

          <div class="preset-pills">${presetsHtml}</div>

          <div>
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">
              มาสคอตและรายชื่อผู้เล่น (แตะเพื่อแก้ไขชื่อ)
            </div>
            <div class="roster-list">${rosterHtml}</div>
          </div>

          <!-- gh#177 — sits with the roster it acts on, same placement short-stick's reset uses. -->
          <button id="resetNamesBtn" class="btn-secondary" type="button" style="width: 100%;">↺ รีเซ็ตเป็นชื่อสัตว์</button>
        </div>

        <button id="startGameBtn" class="btn-primary" style="font-size: 1.25rem;">
          🚀 เริ่มเกม (${engine.playerCount} คน)
        </button>
      </div>
    `;

    document.getElementById('decPlayerBtn').onclick = () => {
      sound.playClick();
      engine.setPlayerCount(engine.playerCount - 1);
      renderApp();
    };
    document.getElementById('incPlayerBtn').onclick = () => {
      sound.playClick();
      engine.setPlayerCount(engine.playerCount + 1);
      renderApp();
    };

    document.querySelectorAll('.preset-pill').forEach(btn => {
      btn.onclick = () => {
        sound.playClick();
        engine.setPlayerCount(parseInt(btn.dataset.preset, 10));
        renderApp();
      };
    });

    document.querySelectorAll('.roster-input').forEach(input => {
      input.oninput = (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        engine.updatePlayerName(idx, e.target.value);
      };
    });

    document.getElementById('resetNamesBtn').onclick = () => {
      sound.playClick();
      resetNamesModal.style.display = 'flex';
      armPanel(resetNamesModal);
    };

    document.getElementById('startGameBtn').onclick = () => {
      sound.playClick(640);
      engine.startNewRound();
    };
  }

  // 2. RULE REVEAL SCREEN
  function renderRuleRevealScreen() {
    const cond = engine.currentCondition;
    mainContent.innerHTML = `
      <div class="rule-reveal-container">
        <div class="badge badge-warning">🎯 กฎสัญญาณรอบนี้</div>
        
        <div class="rule-banner">
          <div style="color: var(--text-muted); font-size: 0.95rem; font-weight: 700;">
            ทุกคนต้องทำตามเงื่อนไขนี้:
          </div>
          
          <div class="rule-target-preview" style="background-color: ${cond.targetBg};">
            ${cond.targetSymbol || '●'}
          </div>

          <div class="rule-instruction">
            ${escapeHtml(cond.prompt)}
          </div>
        </div>

        <div class="glass-card" style="width: 100%; text-align: left; font-size: 0.9rem; color: var(--text-muted);">
          <div style="font-weight: 700; color: #fff; margin-bottom: 6px;">⚠️ ระวังสัญญาณหลอก!</div>
          • จะมีสีหลอก คำหลอก ("รอ", "อย่าเพิ่ง") และสัญลักษณ์ผิดโผล่มากวน<br>
          • <strong>ถ้ากดก่อนสัญญาณจริง = แพ้ทันที (False Start)!</strong>
        </div>

        <button id="ruleReadyBtn" class="btn-primary">
          รับทราบ! เริ่มส่งเครื่อง ➔
        </button>
      </div>
    `;

    document.getElementById('ruleReadyBtn').onclick = () => {
      sound.playClick();
      engine.proceedToPassDevice();
    };
  }

  // 3. PASS THE DEVICE SCREEN
  function renderPassDeviceScreen() {
    const player = engine.getCurrentPlayer();
    const cond = engine.currentCondition;
    const isSudden = engine.isSuddenDeath;
    const turnNum = engine.currentTurnIndex + 1;
    const totalTurns = engine.activeRoster.length;

    mainContent.innerHTML = `
      <div class="pass-container">
        <div class="badge ${isSudden ? 'badge-danger' : 'badge-primary'}">
          ${isSudden ? '⚔️ รอบดวลตัดสิน SUDDEN DEATH' : `ตาที่ ${turnNum} จาก ${totalTurns}`}
        </div>

        <div class="pass-player-card">
          <div style="color: var(--text-muted); font-size: 1.05rem; font-weight: 700;">
            ส่งโทรศัพท์ให้
          </div>
          <div class="player-name-huge" style="color: ${player ? player.color : '#fff'};">
            <span style="font-size: 2.4rem;">${player ? player.emoji : '👤'}</span> ${escapeHtml(player ? player.name : 'ผู้เล่น')}
          </div>
          
          <div class="pass-condition-box" style="border-color: ${cond.targetBg};">
            <div class="pass-condition-title">🎯 เงื่อนไขที่ต้องกดในรอบนี้</div>
            <div class="pass-target-badge" style="background-color: ${cond.targetBg};">
              ${cond.targetSymbol || '●'}
            </div>
            <div class="pass-condition-prompt">${escapeHtml(cond.prompt)}</div>
            <div class="pass-condition-warn">⚠️ สัญญาณหลอกจะโผล่มากวน ห้ามแตะก่อนสัญญาณจริง!</div>
          </div>
        </div>

        <div style="font-size: 0.95rem; color: var(--text-muted);">
          กด <strong>พร้อมแล้ว</strong> เมื่อจับโทรศัพท์ถนัดมือ
        </div>

        <button id="playerReadyBtn" class="btn-primary" style="font-size: 1.35rem; padding: 20px;">
          ⚡ พร้อมแล้ว (เริ่มตาของคุณ)
        </button>
      </div>
    `;

    document.getElementById('playerReadyBtn').onclick = () => {
      sound.playReady();
      engine.beginActiveAttempt();
    };
  }

  // 4. ACTIVE GAMEPLAY (WAITING & TRIGGERED)
  function renderActiveGameScreen() {
    const player = engine.getCurrentPlayer();
    const cond = engine.currentCondition;

    mainContent.innerHTML = `
      <div id="gameTargetSurface" class="game-surface">
        <div class="game-hud-top">
          <span class="active-turn-info" style="border-color: ${player ? player.color : 'var(--border-card)'};">
            ${player ? player.emoji : '👤'} ${escapeHtml(player ? player.name : '')}
          </span>
          <span class="badge badge-warning">🎯 ${escapeHtml(cond.prompt)}</span>
        </div>

        <div id="gameTargetBtn" class="target-surface-center" style="background-color: #1e293b;">
          <span style="font-size: 2.2rem; color: var(--text-muted);">รอ...</span>
        </div>

        <div class="game-hud-bottom">
          <span class="game-hint-text">🔒 รอสัญญาณ: ${escapeHtml(cond.prompt)}</span>
        </div>
      </div>
    `;

    const surface = document.getElementById('gameTargetSurface');
    const handleInput = (e) => {
      e.preventDefault();
      engine.handleAttemptInput(e);
    };

    surface.addEventListener('pointerdown', handleInput, { passive: false });
  }

  // 5. PLAYER RESULT SCREEN
  function renderPlayerResultScreen() {
    const player = engine.getCurrentPlayer();
    const lastAttempt = engine.attempts[engine.attempts.length - 1];
    const reaction = lastAttempt ? Math.round(lastAttempt.reactionMs) : 0;

    let tierBadge = 'badge-primary';
    let ratingText = '👍 ความไวปกติ';
    if (reaction < 200) {
      tierBadge = 'badge-warning';
      ratingText = '⚡ ไวระดับเทพ!';
    } else if (reaction < 300) {
      tierBadge = 'badge-success';
      ratingText = '🔥 เฉียบคมมาก!';
    } else if (reaction > 450) {
      tierBadge = 'badge-danger';
      ratingText = '🐢 ช้าไปนิดนะ...';
    }

    const isLastPlayer = engine.currentTurnIndex === engine.activeRoster.length - 1;

    mainContent.innerHTML = `
      <div class="result-container">
        <span class="badge ${tierBadge}">${ratingText}</span>
        
        <div class="glass-card" style="width: 100%;">
          <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-muted);">
            เวลาตอบสนองของ <span style="color: ${player ? player.color : '#fff'};">${player ? player.emoji : '👤'} ${escapeHtml(player ? player.name : '')}</span>
          </div>
          <div class="lcd-digital-timer safe">${reaction} <span style="font-size: 1.8rem;">ms</span></div>
        </div>

        <button id="nextTurnBtn" class="btn-primary" style="font-size: 1.2rem; padding: 18px;">
          ${isLastPlayer ? '🏆 ดูผลสรุปทั้งวง ➔' : 'ผู้เล่นคนถัดไป ➔'}
        </button>
      </div>
    `;

    document.getElementById('nextTurnBtn').onclick = () => {
      sound.playClick();
      engine.proceedAfterPlayerResult();
    };
  }

  // 6. FALSE START SCREEN
  function renderFalseStartScreen() {
    const loser = engine.roundLoser;
    const cond = engine.currentCondition;

    mainContent.innerHTML = `
      <div class="result-container">
        <span class="badge badge-danger">💥 มือลั่นในตำนาน! (FALSE START)</span>
        
        <div class="loser-callout-card" style="width: 100%;">
          <div style="font-size: 1rem; font-weight: 800; text-transform: uppercase; color: #fca5a5;">
            👑 แชมป์มือลั่นประจำรอบ
          </div>
          <div class="loser-name">
            <span style="font-size: 2rem;">${loser ? (loser.emoji || '💥') : ''}</span> ${escapeHtml(loser ? loser.name : '')}
          </div>
          <div class="lcd-digital-timer hazard-triggered" style="font-size: 2.2rem;">
            มือลั่น!
          </div>
          <div style="font-size: 0.95rem; color: #fecaca; margin-top: 8px;">
            อุ๊ย... มือลั่นไปโดนก่อนสัญญาณจริง (${escapeHtml(cond.prompt)}) โผล่มา!
          </div>
        </div>

        <button id="viewFinalResultsBtn" class="btn-primary">
          🏆 ดูตารางสรุปผล
        </button>
      </div>
    `;

    document.getElementById('viewFinalResultsBtn').onclick = () => {
      sound.playClick();
      engine.state = GameState.FINAL_RESULTS;
      renderApp();
    };
  }

  // 7. SUDDEN DEATH ANNOUNCE SCREEN
  function renderSuddenDeathAnnounceScreen() {
    const tiedNames = engine.suddenDeathTiedPlayers.map(p => `${p.emoji || '⚔️'} ${p.name}`).join(' vs ');

    mainContent.innerHTML = `
      <div class="result-container">
        <span class="badge badge-danger">⚔️ ดวลตัดสิน</span>
        
        <div class="glass-card" style="width: 100%; border-color: var(--danger); box-shadow: 0 0 30px var(--danger-glow);">
          <div style="font-size: 1.1rem; font-weight: 800; color: #fca5a5;">
            คะแนนช้าสุดเสมอกัน!
          </div>
          <h2 style="font-size: 1.8rem; font-weight: 900; margin: 12px 0;">
            ${escapeHtml(tiedNames)}
          </h2>
          <p style="font-size: 0.95rem; color: var(--text-muted);">
            ผู้เล่นที่ได้เวลาช้าสุดเท่ากันต้องดวล Sudden Death อีกรอบ คนที่ช้ากว่าหรือมือลั่นก่อนจะเป็นผู้แพ้!
          </p>
        </div>

        <button id="startSuddenDeathBtn" class="btn-danger" style="font-size: 1.2rem; padding: 18px;">
          ⚔️ เริ่มรอบดวลตัดสิน
        </button>
      </div>
    `;

    document.getElementById('startSuddenDeathBtn').onclick = () => {
      sound.playClick();
      engine.proceedFromSuddenDeathAnnounce();
    };
  }

  // 8. FINAL RESULTS SCREEN
  function renderFinalResultsScreen() {
    const loser = engine.roundLoser;
    
    const sorted = [...engine.attempts].sort((a, b) => {
      if (a.status === 'false_start') return 1;
      if (b.status === 'false_start') return -1;
      return a.reactionMs - b.reactionMs;
    });

    let rankingRowsHtml = sorted.map((att, idx) => {
      const isLoser = loser && att.playerId === loser.id;
      const isTop = idx === 0 && att.status === 'valid';
      const timeStr = att.status === 'false_start' ? '💥 มือลั่น (ฟาวล์)' : `${Math.round(att.reactionMs)} ms`;
      const rankBadge = isTop ? '👑 1' : (idx + 1);

      return `
        <div class="ranking-row ${isTop ? 'rank-1' : ''} ${isLoser ? 'is-loser' : ''}" style="border-left: 4px solid ${att.color || 'var(--border-card)'};">
          <span class="rank-pos">${rankBadge}</span>
          <span style="font-size: 1.2rem; margin-right: 6px;">${att.emoji || '👤'}</span>
          <span class="rank-player-name">${escapeHtml(att.playerName)}</span>
          <span class="rank-time ${att.status === 'false_start' ? 'hazard-triggered' : ''}">${timeStr}</span>
        </div>
      `;
    }).join('');

    mainContent.innerHTML = `
      <div class="leaderboard-container">
        <div class="loser-callout-card">
          <div style="font-size: 0.9rem; font-weight: 800; text-transform: uppercase; color: #fca5a5;">
            🎯 ผู้แพ้ประจำรอบนี้
          </div>
          <div class="loser-name">
            <span style="font-size: 2rem;">${loser ? (loser.emoji || '🎯') : ''}</span> ${escapeHtml(loser ? loser.name : 'ไม่ระบุ')}
          </div>
          <div style="font-size: 0.9rem; color: #fecaca;">
            ${escapeHtml(engine.lossReason)}
          </div>
        </div>

        <div class="glass-card">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">
            ลำดับความเร็ว (เร็วสุด ➔ ช้าสุด)
          </div>
          <div class="ranking-table">${rankingRowsHtml}</div>
        </div>

        <div style="display: flex; gap: 10px;">
          <button id="playAgainBtn" class="btn-primary">
            🔄 เล่นอีกรอบ
          </button>
          <button id="editPlayersBtn" class="btn-secondary" style="width: auto;">
            ⚙️ ตั้งค่า
          </button>
        </div>
      </div>
    `;

    document.getElementById('playAgainBtn').onclick = () => {
      sound.playClick();
      engine.startNewRound();
    };
    document.getElementById('editPlayersBtn').onclick = () => {
      sound.playClick();
      engine.state = GameState.SETUP;
      renderApp();
    };
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

  /* ==========================================================================
     7. GLOBAL NAV BUTTON HANDLERS
     ========================================================================== */
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  soundToggleBtn.addEventListener('click', () => {
    const isEnabled = sound.toggle();
    soundToggleBtn.textContent = isEnabled ? '🔊' : '🔇';
  });

  // #resetAppBtn (above) only returns to the setup screen -- it keeps every typed name, it is not
  // destructive, and no confirm guards it. #resetNamesBtn (inside renderSetupScreen) is the
  // opposite: it overwrites every typed name with the mascot cast and cannot be undone, which is
  // why it opens this modal and asks first, per gh#177 / gh#174.
  const resetAppBtn = document.getElementById('resetAppBtn');
  resetAppBtn.addEventListener('click', () => {
    sound.playClick();
    engine.clearTimers();
    engine.state = GameState.SETUP;
    renderApp();
  });

  // Reset Player Names Confirm (gh#177, pattern gh#174). #resetNamesBtn opens this; the button
  // itself lives inside renderSetupScreen()'s template and is re-wired there each render, the same
  // way decPlayerBtn and startGameBtn are. This modal is static markup (markup.html) that only
  // toggles display, so its own three buttons are wired once, here.
  //
  // What protects a double-tap on #confirmResetNamesBtn is the 400ms armPanel window opened above,
  // not the order the close/cancel/confirm buttons appear in -- armPanel disables every button it
  // collects (including the autofocus target) until the window is quiet, so no button is a safe
  // "first contact" to rely on. Confirming re-renders #mainContent through renderApp(), which arms
  // it again unconditionally on its last line (see the comment at renderApp() for why setup is
  // included).
  //
  // gh#187: the rebuild was never what made the confirm safe, and close/cancel rebuild nothing at
  // all. HIDING this modal is itself a reveal -- #startGameBtn and the preset pills sit under the
  // card, still enabled, their own arm window long expired, which is exactly why a second contact
  // fires one. So the arming lives in the shared closer, where all three branches pass through it,
  // and the rapid-tap steppers stay excepted the same way renderApp() excepts them.
  const resetNamesModal = document.getElementById('resetNamesModal');
  const closeResetNamesModal = () => {
    resetNamesModal.style.display = 'none';
    armPanel(mainContent, rapidTapControls());
  };
  document.getElementById('closeResetNamesModalBtn').addEventListener('click', closeResetNamesModal);
  document.getElementById('cancelResetNamesBtn').addEventListener('click', closeResetNamesModal);
  document.getElementById('confirmResetNamesBtn').addEventListener('click', () => {
    sound.playClick(420);
    engine.resetPlayerNames();
    closeResetNamesModal();
    renderApp();
  });

  /* ==========================================================================
     8. AUTOMATED IN-APP TEST RUNNER
     ========================================================================== */
  const testModal = document.getElementById('testModal');
  const testResultsList = document.getElementById('testResultsList');

  document.getElementById('testRunnerOpenBtn').addEventListener('click', () => {
    sound.playClick();
    testModal.style.display = 'flex';
    armPanel(testModal);
    runAllUnitTests();
  });

  document.getElementById('closeTestModalBtn').addEventListener('click', () => {
    testModal.style.display = 'none';
  });

  document.getElementById('executeTestsBtn').addEventListener('click', () => {
    runAllUnitTests();
  });

  function runAllUnitTests() {
    testResultsList.innerHTML = '<div style="color: var(--text-muted); padding: 10px;">กำลังรันการทดสอบ...</div>';
    
    const results = [];
    const assert = (desc, cond) => {
      results.push({ desc, pass: !!cond });
    };

    try {
      const testEng = new FreezeTapEngine();
      testEng.setPlayerCount(2);
      assert('รองรับผู้เล่นขั้นต่ำ 2 คน', testEng.playerCount === 2 && testEng.players.length === 2);
      
      testEng.setPlayerCount(20);
      assert('รองรับผู้เล่นสูงสุด 20 คน', testEng.playerCount === 20 && testEng.players.length === 20);

      testEng.setPlayerCount(1);
      assert('ปรับค่าต่ำกว่า 2 ให้อยู่ที่ 2 อัตโนมัติ', testEng.playerCount === 2);

      testEng.setPlayerCount(30);
      assert('ปรับค่าเกิน 20 ให้อยู่ที่ 20 อัตโนมัติ', testEng.playerCount === 20);

      TRIGGER_CONDITIONS.forEach(cond => {
        const hasMatchingDecoy = cond.decoys.some(d => {
          if (cond.category === 'color') return d.bg.toLowerCase() === cond.targetBg.toLowerCase();
          if (cond.category === 'text') return d.text === cond.targetText;
          if (cond.category === 'symbol') return d.symbol === cond.targetSymbol;
          return false;
        });
        assert(`สัญญาณหลอกในเงื่อนไข ${cond.id} ไม่ซ้ำกับสัญญาณจริง`, !hasMatchingDecoy);
      });

      testEng.setPlayerCount(3);
      testEng.startNewRound();
      testEng.proceedToPassDevice();
      testEng.beginActiveAttempt();
      testEng.handleAttemptInput(null);
      assert('แตะก่อนเวลาในสถานะ WAITING จะตัดสิทธิ์ False Start', testEng.state === GameState.FALSE_START_RESULT);
      assert('ผู้เล่นที่ออกตัวก่อนเวลาถูกระบุเป็นผู้แพ้ทันที', testEng.roundLoser.id === testEng.players[0].id);

      testEng.setPlayerCount(3);
      testEng.startNewRound();
      testEng.attempts = [
        { playerId: 'p_1', playerName: 'เมย์', status: 'valid', reactionMs: 250 },
        { playerId: 'p_2', playerName: 'ริส', status: 'valid', reactionMs: 190 },
        { playerId: 'p_3', playerName: 'ปอนด์', status: 'valid', reactionMs: 420 }
      ];
      testEng.evaluateRoundResults();
      assert('เรียงลำดับจากเร็วสุดไปช้าสุดถูกต้อง', testEng.state === GameState.FINAL_RESULTS);
      assert('ผู้เล่นที่ช้าที่สุดถูกระบุเป็นผู้แพ้', testEng.roundLoser.id === 'p_3');

      testEng.setPlayerCount(3);
      testEng.startNewRound();
      testEng.attempts = [
        { playerId: 'p_1', playerName: 'เมย์', status: 'valid', reactionMs: 210 },
        { playerId: 'p_2', playerName: 'ริส', status: 'valid', reactionMs: 380 },
        { playerId: 'p_3', playerName: 'ปอนด์', status: 'valid', reactionMs: 380 }
      ];
      testEng.evaluateRoundResults();
      assert('เวลาช้าสุดเท่ากัน 2 คน เข้าสู่รอบ Sudden Death', testEng.state === GameState.SUDDEN_DEATH_ANNOUNCE);
      assert('คัดเฉพาะผู้เล่นที่เสมอกันเข้าสู่ Sudden Death', testEng.activeRoster.length === 2 && testEng.activeRoster.some(p => p.id === 'p_2') && testEng.activeRoster.some(p => p.id === 'p_3'));

      testEng.setPlayerCount(4);
      testEng.startNewRound();
      testEng.attempts = [
        { playerId: 'p_1', playerName: 'เมย์', status: 'valid', reactionMs: 180 },
        { playerId: 'p_2', playerName: 'ริส', status: 'valid', reactionMs: 350 },
        { playerId: 'p_3', playerName: 'ปอนด์', status: 'valid', reactionMs: 350 },
        { playerId: 'p_4', playerName: 'บีม', status: 'valid', reactionMs: 350 }
      ];
      testEng.evaluateRoundResults();
      assert('เวลาช้าสุดเท่ากัน 3 คน เข้าสู่ Sudden Death ครบทุกคน', testEng.activeRoster.length === 3);

      testEng.startNewRound();
      testEng.beginActiveAttempt();
      const scheduledCount = testEng.pendingTimeouts.length;
      testEng.clearTimers();
      assert('clearTimers เคลียร์ Timeout ที่ค้างอยู่ทั้งหมด', scheduledCount > 0 && testEng.pendingTimeouts.length === 0);

      testResultsList.innerHTML = results.map(r => `
        <div class="test-item ${r.pass ? 'pass' : 'fail'}">
          <span>${escapeHtml(r.desc)}</span>
          <strong>${r.pass ? '✓ ผ่าน' : '✗ ไม่ผ่าน'}</strong>
        </div>
      `).join('');

    } catch (err) {
      testResultsList.innerHTML = `<div class="test-item fail">ข้อผิดพลาดในการทดสอบ: ${escapeHtml(err.message)}</div>`;
    }
  }

  renderApp();

  window.__freezeTapEngine = engine;
  window.__freezeTapRunTests = runAllUnitTests;
})();
