// WCAG 2.x contrast ratio (relative luminance, sRGB linearised) for every gh#262 proposal pair.
// Run: node docs/verification/evidence/gh262-canvas/contrast.mjs
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const pairs = [
  ['control: black on white (must print 21.00)', '#000000', '#ffffff'],
  ['control: ADR-0069 ink on gold (11.93)', '#14142b', '#ffcc00'],
  ['(a) current: mark gold on hero pink', '#ffcc00', '#ff3d7f'],
  ['(a) A: ink text on gold highlight chip', '#14142b', '#ffcc00'],
  ['(a) A: chip 3px ink border vs pink', '#14142b', '#ff3d7f'],
  ['(a) B: ink text on hero pink', '#14142b', '#ff3d7f'],
  ['(a) C: white text on hero pink', '#ffffff', '#ff3d7f'],
  ['(b) current: ad label on cream', '#9a947a', '#fff6e0'],
  ['(b) A: ink-soft on cream', '#3d3b5c', '#fff6e0'],
  ['(b) B: #9a947a scaled darker, same hue', '#75705d', '#fff6e0'],
  ['(b) C: ink on cream', '#14142b', '#fff6e0'],
  ['(c) all: kicker ink-soft on cream', '#3d3b5c', '#fff6e0'],
];
for (const [label, fg, bg] of pairs) console.log(`${ratio(fg, bg).toFixed(2)}:1  ${fg} on ${bg}  ${label}`);
