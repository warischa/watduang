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

// #23 — "Start new round" abandons the round in progress on purpose. If the slot is not actually empty
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
  // clearing the round must not clear the group — the ticked group is the player's, not the round's
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
// don't collide — but not because setPlayers merges anything. session.checkpoint is the snapshot
// loadSession() captured at load time, and setPlayers writes that same snapshot back unchanged; the
// re-read write() does is an identity compare, "is the record in the slot still the one this closure
// is talking about", and here it is — both closures hold the same record's id, so the guard passes by
// design and gameB carries gameA's checkpoint back in. What actually keeps this safe is that every start calls
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

// Was a boundary pin describing a hole; the gen token closes it (gh#49). A closure captured BEFORE
// another closure's saveCheckpoint holds a stale snapshot (checkpoint: null), and its own later
// setPlayers used to write that stale snapshot straight back over the checkpoint saved in between.
// Identity cannot catch it and is not meant to — both closures hold the SAME record's id, so this is
// one round's own writers disagreeing about its contents, not a discarded round coming back. That is
// exactly the second question gen answers, and it is the same defect gh#49 met in a browser: same id,
// older copy. Production still never reaches this ordering (every start calls loadSession() and
// setPlayers() back-to-back inside one handler, game/[id].astro:50-51), so this pins the guard for the
// day that adjacency breaks — it no longer pins a loss.
test('a checkpoint writer landing between a closure\'s creation and its own setPlayers is refused', () => {
  slots.clear();
  loadSession().setPlayers(['Alice', 'Bob']); // creates the record, same as a start in production
  const gameB = loadSession(); // hostile ordering: snapshot taken BEFORE game A's checkpoint save

  const gameA = loadSession();
  gameA.saveCheckpoint(midRound(7));
  // positive control: the save really landed, so the survival below is a refusal and not "never wrote"
  assert.equal(loadSession().checkpoint.phase, 'drawn');

  gameB.setPlayers(['Chai', 'Dao']); // gameB's snapshot predates the save — would write checkpoint: null back
  assert.equal(
    loadSession().checkpoint.phase,
    'drawn',
    'a closure created before the checkpoint save clobbered it on its own later setPlayers',
  );
  assert.deepEqual(
    loadSession().players,
    ['Alice', 'Bob'],
    'the whole write must be refused, not just the checkpoint field',
  );
});

// F1 (ADR-0010, open finding S2026-08-15#2) — the sibling caller 65d3d3c did not cover. siamsi.ts mountInto()
// is a SECOND setPlayers on the closure the start handler built, and on first mount `await load()`
// (game/[id].astro:56) separates it from that closure's creation. The panel is live in that gap:
// Clear group → requestClear() in PlayerSetup.astro empties the record through clear() and its
// location.reload() is a macrotask away, so the module's continuation can land first. Same detector as the test above —
// slots.size is raw record presence — plus planStart as the symptom the player actually meets.
test('F1: the resume path\'s late setPlayers must not rebuild a record that was discarded meanwhile', () => {
  slots.clear();
  // A live round is already in the slot — this is the refresh-resume entry (#20), the only path that
  // reaches siamsi.ts mountInto() at all.
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

  // ...await load() suspends. Clear group → requestClear(true) loads a FRESH snapshot and clears.
  loadSession().clear();
  assert.equal(slots.size, 0);

  // The module resolves before the reload commits: mountInto resumes off the stale snapshot and writes
  // the checkpoint's roster back (siamsi.ts mountInto()) — a second setPlayers on a closure created long before.
  game.setPlayers(['Alice', 'Bob']);
  assert.equal(slots.size, 0, 'a late resume-path setPlayers re-created the record the player discarded');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the panel offered to resume a round the player discarded — ADR-0008 says a discard is final',
  );
});

