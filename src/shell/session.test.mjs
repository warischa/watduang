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

// ADR-0010's closing lines flagged a suspected clobber: game B's start (setPlayers) might stomp
// game A's still-live checkpoint, since both write the same site-wide slot. On this ordering they
// don't collide — but not because setPlayers re-reads storage. session.checkpoint is the snapshot
// loadSession() captured at load time (session.ts:67), and setPlayers writes that same snapshot
// back unchanged (session.ts:70); the only re-read write() does is existence-only, "does the key
// still exist at all" (session.ts:53). What actually keeps this safe is that every start calls
// loadSession() and setPlayers() back-to-back with nothing in between (game/[id].astro:50-51) — no
// writer gets a chance to land between a closure's creation and its own setPlayers. The next test
// pins what happens when that adjacency is broken.
test('game B start (setPlayers) preserves game A checkpoint — refutes the ADR-0010 clobber claim', () => {
  slots.clear();
  const gameA = loadSession();
  gameA.setPlayers(['Alice', 'Bob']);
  gameA.saveCheckpoint(midRound(7));

  const gameB = loadSession();
  gameB.setPlayers(['Chai', 'Dao']);

  assert.equal(loadSession().checkpoint.phase, 'drawn', 'game B start must not clobber game A checkpoint');
});

// Boundary pin, not a bug report: a closure captured BEFORE another closure's saveCheckpoint holds a
// stale snapshot (checkpoint: null), and its own later setPlayers writes that stale snapshot straight
// back — clobbering the checkpoint the other closure saved in between. Production never reaches this
// ordering: every start calls loadSession() and setPlayers() back-to-back inside one handler
// (game/[id].astro:50-51), so nothing can land between a closure's creation and its own setPlayers.
// This test exists so that if that adjacency is ever broken, this is the failure that fires.
test('a checkpoint writer landing between a closure\'s creation and its own setPlayers drops it', () => {
  slots.clear();
  loadSession().setPlayers(['Alice', 'Bob']); // creates the record, same as a start in production
  const gameB = loadSession(); // hostile ordering: snapshot taken BEFORE game A's checkpoint save

  const gameA = loadSession();
  gameA.saveCheckpoint(midRound(7));
  // positive control: the save really landed, so the drop below is a clobber and not "never wrote"
  assert.equal(loadSession().checkpoint.phase, 'drawn');

  gameB.setPlayers(['Chai', 'Dao']); // gameB's snapshot predates the save — writes checkpoint: null back
  assert.equal(
    loadSession().checkpoint,
    null,
    'a closure created before the checkpoint save clobbers it on its own later setPlayers',
  );
});

// F1 (ADR-0010, open finding S2026-08-15#2) — the sibling caller 65d3d3c did not cover. siamsi.ts:344
// is a SECOND setPlayers on the closure the start handler built, and on first mount `await load()`
// (game/[id].astro:56) separates it from that closure's creation. The panel is live in that gap:
// ล้างกลุ่มนี้ → clear() (PlayerSetup.astro:304) empties the record and location.reload() (:310) is a
// macrotask away, so the module's continuation can land first. Same detector as the test above —
// slots.size is raw record presence — plus planStart as the symptom the player actually meets.
test('F1: the resume path\'s late setPlayers must not rebuild a record that was discarded meanwhile', () => {
  slots.clear();
  // A live round is already in the slot — this is the refresh-resume entry (#20), the only path that
  // reaches siamsi.ts:344 at all.
  const shell = loadSession();
  shell.setPlayers(['Alice', 'Bob']);
  shell.saveCheckpoint(midRound(7));

  // watduang:start → game/[id].astro:50-51: one closure, its own setPlayers, back-to-back. It captures
  // the live checkpoint as its snapshot, which is what a rebuilt record would carry back in.
  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']);
  // Positive control: this closure really can write, so a later "no record" is a refusal and not a
  // harness that was never able to create one.
  assert.equal(slots.size, 1);
  assert.equal(loadSession().checkpoint.phase, 'drawn');

  // ...await load() suspends. ล้างกลุ่มนี้ → requestClear(true) loads a FRESH snapshot and clears.
  loadSession().clear();
  assert.equal(slots.size, 0);

  // The module resolves before the reload commits: mountInto resumes off the stale snapshot and writes
  // the checkpoint's roster back (siamsi.ts:344) — a second setPlayers on a closure created long before.
  game.setPlayers(['Alice', 'Bob']);
  assert.equal(slots.size, 0, 'a late resume-path setPlayers re-created the record the player discarded');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the panel offered to resume a round the player discarded — ADR-0008 says a discard is final',
  );
});

