// gh#121 — "a round was started on this page", as one shared call instead of a per-module habit.
//
// The shell's leave-confirm (src/shell/LeaveConfirm.astro) arms on that fact. A party page carries it
// structurally: #player-setup exists and its `hidden` flips the moment a round begins, so the shell
// reads the bit off the DOM. An ADR-0040 solo page ([1, 1]) renders no panel, so there is no bit —
// the game module is the only thing that knows, and this event is how it says so.
//
// Why this file exists rather than a dispatch written out in each game: the event name is a contract
// between a game module and the shell island, and a typo on either side is a SILENT loss of the guard
// — a player mid-round taps a link and loses the round with no confirm, and every test stays green
// because both halves still "have a string". Exporting the name makes a mismatch a `tsc` error, and
// gives scripts/round-start-announce-check.mjs a single symbol to require instead of a literal that a
// module could misspell past it. The underscore keeps this out of the game page's lazy-loader glob
// (`!../../games/_*.ts`), the same way _arm-gate.ts and _el.ts stay out of it.
//
// The set of modules that must call this is NOT guessed from source: every GameModule declares
// `startsRound` (src/games/types.ts), so a new module cannot ship without answering the question, and
// the gate reads the declaration. Nothing at runtime reads it — the shell stays keyed on the signal,
// never on a list of game ids, which is the property gh#106 was fixed to get.

/** The document event the shell's leave-confirm listens for. Imported by both sides on purpose. */
export const ROUND_STARTED_EVENT = 'watduang:round-started';

/** Announces that this page has entered a live round. Call it at EVERY entry into one — a fresh start
 *  and a resumed checkpoint both count. The shell's listener latches, so repeats are free and there is
 *  nothing to clear: the predicate is "started", and a finished-round summary must still ask.
 *
 *  ponytail: no arguments, no options, no return. The one thing a caller could get wrong is not
 *  calling it, and that is what the declaration plus the gate cover — not a parameter. */
export function announceRoundStarted(): void {
  document.dispatchEvent(new CustomEvent(ROUND_STARTED_EVENT));
}
