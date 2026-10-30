# Commit-message policy and authorized history cleanup

Updated October 20, 2026.

Ron requested removal of all AI percentage tags from commit messages throughout
his personal GitHub account, including percentages other than 100. Use normal,
descriptive conventional commit subjects without those tags. This supersedes
earlier chat/handoff instructions requiring an attribution suffix.

## Completed cleanup

The account inventory covered 16 owned repositories. Four contained percentage
tags: MATMOUD-clinical-compliance-suite, MultiSportPredict, Botium-Compliance-Audit,
and MedNet-Sentinel-Splunk. The cleanup removed tags from 96 distinct commit
messages and rewrote their affected descendants across eight published branches.
No published tags existed in those four repositories.

Each rewritten commit retained its file tree, author/committer names, dates,
and parent topology. MATMOUD additionally required replacing one private email
address with Ron's GitHub noreply address because GitHub rejected the original
metadata under its email-privacy protection. That protection was not disabled.
Six signatures on rewritten published commits could not remain valid and were
removed. Original signed objects remain in the verified local backup bundles.

Pushes used explicit branch references, atomic per-repository updates, and
force-with-lease checks against the observed original branch tips. Other
repositories and branch protection settings were not changed.

The MATMOUD and MultiSportPredict local branch references were also updated,
including local-only branches, to avoid reintroducing tags in later pushes.
Tracked and untracked worktree state was checked before/after; existing local
work was preserved.

## Backups and tooling

Recovery directory on Ron's machine:

```text
C:/Users/RonRi/.codex/backups/github-commit-message-cleanup-2026-10-20/
```

It contains repository inventory, verified Git bundles, bundle hashes, original
refs, complete old-to-new commit maps, rewrite plans, and hook/extension backups.
Keep those backups local; configuration backups can contain private settings.
Do not commit or upload the backup directory.

The VS Code AI Commit Tracker extension (`ddesk.ddesk-ai-commit-tracker`) was
backed up and uninstalled. Its existing percentage-appending hook blocks were
removed from four discovered local repositories, retaining any unrelated hook
content. Its tracking setting was disabled. Do not reinstall the tag generator
or recreate a percentage-appending hook as part of normal project work.

## Commit references and limitations

History rewriting changes commit IDs. Documentation references in the current
handoff have been updated using the saved maps. Older conversations, screenshots,
and external links may still identify the old commits.

This cleanup concerns published branch/tag history. GitHub can retain original
objects through old commit URLs, cached views, or pull-request references that
normal Git pushes cannot rewrite. Other machines and third-party forks also
retain their own copies. Do not describe this operation as guaranteed erasure of
every retained copy on GitHub or elsewhere.

Percentage-free commit subjects do not change factual implementation/review
provenance. Preserve accurate authorship and review descriptions without
inventing exclusively human authorship or claiming production readiness.