// Anti-over-fix control for the guard above, and the reason it cannot simply refuse every later
// setPlayers: while the record is still there, siamsi.ts mountInto() writing the checkpoint's roster back is
// the whole of refresh-resume (#20) keeping session.players and the round in agreement. Must hold both
// before and after the F1 fix.
test('a later setPlayers still updates a record that is still there — refresh-resume keeps working', () => {
  slots.clear();
  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']); // start handler's own call
  game.saveCheckpoint(midRound(7));

  game.setPlayers(['เอ', 'บี']); // siamsi.ts mountInto() — the checkpoint's roster, written back on resume
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

  // Clear-and-drop-pending-round — PlayerSetup.requestClear(true) loads a FRESH snapshot and clears through it
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
  // reload, pressing Start round offered Resume-pending-round for the round they had explicitly thrown away.
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
//   2. is there a record in the slot when it writes, and is it the SAME one   (identity, session.ts)
//
// Both axes are now one question, which is the point of the identity guard: a closure may write only
// the record it is talking about. Stale-vs-absent and stale-vs-newer are both refusals; a fresh
// closure creating after a discard is a new round starting, and refusing that would break every
// start. Each test below names which quadrant it is in. slots.size stays the detector: it is the
// whole of storage, so it reads raw record presence, which checkpoint: null cannot (see above).

// FRESH closure. The anti-over-fix control for the whole guard: "no create after a discard" would be a
// WRONG invariant, and this is the test that would catch someone asserting it. Reachable constantly in
// production — it is every round started after Clear-and-drop-pending-round and its reload.
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

// FRESH-THEN-STALE. "Fresh" is not a property a closure keeps: creating a round is what gives a
// closure its identity, so the closure that legitimately created round 2 holds round 2's identity and
// is itself stale once THAT round is discarded. This is the ordering that proves the guard tracks
// which record a closure owns and is not "anything after the first discard is refused" — two
// discards, and the same closure is on the allowed side of one and the refused side of the other.
test('a closure that legitimately created after one discard is stale after the next', () => {
  slots.clear();
  loadSession().setPlayers(['Alice', 'Bob']);
  loadSession().clear();

  const round2 = loadSession();
  round2.setPlayers(['เอ', 'บี']); // allowed: fresh closure, first setPlayers — round 2 starts
  assert.equal(slots.size, 1);
  round2.saveCheckpoint(midRound(7));

  loadSession().clear(); // Clear-and-drop-pending-round again — now round2's closure is the stale one
  assert.equal(slots.size, 0);

  round2.setPlayers(['เอ', 'บี']); // siamsi.ts mountInto() writing the roster back, one discard too late
  assert.equal(slots.size, 0, 'a stale closure re-created the round the player discarded');
  round2.setPlayers(['เอ', 'บี']); // the refusal is not one-shot either
  assert.equal(slots.size, 0, 'the second late setPlayers got past a refusal the first one earned');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the panel offered to resume a round the player discarded — ADR-0008 says a discard is final',
  );
});

// STALE, first setPlayers unspent. Was a boundary pin describing a hole; the identity guard closes it.
// The closure loaded the record, so it captured that record's id — spending its first setPlayers is
// irrelevant now, what it holds is an id for a record that no longer exists, and captured-id vs absent
// is a refusal. Still unreachable in production (src has exactly two setPlayers callers:
// game/[id].astro:51, sync on the line after its own loadSession() at :50, and siamsi.ts mountInto(), always a
// SECOND call on that same closure), so this pins the guard for the day a caller lets an await sit
// between loadSession() and its FIRST setPlayers — the ordering that used to resurrect the round.
test('a closure whose FIRST setPlayers lands after the discard is refused — its record is gone', () => {
  slots.clear();
  const shell = loadSession();
  shell.setPlayers(['Alice', 'Bob']);
  shell.saveCheckpoint(midRound(7));

  const pending = loadSession(); // created BEFORE the discard, first setPlayers not spent yet
  loadSession().clear();
  assert.equal(slots.size, 0);

  pending.setPlayers(['Alice', 'Bob']);
  assert.equal(slots.size, 0, 'an unspent first setPlayers re-created the record the player discarded');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the panel offered to resume a round the player discarded — ADR-0008 says a discard is final',
  );
});

// STALE, record re-exists — the same resurrection through the other door, and the reason the guard
// had to become identity-based. An existence check asks "is there a record" and not "is this closure
// still entitled to write", so once ANY record existed again a stale closure was unblocked and wrote
// its pre-discard snapshot over it: the discarded checkpoint back, the new round's roster gone. The
// identity a closure captured is the difference — round 2 minted its own, so the stale closure's id
// no longer matches what is in the slot. #20's refresh-resume is unaffected: a closure updating the
// record it is actually talking about still matches (see the anti-over-fix control above).
// All three writers route through the same chokepoint, so the refusal covers the sibling callers the
// old check left open too — timebomb.ts:230 (markPlayed) and siamsi.ts:283 (saveCheckpoint).
test('once a new record exists, a stale closure cannot write its discarded snapshot into it', () => {
  slots.clear();
  loadSession().setPlayers(['Alice', 'Bob']);
  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']); // its first setPlayers, spent before the discard
  game.saveCheckpoint(midRound(7));

  loadSession().clear();
  const round2 = loadSession();
  round2.setPlayers(['เอ', 'บี']); // a new round is created, with an identity of its own
  assert.equal(loadSession().checkpoint, null);

  game.setPlayers(['Alice', 'Bob']); // stale identity vs round 2's — the record exists, but not its record
  assert.deepEqual(
    loadSession().players,
    ['เอ', 'บี'],
    'a stale closure overwrote the roster of a round it did not create',
  );
  game.saveCheckpoint(midRound(19)); // siamsi.ts:283, same chokepoint
  game.markPlayed('siamsi'); // timebomb.ts:230, same chokepoint
  assert.deepEqual(loadSession().played, [], 'a stale markPlayed landed on the new round');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the discarded round rode back in on the stale snapshot, over the top of the new round',
  );
});

// Preserved behaviour, now pinned: identity decides WHICH record a closure may write, and setPlayers
// is still the only writer allowed to bring one into being. games/_template.ts:29-31 documents that
// contract to every future game ("a checkpoint saved before setPlayers silently does nothing"), and
// requestStart()'s discard-then-start branch in PlayerSetup.astro leans on it — it calls
// saveCheckpoint(null) on a panel closure before any round exists, and that must not leave
// an empty record behind.
test('only setPlayers creates: a checkpoint or markPlayed before any start writes nothing', () => {
  slots.clear();
  const session = loadSession();

  session.saveCheckpoint(midRound(7));
  assert.equal(slots.size, 0, 'saveCheckpoint created a record before any round had started');
  session.markPlayed('siamsi');
  assert.equal(slots.size, 0, 'markPlayed created a record before any round had started');

  // positive control: the same closure, same empty slot — setPlayers can create, so the two refusals
  // above are a refusal and not a harness that could never write.
  session.setPlayers(['Alice', 'Bob']);
  assert.equal(slots.size, 1);
  assert.deepEqual(loadSession().players, ['Alice', 'Bob']);
});

