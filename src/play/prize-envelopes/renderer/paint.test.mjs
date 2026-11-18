// The envelopes prize slot (gh#317) at the board's cap (PD-317-02 a, gh#319): the MC's prize line renders at
// Sarabun 400 30px, shrinks to the slot's own 20px floor, then takes at most two lines. Past the cap the second
// line is cut to whole grapheme clusters and ends in a single ellipsis, and no line is ever drawn wider than the
// slot: a cluster that alone is wider than the slot (a long ZWJ emoji run is ONE cluster) cannot be split, so it
// is dropped and its line ends in the ellipsis. The prize name is MC-typed with no length limit, so the slot
// never throws and never grows past the two-line cap. Measured through the module's own seam (ctx.measureText),
// with the same stand-in as mount.test.mjs: one advance per grapheme cluster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paintSlot } from './paint.ts';
import { SLOT } from './plan.ts';

const CLUSTERS = new Intl.Segmenter('th', { granularity: 'grapheme' });
const graphemes = (text) => [...CLUSTERS.segment(text)].map((s) => s.segment);
const pxOf = (font) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
const ZWJ = '\u200d';

/** One advance per grapheme cluster, as in mount.test.mjs — except a ZWJ cluster, which stays one cluster and is
 *  as wide as the parts it joins: the stub that models the real hazard, an unsplittable cluster wider than the
 *  slot. */
const advance = (text, size) => graphemes(text).reduce((w, g) => w + (g.includes(ZWJ) ? 40 * size : 0.55 * size), 0);

function fakeDoc() {
  const texts = [];
  return {
    texts,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      let font = '10px x';
      const ctx = {
        canvas: null,
        get font() {
          return font;
        },
        set font(v) {
          font = v;
        },
        measureText(text) {
          return { width: advance(text, pxOf(font)) };
        },
        fillText(text) {
          texts.push({ text, size: pxOf(font) });
        },
        getTransform: () => ({ a: 1 }),
      };
      for (const m of ['setTransform', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'clearRect']) ctx[m] = () => {};
      const canvas = { width: 0, height: 0, getContext: () => ctx };
      ctx.canvas = canvas;
      return canvas;
    },
  };
}

const LABEL = 'รางวัลที่ 1';
/** Fits at the picker name's own size on one line, so only the prize line moves the slot's height. */
const NAME = 'ต้น ส.';
const slot = (line) => ({ index: 0, id: 'p0', rank: 0, prize: 0, label: LABEL, line });

/** The prize line's painted rows: everything but the label and the picker's name. */
const prizeRows = (texts) => texts.filter((t) => t.text !== LABEL && t.text !== NAME);

/** `body` is a run of whole grapheme clusters taken in order from `source`: no cluster is ever cut in half. */
function isClusterRun(source, body) {
  const s = graphemes(source);
  const b = graphemes(body);
  for (let i = 0; i + b.length <= s.length; i++) if (s.slice(i, i + b.length).join('') === body) return true;
  return false;
}

/** No prize line may be drawn wider than the slot at the size it is drawn. */
function assertLinesFit(rows) {
  for (const row of rows) {
    const w = advance(row.text, row.size);
    assert.ok(w <= SLOT.w, `a line is ${w}px wide at ${row.size}px; the slot is ${SLOT.w}px`);
  }
}

// The slot's chrome does not move with the prize line: the label row, then the prize line (a 4px lead above it,
// line height 1.3), then the picker's name (a 6px lead, one 36px line).
const SLOT_CHROME = 30 * 1.25 + 4 + 6 + 36 * 1.2;
const JOINED = 'ทีวี 55 นิ้ว จักรยานไฟฟ้า หม้อทอดไร้น้ำมัน';
/** The tallest slot the cap allows: a two-line prize at the 20px floor. */
const CAP_H = SLOT_CHROME + 2 * 20 * 1.3;

test("a short prize keeps the board's start size on one line", () => {
  const doc = fakeDoc();
  const { height } = paintSlot(doc, slot('ทีวี 55 นิ้ว'), NAME, 1);
  assert.deepEqual(prizeRows(doc.texts), [{ text: 'ทีวี 55 นิ้ว', size: 30 }]);
  assert.equal(height, SLOT_CHROME + 30 * 1.3, "the one-line prize's height is today's");
});

