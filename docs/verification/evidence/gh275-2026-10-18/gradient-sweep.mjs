#!/usr/bin/env node
// White-on-gradient contrast sweep for the zero-trigger START control (gh#275).
// Interpolates in sRGB between the two stops at 101 evenly spaced points and prints white's WCAG
// contrast at the worst and best point. The old gradient is the control: its minimum must land near 2.43.
//   node docs/verification/evidence/gh275-2026-10-18/gradient-sweep.mjs

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrastWhite = (rgb) => 1.05 / (lum(rgb) + 0.05);

function sweep(a, b) {
  const [A, B] = [hex(a), hex(b)];
  const ratios = Array.from({ length: 101 }, (_, i) => {
    const t = i / 100;
    return contrastWhite(A.map((v, k) => v + (B[k] - v) * t));
  });
  return { min: Math.min(...ratios), max: Math.max(...ratios) };
}

for (const [label, a, b] of [['old (control)', '#0284c7', '#06b6d4'], ['new', '#075985', '#0369a1']]) {
  const { min, max } = sweep(a, b);
  console.log(`${label.padEnd(14)} ${a} -> ${b}  min ${min.toFixed(2)}  max ${max.toFixed(2)}`);
}
