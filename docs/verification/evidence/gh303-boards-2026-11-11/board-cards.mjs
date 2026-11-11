// gh#303 board: the deal-the-whole-room card game (elimination). One face-down card per remaining name, a rule
// drawn at random after the deal, a flip, and the cards that do not meet the rule fade.
import { th, nm, fit, EV, MAX_HEADS, rng, shuffle, svg, resetCopy, boardDoc, tag, ORDER_LINE, valuesTable, contrastTable, beatTable, copyRow, notesRow, rulesRow, nameFitRow } from './lib.mjs';
import { rolesRow } from './roles.mjs';
import { STAGE_CSS, STAGE_VALUES, STAGE_PAIRS, STAGE_DEVIATIONS, scaled, frame, top, plainReveal } from './stage.mjs';

const CSS = `
    /* ---- deal-the-whole-room cards: a card per name in the stage field (8 x 25). Face: rank over suit in a 24px
       column, then the name (Sarabun 400, 20px, shrink to fit, floor 16px). No felt, no chips, no money. ---- */
    .pj .grid .card { display: flex; align-items: center; gap: 6px; box-sizing: border-box; padding: 0 8px 0 4px; border-radius: 6px; overflow-x: clip; overflow-y: visible; font: 400 20px/1 'Sarabun', sans-serif; }
    /* round 2 deals 100 cards: 6 columns of 40px rows, so the rank reads at 30px beside its suit */
    .pj .grid.cards { grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: minmax(40px, auto); gap: 4px 10px; }
    .pj .grid .card .face { flex: none; width: 66px; display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 4px; font: 700 30px/1 'Mitr', sans-serif; }
    .pj .grid .card .fit { flex: 1 1 auto; min-width: 0; text-align: center; white-space: nowrap; overflow-x: clip; overflow-y: visible; }
    .pj .grid .card.down { background: repeating-linear-gradient(45deg, #23214d 0 6px, #2e2b63 6px 7px); color: #ffffff; box-shadow: inset 0 0 0 2px #ffcc00; padding-left: 8px; }
    .pj .grid .card.down .face { display: none; }
    .pj .grid .card.up { background: #ffffff; color: #14142b; }
    .pj .grid .card.up.red .face { color: #c2185b; }
    .pj .grid .card.pass { box-shadow: 0 0 0 3px #ffcc00, 0 0 16px rgba(255,204,0,0.45); font-weight: 700; }
    .pj .grid .card.fail { background: transparent; color: #9a97c0; box-shadow: inset 0 0 0 2px #23214d; text-decoration: line-through; }
    .pj .grid .card.fail .face, .pj .grid .card.up.red.fail .face { color: #9a97c0; } /* a card that does not meet the rule dims its rank too, red or not */
    .pj .rulecard { position: absolute; left: 610px; top: 250px; width: 700px; box-sizing: border-box; padding: 40px 48px; background: #ffffff; color: #14142b; border-radius: 32px; text-align: center; z-index: 3;
                    box-shadow: 0 0 60px rgba(255,204,0,0.45); }
    .pj .rulecard .rk { font: 600 40px/1.25 'Mitr', sans-serif; color: #3d3b5c; }
    .pj .rulecard .rv { margin-top: 12px; font: 700 120px/1.2 'Mitr', sans-serif; }
    .pj .rulecard .ri { display: flex; justify-content: center; gap: 24px; margin-top: 14px; }
    .pj .rule { font: 700 64px/1.2 'Mitr', sans-serif; color: #ffcc00; text-shadow: 0 0 24px rgba(255,204,0,0.45); white-space: nowrap; }
    .pj .codebox { position: absolute; left: 210px; top: 230px; width: 1500px; box-sizing: border-box; background: #23214d; border: 3px solid #ffcc00; border-radius: 24px; padding: 48px 56px; text-align: center; box-shadow: 0 0 60px rgba(255,204,0,0.45); z-index: 3; }
    .pj .codebox .ck { font: 600 44px/1.25 'Mitr', sans-serif; color: #d9d6f0; }
    .pj .codebox .digits { margin: 18px 0; font: 700 180px/1 'Mitr', sans-serif; color: #ffcc00; letter-spacing: 8px; white-space: nowrap; word-spacing: 0.15em; overflow-x: clip; }
    .pj .codebox .digits.d12 { font-size: 150px; letter-spacing: 6px; }
    .pj .codebox .ci { font: 400 34px/1.45 'Sarabun', sans-serif; color: #ffffff; }`;

