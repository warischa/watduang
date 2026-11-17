Result: FAIL
1. scripts/evidence-local-path-check.mjs:78 · hyphenAccount · med · Confirmed [mechanism] [pre-existing]
   Tracked `<hyphen-encoded home path>` passes: account `example-alice` is parsed as reserved `example`.
   Encoding loses the account/path boundary: `<scratch>` and `<scratch>` collapse identically. Reject ambiguous encodings or preserve an explicit boundary.
   base: reproduces — RAN HEAD and candidate; both exit 0. HEAD excluded this non-evidence file; the new repo-wide promise remains unmet.
2. scripts/evidence-local-path-check.mjs:81 · SHAPES · med · Confirmed [spot-fix] [pre-existing]
   Tracked evidence containing a home path whose account is Thai letters or starts with a digit (literal elided so this record does not trip the gate it describes) passes because the account must start `[A-Za-z]`. The ASCII hyphen matcher similarly misses non-ASCII identities outside evidence.
   base: reproduces — RAN HEAD and candidate tracked fixtures; both exit 0. Broaden account matching and add must-red fixtures.

Selftest: assertions are real; disabling account detection caused AssertionError and exit 1. Its current fixtures miss these cases.
Admissions: no weakening of existing route exemptions found; existing pins and render policies were preserved, and scroll-only additions strengthen clipping checks.
Coverage: read supplied diff plus six slices; RAN candidate/HEAD gate suites, selftests and tracked-fixture probes. HEAD suites passed after restoring a missing scratch fixture. No browser/build verification; reset-control negative mutation was not established.
would change if: the gate rejects these tracked counterexamples while preserving the intended placeholder policy.
