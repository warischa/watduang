# gh#45 — run-level calibration of the Unit tests count assertion

The `Unit tests` step used to be `node --test 'src/**/*.test.mjs'` and nothing else. A glob that
matches nothing is not an error to node: it prints a zero-test summary and exits 0. The step was
therefore greenest in exactly the state where it protected nothing.

Measured before the fix, node v22.22.1:

```
$ node --test 'src/**/*.nosuchtest.mjs'; echo EXIT=$?
# tests 0
# pass 0
# fail 0
EXIT=0
```

## What was added

The step now asserts node's own pass count is non-zero:

```
node --test 'src/**/*.test.mjs' 2>&1 | tee /tmp/unit-tests.txt
[ "${PIPESTATUS[0]}" -eq 0 ] || exit 1
grep -qE '^# pass [1-9]' /tmp/unit-tests.txt || { ...; exit 1; }
```

`PIPESTATUS`, not the bare exit status — after a pipe that status belongs to `tee` and is always 0
(the CI-verification agent doc records this trap).

A grep for `# pass [1-9]` rather than arithmetic on a parsed number: no `awk`, no numeric compare
that errors on unexpected input, and if node's summary format ever changes the pattern stops
matching and the step goes **red**, not silently green. The failure direction is the safe one.

## The pair — one variable

| head | tree | run id | conclusion |
|---|---|---|---|
| `3ca7c58` | the fix | 32212299488 | **success** |
| `1cb07f2` | the fix + the glob pointed at nothing | 32212382616 | **failure** |

The only difference between the two trees:

```
-          node --test 'src/**/*.test.mjs' 2>&1 | tee /tmp/unit-tests.txt
+          node --test 'src/**/*.nosuchtest.mjs' 2>&1 | tee /tmp/unit-tests.txt
```

One file, one line. **The same broken tree was green before this fix** — that is the whole of gh#45,
and it is why the red matters: it is not a new gate catching a new thing, it is a gate catching the
thing that was already invisible.

Locally calibrated both ways first: real tree green, non-matching glob red.

Runtime-inert for the site — only `ci.yml` changed, nothing enters `dist/`.
`gh api .../actions/secrets` returned `total_count: 0` before both pushes, so no run had a deploy
path. Branch `calibrate/gh45-test-count` deleted local and remote.

## What this does not prove

Which step went red. `/actions/runs/<id>/jobs` 404s on this repo, so per-step conclusions are
unreadable and the run-level `failure` is the whole of the observed signal. The identification of
the failing assertion is the local both-ways calibration above, recorded as such rather than letting
the red imply a per-step verdict it did not earn (ADR-0019).