// A record persisted before identities existed. sessionStorage keeps it for the whole 6h window, so
// on the deploy that adds the field there are live sessions in exactly this shape — mid-round, mid-tab.
// It is seeded straight into the Map on purpose: writing it through loadSession() would stamp it with
// the very identity this test says is missing. A record with no identity matches every closure (that
// is the pre-identity, existence-based behaviour) — but it must not hand one a create capability.
test('legacy record with no identity: a closure loaded off it still writes, and still loses it on clear', () => {
  slots.clear();
  slots.set(
    'watduang:session',
    JSON.stringify({ players: ['Alice', 'Bob'], played: [], checkpoint: midRound(7), stamp: Date.now() }),
  );

  const game = loadSession();
  assert.equal(game.checkpoint.phase, 'drawn', 'a legacy record must still load');
  game.setPlayers(['เอ', 'บี']); // siamsi.ts mountInto() on resume, mid-window
  assert.deepEqual(loadSession().players, ['เอ', 'บี'], 'refresh-resume broke for sessions that predate the field');
  assert.equal(loadSession().checkpoint.phase, 'drawn', 'and it dropped the round it just resumed');

  loadSession().clear();
  game.setPlayers(['เอ', 'บี']);
  assert.equal(slots.size, 0, 'a legacy closure re-created the record the player discarded');
});

// write() swallows a throwing setItem on purpose — Safari private mode and a full quota must not take
// the page down, the session just stays in memory. The identity must be committed only AFTER setItem
// returns, or that swallow turns into a permanent one: the closure would hold an id no record carries,
// and every later write would compare it against an empty slot and refuse forever.
test('a setItem that throws mints nothing — the closure can still write once storage comes back', () => {
  slots.clear();
  const realSetItem = sessionStorage.setItem;
  sessionStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };

  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']); // swallowed: nothing persisted, so nothing may be claimed either
  assert.equal(slots.size, 0);

  sessionStorage.setItem = realSetItem;
  game.setPlayers(['Alice', 'Bob']);
  assert.equal(slots.size, 1, 'a failed write left the closure holding an identity no record carries');
  assert.deepEqual(loadSession().players, ['Alice', 'Bob']);
});

// F2 — an aged record must refuse a write, not resurrect it. read() already reports an aged record as
// empty (readRaw()'s aging check, session.ts:32); the OLD write() disagreed — it only checked the key's
// existence, so a save on a record older than MAX_AGE_MS still persisted and refreshed the stamp. That
// disagreement was the bug: MAX_AGE_MS means gone, and write() must agree with read() about it.
//
// slots.size cannot detect this: the aged record is still one string in the map, before and after a
// refused write. Byte-identity of the stored value is the observable that discriminates a real refusal
// from a no-op that still touched storage — seeded directly into slots, same idiom as the legacy-record
// test above, so the record carries an age no closure minted it with.
test('an aged record refuses write() and read() reports it empty — MAX_AGE_MS means both agree', () => {
  slots.clear();
  const agedStamp = Date.now() - 7 * 60 * 60 * 1000; // > MAX_AGE_MS (6h)
  slots.set(
    'watduang:session',
    JSON.stringify({ id: 'r1', players: ['Alice', 'Bob'], played: [], checkpoint: midRound(7), stamp: agedStamp }),
  );
  const before = slots.get('watduang:session');

  const game = loadSession();
  // read() half: an aged record loads as if it were not there at all.
  assert.equal(game.checkpoint, null, 'an aged record must load as empty, not the stale checkpoint');
  assert.deepEqual(game.players, []);

  // write() half: a non-creating writer must refuse rather than persist over an aged record.
  game.saveCheckpoint(midRound(19));
  assert.equal(slots.get('watduang:session'), before, 'saveCheckpoint on an aged record must not persist');
  assert.equal(loadSession().checkpoint, null, 'read() must still report the aged record empty after the refusal');

  game.markPlayed('siamsi'); // same chokepoint as saveCheckpoint
  assert.equal(slots.get('watduang:session'), before, 'markPlayed on an aged record must not persist');

  // Anti-over-fix control: setPlayers is the one creator, and an aged record must not block a start
  // (session.ts:26) — only non-creating writers refuse.
  game.setPlayers(['เอ', 'บี']);
  assert.notEqual(
    slots.get('watduang:session'),
    before,
    'setPlayers must still be able to start a fresh round over an aged record',
  );
  assert.deepEqual(loadSession().players, ['เอ', 'บี']);
});

// ---- gh#49: a bfcache-restored page overwrites a newer checkpoint with its own stale one.
// CONFIRMED in a real browser twice (docs/verification/evidence/49/README.md): both page instances
// held record id mt0576wa-1, so the identity compare passed and the stale write landed — holder 2->1,
// results 2->1, deck [23,10]->[1,23,10], a drawn card back in the deck. No confirm, no message, no undo.
//
// Two closures over one record id IS the whole mechanism, so it reproduces here with no bfcache: a
// restored page holds exactly a stale closure. The wall-clock stamp cannot be the token — the
// clobbering write carried the NEWER stamp (1787147041344 over 1787147038224). `gen` counts writes to
// the record rather than time, so it orders the two writers instead of the two clocks.
test('gh#49: a stale closure on the SAME record cannot write over a newer checkpoint', () => {
  slots.clear();
  // Instance #1 — the page that will be bfcached. It starts the round, so it owns the identity.
  const instance1 = loadSession();
  instance1.setPlayers(['Alice', 'Bob']);
  instance1.saveCheckpoint(midRound(2));

  // Instance #2 — the same tab navigates back into the game. Same record, same id, fresh closure.
  const instance2 = loadSession();
  assert.equal(instance2.checkpoint.drawn, 2, 'positive control: instance #2 loaded the live round');
  instance2.saveCheckpoint(midRound(10)); // play continues here while #1 sits frozen
  assert.equal(loadSession().checkpoint.drawn, 10, 'positive control: instance #2 can write at all');

  // history.back() -> bfcache restore -> the player taps on the frozen page. Its snapshot predates
  // instance #2's move, and its id still matches, so identity alone waves it through.
  instance1.saveCheckpoint(midRound(19));
  assert.equal(loadSession().checkpoint.drawn, 10, 'a bfcache-restored page overwrote the newer checkpoint');

  // Anti-over-fix control: refusing the stale write must not cost the LIVE page its own next write.
  // A guard that advanced the token on a refusal would strand instance #2 here.
  instance2.saveCheckpoint(midRound(23));
  assert.equal(loadSession().checkpoint.drawn, 23, 'the live page lost its own write to the refusal');
});

