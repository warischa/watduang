// State for "this group" — sessionStorage, self-expiring (6h), not tied to the roster.
import type { Checkpoint, GameSession } from '../games/types';

const KEY = 'watduang:session';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** A record written before identities existed. sessionStorage keeps it for the whole 6h window, so on
 *  the deploy that added the field there are live sessions in this shape. It has no owner, so every
 *  closure loaded off it shares this one — pre-identity behaviour among peers, and no create right. */
const LEGACY_ID = 'legacy';

interface StoredSession {
  /** Which round this is. Minted on create, never rewritten; absent only on a legacy record. */
  id?: string;
  players: string[];
  played: string[];
  checkpoint: Checkpoint | null;
  stamp: number;
  /**
   * How many times this record has been written. The compare-and-swap token every write checks itself
   * against — NOT a clock, and `stamp` is not a substitute: gh#49's clobbering write carried the newer
   * wall clock (1787147041344 over the 1787147038224 it destroyed), so last-write-wins-by-time lets the
   * loss through. Absent on a legacy record and read as 0 there. Unbounded on purpose — and NOT because
   * the record is short-lived: `stamp` is refreshed by every write, so an actively played record
   * outlives MAX_AGE_MS indefinitely. It is safe because it counts taps, and a float's safe integer
   * range is 2^53 of them.
   */
  gen?: number;
  /**
   * Which id owned `checkpoint` when it was written — the round the BLOB belongs to, which is not
   * always the round holding the slot. write() re-serialises the whole record, checkpoint field
   * included, so a blob abandoned by an earlier game rides along under whatever round starts next, and
   * gh#56 is entirely that gap: resuming the stranded blob inherited an id minted for another game's
   * round, and the closure still live on THAT round then passed the identity compare and met the
   * version check — told its round had been played on from another page when its round was gone.
   *
   * Absent on every record written before this field existed, and absent is read as UNKNOWN rather
   * than as a mismatch: only a known, different owner mints. That is the pre-field behaviour, and it
   * is the side that cannot flip an ordinary reload-and-resume into 'other-round'.
   *
   * Two writers move it, for two different reasons. saveCheckpoint moves it with the blob — a blob that
   * enters or leaves the record takes its owner with it. write() re-stamps it on the one start that mints
   * over
   * a stranded blob, and there the blob does not move at all: the round UNDER it does, and the round
   * that just minted is the one now playing that blob. Every other write carries the field through
   * untouched, exactly as it carries the blob.
   */
  cpOwner?: string;
}

let minted = 0;
/** Unique within a tab: the counter covers one page, the timestamp covers reloads of the same tab. */
const mintId = (): string => `${Date.now().toString(36)}-${++minted}`;

/** The live record, or null when there is none. Absent, aged out and unparseable all read the same —
 *  aging matters here because the key outlives MAX_AGE_MS, and an aged record must not block a start.
 *
 *  `mine` is the id the caller already owns, and it is the one exception to that. Age is a LOADER rule
 *  — nothing may resume a 6h-old round — and it is not an ownership rule, so an expired record is
 *  still present for the closure that created it. write() reading the slot through the strict door was
 *  gh#51 F1: a round started at 20:00 and still being tapped at 02:30 met `current === null` while
 *  holding a non-null myId, so every save was refused as 'record-gone' — false, nothing was cleared —
 *  and setPlayers, the sole creator, was refused on the same branch, so the round could not re-create
 *  itself either and the next reload took it. Every write refreshes `stamp`, so the owner still tapping
 *  is what keeps the record alive; callers that pass nothing keep the strict rule, which is what leaves
 *  an aged record invisible to a loader and free for a fresh start to overwrite. */
function readRaw(mine?: string | null): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (Date.now() - parsed.stamp <= MAX_AGE_MS) return parsed;
    // Expired: present for its owner and for nobody else. Normalised through LEGACY_ID so the
    // pre-identity door behaves like the normal one — a closure loaded off a gen-less record holds
    // LEGACY_ID while the record itself carries no id at all.
    return (parsed.id ?? LEGACY_ID) === mine ? parsed : null;
  } catch {
    return null;
  }
}

