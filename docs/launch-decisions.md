# Launch decision tracker

Blocking or high-priority policy choices that are **not** fully encoded in code yet. Backend invariants (404-on-deny, contact isolation, grant checks) must not be weakened while these are decided.

| Topic | Status | Notes |
| --- | --- | --- |
| Contact-data retention period | Open | How long `SubmissionContact` rows are kept after triage/rejection. |
| Cloudflare Turnstile / captcha | Partially encoded | The submit form renders the widget when `VITE_TURNSTILE_SITE_KEY` is set and sends `captcha_token`. The API accepts the field, but server-side verification is not implemented. `SUBMISSION_CAPTCHA_ENABLED` stays off until it is. |
| Antivirus scanning for archive uploads | Open | Uploads validate magic bytes and size only; AV scanning is a launch gate. |
| Who may grant `RESTRICTED` access | Partially encoded | Phase 2: editors with an active grant on the document may grant others. Confirm editorial policy matches this rule. |
| Public archive (`PUBLIC_*` visibility) | Deferred beyond 4.2 | Classification may set visibility values; the public site shows fact-checks only, not archive documents. |
| Minimum staffing (three roles per language cycle) | Encoded in workflow | Independence guards enforce distinct author, ready editor, and approver; confirm staffing can always meet this in operations. |
| Attribution style (named staff vs team byline) | Open | Code default: `PUBLICATION_ATTRIBUTION` in `editorial_rules.py`. |
| Final verdict definitions and examples | Open | Enum values exist; editorial copy and examples belong in this policy doc. |
| Public rendering of withdrawn articles (notice vs HTTP 410) | Decided in 4.2 | The page stays online at HTTP 200 and shows only the withdrawal notice and date, with `noindex`. The API still returns the full withdrawn body, so the UI hiding it is not a confidentiality control. Confirm whether the API should drop it. |
| Approver-unavailable fallback | Open | Only the approving approver may publish; no automated fallback is implemented. |
