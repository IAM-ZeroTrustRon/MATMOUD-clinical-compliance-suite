# Independent repository layout

Verified October 29, 2026. Use these working folders in GitHub Desktop and editors.
Each folder has its own Git history and remote; none is a submodule of another.

| Purpose | Active local folder | GitHub repository |
| --- | --- | --- |
| Application: API, web, Android, implementation evidence | `C:\Projects\clinical-compliance-suite` | [MATMOUD-clinical-compliance-suite](https://github.com/IAM-ZeroTrustRon/MATMOUD-clinical-compliance-suite) |
| Independent security audit and findings | `C:\Projects\MOUD-Compliance-SecAudit` | [MOUD-compliance-SecAudit](https://github.com/IAM-ZeroTrustRon/MOUD-compliance-SecAudit) |
| Case study and architecture | `C:\Projects\Clinical_Compliance_Hub` | [Clinical_Compliance_Hub](https://github.com/IAM-ZeroTrustRon/Clinical_Compliance_Hub) |

An additional existing repository was also preserved as a sibling:
`C:\Projects\grc-case-study-clinical-compliance`, connected to
[grc-case-study-clinical-compliance](https://github.com/IAM-ZeroTrustRon/grc-case-study-clinical-compliance).
It is a distinct repository, not an alternative name for Clinical_Compliance_Hub.

## Recovery and preservation

The former `C:\MOUD-Compliance-Security-Audit` area remains a recovery copy.
Windows denied moving its open directories. Do not edit, commit, or run Git there:
the interrupted initial application move left incomplete Git metadata in that
old application folder. The complete application history was recovered and
verified at the new location; recloning over the old working files is unnecessary.

Local recovery bundles, the source/destination manifest, and preservation hashes
are stored outside the repositories under
`C:\Users\RonRi\.codex\backups\moud-workspace-relocation-2026-10-29`.
Ignored environment files, Android SDK settings, portfolio drafts, and existing
audit assets were preserved. They are not automatically approved for publication.
Six recorded configuration/asset hashes matched after copying. The two generated
npm workspace junctions were recreated to point to the new application folders.

## Working practice

Open each active folder using GitHub Desktop's **File → Add local repository**.
For application development, select `clinical-compliance-suite` and confirm
`feat/mobile-oauth-simplification` before changing files. Before staging, inspect
the repository root, remote, branch, and diff. Stage explicit paths only.

Keep implementation documentation and reproducible control evidence in this
application's `docs/`; the independent audit repository can link to that evidence.
Keep portfolio drafts separate from application source. Do not add nested `.git`
directories, submodule pointers, environment files, or generated build output.
Use conventional commit messages without AI percentage tags.

Relocation did not merge branches or pull the audit repository's two outstanding
remote commits. Its four pre-existing untracked assets remain untracked pending
review. Historical reports may retain their original execution paths; this file
defines the current working locations.
