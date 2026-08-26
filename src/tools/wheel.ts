// Pure logic for the name wheel — never touches DOM/localStorage/sessionStorage
// Per docs/adr/0004: re-spinning with already-drawn names removed is the caller's job (pass a shorter list down)
const MIN_NAMES = 2;

/** Pick one name at random from the list, using an injected random source (controllable from tests).
 *  random must return a value in [0, 1), same contract as Math.random. */
export function pickName(names: string[], random: () => number = Math.random): string {
  if (names.length < MIN_NAMES) {
    throw new Error(`วงล้อสุ่มต้องมีชื่ออย่างน้อย ${MIN_NAMES} คน (ตอนนี้มี ${names.length} คน)`);
  }
  // clamp in case random() returns exactly 1, which would index past the end of the list
  const index = Math.min(names.length - 1, Math.floor(random() * names.length));
  return names[index]!;
}

// Wheel disc geometry — every number is byte-exact from design/ToolWheelDesktop.dc.html /
// design/ToolWheel390.dc.html (ADR-0033): 400x400 viewBox, centre (200,200), segment radius 164,
// hub radius 46, stroke width 7.
export const WHEEL_VIEW = 400;
export const WHEEL_CX = 200;
export const WHEEL_CY = 200;
export const WHEEL_RIM_R = 164;
export const WHEEL_HUB_R = 46;
// The artboard's eight labels sit at 106-114 from the centre with no single radius to copy, so a
// computed label takes the midpoint of the two canvas radii (hub 46, rim 164). Flagged in the
// ticket return, not silent.
export const WHEEL_LABEL_R = 105;
// Segment fill order — the artboard cycles these three, starting #ffd27f at the 12 o'clock segment.
export const WHEEL_PALETTE = ['#ffd27f', '#f89880', '#7fd8e8'] as const;

export interface WheelPoint {
  x: number;
  y: number;
}

/** Point on a circle of radius r at `angleDeg` clockwise from 12 o'clock (svg y-down). */
function pointAt(angleDeg: number, r: number): WheelPoint {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: WHEEL_CX + r * Math.sin(rad), y: WHEEL_CY - r * Math.cos(rad) };
}

/** The rim radii bounding one segment: index * seg - seg/2 to index * seg + seg/2, matching the
 *  artboard's sweep (arc sweep-flag 1, clockwise). */
export function segmentAngles(index: number, count: number): { start: number; end: number } {
  const seg = 360 / count;
  return { start: index * seg - seg / 2, end: index * seg + seg / 2 };
}

export function segmentEndpoints(index: number, count: number): { from: WheelPoint; to: WheelPoint } {
  const { start, end } = segmentAngles(index, count);
  return { from: pointAt(start, WHEEL_RIM_R), to: pointAt(end, WHEEL_RIM_R) };
}

/** Wedge path for segment `index` of `count`, one decimal of rounding — reproduces all eight
 *  canvas paths of the artboard byte-exact for count 8. Callers draw a full-disc circle instead
 *  for count 1 (both radii collapse onto one point and the arc degenerates). */
export function segmentPath(index: number, count: number): string {
  const { from, to } = segmentEndpoints(index, count);
  const f1 = (n: number): string => n.toFixed(1);
  return `M200 200 L${f1(from.x)} ${f1(from.y)} A164 164 0 0 1 ${f1(to.x)} ${f1(to.y)} Z`;
}

export interface WheelLabel {
  x: number;
  y: number;
  /** rotation about the label's own anchor, degrees — the artboard rotates label i*45 on the
   *  8-name disc, so the general rule is i * 360/count. */
  angle: number;
}

export function labelGeometry(index: number, count: number): WheelLabel {
  const angle = (index * 360) / count;
  const p = pointAt(angle, WHEEL_LABEL_R);
  return { x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)), angle };
}

/** Label height keeps the artboard's density — 21px into a 45-degree segment — as segments thin
 *  out. The canvas has no specimen past 8 names, so the shrink below 21 is derived (proportional
 *  to segment chord), floored at 13. */
export function labelFontSize(count: number): number {
  if (count <= 8) return 21;
  return Math.max(13, Math.round((21 * Math.sin(Math.PI / count)) / Math.sin(Math.PI / 8)));
}

/** Truncates a name to what fits its segment chord, ending in an ellipsis. The wheel svg is
 *  aria-hidden decoration and the full name always prints in the result text; the canvas shows no
 *  truncation specimen, so the 0.62em glyph-advance estimate is approximate — the real test is the
 *  rendered wheel, not this arithmetic. */
export function labelText(name: string, count: number): string {
  const font = labelFontSize(count);
  const chord = 2 * WHEEL_LABEL_R * Math.sin(Math.PI / count);
  const maxChars = Math.max(1, Math.floor(chord / (font * 0.62)) - 1);
  if (name.length <= maxChars) return name;
  return `${name.slice(0, maxChars - 1)}…`;
}

/** Final group rotation (degrees) that puts segment `index` under the fixed pointer at 12 o'clock,
 *  from the current orientation plus `turns` extra revolutions. The picked NAME is the input and
 *  the angle derives from it — the answer is never read back off where the wheel stops. */
export function landingRotation(current: number, index: number, count: number, turns = 4): number {
  const seg = 360 / count;
  const targetMod = ((-index * seg) % 360 + 360) % 360;
  const currentMod = ((current % 360) + 360) % 360;
  const delta = (targetMod - currentMod + 360) % 360;
  return current + turns * 360 + delta;
}
