/**
 * The croc-bite play route — the whole engine, in one file.
 *
 * The mockup ships ten ES modules; this route ships them concatenated in dependency order, because
 * the instruments that judge a play route read main.js as the route's entire engine by slicing its
 * source text. A sibling module would be invisible to every one of them.
 *
 * Section order: rules, state, audio, scene, crocodile, hand, input, UI, boot.
 */
import * as THREE from 'three';
// The device's one shared muted state, the same module every other play route's synth reads (see
// cannon-flag's SoundSynthesizer). This route's own main.ts still owns pushing it into
// GameState.setAudioEnabled and the UI paint; this import only lets the audio manager's own gates
// read the same live flag every other route reads.
import { isMuted, setMuted } from '../../shell/audio.ts';

/**
 * RULES AND CONSTANTS. The mascot roster, the tooth layout per seat count, the live bite odds, and
 * the random picks a round needs. Pure: nothing here reads the DOM or the clock.
 *
 * The 2-6 seat range and the tooth counts that follow from it are the mockup's own and are carried
 * unchanged.
 */
const SAFE_ACTIONS = {
  BREAK_TILT: 'break_tilt',
  SINK: 'sink',
  WOBBLE_FALL: 'wobble_fall',
};

const MASCOT_PLAYERS = [
  { id: 'p1', defaultName: 'แมวส้ม', emoji: '🐱', sleeve: '#FF6B35', text: '#FFFFFF' },
  { id: 'p2', defaultName: 'ชิบะ', emoji: '🐶', sleeve: '#2E86AB', text: '#FFFFFF' },
  { id: 'p3', defaultName: 'บันนี่', emoji: '🐰', sleeve: '#8E44AD', text: '#FFFFFF' },
  { id: 'p4', defaultName: 'ฟร็อกกี้', emoji: '🐸', sleeve: '#27AE60', text: '#FFFFFF' },
  { id: 'p5', defaultName: 'หมีทอง', emoji: '🐻', sleeve: '#F39C12', text: '#FFFFFF' },
  { id: 'p6', defaultName: 'แพนด้า', emoji: '🐼', sleeve: '#E84393', text: '#FFFFFF' },
];

const PLAYER_COLORS = MASCOT_PLAYERS.map(p => ({
  id: p.id,
  name: p.defaultName,
  emoji: p.emoji,
  sleeve: p.sleeve,
  text: p.text,
}));

const SKIN_TONES = [
  '#FFE0BD', // Light Peach
  '#F1C27D', // Fair Warm
  '#E0AC69', // Medium Gold
  '#C68642', // Honey Tan
  '#8D5524', // Rich Brown
  '#5C381E', // Deep Espresso
];

/**
 * Returns tooth layout configuration based on player count.
 * Increased tooth density for higher suspense and fun:
 * - 2, 4 players => 16 teeth (8 upper, 8 lower)
 * - 3, 6 players => 18 teeth (9 upper, 9 lower)
 * - 5 players => 20 teeth (10 upper, 10 lower)
 * @param {number} playerCount 
 * @returns {{ upperCount: number, lowerCount: number, totalCount: number, toothIds: string[] }}
 */
function getToothConfig(playerCount) {
  let countPerJaw = 8;
  if (playerCount === 3 || playerCount === 6) {
    countPerJaw = 9;
  } else if (playerCount === 5) {
    countPerJaw = 10;
  } else {
    countPerJaw = 8;
  }

  const upperCount = countPerJaw;
  const lowerCount = countPerJaw;
  const totalCount = upperCount + lowerCount;
  
  const toothIds = [];
  for (let i = 0; i < upperCount; i++) {
    toothIds.push(`upper_${i}`);
  }
  for (let i = 0; i < lowerCount; i++) {
    toothIds.push(`lower_${i}`);
  }
  
  return {
    upperCount,
    lowerCount,
    totalCount,
    toothIds,
  };
}

/**
 * Calculate live bite odds from remaining unclicked teeth
 * @param {number} remainingCount 
 * @returns {{ fraction: string, percent: number, isCritical: boolean, isHigh: boolean }}
 */
function calculateBiteOdds(remainingCount) {
  const count = Math.max(1, remainingCount);
  const percent = Number(((1 / count) * 100).toFixed(1));
  return {
    remaining: count,
    fraction: `1 ใน ${count}`,
    percent,
    isCritical: percent >= 33.3, // 1 in 3 or worse -> Red alarm
    isHigh: percent >= 15.0,     // 1 in 6 or worse -> Warning gold
  };
}

/**
 * Pick starting player index uniformly at random
 * @param {number} playerCount 
 * @param {() => number} [rng=Math.random]
 * @returns {number}
 */
function pickStartingPlayer(playerCount, rng = Math.random) {
  if (playerCount < 2) return 0;
  return Math.floor(rng() * playerCount);
}

/**
 * Pick exactly one losing tooth ID uniformly at random from active teeth
 * @param {string[]} toothIds 
 * @param {() => number} [rng=Math.random]
 * @returns {string}
 */
function pickLosingTooth(toothIds, rng = Math.random) {
  if (!toothIds || toothIds.length === 0) {
    throw new Error('Cannot pick losing tooth from empty tooth list');
  }
  const idx = Math.floor(rng() * toothIds.length);
  return toothIds[idx];
}

/**
 * Pick a safe tooth outcome uniformly (~1/3 probability each)
 * @param {() => number} [rng=Math.random]
 * @returns {'break_tilt' | 'sink' | 'wobble_fall'}
 */
function pickSafeOutcome(rng = Math.random) {
  const roll = rng();
  if (roll < 1 / 3) {
    return SAFE_ACTIONS.BREAK_TILT;
  } else if (roll < 2 / 3) {
    return SAFE_ACTIONS.SINK;
  } else {
    return SAFE_ACTIONS.WOBBLE_FALL;
  }
}

/**
 * Determine if crocodile cries comic tears (30% probability)
 * @param {() => number} [rng=Math.random]
 * @returns {boolean}
 */
function shouldCryTears(rng = Math.random) {
  return rng() < 0.30;
}

/**
 * Sanitize player name (prevent HTML injection, strip excessive whitespace)
 * @param {string} rawName 
 * @param {number} fallbackIndex 1-based index
 * @returns {string}
 */
function sanitizePlayerName(rawName, fallbackIndex) {
  const mascot = MASCOT_PLAYERS[fallbackIndex - 1] || MASCOT_PLAYERS[0];
  const fallback = mascot.defaultName;
  if (!rawName || typeof rawName !== 'string') {
    return fallback;
  }
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  return trimmed.slice(0, 16);
}

/**
 * AUTHORITATIVE STATE. Phases, the seat roster, per-round tooth bookkeeping, match scoring, and the
 * two motion preferences this route stores for itself. Emits; never renders.
 *
 * It stores no sound preference: this site keeps ONE muted state for the whole site and the glue
 * module owns it, so setAudioEnabled here only flips the in-memory flag and emits.
 */
const PHASES = {
  SETUP: 'SETUP',
  ROUND_INTRO: 'ROUND_INTRO',
  PLAYER_TURN: 'PLAYER_TURN',
  RESOLVING_SAFE: 'RESOLVING_SAFE',
  TURN_TRANSITION: 'TURN_TRANSITION',
  RESOLVING_LOSS: 'RESOLVING_LOSS',
  RESULT: 'RESULT',
  RESET_CONFIRMATION: 'RESET_CONFIRMATION',
};

const STORAGE_KEY_MOTION = 'watduang:croc-bite-motion';
const STORAGE_KEY_PARTICLES = 'watduang:croc-bite-particles';

class GameState {
  constructor() {
    this.listeners = new Map();
    this.phase = PHASES.SETUP;
    this.previousPhase = null;
    
    this.playerCount = 4;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.startingPlayerIndex = 0;
    
    // Match & Round Tracking
    this.currentRound = 1;
    this.maxRounds = 5; // Best of 5 match
    this.matchMode = 'standard'; // 'standard' | 'endless'
    this.scores = new Map(); // player_id -> number of survived rounds
    
    this.roundId = 0;
    this.toothConfig = getToothConfig(this.playerCount);
    this.teeth = new Map();
    this.losingToothId = null;
    this.loserPlayer = null;
    
    this.isInputLocked = true;
    this.resolutionToken = 0;
    this.focusedToothId = null;
    
    // Preferences
    // No stored sound preference of its own: the site owns one shared muted state, and the glue
    // module drives it through setAudioEnabled and the audio manager's setMuted. Sound on until
    // that glue says otherwise.
    this.audioEnabled = true;
    this.shakeEnabled = this.loadPref(STORAGE_KEY_MOTION, true);
    this.particlesEnabled = this.loadPref(STORAGE_KEY_PARTICLES, true);
    this.reducedMotion = this.detectReducedMotion();

    this.initDefaultPlayers(4);
  }