// gh#49 through the LEGACY_ID door. The identity compare is skipped entirely when the stored record
// carries no id, so on a pre-identity record every closure loaded off it could clobber every other.
// `gen` is seeded to 0 when the field is absent, which is why one check covers this path with no
// legacy branch of its own — and why the check must sit OUTSIDE the identity branch.
test('gh#49 legacy: a gen-less record writes through its own closure and refuses a stale sibling', () => {
  slots.clear();
  slots.set(
    'watduang:session',
    JSON.stringify({ players: ['Alice', 'Bob'], played: [], checkpoint: midRound(7), stamp: Date.now() }),
  );

  const stale = loadSession(); // the page that gets bfcached, loaded off the gen-less record
  const live = loadSession(); // a second instance off the same gen-less record

  live.saveCheckpoint(midRound(10));
  assert.equal(loadSession().checkpoint.drawn, 10, 'a closure loaded off a gen-less record must still write');

  stale.saveCheckpoint(midRound(19));
  assert.equal(loadSession().checkpoint.drawn, 10, 'a stale legacy closure clobbered a newer checkpoint');
});

// The too-strict direction, at the one site that could have met it. PlayerSetup.astro's
// discard-then-start calls saveCheckpoint(null) on a closure loadSession() built a few synchronous
// lines earlier inside the same requestStart() call — fresh by construction, not a page-load closure.
// If that discard ever failed silently the next start would resume the round the player just threw
// away, which is an ADR-0008 violation. Pinned here so the guard cannot drift into refusing it.
test('discard-then-start: a fresh closure still empties the slot even while an older one is alive', () => {
  slots.clear();
  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']);
  game.saveCheckpoint(midRound(7));
  assert.equal(loadSession().checkpoint.phase, 'drawn', 'positive control: a round really was in the slot');

  const panel = loadSession(); // requestStart(): loadSession() then saveCheckpoint(null), same tick
  panel.saveCheckpoint(null);
  assert.equal(loadSession().checkpoint, null, 'the discard silently failed');
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'start',
    'the panel offered to resume a round the player discarded — ADR-0008 says a discard is final',
  );
});

// Round end, siamsi.ts passToNext(): markPlayed then saveCheckpoint(null) on the SAME closure, in one
// handler, in one tick. Two writes back to back through one closure is precisely what a wall-clock
// token cannot order — the second carries a stamp the first has already beaten. The token has to
// advance with the closure that wrote it, so both land.
test('round end: markPlayed and saveCheckpoint(null) in the same tick both take effect', () => {
  slots.clear();
  const game = loadSession();
  game.setPlayers(['Alice', 'Bob']);
  game.saveCheckpoint(midRound(7));
  assert.equal(loadSession().checkpoint.phase, 'drawn', 'positive control: the round was live before it ended');

  game.markPlayed('siamsi');
  game.saveCheckpoint(null);
  assert.deepEqual(loadSession().played, ['siamsi'], 'the finished round never got marked played');
  assert.equal(loadSession().checkpoint, null, 'a finished round stayed in the slot — a refresh would resume it');
});

// ---- gh#50: the too-strict direction of gh#49's guard. A refusal is CORRECT — the stale snapshot must
// not land — but `write()` returned void and every guard branch returned in silence, so the refused
// closure kept its stale `myGen` and dropped every later write too: markPlayed, the next saveCheckpoint,
// the final saveCheckpoint(null). The whole post-restore round then existed only in memory and the next
// reload resumed the OLDER record, with nothing ever said. The fix is a signal at the chokepoint, not
// per-caller checks (1 game = 1 file, and that set grows), so this asserts the listener rather than a
// return value: the listener is what a caller can actually see.
//
// Both halves are pinned here on purpose. Observability alone could be bought by loosening the guard,
// which is gh#49 all over again, so every refusal below also asserts the stored bytes did not move.
test('gh#50: a refused write is observable, and still refuses — a muted closure cannot lose a round in silence', () => {
  slots.clear();
  const reasons = [];
  const restored = loadSession(); // the page that gets bfcached mid-round
  restored.onWriteRefused = (reason) => reasons.push(reason);
  restored.setPlayers(['Alice', 'Bob']);
  restored.saveCheckpoint(midRound(7));
  assert.equal(loadSession().checkpoint.drawn, 7, 'positive control: the round really was live before the interleaving');
  assert.deepEqual(reasons, [], 'positive control: a current closure writes with no refusal at all');

  const live = loadSession(); // play continues in the restored-into instance while #1 sits frozen
  live.saveCheckpoint(midRound(8));
  const stored = slots.get('watduang:session');

  // The tap on the restored page. Refused — that is gh#49's guard doing its job.
  restored.saveCheckpoint(midRound(9));
  assert.deepEqual(reasons, ['stale-version'], 'the refused checkpoint write told nobody');
  assert.equal(slots.get('watduang:session'), stored, 'the refused write must not persist — gh#49 regressed');

  // gh#50 proper: the SAME closure is now muted for every later write, not just the one that raced.
  restored.markPlayed('siamsi');
  assert.deepEqual(reasons, ['stale-version', 'stale-version'], 'the muted closure dropped markPlayed in silence');
  assert.equal(slots.get('watduang:session'), stored, 'markPlayed through a stale closure must not persist');
  assert.deepEqual(loadSession().played, [], 'control: the loss is real — the record never got the played game');

  // The three reasons name three different losses to a player, so each label is exercised; one shared
  // label would make the copy unwritable and this assertion is what stops them collapsing.
  const orphan = loadSession();
  orphan.onWriteRefused = (reason) => reasons.push(reason);
  loadSession().clear(); // the record is gone, and a closure that knew one may not re-create it
  assert.equal(slots.size, 0, 'positive control: the record is actually gone');
  orphan.saveCheckpoint(midRound(11));
  assert.deepEqual(reasons.at(-1), 'record-gone');
  assert.equal(slots.size, 0, 'a closure that knew a record re-created it after a clear');

  const other = loadSession(); // someone else's round takes the slot — a different id, not a version bump
  other.setPlayers(['Cat', 'Dan']);
  const othersRound = slots.get('watduang:session');
  orphan.saveCheckpoint(midRound(12));
  assert.deepEqual(reasons.at(-1), 'other-round');
  assert.equal(slots.get('watduang:session'), othersRound, "a stale closure wrote into someone else's round");
});

