# gh#313 prize-draw event store, real IndexedDB, headless Chrome (2026-11-13)

Subject: the built `dist/` (uncommitted gh#313 work). Instrument: `drive.mjs.txt` (own CDP client, trusted
`Input.dispatchMouseEvent` clicks, `Page.javascriptDialogOpening` handling, launches and kills only its own Chrome).
Every reading is in `scenarios.json`; screenshots `s*-*.png` here.

## Commands
```
npx serve dist -l 4355 &                       # pids recorded, killed at the end
cp drive.mjs.txt drive.mjs
CDP_PORT=9555 PROFILE=<scratch>/chrome-9555 OUT=<this dir> node drive.mjs
```
Each scenario starts a Chrome with a wiped profile (instrument, 1-6 each get their own).

## Instrument check
`document.title` read back on the setup page (non-empty Thai title). Must-red: the IndexedDB read helper pointed at
database `no-such-db` returns `{missing:'database'}` (not an empty pass); against the real name before any event it
returns `{missing:'record', keys:[]}`.

## Verdicts
| # | Scenario | Verdict | Decisive reading |
|---|---|---|---|
| 1 | create and resume | PASS | 12 names, start opens `/play/`; draw stores round 1 (10 survivors, code 029106819 in that run) at `revealed`; reload: record byte-identical, still 1 round |
| 2 | migration | PASS | localStorage text copied into IDB, byte-identical to scenario 1's; LS key null after open and after a 2nd reload; `keys` = `["current"]`; projector shows the round-1 reveal |
| 3 | two tabs | PASS | both clicks dispatched without awaiting between; IDB has exactly 1 round; both tabs show the same text, 10 survivor chips, all in the stored survivors; both tabs read identical raw. Which tab lost the race is not recorded (the lost-race path leaves no distinct trace once converged) |
| 4 | refused browser | PASS | throw-on-access: setup start message and projector both show `[copy: owner — refused browser]`, projector has no control, start click stays on setup, no record created. `open` firing `onerror`: same |
| 5 | confirm before replace | PASS | `confirm` dialog message `[copy: owner — confirm replace]`; dismiss: stays on setup, stored text byte-identical; accept: new event key, name "Second event", navigates to `/play/` |
| 6 | versionchange/blocked | PASS on the stated criterion, with a defect found below | tab B `open(name, 2)`: events `upgradeneeded` at 0ms, `success` at 2ms, no `blocked`; tab A's connection closed itself |

## Behaviour that differs from what the code claims (scenario 6)
`store.ts` says it "steps aside so a later version is not blocked". It does, but the open store is then dead and
nothing tells the page. In tab A (projector, event at `ready`) after the upgrade: the screen still shows the
reveal button; pressing it shows the save-failed notice and the stored event stays at 0 rounds. Reloading tab A
shows `[copy: owner — refused browser]`, because the code asks for version 1 on a version 2 database
(VersionError, so the open errors, so the store is null). With v1 code and a v2 database the event is unreachable
until site data is cleared. Not a defect while the version stays at 1; a future version bump needs a plan for old
tabs (reload prompt) and rollback.

## Not covered
Multiple real browsers (Safari/iOS WebKit: IndexedDB transaction semantics differ), quota errors, a mid-transaction
tab kill, and the migration's abort branch. The two copy constants are placeholders; assertions are on their rendered text.