  // --- Event Handling ---
  on(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(fn);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const fn of this.listeners.get(event)) {
        try {
          fn(data);
        } catch (err) {
          console.error(`Error in event listener for ${event}:`, err);
        }
      }
    }
  }

  // --- Preferences ---
  loadPref(key, fallback = true) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val === 'true' : fallback;
    } catch {
      return fallback;
    }
  }

  setAudioEnabled(enabled) {
    this.audioEnabled = Boolean(enabled);
    this.emit('audioToggle', this.audioEnabled);
  }

  setShakeEnabled(enabled) {
    this.shakeEnabled = Boolean(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_MOTION, String(this.shakeEnabled));
    } catch {}
    this.emit('shakeToggle', this.shakeEnabled);
  }

  setParticlesEnabled(enabled) {
    this.particlesEnabled = Boolean(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_PARTICLES, String(this.particlesEnabled));
    } catch {}
    this.emit('particlesToggle', this.particlesEnabled);
  }

  detectReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    this.emit('reducedMotionToggle', this.reducedMotion);
  }

  // --- Player Setup & Mascot Assignment ---
  initDefaultPlayers(count) {
    this.playerCount = Math.max(2, Math.min(6, count));
    this.players = [];
    this.scores.clear();

    for (let i = 0; i < this.playerCount; i++) {
      const mascot = MASCOT_PLAYERS[i % MASCOT_PLAYERS.length];
      const skinTone = SKIN_TONES[i % SKIN_TONES.length];
      const p = {
        id: `player_${i}`,
        index: i,
        name: mascot.defaultName,
        emoji: mascot.emoji,
        rawName: '',
        sleeveColor: mascot.sleeve,
        textColor: mascot.text,
        skinTone: skinTone,
      };
      this.players.push(p);
      this.scores.set(p.id, 0);
    }
  }

  setPlayerCount(count) {
    const clamped = Math.max(2, Math.min(6, count));
    if (clamped === this.playerCount) return;
    
    this.playerCount = clamped;
    this.toothConfig = getToothConfig(this.playerCount);
    const oldPlayers = [...this.players];
    this.players = [];
    this.scores.clear();

    for (let i = 0; i < clamped; i++) {
      const existing = oldPlayers[i];
      const mascot = MASCOT_PLAYERS[i % MASCOT_PLAYERS.length];
      const skinTone = SKIN_TONES[i % SKIN_TONES.length];
      const p = {
        id: `player_${i}`,
        index: i,
        name: existing ? existing.name : mascot.defaultName,
        emoji: mascot.emoji,
        rawName: existing ? existing.rawName : '',
        sleeveColor: mascot.sleeve,
        textColor: mascot.text,
        skinTone: skinTone,
      };
      this.players.push(p);
      this.scores.set(p.id, 0);
    }
    this.emit('playerListChange', this.players);
  }

  updatePlayerName(index, rawName) {
    if (index >= 0 && index < this.players.length) {
      this.players[index].rawName = rawName;
      this.players[index].name = sanitizePlayerName(rawName, index + 1);
      this.emit('playerListChange', this.players);
    }
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex] || this.players[0];
  }

  getPlayerScore(playerId) {
    return this.scores.get(playerId) || 0;
  }

  getLiveBiteOdds() {
    const remaining = this.getRemainingTeethCount();
    return calculateBiteOdds(remaining);
  }

  // --- Round Lifecycle ---
  startNewRound(retainMatch = false) {
    this.roundId++;
    this.resolutionToken++;
    this.loserPlayer = null;
    this.isInputLocked = true;

    if (!retainMatch) {
      this.currentRound = 1;
      for (const p of this.players) {
        this.scores.set(p.id, 0);
      }
    }
    
    // Configure teeth according to fairness rule
    this.toothConfig = getToothConfig(this.playerCount);
    this.teeth.clear();
    for (const toothId of this.toothConfig.toothIds) {
      this.teeth.set(toothId, {
        id: toothId,
        state: 'unresolved',
        outcome: null,
        isLosing: false,
      });
    }

    // Select starting player uniformly at random
    this.startingPlayerIndex = pickStartingPlayer(this.playerCount);
    this.currentPlayerIndex = this.startingPlayerIndex;

    // Select exactly one hidden losing tooth uniformly at random
    this.losingToothId = pickLosingTooth(this.toothConfig.toothIds);
    const losingTooth = this.teeth.get(this.losingToothId);
    if (losingTooth) {
      losingTooth.isLosing = true;
    }

    this.focusedToothId = this.getFirstUnresolvedToothId();

    this.setPhase(PHASES.ROUND_INTRO);
    this.emit('roundReset', {
      roundId: this.roundId,
      currentRound: this.currentRound,
      maxRounds: this.maxRounds,
      playerCount: this.playerCount,
      startingPlayer: this.getCurrentPlayer(),
      toothConfig: this.toothConfig,
      teeth: Array.from(this.teeth.values()),
      odds: this.getLiveBiteOdds(),
    });
  }

  advanceToNextMatchRound() {
    this.currentRound++;
    this.startNewRound(true);
  }

  setPhase(newPhase) {
    const oldPhase = this.phase;
    this.phase = newPhase;
    this.emit('phaseChange', { newPhase, oldPhase });
  }

  beginPlayerTurn() {
    if (this.phase === PHASES.RESULT) return;
    this.setPhase(PHASES.PLAYER_TURN);
    this.isInputLocked = false;
    this.emit('playerTurnChange', {
      player: this.getCurrentPlayer(),
      odds: this.getLiveBiteOdds(),
    });
  }

  // --- Tooth Interaction ---
  pressTooth(toothId) {
    if (this.isInputLocked || this.phase !== PHASES.PLAYER_TURN) {
      return null;
    }

    const tooth = this.teeth.get(toothId);
    if (!tooth || tooth.state !== 'unresolved') {
      return null;
    }

    this.isInputLocked = true;
    const currentToken = this.resolutionToken;
    const player = this.getCurrentPlayer();

    if (tooth.isLosing) {
      // LOSING TOOTH
      this.loserPlayer = player;
      this.setPhase(PHASES.RESOLVING_LOSS);

      // Award points to all surviving players
      for (const p of this.players) {
        if (p.id !== player.id) {
          const s = this.scores.get(p.id) || 0;
          this.scores.set(p.id, s + 1);
        }
      }
      
      const payload = {
        token: currentToken,
        toothId,
        player,
        isLosing: true,
        odds: this.getLiveBiteOdds(),
      };
      this.emit('toothPressed', payload);
      return payload;
    } else {
      // SAFE TOOTH
      const outcome = pickSafeOutcome();
      const tears = shouldCryTears();
      tooth.outcome = outcome;

      if (outcome === SAFE_ACTIONS.BREAK_TILT) {
        tooth.state = 'broken';
      } else if (outcome === SAFE_ACTIONS.SINK) {
        tooth.state = 'sunken';
      } else {
        tooth.state = 'fallen';
      }

      this.setPhase(PHASES.RESOLVING_SAFE);
      const payload = {
        token: currentToken,
        toothId,
        player,
        isLosing: false,
        outcome,
        criedTears: tears,
        odds: this.getLiveBiteOdds(),
      };
      this.emit('toothPressed', payload);
      return payload;
    }
  }

  completeSafeResolution(token) {
    if (token !== this.resolutionToken || this.phase !== PHASES.RESOLVING_SAFE) {
      return;
    }

    this.setPhase(PHASES.TURN_TRANSITION);
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerCount;
    this.focusedToothId = this.getNextUnresolvedToothId(this.focusedToothId);
    this.emit('turnTransition', {
      nextPlayer: this.getCurrentPlayer(),
      odds: this.getLiveBiteOdds(),
    });
  }

  completeLosingResolution(token) {
    if (token !== this.resolutionToken || this.phase !== PHASES.RESOLVING_LOSS) {
      return;
    }
    this.setPhase(PHASES.RESULT);

    const isMatchComplete = this.currentRound >= this.maxRounds;
    let matchWinner = null;
    if (isMatchComplete) {
      let maxScore = -1;
      for (const p of this.players) {
        const sc = this.scores.get(p.id) || 0;
        if (sc > maxScore) {
          maxScore = sc;
          matchWinner = p;
        }
      }
    }

    this.emit('gameResult', {
      loser: this.loserPlayer,
      currentRound: this.currentRound,
      maxRounds: this.maxRounds,
      isMatchComplete,
      matchWinner,
      scores: Array.from(this.scores.entries()).map(([pId, sc]) => ({
        player: this.players.find(p => p.id === pId),
        score: sc,
      })),
    });
  }

  // --- Reset & Confirmation ---
  requestRestart() {
    if (this.phase === PHASES.SETUP || this.phase === PHASES.RESULT) {
      this.startNewRound(false);
      return;
    }
    this.previousPhase = this.phase;
    this.isInputLocked = true;
    this.setPhase(PHASES.RESET_CONFIRMATION);
  }

  confirmRestart() {
    this.startNewRound(false);
  }

  cancelRestart() {
    if (this.phase === PHASES.RESET_CONFIRMATION) {
      this.setPhase(this.previousPhase || PHASES.PLAYER_TURN);
      if (this.phase === PHASES.PLAYER_TURN) {
        this.isInputLocked = false;
      }
    }
  }

  returnToSetup() {
    this.resolutionToken++;
    this.isInputLocked = true;
    this.setPhase(PHASES.SETUP);
  }

  // --- Focus & Odds Helpers ---
  getRemainingTeethCount() {
    let count = 0;
    for (const tooth of this.teeth.values()) {
      if (tooth.state === 'unresolved') count++;
    }
    return count;
  }

  getFirstUnresolvedToothId() {
    for (const [id, tooth] of this.teeth) {
      if (tooth.state === 'unresolved') return id;
    }
    return null;
  }

  getNextUnresolvedToothId(currentId, direction = 1) {
    const ids = this.toothConfig.toothIds;
    if (ids.length === 0) return null;
    let currIdx = ids.indexOf(currentId);
    if (currIdx === -1) currIdx = 0;

    for (let i = 1; i <= ids.length; i++) {
      const testIdx = (currIdx + i * direction + ids.length * 10) % ids.length;
      const tooth = this.teeth.get(ids[testIdx]);
      if (tooth && tooth.state === 'unresolved') {
        return ids[testIdx];
      }
    }
    return null;
  }

  setFocusedToothId(toothId) {
    if (this.teeth.has(toothId) && this.teeth.get(toothId).state === 'unresolved') {
      this.focusedToothId = toothId;
      this.emit('keyboardFocusChange', toothId);
    }
  }
}

/**
 * WEB AUDIO. Every sound is synthesised from oscillators and noise buffers — no audio files ship
 * with this route. Also owns the haptic pulses, which reduced motion suppresses.
 */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.ambienceGain = null;
    this.isMuted = false;
    this.ambienceOscillators = [];
    this.ambienceInterval = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(0.10, this.ctx.currentTime);
      this.ambienceGain.connect(this.masterGain);

      this.initialized = true;
      this.startAmbience();
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  ensureContext() {
    if (!this.initialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (!this.masterGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1.0, now, 0.05);
  }

  // Shared-mute accessor pair: a view onto the imported isMuted/setMuted, the same pair every
  // other play route's synth reads and writes. Every gate below reads `this.enabled` live rather
  // than a cached field, so a mute flipped from another route's control is observed here too. No
  // new storage key, and no change to setAudioEnabled on GameState -- that stays the separate
  // route glue it always was.
  get enabled() {
    return !isMuted();
  }

  set enabled(value) {
    setMuted(!value);
  }

  pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended' && this.enabled) {
      this.ctx.resume().catch(() => {});
    }
  }

  // --- Haptics Helper ---
  triggerHaptic(pattern = 50, reducedMotion = false) {
    if (reducedMotion || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {}
  }

  // --- UI Sounds ---
  playClick() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.05);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playHover() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(950, now + 0.035);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** Heartbeat Tension Sound when odds are high */
  playHeartbeat(percent = 20) {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const vol = Math.min(0.6, 0.2 + (percent / 100) * 0.4);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.14);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // --- Gameplay Sound Effects ---

  /** Soft press sound on tooth */
  playToothPress() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Musical sparkling safe chimes */
  playSafeChime() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = now + idx * 0.04;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.16, st);
      gain.gain.exponentialRampToValueAtTime(0.0001, st + 0.32);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(st);
      osc.stop(st + 0.35);
    });
  }

  /** Safe outcome 1: Crack & tilt */
  playCrackTilt() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    this.playSafeChime();
    const now = this.ctx.currentTime;

    // Wood/plastic crack snap
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(600, now);
    osc1.frequency.exponentialRampToValueAtTime(150, now + 0.12);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(450, now);
    osc2.frequency.exponentialRampToValueAtTime(100, now + 0.15);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.18);
    osc2.stop(now + 0.18);
  }

  /** Safe outcome 2: Tooth sink */
  playSink() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    this.playSafeChime();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  /** Safe outcome 3: Wobble and fall into water */
  playWobbleFall() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    this.playSafeChime();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    lfo.frequency.setValueAtTime(18, now);
    lfoGain.gain.setValueAtTime(40, now);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.32);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    lfo.start(now);
    osc.start(now);
    lfo.stop(now + 0.38);
    osc.stop(now + 0.38);

    // Subtle water plop
    setTimeout(() => {
      if (!this.enabled || !this.ctx) return;
      const plopNow = this.ctx.currentTime;
      const plopOsc = this.ctx.createOscillator();
      const plopGain = this.ctx.createGain();
      plopOsc.type = 'sine';
      plopOsc.frequency.setValueAtTime(280, plopNow);
      plopOsc.frequency.exponentialRampToValueAtTime(550, plopNow + 0.08);
      plopGain.gain.setValueAtTime(0.35, plopNow);
      plopGain.gain.exponentialRampToValueAtTime(0.001, plopNow + 0.12);
      plopOsc.connect(plopGain);
      plopGain.connect(this.sfxGain);
      plopOsc.start(plopNow);
      plopOsc.stop(plopNow + 0.14);
    }, 280);
  }

  /** Crocodile comic tears cry */
  playTears() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.15);
    osc.frequency.linearRampToValueAtTime(620, now + 0.35);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** Dramatic losing jaw snap & impact */
  playSnapBite() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    // High snap click
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'sawtooth';
    snapOsc.frequency.setValueAtTime(900, now);
    snapOsc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    snapGain.gain.setValueAtTime(0.7, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    snapOsc.connect(snapGain);
    snapGain.connect(this.sfxGain);
    snapOsc.start(now);
    snapOsc.stop(now + 0.1);

    // Deep bass jaw thump
    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(160, now);
    bassOsc.frequency.exponentialRampToValueAtTime(35, now + 0.28);
    bassGain.gain.setValueAtTime(0.8, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    bassOsc.connect(bassGain);
    bassGain.connect(this.sfxGain);
    bassOsc.start(now);
    bassOsc.stop(now + 0.32);
  }

  /** Crocodile cheerful victory chuckle */
  playHappyChuckle() {
    if (!this.enabled || !this.initialized) return;
    this.ensureContext();
    const notes = [440, 554, 659, 880, 1100];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.1);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.14);
      }, i * 80);
    });
  }

  /** Subtle procedural swamp background ambience */
  startAmbience() {
    if (!this.ctx || !this.ambienceGain) return;
    // Any cricket timer a previous start left behind goes first: the handle is a single field, so a
    // second start would overwrite it and leave the first interval firing forever with nothing
    // holding its id. Nothing about when the ambience starts, or what it sounds like, changes.
    this.stopAmbience();
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.05;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, this.ctx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(this.ambienceGain);
      whiteNoise.start();

      // Occasional swamp cricket blip
      this.ambienceInterval = setInterval(() => {
        if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
        if (Math.random() < 0.4) {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1400 + Math.random() * 400, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
          osc.connect(gain);
          gain.connect(this.ambienceGain);
          osc.start(now);
          osc.stop(now + 0.1);
        }
      }, 3500);
    } catch (e) {
      console.warn('Could not start ambient audio:', e);
    }
  }

  /** The pair to startAmbience, and the only way the cricket timer is ever cleared. The handle is
   *  nulled as well as cleared, so a clear followed by a restart cannot double-register and a second
   *  clear is a no-op.
   *
   *  ponytail: the timer is deliberately NOT cleared by pause(). The graph stays alive across a tab
   *  switch so resume() is seamless, and the interval body already returns without building anything
   *  while the context is suspended. Upgrade path if the ambience ever has to be torn down and rebuilt
   *  rather than suspended: track the noise source here too and stop it, or the restart stacks a
   *  second one under the first. */
  stopAmbience() {
    if (this.ambienceInterval === null) return;
    clearInterval(this.ambienceInterval);
    this.ambienceInterval = null;
  }
}

