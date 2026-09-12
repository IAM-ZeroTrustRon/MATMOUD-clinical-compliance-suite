# LinkedIn assets — MOUD Compliance Security Audit

Two things here: the **Projects section entry** (permanent profile content) and the **post** (one-time announcement). Attach `MOUD_Security_Audit_LinkedIn.jpg` to the post.

---

## 1 · Projects section entry

*Profile → Add profile section → Recommended → Add projects*

**Project name**
```
Healthcare Application Security Audit — MAT/MOUD Clinical Compliance Suite
```

**Dates**
```
Aug 2026 – Sep 2026  (check "I am currently working on this project" if you plan to keep closing findings)
```

**Associated with**
Leave blank, or associate with your Per Scholas cohort if you want it tied to the program.

**Project URL**
```
https://github.com/IAM-ZeroTrustRon/MOUD-Compliance-Security-Audit
```

**Description** *(LinkedIn allows 2,000 characters — this is ~1,350)*
```
Self-conducted static security code review of a HIPAA and 42 CFR Part 2 healthcare application I designed and built — a multi-tenant platform tracking clinician credentials for opioid use disorder treatment clinics.

Manual white-box review across five phases: attack-surface scoping, claim-to-code tracing (verifying every documented security property against the code implementing it), control-by-control review, supply chain and repository hygiene, and re-verification against live source.

18 findings identified. Severity assigned by impact on the confidentiality, integrity, and auditability of protected health information — not by difficulty to fix — and each finding mapped to the specific HIPAA Security Rule or 42 CFR Part 2 provision it implicates, so the output is actionable by a compliance reviewer rather than only an engineer.

Every critical and high-severity finding is now closed and regression-tested. The most severe: multi-factor authentication was structurally correct, ran on every protected route, and was documented as enforced — but the allow-list of accepted authentication methods included the identity provider's value for an ordinary password-only login. Every session passed the check. The control was inert.

Remediation followed a defined discipline: defense in depth over single fixes, fail-closed defaults, documenting deliberate exclusions so mistakes cannot be reintroduced, and preferring no dependency to a small one in a system holding patient data. 35 regression tests were added — and each suite was verified to FAIL against the original defective code before being accepted, because a test that has never been shown to fail is not yet evidence of anything.

Eleven findings remain open, documented as open and severity-ranked.

Skills: threat-informed code review · IAM and authentication analysis · multi-tenant isolation · PHI data-flow tracing · audit-coverage assessment · risk-based severity ranking · HIPAA / 42 CFR Part 2 control mapping · security regression testing.
```

---

## 2 · The post

Attach: `MOUD_Security_Audit_LinkedIn.jpg`

```
I found a critical security flaw in code I wrote myself.

Multi-factor authentication in my healthcare app wasn't actually enforced.

Not because I forgot to build it. I did build it. The check ran on every protected route. The code comments said MFA was enforced. The error message it returned was stricter than most production systems I've seen — it explicitly refused SMS as a second factor.

The problem was one value in the allow-list of accepted authentication methods: the identity provider's code for an ordinary password-only login.

Every authenticated session passed the MFA check. The control was doing nothing.

I only found it because I stopped trusting that I'd been careful and audited my own codebase the way I'd audit a system I'd never seen — tracing every security claim the application makes back to the code that implements it, and checking whether the implementation was actually correct rather than merely present.

18 findings. Every critical and high-severity one is now closed.

Three things I took from it:

→ A security control can be structurally correct and semantically wrong. Reviewing the shape of a check is not reviewing the check.

→ Documentation and error messages are evidence of intent, not evidence of behavior. Here, they actively increased my confidence in a control that wasn't working.

→ This defect was invisible to code review and to dependency scanning — and visible immediately to a single test. That's an argument for tests as a security control, not just a quality one.

So I wrote 35 of them. And before accepting any suite, I restored the original broken code and confirmed the tests failed. A test that's never been shown to fail isn't evidence of anything yet.

Five years as a Certified Recovery Specialist taught me what these clinics actually need. The audit taught me something harder: that building a control and verifying it works are completely different activities.

Full methodology and write-up: github.com/IAM-ZeroTrustRon/MOUD-Compliance-Security-Audit

#GRC #HealthcareIT #ApplicationSecurity #HIPAA #CyberSecurity
```

**Word count:** ~360. Long for LinkedIn but this format (confession → lesson → evidence) performs well and the first three lines carry the hook above the "see more" fold.

### Shorter variant, if you prefer

```
I found a critical security flaw in code I wrote myself.

Multi-factor authentication in my healthcare app wasn't actually enforced.

The check ran on every route. The comments said MFA was enforced. The error message explicitly refused SMS as a second factor.

But the allow-list of accepted login methods included the identity provider's value for a plain password-only login. Every session passed. The control was inert.

A security control can be structurally correct and semantically wrong. Reviewing the shape of a check is not reviewing the check.

I audited the whole codebase the way I'd audit a system I'd never seen. 18 findings. Every critical and high-severity one is now closed, each with a regression test I first proved would FAIL against the original code.

Full methodology: github.com/IAM-ZeroTrustRon/MOUD-Compliance-Security-Audit

#GRC #HealthcareIT #HIPAA #ApplicationSecurity
```

---

## 3 · Notes

- **Post the image natively** (upload the JPG), don't rely on the link preview. Native images get materially more reach than link posts.
- **Put the GitHub link in the post body** as plain text, or in the first comment if you want to avoid link suppression. Both work; test whichever you prefer.
- **Reply to every comment in the first two hours.** That window drives distribution more than anything else you control.
- The image is 1200×1200 square — it takes maximum vertical space in the mobile feed. A 2400×2400 version is included if you want it for anything print-adjacent.
