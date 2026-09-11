// What a CDP Runtime.evaluate reply MEANS — the pure half of scripts/driver.mjs's session.evaluate,
// split out because driver.mjs opens a websocket at import time and can never be read by a test.
//
// THE INVARIANT, one sentence: only a positive confirmation counts as a value, and everything else
// is an error.
//
// Chrome owns the shape of a failure envelope ({id, error:{code,message}} for a destroyed execution
// context, a detached target, a closed tab), so a guard that enumerates known failure shapes is a
// set this repo does not own and can never finish. The set we DO own is the success shape: a
// Runtime.evaluate that ran has `result.result`. Absent that key, the call did not run, and saying
// so is the whole job — the old mapper returned {value: null} there, which every caller reading
// `.value` then read as a legitimate null and walked on.
export function evaluateResult(res) {
  const r = res?.result;
  if (!r) return { error: res?.error?.message ?? 'no result envelope' };
  if (r.exceptionDetails) {
    return { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  }
  return { value: r.result?.value ?? null };
}

// The one read every walking probe makes after a press it expects NOT to navigate: `location.pathname`.
// Returns a sentence naming why the read is unusable, or null when it answered with a real path.
//
// A protocol error here is not noise to skip past: a destroyed execution context IS how a real
// navigation reports itself mid-flight, so the unanswerable read and the finding are the same event.
// Reading it as "no answer, carry on" is what let a landing page's controls be scored under a play
// route's name.
export function locationReadFailure(here) {
  if (here?.error) {
    return `the location read did not answer (${here.error}) — a destroyed execution context is how a navigation reports itself, so this screen is void, not clean`;
  }
  if (typeof here?.value !== 'string') {
    return `the location read returned no pathname at all (${JSON.stringify(here?.value ?? null)}) — nothing can be attributed to a route whose location is unknown`;
  }
  return null;
}
