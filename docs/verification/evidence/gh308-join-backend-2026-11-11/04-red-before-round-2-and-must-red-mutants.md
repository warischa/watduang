## Red on the code before round 2 (`old-code-red-output.txt`)

The new test files ran against the round-1 files, copied to scratch (sha256 prefixes in the output
header): tests 47, fail 23. Every race and budget test reds on its own assertion:

- removal against start, paused either side: "answered removed, yet the start froze it in" (and the
  named variant, paused before the delete: the start's roster still holds the removed id);
- purge against start, the purge paused: "blobs left after the purge" (a roster written after the
  purge listed the event);
- join against purge: the retried purge answers 404; paused before its upload, the join answers 201
  after the purge; a join while a purge runs is admitted;
- join against a start it was not reviewed for: 201 instead of 409;
- delayed removal: "the later joiner was deleted";
- creation budget: the 101st create in an hour answers 201; the budget-race test finds no budget
  write to pause at;
- PIN budget: the right PIN goes through after 300 wrong ones; 400 parallel wrong PINs are all compared;
- names: COMBINING GRAPHEME JOINER inside `Ton` passes, and so does a consonant with 23 SARA AM.

Green on the old code, as expected: two devices racing for one name (round 1's adapter already
created names with `If-None-Match`), the name cap, a missing container answering 503, and a start
body validated before the frozen roster. The last two guard this round's own changes; each has a
mutant below.

## Must-red (n = 64 mutants, `mutants.mjs`; round 4 run)

The harness copies `services/feedback/src` to a temp directory once, mutates the copy, runs the named
test file there and puts the original back; the repo is never written, and the two join files hash
the same before and after (last output line). Command: `node
docs/verification/evidence/gh308-join-backend-2026-11-11/mutants.mjs`, exit 0. All 64 red; the verbatim lines are in
`mutants-output.txt`. They cover:

- the adapter: create without `If-None-Match`, replace without `If-Match`, an upload with no
  conditions, metadata not written, a listing without metadata, a delete without `If-Match`, a 412
  treated as an error, a missing container read as an absent blob, a name stored in metadata
  without base64url (the container refuses non-ASCII metadata, as the SDK does), and the lazy-client
  guard reverted;
- the protocol: start ignoring `removed`, a removal freeing a name without checking the id, a join
  that does not re-check, a purge that does not close first, a retried purge answering 404, a start
  or a purge that gives up after a lost write instead of re-reading, a refused purge that still
  sweeps, the frozen roster returned before the start body is validated;
- the dropped budgets, each put back: an app-wide create cap; the PIN slot throttle; a PIN counter
  after the compare; a wrong PIN that writes anything;
- the expiry clock: no expiry, a clock from creation after a start, 24 hours unstarted, 72 hours
  started, a create that reports the start clock, and the three start-at-commit mutants of round 4;
- the slot cap (round 4): the ten slot mutants and the pre-PIN write listed under Round 4;
- round 1's contract mutants, re-anchored (review, retry, empty roster, stored keys, log, admin,
  expiry, the last now on round 3's clock); the stored-keys mutant now needs two edits, because the record and its metadata are each
  built from an allow-list;
- names: the allow-list, control and lone-surrogate checks, cluster counting, the code-unit ceiling,
  marks on any base, the cluster size cap, a repeated mark, SARA AM placement, pre-escaping, NFC,
  whitespace other than the ASCII space not collapsing, and three folds of the uniqueness key.