// The deal: decision 13, a hand composed from as many decks as needed to land exactly on the schedule. Round 2 of
// the one event (gh#302 fixture): the 100 who passed round 1 are dealt; the drawn rule "black stays" and a cut of 100
// to 50, so exactly 50 black cards go to the names that pass.
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const FIELD = EV.field2, PASS = EV.pass2;
const DEAL = (() => {
  const r = rng(13);
  const black = shuffle([...Array(2)].flatMap(() => ['S', 'C'].flatMap((s) => RANKS.map((k) => [k, s]))), r).slice(0, PASS.size);
  const red = shuffle([...Array(2)].flatMap(() => ['H', 'D'].flatMap((s) => RANKS.map((k) => [k, s]))), r).slice(0, FIELD.length - PASS.size);
  let b = 0, d = 0; const m = new Map();
  for (const n of FIELD) m.set(n, PASS.has(n) ? black[b++] : red[d++]);
  if (b !== PASS.size || d !== FIELD.length - PASS.size) throw new Error('the composed hand does not land on the schedule');
  return m;
})();
const COLS = 6;

// state: 'down' | 'flip' (face up, not yet judged) | 'judged' | { wave: rowsFlipped }
function cards(state) {
  const judgedAll = state === 'judged';
  return `<div class="grid cards"${judgedAll ? ` data-expect="${FIELD.length}/${PASS.size}"` : ''}>${FIELD.map((n, i) => {
    const [k, s] = DEAL.get(n); const redSuit = s === 'H' || s === 'D';
    const row = Math.floor(i / COLS);
    let up = state !== 'down'; let judged = judgedAll;
    if (typeof state === 'object') { up = row < state.wave; judged = row < state.wave - 3; }
    const cls = !up ? 'down' : `up${redSuit ? ' red' : ''}${judged ? (PASS.has(n) ? ' pass' : ' fail') : ''}`;
    const suitC = judged && !PASS.has(n) ? '#9a97c0' : redSuit ? '#c2185b' : '#14142b';
    return `<span class="card ${cls}"><span class="face">${k}${svg.suit(s, 24, suitC)}</span><span class="${fit(16, 20)}">${nm(n)}</span></span>`;
  }).join('')}</div>`;
}

const GNAME = () => th('ไพ่แจกทั้งห้อง', 'game name', 'ticket');
const PEOPLE = () => th('คน', 'unit: people', 'g302');
const RULE = () => th('ดำอยู่ต่อ', 'card rule (one of three in the sketch)', 'ticket');
function low(left, mid, right) { return `<div class="low"><div>${left}</div>${mid}<div class="rt">${right}</div></div>`; }
const legend = () => `<div class="legend"><div><span class="chip in">${th('ผ่าน', 'legend: passed', 'g302')}</span></div><div><span class="chip out">${th('ไม่ผ่าน', 'legend: did not pass', 'g302')}</span></div></div>`;
const ruleMid = () => `<div><div class="lk" style="text-align:center;">${th('กติการอบนี้', 'cards: rule label')}</div><div class="rule">${RULE()}</div></div>`;

