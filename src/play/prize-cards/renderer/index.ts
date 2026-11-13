// The cards reveal (gh#306, the game named in copy.ts): everyone remaining is dealt one face-down card;
// once the round is committed, a rule card is drawn in the centre, the room hears a drumroll, every card
// turns at once, the room reads its own card, and then the cards that do not meet the rule dim.
//
// Design: option B ALL AT ONCE of design/Gh303Cards.dc.html (owner pick 2026-11-11), frames cd-idle,
// cd-rule, cd-reveal and cd-result. Its 3D intent: one instanced mesh of cards on a plane facing the camera,
// one uniform turning every card, names and faces in one canvas-texture atlas, no table surface (no felt, no
// chips, no money). Frames not drawn here: cd-rm and cd-fallback are the host's 2D view; cd-code needs to
// know the event runs in QR mode, which the reveal input does not carry.
//
// A card round mounts twice (game-contract.ts): `deal` animates the committed deal and settles face down,
// revealing no survivor and no rule; `round` starts from that settled deal and shows the committed rule and
// survivors. What this module does NOT do: choose anything. plan.ts turns the committed outcome into a
// timeline and refuses one it cannot draw as given. It owns no loop (the host ticks it), no fallback (the
// host draws the 2D view), and allocates GPU resources only through `context.own`.