const audio = new AudioManager();

// ADR-0051's second obligation: a canvas is invisible to assistive technology, so the element that
// draws the board carries role="img" and a label. One declaration, two readers — the canvas in
// createRenderer and the container region the keyboard listeners label — so the two can never drift
// apart. The text is the label this route already shipped on that region and is not re-authored here.
// The round's own state is announced separately, in the live region outside the canvas.
const BOARD_ARIA_LABEL = 'กระดานเกมฟันจระเข้ ใช้ปุ่มลูกศรเพื่อเลือกฟัน และกด Space หรือ Enter เพื่อกดฟัน';

/**
 * THREE.JS SCENE. Camera framing, lighting, the swamp environment, and camera shake.
 *
 * createRenderer requests the context and returns null when there is none, which makes the
 * constructor throw. That throw is the no-3D path: the boot code below catches it and shows the
 * notice instead of leaving the play surface blank.
 */
class GameScene {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Check WebGL Support
    this.renderer = this.createRenderer();
    if (!this.renderer) {
      throw new Error('WEBGL_NOT_SUPPORTED');
    }

    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdff9fb); // Soft pastel swamp sky

    // Camera: Fixed close-up 3/4 view slightly above mouth
    this.baseCameraPos = new THREE.Vector3(0, 2.4, 3.4);
    this.cameraLookAt = new THREE.Vector3(0, 0.35, 0.1);
    this.camera = new THREE.PerspectiveCamera(42, this.width / this.height, 0.1, 50);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.cameraLookAt);

    // Camera Shake
    this.shakeTimer = 0;
    this.shakeDuration = 0;
    this.shakeIntensity = 0;

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.setupLighting();
    this.setupEnvironment();
    this.updateCameraFraming();
  }

  createRenderer() {
    try {
      const canvas = document.createElement('canvas');
      // Set on the element as it is created, not after the renderer is built: the request below can
      // return null and the notice path takes over, and an unlabelled canvas must never be able to
      // reach the page at all.
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', BOARD_ARIA_LABEL);
      // The attributes ride the CONTEXT REQUEST, and that context is then handed to the renderer.
      // Handed a live context, the renderer skips its own getContext entirely, so the options it is
      // given never reach one — and a getContext of our own on a canvas that already holds a context
      // ignores whatever attributes it is passed. Either way round, only the FIRST request applies
      // them. One request, made once, is the shape where they take effect. Every other attribute is
      // left off deliberately: their defaults are the same values the renderer would have asked for.
      // No WebGL1 second attempt either. three.js dropped WebGL1 and throws on a WebGL1 context, so a
      // canvas locked to one could only ever reach the notice by way of that throw.
      const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
      if (!gl) return null;

      const renderer = new THREE.WebGLRenderer({ canvas, context: gl });

      renderer.setSize(this.width, this.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // DPR cap at 2
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      return renderer;
    } catch (e) {
      console.error('WebGL initialization error:', e);
      return null;
    }
  }

  setupLighting() {
    // 1. Soft Sky Ambient Light
    const hemiLight = new THREE.HemisphereLight(0xdff9fb, 0x16a085, 0.85);
    hemiLight.position.set(0, 10, 0);
    this.scene.add(hemiLight);

    // 2. Main Key Directional Light (Sunlight)
    const keyLight = new THREE.DirectionalLight(0xfffae6, 1.25);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.001;
    this.scene.add(keyLight);

    // 3. Fill Light (Soft Teal bounce from swamp)
    const fillLight = new THREE.DirectionalLight(0x7bed9f, 0.45);
    fillLight.position.set(-4, 3, 2);
    this.scene.add(fillLight);

    // 4. Back / Rim Light for tooth rim highlight
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.55);
    rimLight.position.set(0, 4, -4);
    this.scene.add(rimLight);
  }

  setupEnvironment() {
    // Compact Stylized Swamp Water Bed
    const waterGeo = new THREE.CylinderGeometry(3.6, 3.6, 0.2, 32);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1abc9c, // Turquoise swamp water
      roughness: 0.18,
      metalness: 0.2,
      transparent: true,
      opacity: 0.92,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(0, -0.38, 0);
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    // Two neat lily pads near paws
    const lilyPadGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.03, 16);
    const lilyPadMat = new THREE.MeshStandardMaterial({
      color: 0x27ae60,
      roughness: 0.6,
    });

    const pad1 = new THREE.Mesh(lilyPadGeo, lilyPadMat);
    pad1.position.set(-2.0, -0.26, 0.6);
    pad1.rotation.y = 0.4;
    this.scene.add(pad1);

    const pad2 = new THREE.Mesh(lilyPadGeo, lilyPadMat);
    pad2.scale.set(0.75, 1.0, 0.75);
    pad2.position.set(1.9, -0.26, 0.9);
    pad2.rotation.y = -0.8;
    this.scene.add(pad2);
  }

  /**
   * Adjust camera framing for portrait vs landscape responsive layouts
   */
  updateCameraFraming() {
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;

    if (aspect < 0.8) {
      // Portrait Mobile: Crocodile fills the viewport
      this.baseCameraPos.set(0, 3.8, 5.0);
      this.cameraLookAt.set(0, 0.38, 0.0);
      this.camera.fov = 46;
    } else if (aspect < 1.2) {
      // Tablet
      this.baseCameraPos.set(0, 3.3, 4.5);
      this.cameraLookAt.set(0, 0.35, 0.0);
      this.camera.fov = 42;
    } else {
      // Landscape Mobile / Desktop
      this.baseCameraPos.set(0, 2.9, 4.1);
      this.cameraLookAt.set(0, 0.32, 0.0);
      this.camera.fov = 38;
    }

    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.cameraLookAt);
    this.camera.updateProjectionMatrix();
  }

  onResize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    if (this.renderer) {
      this.renderer.setSize(this.width, this.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }
    this.updateCameraFraming();
  }

  triggerCameraShake(duration = 0.16, intensity = 0.12, reducedMotion = false) {
    if (reducedMotion) return;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
    this.shakeIntensity = intensity;
  }

  raycastTeeth(clientX, clientY, hitMeshes) {
    const rect = this.container.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(hitMeshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      let obj = hit.object;
      while (obj && !obj.userData?.toothId) {
        obj = obj.parent;
      }
      if (obj && obj.userData?.toothId) {
        return obj.userData.toothId;
      }
    }
    return null;
  }

  getNormalizedPointer(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: ((clientY - rect.top) / rect.height) * 2 - 1,
    };
  }

  update(delta) {
    const dt = Math.min(delta, 0.1);

    // Camera Shake Update
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const progress = this.shakeTimer / this.shakeDuration;
      const currentIntensity = this.shakeIntensity * progress;
      
      const shakeOffsetX = (Math.random() - 0.5) * 2 * currentIntensity;
      const shakeOffsetY = (Math.random() - 0.5) * 2 * currentIntensity;
      const shakeOffsetZ = (Math.random() - 0.5) * currentIntensity;

      this.camera.position.set(
        this.baseCameraPos.x + shakeOffsetX,
        this.baseCameraPos.y + shakeOffsetY,
        this.baseCameraPos.z + shakeOffsetZ
      );
    } else {
      this.camera.position.copy(this.baseCameraPos);
    }
    this.camera.lookAt(this.cameraLookAt);

    // Gentle water ripple rotation
    if (this.waterMesh) {
      this.waterMesh.rotation.y += dt * 0.02;
    }
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

/**
 * THE CROCODILE. Head, jaws, eyes and the per-round tooth set, plus the resolution animations for a
 * safe tooth and for the bite, and the particle bursts.
 */
class Crocodile {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'CrocodileRoot';
    this.root.scale.set(1.15, 1.15, 1.15);

    // Materials
    this.materials = this.createMaterials();

    // Groups
    this.baseGroup = new THREE.Group();
    this.upperJawPivot = new THREE.Group();
    this.upperJawPivot.position.set(0, 0.22, -0.95);

    this.root.add(this.baseGroup);
    this.root.add(this.upperJawPivot);

    // Teeth Tracking
    this.teethMap = new Map();
    this.activeTeethCount = 16;

    // Eyes
    this.leftEyeGroup = null;
    this.rightEyeGroup = null;
    this.leftPupil = null;
    this.rightPupil = null;
    this.leftEyelid = null;
    this.rightEyelid = null;
    this.lookTarget = new THREE.Vector2(0, 0);

    // Jaw Angles
    this.JAW_OPEN_ANGLE = -Math.PI * 0.22; // ~40 degrees open
    this.JAW_CLOSED_ANGLE = -Math.PI * 0.02; // Snap closed
    this.JAW_HAPPY_ANGLE = -Math.PI * 0.16;

    this.currentJawAngle = this.JAW_OPEN_ANGLE;
    this.targetJawAngle = this.JAW_OPEN_ANGLE;

    // FX
    this.tears = [];
    this.tearPool = new THREE.Group();
    this.root.add(this.tearPool);

    this.impactGroup = new THREE.Group();
    this.impactGroup.visible = false;
    this.root.add(this.impactGroup);

    // Idle timers
    this.blinkTimer = 2.0;
    this.blinkProgress = 0;
    this.isBlinking = false;
    this.idleTime = 0;
    this.isHappy = false;

    this.buildBody();
    this.buildUpperJaw();
    this.buildImpactEffects();
    this.buildTearPool();