// Anti-over-fix control for the guard above, and the reason it cannot simply refuse every later
// setPlayers: while the record is still there, siamsi.ts:344 writing the checkpoint's roster back is
// the whole of refresh-resume (#20) keeping session.players and the round in agreement. Must hold both
// before and after the F1 fix.
test('a later setPlayers still updates a record that is still there — refresh-resume keeps working', () => {
  slots.clear();
  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']); // start handler's own call
  game.saveCheckpoint(midRound(7));

  game.setPlayers(['เอ', 'บี']); // siamsi.ts:344 — the checkpoint's roster, written back on resume
  assert.deepEqual(loadSession().players, ['เอ', 'บี'], 'resume must still be able to write its roster');
  assert.equal(loadSession().checkpoint.phase, 'drawn', 'and must not drop the round it just resumed');
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

// ---- Ordering enumeration (ADR-0010). Replaces a planned browser/CDP interleaving probe: the timing
// of a click landing between clear() and location.reload() belongs to the browser scheduler and the
// HTML navigation task queue, so measuring it converges on nothing. What IS ours and finite is the
// order of calls on the loadSession() closure surface, and the two axes that decide the outcome:
//
//   1. was the closure created BEFORE or AFTER the discard   (stale vs fresh)
//   2. had it already spent its first setPlayers before the discard   (mayCreate, session.ts:81)
//
// The guard protects STALE closures, not all post-discard creation — a fresh closure creating after a
// discard is a new round starting, and refusing that would break every start. Each test below names
// which quadrant it is in. slots.size stays the detector: it is the whole of storage, so it reads raw
// record presence, which checkpoint: null cannot (see the block header above).

// FRESH closure. The anti-over-fix control for the whole guard: "no create after a discard" would be a
// WRONG invariant, and this is the test that would catch someone asserting it. Reachable constantly in
// production — it is every round started after ล้างและทิ้งรอบที่ค้าง and its reload.
test('fresh closure: a discard does not stop the NEXT round from being created', () => {
  slots.clear();
  const first = loadSession();
  first.setPlayers(['Alice', 'Bob']);
  first.saveCheckpoint(midRound(7));
  loadSession().clear();
  assert.equal(slots.size, 0);

  // After the reload, watduang:start fires again: a brand-new closure, its own first setPlayers.
  const nextRound = loadSession();
  nextRound.setPlayers(['เอ', 'บี']);
  assert.equal(slots.size, 1, 'a closure created after the discard must still be able to start a round');
  assert.deepEqual(loadSession().players, ['เอ', 'บี']);
  // ...and the new round is genuinely new: the discarded round did not ride back in on it.
  assert.equal(loadSession().checkpoint, null, 'the new round inherited the discarded round\'s checkpoint');
});

// FRESH-THEN-STALE. "Fresh" is not a property a closure keeps: mayCreate is one-shot per closure, so
// the closure that legitimately created the second round is itself stale once THAT round is discarded.
// This is the ordering that proves the guard is per-closure-first-call and not "anything after the
// first discard is refused" — two discards, and the same closure is on the allowed side of one and the
// refused side of the other.
test('a closure that legitimately created after one discard is stale after the next', () => {
  slots.clear();
  loadSession().setPlayers(['Alice', 'Bob']);
  loadSession().clear();

  const round2 = loadSession();
  round2.setPlayers(['เอ', 'บี']); // allowed: fresh closure, first setPlayers — round 2 starts
  assert.equal(slots.size, 1);
  round2.saveCheckpoint(midRound(7));

  loadSession().clear(); // ล้างและทิ้งรอบที่ค้าง again — now round2's closure is the stale one
  assert.equal(slots.size, 0);

  round2.setPlayers(['เอ', 'บี']); // siamsi.ts:344 writing the roster back, one discard too late
  assert.equal(slots.size, 0, 'a stale closure re-created the round the player discarded');
  round2.setPlayers(['เอ', 'บี']); // the refusal is not one-shot either
  assert.equal(slots.size, 0, 'the second late setPlayers got past a refusal the first one earned');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the panel offered to resume a round the player discarded — ADR-0008 says a discard is final',
  );
});

// Boundary pin, NOT an endorsement — this ordering resurrects the discarded round, checkpoint and all.
// mayCreate is still true, because the closure never spent its first setPlayers before the discard.
// Unreachable today for one reason only: src has exactly two setPlayers callers — game/[id].astro:51,
// which runs sync on the line after its own loadSession() (:50), and siamsi.ts:344, which is always a
// SECOND call on that same closure. PlayerSetup holds closures (:130, :295) but never calls setPlayers.
// The fact that would change this: any new caller that lets a suspend — an await, a click handler, a
// promise — sit between loadSession() and that closure's FIRST setPlayers. Then this test is the live
// ADR-0008 violation it is currently only describing, and it should be made to fail.
test('unguarded: a closure whose FIRST setPlayers lands after the discard re-creates the round', () => {
  slots.clear();
  const shell = loadSession();
  shell.setPlayers(['Alice', 'Bob']);
  shell.saveCheckpoint(midRound(7));

  const pending = loadSession(); // created BEFORE the discard, first setPlayers not spent yet
  loadSession().clear();
  assert.equal(slots.size, 0);

  pending.setPlayers(['Alice', 'Bob']);
  assert.equal(slots.size, 1, 'behaviour changed — an unspent first setPlayers is now refused');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'ask',
    'the discarded round came back with it, and the panel would offer to resume it',
  );
});

