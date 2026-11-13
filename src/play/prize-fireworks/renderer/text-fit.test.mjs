// The gh#302 NAME FIT rule, for names the fireworks reveal paints into canvases (gh#305): render at the
// surface size; if the name plus 2% slack overflows its box, shrink 1px at a time; at the floor, wrap
// (spaces first, then anywhere between grapheme clusters). Never clipped, never truncated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitName, graphemes } from './text-fit.ts';

// A stand-in measure: every grapheme cluster is 0.6 em wide.
const measure = (text, size) => graphemes(text).length * size * 0.6;

test('a name that fits renders at the surface size on one line', () => {
  assert.deepEqual(fitName('ออม ท.', measure, 20, 18, 205), { size: 20, lines: ['ออม ท.'] });
});

test('a name over its box shrinks 1px at a time to the first size that fits with 2% slack', () => {
  // 12 clusters: 7.2 em; at 20px that is 144 * 1.02 = 146.9 > 140; at 19px 136.8 * 1.02 = 139.5 <= 140.
  assert.deepEqual(fitName('ฒฒฒฒฒฒฒฒฒฒฒฒ', measure, 20, 18, 140), { size: 19, lines: ['ฒฒฒฒฒฒฒฒฒฒฒฒ'] });
});

test('at the floor a name wraps between clusters, and every cluster survives', () => {
  const name = 'ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ';
  assert.equal(graphemes(name).length, 12, 'SARA AM did not stay with its letter');
  const fit = fitName(name, measure, 20, 18, 80);
  assert.equal(fit.size, 18);
  assert.ok(fit.lines.length >= 2);
  assert.equal(fit.lines.join(''), name, 'a cluster was dropped or split');
  for (const line of fit.lines) assert.ok(measure(line, 18) <= 80, `line ${line} overflows`);
});

test('at the floor a wrap breaks at a space before it breaks inside a word', () => {
  const fit = fitName('มะปราง หวานใจมาก', measure, 20, 18, 100);
  assert.equal(fit.size, 18);
  assert.deepEqual(fit.lines, ['มะปราง', 'หวานใจมาก']);
});

test('a single cluster wider than the box still renders, alone on its line', () => {
  const fit = fitName('WW', measure, 20, 20, 5);
  assert.deepEqual(fit.lines, ['W', 'W']);
});