    this.scene.add(this.root);
  }

  createMaterials() {
    return {
      crocSkin: new THREE.MeshStandardMaterial({
        color: 0x27ae60, // Saturated playful green
        roughness: 0.38,
        metalness: 0.05,
      }),
      crocLight: new THREE.MeshStandardMaterial({
        color: 0x2ecc71, // Lighter snout ridge
        roughness: 0.35,
        metalness: 0.05,
      }),
      mouthThroat: new THREE.MeshStandardMaterial({
        color: 0x8b2626, // Deep recessed mouth throat
        roughness: 0.5,
        metalness: 0.0,
      }),
      gumsRed: new THREE.MeshStandardMaterial({
        color: 0xd63031, // Compact neat red gum band
        roughness: 0.28,
        metalness: 0.05,
      }),
      tongueRed: new THREE.MeshStandardMaterial({
        color: 0xc0392b,
        roughness: 0.35,
        metalness: 0.05,
      }),
      tooth: new THREE.MeshStandardMaterial({
        color: 0xffffff, // Glossy white toy teeth
        roughness: 0.12,
        metalness: 0.05,
      }),
      toothCracked: new THREE.MeshStandardMaterial({
        color: 0xdfe4ea,
        roughness: 0.5,
        metalness: 0.0,
      }),
      sclera: new THREE.MeshStandardMaterial({
        color: 0xfef9e7, // Yellowish toy sclera
        roughness: 0.15,
        metalness: 0.0,
      }),
      pupil: new THREE.MeshStandardMaterial({
        color: 0x111111, // Glossy dark pupil
        roughness: 0.1,
        metalness: 0.2,
      }),
      pupilHighlight: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
      nostril: new THREE.MeshStandardMaterial({
        color: 0x145a32,
        roughness: 0.6,
      }),
      focusRing: new THREE.MeshBasicMaterial({
        color: 0xf1c40f,
        wireframe: false,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
      tear: new THREE.MeshStandardMaterial({
        color: 0x00d2d3,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.88,
      }),
      impactStar: new THREE.MeshBasicMaterial({
        color: 0xffa502,
        side: THREE.DoubleSide,
      }),
      impactPop: new THREE.MeshBasicMaterial({
        color: 0xff4757,
        side: THREE.DoubleSide,
      }),
    };
  }

  buildBody() {
    // 1. Green Lower Jaw Outer Shell
    const chinGeo = new THREE.CylinderGeometry(1.42, 1.3, 0.52, 32);
    chinGeo.scale(1.0, 1.0, 1.35);
    const chinMesh = new THREE.Mesh(chinGeo, this.materials.crocSkin);
    chinMesh.position.set(0, -0.06, -0.2);
    chinMesh.castShadow = true;
    chinMesh.receiveShadow = true;
    this.baseGroup.add(chinMesh);

    // Front rounded chin bottom
    const frontChinGeo = new THREE.SphereGeometry(1.22, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    frontChinGeo.scale(1.0, 0.35, 1.3);
    const frontChin = new THREE.Mesh(frontChinGeo, this.materials.crocSkin);
    frontChin.position.set(0, -0.15, -0.2);
    this.baseGroup.add(frontChin);

    // 2. Compact Red Inner Mouth Floor (Clean, solid, symmetric)
    const mouthFloorGeo = new THREE.CylinderGeometry(1.32, 1.28, 0.2, 32);
    mouthFloorGeo.scale(0.96, 1.0, 1.3);
    const mouthFloor = new THREE.Mesh(mouthFloorGeo, this.materials.mouthThroat);
    mouthFloor.position.set(0, 0.18, -0.15);
    mouthFloor.receiveShadow = true;
    this.baseGroup.add(mouthFloor);

    // Small neat tongue
    const tongueGeo = new THREE.SphereGeometry(0.48, 18, 12);
    tongueGeo.scale(1.0, 0.2, 1.1);
    const tongue = new THREE.Mesh(tongueGeo, this.materials.tongueRed);
    tongue.position.set(0, 0.24, -0.25);
    this.baseGroup.add(tongue);

    // 3. Cute Cartoon Paws
    const pawGeo = new THREE.SphereGeometry(0.48, 16, 12);
    pawGeo.scale(1.3, 0.45, 1.1);

    const leftPaw = new THREE.Mesh(pawGeo, this.materials.crocSkin);
    leftPaw.position.set(-1.58, -0.12, 0.2);
    leftPaw.rotation.y = 0.35;
    this.baseGroup.add(leftPaw);

    const rightPaw = new THREE.Mesh(pawGeo, this.materials.crocSkin);
    rightPaw.position.set(1.58, -0.12, 0.2);
    rightPaw.rotation.y = -0.35;
    this.baseGroup.add(rightPaw);

    // Side Hinge caps
    const hingeGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 20);
    hingeGeo.rotateZ(Math.PI / 2);

    const leftHinge = new THREE.Mesh(hingeGeo, this.materials.crocLight);
    leftHinge.position.set(-1.4, 0.22, -0.95);
    this.baseGroup.add(leftHinge);

    const rightHinge = new THREE.Mesh(hingeGeo, this.materials.crocLight);
    rightHinge.position.set(1.4, 0.22, -0.95);
    this.baseGroup.add(rightHinge);
  }

  buildUpperJaw() {
    this.upperJaw = new THREE.Group();
    this.upperJaw.position.set(0, 0, 0.95);
    this.upperJawPivot.add(this.upperJaw);

    // 1. Upper Snout Main Shell
    const snoutGeo = new THREE.CylinderGeometry(1.36, 1.38, 0.42, 32);
    snoutGeo.scale(0.96, 1.0, 1.38);
    const snoutMesh = new THREE.Mesh(snoutGeo, this.materials.crocSkin);
    snoutMesh.position.set(0, 0.16, -0.15);
    snoutMesh.castShadow = true;
    this.upperJaw.add(snoutMesh);

    // Top Dome of Snout
    const domeGeo = new THREE.SphereGeometry(1.34, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    domeGeo.scale(0.94, 0.52, 1.35);
    const domeMesh = new THREE.Mesh(domeGeo, this.materials.crocLight);
    domeMesh.position.set(0, 0.32, -0.15);
    this.upperJaw.add(domeMesh);

    // Nostrils on front tip
    const nostrilGeo = new THREE.SphereGeometry(0.18, 14, 10);
    nostrilGeo.scale(1.1, 0.75, 1.2);

    const leftNostril = new THREE.Mesh(nostrilGeo, this.materials.crocSkin);
    leftNostril.position.set(-0.36, 0.48, 0.95);
    this.upperJaw.add(leftNostril);

    const rightNostril = new THREE.Mesh(nostrilGeo, this.materials.crocSkin);
    rightNostril.position.set(0.36, 0.48, 0.95);
    this.upperJaw.add(rightNostril);

    const holeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const leftHole = new THREE.Mesh(holeGeo, this.materials.nostril);
    leftHole.position.set(-0.36, 0.54, 1.05);
    this.upperJaw.add(leftHole);

    const rightHole = new THREE.Mesh(holeGeo, this.materials.nostril);
    rightHole.position.set(0.36, 0.54, 1.05);
    this.upperJaw.add(rightHole);

    // Upper Mouth Cavity Roof (Clean, solid, symmetric)
    const roofGeo = new THREE.CylinderGeometry(1.26, 1.28, 0.16, 32);
    roofGeo.scale(0.94, 1.0, 1.26);
    const roofMesh = new THREE.Mesh(roofGeo, this.materials.mouthThroat);
    roofMesh.position.set(0, 0.0, -0.15);
    this.upperJaw.add(roofMesh);

    // 2. Eyes prominently on forehead looking forward
    this.buildEyes();
  }

  buildEyes() {
    const eyeMountGeo = new THREE.SphereGeometry(0.5, 20, 16);
    const scleraGeo = new THREE.SphereGeometry(0.42, 20, 16);
    const pupilGeo = new THREE.SphereGeometry(0.23, 16, 12);
    pupilGeo.scale(1.0, 1.25, 0.35);

    const highlightGeo = new THREE.SphereGeometry(0.07, 10, 8);

    // Left Eye Mount
    this.leftEyeGroup = new THREE.Group();
    this.leftEyeGroup.position.set(-0.55, 0.62, 0.42);
    this.leftEyeGroup.rotation.x = Math.PI * 0.14;
    this.upperJaw.add(this.leftEyeGroup);

    const leftMount = new THREE.Mesh(eyeMountGeo, this.materials.crocSkin);
    this.leftEyeGroup.add(leftMount);

    const leftSclera = new THREE.Mesh(scleraGeo, this.materials.sclera);
    leftSclera.position.set(0, 0.05, 0.18);
    this.leftEyeGroup.add(leftSclera);

    this.leftPupil = new THREE.Mesh(pupilGeo, this.materials.pupil);
    this.leftPupil.position.set(0, 0.05, 0.54);
    this.leftEyeGroup.add(this.leftPupil);

    const leftHighlight = new THREE.Mesh(highlightGeo, this.materials.pupilHighlight);
    leftHighlight.position.set(-0.06, 0.12, 0.62);
    this.leftEyeGroup.add(leftHighlight);

    // Left Eyelid
    const lidGeo = new THREE.SphereGeometry(0.45, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
    this.leftEyelid = new THREE.Mesh(lidGeo, this.materials.crocSkin);
    this.leftEyelid.position.set(0, 0.08, 0.18);
    this.leftEyelid.rotation.x = -Math.PI * 0.5;
    this.leftEyeGroup.add(this.leftEyelid);

    // Right Eye Mount
    this.rightEyeGroup = new THREE.Group();
    this.rightEyeGroup.position.set(0.55, 0.62, 0.42);
    this.rightEyeGroup.rotation.x = Math.PI * 0.14;
    this.upperJaw.add(this.rightEyeGroup);

    const rightMount = new THREE.Mesh(eyeMountGeo, this.materials.crocSkin);
    this.rightEyeGroup.add(rightMount);

    const rightSclera = new THREE.Mesh(scleraGeo, this.materials.sclera);
    rightSclera.position.set(0, 0.05, 0.18);
    this.rightEyeGroup.add(rightSclera);

    this.rightPupil = new THREE.Mesh(pupilGeo, this.materials.pupil);
    this.rightPupil.position.set(0, 0.05, 0.54);
    this.rightEyeGroup.add(this.rightPupil);

    const rightHighlight = new THREE.Mesh(highlightGeo, this.materials.pupilHighlight);
    rightHighlight.position.set(0.06, 0.12, 0.62);
    this.rightEyeGroup.add(rightHighlight);

    this.rightEyelid = new THREE.Mesh(lidGeo, this.materials.crocSkin);
    this.rightEyelid.position.set(0, 0.08, 0.18);
    this.rightEyelid.rotation.x = -Math.PI * 0.5;
    this.rightEyeGroup.add(this.rightEyelid);
  }

  createToothGeometry(radius, length) {
    return new THREE.CapsuleGeometry(radius, length, 12, 20);
  }

  setupTeeth(toothConfig) {
    for (const t of this.teethMap.values()) {
      if (t.group.parent) {
        t.group.parent.remove(t.group);
      }
    }
    this.teethMap.clear();

    const { upperCount, lowerCount } = toothConfig;
    this.activeTeethCount = upperCount + lowerCount;

    // Slimmer, denser teeth
    const toothFrontGeo = this.createToothGeometry(0.098, 0.20);
    const toothCanineGeo = this.createToothGeometry(0.11, 0.22);
    const focusRingGeo = new THREE.RingGeometry(0.16, 0.23, 20);
    focusRingGeo.rotateX(-Math.PI / 2);

    // --- 1. Lower Teeth Arc ---
    const lowerRadiusX = 0.98;
    const lowerRadiusZ = 1.18;
    const lowerZCenter = -0.15;
    const lowerY = 0.36;

    for (let i = 0; i < lowerCount; i++) {
      const id = `lower_${i}`;
      const t = lowerCount === 1 ? 0 : -1 + (2 * i) / (lowerCount - 1);
      const angle = t * Math.PI * 0.38;

      const posX = Math.sin(angle) * lowerRadiusX;
      const posZ = Math.cos(angle) * lowerRadiusZ + lowerZCenter;

      const isCanine = i === 0 || i === lowerCount - 1;
      const geo = isCanine ? toothCanineGeo : toothFrontGeo;

      const toothGroup = new THREE.Group();
      toothGroup.position.set(posX, lowerY, posZ);

      const toothMesh = new THREE.Mesh(geo, this.materials.tooth);
      toothMesh.castShadow = true;
      toothMesh.receiveShadow = true;
      toothGroup.add(toothMesh);

      // Focus Ring
      const focusRing = new THREE.Mesh(focusRingGeo, this.materials.focusRing);
      focusRing.position.set(0, -0.12, 0);
      focusRing.visible = false;
      toothGroup.add(focusRing);

      // Invisible Hitbox
      const hitGeo = new THREE.SphereGeometry(0.26, 10, 8);
      const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hitMesh.position.set(0, 0.04, 0);
      hitMesh.userData = { toothId: id };
      toothGroup.add(hitMesh);

      this.baseGroup.add(toothGroup);

      this.teethMap.set(id, {
        id,
        jaw: 'lower',
        group: toothGroup,
        mesh: toothMesh,
        hitbox: hitMesh,
        focusRing: focusRing,
        basePos: toothGroup.position.clone(),
        baseRot: toothGroup.rotation.clone(),
        animState: 'idle',
        animProgress: 0,
        outcome: null,
      });
    }

    // --- 2. Upper Teeth Arc ---
    const upperRadiusX = 0.94;
    const upperRadiusZ = 1.15;
    const upperZCenter = -0.16;
    const upperY = -0.14;

    for (let i = 0; i < upperCount; i++) {
      const id = `upper_${i}`;
      const t = upperCount === 1 ? 0 : -1 + (2 * i) / (upperCount - 1);
      const angle = t * Math.PI * 0.37;

      const posX = Math.sin(angle) * upperRadiusX;
      const posZ = Math.cos(angle) * upperRadiusZ + upperZCenter;

      const isCanine = i === 0 || i === upperCount - 1;
      const geo = isCanine ? toothCanineGeo : toothFrontGeo;

      const toothGroup = new THREE.Group();
      toothGroup.position.set(posX, upperY, posZ);
      toothGroup.rotation.x = Math.PI; // point down

      const toothMesh = new THREE.Mesh(geo, this.materials.tooth);
      toothMesh.castShadow = true;
      toothGroup.add(toothMesh);

      const focusRing = new THREE.Mesh(focusRingGeo, this.materials.focusRing);
      focusRing.position.set(0, -0.12, 0);
      focusRing.visible = false;
      toothGroup.add(focusRing);

      const hitGeo = new THREE.SphereGeometry(0.26, 10, 8);
      const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hitMesh.position.set(0, 0.04, 0);
      hitMesh.userData = { toothId: id };
      toothGroup.add(hitMesh);

      this.upperJaw.add(toothGroup);

      this.teethMap.set(id, {
        id,
        jaw: 'upper',
        group: toothGroup,
        mesh: toothMesh,
        hitbox: hitMesh,
        focusRing: focusRing,
        basePos: toothGroup.position.clone(),
        baseRot: toothGroup.rotation.clone(),
        animState: 'idle',
        animProgress: 0,
        outcome: null,
      });
    }

    this.setJawAngle(this.JAW_OPEN_ANGLE, true);
  }

  buildTearPool() {
    const tearGeo = new THREE.SphereGeometry(0.09, 10, 8);
    tearGeo.scale(0.8, 1.4, 0.8);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(tearGeo, this.materials.tear);
      mesh.visible = false;
      this.tearPool.add(mesh);
      this.tears.push({
        mesh,
        active: false,
        velocity: new THREE.Vector3(),
        lifetime: 0,
        maxLife: 1.0,
      });
    }
  }

  buildImpactEffects() {
    const starShape = new THREE.Shape();
    const points = 10;
    const outerRadius = 1.0;
    const innerRadius = 0.45;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = (i / (points * 2)) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();

    const starGeo = new THREE.ShapeGeometry(starShape);
    this.impactStarMesh = new THREE.Mesh(starGeo, this.materials.impactStar);
    this.impactStarMesh.position.set(0, 0.5, 0.35);
    this.impactStarMesh.rotation.x = -Math.PI * 0.25;
    this.impactGroup.add(this.impactStarMesh);

    const popShape = new THREE.Shape();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 0.65 : 0.28;
      const a = (i / 16) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) popShape.moveTo(x, y);
      else popShape.lineTo(x, y);
    }
    popShape.closePath();
    const popGeo = new THREE.ShapeGeometry(popShape);
    this.impactPopMesh = new THREE.Mesh(popGeo, this.materials.impactPop);
    this.impactPopMesh.position.set(0, 0.52, 0.37);
    this.impactPopMesh.rotation.x = -Math.PI * 0.25;
    this.impactGroup.add(this.impactPopMesh);
  }

  triggerImpactBurst() {
    this.impactGroup.visible = true;
    this.impactBurstTime = 0.38;
    this.impactStarMesh.scale.set(0.1, 0.1, 0.1);
    this.impactPopMesh.scale.set(0.1, 0.1, 0.1);
  }

  triggerComicTears() {
    const leftEyePos = new THREE.Vector3(-0.55, 0.85, 0.5);
    const rightEyePos = new THREE.Vector3(0.55, 0.85, 0.5);

    for (let i = 0; i < 12; i++) {
      const tear = this.tears.find((t) => !t.active);
      if (!tear) break;
      tear.active = true;
      tear.mesh.visible = true;
      tear.lifetime = 0;
      tear.maxLife = 0.9 + Math.random() * 0.3;

      const isLeft = i % 2 === 0;
      const origin = isLeft ? leftEyePos : rightEyePos;
      tear.mesh.position.copy(origin).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.2
      ));

      const spreadX = isLeft ? -0.9 - Math.random() * 0.8 : 0.9 + Math.random() * 0.8;
      tear.velocity.set(
        spreadX,
        1.6 + Math.random() * 1.5,
        0.6 + Math.random() * 0.8
      );
    }
  }

  setFocusedTooth(toothId) {
    for (const [id, t] of this.teethMap) {
      t.focusRing.visible = (id === toothId);
    }
  }

  getWorldPositionOfTooth(toothId) {
    const tooth = this.teethMap.get(toothId);
    if (!tooth) return null;
    const worldPos = new THREE.Vector3();
    tooth.mesh.getWorldPosition(worldPos);
    return worldPos;
  }

  getHitMeshes() {
    const meshes = [];
    for (const t of this.teethMap.values()) {
      if (t.animState === 'idle') {
        meshes.push(t.hitbox);
      }
    }
    return meshes;
  }

  setJawAngle(angle, immediate = false) {
    this.targetJawAngle = angle;
    if (immediate) {
      this.currentJawAngle = angle;
      this.upperJawPivot.rotation.x = angle;
    }
  }

  resolveToothSafe(toothId, outcome, reducedMotion = false) {
    const tooth = this.teethMap.get(toothId);
    if (!tooth) return;
    tooth.animState = 'resolving';
    tooth.outcome = outcome;
    tooth.animProgress = 0;
    tooth.focusRing.visible = false;

    if (reducedMotion) {
      this.applyImmediateSafeState(tooth, outcome);
    }
  }

  applyImmediateSafeState(tooth, outcome) {
    tooth.animState = 'resolved';
    if (outcome === SAFE_ACTIONS.BREAK_TILT) {
      tooth.mesh.material = this.materials.toothCracked;
      tooth.group.rotation.z += (Math.random() > 0.5 ? 0.38 : -0.38);
      tooth.group.position.y += tooth.jaw === 'upper' ? 0.1 : -0.1;
    } else if (outcome === SAFE_ACTIONS.SINK) {
      tooth.group.position.y += tooth.jaw === 'upper' ? 0.28 : -0.28;
    } else {
      tooth.group.visible = false;
    }
  }

  resolveToothLoss(toothId) {
    const tooth = this.teethMap.get(toothId);
    if (!tooth) return;
    tooth.animState = 'depressed';
    tooth.group.position.y += tooth.jaw === 'upper' ? 0.08 : -0.08;
    tooth.focusRing.visible = false;
  }

  resetAll() {
    this.isHappy = false;
    this.impactGroup.visible = false;
    this.setJawAngle(this.JAW_OPEN_ANGLE, true);

    for (const tear of this.tears) {
      tear.active = false;
      tear.mesh.visible = false;
    }

    for (const t of this.teethMap.values()) {
      t.group.position.copy(t.basePos);
      t.group.rotation.copy(t.baseRot);
      t.group.visible = true;
      t.mesh.material = this.materials.tooth;
      t.focusRing.visible = false;
      t.animState = 'idle';
      t.animProgress = 0;
      t.outcome = null;
    }
  }

  setHappyGrin(isHappy = true) {
    this.isHappy = isHappy;
    if (isHappy) {
      this.setJawAngle(this.JAW_HAPPY_ANGLE);
    } else {
      this.setJawAngle(this.JAW_OPEN_ANGLE);
    }
  }

  update(delta, lookTarget = null, reducedMotion = false) {
    const dt = Math.min(delta, 0.1);
    this.idleTime += dt;

    // 1. Jaw smoothing
    this.currentJawAngle += (this.targetJawAngle - this.currentJawAngle) * Math.min(1.0, dt * 14.0);
    this.upperJawPivot.rotation.x = this.currentJawAngle;

    // 2. Expressions & Idle Bounce
    if (this.isHappy) {
      const bounce = Math.sin(this.idleTime * 8) * 0.08;
      this.root.position.y = bounce;
      this.root.rotation.z = Math.sin(this.idleTime * 4) * 0.04;
      if (this.leftEyelid && this.rightEyelid) {
        this.leftEyelid.rotation.x = -Math.PI * 0.18;
        this.rightEyelid.rotation.x = -Math.PI * 0.18;
      }
    } else if (reducedMotion) {
      // Reduced motion: hold a resting pose instead of animating breath and blink, and never
      // leave the eyelids frozen mid-blink.
      this.root.position.y = 0;
      this.root.rotation.z = 0;
      this.isBlinking = false;
      this.blinkProgress = 0;
      if (this.leftEyelid && this.rightEyelid) {
        this.leftEyelid.rotation.x = -Math.PI * 0.5;
        this.rightEyelid.rotation.x = -Math.PI * 0.5;
      }
    } else {
      const breath = Math.sin(this.idleTime * 1.8) * 0.02;
      this.root.position.y = breath;
      this.root.rotation.z = Math.sin(this.idleTime * 0.9) * 0.008;

      // Eye Blinking
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.isBlinking = true;
        this.blinkProgress += dt * 8.0;
        if (this.blinkProgress >= Math.PI) {
          this.isBlinking = false;
          this.blinkProgress = 0;
          this.blinkTimer = 2.5 + Math.random() * 3.5;
        }
      }

      if (this.leftEyelid && this.rightEyelid) {
        if (this.isBlinking) {
          const lidAngle = -Math.PI * 0.5 + Math.sin(this.blinkProgress) * Math.PI * 0.42;
          this.leftEyelid.rotation.x = lidAngle;
          this.rightEyelid.rotation.x = lidAngle;
        } else {
          this.leftEyelid.rotation.x = -Math.PI * 0.5;
          this.rightEyelid.rotation.x = -Math.PI * 0.5;
        }
      }
    }

    // 3. Pupil Tracking
    if (lookTarget) {
      const targetPupilX = THREE.MathUtils.clamp(lookTarget.x * 0.16, -0.16, 0.16);
      const targetPupilY = THREE.MathUtils.clamp(-lookTarget.y * 0.16 + 0.05, -0.12, 0.18);
      if (this.leftPupil && this.rightPupil) {
        this.leftPupil.position.x += (targetPupilX - this.leftPupil.position.x) * Math.min(1.0, dt * 6.0);
        this.leftPupil.position.y += (targetPupilY - this.leftPupil.position.y) * Math.min(1.0, dt * 6.0);
        this.rightPupil.position.x += (targetPupilX - this.rightPupil.position.x) * Math.min(1.0, dt * 6.0);
        this.rightPupil.position.y += (targetPupilY - this.rightPupil.position.y) * Math.min(1.0, dt * 6.0);
      }
    }

    // 4. Update Teeth Animations
    for (const t of this.teethMap.values()) {
      if (t.animState === 'resolving') {
        t.animProgress += dt * 2.2;
        const p = Math.min(1.0, t.animProgress);

        if (t.outcome === SAFE_ACTIONS.BREAK_TILT) {
          t.mesh.material = this.materials.toothCracked;
          const tiltTarget = 0.42;
          t.group.rotation.z = THREE.MathUtils.lerp(0, tiltTarget, p);
          t.group.position.y = t.basePos.y + (t.jaw === 'upper' ? 0.1 * p : -0.1 * p);
        } else if (t.outcome === SAFE_ACTIONS.SINK) {
          const sinkDist = t.jaw === 'upper' ? 0.28 : -0.28;
          t.group.position.y = t.basePos.y + sinkDist * p;
        } else if (t.outcome === SAFE_ACTIONS.WOBBLE_FALL) {
          if (p < 0.35) {
            const wobble = Math.sin(p * 35) * 0.28;
            t.group.rotation.z = wobble;
          } else {
            const fallP = (p - 0.35) / 0.65;
            t.group.position.y = t.basePos.y - (fallP * fallP * 2.8);
            t.group.position.z = t.basePos.z - fallP * 0.5;
            t.group.rotation.x += dt * 8.0;
            if (fallP >= 0.95) {
              t.group.visible = false;
            }
          }
        }

        if (p >= 1.0) {
          t.animState = 'resolved';
        }
      }
    }

    // 5. Update Tears
    for (const tear of this.tears) {
      if (tear.active) {
        tear.lifetime += dt;
        tear.velocity.y -= dt * 7.5;
        tear.mesh.position.addScaledVector(tear.velocity, dt);
        const scale = Math.max(0, 1.0 - tear.lifetime / tear.maxLife);
        tear.mesh.scale.set(scale, scale * 1.5, scale);

        if (tear.lifetime >= tear.maxLife || tear.mesh.position.y < -0.5) {
          tear.active = false;
          tear.mesh.visible = false;
        }
      }
    }

    // 6. Update Impact FX
    if (this.impactGroup.visible) {
      this.impactBurstTime -= dt;
      const progress = 1.0 - (this.impactBurstTime / 0.38);
      const scale = Math.sin(progress * Math.PI) * 2.0;
      this.impactStarMesh.scale.set(scale, scale, scale);
      this.impactStarMesh.rotation.z += dt * 4.0;
      this.impactPopMesh.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
      this.impactPopMesh.rotation.z -= dt * 5.0;

      if (this.impactBurstTime <= 0) {
        this.impactGroup.visible = false;
      }
    }
  }
}

