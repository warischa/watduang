// node --test — no framework, no dependency.
// sessionStorage does not exist in Node, so stub it with what the real one is: a string→string map.
// That is also what makes this test worth having — the checkpoint survives as JSON, not as an object.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const slots = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (slots.has(k) ? slots.get(k) : null),
  setItem: (k, v) => slots.set(k, String(v)),
  removeItem: (k) => slots.delete(k),
};

const { loadSession } = await import('./session.ts');
const { planStart } = await import('./player-select.ts');

/** A mid-round siamsi blob — only the envelope matters here, the shape is the game's business. */
const midRound = (n) => ({
  game: 'siamsi',
  players: ['Alice', 'Bob'],
  deck: [],
  holder: 1,
  results: [{ player: 'Alice', n: 24 }, { player: 'Bob', n }],
  phase: 'drawn',
  drawn: n,
});

// #23 — "เริ่มรอบใหม่" abandons the round in progress on purpose. If the slot is not actually empty
// before the game mounts, the game's resume finds the old blob and the "new" round IS the old one.
test('#23 saveCheckpoint(null) empties the slot for real — a fresh round cannot inherit the old one', () => {
  slots.clear();
  const session = loadSession();
  session.setPlayers(['เอ', 'บี']);
  session.saveCheckpoint({ game: 'siamsi', players: ['เอ', 'บี'], holder: 0 });
  // positive control: the slot really held a round, so the null below is a clear and not an empty start
  assert.equal(loadSession().checkpoint.game, 'siamsi');

  session.saveCheckpoint(null);
  assert.equal(loadSession().checkpoint, null);
  // clearing the round must not clear the วง — the ticked group is the player's, not the round's
  assert.deepEqual(loadSession().players, ['เอ', 'บี']);
});

// ---- ADR-0008: a discard is final. Ported from a browser race harness that reproduced this 12/12
// across two runs and three write paths (#ss-draw, #ss-pass mid-round, #ss-pass at round-over).
//
// The browser part was only a way to land a click inside the window between session.clear() and
// location.reload(). The bug itself is not about timing: loadSession() hands out an INDEPENDENT
// mutable closure per call, so the shell's clear() and the mounted game's save() are two writers over
// one key with no link between them. Two closures in one process reproduce it with no DOM at all —
// which is why this test can live in `node --test` and still be the same defect.
//
// slots is the detector: it is the whole of storage, so slots.size is "does the record exist". The
// checkpoint field cannot be the detector — the round-over variant revives the record with
// checkpoint: null, which reads identical to an absent record through loadSession().

// Negative control, and the both-ways calibration of slots.size: it reports 1 when a record really is
// there and 0 when it is not, on the clean path with no racing click. Also pins that setPlayers is
// still allowed to CREATE the record — the whole flow starts with that write (game/[id].astro fires
// setPlayers on watduang:start), so a guard that refused it would break every start.
test('negative control: a clean discard with no racing click leaves the slot empty', () => {
  slots.clear();
  const shell = loadSession();
  shell.setPlayers(['Alice', 'Bob']);
  assert.equal(slots.size, 1, 'setPlayers must still create the record — it is the one creator');
  shell.saveCheckpoint(midRound(2));
  assert.equal(slots.size, 1);

  loadSession().clear();
  assert.equal(slots.size, 0, 'ล้างและทิ้งรอบที่ค้าง must empty the slot');
});

test('a discard is final — a write racing in through a stale session closure must not resurrect it', () => {
  slots.clear();
  // The shell creates the record when the round starts (game/[id].astro: setPlayers on watduang:start)
  loadSession().setPlayers(['Alice', 'Bob']);
  // The mounted game holds its OWN closure — ctx.session is built once, at start, and outlives any clear
  const game = loadSession();
  game.saveCheckpoint(midRound(2));
  // Positive control: the detector can see a real checkpoint write through exactly this closure, so a
  // later "no write happened" is a refusal and not a harness that cannot write in the first place.
  assert.equal(slots.size, 1);
  assert.equal(loadSession().checkpoint.phase, 'drawn');

  // ล้างและทิ้งรอบที่ค้าง — PlayerSetup.requestClear(true) loads a FRESH snapshot and clears through it
  loadSession().clear();
  assert.equal(slots.size, 0);

  // The tap that landed before location.reload() unloaded the page (harness variants A–D: #ss-draw and
  // #ss-pass mid-round both reach save() → saveCheckpoint through the stale closure)
  game.saveCheckpoint(midRound(19));
  assert.equal(slots.size, 0, 'a stale closure re-created the record the player discarded');

  // Harness variant E — the round-over path revived the whole record instead of the checkpoint:
  // markPlayed writes, then saveCheckpoint(null) writes again, leaving players + played behind.
  game.markPlayed('siamsi');
  game.saveCheckpoint(null);
  assert.equal(slots.size, 0, 'markPlayed + saveCheckpoint(null) revived the discarded session record');

  // Harness variant F — the symptom the player actually met, one level up from storage: after the
  // reload, pressing เริ่มรอบ offered กลับไปเล่นรอบที่ค้าง for the round they had explicitly thrown away.
  // Same decision the shell makes, through the real planStart.
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the panel offered to resume a round the player discarded — ADR-0008 says a discard is final',
  );
});