// gh#50 REFUTE F1 — storage that always throws is not a displaced round. setPlayers is swallowed by
// write()'s catch so myId stays null, and every later write then finds no record. Reporting
// 'record-gone' there would name a false cause (nothing was cleared) and re-fire role="alert" on
// every single tap for the whole session — which is the very thing that catch is written to avoid.
test('dead storage reports no refusal, but a genuinely displaced round still does', () => {
  slots.clear();
  const seen = [];
  const realSetItem = globalThis.sessionStorage.setItem;
  globalThis.sessionStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  try {
    const dead = loadSession();
    dead.onWriteRefused = (reason) => seen.push(reason);
    dead.setPlayers(['Alice', 'Bob']);
    dead.saveCheckpoint(midRound(7));
    dead.markPlayed('siamsi');
    dead.saveCheckpoint(null);
  } finally {
    globalThis.sessionStorage.setItem = realSetItem;
  }
  assert.deepEqual(seen, [], 'a dead-storage page reported a displaced round it never had');

  // Positive control: with storage working again, a real displacement MUST still be reported —
  // otherwise the assertion above passes on a listener that never fires at all.
  slots.clear();
  const c1 = loadSession();
  const reported = [];
  c1.onWriteRefused = (reason) => reported.push(reason);
  c1.setPlayers(['Alice', 'Bob']);
  c1.saveCheckpoint(midRound(7));
  const c2 = loadSession();
  c2.saveCheckpoint(midRound(8));
  c1.saveCheckpoint(midRound(9));
  assert.deepEqual(reported, ['stale-version'], 'the listener never fires, so the check above is vacuous');
});

// ---- gh#51 F1: MAX_AGE_MS is a loader rule, not an ownership rule. readRaw() reports an aged record
// as absent and write() read the slot through that same door, so a round started at 20:00 and still
// being tapped at 02:30 hit `current === null` while holding a non-null myId: every save refused as
// 'record-gone' — a cause that is false, since nothing was cleared — and setPlayers, the sole creator,
// was refused on the same branch, so the round could not re-create itself either. The next reload took
// the whole round with it. A write refreshes `stamp`, so the owner still tapping is exactly what is
// supposed to keep the record alive.
//
// The aged-record test above covers the OTHER closure: one born aged (myId === null), for which the
// aged record must stay invisible and a fresh start must still be allowed. That control is what pins
// this fix to ownership rather than to ignoring age inside write(). `stamp` is rewritten in place
// because nothing in the API can backdate one — the same seeding idiom as the tests above.
test('gh#51 F1: a round tapped past the 6h window still saves — its own closure is not "record-gone"', () => {
  slots.clear();
  const backdate = () => {
    const record = JSON.parse(slots.get('watduang:session'));
    record.stamp = Date.now() - 7 * 60 * 60 * 1000; // > MAX_AGE_MS: locked at 20:00, restored at 02:30
    slots.set('watduang:session', JSON.stringify(record));
  };

  const reasons = [];
  const game = loadSession(); // 20:00 — this closure creates the record, so it owns the id
  game.onWriteRefused = (reason) => reasons.push(reason);
  game.setPlayers(['Alice', 'Bob']);
  game.saveCheckpoint(midRound(2));

  backdate();
  assert.equal(loadSession().checkpoint, null, 'positive control: the record really did age out of every loader');

  game.saveCheckpoint(midRound(19)); // the player keeps tapping on the restored tab
  assert.equal(
    JSON.parse(slots.get('watduang:session')).checkpoint.drawn,
    19,
    'the closure that owns the record could not save its own round',
  );
  assert.deepEqual(reasons, [], "nothing was cleared, so 'record-gone' names a cause that is false");
  // The harm the player actually met: the save has to refresh `stamp` as well, or the next reload
  // still loses the round that was just persisted.
  assert.equal(loadSession().checkpoint.drawn, 19, 'the save persisted but a refresh still lost the round');

  // setPlayers is the sole creator and it was refused on the same branch — siamsi.ts mountInto() calls it
  // mid-round on the resume path, so that write died past the window too.
  backdate();
  game.setPlayers(['เอ', 'บี']);
  assert.deepEqual(loadSession().players, ['เอ', 'บี'], 'the sole creator stayed refused past the window');
  assert.deepEqual(reasons, [], 'and it must not report a refusal either');
});