function cd(opt, kind) {
  const id = `cd-${kind}`;
  if (kind === 'idle') return frame(id, opt, '', `${top(2)}${cards('down')}${low(`<div class="lk">${th(`แจกไพ่แล้ว ${FIELD.length} ใบ`, 'cards idle: dealt count')}</div><div class="gname">${GNAME()}</div>`, `<div class="flow">${FIELD.length}<small>${PEOPLE()}</small></div>`, `<div class="lk">${th('ไพ่ของใครของมัน กติกายังไม่ได้สุ่ม', 'cards idle: the rule is not drawn yet')}</div>`)}`);
  if (kind === 'rule') {
    if (opt === 'A') return frame(id, opt, '', `${top(2)}${cards('down')}${low(`<div class="lk">${th('สุ่มกติกาแล้ว', 'cards rule: drawn')}</div><div class="gname">${GNAME()}</div>`, ruleMid(), `<div class="lk">${th('ไพ่ดำอยู่ต่อ ไพ่แดงตกรอบ', 'cards rule: the rule said in full')}</div>`)}`);
    return frame(id, opt, '', `${top(2)}${cards('down')}<div class="veil"></div><div class="rulecard"><div class="rk">${th('กติการอบนี้', 'cards: rule label')}</div><div class="rv">${RULE()}</div><div class="ri">${svg.suit('S', 72, '#14142b')}${svg.suit('C', 72, '#14142b')}</div></div>`);
  }
  if (kind === 'reveal') {
    if (opt === 'A') return frame(id, opt, '', `${top(2)}${cards({ wave: 10 })}${low(`<div class="lk">${th('เปิดไพ่ทีละแถว', 'cards reveal A: the wave')}</div><div class="gname">${GNAME()}</div>`, ruleMid(), legend())}`);
    return frame(id, opt, '', `${top(2)}${cards('flip')}${low(`<div class="lk">${th('เปิดพร้อมกันทั้งห้อง', 'cards reveal B: all at once')}</div><div class="gname">${GNAME()}</div>`, ruleMid(), `<div class="lk">${th('ไพ่ดำอยู่ต่อ ไพ่แดงตกรอบ', 'cards rule: the rule said in full')}</div>`)}`);
  }
  const endLow = low(`<div class="lk">${th('ผ่านรอบที่ 2', 'reveal: passed heading (round 2)')}</div><div class="gname">${GNAME()}</div>`, `<div class="flow"><span class="to">${PASS.size}</span><small>${PEOPLE()}</small></div>`, legend());
  return frame(id, opt, '', `${top(2)}${cards('judged')}${endLow}`); // result and rm share the end state
}

function codeFrame() {
  return frame('cd-code', 'F', '', `${top(2)}${cards('down')}<div class="veil"></div><div class="codebox"><div class="ck">${th('รหัสรอบที่ 2', 'round code: label (round 2)')}</div><div class="digits d12">4821 5307 6290</div><div class="ci">${th('ใส่รหัสนี้ในมือถือ เพื่อดูไพ่ของคุณ', 'card-deal code: instruction')}</div></div>`);
}

const OPT = { A: 'FLIP WAVE', B: 'ALL AT ONCE' };