function read(): StoredSession {
  const parsed = readRaw();
  if (!parsed) return { players: [], played: [], checkpoint: null, stamp: Date.now() };
  return {
    id: parsed.id ?? LEGACY_ID,
    players: Array.isArray(parsed.players) ? parsed.players : [],
    played: Array.isArray(parsed.played) ? parsed.played : [],
    checkpoint: parsed.checkpoint ?? null,
    stamp: parsed.stamp,
    gen: parsed.gen ?? 0,
    // Not normalised to the record's id the way an absent `id` is normalised to LEGACY_ID: undefined
    // has to stay undefined here, because "unknown owner" is what makes a pre-field record behave as
    // it did before the field existed.
    cpOwner: parsed.cpOwner,
  };
}

/**
 * Why a write was refused. Three reasons because they are three different losses to a player, and the
 * copy that eventually names one has to say which: the round record is gone, someone else's round holds
 * the slot, or this closure is a version behind the record it is talking about (gh#50).
 */
export type WriteRefusal = 'record-gone' | 'other-round' | 'stale-version';

/**
 * What a start MEANS for the round in the slot, and therefore whether it takes an identity of its own:
 * 'new-round' begins a round, 'same-round' carries on the one already there. Named rather than boolean
 * because both call sites read as a sentence — `setPlayers(names, 'new-round')` cannot be mistaken for
 * a flag whose polarity you have to go and look up.
 *
 * The panel is the only place that knows which of the two happened: requestStart() in PlayerSetup.astro
 * put the question to the player (#resume-choice) or established there was nothing to ask about. It is
 * threaded here from there, through the watduang:start event — session.ts must NOT infer it. See the
 * comment on the id line in write() for the inference that was tried and what it got wrong.
 *
 * 'same-round' is the default because the safe side is not minting: a writer that omits it can only
 * update a record it already matched against, never displace one. The one caller that relies on the
 * default is siamsi.ts's resume path, a SECOND setPlayers on a closure that already owns its round.
 */
export type StartKind = 'new-round' | 'same-round';

/**
 * What loadSession() actually hands back: a GameSession plus the refusal signal. Deliberately NOT on
 * GameSession — a game gets `ctx.session` and must stay out of this. Handling a refusal is the shell's
 * job once, not an obligation that spreads to every game file as the manifest grows (gh#50).
 */
export interface ShellSession extends GameSession {
  /** Called by write() when a guard refuses. One slot, last setter wins — the shell is the only owner. */
  onWriteRefused: ((reason: WriteRefusal) => void) | null;
  /**
   * The same setPlayers, widened by one optional parameter — and the widening is the boundary. Only a
   * holder of a ShellSession (the shell: game/[id].astro's watduang:start handler) can say 'new-round'
   * and mint a fresh identity over the slot. A game holds ctx.session, typed GameSession, whose
   * declaration in games/types.ts has one parameter, so `Expected 1 arguments, but got 2` is what a
   * game gets for trying — the resume path in siamsi.ts cannot displace the round it is resuming even
   * by accident. Declared here rather than in types.ts on purpose: the capability is not part of the
   * contract a game is handed.
   */
  setPlayers(names: string[], start?: StartKind): void;
}