/**
 * THE PLAYER HAND. A reach-press-retract rig whose sleeve and skin tone are painted from the seat
 * whose turn it is, so the round reads as a hand-off between players.
 */
class PlayerHand {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'PlayerHandRoot';
    this.root.visible = false;

    // Materials (dynamic colors)
    this.sleeveMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b35,
      roughness: 0.5,
      metalness: 0.05,
    });

    this.skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xf1c27d,
      roughness: 0.45,
      metalness: 0.0,
    });

    // Comic Star FX for Squash
    this.starMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd32a,
      side: THREE.DoubleSide,
    });

    this.restPos = new THREE.Vector3(0, -2.5, 2.5);
    this.root.position.copy(this.restPos);

    this.buildHand();
    this.buildComicStars();
    this.scene.add(this.root);

    // Animation state
    this.isAnimating = false;
    this.animType = 'none'; // 'press_safe' | 'press_loss' | 'retract'
    this.animTime = 0;
    this.animDuration = 0.5;
    this.startPos = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.onContactCallback = null;
    this.onCompleteCallback = null;
    this.contactFired = false;
    this.squashProgress = 0;
  }

  buildHand() {
    this.handModel = new THREE.Group();
    this.root.add(this.handModel);

    // 1. Compact Wrist Cuff (No long arm cylinder)
    const cuffGeo = new THREE.CylinderGeometry(0.24, 0.26, 0.22, 16);
    cuffGeo.rotateX(Math.PI * 0.4);
    this.cuffMesh = new THREE.Mesh(cuffGeo, this.sleeveMaterial);
    this.cuffMesh.position.set(0, -0.05, 0.25);
    this.cuffMesh.castShadow = true;
    this.handModel.add(this.cuffMesh);

    // 2. Palm / Fist
    const palmGeo = new THREE.SphereGeometry(0.25, 16, 12);
    palmGeo.scale(1.05, 0.85, 1.15);
    this.palmMesh = new THREE.Mesh(palmGeo, this.skinMaterial);
    this.palmMesh.position.set(0, 0.05, 0.05);
    this.palmMesh.castShadow = true;
    this.handModel.add(this.palmMesh);

    // 3. Prominent Pointing Index Finger (Extends forward/downward to poke tooth)
    const fingerGeo = new THREE.CylinderGeometry(0.08, 0.095, 0.5, 12);
    fingerGeo.rotateX(Math.PI * 0.48);
    this.fingerMesh = new THREE.Mesh(fingerGeo, this.skinMaterial);
    this.fingerMesh.position.set(0, 0.1, -0.25);
    this.fingerMesh.castShadow = true;
    this.handModel.add(this.fingerMesh);

    // Finger Tip Dome
    const tipGeo = new THREE.SphereGeometry(0.085, 12, 10);
    this.tipMesh = new THREE.Mesh(tipGeo, this.skinMaterial);
    this.tipMesh.position.set(0, 0.18, -0.48);
    this.handModel.add(this.tipMesh);

    // 4. Curled Thumb & other fingers (Clean cartoon fist)
    const thumbGeo = new THREE.CylinderGeometry(0.075, 0.085, 0.26, 10);
    thumbGeo.rotateZ(Math.PI * 0.35);
    const thumb = new THREE.Mesh(thumbGeo, this.skinMaterial);
    thumb.position.set(-0.18, 0.08, -0.02);
    this.handModel.add(thumb);

    const curledGeo = new THREE.SphereGeometry(0.16, 12, 10);
    curledGeo.scale(1.2, 0.7, 0.85);
    const curledFingers = new THREE.Mesh(curledGeo, this.skinMaterial);
    curledFingers.position.set(0.12, -0.04, -0.08);
    this.handModel.add(curledFingers);
  }

  buildComicStars() {
    this.comicStarsGroup = new THREE.Group();
    this.comicStarsGroup.visible = false;
    this.root.add(this.comicStarsGroup);

    const starShape = new THREE.Shape();
    const pts = 5;
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? 0.22 : 0.09;
      const a = (i / (pts * 2)) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();
    const starGeo = new THREE.ShapeGeometry(starShape);

    for (let i = 0; i < 4; i++) {
      const star = new THREE.Mesh(starGeo, this.starMaterial);
      star.position.set((Math.random() - 0.5) * 0.5, 0.2 + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.3);
      this.comicStarsGroup.add(star);
    }
  }

  setPlayerAppearance(player) {
    if (!player) return;
    if (player.sleeveColor) {
      this.sleeveMaterial.color.set(player.sleeveColor);
    }
    if (player.skinTone) {
      this.skinMaterial.color.set(player.skinTone);
    }
  }

  /**
   * Performs safe press with pointing index finger
   */
  pressSafe(targetWorldPos, onContact, onComplete, reducedMotion = false) {
    this.root.visible = true;
    this.isAnimating = true;
    this.animType = 'press_safe';
    this.animTime = 0;
    this.animDuration = reducedMotion ? 0.35 : 0.75;
    this.contactFired = false;
    this.onContactCallback = onContact;
    this.onCompleteCallback = onComplete;

    this.targetPos.copy(targetWorldPos).add(new THREE.Vector3(0, 0.08, 0.38));
    this.startPos.copy(this.targetPos).add(new THREE.Vector3(0.4, -1.5, 1.4));
    this.root.position.copy(this.startPos);
    this.handModel.scale.set(1, 1, 1);
    this.comicStarsGroup.visible = false;
  }

  pressLosing(targetWorldPos, onContact) {
    this.root.visible = true;
    this.isAnimating = true;
    this.animType = 'press_loss';
    this.animTime = 0;
    this.animDuration = 0.18;
    this.contactFired = false;
    this.onContactCallback = onContact;

    this.targetPos.copy(targetWorldPos).add(new THREE.Vector3(0, 0.06, 0.38));
    this.startPos.copy(this.targetPos).add(new THREE.Vector3(0.4, -1.5, 1.4));
    this.root.position.copy(this.startPos);
    this.handModel.scale.set(1, 1, 1);
    this.comicStarsGroup.visible = false;
  }

  applyBiteSquash() {
    this.handModel.scale.set(1.35, 0.35, 1.15);
    this.comicStarsGroup.visible = true;
  }

  retractUnharmed(onComplete) {
    this.isAnimating = true;
    this.animType = 'retract_loss';
    this.animTime = 0;
    this.animDuration = 0.45;
    this.startPos.copy(this.root.position);
    this.targetPos.copy(this.startPos).add(new THREE.Vector3(0.4, -1.8, 1.5));
    this.onCompleteCallback = onComplete;
  }

  reset() {
    this.isAnimating = false;
    this.animType = 'none';
    this.root.visible = false;
    this.handModel.scale.set(1, 1, 1);
    this.comicStarsGroup.visible = false;
    this.root.position.copy(this.restPos);
  }

  update(delta) {
    if (!this.isAnimating) return;
    const dt = Math.min(delta, 0.1);
    this.animTime += dt;

    if (this.animType === 'press_safe') {
      const contactTime = 0.15;
      const holdTime = 0.48;

      if (this.animTime <= contactTime) {
        const p = THREE.MathUtils.smoothstep(this.animTime / contactTime, 0, 1);
        this.root.position.lerpVectors(this.startPos, this.targetPos, p);
      } else if (this.animTime <= holdTime) {
        this.root.position.copy(this.targetPos);
        if (!this.contactFired) {
          this.contactFired = true;
          if (this.onContactCallback) this.onContactCallback();
        }
      } else {
        if (!this.contactFired) {
          this.contactFired = true;
          if (this.onContactCallback) this.onContactCallback();
        }
        const retractP = THREE.MathUtils.smoothstep((this.animTime - holdTime) / (this.animDuration - holdTime), 0, 1);
        this.root.position.lerpVectors(this.targetPos, this.startPos, retractP);

        if (this.animTime >= this.animDuration) {
          this.isAnimating = false;
          this.root.visible = false;
          if (this.onCompleteCallback) this.onCompleteCallback();
        }
      }
    } else if (this.animType === 'press_loss') {
      const p = Math.min(1.0, this.animTime / this.animDuration);
      this.root.position.lerpVectors(this.startPos, this.targetPos, p);
      if (p >= 1.0) {
        this.root.position.copy(this.targetPos);
        if (!this.contactFired) {
          this.contactFired = true;
          if (this.onContactCallback) this.onContactCallback();
        }
      }
    } else if (this.animType === 'retract_loss') {
      const p = Math.min(1.0, this.animTime / this.animDuration);
      this.handModel.scale.lerp(new THREE.Vector3(1, 1, 1), p * 2);
      this.root.position.lerpVectors(this.startPos, this.targetPos, p);

      if (p >= 1.0) {
        this.isAnimating = false;
        this.root.visible = false;
        this.comicStarsGroup.visible = false;
        if (this.onCompleteCallback) this.onCompleteCallback();
      }
    }

    if (this.comicStarsGroup.visible) {
      this.comicStarsGroup.rotation.z += dt * 6.0;
    }
  }
}

