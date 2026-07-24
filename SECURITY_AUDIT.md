# Security Audit Record — Auth Middleware Amend

**Date:** 2026-07-23
**Auditor:** AI-assisted review (Cline)
**Repository:** clinical-compliance-suite (now private)

---

## Summary

An interactive rebase (`git rebase -i`) was performed to amend commit `3049228`, which originally introduced `DEV_SKIP_AUTH` bypass logic and a hardcoded `test-dev-secret` into `apps/api/src/middleware/auth.middleware.ts`. The amend replaced those insecure defaults with fail-closed validation.

---

## Verification Results

### 1. Current HEAD (`f743111`) — auth.middleware.ts

`git show f743111 -- apps/api/src/middleware/auth.middleware.ts` confirms:

- **No `DEV_SKIP_AUTH`** — removed.
- **No `test-dev-secret`** — removed.
- **No fallback to `['admin']` or `'test-tenant-1'`** — replaced with fail-closed checks that return 403 when roles or tenant_id claims are missing.
- **Security notes block** added to the JSDoc documenting the fail-closed design.

The amend landed correctly on the right commit.

### 2. Old commit `3049228` — reachability

| Check | Result |
|---|---|
| `git branch --contains 3049228` | No output — **no branch contains this commit** |
| `git log --oneline --all \| findstr "3049228"` | Exit code 1 — **not found in any DAG-walkable history** |
| `git cat-file -t 3049228` | Returns `commit` — **object still exists in local object store** |

### 3. Residual risk assessment

The commit object `3049228` is an orphan — no ref reaches it, and it is not visible in any branch history. However:

- **The object still exists** in the local repository's object store (confirmed via `git cat-file -t`).
- **On GitHub:** the pushed commit object may persist in GitHub's internal storage for an indeterminate period. GitHub does not guarantee immediate garbage collection of orphaned objects.
- **Making the repo private** controls who can browse the repository, but does not retroactively delete already-orphaned objects from GitHub's backend. Anyone with explicit repo access could potentially fetch the commit by its exact SHA (`git fetch origin 3049228`) as long as GitHub hasn't pruned it.
- **Practical risk is minimal** because:
  - The repo is now private — only explicitly authorized collaborators can attempt the fetch.
  - The sensitive content (`DEV_SKIP_AUTH`, `test-dev-secret`) existed in the *diff* of that commit, not in the tree of any current branch tip.
  - No CI logs, issue comments, or public references to that SHA exist.

**Corrected statement:** "The old commit is no longer reachable from any branch, but the commit object may still exist in GitHub's storage and could be fetchable by its exact SHA by anyone with repo access. Risk is now minimal because the repo is private."

---

## What was NOT achieved

- **No force-push was performed.** The amend exists only in the local repository. The old commit `3049228` may still exist on the remote if it was previously pushed.
- **No GitHub garbage collection was triggered.** Orphaned objects on the remote are subject to GitHub's internal pruning schedule, which is not user-invokable.
- **No Dependabot / secret scanning alert was verified.** If GitHub's secret scanning had already detected `test-dev-secret` in the old commit, that alert may still exist in the repository's security tab regardless of the amend.

---

## Recommendations

1. If the old commit was previously pushed to the remote, a force-push of the amended branch is required to orphan it on GitHub. (Verify with `git log origin/main` vs `git log main`.)
2. Check GitHub's security tab for any secret scanning alerts related to `test-dev-secret` and dismiss them as false positives if the secret was test-only and never used in production.
3. Rotate any credentials that may have been exposed in the old commit's diff, even if the exposure was brief.