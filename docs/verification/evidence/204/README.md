# gh#204 box 6 — calibrating bangkok-drift's `test-logic.js`

Box 6 asks: does `node test-logic.js` pass, and does one deliberate rule break make it fail?
Both halves demonstrated below, against the owner's file at
`~/claude/mockup-games/bangkok-drift/`, read-only, never mutated.

## Check count

`test-logic.js` defines each assertion group with a `check('name', () => {...})` call. Counted with:

```
grep -c "^check(" ~/claude/mockup-games/bangkok-drift/test-logic.js
```

Result: **11**. Matches the file's own summary line at the end of a passing run
(`11 checks passed`, confirmed below).

## 1. Pristine run passes

```
cd ~/claude/mockup-games/bangkok-drift && node test-logic.js; ec=$?; echo "EXIT_CODE=$ec"
```

All 11 `ok` lines print, followed by `11 checks passed`, then:

```
EXIT_CODE=0
```

(`ec` captured directly from `$?` right after the command in the same shell, no pipe in between.)

## 2. One deliberate rule break goes red

The rules block lives inside `index.html` between the `// @logic-start` and `// @logic-end`
markers; `test-logic.js` slices it out and evaluates it. The mutation was made only on a
scratch copy of `index.html`, never on the owner's file.

Flipped line, inside `stepDrive`, the branch that ends a turn on a lethal obstacle:

- before: `if (k.lethal) return 'crash';`
- after: `if (!k.lethal) return 'crash';`

This inverts which obstacle kind ends the turn: rock/cone (lethal) stop crashing, and
puddle/banana (non-lethal) would crash instead — the exact rock/cone-vs-puddle/banana
distinction box 6 asks the harness to protect.

Running the unmodified `test-logic.js` against the mutated scratch `index.html`
(same directory, so `test-logic.js` reads the mutated file by its own `__dirname` lookup):

```
cd <scratch>/bangkok-drift && node test-logic.js; ec=$?; echo "EXIT_CODE=$ec"
```

Output: the first three `ok` lines print (seed determinism, all four kinds appear, spacing/gap
rule), then node throws before printing a fourth `ok` line:

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
null !== 'crash'
```

```
EXIT_CODE=1
```

The check that caught it: **"LETHAL rock: in the car lane ends the turn on entering its
segment; one lane over does not"** (the 4th `check(...)` block, the first one that exercises
`k.lethal`). Its `assert.equal(hit.r, 'crash')` failed because the rock no longer ends the turn
under the flipped line.

### What did not fire

`node`'s `assert` throws on the first failure inside a `check(...)` callback, which stops the
whole script. So the LETHAL rock check firing red means checks 5 through 11 — including
"LETHAL cone" and "CONTROL puddle"/"CONTROL banana", which the flipped line would also break
(cone would stop crashing; puddle/banana would start crashing) — never ran and never got a
chance to catch anything on this run. Their exposure to this exact mutation is not demonstrated
here, only inferred from reading the flipped condition.

## 3. Original file untouched

Checksums taken before opening the scratch copy and again after the mutated run, both against
the owner's live directory, not the scratch copy:

```
shasum -a 256 ~/claude/mockup-games/bangkok-drift/test-logic.js ~/claude/mockup-games/bangkok-drift/index.html
```

Before:
```
dcc27a6e24c340bc56867b51ffb3cc3f8843821a23d69a504a72e83cf7fcf094  test-logic.js
4a7600b4dbce9c9456ae592886723b5ea990784e49bcac93e1c879f9e1876499  index.html
```

After (identical run, same two files):
```
dcc27a6e24c340bc56867b51ffb3cc3f8843821a23d69a504a72e83cf7fcf094  test-logic.js
4a7600b4dbce9c9456ae592886723b5ea990784e49bcac93e1c879f9e1876499  index.html
```

Both hashes match. The owner's directory was never written to; the mutation lived and died in a
scratch copy.

## What this does not cover

- This calibrates the harness, not the rule set: one flipped line proves `test-logic.js` is
  capable of going red, not that all 11 checks are individually sensitive to every rule they
  claim to cover.
- Because `assert` aborts the script on first failure, only the check that fired first
  (LETHAL rock) is proven to catch this particular mutation. The other checks this same flip
  should also break (LETHAL cone, CONTROL puddle, CONTROL banana) were never reached and are
  not demonstrated as calibrated by this run.
- No other mutation was tried. A different rule break (a wrong constant, a wrong obstacle-kind
  index, a sign error in `buildTrack` or `rankPlayers`) has not been shown to go red — this
  evidence covers exactly the one line named above.
- box 7 (frame rate on a mid-range Android phone) and box 9 are out of scope here and untouched.