// ---- gh#51 F2: clear() was the one write path with no guard at all — no identity check, no generation
// check, removeItem unconditional. It sits on GameSession, so it is reachable from the long-lived
// ctx.session closure game/[id].astro builds once per mount and a bfcache restore keeps alive: the
// first game to ship a quit-round button hands a stale closure the power to delete the round the newer
// document is playing, which is gh#49's loss with nothing left to overwrite back. It shares write()'s
// compare-and-swap rather than carrying a copy of it, so the two cannot drift apart.
//
// The anti-over-fix control is already pinned twice above ('negative control: a clean discard...' and
// 'discard-then-start...'), both on a fresh closure — PlayerSetup calls loadSession() inside
// requestClear(), a few synchronous lines before clear(), which is why a real press cannot be refused.
test('gh#51 F2: a stale closure cannot clear the round the newer document is playing', () => {
  slots.clear();
  const reasons = [];
  const restored = loadSession(); // the page that gets bfcached mid-round
  restored.onWriteRefused = (reason) => reasons.push(reason);
  restored.setPlayers(['Alice', 'Bob']);
  restored.saveCheckpoint(midRound(2));

  const live = loadSession(); // the tab navigates back in and play continues here
  live.saveCheckpoint(midRound(10));
  const stored = slots.get('watduang:session');
  assert.equal(loadSession().checkpoint.drawn, 10, 'positive control: the newer document owns the live round');

  restored.clear(); // a quit-round tap on the restored page
  assert.equal(slots.get('watduang:session'), stored, 'a stale closure deleted the round the live page was playing');
  assert.deepEqual(reasons, ['stale-version'], 'and it deleted it in silence');

  // The other branch of the same shared guard: a different round holds the slot, at the same
  // generation, so identity is the only thing that can catch it.
  slots.clear();
  const mine = loadSession();
  mine.onWriteRefused = (reason) => reasons.push(reason);
  mine.setPlayers(['Alice', 'Bob']);
  loadSession().clear(); // the round ends, a fresh closure empties the slot legitimately
  const other = loadSession();
  other.setPlayers(['Cat', 'Dan']); // a new round: new id, gen back to 1
  const othersRound = slots.get('watduang:session');

  mine.clear();
  assert.equal(slots.get('watduang:session'), othersRound, "a stale closure cleared someone else's round");
  assert.equal(reasons.at(-1), 'other-round');
});

// ---- gh#53: a REPLACED round was reported to the player as a CONTINUED one. Both refusals are
// correct as refusals — what was wrong is which of the two fired, and they carry opposite copy
// (player-select.ts:145 says the round was played on from another page, :147 says a new round took
// over). The pair below is the whole fix: the same stale tap, one discarded round and one carried-on
// round, and the reason has to differ. Testing only the first would move the bug rather than close it.
//
// The discriminator is the start kind the panel sends: requestStart() in PlayerSetup.astro knows which
// branch the player took — it calls saveCheckpoint(null) on the discard branch — and puts the answer on
// the watduang:start event, which game/[id].astro hands to setPlayers. Cited by function name, not by
// line: the line the first fix quoted here had already moved by the time it was written.
test('gh#53: a round replaced over the slot is reported as another round, not a newer version', () => {
  slots.clear();
  const reasons = [];
  const round1 = loadSession(); // the game page's closure — it starts round 1 and owns its identity
  round1.onWriteRefused = (reason) => reasons.push(reason);
  round1.setPlayers(['Alice', 'Bob']);
  round1.saveCheckpoint(midRound(7));

  // Start-new-round: the panel discards the live round through its own fresh closure, then dispatches
  // watduang:start, and game/[id].astro's watduang:start handler builds another fresh closure that
  // starts a DIFFERENT round over the same slot. Round 1 is gone — nobody can resume it any more.
  const panel = loadSession();
  panel.saveCheckpoint(null);
  const round2 = loadSession();
  round2.setPlayers(['Cat', 'Dan'], 'new-round'); // the kind the panel's discard branch sends
  assert.deepEqual(loadSession().players, ['Cat', 'Dan'], 'positive control: round 2 really took the slot');
  assert.equal(loadSession().checkpoint, null, 'positive control: round 1 really was discarded');
  const storedRound2 = slots.get('watduang:session');

  // The tap that lands on the page round 1 was being played on — a back-navigation or a bfcache
  // restore keeps that closure alive and armed.
  round1.saveCheckpoint(midRound(19));
  assert.equal(slots.get('watduang:session'), storedRound2, 'the discarded round wrote back over round 2');
  assert.deepEqual(
    reasons,
    ['other-round'],
    'a replaced round was reported as a continued one — the copy names the opposite event',
  );
});