// Boundary pin, NOT an endorsement — the same resurrection through the other door. The refusal is
// write()'s existence check (session.ts:54), which asks "is there a record" and not "is this closure
// still entitled to write". So once ANY record exists again, a stale closure is unblocked and writes
// its pre-discard snapshot over it — the discarded checkpoint returns and the new round's roster is
// gone. That existence-only test is deliberate (session.ts:76-79): #20's refresh-resume needs a later
// setPlayers to keep updating a record that is still there. What makes it hard to reach is not the
// reload — that is a macrotask away (session.ts:41), which is the whole premise of F1 — it is that the
// only creator is watduang:start → game/[id].astro:51, and that needs a SECOND gesture: a tap on
// เริ่มรอบ landing inside the same pre-reload window as the ล้างและทิ้งรอบที่ค้าง tap that opened it
// (PlayerSetup.astro:304 → :310). Two gestures in one macrotask window, not one.
// The fact that would change this: any creation that does not need a fresh user gesture — a client
// router replacing the reload, an auto-start, or a queued watduang:start replayed after the clear.
test('unguarded: once a new record exists, a stale closure writes its discarded snapshot into it', () => {
  slots.clear();
  loadSession().setPlayers(['Alice', 'Bob']);
  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']); // its first setPlayers, spent before the discard
  game.saveCheckpoint(midRound(7));

  loadSession().clear();
  const round2 = loadSession();
  round2.setPlayers(['เอ', 'บี']); // a new round is created — the existence check now passes again
  assert.equal(loadSession().checkpoint, null);

  game.setPlayers(['Alice', 'Bob']); // stale, create = false, but the record is there so write() lets it
  assert.deepEqual(
    loadSession().players,
    ['Alice', 'Bob'],
    'behaviour changed — a stale closure no longer overwrites a record it did not create',
  );
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'ask',
    'the discarded round rode back in on the stale snapshot, over the top of the new round',
  );
});