/**
 * INPUT. Pointer picks against the tooth meshes, gated by phase so a second contact during a
 * resolution cannot press a tooth. Keyboard tooth focus lives here too.
 */
class InputHandler {
  constructor(canvasContainer, scene, crocodile, state, onToothSelect) {
    this.container = canvasContainer;
    this.scene = scene;
    this.crocodile = crocodile;
    this.state = state;
    this.onToothSelect = onToothSelect;

    this.pointerActive = false;
    this.activePointerId = null;
    this.pointerStartPos = { x: 0, y: 0 };
    this.lastPointerCoords = { x: 0, y: 0 };

    this.setupPointerListeners();
    this.setupKeyboardListeners();
  }

  setupPointerListeners() {
    this.container.addEventListener('pointerdown', (e) => this.handlePointerDown(e), { passive: false });
    this.container.addEventListener('pointermove', (e) => this.handlePointerMove(e), { passive: true });
    this.container.addEventListener('pointerup', (e) => this.handlePointerUp(e), { passive: false });
    this.container.addEventListener('pointercancel', (e) => this.handlePointerCancel(e), { passive: true });
    
    // Context menu disable on canvas
    this.container.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  handlePointerDown(e) {
    if (this.pointerActive) return; // Prevent multi-touch conflict
    this.pointerActive = true;
    this.activePointerId = e.pointerId;
    this.pointerStartPos = { x: e.clientX, y: e.clientY };
  }

  handlePointerMove(e) {
    this.lastPointerCoords = { x: e.clientX, y: e.clientY };
    // Pass normalized pointer position for eye pupil tracking
    const norm = this.scene.getNormalizedPointer(e.clientX, e.clientY);
    this.crocodile.lookTarget.set(norm.x, norm.y);
  }

  handlePointerUp(e) {
    if (!this.pointerActive || e.pointerId !== this.activePointerId) {
      return;
    }
    this.pointerActive = false;
    this.activePointerId = null;

    // Check if pointer dragged too far (gesture rather than tap)
    const dist = Math.hypot(e.clientX - this.pointerStartPos.x, e.clientY - this.pointerStartPos.y);
    if (dist > 25) return;

    if (this.state.isInputLocked || this.state.phase !== PHASES.PLAYER_TURN) {
      return;
    }

    const hitMeshes = this.crocodile.getHitMeshes();
    const toothId = this.scene.raycastTeeth(e.clientX, e.clientY, hitMeshes);
    if (toothId) {
      e.preventDefault();
      this.state.setFocusedToothId(toothId);
      this.onToothSelect(toothId);
    }
  }

  handlePointerCancel(e) {
    if (e.pointerId === this.activePointerId) {
      this.pointerActive = false;
      this.activePointerId = null;
    }
  }

  setupKeyboardListeners() {
    this.container.setAttribute('tabindex', '0');
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', BOARD_ARIA_LABEL);

    this.container.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Update 3D focus ring when state changes focused tooth
    this.state.on('keyboardFocusChange', (toothId) => {
      this.crocodile.setFocusedTooth(toothId);
    });
  }

  handleKeyDown(e) {
    if (this.state.phase !== PHASES.PLAYER_TURN) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      const nextId = this.state.getNextUnresolvedToothId(this.state.focusedToothId, 1);
      if (nextId) {
        this.state.setFocusedToothId(nextId);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      const prevId = this.state.getNextUnresolvedToothId(this.state.focusedToothId, -1);
      if (prevId) {
        this.state.setFocusedToothId(prevId);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!this.state.isInputLocked && this.state.focusedToothId) {
        this.onToothSelect(this.state.focusedToothId);
      }
    }
  }
}

/**
 * THAI UI. The seat strip, the live tension meter, the how-to-play and settings modals, the reset
 * confirmation, and the round and match scoreboards.
 *
 * The screens themselves are static markup in markup.html; initDOM only caches them. Player names
 * are attacker-owned, so every sink that carries one builds nodes and writes textContent — a name
 * never reaches markup as a string.
 */
class UIManager {
  constructor(rootElement, state, audio, onStartGame, onReplay, onReturnSetup, onConfirmReset) {
    this.root = rootElement;
    this.state = state;
    this.audio = audio;
    this.onStartGame = onStartGame;
    this.onReplay = onReplay;
    this.onReturnSetup = onReturnSetup;
    this.onConfirmReset = onConfirmReset;

    this.initDOM();
    this.bindEvents();
    this.updateUI();
  }