import {
  CanvasTexture,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
} from 'three';
import type { GameCommand, GameContext, GameEvent, RevealHandle, RevealInput, RevealModule, Viewport } from '../../_prize-reveal/game-contract.ts';
import { paintBand, paintTop, surface, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import { randomFor } from '../../prize-fireworks/renderer/seed.ts';
import {
  BAND_CY,
  CARD,
  COPY,
  FRAME_H,
  FRAME_W,
  NAME_BOX_UP,
  STACK,
  T,
  VFOV_DEG,
  bandAt,
  beatsIn,
  chromeBox,
  drumroll,
  flipAt,
  planFor,
  ruleCardAt,
  topDots,
  topLabel,
  veilAt,
  type Band,
} from './plan.ts';
import {
  CARD_COLOR,
  CENTRE_H,
  CENTRE_W,
  COLOR,
  FACES,
  RULE_GLOW,
  fitCards,
  isRed,
  paintCardAtlas,
  paintCentre,
  paintRuleCard,
  type CardPaint,
} from './paint.ts';

// Instance types read off the classes: three ships no declarations (see _prize-reveal/three-shim.d.ts),
// and this form stays right if its typings are added.
type CanvasTextureT = InstanceType<typeof CanvasTexture>;
type ShaderMaterialT = InstanceType<typeof ShaderMaterial>;
type SceneT = InstanceType<typeof Scene>;
type PlaneGeometryT = InstanceType<typeof PlaneGeometry>;
type MeshT = InstanceType<typeof Mesh>;
type GroupT = InstanceType<typeof Group>;

/** A passing card's glow: the board's 16px blur is a gaussian of sigma 8; the quad keeps 3 sigma past its
 *  3px gold ring. */
const GLOW_SIGMA = 8;
const CARD_PAD = 3 + 3 * GLOW_SIGMA;
/** Band canvas: the frame strip from here to the bottom holds both side columns of the lower band. */
const BAND_TOP = 860;

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const glsl = (hex: string): string => `vec3(${hexRgb(hex).map((v) => v.toFixed(4)).join(', ')})`;
const f = (v: number): string => v.toFixed(1);

const PANEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PANEL_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)) * uOpacity;
}`;

const GROUND_VERT = /* glsl */ `
varying float vY;
void main() {
  vY = uv.y;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}`;
const GROUND_FRAG = /* glsl */ `
varying float vY;
void main() {
  gl_FragColor = vec4(mix(${glsl(COLOR.groundBottom)}, ${glsl(COLOR.groundTop)}, vY), 1.0);
}`;

const VEIL_FRAG = /* glsl */ `
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(${glsl(COLOR.groundTop)}, 1.0) * uOpacity;
}`;

const CARD_VERT = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aBack;
attribute vec4 aUp;
attribute vec4 aEnd;
attribute vec4 aFace;
attribute vec2 aDeal;
attribute vec3 aJudge;
uniform float uTime;
uniform float uFlip;
uniform float uTremble;
uniform float uS;
uniform vec2 uStack;
varying vec2 vP;
varying vec2 vHalf;
varying float vFront;
varying float vRed;
varying float vJudge;
varying float vPass;
varying vec4 vBack;
varying vec4 vUp;
varying vec4 vEnd;
varying vec4 vFace;
void main() {
  vec2 halfSize = aRect.zw * 0.5;
  vec2 ext = halfSize + vec2(${f(CARD_PAD)} * uS);
  vec2 local = position.xy * 2.0 * ext;
  float d = clamp((uTime - aDeal.x) / ${f(T.dealSlide)}, 0.0, 1.0);
  d = 1.0 - (1.0 - d) * (1.0 - d) * (1.0 - d);
  vec2 centre = mix(uStack, aRect.xy, d);
  float ph = aJudge.z * 6.2831853;
  centre += uTremble * vec2(sin(uTime * 0.045 + ph), cos(uTime * 0.038 + ph * 1.7));
  float ang = 3.14159265 * uFlip;
  vec3 p = vec3(centre.x - ${f(FRAME_W / 2)} + local.x * cos(ang), ${f(FRAME_H / 2)} - centre.y + local.y, local.x * sin(ang));
  vP = vec2(local.x, -local.y);
  vHalf = halfSize;
  vFront = uFlip > 0.5 ? 1.0 : 0.0;
  vRed = aDeal.y;
  float span = aJudge.y > 0.5 ? ${f(T.ringUp)} : ${f(T.failDim)};
  vJudge = aJudge.x < 0.0 ? 0.0 : clamp((uTime - aJudge.x) / span, 0.0, 1.0);
  vPass = aJudge.y;
  vBack = aBack;
  vUp = aUp;
  vEnd = aEnd;
  vFace = aFace;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uS;
varying vec2 vP;
varying vec2 vHalf;
varying float vFront;
varying float vRed;
varying float vJudge;
varying float vPass;
varying vec4 vBack;
varying vec4 vUp;
varying vec4 vEnd;
varying vec4 vFace;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
float mask(vec4 rect, vec2 lo, vec2 size, vec2 p) {
  vec2 t = (p - lo) / size;
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return 0.0;
  return texture2D(uAtlas, mix(rect.xy, rect.zw, t)).a;
}
void main() {
  vec2 p = vP;
  // Past a quarter turn the quad shows its other side, mirrored: read the face the right way round.
  if (vFront > 0.5) p.x = -p.x;
  float d = box(p, vHalf, ${f(CARD.radius)} * uS);
  float aa = max(fwidth(d), 0.0001);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float inner = 1.0 - smoothstep(-aa, aa, d + 2.0 * uS);
  vec2 lo = vec2(-vHalf.x, -vHalf.y);
  float h = vHalf.y * 2.0;
  vec4 col;
  if (vFront < 0.5) {
    // The back: the night hatch (6px then a 1px line, at 45 degrees), a 2px gold edge, the name in white.
    vec2 q = p / uS;
    float s = mod((q.x - q.y) * 0.70710678, 7.0);
    vec3 hatch = s < 6.0 ? ${glsl(COLOR.raised)} : ${glsl(CARD_COLOR.hatch)};
    col = vec4(hatch, 1.0) * inner + vec4(${glsl(COLOR.gold)}, 1.0) * clamp(inside - inner, 0.0, 1.0);
    float pad = ${f(CARD.downPad)} * uS;
    float m = mask(vBack, lo + vec2(pad, 0.0), vec2(vHalf.x * 2.0 - 2.0 * pad, h), p);
    col = over(vec4(${glsl(COLOR.ink)}, 1.0) * m * inside, col);
  } else {
    float fail = abs(vPass) < 0.5 ? vJudge : 0.0;
    float ring = vPass > 0.5 ? vJudge : 0.0;
    // A card that meets the rule: a 3px gold ring outside it and the gold glow.
    float outer = 1.0 - smoothstep(-aa, aa, d - 3.0 * uS);
    float sigma = ${f(GLOW_SIGMA)} * uS;
    float glow = d > 0.0 ? 0.45 * exp(-(d * d) / (2.0 * sigma * sigma)) : 0.0;
    col = vec4(${glsl(COLOR.gold)}, 1.0) * glow * ring;
    col = over(vec4(${glsl(COLOR.gold)}, 1.0) * clamp(outer - inside, 0.0, 1.0) * ring, col);
    // The face: white; a card that does not meet it turns clear, keeping a 2px inset ring.
    col = over(vec4(${glsl(CARD_COLOR.face)}, 1.0) * inside * (1.0 - fail), col);
    col = over(vec4(${glsl(COLOR.raised)}, 1.0) * clamp(inside - inner, 0.0, 1.0) * fail, col);
    vec3 rank = mix(vRed > 0.5 ? ${glsl(CARD_COLOR.red)} : ${glsl(CARD_COLOR.ink)}, ${glsl(COLOR.out)}, fail);
    float fm = mask(vFace, lo + vec2(${f(CARD.padL)} * uS, 0.0), vec2(${f(CARD.face)} * uS, h), p);
    col = over(vec4(rank, 1.0) * fm, col);
    vec2 nameLo = lo + vec2(${f(CARD.padL + CARD.face + CARD.faceGap)} * uS, 0.0);
    vec2 nameSize = vec2(${f(NAME_BOX_UP)} * uS, h);
    float judged = vPass > -0.5 ? vJudge : 0.0;
    float nm = mix(mask(vUp, nameLo, nameSize, p), mask(vEnd, nameLo, nameSize, p), judged);
    col = over(vec4(mix(${glsl(CARD_COLOR.ink)}, ${glsl(COLOR.out)}, fail), 1.0) * nm, col);
  }
  gl_FragColor = col;
}`;