// The other half, and the reason the fix cannot simply mint on every start: refresh-resume (#20) is a
// genuine continuation. The player takes the resume branch, so the checkpoint is never cleared;
// game/[id].astro's closure starts holding the live round and siamsi.ts mountInto() writes that round's own
// roster back. Same round, carried on from another page — which is exactly what 'stale-version' says.
// Green before the gh#53 change and green after: it is the guard against flipping every cross-page
// write to 'other-round'.
test('gh#53 control: a round continued from another page is still reported as a newer version', () => {
  slots.clear();
  const reasons = [];
  const restored = loadSession(); // the page that gets bfcached mid-round
  restored.onWriteRefused = (reason) => reasons.push(reason);
  restored.setPlayers(['Alice', 'Bob']);
  restored.saveCheckpoint(midRound(7));

  // The tab comes back to the game page and the player resumes: no discard, so the round in the slot
  // is the same one, and both setPlayers calls of that path land on it.
  const resumed = loadSession();
  // The two setPlayers calls of the resume path, in production order and with production's kinds: the
  // watduang:start handler in game/[id].astro passes the panel's answer, and mountInto()'s resume branch
  // in siamsi.ts passes nothing at all — a game holds a GameSession, which declares one parameter.
  resumed.setPlayers(['Alice', 'Bob'], 'same-round'); // the panel's ticked group
  resumed.setPlayers(['Alice', 'Bob']); // the checkpoint's own roster, written back on resume
  resumed.saveCheckpoint(midRound(10));
  assert.equal(loadSession().checkpoint.drawn, 10, 'positive control: the same round really did move on');
  const storedLive = slots.get('watduang:session');

  restored.saveCheckpoint(midRound(19));
  assert.equal(slots.get('watduang:session'), storedLive, 'the stale write landed — gh#49 regressed');
  assert.deepEqual(
    reasons,
    ['stale-version'],
    'a continued round was reported as a replaced one — the fix flipped every cross-page write',
  );
});

// gh#53 REFUTE — the first fix inferred the branch from the slot ("no checkpoint" = the discard ran),
// and that proxy is owned by the PANEL, not by session.ts. A start placed over a checkpoint belonging
// to ANOTHER game takes planStart's plain 'start' branch: nothing is asked, nothing is discarded, the
// blob stays in the slot, and the proxy therefore says "continuation" about a round that is brand new.
// Only siamsi writes checkpoints (ADR-0010), so the other five games are the whole of this case.
//
// Two starts, because the blob outlives both: every write carries session.checkpoint back, so the
// second start read exactly what the first one did and inherited the same id again. The observable is
// the refusal a stale tap earns on the FIRST round's closure — 'stale-version' says the round was
// played on from another page, and this round no longer exists at all.
test('gh#53: a start over another game\'s stranded checkpoint is a new round, not a continuation', () => {
  slots.clear();
  const reasons = [];
  // A siamsi round abandoned mid-play: nobody discarded it, so its blob is stranded in the site-wide
  // slot for the rest of the 6h window.
  const siamsi = loadSession();
  siamsi.setPlayers(['Alice', 'Bob'], 'new-round');
  siamsi.saveCheckpoint(midRound(7));

  // The player opens timebomb and starts. planStart takes the plain 'start' branch — the checkpoint is
  // another game's, so the panel neither asks nor discards. This is the ordering the proxy misreads.
  assert.equal(
    planStart(loadSession().checkpoint, 'timebomb'),
    'start',
    'positive control: the panel neither asks nor discards, so no discard clears the slot',
  );
  const round1 = loadSession();
  round1.onWriteRefused = (reason) => reasons.push(reason);
  round1.setPlayers(['Cat', 'Dan'], 'new-round');

  // The player leaves the page mid-round; bfcache keeps round1's closure alive and armed. Back on
  // timebomb, they start again — and the siamsi blob is STILL there, because round1's own write
  // carried it through.
  assert.equal(
    loadSession().checkpoint.game,
    'siamsi',
    'positive control: the stranded blob survives every write, so the proxy reads the same both times',
  );
  const round2 = loadSession();
  round2.setPlayers(['Eve', 'Fay'], 'new-round');
  assert.deepEqual(loadSession().players, ['Eve', 'Fay'], 'positive control: round 2 really took the slot');
  const storedRound2 = slots.get('watduang:session');

  // The tap that lands on the restored page. timebomb writes through markPlayed, not saveCheckpoint
  // (ADR-0010), which is the same chokepoint.
  round1.markPlayed('timebomb');
  assert.equal(slots.get('watduang:session'), storedRound2, 'the replaced round wrote back over round 2');
  assert.deepEqual(
    reasons,
    ['other-round'],
    'a replaced round was reported as a continued one — the copy names the opposite event',
  );
});

