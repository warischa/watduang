// gh#227: the sound control on this route is a view of the SITE-WIDE mute preference, not a boolean
// of its own -- muting here mutes every other route, and reopening this one shows what the device
// actually is. No migration off any older per-route value: ADR-0064 records that a preference whose
// wrong value costs the player one tap needs neither a migration nor a collision guard.
import { isMuted, setMuted } from '../../shell/audio.ts';

(() => {
  'use strict';

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.init();
    }

    // An accessor pair, deliberately still named `enabled`: both controls on this route flip it --
    // the header button and the settings switch -- and every `if (!this.enabled || !this.ctx)`
    // below reads it. There is no field to initialise: an initialising write would un-mute the
    // device on every load.
    get enabled() {
      return !isMuted();
    }

    set enabled(on) {
      setMuted(!on);
    }
    init() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
    playClick() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.07);
    }
    playHover() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, t);
      osc.frequency.exponentialRampToValueAtTime(860, t + 0.04);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.05);
    }
    playSafe() {
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
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(st); osc.stop(st + 0.4);
      });
    }
    playExplosion() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.8);
      oscGain.gain.setValueAtTime(0.6, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(oscGain); oscGain.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.85);

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
      whiteNoise.connect(filter); filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      whiteNoise.start(t); whiteNoise.stop(t + 0.8);
    }
    playVictory() {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      const t = this.ctx.currentTime;
      const melody = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      melody.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const st = t + idx * 0.08;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, st);
        gain.gain.setValueAtTime(0.25, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(st); osc.stop(st + 0.55);
      });
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
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.16);
    }
  }
  const sounds = new SoundSynth();

  // --- CUTE MASCOT CHARACTERS (10 Unique Species) ---
  const MASCOT_CONFIG = [
    { type: 'cat', name: 'น้องแมว', emoji: '🐱', color: '#ff9500', belly: [1.0, 0.94, 0.86], blush: [1.0, 0.45, 0.55] },
    { type: 'penguin', name: 'น้องเพนกวิน', emoji: '🐧', color: '#00d2d3', belly: [0.95, 0.97, 1.0], blush: [1.0, 0.5, 0.6] },
    { type: 'bunny', name: 'น้องกระต่าย', emoji: '🐰', color: '#ff6b81', belly: [1.0, 0.92, 0.95], blush: [1.0, 0.4, 0.5] },
    { type: 'froggy', name: 'น้องกบ', emoji: '🐸', color: '#2ed573', belly: [0.85, 0.98, 0.75], blush: [1.0, 0.5, 0.5] },
    { type: 'bear', name: 'น้องหมี', emoji: '🐻', color: '#a55eea', belly: [0.95, 0.88, 1.0], blush: [1.0, 0.45, 0.6] },
    { type: 'chick', name: 'น้องลูกเจี๊ยบ', emoji: '🐥', color: '#ffa502', belly: [1.0, 0.96, 0.82], blush: [1.0, 0.45, 0.5] },
    { type: 'panda', name: 'น้องแพนด้า', emoji: '🐼', color: '#4b6584', belly: [0.95, 0.95, 0.96], blush: [1.0, 0.45, 0.55] },
    { type: 'piggy', name: 'น้องหมู', emoji: '🐷', color: '#ff78ae', belly: [1.0, 0.9, 0.94], blush: [1.0, 0.35, 0.5] },
    { type: 'shiba', name: 'น้องชิบะ', emoji: '🦊', color: '#eb4d4b', belly: [1.0, 0.92, 0.85], blush: [1.0, 0.45, 0.5] },
    { type: 'slime', name: 'น้องสตาร์สไลม์', emoji: '🌟', color: '#686de0', belly: [0.9, 0.95, 1.0], blush: [1.0, 0.5, 0.7] }
  ];

  const PLAYER_RGB = MASCOT_CONFIG.map(cfg => {
    const n = parseInt(cfg.color.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  });

  const BOARD_GRID_MAP = {
    2: [5, 5], 3: [5, 6], 4: [6, 6], 5: [6, 7], 6: [7, 7],
    7: [7, 8], 8: [8, 8], 9: [8, 9], 10: [9, 9]
  };

  // --- WEBGL 3D SETUP & SHADERS ---
  const canvas = document.getElementById('gameCanvas');
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: true, depth: true,
    powerPreference: 'high-performance'
  });

  // Repo-side replacement for the mockup's page-blanking guard (ADR-0051: a play route never blanks
  // the page). The mockup assigned over document.body, which here is the SHELL body carrying the page
  // chrome, its one crawlable outbound link and the ad slots. Scope is this route's own container: the
  // dead canvas goes (its CSS sets display:block, so the hidden attribute would not have hidden it)
  // and a Thai notice takes its place. The return is legal as-is because it sits inside this file's
  // IIFE arrow, not at module top level. Re-extracting this route restores the mockup's version.
  if (!gl) {
    const host = canvas.parentElement || document.getElementById('app');
    const notice = document.createElement('div');
    notice.id = 'webglUnsupportedNotice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'padding:40px;text-align:center;font-size:18px;line-height:1.7';
    notice.textContent = 'อุปกรณ์นี้ไม่รองรับกราฟิก 3D (WebGL) จึงแสดงกระดานระเบิดไม่ได้ ลองเปิดด้วยเบราว์เซอร์รุ่นใหม่กว่านี้ หรือเลือกเล่นเกมอื่นได้เลย';
    canvas.remove();
    if (host) host.prepend(notice);
    return;
  }

  const VS_SOURCE = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uViewProj;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vLocal;
    void main() {
      vec4 world = uModel * vec4(aPos, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      vLocal = aPos;
      gl_Position = uViewProj * world;
    }
  `;

  const FS_SOURCE = `
    precision mediump float;
    uniform vec3 uBase;
    uniform vec3 uCamera;
    uniform float uMaterial;
    uniform float uAlpha;
    uniform float uEmissive;
    uniform float uSeed;
    uniform vec3 uLightPos;
    uniform vec3 uLightColor;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec3 vLocal;

    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash(i), n100 = hash(i + vec3(1,0,0)), n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
      float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1)), n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
      return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                 mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
    }

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCamera - vWorld);
      vec3 L = normalize(vec3(-0.45, 0.85, 0.4));
      float ndl = max(dot(N, L), 0.0);
      float hemi = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);

      vec3 base = uBase;
      float roughness = 0.65;
      float metallic = 0.05;

      if (uMaterial < 0.5) { // Stone Tile with engraved runes
        float n = noise(vWorld * 4.5 + uSeed * 13.0);
        float fine = noise(vWorld * 22.0);
        base *= (0.84 + 0.22 * n + 0.06 * (fine - 0.5));
        if (N.y > 0.6) {
          float runeDiamond = abs(vLocal.x) + abs(vLocal.z);
          float runeMark = 1.0 - smoothstep(0.18, 0.22, runeDiamond);
          base *= (1.0 - 0.22 * runeMark);
        }
        roughness = 0.85;
      } else if (uMaterial < 1.5) { // Gold Trim / Filigree
        roughness = 0.25; metallic = 0.8;
      } else if (uMaterial < 2.5) { // Gem / Crystal
        roughness = 0.1;
      } else if (uMaterial < 3.5) { // Mascot Cute Fur / Skin
        roughness = 0.55;
      } else if (uMaterial < 4.5) { // Metal / Bomb Body / Eyes
        roughness = 0.15; metallic = 0.85;
      } else if (uMaterial > 5.5) { // Emissive Glow particles
        gl_FragColor = vec4(base * (1.0 + uEmissive * 2.0), uAlpha);
        return;
      }

      vec3 pLightDir = uLightPos - vWorld;
      float pDist = length(pLightDir);
      pLightDir = normalize(pLightDir);
      float pNdl = max(dot(N, pLightDir), 0.0);
      float pAtten = 1.0 / (1.0 + 0.25 * pDist + 0.12 * pDist * pDist);
      vec3 pointLightContrib = uLightColor * pNdl * pAtten * 2.0;

      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), mix(75.0, 12.0, roughness)) * (1.0 - roughness);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.18;

      vec3 ambientSky = vec3(0.38, 0.54, 0.74) * (0.38 + 0.3 * hemi);
      vec3 sunLight = vec3(1.0, 0.95, 0.84) * (0.42 + 0.8 * ndl);
      vec3 litColor = base * (ambientSky + sunLight + pointLightContrib) + vec3(spec * (1.0 + metallic * 2.0)) + base * rim + base * uEmissive;

      float dist = length(vWorld - uCamera);
      float fog = smoothstep(22.0, 52.0, dist);
      vec3 fogColor = vec3(0.1, 0.18, 0.28);
      litColor = mix(litColor, fogColor, fog * 0.65);

      litColor = litColor / (litColor + vec3(0.8));
      litColor = pow(litColor, vec3(0.92));

      gl_FragColor = vec4(litColor, uAlpha);
    }
  `;

  function createShader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, createShader(gl.VERTEX_SHADER, VS_SOURCE));
  gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, FS_SOURCE));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

  const uLoc = {
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNormal: gl.getAttribLocation(prog, 'aNormal'),
    uModel: gl.getUniformLocation(prog, 'uModel'),
    uViewProj: gl.getUniformLocation(prog, 'uViewProj'),
    uBase: gl.getUniformLocation(prog, 'uBase'),
    uCamera: gl.getUniformLocation(prog, 'uCamera'),
    uMaterial: gl.getUniformLocation(prog, 'uMaterial'),
    uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
    uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
    uSeed: gl.getUniformLocation(prog, 'uSeed'),
    uLightPos: gl.getUniformLocation(prog, 'uLightPos'),
    uLightColor: gl.getUniformLocation(prog, 'uLightColor')
  };

  // --- PROCEDURAL 3D MESH GENERATORS ---
  function buildMesh(pos, norm, idx) {
    const m = { count: idx.length, p: gl.createBuffer(), n: gl.createBuffer(), i: gl.createBuffer() };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.p); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.n); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norm), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return m;
  }
  function addQuad(pos, norm, idx, a, b, c, d, n) {
    const base = pos.length / 3;
    [a, b, c, d].forEach(p => pos.push(...p));
    for (let k = 0; k < 4; k++) norm.push(...n);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function makeBox() {
    const p = [], n = [], i = [];
    addQuad(p, n, i, [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5], [0, 1, 0]);
    addQuad(p, n, i, [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0]);
    addQuad(p, n, i, [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [0, 0, 1]);
    addQuad(p, n, i, [.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [0, 0, -1]);
    addQuad(p, n, i, [.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [1, 0, 0]);
    addQuad(p, n, i, [-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-1, 0, 0]);
    return buildMesh(p, n, i);
  }

  function makeSphere(lat = 16, lon = 20) {
    const p = [], n = [], idx = [];
    for (let y = 0; y <= lat; y++) {
      const v = y / lat, phi = v * Math.PI;
      for (let x = 0; x <= lon; x++) {
        const u = x / lon, theta = u * Math.PI * 2;
        const sinP = Math.sin(phi);
        const px = Math.cos(theta) * sinP, py = Math.cos(phi), pz = Math.sin(theta) * sinP;
        p.push(px, py, pz); n.push(px, py, pz);
      }
    }
    for (let y = 0; y < lat; y++) for (let x = 0; x < lon; x++) {
      const a = y * (lon + 1) + x, b = a + lon + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    return buildMesh(p, n, idx);
  }

  function makeCylinder(seg = 18) {
    const p = [], n = [], idx = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
      p.push(x, -1, z, x, 1, z);
      n.push(x, 0, z, x, 0, z);
    }
    for (let k = 0; k < seg; k++) {
      const a = k * 2, b = a + 2;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const top = p.length / 3; p.push(0, 1, 0); n.push(0, 1, 0);
    const bot = p.length / 3; p.push(0, -1, 0); n.push(0, -1, 0);
    for (let k = 0; k < seg; k++) {
      idx.push(top, ((k + 1) % seg) * 2 + 1, k * 2 + 1);
      idx.push(bot, k * 2, ((k + 1) % seg) * 2);
    }
    return buildMesh(p, n, idx);
  }

  function makeCone(seg = 16) {
    const p = [], n = [], idx = [];
    const tip = 0; p.push(0, 1, 0); n.push(0, 1, 0);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
      p.push(x, -1, z); n.push(x, 0.5, z);
    }
    for (let k = 1; k <= seg; k++) {
      idx.push(tip, k + 1, k);
    }
    const bot = p.length / 3; p.push(0, -1, 0); n.push(0, -1, 0);
    for (let k = 1; k <= seg; k++) {
      idx.push(bot, k, k + 1);
    }
    return buildMesh(p, n, idx);
  }

  function makeChamferTile() {
    const p = [], n = [], idx = [];
    const b = 0.12, topY = 0.5, botY = -0.5;
    const ring = [[-.5+b, -.5], [.5-b, -.5], [.5, -.5+b], [.5, .5-b], [.5-b, .5], [-.5+b, .5], [-.5, .5-b], [-.5, -.5+b]];
    const topCenter = p.length / 3; p.push(0, topY, 0); n.push(0, 1, 0);
    const topStart = p.length / 3;
    for (const q of ring) { p.push(q[0], topY, q[1]); n.push(0, 1, 0); }
    for (let k = 0; k < 8; k++) idx.push(topCenter, topStart + (k + 1) % 8, topStart + k);
    const bevelBottom = ring.map(q => [q[0] * 1.03, topY - 0.18, q[1] * 1.03]);
    for (let k = 0; k < 8; k++) {
      const a = ring[k], bq = ring[(k + 1) % 8], c = bevelBottom[(k + 1) % 8], d = bevelBottom[k];
      const edge = norm3([a[0] + bq[0], 0.7, a[1] + bq[1]]);
      addQuad(p, n, idx, [a[0], topY, a[1]], [bq[0], topY, bq[1]], c, d, edge);
    }
    const sideBottom = bevelBottom.map(q => [q[0], botY, q[2]]);
    for (let k = 0; k < 8; k++) {
      const a = bevelBottom[k], bq = bevelBottom[(k + 1) % 8], c = sideBottom[(k + 1) % 8], d = sideBottom[k];
      addQuad(p, n, idx, a, bq, c, d, norm3([a[0] + bq[0], 0, a[2] + bq[2]]));
    }
    return buildMesh(p, n, idx);
  }

  const meshes = {
    box: makeBox(),
    sphere: makeSphere(),
    cylinder: makeCylinder(),
    cone: makeCone(),
    tile: makeChamferTile()
  };

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // --- 3D MATH UTILITIES ---
  function m4id() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
  function m4mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    }
    return o;
  }
  function m4t(x, y, z) { const m = m4id(); m[12]=x; m[13]=y; m[14]=z; return m; }
  function m4s(x, y, z) { const m = m4id(); m[0]=x; m[5]=y; m[10]=z; return m; }
  function m4rx(a) { const c=Math.cos(a), s=Math.sin(a), m=m4id(); m[5]=c; m[6]=s; m[9]=-s; m[10]=c; return m; }
  function m4ry(a) { const c=Math.cos(a), s=Math.sin(a), m=m4id(); m[0]=c; m[2]=-s; m[8]=s; m[10]=c; return m; }
  function m4rz(a) { const c=Math.cos(a), s=Math.sin(a), m=m4id(); m[0]=c; m[1]=s; m[4]=-s; m[5]=c; return m; }
  function trs(pos, rot = [0,0,0], scale = [1,1,1]) {
    let m = m4t(pos[0], pos[1], pos[2]);
    m = m4mul(m, m4ry(rot[1] || 0));
    m = m4mul(m, m4rx(rot[0] || 0));
    m = m4mul(m, m4rz(rot[2] || 0));
    return m4mul(m, m4s(scale[0], scale[1], scale[2]));
  }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  }
  function lookAt(eye, center, up = [0,1,0]) {
    const z = norm3([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]);
    const x = norm3(cross3(up, z));
    const y = cross3(z, x);
    const o = m4id();
    o[0]=x[0]; o[1]=y[0]; o[2]=z[0];
    o[4]=x[1]; o[5]=y[1]; o[6]=z[1];
    o[8]=x[2]; o[9]=y[2]; o[10]=z[2];
    o[12]=-dot3(x,eye); o[13]=-dot3(y,eye); o[14]=-dot3(z,eye);
    return o;
  }
  function invert4(a) {
    const out = new Float32Array(16);
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return m4id(); det = 1/det;
    out[0]=(a11*b11-a12*b10+a13*b09)*det; out[1]=(a02*b10-a01*b11-a03*b09)*det; out[2]=(a31*b05-a32*b04+a33*b03)*det; out[3]=(a22*b04-a21*b05-a23*b03)*det;
    out[4]=(a12*b08-a10*b11-a13*b07)*det; out[5]=(a00*b11-a02*b08+a03*b07)*det; out[6]=(a32*b02-a30*b05-a33*b01)*det; out[7]=(a20*b05-a22*b02+a23*b01)*det;
    out[8]=(a10*b10-a11*b08+a13*b06)*det; out[9]=(a01*b08-a00*b10-a03*b06)*det; out[10]=(a30*b04-a31*b02+a33*b00)*det; out[11]=(a21*b02-a20*b04-a23*b00)*det;
    out[12]=(a11*b07-a10*b09-a12*b06)*det; out[13]=(a00*b09-a01*b07+a02*b06)*det; out[14]=(a31*b01-a30*b03-a32*b00)*det; out[15]=(a20*b03-a21*b01+a22*b00)*det;
    return out;
  }
  function mulM4V4(m, v) {
    return [
      m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
      m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
      m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
      m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]
    ];
  }
  function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function len3(a) { return Math.hypot(a[0], a[1], a[2]); }
  function norm3(a) { const l = len3(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function drawMesh(mesh, model, color, material = 3, alpha = 1.0, seed = 0, emissive = 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
    gl.enableVertexAttribArray(uLoc.aPos);
    gl.vertexAttribPointer(uLoc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
    gl.enableVertexAttribArray(uLoc.aNormal);
    gl.vertexAttribPointer(uLoc.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.i);
    gl.uniformMatrix4fv(uLoc.uModel, false, model);
    gl.uniform3fv(uLoc.uBase, color);
    gl.uniform1f(uLoc.uMaterial, material);
    gl.uniform1f(uLoc.uAlpha, alpha);
    gl.uniform1f(uLoc.uSeed, seed);
    gl.uniform1f(uLoc.uEmissive, emissive);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  // --- GAME STATE & LOGIC ---
  const GameState = Object.freeze({
    MENU: 'MENU', ROUND_START: 'ROUND_START', TURN_WAIT: 'TURN_WAIT',
    RESOLVING: 'RESOLVING', BOMB_DETONATING: 'BOMB_DETONATING', ROUND_OVER: 'ROUND_OVER'
  });

  const game = {
    state: GameState.MENU,
    playerCount: 2,
    currentPlayer: 0,
    scores: [0, 0],
    round: 1,
    totalRounds: 10,
    rows: 5,
    cols: 5,
    bombIdx: 0,
    revealed: new Set(),
    hoveredIdx: -1,
    pendingIdx: -1,
    loser: null,
    animTime: 0,
    stateTime: 0,
    lastTime: performance.now(),
    particles: [],
    tiles: [],
    motionEnabled: true,
    particlesEnabled: true,
    light: { pos: [0, 5, 2.5], color: [1.0, 0.92, 0.75] },
    camera: {
      eye: [0, 6, 11], target: [0, 0.5, 0],
      shake: 0, fov: 38
    },
    viewProj: null,
    invViewProj: null,
    boardMetrics: null,
    hoverWorldPos: [0, 0.5, 0]
  };

  function updateBoardConfig() {
    const cfg = BOARD_GRID_MAP[game.playerCount] || [5, 5];
    game.rows = cfg[0]; game.cols = cfg[1];
    game.tiles = [];
    for (let i = 0; i < game.rows * game.cols; i++) {
      game.tiles.push({
        hover: 0, press: 0, reveal: 0,
        seed: Math.random() * 100
      });
    }
  }

  // Board bottom sits cleanly ON TOP of the stage pedestal (y = 0.15), never slicing through!
  function getBoardMetrics() {
    const maxDim = Math.max(game.cols, game.rows);
    const step = Math.min(0.92, 5.6 / maxDim);
    const size = step * 0.88;
    const w = step * game.cols;
    const d = step * game.rows;
    const isPortrait = window.innerHeight > window.innerWidth * 1.15;
    const bottomY = 0.15;
    const cy = bottomY + d * 0.5;
    return { step, size, w, d, bottomY, cy, z: 0.15, frontZ: 0.32, isPortrait };
  }

  function getTileWorld(idx) {
    const B = game.boardMetrics || getBoardMetrics();
    const c = idx % game.cols;
    const r = Math.floor(idx / game.cols);
    const x = (c - (game.cols - 1) / 2) * B.step;
    const y = B.cy - (r - (game.rows - 1) / 2) * B.step;
    return { x, y, z: B.frontZ, wx: x, wy: y, wz: B.frontZ };
  }

  function startRound(keepTurn = false) {
    game.revealed.clear();
    game.loser = null;
    game.hoveredIdx = -1;
    game.pendingIdx = -1;
    game.stateTime = 0;
    game.bombIdx = Math.floor(Math.random() * (game.rows * game.cols));
    if (!keepTurn) game.currentPlayer = (game.round - 1) % game.playerCount;
    game.state = GameState.ROUND_START;
    game.camera.shake = 0;
    updateBoardConfig();
    updateUI();
  }

  function startGame() {
    game.scores = Array(game.playerCount).fill(0);
    game.round = 1;
    game.currentPlayer = 0;
    document.getElementById('menuOverlay').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('resultCard').classList.remove('show');
    startRound(true);
  }

  function openMenu() {
    game.state = GameState.MENU;
    document.getElementById('resultCard').classList.remove('show');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('menuOverlay').classList.remove('hidden');
    updateUI();
  }

  // --- PARTICLE EMITTERS ---
  function emitParticle(p) {
    if (!game.particlesEnabled || game.particles.length > 200) return;
    game.particles.push(p);
  }
  function spawnSafeSparkles(idx) {
    const q = getTileWorld(idx);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.8 + Math.random() * 1.8;
      emitParticle({
        type: 'sparkle',
        x: q.wx, y: q.wy, z: q.wz + 0.1,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd + 0.8, vz: 0.8 + Math.random() * 1.5,
        life: 0.6 + Math.random() * 0.4, age: 0, size: 0.07 + Math.random() * 0.08,
        color: [0.2, 0.95, 0.5]
      });
    }
  }
  function spawnExplosion(idx) {
    const q = getTileWorld(idx);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 4.5;
      emitParticle({
        type: 'fire',
        x: q.wx, y: q.wy, z: q.wz + 0.2,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd + 1.2, vz: 2.0 + Math.random() * 3.5,
        life: 0.45 + Math.random() * 0.5, age: 0, size: 0.06 + Math.random() * 0.06,
        color: [1.0, 0.45, 0.05]
      });
    }
    for (let i = 0; i < 25; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 3.0;
      emitParticle({
        type: 'debris',
        x: q.wx + (Math.random() - 0.5) * 0.3, y: q.wy + (Math.random() - 0.5) * 0.3, z: q.wz + 0.15,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd + 1.4, vz: 1.5 + Math.random() * 2.8,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
        life: 1.4 + Math.random() * 0.6, age: 0, size: 0.08 + Math.random() * 0.12,
        color: [0.45, 0.42, 0.38]
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.4 + Math.random() * 1.2;
      emitParticle({
        type: 'smoke',
        x: q.wx, y: q.wy, z: q.wz + 0.2,
        vx: Math.cos(a) * spd, vy: 0.6 + Math.random() * 1.0, vz: 0.5 + Math.random() * 1.0,
        life: 1.5 + Math.random() * 1.0, age: 0, size: 0.25 + Math.random() * 0.25,
        color: [0.15, 0.18, 0.22]
      });
    }
  }
  function spawnConfetti() {
    for (let i = 0; i < 90; i++) {
      const x = (Math.random() - 0.5) * 8.0;
      const y = 4.0 + Math.random() * 3.0;
      const z = (Math.random() - 0.5) * 3.0;
      emitParticle({
        type: 'confetti',
        x, y, z,
        vx: (Math.random() - 0.5) * 1.8, vy: -0.8 - Math.random() * 1.4, vz: (Math.random() - 0.5) * 1.5,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 10,
        life: 2.5 + Math.random() * 1.5, age: 0, size: 0.07 + Math.random() * 0.06,
        color: PLAYER_RGB[Math.floor(Math.random() * PLAYER_RGB.length)]
      });
    }
  }

  // --- TILE INTERACTION ---
  function clickTile(idx) {
    if (game.state !== GameState.TURN_WAIT || idx < 0) return;
    if (game.revealed.has(idx)) {
      showToast('ช่องนี้เปิดไปแล้ว!');
      return;
    }
    game.pendingIdx = idx;
    game.state = GameState.RESOLVING;
    game.stateTime = 0;
    sounds.playClick();
  }

  function resolveSelectedTile() {
    const idx = game.pendingIdx;
    if (idx === game.bombIdx) {
      game.state = GameState.BOMB_DETONATING;
      game.stateTime = 0;
      game.loser = game.currentPlayer;
      sounds.playExplosion();
      spawnExplosion(idx);
      if (game.motionEnabled) game.camera.shake = 1.0;
    } else {
      game.revealed.add(idx);
      game.tiles[idx].reveal = 1.0;
      sounds.playSafe();
      spawnSafeSparkles(idx);
      game.currentPlayer = (game.currentPlayer + 1) % game.playerCount;
      game.pendingIdx = -1;
      game.state = GameState.TURN_WAIT;
      game.stateTime = 0;
      updateUI();
    }
  }

  function finishDetonation() {
    const loser = game.currentPlayer;
    game.loser = loser;
    for (let i = 0; i < game.playerCount; i++) {
      if (i !== loser) game.scores[i] = (game.scores[i] || 0) + 1;
    }
    game.state = GameState.ROUND_OVER;
    game.stateTime = 0;
    updateUI();

    const cfg = MASCOT_CONFIG[loser % MASCOT_CONFIG.length];
    const survivors = game.playerCount - 1;
    const isFinalRound = game.round >= game.totalRounds;
    document.getElementById('resultEmoji').textContent = isFinalRound ? '🏆' : '💥';
    document.getElementById('resultTitle').textContent = isFinalRound ? 'จบการแข่งขันแล้ว!' : `ผู้เล่น ${loser + 1} (${cfg.name}) โดนระเบิดตูม!`;

    let desc = `${cfg.emoji} ผู้เล่น ${loser + 1} (${cfg.name}) พลาดเหยียบระเบิด! ${survivors === 1 ? 'ผู้เล่นอีกคนชนะในรอบนี้' : `ผู้เล่นอื่นทั้ง ${survivors} คนชนะในรอบนี้`}`;
    if (isFinalRound) {
      const maxScore = Math.max(...game.scores);
      const winners = [];
      game.scores.forEach((s, i) => {
        if (s === maxScore) winners.push(`${MASCOT_CONFIG[i % MASCOT_CONFIG.length].emoji} ผู้เล่น ${i + 1} (${MASCOT_CONFIG[i % MASCOT_CONFIG.length].name})`);
      });
      desc += ` 🥇 แชมเปี้ยน: ${winners.join(' และ ')} ชนะไปทั้งหมด ${maxScore} รอบ!`;
      sounds.playVictory();
      spawnConfetti();
    }
    document.getElementById('resultDesc').textContent = desc;
    document.getElementById('nextRoundBtn').textContent = isFinalRound ? 'เล่นอีกครั้ง 🔄' : 'รอบต่อไป ➔';
    document.getElementById('resultCard').classList.add('show');
  }

  function advanceRound() {
    document.getElementById('resultCard').classList.remove('show');
    if (game.round >= game.totalRounds) {
      game.scores = Array(game.playerCount).fill(0);
      game.round = 1;
    } else {
      game.round++;
    }
    startRound();
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 900);
  }

  // --- UI UPDATES ---
  function updateUI() {
    const p = game.currentPlayer;
    const cfg = MASCOT_CONFIG[p % MASCOT_CONFIG.length];
    const turnBanner = document.getElementById('turnBanner');
    const turnPlayerName = document.getElementById('turnPlayerName');
    const turnAvatarEmoji = document.getElementById('turnAvatarEmoji');

    turnBanner.style.setProperty('--pColor', cfg.color);
    turnPlayerName.textContent = `ผู้เล่น ${p + 1} (${cfg.name})`;
    turnAvatarEmoji.textContent = cfg.emoji;

    document.getElementById('roundLabel').textContent = `${game.round} / ${game.totalRounds}`;

    const totalTiles = game.rows * game.cols;
    const remaining = totalTiles - game.revealed.size;
    const oddsPercent = ((1 / remaining) * 100).toFixed(1);
    document.getElementById('tensionLabel').textContent = `1 ใน ${remaining} (${oddsPercent}%)`;
    const fillPercent = Math.min(100, Math.max(6, (1 / remaining) * 100 * 2.2));
    document.getElementById('tensionFill').style.width = `${fillPercent}%`;

    if (oddsPercent > 20 && game.state === GameState.TURN_WAIT) {
      sounds.playHeartbeat();
    }

    renderPlayerStrip();
  }

  // Site-side addition to the lift, kept here because no other file can reach this template: the one
  // markup-by-string sink on this route escapes the only text-valued hole it interpolates, so a seat
  // label can never be parsed as markup even after a later stage feeds real names into the strip.
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderPlayerStrip() {
    const strip = document.getElementById('playerStrip');
    strip.innerHTML = '';
    for (let i = 0; i < game.playerCount; i++) {
      const cfg = MASCOT_CONFIG[i % MASCOT_CONFIG.length];
      const card = document.createElement('div');
      const isActive = i === game.currentPlayer && game.state !== GameState.MENU && game.state !== GameState.ROUND_OVER;
      const isLoser = game.state === GameState.ROUND_OVER && game.loser === i;
      card.className = 'playerCard' + (isActive ? ' active' : '') + (isLoser ? ' loser' : '');
      card.style.setProperty('--pColor', cfg.color);
      card.innerHTML = `
        <div class="avatarBadge">${cfg.emoji}</div>
        <div class="pInfo">
          <div class="pName">P${i + 1} ${escapeHtml(cfg.name)}</div>
          <div class="pScore">ชนะ: <strong>${game.scores[i] || 0}</strong></div>
        </div>
      `;
      strip.appendChild(card);
    }
  }

  // --- 3D RENDERING ---
  function drawShadow(x, y, z, sx, sz, alpha = 0.22) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawMesh(meshes.sphere, trs([x, y + 0.015, z], [0,0,0], [sx, 0.015, sz]), [0.03, 0.05, 0.08], 6, alpha);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // Floating Island Pedestal (Clean, no giant grey rocks, sits below the board)
  function renderEnvironment() {
    const t = game.animTime;
    const B = game.boardMetrics || getBoardMetrics();
    const stageR = Math.max(B.w * 0.5 + 2.2, 4.8);

    // Stone Pedestal with green grass top at y = 0.0, extending down to y = -1.2
    drawMesh(meshes.cylinder, trs([0, -0.6, 0.0], [0,0,0], [stageR, 0.6, stageR]), [0.22, 0.25, 0.26], 0, 1.0, 4);
    drawMesh(meshes.cylinder, trs([0, -0.04, 0.0], [0,0,0], [stageR + 0.1, 0.08, stageR + 0.1]), [0.24, 0.42, 0.22], 3, 1.0, 5);

    // Decorative side pillars with torches (safely placed behind mascots on far left/right)
    const pillarX = B.w * 0.5 + 2.0;
    for (let side of [-1, 1]) {
      const px = side * pillarX, pz = -0.6;
      drawMesh(meshes.cylinder, trs([px, 0.75, pz], [0,0,0], [0.32, 0.75, 0.32]), [0.35, 0.38, 0.40], 0, 1.0, px);
      drawMesh(meshes.cylinder, trs([px, 1.55, pz], [0,0,0], [0.42, 0.08, 0.42]), [0.65, 0.52, 0.25], 1, 1.0);
      const flameFlicker = Math.sin(t * 12.0 + px) * 0.06;
      drawMesh(meshes.sphere, trs([px, 1.78 + flameFlicker, pz], [0,0,0], [0.18, 0.26, 0.18]), [1.0, 0.6, 0.1], 6, 0.9, 0, 2.0);
    }
  }

  function renderTiles() {
    const B = game.boardMetrics;
    const pending = game.pendingIdx;

    // Board Base Slab - sits on top of the stage
    drawMesh(meshes.box, trs([0, B.cy, B.z - 0.08], [0,0,0], [B.w + 0.45, B.d + 0.45, 0.15]), [0.28, 0.30, 0.32], 0, 1.0, 12);
    drawMesh(meshes.box, trs([0, B.cy, B.z + 0.04], [0,0,0], [B.w + 0.2, B.d + 0.2, 0.04]), [0.15, 0.18, 0.22], 6, 1.0, 14);

    for (let i = 0; i < game.tiles.length; i++) {
      const q = getTileWorld(i);
      const tile = game.tiles[i];
      const revealed = game.revealed.has(i);
      const isHovered = i === game.hoveredIdx && game.state === GameState.TURN_WAIT && !revealed;

      tile.hover = lerp(tile.hover, isHovered ? 1.0 : 0.0, 0.25);
      let depth = B.frontZ + tile.hover * 0.05;
      let scale = 1.0;
      let tiltX = 0, tiltY = 0;

      if (game.state === GameState.RESOLVING && i === pending) {
        const u = clamp(game.stateTime / 0.4, 0, 1);
        depth -= Math.sin(u * Math.PI) * 0.08;
        scale = 1.0 - 0.05 * Math.sin(u * Math.PI);
      }
      if (revealed) depth = B.frontZ - 0.04;

      const remaining = (game.rows * game.cols) - game.revealed.size;
      if (!revealed && remaining <= 4 && game.state === GameState.TURN_WAIT) {
        tiltX += Math.sin(game.animTime * 28.0 + i) * 0.02;
        tiltY += Math.cos(game.animTime * 24.0 + i) * 0.02;
      }

      drawShadow(q.wx, q.wy - B.size * 0.45, depth - 0.1, B.size * 0.45, B.size * 0.45, 0.12 + tile.hover * 0.08);

      const stoneCol = [0.65, 0.68, 0.72];
      const safeCol = [0.28, 0.78, 0.48];
      const hoverCol = [0.88, 0.78, 0.45];
      let col = revealed ? safeCol : stoneCol;
      if (tile.hover > 0.01 && !revealed) {
        col = [
          lerp(stoneCol[0], hoverCol[0], tile.hover * 0.6),
          lerp(stoneCol[1], hoverCol[1], tile.hover * 0.6),
          lerp(stoneCol[2], hoverCol[2], tile.hover * 0.6)
        ];
      }

      drawMesh(meshes.tile, trs([q.wx, q.wy, depth], [Math.PI/2 + tiltX, tiltY, 0], [B.size * scale, 0.08, B.size * scale]),
        col, revealed ? 2 : 0, 1.0, tile.seed, tile.hover * 0.25);

      if (revealed) {
        const gemSpin = game.animTime * 1.5 + i;
        drawMesh(meshes.sphere, trs([q.wx, q.wy, depth + 0.06], [gemSpin, gemSpin * 0.7, 0], [B.size * 0.22, B.size * 0.22, B.size * 0.22]),
          [0.3, 0.95, 0.6], 2, 1.0, i, 0.8);
      }
    }

    if (game.state === GameState.BOMB_DETONATING || game.state === GameState.ROUND_OVER) {
      renderBomb3D(game.bombIdx);
    }
  }

  function renderBomb3D(idx) {
    const q = getTileWorld(idx);
    const u = game.state === GameState.BOMB_DETONATING ? clamp(game.stateTime / 1.0, 0, 1) : 1;
    const pop = Math.sin(Math.min(u, 1) * Math.PI);
    const bz = q.wz + 0.32 + pop * 0.4;
    const by = q.wy + pop * 0.15;

    drawMesh(meshes.sphere, trs([q.wx, by, bz], [0, game.animTime * 0.8, 0], [0.35, 0.35, 0.35]), [0.08, 0.09, 0.11], 4, 1.0, 0, 0.1);
    drawMesh(meshes.cylinder, trs([q.wx + 0.12, by + 0.28, bz], [0, 0, -0.55], [0.06, 0.16, 0.06]), [0.7, 0.5, 0.2], 1, 1.0);
    const sparkAlpha = game.state === GameState.BOMB_DETONATING ? Math.max(0, 1 - game.stateTime * 0.8) : 0.8;
    drawMesh(meshes.sphere, trs([q.wx + 0.24, by + 0.38, bz], [0, 0, 0], [0.1, 0.1, 0.1]), [1.0, 0.5, 0.05], 6, sparkAlpha, 0, 3.0);
  }

  // --- ADORABLE PROCEDURAL MASCOT CREATURES ---
  function renderCuteMascot(playerIdx, slotSide, isMenu = false) {
    const B = game.boardMetrics;
    const cfg = MASCOT_CONFIG[playerIdx % MASCOT_CONFIG.length];
    const side = slotSide === 0 ? -1 : 1;
    const isPortrait = B.isPortrait;
    let s = isPortrait ? 0.72 : 0.92;
    if (isMenu) s = 1.15;

    let mx = isPortrait ? side * (B.w * 0.5 + 0.75) : side * (B.w * 0.5 + 0.95);
    let mz = 0.65;
    if (isMenu) { mx = side * (isPortrait ? 1.8 : 3.0); mz = 1.0; }

    const isActive = !isMenu && game.currentPlayer === playerIdx && game.state === GameState.TURN_WAIT;
    const isLoser = game.state === GameState.ROUND_OVER && game.loser === playerIdx;
    const isDetonating = game.state === GameState.BOMB_DETONATING && game.currentPlayer === playerIdx;
    const isWinner = game.state === GameState.ROUND_OVER && game.loser !== null && game.loser !== playerIdx;

    // Bouncy Squash & Stretch Animation
    const bounceT = game.animTime * 3.4 + playerIdx * 1.4;
    const squash = game.motionEnabled ? (1.0 + Math.sin(bounceT) * (isActive ? 0.08 : 0.04)) : 1.0;
    let rootY = game.motionEnabled ? Math.abs(Math.sin(bounceT)) * (isActive ? 0.08 : 0.03) : 0;

    // Blasted Airborne Ragdoll Launch
    if (isDetonating) {
      const u = clamp(game.stateTime / 1.0, 0, 1);
      rootY += Math.sin(u * Math.PI) * 2.5;
      mx += side * Math.sin(u * Math.PI) * 0.9;
    }

    const mainCol = isLoser ? [0.35, 0.35, 0.38] : PLAYER_RGB[playerIdx % PLAYER_RGB.length];
    const bellyCol = isLoser ? [0.45, 0.45, 0.48] : cfg.belly;
    const blushCol = cfg.blush;

    // Contact Soft Shadow on ground
    drawShadow(mx, 0, mz, 0.52 * s / squash, 0.38 * s / squash, isActive ? 0.38 : 0.22);

    // 3D Inquisitive Head / Body Tracking
    let headRotY = side < 0 ? -0.32 : 0.32;
    let headTiltZ = 0;
    if (game.hoveredIdx >= 0 && !isMenu) {
      const hPos = getTileWorld(game.hoveredIdx);
      const angleToTile = Math.atan2(hPos.wx - mx, hPos.wz - mz);
      headRotY = angleToTile * 0.55;
      headTiltZ = side * 0.08;
    }

    const bodyCenter = [mx, rootY + 0.65 * s * squash, mz];
    const bodyScale = [0.52 * s / Math.sqrt(squash), 0.58 * s * squash, 0.48 * s / Math.sqrt(squash)];

    // 1. CHUBBY SQUISHY MAIN BODY
    drawMesh(meshes.sphere, trs(bodyCenter, [0, headRotY * 0.5, headTiltZ], bodyScale), mainCol, 3, 1.0, playerIdx);

    // 2. SOFT ROUND TUMMY BELLY PATCH
    drawMesh(meshes.sphere, trs([mx, rootY + 0.55 * s * squash, mz + 0.18 * s], [0, headRotY * 0.5, headTiltZ], [0.38 * s, 0.42 * s, 0.24 * s]), bellyCol, 3);

    // 3. KAWAII GLOSSY EYES WITH DOUBLE SHINE SPARKLES
    const eyeY = rootY + 0.72 * s * squash;
    const eyeZ = mz + 0.40 * s;
    for (let ex of [-0.15, 0.15]) {
      const eyePos = [mx + ex * s, eyeY, eyeZ];
      if (isLoser) {
        // Dizzy Cartoon Cross Eyes (😵)
        drawMesh(meshes.box, trs([eyePos[0], eyePos[1], eyePos[2]], [0, 0, Math.PI/4], [0.09 * s, 0.02 * s, 0.02 * s]), [0.15, 0.15, 0.18], 4);
        drawMesh(meshes.box, trs([eyePos[0], eyePos[1], eyePos[2]], [0, 0, -Math.PI/4], [0.09 * s, 0.02 * s, 0.02 * s]), [0.15, 0.15, 0.18], 4);
      } else {
        // Big Shiny Kawaii Eye
        drawMesh(meshes.sphere, trs(eyePos, [0, 0, 0], [0.075 * s, 0.095 * s, 0.045 * s]), [0.08, 0.1, 0.14], 4);
        // Primary Eye Shine ✨
        drawMesh(meshes.sphere, trs([eyePos[0] + 0.024 * s, eyePos[1] + 0.028 * s, eyePos[2] + 0.035 * s], [0, 0, 0], [0.03 * s, 0.03 * s, 0.015 * s]), [1.0, 1.0, 1.0], 6, 1.0, 0, 1.2);
        // Secondary Tiny Twinkle ✨
        drawMesh(meshes.sphere, trs([eyePos[0] - 0.02 * s, eyePos[1] - 0.025 * s, eyePos[2] + 0.035 * s], [0, 0, 0], [0.016 * s, 0.016 * s, 0.012 * s]), [1.0, 1.0, 1.0], 6, 1.0, 0, 0.8);
      }

      // Rosy Blushing Cheeks
      if (!isLoser) {
        drawMesh(meshes.sphere, trs([mx + (ex * 1.55) * s, eyeY - 0.09 * s, eyeZ - 0.04 * s], [0, 0, 0], [0.075 * s, 0.04 * s, 0.025 * s]), blushCol, 3);
      }
    }

    // 4. SPECIES-SPECIFIC ADORABLE FEATURES (Ears / Beaks / Snouts / Wings)
    const headTop = rootY + (0.92 * s * squash);
    const mType = cfg.type;

    if (mType === 'cat') { // 🐱 Cat Ears & Pink Nose
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.cone, trs([mx + sgn * 0.22 * s, headTop + 0.12 * s, mz], [0.1, 0, -sgn * 0.22], [0.12 * s, 0.2 * s, 0.1 * s]), mainCol, 3);
        drawMesh(meshes.cone, trs([mx + sgn * 0.22 * s, headTop + 0.12 * s, mz + 0.02 * s], [0.1, 0, -sgn * 0.22], [0.07 * s, 0.14 * s, 0.05 * s]), [1.0, 0.65, 0.75], 3);
      }
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.04 * s, eyeZ + 0.04 * s], [0, 0, 0], [0.035 * s, 0.028 * s, 0.03 * s]), [1.0, 0.5, 0.6], 3);
    } else if (mType === 'penguin') { // 🐧 Orange Beak & Flippers
      drawMesh(meshes.cone, trs([mx, eyeY - 0.03 * s, eyeZ + 0.08 * s], [Math.PI/2, 0, 0], [0.065 * s, 0.14 * s, 0.05 * s]), [1.0, 0.55, 0.05], 3);
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.sphere, trs([mx + sgn * 0.42 * s, rootY + 0.52 * s, mz], [0, 0, sgn * 0.5], [0.08 * s, 0.24 * s, 0.14 * s]), [0.08, 0.12, 0.18], 3);
      }
    } else if (mType === 'bunny') { // 🐰 Long Floppy Bunny Ears
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.cylinder, trs([mx + sgn * 0.16 * s, headTop + 0.28 * s, mz], [0.1, 0, -sgn * 0.15], [0.065 * s, 0.28 * s, 0.04 * s]), mainCol, 3);
        drawMesh(meshes.cylinder, trs([mx + sgn * 0.16 * s, headTop + 0.28 * s, mz + 0.02 * s], [0.1, 0, -sgn * 0.15], [0.035 * s, 0.22 * s, 0.02 * s]), [1.0, 0.7, 0.8], 3);
      }
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.03 * s, eyeZ + 0.04 * s], [0, 0, 0], [0.032 * s, 0.028 * s, 0.028 * s]), [1.0, 0.5, 0.65], 3);
    } else if (mType === 'froggy') { // 🐸 Bulbous Frog Eyes on Top
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.sphere, trs([mx + sgn * 0.24 * s, headTop + 0.06 * s, mz + 0.08 * s], [0, 0, 0], [0.13 * s, 0.13 * s, 0.13 * s]), mainCol, 3);
      }
    } else if (mType === 'bear') { // 🐻 Round Bear Ears & Snout
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.sphere, trs([mx + sgn * 0.28 * s, headTop + 0.08 * s, mz], [0, 0, 0], [0.12 * s, 0.12 * s, 0.08 * s]), mainCol, 3);
        drawMesh(meshes.sphere, trs([mx + sgn * 0.28 * s, headTop + 0.08 * s, mz + 0.03 * s], [0, 0, 0], [0.06 * s, 0.06 * s, 0.04 * s]), [0.3, 0.2, 0.4], 3);
      }
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.04 * s, eyeZ + 0.03 * s], [0, 0, 0], [0.1 * s, 0.08 * s, 0.08 * s]), bellyCol, 3);
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.02 * s, eyeZ + 0.09 * s], [0, 0, 0], [0.035 * s, 0.025 * s, 0.025 * s]), [0.12, 0.12, 0.15], 4);
    } else if (mType === 'chick') { // 🐥 Tiny Beak & Head Feather Tufts
      drawMesh(meshes.cone, trs([mx, eyeY - 0.03 * s, eyeZ + 0.06 * s], [Math.PI/2, 0, 0], [0.055 * s, 0.11 * s, 0.045 * s]), [1.0, 0.55, 0.05], 3);
      drawMesh(meshes.cone, trs([mx, headTop + 0.12 * s, mz], [0.15, 0, 0], [0.04 * s, 0.14 * s, 0.04 * s]), [1.0, 0.85, 0.1], 3);
      drawMesh(meshes.cone, trs([mx + 0.05 * s, headTop + 0.10 * s, mz], [0.1, 0, 0.25], [0.03 * s, 0.11 * s, 0.03 * s]), [1.0, 0.85, 0.1], 3);
    } else if (mType === 'panda') { // 🐼 Black Ears & Panda Eye Patches
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.sphere, trs([mx + sgn * 0.28 * s, headTop + 0.08 * s, mz], [0, 0, 0], [0.11 * s, 0.11 * s, 0.08 * s]), [0.12, 0.14, 0.18], 3);
      }
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.04 * s, eyeZ + 0.03 * s], [0, 0, 0], [0.09 * s, 0.07 * s, 0.07 * s]), [1.0, 1.0, 1.0], 3);
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.02 * s, eyeZ + 0.08 * s], [0, 0, 0], [0.035 * s, 0.025 * s, 0.025 * s]), [0.12, 0.12, 0.15], 4);
    } else if (mType === 'piggy') { // 🐷 Oval Snout with Nostrils
      drawMesh(meshes.cylinder, trs([mx, eyeY - 0.05 * s, eyeZ + 0.04 * s], [Math.PI/2, 0, 0], [0.08 * s, 0.03 * s, 0.06 * s]), [1.0, 0.55, 0.7], 3);
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.sphere, trs([mx + sgn * 0.03 * s, eyeY - 0.05 * s, eyeZ + 0.075 * s], [0, 0, 0], [0.014 * s, 0.018 * s, 0.01 * s]), [0.4, 0.15, 0.25], 4);
        drawMesh(meshes.cone, trs([mx + sgn * 0.24 * s, headTop + 0.06 * s, mz], [0.4, 0, -sgn * 0.3], [0.08 * s, 0.16 * s, 0.06 * s]), mainCol, 3);
      }
    } else if (mType === 'shiba') { // 🦊 Shiba / Fox Snout & Ears
      for (let sgn of [-1, 1]) {
        drawMesh(meshes.cone, trs([mx + sgn * 0.22 * s, headTop + 0.14 * s, mz], [0.1, 0, -sgn * 0.25], [0.11 * s, 0.22 * s, 0.09 * s]), mainCol, 3);
        drawMesh(meshes.cone, trs([mx + sgn * 0.22 * s, headTop + 0.12 * s, mz + 0.02 * s], [0.1, 0, -sgn * 0.25], [0.06 * s, 0.14 * s, 0.05 * s]), [1.0, 0.95, 0.9], 3);
      }
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.05 * s, eyeZ + 0.06 * s], [0, 0, 0], [0.1 * s, 0.08 * s, 0.09 * s]), bellyCol, 3);
      drawMesh(meshes.sphere, trs([mx, eyeY - 0.03 * s, eyeZ + 0.13 * s], [0, 0, 0], [0.035 * s, 0.028 * s, 0.03 * s]), [0.12, 0.12, 0.15], 4);
    } else { // 🌟 Star Slime Antenna
      const starBob = Math.sin(game.animTime * 6.0) * 0.04;
      drawMesh(meshes.cylinder, trs([mx, headTop + 0.12 * s + starBob, mz], [0, 0, 0], [0.02 * s, 0.14 * s, 0.02 * s]), [0.9, 0.8, 0.3], 1);
      drawMesh(meshes.sphere, trs([mx, headTop + 0.24 * s + starBob, mz], [0, 0, 0], [0.08 * s, 0.08 * s, 0.08 * s]), [1.0, 0.85, 0.1], 6, 1.0, 0, 1.8);
    }

    // 5. STUBBY CUTE FEET & FRONT PAWS
    const footY = 0.08;
    for (let sgn of [-1, 1]) {
      drawMesh(meshes.sphere, trs([mx + sgn * 0.2 * s, footY, mz + 0.06 * s], [0, 0, 0], [0.13 * s, 0.08 * s, 0.17 * s]), mainCol, 3);
    }

    // Cute chubby front paws
    const handLift = isWinner ? 0.35 : (isActive ? 0.12 : 0);
    for (let sgn of [-1, 1]) {
      const pawPos = [mx + sgn * 0.28 * s, rootY + (0.52 + handLift) * s * squash, mz + 0.24 * s];
      drawMesh(meshes.sphere, trs(pawPos, [0, 0, 0], [0.1 * s, 0.1 * s, 0.1 * s]), mainCol, 3);
    }

    // Glowing turn indicator halo on floor
    if (isActive) {
      drawShadow(mx, 0, mz, 0.65 * s, 0.65 * s, 0.45);
    }
  }

  function renderParticles() {
    for (const p of game.particles) {
      const u = p.age / p.life;
      const alpha = Math.max(0, 1 - u);
      if (p.type === 'debris') {
        drawMesh(meshes.tile, trs([p.x, p.y, p.z], [p.rot, p.rot * 0.7, 0], [p.size, p.size, p.size]), p.color, 0, alpha);
      } else if (p.type === 'confetti') {
        drawMesh(meshes.box, trs([p.x, p.y, p.z], [p.rot, p.rot * 0.5, 0], [p.size, p.size * 0.5, 0.01]), p.color, 6, alpha, 0, 0.8);
      } else {
        drawMesh(meshes.sphere, trs([p.x, p.y, p.z], [0, 0, 0], [p.size, p.size, p.size]), p.color, 6, alpha, 0, 2.0);
      }
    }
  }

  // --- CAMERA & SCENE RENDER PIPELINE ---
  // gh#212-recorded divergence. The HUD's top band -- tools, player strip, turn banner, odds pill --
  // is taller than its bottom one, so centring the board in the whole viewport puts the board's top
  // edge under the turn banner. How bad that is depends on the roster: BOARD_GRID_MAP grows the board
  // with the player count while the vertical fit below adds a CONSTANT world margin, so a 9x9 board
  // reaches higher up the screen than a 5x5 one. Measured at 1440x900: the board's topmost rendered
  // row was 119 at five-by-five and 104 at nine-by-nine, against a banner bottom edge of 123.
  //
  // The bands are MEASURED, never assumed, because the banner wraps to three lines on a narrow screen
  // and that changes the top band's height by tens of px. (An earlier version of this comment blamed
  // the player strip: it is a single `overflow-x: auto` row, so its height does NOT move with the
  // roster. The wrap is the variable.) But getBoundingClientRect forces layout and setupCamera runs
  // every frame, so the reading is cached.
  //
  // ponytail: refreshed on resize and then every 30th camera setup, roughly twice a second, rather
  // than hooked to each state transition that can change the strip. The ceiling is that a roster
  // change can render with a band reading up to half a second stale, which shifts the board by a few
  // px for that moment and then self-corrects. If that ever shows, the upgrade is to call
  // measureHudBands from the round-start path instead of ageing it here.
  let hudBandPx = { top: 0, bottom: 0 };
  let hudBandAge = 0;
  function measureHudBands() {
    const topEl = document.querySelector('.topSection');
    const bottomEl = document.querySelector('.bottomBar');
    const viewportH = window.innerHeight;
    hudBandPx = {
      top: topEl ? topEl.getBoundingClientRect().bottom : 0,
      bottom: bottomEl ? viewportH - bottomEl.getBoundingClientRect().top : 0,
    };
  }

  function setupCamera() {
    const B = game.boardMetrics || getBoardMetrics();
    const isPortrait = B.isPortrait;
    let eye, target, fov;

    if (game.state === GameState.MENU) {
      eye = isPortrait ? [0, 5.5, 12.0] : [0, 4.8, 10.0];
      target = [0, 1.8, 0];
      fov = isPortrait ? 44 : 38;
      if (game.motionEnabled) {
        eye[0] += Math.sin(game.animTime * 0.4) * 0.4;
      }
    } else {
      fov = isPortrait ? 42 : 36;
      const aspect = Math.max(0.35, window.innerWidth / window.innerHeight);
      const tanHalf = Math.tan((fov * Math.PI) / 360);
      const requiredW = isPortrait ? (B.w * 0.5 + 0.6) : (B.w * 0.5 + 2.0);
      const requiredH = (B.d * 0.5 + 1.2);
      const distW = requiredW / (tanHalf * aspect);
      const distH = requiredH / tanHalf;
      const dist = Math.max(isPortrait ? 11.0 : 9.5, distW, distH);

      // Centre the board in the space the HUD actually leaves free, not in the whole viewport.
      // Raising the look-at point in world Y moves the board DOWN on screen by the same amount, so
      // half the band imbalance splits the free space evenly between top and bottom. worldPerPx
      // converts at the board's own distance, which is why this keeps holding as `dist` grows with
      // the board instead of needing a per-roster number.
      if (hudBandAge++ % 30 === 0) measureHudBands();
      const worldPerPx = (2 * dist * tanHalf) / Math.max(1, window.innerHeight);
      const viewY = B.cy + (hudBandPx.top - hudBandPx.bottom) * 0.5 * worldPerPx;

      let shakeX = 0, shakeY = 0;
      if (game.camera.shake > 0.01 && game.motionEnabled) {
        shakeX = (Math.random() - 0.5) * game.camera.shake * 0.7;
        shakeY = (Math.random() - 0.5) * game.camera.shake * 0.7;
      }
      eye = [shakeX, viewY + shakeY + 0.2, dist];
      target = [shakeX, viewY + shakeY, B.z];
    }

    game.camera.eye = eye; game.camera.target = target;
    const view = lookAt(eye, target);
    const proj = perspective((fov * Math.PI) / 180, window.innerWidth / window.innerHeight, 0.1, 80);
    game.viewProj = m4mul(proj, view);
    game.invViewProj = invert4(game.viewProj);
  }

  function renderScene() {
    game.boardMetrics = getBoardMetrics();
    setupCamera();

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.04, 0.07, 0.11, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(uLoc.uViewProj, false, game.viewProj);
    gl.uniform3fv(uLoc.uCamera, game.camera.eye);
    gl.uniform3fv(uLoc.uLightPos, game.light.pos);
    gl.uniform3fv(uLoc.uLightColor, game.light.color);

    // 1. SOLID OPAQUE PASS
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    renderEnvironment();

    if (game.state === GameState.MENU) {
      renderCuteMascot(0, 0, true);
      renderCuteMascot(1, 1, true);
    } else {
      renderTiles();
      const nextP = (game.currentPlayer + 1) % game.playerCount;
      renderCuteMascot(game.currentPlayer, 0, false);
      if (game.playerCount > 1) renderCuteMascot(nextP, 1, false);
    }

    // 2. TRANSPARENT PARTICLE PASS
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    renderParticles();

    gl.depthMask(true);
  }

  // --- RAYCASTING FOR 3D TILE SELECTION ---
  function getRay(screenX, screenY) {
    if (!game.invViewProj) return null;
    const nx = (screenX / window.innerWidth) * 2 - 1;
    const ny = 1 - (screenY / window.innerHeight) * 2;
    let a = mulM4V4(game.invViewProj, [nx, ny, -1, 1]);
    let b = mulM4V4(game.invViewProj, [nx, ny, 1, 1]);
    a = [a[0]/a[3], a[1]/a[3], a[2]/a[3]];
    b = [b[0]/b[3], b[1]/b[3], b[2]/b[3]];
    return { o: a, d: norm3([b[0]-a[0], b[1]-a[1], b[2]-a[2]]) };
  }

  function raycastTile(screenX, screenY) {
    if (game.state === GameState.MENU) return -1;
    const ray = getRay(screenX, screenY);
    if (!ray || Math.abs(ray.d[2]) < 1e-5) return -1;
    const B = game.boardMetrics;
    const planeZ = B.frontZ + 0.05;
    const t = (planeZ - ray.o[2]) / ray.d[2];
    if (t < 0) return -1;

    const px = ray.o[0] + ray.d[0] * t;
    const py = ray.o[1] + ray.d[1] * t;
    game.hoverWorldPos = [px, py, planeZ];

    const c = Math.floor((px + B.w / 2) / B.step);
    const r = Math.floor((B.cy + B.d / 2 - py) / B.step);
    if (c < 0 || c >= game.cols || r < 0 || r >= game.rows) return -1;

    const idx = r * game.cols + c;
    const q = getTileWorld(idx);
    if (Math.abs(px - q.wx) > B.size * 0.52 || Math.abs(py - q.wy) > B.size * 0.52) return -1;
    return idx;
  }

  // --- GAME TICK & MAIN LOOP ---
  function update(dt) {
    game.animTime += dt;
    game.stateTime += dt;

    if (game.state === GameState.ROUND_START && game.stateTime > 0.4) {
      game.state = GameState.TURN_WAIT;
      game.stateTime = 0;
      updateUI();
    }
    if (game.state === GameState.RESOLVING && game.stateTime >= 0.42) {
      resolveSelectedTile();
    }
    if (game.state === GameState.BOMB_DETONATING && game.stateTime > 1.3) {
      finishDetonation();
    }

    if (game.camera.shake > 0) {
      game.camera.shake = Math.max(0, game.camera.shake - dt * 2.2);
    }

    // Atmospheric embers
    if (game.particlesEnabled && Math.random() < 0.25 && game.particles.length < 180) {
      emitParticle({
        type: 'mote',
        x: (Math.random() - 0.5) * 10.0,
        y: 0.2 + Math.random() * 4.0,
        z: (Math.random() - 0.5) * 6.0,
        vx: (Math.random() - 0.5) * 0.25,
        vy: 0.1 + Math.random() * 0.2,
        vz: (Math.random() - 0.5) * 0.25,
        life: 3.5 + Math.random() * 2.0,
        age: 0,
        size: 0.035 + Math.random() * 0.035,
        color: [1.0, 0.85, 0.45]
      });
    }

    // Update Particles
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.age += dt;
      if (p.age >= p.life) { game.particles.splice(i, 1); continue; }
      if (p.type === 'mote') {
        p.vx += Math.sin(game.animTime * 1.8 + p.y * 2.0) * 0.008;
        p.vz += Math.cos(game.animTime * 1.8 + p.x * 2.0) * 0.008;
      } else if (p.type === 'smoke') {
        p.vx *= 0.96; p.vz *= 0.96; p.vy += 0.2 * dt; p.size += 0.15 * dt;
      } else {
        p.vy -= 4.2 * dt; p.vx *= 0.98; p.vz *= 0.98;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
  }

  function loop(now) {
    const dt = clamp((now - game.lastTime) / 1000, 0, 0.033);
    game.lastTime = now;
    update(dt);
    renderScene();
    requestAnimationFrame(loop);
  }

  function handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    game.boardMetrics = getBoardMetrics();
    // A resize changes both bands and the viewport they are measured against, so re-read now rather
    // than waiting for the ageing counter in setupCamera to come round.
    measureHudBands();
  }

  // --- EVENT LISTENERS & SETUP ---
  canvas.addEventListener('pointermove', e => {
    const prev = game.hoveredIdx;
    game.hoveredIdx = raycastTile(e.clientX, e.clientY);
    if (game.hoveredIdx >= 0 && game.hoveredIdx !== prev && !game.revealed.has(game.hoveredIdx)) {
      sounds.playHover();
    }
  });
  canvas.addEventListener('pointerleave', () => { game.hoveredIdx = -1; });
  canvas.addEventListener('pointerdown', e => {
    sounds.resume();
    if (game.state !== GameState.TURN_WAIT) return;
    const idx = raycastTile(e.clientX, e.clientY);
    if (idx >= 0) { e.preventDefault(); clickTile(idx); }
  });

  function setPlayerCount(n) {
    game.playerCount = clamp(n, 2, 10);
    updateBoardConfig();
    document.getElementById('playerCountVal').textContent = game.playerCount;
    document.getElementById('playerMinus').disabled = game.playerCount <= 2;
    document.getElementById('playerPlus').disabled = game.playerCount >= 10;
    document.getElementById('boardDimensionDesc').textContent = `กระดาน ${game.rows} × ${game.cols} · แผ่นหิน ${game.rows * game.cols} แผ่น`;
  }

  document.getElementById('playerMinus').addEventListener('click', () => setPlayerCount(game.playerCount - 1));
  document.getElementById('playerPlus').addEventListener('click', () => setPlayerCount(game.playerCount + 1));
  document.getElementById('startPlayBtn').addEventListener('click', startGame);
  document.getElementById('homeBtn').addEventListener('click', openMenu);
  document.getElementById('newRoundBtn').addEventListener('click', () => startRound(true));
  document.getElementById('nextRoundBtn').addEventListener('click', advanceRound);
  document.getElementById('menuResultBtn').addEventListener('click', openMenu);

  // BOTH controls are synced before either listener: the header button's glyph and the settings
  // switch's `on` class describe the same device-wide state, which may already be muted here.
  const audioBtn = document.getElementById('audioToggleBtn');
  audioBtn.textContent = sounds.enabled ? '🔊' : '🔇';
  document.getElementById('soundToggle').classList.toggle('on', sounds.enabled);
  audioBtn.addEventListener('click', () => {
    sounds.enabled = !sounds.enabled;
    audioBtn.textContent = sounds.enabled ? '🔊' : '🔇';
    document.getElementById('soundToggle').classList.toggle('on', sounds.enabled);
  });

  document.getElementById('howToPlayBtn').addEventListener('click', () => document.getElementById('howModal').classList.add('open'));
  document.getElementById('settingsBtn').addEventListener('click', () => document.getElementById('settingsModal').classList.add('open'));
  document.getElementById('menuSettingsBtn').addEventListener('click', () => document.getElementById('settingsModal').classList.add('open'));
  document.querySelectorAll('.closeModal').forEach(b => b.addEventListener('click', () => {
    document.getElementById(b.dataset.close).classList.remove('open');
  }));
  document.querySelectorAll('.modalOverlay').forEach(m => m.addEventListener('pointerdown', e => {
    if (e.target === m) m.classList.remove('open');
  }));

  function bindToggle(btnId, key, callback) {
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', () => {
      btn.classList.toggle('on');
      const val = btn.classList.contains('on');
      game[key] = val;
      if (callback) callback(val);
    });
  }
  bindToggle('soundToggle', 'soundEnabled', v => {
    sounds.enabled = v;
    audioBtn.textContent = v ? '🔊' : '🔇';
  });
  bindToggle('motionToggle', 'motionEnabled');
  bindToggle('particleToggle', 'particlesEnabled', v => { if (!v) game.particles.length = 0; });

  window.addEventListener('resize', handleResize, { passive: true });
  document.addEventListener('visibilitychange', () => { game.lastTime = performance.now(); });

  setPlayerCount(2);
  handleResize();
  updateUI();
  requestAnimationFrame(loop);
})();
