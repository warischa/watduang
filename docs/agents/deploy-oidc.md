# Deploy credentials — OIDC federated credential subject

Split out of `docs/agents/ci-verification.md` on 2026-08-31: that doc is about how to reproduce
CI's verdict, this is about why the deploy identity fails to federate. Different subject, and the
combined file crossed its 12KB ceiling.

## OIDC federated credential subject — AADSTS700213 despite matching the docs

Split out of `docs/runbook.md` at the seam `CLAUDE.md` already names (ADR-0012).

**Symptom:** `azure/login` (OIDC) fails with:

```
AADSTS700213: No matching federated identity record found for presented assertion subject
```

even though the federated credential's subject was set exactly the way Microsoft's docs — and every
guide — say to set it: `repo:<owner>/<repo>:ref:refs/heads/<branch>`.

**Cause:** on this GitHub organisation, GitHub does not send that subject. It sends the
immutable-identifier form, with numeric IDs appended to both the owner and the repo:

```
repo:warischa@271706784/watduang@1332779094:ref:refs/heads/main
```

Measured, not assumed: the credential was first created with the name-based form, and login failed
with the exact error above. It was caught 2026-08-19 by a throwaway smoke test on a temporary branch,
before the site ever went live. The credential has since been corrected to the ID form and proven
working — `azure/login` succeeded and fetched the deployment token, run 32273450017 (see "Per-step
outcomes" above, same run).

**Recover the true value:** the failing `azure/login` step prints the `subject claim` it presented —
read it off that run's log. The numeric IDs belong to this org and this repo; they are not guessable
and will differ for any other repo, so there is nothing to look up in advance.

**Don't:** trust Microsoft's docs, a blog post, or a prior session's memory for the subject format on
this org — recreate the credential from a failing run's log instead, every time.