// ---- gh#56: the RESUME door into the same wrong-loss class. gh#53 closed the start that REPLACES a
// round; this is the start that RESUMES a blob the round in the slot never wrote. Every write
// re-serialises session.checkpoint, so an abandoned siamsi blob rides along under whatever round
// starts next — the carry-through the stranded-checkpoint test above already pins. Going back and
// resuming that blob is 'same-round' and the panel is right about it, the player really is carrying a
// round on; but the round they are carrying on is the ABANDONED one, not the one whose id happens to
// hold the slot. Inheriting that id left a stale closure on the replaced round passing the identity
// compare and meeting the version check instead, so it was told its round had been played on from
// another page when its round no longer exists at all.
//
// Reproduced on this stub before the fix, and it is message-level only: players, played and the blob
// all survive, which is why the refusal reason is the whole observable.
test("gh#56: a resumed checkpoint no longer wears the id another game's round minted", () => {
  slots.clear();
  const reasons = [];
  // A siamsi round abandoned mid-play: nobody discarded it, so its blob is stranded in the site-wide
  // slot for the rest of the 6h window.
  const siamsi = loadSession();
  siamsi.setPlayers(['Alice', 'Bob'], 'new-round');
  siamsi.saveCheckpoint(midRound(7));

  // The player opens timebomb and starts. The blob belongs to another game, so planStart takes the
  // plain 'start' branch — nothing is asked, nothing is discarded, and the blob stays put.
  assert.equal(
    planStart(loadSession().checkpoint, 'timebomb'),
    'start',
    'positive control: nothing asks and nothing discards, so the siamsi blob stays stranded',
  );
  const timebomb = loadSession();
  timebomb.onWriteRefused = (reason) => reasons.push(reason);
  timebomb.setPlayers(['Cat', 'Dan'], 'new-round');
  assert.equal(
    loadSession().checkpoint.game,
    'siamsi',
    "positive control: timebomb's own write carried the stranded blob through, under timebomb's id",
  );
  const strandedId = JSON.parse(slots.get('watduang:session')).id; // timebomb's — and the blob is not its

  // The player leaves timebomb mid-round — bfcache keeps that closure alive and armed — goes back to
  // siamsi, and the panel offers the stranded round. They resume, so the panel sends 'same-round'.
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'ask',
    'positive control: the panel really does offer the stranded round back',
  );
  const resumed = loadSession();
  resumed.setPlayers(['Alice', 'Bob'], 'same-round'); // the panel's ticked group

  // Read straight out of the stub, and read HERE: the hand-over has to be on the record, not merely in
  // the closure that minted. The roster write-back on the next line re-serialises the whole record from
  // that closure, so it repairs a hand-over the mint failed to persist — and every assertion further
  // down is downstream of that repair, which is why they all stayed green with the persisted half of
  // the fix deleted. A mount that throws makes the gap real: the write-back never runs, the record goes
  // on naming the abandoned round, and every retry mints again.
  const afterResume = JSON.parse(slots.get('watduang:session'));
  assert.notEqual(afterResume.id, strandedId, 'positive control: the resume really did mint over the stranded blob');
  assert.equal(
    afterResume.cpOwner,
    afterResume.id,
    'the record still names the abandoned round as the blob owner, so the id churns on every later resume',
  );

  resumed.setPlayers(['Alice', 'Bob']); // mountInto()'s resume branch writing the blob's own roster back
  // One start, one mint. This is the SAME closure both times — game/[id].astro loads one session, starts
  // the round on it and hands it to the game as ctx.session — so the closure has to have taken the
  // hand-over too, not just written it. Left carrying the abandoned round's owner, it reads its own fresh
  // id as another round's and mints a second time here, displacing the round it is in the middle of
  // resuming: the write-back's own comment above says minting here is the thing that must not happen.
  assert.equal(
    JSON.parse(slots.get('watduang:session')).id,
    afterResume.id,
    'the roster write-back minted again — one start took two identities, and the second one lands on a ' +
      'round already being resumed',
  );
  assert.equal(loadSession().checkpoint.drawn, 7, 'ADR-0008: the resumed round must still be there to resume');
  assert.deepEqual(loadSession().players, ['Alice', 'Bob'], 'positive control: the resumed round holds the slot');

  // The blob changes hands on that mint, so this settles instead of churning: reload, resume again,
  // and the round keeps the id it just took. Without the hand-over the record would go on naming the
  // abandoned round, every later resume would mint, and an ordinary reload-and-resume OF THE RESUMED
  // ROUND would report 'other-round' — the control below, one scenario deeper.
  const resumedId = JSON.parse(slots.get('watduang:session')).id;
  loadSession().setPlayers(['Alice', 'Bob'], 'same-round');
  assert.equal(
    JSON.parse(slots.get('watduang:session')).id,
    resumedId,
    'the resumed round minted again on the next reload — the fix churns ids instead of settling on one',
  );
  const storedResumed = slots.get('watduang:session');

  // The tap on the restored timebomb page. Its round did not move on — it was replaced by the round
  // the player went back to, and 'stale-version' names the opposite event (refusalCopy's two arms in
  // player-select.ts).
  timebomb.markPlayed('timebomb');
  assert.equal(slots.get('watduang:session'), storedResumed, 'the replaced round wrote back over the resumed one');
  assert.deepEqual(
    reasons,
    ['other-round'],
    'the resumed round inherited the id timebomb minted, so a replaced round was told it was merely behind',
  );
});

// The control, and it is the answer no fix here may change: an ORDINARY reload-and-resume — a round
// resuming the blob it wrote itself — is a continuation, and a stale closure on it must still be told
// 'stale-version'. Option B (the panel calling every resume 'new-round') was rejected on exactly this:
// it buys the test above by inverting this one. The id assertion is the sharp end — a fix that mints
// on every 'same-round' start fails there first, before the refusal reason ever flips.
test('gh#56 control: an ordinary reload-and-resume keeps its id, and is still a newer version', () => {
  slots.clear();
  const reasons = [];
  const restored = loadSession(); // the page that gets bfcached mid-round
  restored.onWriteRefused = (reason) => reasons.push(reason);
  restored.setPlayers(['Alice', 'Bob'], 'new-round');
  restored.saveCheckpoint(midRound(7)); // this round's OWN blob — the one difference from the test above
  const ownId = JSON.parse(slots.get('watduang:session')).id;

  // Reload, and the panel offers back the round this page was playing. The player resumes it.
  assert.equal(
    planStart(loadSession().checkpoint, 'siamsi'),
    'ask',
    'positive control: the panel offers the page its own round back',
  );
  const resumed = loadSession();
  resumed.setPlayers(['Alice', 'Bob'], 'same-round'); // the panel's ticked group
  resumed.setPlayers(['Alice', 'Bob']); // mountInto()'s resume branch
  assert.equal(
    JSON.parse(slots.get('watduang:session')).id,
    ownId,
    'a genuine continuation minted a new id — the round no longer names itself, and every cross-page write on it now reports the wrong loss',
  );
  resumed.saveCheckpoint(midRound(10));

  restored.saveCheckpoint(midRound(19));
  assert.deepEqual(
    reasons,
    ['stale-version'],
    'a continued round was reported as a replaced one — the fix flipped an ordinary resume',
  );
});