  // Query-only. The scaffold this caches lives in markup.html, which the page injects before
  // this module runs: a template written from script would put the whole UI out of reach of the
  // scanners that read a route's static markup.
  initDOM() {
    // Cache elements
    this.elSetup = this.root.querySelector('#screen-setup');
    this.elHud = this.root.querySelector('#screen-hud');
    this.elModalHow = this.root.querySelector('#modal-how');
    this.elModalSettings = this.root.querySelector('#modal-settings');
    this.elModalReset = this.root.querySelector('#modal-reset');
    this.elResult = this.root.querySelector('#screen-result');
    this.elWebGLError = this.root.querySelector('#webglUnsupportedNotice');
    this.elAnnouncer = this.root.querySelector('#aria-announcer');
    this.elToast = this.root.querySelector('#hud-toast');
    this.elSetupMascots = this.root.querySelector('#setup-mascots-list');
    this.elSetupTeethDesc = this.root.querySelector('#setup-teeth-desc');

    // HUD items
    this.elPlayerStrip = this.root.querySelector('#hud-player-strip');
    this.elTurnBanner = this.root.querySelector('#hud-turn-banner');
    this.elTurnAvatar = this.root.querySelector('#turn-avatar');
    this.elTurnPlayerName = this.root.querySelector('#turn-player-name');
    this.elTensionPill = this.root.querySelector('#hud-tension-pill');
    this.elTensionFill = this.root.querySelector('#tension-fill-bar');
    this.elTensionOddsText = this.root.querySelector('#tension-odds-text');
    this.elHudRoundLabel = this.root.querySelector('#hud-round-label');

    // Result items
    this.elResultEmoji = this.root.querySelector('#result-emoji');
    this.elResultTitle = this.root.querySelector('#result-title');
    this.elResultDesc = this.root.querySelector('#result-desc');
    this.elResultScoreboard = this.root.querySelector('#result-scoreboard');
    this.elBtnResultNextText = this.root.querySelector('#btn-result-next-text');

    // Toggles
    this.btnHudSound = this.root.querySelector('#btn-hud-sound');
    this.toggleAudio = this.root.querySelector('#toggle-audio');
    this.toggleShake = this.root.querySelector('#toggle-shake');
    this.toggleParticles = this.root.querySelector('#toggle-particles');

    this.renderMascotInputs();
    this.updateToggleStates();
  }

  bindEvents() {
    // 1. Sound Button in HUD
    this.btnHudSound.addEventListener('click', () => {
      this.audio.ensureContext();
      this.audio.playClick();
      const next = !this.state.audioEnabled;
      this.state.setAudioEnabled(next);
      this.audio.setMuted(!next);
      this.updateToggleStates();
      this.showToast(next ? 'เปิดเสียงแล้ว 🔊' : 'ปิดเสียงแล้ว 🔇');
    });

    // 2. Settings Toggles
    this.toggleAudio.addEventListener('click', () => {
      this.audio.playClick();
      const next = !this.state.audioEnabled;
      this.state.setAudioEnabled(next);
      this.audio.setMuted(!next);
      this.updateToggleStates();
    });

    this.toggleShake.addEventListener('click', () => {
      this.audio.playClick();
      this.state.setShakeEnabled(!this.state.shakeEnabled);
      this.updateToggleStates();
    });

    this.toggleParticles.addEventListener('click', () => {
      this.audio.playClick();
      this.state.setParticlesEnabled(!this.state.particlesEnabled);
      this.updateToggleStates();
    });

    // 3. Modals Open / Close
    this.root.querySelector('#btn-how-to-play').addEventListener('click', () => {
      this.audio.playClick();
      this.openModal(this.elModalHow);
    });
    this.root.querySelector('#btn-close-how').addEventListener('click', () => {
      this.audio.playClick();
      this.closeModal(this.elModalHow);
    });

    this.root.querySelector('#btn-open-settings').addEventListener('click', () => {
      this.audio.playClick();
      this.openModal(this.elModalSettings);
    });
    this.root.querySelector('#btn-hud-settings').addEventListener('click', () => {
      this.audio.playClick();
      this.openModal(this.elModalSettings);
    });
    this.root.querySelector('#btn-close-settings').addEventListener('click', () => {
      this.audio.playClick();
      this.closeModal(this.elModalSettings);
    });

    // 4. Player Count Pills
    const countPills = this.root.querySelectorAll('.count-pill');
    countPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.audio.playClick();
        const count = parseInt(pill.dataset.count, 10);
        countPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.state.setPlayerCount(count);
        this.renderMascotInputs();
        this.updateTeethDescription(count);
      });
    });

    // 5. Start Game
    this.root.querySelector('#btn-start-game').addEventListener('click', () => {
      this.audio.ensureContext();
      this.audio.playClick();
      this.onStartGame();
    });

    // 6. HUD Restart & Return to Home
    this.root.querySelector('#btn-hud-restart').addEventListener('click', () => {
      this.audio.playClick();
      this.state.requestRestart();
    });
    this.root.querySelector('#btn-hud-home').addEventListener('click', () => {
      this.audio.playClick();
      this.onReturnSetup();
    });

    // 7. Modal Reset
    this.root.querySelector('#btn-reset-cancel').addEventListener('click', () => {
      this.audio.playClick();
      this.state.cancelRestart();
    });
    this.root.querySelector('#btn-reset-confirm').addEventListener('click', () => {
      this.audio.playClick();
      this.onConfirmReset();
    });

    // 8. Result Actions
    this.root.querySelector('#btn-result-next').addEventListener('click', () => {
      this.audio.ensureContext();
      this.audio.playClick();
      if (this.state.currentRound >= this.state.maxRounds) {
        // Start fresh match
        this.onReplay();
      } else {
        // Advance to next round in match
        this.state.advanceToNextMatchRound();
      }
    });
    this.root.querySelector('#btn-result-menu').addEventListener('click', () => {
      this.audio.playClick();
      this.onReturnSetup();
    });

    // 9. State Event Listeners
    this.state.on('phaseChange', () => this.updateUI());
    this.state.on('playerTurnChange', ({ player, odds }) => this.updateTurnDisplay(player, odds));
    this.state.on('turnTransition', ({ nextPlayer, odds }) => this.handleTurnTransition(nextPlayer, odds));
    this.state.on('roundReset', (data) => this.handleRoundReset(data));
    this.state.on('gameResult', (data) => this.handleGameResult(data));
    this.state.on('audioToggle', () => this.updateToggleStates());
  }

  openModal(modal) {
    if (!modal) return;
    modal.classList.add('open');
  }

  closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
  }

  updateToggleStates() {
    const audioOn = this.state.audioEnabled;
    this.btnHudSound.textContent = audioOn ? '🔊' : '🔇';
    this.toggleAudio.classList.toggle('on', audioOn);
    this.toggleShake.classList.toggle('on', this.state.shakeEnabled);
    this.toggleParticles.classList.toggle('on', this.state.particlesEnabled);
  }

  renderMascotInputs() {
    this.elSetupMascots.innerHTML = '';
    this.state.players.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'mascot-row';
      row.style.setProperty('--pColor', p.sleeveColor);

      const avatar = document.createElement('div');
      avatar.className = 'mascot-avatar';
      avatar.textContent = p.emoji;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'mascot-name-input';
      input.maxLength = 16;
      input.placeholder = p.name;
      input.value = p.rawName || '';
      input.setAttribute('aria-label', `ชื่อผู้เล่นคนที่ ${idx + 1}`);

      input.addEventListener('input', (e) => {
        this.state.updatePlayerName(idx, e.target.value);
      });

      row.appendChild(avatar);
      row.appendChild(input);
      this.elSetupMascots.appendChild(row);
    });
  }

  updateTeethDescription(count) {
    const cfg = this.state.toothConfig;
    this.elSetupTeethDesc.textContent = `ฟันทั้งหมด ${cfg.totalCount} ซี่ (บน ${cfg.upperCount} / ล่าง ${cfg.lowerCount})`;
  }

  renderPlayerStrip() {
    this.elPlayerStrip.innerHTML = '';
    const curr = this.state.getCurrentPlayer();

    this.state.players.forEach(p => {
      const card = document.createElement('div');
      card.className = `player-card ${p.id === curr.id ? 'active' : ''}`;
      card.style.setProperty('--pColor', p.sleeveColor);

      const avatar = document.createElement('div');
      avatar.className = 'card-avatar';
      avatar.textContent = p.emoji;

      const info = document.createElement('div');
      info.className = 'card-info';

      const name = document.createElement('div');
      name.className = 'card-name';
      name.textContent = p.name;

      const score = document.createElement('div');
      score.className = 'card-score';
      const sc = this.state.getPlayerScore(p.id);
      const scoreCount = document.createElement('strong');
      scoreCount.textContent = String(sc);
      score.append(document.createTextNode('🏆 '), scoreCount, document.createTextNode(' แต้ม'));

      info.appendChild(name);
      info.appendChild(score);
      card.appendChild(avatar);
      card.appendChild(info);
      this.elPlayerStrip.appendChild(card);
    });
  }

  announce(text) {
    if (this.elAnnouncer) {
      this.elAnnouncer.textContent = text;
    }
  }

  showToast(text, duration = 1200) {
    if (!this.elToast) return;
    this.elToast.textContent = text;
    this.elToast.classList.add('show');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.elToast.classList.remove('show');
    }, duration);
  }

  handleTurnTransition(nextPlayer, odds) {
    this.updateTurnDisplay(nextPlayer, odds);
    this.showToast(`ตาของ ${nextPlayer.name} ${nextPlayer.emoji}`, 800);
    this.announce(`ตาของ ${nextPlayer.name}`);
  }

  handleRoundReset(data) {
    const { startingPlayer, currentRound, maxRounds, odds } = data;
    this.updateTurnDisplay(startingPlayer, odds);
    this.elHudRoundLabel.textContent = `${currentRound} / ${maxRounds}`;
    this.showToast(`รอบ ${currentRound}! เริ่มที่ ${startingPlayer.name} ${startingPlayer.emoji}`, 1500);
    this.announce(`เริ่มรอบที่ ${currentRound}! เริ่มต้นที่ ${startingPlayer.name}`);
  }

  updateTurnDisplay(player, odds) {
    if (!player) return;
    this.renderPlayerStrip();

    // Turn banner
    this.elTurnAvatar.textContent = player.emoji;
    this.elTurnPlayerName.textContent = player.name;
    this.elTurnBanner.style.setProperty('--pColor', player.sleeveColor);

    // Live Tension & Odds Meter
    const currentOdds = odds || this.state.getLiveBiteOdds();
    this.elTensionOddsText.textContent = `${currentOdds.fraction} (${currentOdds.percent}%)`;
    this.elTensionFill.style.width = `${Math.min(100, currentOdds.percent)}%`;

    if (currentOdds.isCritical) {
      this.elTensionPill.classList.add('critical');
      // Low heartbeat thump when odds are >= 33%
      this.audio.playHeartbeat(currentOdds.percent);
    } else {
      this.elTensionPill.classList.remove('critical');
    }
  }

  handleGameResult(data) {
    const { loser, currentRound, maxRounds, isMatchComplete, matchWinner, scores } = data;
    const loserName = loser ? loser.name : 'ผู้เล่น';
    const loserEmoji = loser ? loser.emoji : '💥';

    if (isMatchComplete) {
      this.elResultEmoji.textContent = '👑';
      this.elResultTitle.textContent = matchWinner ? `🏆 ${matchWinner.name} ชนะแมตช์!` : 'จบการแข่งขัน!';
      this.elResultDesc.textContent = `แข่งขันครบ ${maxRounds} รอบแล้ว! ยินดีกับผู้รอดชีวิตที่มีคะแนนสูงสุด!`;
      this.elBtnResultNextText.textContent = 'เริ่มแมตช์ใหม่ 🔄';
    } else {
      this.elResultEmoji.textContent = '🐊💥';
      this.elResultTitle.textContent = `${loserEmoji} ${loserName} โดนเข้งับ!`;
      this.elResultDesc.textContent = `จบลงในรอบที่ ${currentRound} ผู้รอดชีวิตทุกคนได้ +1 แต้ม!`;
      this.elBtnResultNextText.textContent = `รอบถัดไป (${currentRound + 1}/${maxRounds}) ➔`;
    }

    // Render Scoreboard
    this.elResultScoreboard.innerHTML = '';
    scores.sort((a, b) => b.score - a.score);
    scores.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = `score-row ${isMatchComplete && idx === 0 ? 'winner' : ''}`;

      const pInfo = document.createElement('div');
      pInfo.className = 'score-player';
      const rowEmoji = document.createElement('span');
      rowEmoji.textContent = item.player.emoji;
      const rowName = document.createElement('span');
      rowName.textContent = item.player.name;
      pInfo.append(rowEmoji, document.createTextNode(' '), rowName);

      const scoreVal = document.createElement('div');
      const rowScore = document.createElement('strong');
      rowScore.textContent = String(item.score);
      scoreVal.append(document.createTextNode('🏆 '), rowScore, document.createTextNode(' แต้ม'));

      row.appendChild(pInfo);
      row.appendChild(scoreVal);
      this.elResultScoreboard.appendChild(row);
    });

    this.announce(`เกมจบลง! ${loserName} โดนเข้งับ!`);
  }

  showWebGLError() {
    this.elSetup.classList.add('hidden');
    this.elHud.classList.add('hidden');
    this.elResult.classList.add('hidden');
    this.elModalReset.classList.remove('open');
    this.elWebGLError.classList.remove('hidden');
  }

  updateUI() {
    const phase = this.state.phase;

    this.elSetup.classList.toggle('hidden', phase !== PHASES.SETUP);
    this.elHud.classList.toggle('hidden', phase === PHASES.SETUP || phase === PHASES.RESULT);
    
    if (phase === PHASES.RESET_CONFIRMATION) {
      this.openModal(this.elModalReset);
    } else {
      this.closeModal(this.elModalReset);
    }

    this.elResult.classList.toggle('hidden', phase !== PHASES.RESULT);

    if (phase === PHASES.PLAYER_TURN || phase === PHASES.RESOLVING_SAFE || phase === PHASES.TURN_TRANSITION) {
      this.updateTurnDisplay(this.state.getCurrentPlayer(), this.state.getLiveBiteOdds());
    }
  }
}