export function buildCards() {
  resetCopy();
  const sec = (title, why, frames) => `
  <div class="brow">
    <h2>${title}</h2>
    <p class="why">${why}</p>
    <div class="cands col">${frames.map(([t, f]) => `<div class="cand">${t}${scaled(f)}</div>`).join('')}</div>
  </div>`;
  const pair = (kind, label) => ['A', 'B'].map((o) => [tag(o, OPT[o], ` · ${label} · authored 1920x1080, shown at 75%`, 'B'), cd(o, kind)]);
  const one = (id, label, f) => [[`<div class="tag"><span class="d">${label}</span> · ${id}<span class="pc">COPY APPROVED</span></div>`, f]];
  const rows = [];
  rows.push(sec('IDLE · one face-down card per remaining name', `Drawn as round 2 of 4 of the one event (gh#302 fixture: ${EV.field1.length} joined, round 1 ${EV.field1.length} to ${EV.pass1.size}, this round ${FIELD.length} to ${PASS.size}; the generator refuses a schedule that does not decrease within ${MAX_HEADS} heads). Same in both options. Each card is its name's slot in the field: a night card back with a gold edge, the name on it. 3D intent: one InstancedMesh of thin card boxes on a plane facing the camera, the backs one texture, the names one canvas-texture atlas; the deal is the cards sliding in from a single stack at the centre, 0.02s apart. No table surface: the cards float on the night ground (no felt, no chips, no money).`, pair('idle', 'cd-idle')));
  rows.push(sec('ROUND CODE · QR mode only · the 12-digit card-deal code', 'gh#302 pick: a card-deal round\'s code is 12 digits, grouped 4-4-4. It shows right after the deal and before the rule (decision 13: the phone shows its own card before the rule is drawn). Drawn with the gh#302 picked code card as it now stands (1500px wide, 24px radius; 9 digits at 180px, 12 digits at 150px). Same in both options; admin-typed mode skips this frame.', one('cd-code', 'BOTH', codeFrame())));
  rows.push(sec('RULE · drawn at random after the deal', `<b>A</b> puts the rule in the lower band, the field still in view. <b>B</b> brings a large rule card to the centre over a veil; it shrinks into the lower band before the flip. The rule shown is one of the three in the sketch; the hand was composed so that exactly ${PASS.size} cards meet it.`, pair('rule', 'cd-rule')));
  rows.push(sec('REVEAL · the flip', `<b>A FLIP WAVE</b>: the cards flip row by row from the top, and each row is judged three rows behind the wave front (drawn with 10 of ${Math.ceil(FIELD.length / COLS)} rows flipped). <b>B ALL AT ONCE</b>: a drumroll, then every card flips in one 600ms beat; the room reads its own card before any judging (drawn at that moment: all face up, nothing judged yet).`, pair('reveal', 'cd-reveal')));
  rows.push(sec('ROUND RESULT', 'A card that meets the rule keeps a gold ring and glow and its name goes bold; a card that does not fades to the night ground, its rank, suit and name dimmed and struck through. Black and red alone would be colour only: the ring, the strike and the legend carry it too, and the suit shapes differ.', pair('result', 'cd-result')));
  rows.push(sec('REDUCED MOTION', 'Reduce, not remove: no deal slide, no flip turn, no wave. Cards change face in place with one 200ms fade, then the judging fades in over 200ms (gh#302\'s --motion-rm-fade). The rule still appears before the faces, so the order of the round is kept. Drawn at the end state.', pair('rm', 'cd-rm')));
  rows.push(sec('NEVER-BLANK FALLBACK (ADR-0051)', 'The plain 2D reveal the owner picked on gh#302 (B, proj-reveal), with the rule named in the lower band. Identical for both options.', one('cd-fallback', 'FALLBACK', frame('cd-fallback', 'F', '', plainReveal(GNAME(), { round: 2, lowExtra: `<div class="lk">${th('กติการอบนี้', 'cards: rule label')} ${RULE()}</div>` })))));

  const beatsA = [
    ['deal', `${FIELD.length} x 0.02s stagger, 400ms each = ${(FIELD.length * 0.02 + 0.4).toFixed(1)}s`, 'cards slide from one stack to their slots, ease-out', 'cards fade in place, 200ms'],
    ['code (QR mode)', 'until the MC moves on', 'veil 300ms, code card scales 0.96 to 1.0 ease-out', 'veil and card fade 200ms'],
    ['rule draw', '1600ms', 'a rule card spins in the lower band (rotateY, 2 turns, ease-out) and lands face up', 'rule fades in 200ms'],
    ['flip wave', '17 rows x 120ms = 2s', 'each row turns 180 degrees in 360ms, ease-in-out (a turn, both ends matter)', 'faces change in place, one 200ms fade'],
    ['judge', 'runs 3 rows behind the wave, ends 360ms after it', 'ring and glow come up 200ms; fails dim and strike 300ms', 'one 200ms fade for all'],
    ['count', '800ms', `counter ${FIELD.length} to ${PASS.size} linear`, 'jumps'],
  ];
  const beatsB = [
    ['deal', '2.4s', 'as A', 'as A'],
    ['code (QR mode)', 'until the MC moves on', 'as A', 'as A'],
    ['rule draw', '2000ms', 'the rule card flies to the centre, flips (ease-out), holds 800ms, shrinks to the band 400ms', 'rule card fades in 200ms, holds, fades to the band'],
    ['drumroll', '1500ms', 'every card trembles 2px, the camera dollies in 3%', 'none'],
    ['flip', '600ms', `all ${FIELD.length} turn at once (InstancedMesh: one uniform drives every flip)`, 'faces change in place, 200ms'],
    ['hold', '1200ms', 'nothing moves: the room reads its own card', 'same'],
    ['judge + count', '500ms + 800ms', 'fails dim from the edges in, 0.02s apart; counter rolls', 'one 200ms fade; counter jumps'],
  ];
  rows.push(`
  <div class="brow">
    <h2>MOTION · beat by beat, with the time chosen for each beat</h2>
    <p class="why">Timings are this board's proposal, shaped by the ui-ux-pro-max motion rules (RULES CHECKED); its gsap stagger rule set the 0.02s step. From rule to result: about 8s in A, about 8.6s in B.</p>
    <h3>A FLIP WAVE</h3>${beatTable(beatsA)}<h3>B ALL AT ONCE</h3>${beatTable(beatsB)}
  </div>`);
  rows.push(rulesRow('--domain ux "animation duration timing easing", "reduced motion", "excessive motion focal point", "projector legibility contrast large display distance", "color not only indicator"; --domain gsap "stagger timeline sequence"; --stack threejs "instanced mesh many objects draw calls", "webgl fallback context lost", "dispose memory pixel ratio", "text labels sprites canvas texture".', [
    '<b>Color Only</b>: the drawn rule may be a colour ("black stays"), so passing is shown by a gold ring, glow and bold name, failing by fade, dim and strike; suit shapes differ; the legend says it in words.',
    '<b>Excessive Motion</b>: A animates the wave front only; B one flip, then the judging. Chrome is still.',
    '<b>Reduced Motion</b>: the end state, reached by fades; the rule-then-faces order is kept.',
    '<b>Stagger List</b> (gsap, 0.02 to 0.04s past 10 items): the deal and B\'s judging step 0.02s.',
    '<b>Easing Functions</b>: ease-out on arrivals, ease-in-out on the flip (a turn), linear on the count.',
    '<b>Color Contrast</b>: every text pair below clears 4.5:1, computed, not measured on a projector. Red suits use #c2185b (a PROPOSAL, darker than --accent-punch: punch on white is 3.47:1, under 4.5:1 for a 16px rank).',
    `<b>threejs</b>: InstancedMesh for the ${FIELD.length} cards; names in one canvas-texture atlas, disposed with the round; Single Renderer Per Page; Pixel Ratio Cap at 2; canvas role="img" plus an aria-label, the rule and the count announced in a live region (ADR-0051).`,
  ]));
  const pairs = [...STAGE_PAIRS, ['#14142b', '#ffffff', 'rank and name on a face-up card'], ['#c2185b', '#ffffff', 'red rank and suit on a face-up card (PICKED 2026-11-11)'], ['#ff3d7f', '#ffffff', 'for comparison: --accent-punch on white, not used for the rank']];
  rows.push(`
  <div class="brow">
    <h2>VALUES · every frame value, token, gh#302 pick, or PROPOSAL</h2>
    <p class="why">${STAGE_DEVIATIONS} <b>Fonts:</b> Mitr 700 for ranks, rule and numbers; Sarabun for names. <b>Name-fit rule (PICKED 2026-11-11, was PROPOSAL):</b> a name starts at 20px and, if it does not fit its card with 2% slack, shrinks 1px at a time, never below 16px (the NAME FIT row); the board draws the three NAME FIT worst cases among the ${FIELD.length} names dealt (NAME FIT row). <b>Rank (REFUTE round 1):</b> 30px Mitr 700 beside a 24px suit, the projector minimum for non-name text, on 6 columns of 40px rows for the ${FIELD.length} cards of round 2. <b>New on this board, PICKED 2026-11-11 (was PROPOSAL):</b> #c2185b for red suits and ranks (C2, approved); #2e2b63 as the card-back hatch line; card radius 6px; the rule card of B ALL AT ONCE (700px wide, 32px radius, rule at 120px); the lower band at 190px with the count at 130px (gh#302's is 220px and 150px; the field needs the room).</p>
    <div class="cands"><div class="cand">${valuesTable([...STAGE_VALUES, ['#c2185b', 'red suit and rank on a face-up card', 'PICKED 2026-11-11 (was PROPOSAL (new colour); C2)'], ['#2e2b63', 'card back hatch line', 'PICKED 2026-11-11 (was PROPOSAL (new colour, decorative))'], ['#3d3b5c', 'rule card label', 'tokens.css --color-muted']])}</div><div class="cand">${contrastTable(pairs)}</div></div>
  </div>`);
  rows.push(nameFitRow([[`cards (${FIELD.length} names)`, 'Sarabun 400; 700 on a passing card', '20px', '16px', '1 of 6 columns, less the 66px rank and suit', 'W x12 and U+0E12 x12: 19px, one line; U+0E12 U+0E33 x12: 16px, two lines (its row grows)'], ['fallback field (gh#302 picked)', 'Sarabun 700 / 400', '20px', '14px', '1 of 10 columns, 8px side padding', 'W x12 and U+0E12 x12: 14px, one line; U+0E12 U+0E33 x12: 14px, two lines (as on the gh#302 board)']]));
  rows.push(rolesRow('Gh303Cards'));
  rows.push(copyRow());
  rows.push(notesRow([
    '<b>Rests on gh#299:</b> decisions 7 (the rule is drawn at random after the deal; the hand is composed so the cut lands exactly), 13 (as many decks as needed; the phone shows its own card before the rule), the game sketch, and the gambling-wording constraint (no casino styling). <b>On gh#302 (picked):</b> direction B, the 12-digit 4-4-4 card-deal code, the copy.',
    '<b>The other two rules in the sketch</b> ("ดอกจิกเท่านั้น", "เฉพาะไพ่หน้าคน") draw the same way; only the rule text and which faces pass change.',
    '<b>Not covered:</b> a real projector, venue frame rate, the phone\'s own-card screen (gh#302 board).',
  ]));
  const OWNER = `<div class="pin q"><b>DECISIONS FOR THE OWNER (answered 2026-11-11, see APPROVAL RESULT above; the questions stay as history):</b><ul>
  <li><b>C1. Reveal</b>: A FLIP WAVE (rule in the lower band, cards flip row by row with judging just behind; frames cd-rule A, cd-reveal A) or B ALL AT ONCE (a centre rule card, a drumroll, one flip for everyone, a beat to read, then the judging; frames cd-rule B, cd-reveal B).</li>
  <li><b>C2. Red suits at #c2185b</b> (a new colour) rather than --accent-punch, which misses 4.5:1 on white for a 16px rank.</li>
  <li><b>C3. Proposed copy</b>: approve, or mark strings to change (COPY SOURCES row).</li>
</ul></div>`;
  return boardDoc('gh#303 · prize draw · deal-the-whole-room cards', 'gh#303: proposal board, ADR-0033.', ['<b style="color: #ffcc00;">APPROVAL RESULT 2026-11-11 (owner popups):</b> C1 reveal: <b>B ALL AT ONCE</b> PICKED (A FLIP WAVE NOT PICKED, its frames stay below as history). C2: red suits at #c2185b APPROVED. C3: all proposed Thai copy APPROVED as it stands. The PROPOSAL values of the picked option are now picked values (VALUES row).', ORDER_LINE, 'Visual language: the gh#302 pick (B NIGHT STAGE on the projector, 2026-11-11). Two options where a real choice exists; idle, reveal, round result, reduced motion and the never-blank fallback are drawn. Frames are 2D stills of a 3D scene (three, ADR-0060).', OWNER], STAGE_CSS + CSS, rows, { status: 'APPROVED 2026-11-11: C1 B PICKED', pick: 'B' });
}
