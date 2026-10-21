# Launch decision tracker

Blocking or high-priority policy choices that are **not** fully encoded in code yet. Backend invariants (404-on-deny, contact isolation, grant checks) must not be weakened while these are decided.

| Topic | Status | Notes |
| --- | --- | --- |
| Contact-data retention period | Open | How long `SubmissionContact` rows are kept after triage/rejection. |
| Cloudflare Turnstile / captcha | Partially encoded | Server-side Turnstile verification is implemented when `SUBMISSION_CAPTCHA_ENABLED=true` and `TURNSTILE_SECRET_KEY` is set. Local and CI keep captcha off. |
| Antivirus scanning for archive uploads | Open | Uploads validate magic bytes and size only; AV scanning is a launch gate. |
| Who may grant `RESTRICTED` access | Partially encoded | Phase 2: editors with an active grant on the document may grant others. Confirm editorial policy matches this rule. |
| Public archive (`PUBLIC_*` visibility) | Deferred | Classification may set visibility values; the public site shows fact-checks only, not archive documents. |
| Topics model | Encoded in 4.1 | Staff-managed topics with bilingual names; slugs captured in published snapshots. |
| Hosting provider | Open | Requirements and env contract in [hosting.md](hosting.md). No vendor lock-in in the repo. |
| Minimum staffing (three roles per language cycle) | Encoded in workflow | Independence guards enforce distinct author, ready editor, and approver; confirm staffing can always meet this in operations. |
| Attribution style (named staff vs team byline) | Open | Code default: `PUBLICATION_ATTRIBUTION` in `editorial_rules.py`. |
| Final verdict definitions and examples | Open | Enum values exist; editorial copy and examples belong in this policy doc. |
| Public rendering of withdrawn articles | Decided | HTTP 200 notice-only page with `noindex`; excluded from lists, search, topics, and sitemap. API still returns full snapshot JSON; UI hides body fields. |
| Public API body for withdrawn / old versions | Open | UI and Pages Functions hide content; consider trimming API payloads later for defense in depth. |
| Approver-unavailable fallback | Open | Only the approving approver may publish; no automated fallback is implemented. |