/**
 * BOOT. Wires state, audio, the 3D stack, input and the UI together, owns the render loop, and
 * choreographs a tooth press from the contact sound through to the result screen.
 *
 * A party route: the phone is passed around a roster of seats, one turn at a time.
 */
class GameApp {
  constructor() {
    this.canvasContainer = document.getElementById('canvas-container');
    this.uiRoot = document.getElementById('ui-root');

    this.state = new GameState();
    this.audio = audio;
    this.audio.setMuted(!this.state.audioEnabled);

    this.clock = new THREE.Clock();
    this.animationFrameId = null;

    // The UI is built BEFORE the try, and the 3D inside it. GameScene throws
    // WEBGL_NOT_SUPPORTED when a context request comes back null, and with the UI assigned inside
    // the same try the catch below guarded a this.ui that did not exist yet — so a device with no
    // usable GPU got an empty UI root instead of the no-3D notice. That is the blank play surface
    // ADR-0051 forbids.
    this.ui = new UIManager(
      this.uiRoot,
      this.state,
      this.audio,
      () => this.startNewMatch(),
      () => this.replayMatch(),
      () => this.returnToSetup(),
      () => this.confirmRestart()
    );

    // OUTSIDE the try, and that is the no-3D round ADR-0051 asks for. What this registers is the
    // round's own lifecycle — the visibility pause, the motion preference, and the handler that sets a
    // round up and schedules its first turn on a plain timer. Registered inside the try, a failed 3D
    // init left the route with no lifecycle at all: the notice was up, the seats were filled, and no
    // round was reachable on any device that never got a context. Every 3D deref below it is guarded
    // instead, so this runs on a route with no scene and wires the same round the fallback board plays.
    this.setupLifecycleEvents();

    // 3D engine and components. Everything in here needs a live WebGL context.
    try {
      this.scene = new GameScene(this.canvasContainer);
      this.crocodile = new Crocodile(this.scene.scene);
      this.playerHand = new PlayerHand(this.scene.scene);

      this.input = new InputHandler(
        this.canvasContainer,
        this.scene,
        this.crocodile,
        this.state,
        (toothId) => this.handleToothSelection(toothId)
      );

      this.startRenderLoop();
    } catch (e) {
      console.error('Failed to initialize 3D scene:', e);
      if (this.ui) {
        this.ui.showWebGLError();
      }
    }
  }

  setupLifecycleEvents() {
    // Window Resize
    window.addEventListener('resize', () => {
      if (this.scene) {
        this.scene.onResize();
      }
    });

    // Page Visibility change (tab switch / background)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.audio.pause();
        this.state.isPaused = true;
      } else {
        this.clock.getDelta();
        this.state.isPaused = false;
        if (this.state.audioEnabled) {
          this.audio.resume();
        }
      }
    });

    // Motion preference change
    if (window.matchMedia) {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        this.state.setReducedMotion(e.matches);
      });
    }

    // Connect round advance from state
    this.state.on('roundReset', () => {
      // Guarded, because this handler is now registered whether or not the 3D stack was built. With
      // no context there is nothing to reset and the round is played on the route's DOM board; the
      // timer below is the part that matters on that path, and it is what starts the first turn.
      if (this.crocodile) {
        this.crocodile.setupTeeth(this.state.toothConfig);
        this.crocodile.resetAll();
      }
      if (this.playerHand) this.playerHand.reset();

      setTimeout(() => {
        if (this.state.phase === PHASES.ROUND_INTRO) {
          this.state.beginPlayerTurn();
        }
      }, 1200);
    });
  }

  startNewMatch() {
    this.state.startNewRound(false);
  }

  replayMatch() {
    this.state.startNewRound(false);
  }

  returnToSetup() {
    this.state.returnToSetup();
    // Same guard as the lifecycle handler, and reached on the same path: the result card's home
    // button. With no 3D stack these two derefs threw a TypeError after the state had already
    // returned to setup, which left the round half-ended.
    if (this.crocodile) this.crocodile.resetAll();
    if (this.playerHand) this.playerHand.reset();
  }

  confirmRestart() {
    this.startNewMatch();
  }

  /**
   * Main Tooth Press Handling & Choreography
   */
  handleToothSelection(toothId) {
    const pressPayload = this.state.pressTooth(toothId);
    if (!pressPayload) return;

    const { token, player, isLosing, outcome, criedTears } = pressPayload;
    const toothWorldPos = this.crocodile.getWorldPositionOfTooth(toothId);
    if (!toothWorldPos) return;

    const reducedMotion = this.state.reducedMotion || !this.state.shakeEnabled;
    const allowParticles = this.state.particlesEnabled;
    this.playerHand.setPlayerAppearance(player);

    if (isLosing) {
      // --- LOSING SEQUENCE (2.5–3.0s Comic Choreography) ---
      this.playerHand.pressLosing(toothWorldPos, () => {
        // Step 1: Depress tooth slightly
        this.audio.playToothPress();
        this.audio.triggerHaptic(50, reducedMotion);
        this.crocodile.resolveToothLoss(toothId);

        // Step 2: Crocodile pauses & eyes shift to hand
        setTimeout(() => {
          if (token !== this.state.resolutionToken) return;

          // Step 3: Snap Jaws Shut!
          this.crocodile.setJawAngle(this.crocodile.JAW_CLOSED_ANGLE);
          this.audio.playSnapBite();
          this.audio.triggerHaptic([90, 60, 140], reducedMotion);
          
          if (!reducedMotion) {
            this.scene.triggerCameraShake(0.18, 0.14, false);
          }
          if (allowParticles) {
            this.crocodile.triggerImpactBurst();
          }
          this.playerHand.applyBiteSquash();

          // Step 4: Pause then pull hand out intact
          setTimeout(() => {
            if (token !== this.state.resolutionToken) return;

            this.playerHand.retractUnharmed(() => {
              // Step 5: Jaws reopen to broad happy grin
              this.crocodile.setHappyGrin(true);
              this.audio.playHappyChuckle();

              // Step 6: Show result screen
              setTimeout(() => {
                if (token !== this.state.resolutionToken) return;
                this.state.completeLosingResolution(token);
              }, 450);
            });
          }, 800);
        }, 380);
      });
    } else {
      // --- SAFE TOOTH SEQUENCE ---
      this.playerHand.pressSafe(
        toothWorldPos,
        () => {
          // On Contact with tooth
          this.audio.playToothPress();
          this.audio.triggerHaptic(40, reducedMotion);

          if (outcome === 'break_tilt') {
            this.audio.playCrackTilt();
          } else if (outcome === 'sink') {
            this.audio.playSink();
          } else if (outcome === 'wobble_fall') {
            this.audio.playWobbleFall();
          }

          this.crocodile.resolveToothSafe(toothId, outcome, reducedMotion);

          // 30% Independent Tears Chance
          if (criedTears && allowParticles) {
            setTimeout(() => {
              if (token !== this.state.resolutionToken) return;
              this.audio.playTears();
              this.crocodile.triggerComicTears();
            }, 120);
          }
        },
        () => {
          // Hand finished retracting -> Advance Turn
          if (token !== this.state.resolutionToken) return;
          this.state.completeSafeResolution(token);

          // Brief turn transition announcement (approx 0.7s)
          setTimeout(() => {
            if (token !== this.state.resolutionToken) return;
            if (this.state.phase === PHASES.TURN_TRANSITION) {
              this.state.beginPlayerTurn();
            }
          }, 700);
        },
        reducedMotion
      );
    }
  }

  startRenderLoop() {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);

      const delta = Math.min(this.clock.getDelta(), 0.1);
      if (this.state.isPaused) return;

      if (this.crocodile) {
        const reducedMotion = this.state.reducedMotion || !this.state.shakeEnabled;
        this.crocodile.update(delta, this.crocodile.lookTarget, reducedMotion);
      }
      if (this.playerHand) {
        this.playerHand.update(delta);
      }
      if (this.scene) {
        this.scene.update(delta);
        this.scene.render();
      }
    };

    loop();
  }
}

// Bootstrap when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.__khengApp = new GameApp();
});