test('the joined MC samples take two lines at the floor, and the slot grows no further than the cap', () => {
  const doc = fakeDoc();
  const { height } = paintSlot(doc, slot(JOINED), NAME, 1);
  const rows = prizeRows(doc.texts);
  assert.equal(rows.length, 2, `the board draws the joined samples on two lines: ${JSON.stringify(rows)}`);
  for (const row of rows) assert.equal(row.size, 20, 'a two-line prize sits at the floor');
  assert.equal(rows.map((r) => r.text).join(' '), JOINED, 'never clipped, never truncated');
  assert.equal(height, CAP_H, 'the two-line cap is the tallest this slot gets');
});

test('a prize past the cap keeps two lines, ends line 2 in an ellipsis, and never throws', () => {
  const doc = fakeDoc();
  const over = `${JOINED} ลำโพงไร้สาย หูฟังไร้สาย`;
  const { height } = paintSlot(doc, slot(over), NAME, 1);
  const rows = prizeRows(doc.texts);
  assert.equal(rows.length, 2, 'a prize past the cap never takes a third line');
  for (const row of rows) assert.equal(row.size, 20, 'a cut prize sits at the floor, never below it');
  assert.ok(rows[1].text.endsWith('…'), 'the cut line ends in a single ellipsis');
  assert.ok(isClusterRun(over, rows[1].text.slice(0, -1)), 'the cut keeps whole clusters');
  assert.equal(height, CAP_H, 'a cut prize never grows the slot past the two-line cap');
});

test('the cut never splits a Thai cluster: a repeated น้ำ is trimmed by whole clusters', () => {
  const doc = fakeDoc();
  const over = 'น้ำ'.repeat(60);
  const { height } = paintSlot(doc, slot(over), NAME, 1);
  const rows = prizeRows(doc.texts);
  assert.equal(rows.length, 2);
  const body = rows[1].text.slice(0, -1);
  assert.ok(body.length > 0, 'the cut line kept nothing at all');
  assert.equal(body, 'น้ำ'.repeat(graphemes(body).length), 'every kept cluster is a whole น้ำ');
  assert.ok(isClusterRun(over, body), 'the cut line is whole clusters taken in order from the source');
  assert.equal(height, CAP_H);
});

/** 35 emoji joined by ZWJ: one grapheme cluster that no 264px line can hold. */
const EMOJI = Array.from({ length: 35 }, () => '😀').join(ZWJ);

test('an overwide cluster is cut, never drawn past the slot: 35 ZWJ emoji are one cluster', () => {
  assert.equal(graphemes(EMOJI).length, 1, 'the stub models 35 ZWJ emoji as one cluster');
  assert.ok(advance(EMOJI, 20) > SLOT.w, 'the stub makes that cluster wider than the slot');
  const doc = fakeDoc();
  const { height } = paintSlot(doc, slot(EMOJI), NAME, 1);
  const rows = prizeRows(doc.texts);
  assertLinesFit(rows);
  assert.equal(rows.at(-1).text, '…', 'the line kept nothing of the cluster and ends in the ellipsis');
  assert.equal(height, SLOT_CHROME + 20 * 1.3);
});

test('an overwide cluster at the start of the prize leaves line 1 as the ellipsis', () => {
  const doc = fakeDoc();
  paintSlot(doc, slot(`${EMOJI} ทีวี 55 นิ้ว`), NAME, 1);
  const rows = prizeRows(doc.texts);
  assertLinesFit(rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, '…', 'the overwide cluster is dropped, and its line is the ellipsis alone');
  assert.equal(rows[1].text, 'ทีวี 55 นิ้ว', 'the rest of the prize still draws');
});

test('a normal prize followed by an overwide cluster keeps line 1 and cuts line 2', () => {
  const doc = fakeDoc();
  const { height } = paintSlot(doc, slot(`ทีวี 55 นิ้ว ${EMOJI}`), NAME, 1);
  const rows = prizeRows(doc.texts);
  assertLinesFit(rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, 'ทีวี 55 นิ้ว');
  assert.equal(rows[1].text, '…', 'the overwide cluster cannot be split, so line 2 is the ellipsis');
  assert.equal(height, CAP_H);
});