/** Render order: ground, cards, veil, rule card, band text. */
const LAYER = { ground: 0, cards: 10, veil: 20, rule: 30, text: 40 } as const;

type Own = GameContext['own'];

function world(x: number, y: number): [number, number, number] {
  return [x - FRAME_W / 2, FRAME_H / 2 - y, 0];
}

function backingScale(vp: Viewport): number {
  return Math.min(2, Math.max(0.5, Math.min(vp.cssWidth / FRAME_W, vp.cssHeight / FRAME_H) * vp.dpr));
}

function canvasTexture(own: Own, paint: Paintable): CanvasTextureT {
  const tex = own(new CanvasTexture(paint.canvas));
  tex.flipY = false;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

function overlayMaterial(own: Own, extra: Record<string, unknown>): ShaderMaterialT {
  return own(new ShaderMaterial({ transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, ...extra }));
}

/** A text panel: a frame-px canvas shown as a quad at its frame position. Repaints reuse the canvas. */
class Panel {
  readonly mesh: MeshT;
  readonly material: ShaderMaterialT;
  private paint: Paintable | null = null;
  private tex: CanvasTextureT | null = null;
  private readonly own: Own;
  private readonly doc: Document;
  constructor(own: Own, doc: Document, quad: PlaneGeometryT, parent: SceneT | GroupT, order: number, name: string) {
    this.own = own;
    this.doc = doc;
    this.material = overlayMaterial(own, {
      uniforms: { uMap: { value: null }, uOpacity: { value: 1 } },
      vertexShader: PANEL_VERT,
      fragmentShader: PANEL_FRAG,
    });
    this.mesh = new Mesh(quad, this.material);
    this.mesh.name = name;
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  /** Paint on a canvas of w x h frame px, reused while its size and scale hold. */
  draw(w: number, h: number, scale: number, fn: (p: Paintable) => void): void {
    if (!this.paint || this.paint.w !== w || this.paint.h !== h || this.paint.scale !== scale) {
      this.tex?.dispose();
      this.paint = surface(this.doc, w, h, scale);
      this.tex = canvasTexture(this.own, this.paint);
      this.material.uniforms.uMap!.value = this.tex;
    } else {
      const { ctx, canvas } = this.paint;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    fn(this.paint);
    this.tex!.needsUpdate = true;
    this.mesh.visible = true;
  }
  /** Show a finished paint, owned through a texture this panel makes. */
  show(paint: Paintable): void {
    this.tex?.dispose();
    this.paint = paint;
    this.tex = canvasTexture(this.own, paint);
    this.material.uniforms.uMap!.value = this.tex;
    this.mesh.visible = true;
  }
  /** Place the panel's top-left at frame (x, y), w x h frame px. */
  place(x: number, y: number, w: number, h: number): void {
    const [wx, wy] = world(x + w / 2, y + h / 2);
    this.mesh.position.set(wx, wy, 0);
    this.mesh.scale.set(w, h, 1);
  }
  set opacity(v: number) {
    this.material.uniforms.uOpacity!.value = v;
  }
}

function mountCards(context: GameContext, input: RevealInput<'cards'>, emit: (event: GameEvent) => void): RevealHandle {
  const plan = planFor(input);
  const { own, renderer, signal } = context;
  const doc = context.root.ownerDocument;
  const names = new Map(input.people.map((p) => [p.id, p.name]));
  let viewport: Viewport = input.viewport;
  let scale = backingScale(viewport);
  const n = plan.slots.length;
  const s = plan.layout.s;

  const scene = new Scene();
  const camera = new PerspectiveCamera(VFOV_DEG, 16 / 9, 10, 10000);
  const quad = own(new PlaneGeometry(1, 1));
  const ground = new Mesh(quad, overlayMaterial(own, { transparent: false, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG }));
  ground.name = 'ground';
  ground.renderOrder = LAYER.ground;
  ground.frustumCulled = false;
  scene.add(ground);

  let cameraDist = 1;
  function fitCamera(): void {
    const aspect = viewport.cssWidth / Math.max(1, viewport.cssHeight);
    const tanHalf = Math.tan((VFOV_DEG * Math.PI) / 360);
    // The whole frame stays in view: height-limited on a wide screen, width-limited on a narrow one.
    cameraDist = Math.max(FRAME_H / 2 / tanHalf, FRAME_W / 2 / (tanHalf * aspect));
    camera.aspect = aspect;
    camera.near = cameraDist * 0.1;
    camera.far = cameraDist * 4;
    camera.updateProjectionMatrix();
  }

  // ---- the cards: one instanced quad per person, in deal order
  const geometry = own(new InstancedBufferGeometry());
  // Own copies of the quad's buffers: disposing this geometry must not free the shared quad's.
  geometry.setIndex(quad.index!.clone());
  geometry.setAttribute('position', quad.getAttribute('position').clone());
  geometry.instanceCount = n;
  const attr = (size: number, values?: number[]): InstanceType<typeof InstancedBufferAttribute> =>
    new InstancedBufferAttribute(values ? new Float32Array(values) : new Float32Array(n * size), size);
  const aRect = attr(4, plan.slots.flatMap((c) => [c.cx, c.cy, CARD.w * s, CARD.h * s]));
  const aBack = attr(4);
  const aUp = attr(4);
  const aEnd = attr(4);
  const aFace = attr(4);
  // A deal shows backs only: no suit colour is sent to the GPU before the round is committed.
  const aDeal = attr(2, plan.slots.flatMap((c) => [Number.isFinite(c.dealAt) ? c.dealAt : -1e6, plan.kind === 'round' && isRed(c.card.suit) ? 1 : 0]));
  const tremble = randomFor(input.key, 'tremble');
  const aJudge = attr(3, plan.slots.flatMap((c) => [c.judgeAt ?? -1, c.pass === null ? -1 : c.pass ? 1 : 0, tremble()]));
  for (const [name, a] of Object.entries({ aRect, aBack, aUp, aEnd, aFace, aDeal, aJudge })) geometry.setAttribute(name, a);
  const cardMaterial = overlayMaterial(own, {
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFlip: { value: 0 },
      uTremble: { value: 0 },
      uS: { value: s },
      uStack: { value: [STACK.x, STACK.y] },
      uAtlas: { value: null },
    },
    vertexShader: CARD_VERT,
    fragmentShader: CARD_FRAG,
  });
  const cards = new Mesh(geometry, cardMaterial);
  cards.name = 'cards';
  cards.renderOrder = LAYER.cards;
  cards.frustumCulled = false;
  scene.add(cards);

  // What the atlas paints: a deal sends neither faces nor verdicts; a round sends the committed ones.
  const toPaint: CardPaint[] = plan.slots.map((c) => ({
    name: names.get(c.id) ?? '',
    card: plan.kind === 'round' ? c.card : null,
    verdict: c.pass === null ? null : c.pass ? 'pass' : 'fail',
  }));
  let atlasTex: CanvasTextureT | null = null;
  const buildCards = (): void => {
    const atlas = paintCardAtlas(doc, toPaint, fitCards(doc, toPaint), scale * s);
    atlas.cells.forEach((cell, i) => {
      aBack.set(cell.back, i * 4);
      if (cell.up) aUp.set(cell.up, i * 4);
      if (cell.end) aEnd.set(cell.end, i * 4);
      if (cell.face) aFace.set(cell.face, i * 4);
    });
    for (const a of [aBack, aUp, aEnd, aFace]) a.needsUpdate = true;
    atlasTex?.dispose();
    atlasTex = canvasTexture(own, atlas.paint);
    cardMaterial.uniforms.uAtlas!.value = atlasTex;
  };
  buildCards();

  // ---- the rule card and its veil (a round only)
  const veilMaterial = overlayMaterial(own, { uniforms: { uOpacity: { value: 0 } }, vertexShader: PANEL_VERT, fragmentShader: VEIL_FRAG });
  const veil = new Mesh(quad, veilMaterial);
  veil.name = 'veil';
  veil.renderOrder = LAYER.veil;
  veil.frustumCulled = false;
  veil.position.set(0, 0, 0);
  veil.scale.set(FRAME_W, FRAME_H, 1);
  veil.visible = false;
  scene.add(veil);

  const ruleGroup = new Group();
  ruleGroup.visible = false;
  scene.add(ruleGroup);
  let ruleH = 0;
  let ruleFront: Panel | null = null;
  let ruleBack: Panel | null = null;
  const buildRule = (): void => {
    if (plan.kind !== 'round') return;
    const painted = paintRuleCard(doc, plan.rule, COPY.ruleLabel, COPY.rule[plan.rule], scale);
    ruleH = painted.h;
    ruleFront ??= new Panel(own, doc, quad, ruleGroup, LAYER.rule + 1, 'rule-front');
    ruleBack ??= new Panel(own, doc, quad, ruleGroup, LAYER.rule, 'rule-back');
    ruleFront.show(painted.front);
    ruleBack.show(painted.back);
    const w = painted.w + 2 * RULE_GLOW;
    const h = painted.h + 2 * RULE_GLOW;
    ruleFront.mesh.scale.set(w, h, 1);
    ruleBack.mesh.scale.set(w, h, 1);
    // Back to back: the back faces the camera while the group is turned half round.
    ruleBack.mesh.rotation.y = Math.PI;
  };
  buildRule();

  // ---- the frame's text: the top bar, the band's side columns, the band's centre
  const top = new Panel(own, doc, quad, scene, LAYER.text, 'top');
  const band = new Panel(own, doc, quad, scene, LAYER.text, 'band');
  const centre = new Panel(own, doc, quad, scene, LAYER.text + 1, 'centre');
  let bandKey = '';
  let centreKey = '';
  // The camera dollies during the drumroll; the top bar is frame chrome and must not move with it (PD-306-03).
  let dolly = 0;
  const placeTopBar = (): void => {
    const b = chromeBox({ x: 0, y: 0, w: FRAME_W, h: 96 }, dolly);
    top.place(b.x, b.y, b.w, b.h);
  };
  const paintTopBar = (): void => {
    top.draw(FRAME_W, 96, scale, (p) => paintTop(p, input.eventName, topLabel(plan), topDots(plan)));
    placeTopBar();
  };
  paintTopBar();
  const paintBandAt = (b: Band): void => {
    const key = b ? `${b.left}|${b.right.kind === 'text' ? b.right.text : 'legend'}` : 'none';
    if (key !== bandKey) {
      bandKey = key;
      if (!b) band.mesh.visible = false;
      else {
        const right = b.right.kind === 'text' ? b.right : { kind: 'legend' as const, passed: COPY.passed, notPassed: COPY.notPassed };
        band.draw(FRAME_W, FRAME_H - BAND_TOP, scale, (p) => {
          // The band painter works in frame px; this canvas starts at BAND_TOP.
          p.ctx.save();
          p.ctx.translate(0, -BAND_TOP);
          paintBand(p, b.left, COPY.gameName, right);
          p.ctx.restore();
        });
        band.place(0, BAND_TOP, FRAME_W, FRAME_H - BAND_TOP);
      }
    }
    const ckey = b ? JSON.stringify(b.centre) : 'none';
    if (ckey !== centreKey) {
      centreKey = ckey;
      if (!b) centre.mesh.visible = false;
      else {
        centre.draw(CENTRE_W, CENTRE_H, scale, (p) => paintCentre(p, b.centre, COPY.people));
        centre.place(FRAME_W / 2 - CENTRE_W / 2, BAND_CY - CENTRE_H / 2, CENTRE_W, CENTRE_H);
      }
    }
  };

  const update = (t: number): void => {
    const roll = drumroll(plan, t);
    cardMaterial.uniforms.uTime!.value = t;
    cardMaterial.uniforms.uFlip!.value = flipAt(plan, t);
    cardMaterial.uniforms.uTremble!.value = roll.tremble;
    camera.position.set(0, 0, cameraDist * (1 - roll.dolly));
    dolly = roll.dolly;
    placeTopBar();
    const v = veilAt(plan, t);
    veil.visible = v > 0;
    veilMaterial.uniforms.uOpacity!.value = v;
    const pose = ruleCardAt(plan, t, ruleH);
    ruleGroup.visible = pose.visible;
    if (pose.visible) {
      ruleGroup.position.set(...world(pose.cx, pose.cy));
      ruleGroup.scale.set(pose.scale, pose.scale, 1);
      ruleGroup.rotation.y = Math.PI * (1 - pose.turn);
      if (ruleFront) ruleFront.opacity = pose.opacity;
      if (ruleBack) ruleBack.opacity = pose.opacity;
    }
    paintBandAt(bandAt(plan, t));
  };
  const rebuildText = (): void => {
    buildCards();
    buildRule();
    paintTopBar();
    bandKey = '';
    centreKey = '';
  };

  fitCamera();
  update(0);
  renderer.render(scene, camera);

  // A face still loading paints with a fallback; repaint every text once the board's faces are in.
  const fonts = doc.fonts as FontFaceSet | undefined;
  if (fonts && !FACES.every((face) => fonts.check(face))) {
    Promise.all(FACES.map((face) => fonts.load(face))).then(
      () => {
        if (!signal.aborted) rebuildText();
      },
      () => {},
    );
  }

  let last = -1;
  let now = 0;
  let completed = false;
  let disposed = false;
  const complete = (): void => {
    if (completed) return;
    completed = true;
    emit({ type: 'complete' });
  };

  return {
    advance(command: GameCommand): void {
      if (disposed || signal.aborted) return;
      if (command.type === 'tick') {
        const t = command.elapsedMs;
        const due = beatsIn(plan, last, t);
        last = t;
        // Draw first, then report: the frame a beat names (the last card landing, the final count) is on
        // screen before the event that may end the reveal, and nothing is drawn after the host disposes.
        now = Math.min(t, plan.total);
        update(now);
        renderer.render(scene, camera);
        for (const event of due) {
          if (event.type === 'complete') complete();
          else emit(event);
          if (signal.aborted) return;
        }
      } else if (command.type === 'resize') {
        viewport = command.viewport;
        const next = backingScale(viewport);
        fitCamera();
        if (next !== scale) {
          scale = next;
          rebuildText();
        }
        update(now);
      } else if (command.type === 'finish') {
        complete();
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scene.clear();
    },
  };
}

export const reveal: RevealModule<'cards'> = { mount: mountCards };