export function loadSession(): ShellSession {
  const stored = read();

  /**
   * The record this closure is talking about — captured at load, minted on create, null until it has
   * one. Every write compares it against the record actually in the slot and refuses on a mismatch.
   *
   * Why compare instead of trusting the closure: loadSession() hands out an independent mutable closure
   * per call — the shell holds one, the mounted game holds another (game/[id].astro builds ctx.session
   * once) — over a single storage key. clear() cannot invalidate a closure it does not know about, so
   * after a clear the game's closure is still live and still armed. Press Clear-and-drop-pending-round mid-round
   * and location.reload() is a macrotask away; a tap that lands before unload ran save() through the
   * game's closure and setItem the discarded round straight back. After the reload the panel offered
   * Resume-pending-round for the round the player had just thrown away — a discard that silently
   * un-discards, which is an ADR-0008 violation in substance. The round-over path did it too, reviving
   * the whole record through markPlayed + saveCheckpoint(null).
   *
   * An existence check ("is there a record") closed only half of that, and a per-closure first-call flag
   * only the other half: a stale closure whose first setPlayers had not been spent still created over an
   * absent record, and once any new round existed a stale closure wrote its pre-discard snapshot over it.
   * Identity answers both with one question, so both mechanisms are gone. It stays compatible with issue
   * #20's refresh-resume by construction: a closure updating the record it is actually talking about —
   * mountInto()'s resume branch in siamsi.ts writing the checkpoint's roster back — still matches.
   */
  let myId: string | null = stored.id ?? null;

  /**
   * Which version of that record this closure last saw — the compare-and-swap token, checked and then
   * bumped on every successful write. Identity answers "whose round is in the slot"; it cannot answer
   * "is my copy of it current", and gh#49 is entirely the second question: a page frozen in bfcache
   * keeps a live closure holding the round's own id, so when it is restored mid-round and the player
   * taps, the identity compare passes and its months-old-in-round-time snapshot overwrites everything
   * the newer page instance did. Measured loss: holder 2 -> 1, results 2 -> 1, a drawn card back in
   * the deck, in silence.
   *
   * Seeded from the loaded record, ABSENT READS AS 0 — that is what makes one check cover the legacy
   * door too. The identity compare is skipped whenever the stored id is undefined, so on a
   * pre-identity record every closure loaded off it could clobber every other, and a guard nested
   * inside that branch would inherit the same blind spot. This one sits beside the branch, not in it.
   *
   * No separate lock is needed on top: write() is already an atomic read-modify-write. One JS realm
   * runs at a time per tab and a bfcached page is frozen, so nothing interleaves between the readRaw()
   * below and its setItem — the only missing piece was ever the version token. A second tab is not a
   * hole either: sessionStorage is scoped per top-level tab, so another tab gets its own store and
   * cannot reach this key; SharedWorker and service workers have no sessionStorage at all.
   */
  let myGen: number = stored.gen ?? 0;

  /**
   * Whose round wrote the checkpoint this closure is carrying — seeded from the record, and null when
   * the blob's owner is unknown (a pre-field record) or when there is no blob at all.
   *
   * The same two writers that move the field on the record move this. saveCheckpoint sets it beside
   * `session.checkpoint`: same setter, same moment, refused or not, so that path cannot leave the two
   * describing different rounds. write() moves it on the start that mints over a stranded blob — the blob
   * stays, the round under it changes — and only after setItem returned, beside myId and myGen: a
   * hand-over that threw is a hand-over that did not happen.
   */
  let myCpOwner: string | null = stored.cpOwner ?? null;

  /** Refuse: tell whoever is listening, and hand the reason back to the caller. Never re-syncs myGen
   *  and never adopts the stored record — ADR-0021 declined reconciliation, and adopting would either
   *  discard the player's visible state (ADR-0008) or persist the stale snapshot (gh#49 again). */
  const refuse = (reason: WriteRefusal): WriteRefusal => {
    session.onWriteRefused?.(reason);
    return reason;
  };

  /**
   * The two compare-and-swap questions, asked of the record actually in the slot: is this the round
   * this closure knows, and is it the version of that round this closure last saw. Null means this
   * closure owns what is there and may mutate it.
   *
   * Shared by write() AND clear() rather than copied into each. clear() shipped with no guard at all
   * (gh#51 F2) and a guard copied per caller leaves the next caller unsafe by default — both questions
   * live here once, so a mutating path added later cannot inherit half of them.
   */
  const mismatch = (current: StoredSession): WriteRefusal | null => {
    // Someone else's round is in the slot. This closure's snapshot predates it — refuse.
    if (current.id !== undefined && current.id !== myId) return 'other-round';
    // Right round, wrong version of it: someone has written since this closure loaded, so what it is
    // about to persist is a snapshot of the round as it used to be. A sibling of the identity compare
    // and never nested inside it — a legacy record reaches this line, and gh#49 through the legacy
    // door looks the same as gh#49 through the normal one.
    if ((current.gen ?? 0) !== myGen) return 'stale-version';
    return null;
  };

  /**
   * The one chokepoint all three writers route through. A non-null `start` means "this call is a start",
   * which is what may bring a record into existence; setPlayers is the only writer that passes one,
   * because starting a round is what brings a session into being (games/_template.ts:29-31 documents
   * that to every future game). Defaults to null, so a writer added later inherits the safe side.
   *
   * Returns the guard's verdict — null when nothing refused. gh#50: a refusal is correct, but it left
   * the closure stranded one version behind forever (myGen is re-synced only after a successful
   * setItem, by design — see below), so every later write from the same closure was dropped too, and a
   * void return meant markPlayed/saveCheckpoint had already mutated in-memory state and reported
   * success. Signalling here rather than at the three callers is the point: this is the chokepoint, and
   * a guard added later cannot forget the signal — the declared return type rejects a bare `return`.
   */
  function write(start: StartKind | null = null): WriteRefusal | null {
    // Only a start may create, and only a start may mint — the two questions the rest of this function
    // asks of `start`. Held as a local so the guard below reads exactly as it did before the kind
    // arrived: what changed is where the answer comes from, not which writers are allowed to create.
    const create = start !== null;
    try {
      const current = readRaw(myId);
      if (current === null) {
        // Gone means gone, whoever still holds a handle: a closure that knew a record may not re-create
        // it. Only one that never had an identity may start a round.
        // Refuse either way, but only REPORT when this closure actually knew a record. When myId is
        // null the closure never established one, which is what a dead-storage page looks like:
        // Safari private mode or a full quota makes setPlayers throw, the catch below swallows it, and
        // myId stays null. Reporting 'record-gone' there names a cause that is false — nothing was
        // cleared — and role="alert" would re-announce on every tap, the exact per-tap alarm the catch
        // below is written to avoid. gh#50 REFUTE F1.
        if (!create || myId !== null) return myId !== null ? refuse('record-gone') : null;
      } else {
        const stale = mismatch(current);
        if (stale !== null) return refuse(stale);
      }
      // gh#53 — a start that REPLACES the round in the slot takes an identity of its own instead of
      // inheriting the one already there; a start that carries that same round on keeps it, and so does
      // every non-start writer (they pass no kind, so they are 'same-round' by construction and are by
      // definition updating the record they just matched against).
      //
      // Threaded in, never inferred. The first fix inferred it from the slot — "the slot holds no
      // checkpoint" was read as "the player took the discard branch", because ADR-0008 makes that branch
      // clear the round before it starts (requestStart() in PlayerSetup.astro calls saveCheckpoint(null)
      // before dispatching watduang:start). That proxy is owned by the PANEL, not by this file, and it
      // is wrong wherever the panel reaches a start without going through either labelled branch: a
      // start placed over a checkpoint belonging to ANOTHER game takes planStart's plain 'start' path,
      // so nothing asks and nothing discards, and the proxy calls a brand-new round a continuation. The
      // stranded blob then outlives every write (each one carries session.checkpoint back), so every
      // later start on that page inherited the same id too. Only the panel knows which branch ran, so
      // the panel is what says so.
      //
      // Inheriting it was the whole of gh#53: the replacing round wore the replaced round's id, so a
      // closure still live on the replaced round passed the identity compare and met the VERSION check
      // instead. It was told its round had been played on from another page when its round no longer
      // existed at all — opposite events, and refusalCopy names them as opposites (its 'stale-version'
      // and 'other-round' arms, player-select.ts). Nothing about the refusal itself changes here; only
      // which of the two questions catches it, and therefore which loss the player is told about.
      //
      // The other side of the same line: mountInto()'s resume branch in siamsi.ts writes the resumed
      // round's own roster back through a second setPlayers, and it passes no kind — that is the same
      // round updating itself (#20), and minting there would displace the round it is resuming.
      //
      // gh#56 — and the other half of the same sentence: 'same-round' means "carry on the round in the
      // slot", but the CHECKPOINT in the slot is not necessarily that round's. The blob rides through
      // every write (this function re-serialises the whole record), so an abandoned round's blob sits
      // under whatever id started next; a start that resumes THAT blob is beginning the abandoned round
      // again, not continuing the one whose id is there, and it takes an identity of its own too.
      //
      // This is NOT the inference the review rejected above. That one read a PANEL-owned branch off a
      // slot proxy — "no checkpoint" standing in for "the player pressed discard" — and was wrong
      // wherever the panel reached a start without going through a labelled branch. This compares two
      // fields the RECORD owns, both written by this file and by nothing else: `id` from mintId(),
      // `cpOwner` from saveCheckpoint and from the hand-over below. It asks "does the blob in this
      // record belong to this record's round", which is a fact about the record, not a guess about which
      // button was pressed — the kind is still the panel's word, and it is still what selects the branch.
      //
      // Only an explicit 'same-round' start qualifies. A non-start writer passes null and must never
      // mint: it is updating the record it just matched against, and minting there would displace the
      // round it is in the middle of saving — mountInto()'s roster write-back on resume is exactly that
      // call. An unknown owner never mints either, so a pre-field record keeps today's behaviour.
      const resumingAnotherRound = start === 'same-round' && myCpOwner !== null && myCpOwner !== myId;
      const id = start === 'new-round' || resumingAnotherRound ? mintId() : (myId ?? mintId());
      // Not reset to 1 alongside the new id: the token orders writes to the SLOT, and a monotonic one
      // cannot coincidentally match a stale closure's. Identity refuses that closure first either way.
      const gen = myGen + 1;
      sessionStorage.setItem(
        KEY,
        JSON.stringify({
          id,
          players: session.players,
          played: session.played,
          checkpoint: session.checkpoint,
          stamp: Date.now(),
          gen,
          // The stranded blob changes hands on this write. It does not move — the round under it does,
          // and the round that just minted is the one now playing it, so it owns the blob from here on.
          // This is the one re-stamp outside saveCheckpoint, and it covers the case saveCheckpoint
          // cannot see: no checkpoint is being written at all. Without it the record would keep naming
          // the abandoned round, every later 'same-round' start would mint again, and an ordinary resume
          // of the resumed round would then report 'other-round' — the control this fix exists to keep.
          // Every other write carries the owner through untouched, exactly as it carries the blob.
          cpOwner: resumingAnotherRound ? id : (myCpOwner ?? undefined),
        } satisfies StoredSession),
      );
      // Only now: minting before the write would make Safari private mode (setItem throws every time)
      // look like a create that succeeded, and every later write would then refuse against an id that
      // was never persisted — permanent silent no-ops instead of an in-memory session. Same for the
      // generation: bumping it before a throwing setItem would leave this closure one version ahead of
      // a record that never moved, and every later write would refuse against its own phantom write.
      myId = id;
      myGen = gen;
      if (resumingAnotherRound) myCpOwner = id;
    } catch {
      // Quota full or Safari private mode — keep going in memory for this page, never throw. NOT a
      // refusal: no guard rejected this write, storage is simply unavailable, and in private mode every
      // single write throws — signalling here would fire on every tap for the whole session.
    }
    return null;
  }

  const session: ShellSession = {
    onWriteRefused: null,
    players: stored.players,
    played: stored.played,
    checkpoint: stored.checkpoint,
    /** `start` is deliberately optional and defaults to the non-minting side: GameSession declares this
     *  method with one parameter (games/types.ts), so a game holding ctx.session can only ever call it
     *  the one-argument way — and that call must never displace the round it is updating. The shell
     *  holds a ShellSession and is the only caller that can say 'new-round'. */
    setPlayers(names: string[], start: StartKind = 'same-round'): void {
      session.players = names;
      write(start);
    },
    markPlayed(id: string): void {
      if (!session.played.includes(id)) {
        session.played = [...session.played, id];
      }
      write();
    },
    saveCheckpoint(cp: Checkpoint | null): void {
      session.checkpoint = cp;
      // gh#56 — stamped beside the blob it describes, by the method that puts one there. `myId` is the id
      // this write lands under: `start` is null here, so write() takes the `myId ?? mintId()` arm — and on
      // a non-start write that arm is only ever reached holding a non-null myId. A closure that has not
      // created yet stamps the blob unowned rather than guessing an owner, and unowned never mints; its
      // write reaches the slot on neither branch, and only one of the two says a word. Nothing in the
      // slot: a non-start write returns SILENTLY and refuses nothing — deliberate, gh#50 finding 1, since
      // naming a cause that is false would re-announce on every tap. A record another closure created
      // since: the identity compare refuses it as 'other-round'. Deliberately not moved into write(): a
      // refused write leaves session.checkpoint mutated in memory (gh#50), and the owner has to be wrong
      // in exactly the same way at exactly the same moment, or the pair drifts.
      myCpOwner = cp === null ? null : myId;
      write();
    },
    clear(): void {
      // The one write path that had no guard at all (gh#51 F2). clear() is on GameSession, so it is
      // reachable from the long-lived ctx.session closure game/[id].astro builds once per mount and a
      // bfcache restore keeps alive: the first game to ship a quit-round button would hand a stale
      // closure the power to delete the round the newer document is playing — gh#49's loss with
      // nothing left to overwrite back. Same compare-and-swap as write(), reported the same way and
      // reconciling nothing (ADR-0022): on a refusal this closure's own state stays as it was too,
      // because a half-cleared closure would show the player an empty round the record still holds.
      // An absent record needs no refusal — removeItem is already a no-op and nothing is lost.
      const current = readRaw(myId);
      const stale = current === null ? null : mismatch(current);
      if (stale !== null) {
        refuse(stale);
        return;
      }
      session.players = [];
      session.played = [];
      session.checkpoint = null;
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        // ignore
      }
    },
  };

  return session;
}
