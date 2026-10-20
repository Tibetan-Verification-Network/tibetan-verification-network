# Launch decision tracker

Blocking or high-priority policy choices that are **not** fully encoded in code yet. Backend invariants (404-on-deny, contact isolation, grant checks) must not be weakened while these are decided.

| Topic | Status | Notes |
| --- | --- | --- |
| Contact-data retention period | Open | How long `SubmissionContact` rows are kept after triage/rejection. |
| Cloudflare Turnstile / captcha | Open | `SUBMISSION_CAPTCHA_ENABLED` defaults off; enable at launch when keys and UX are ready. |
| Antivirus scanning for archive uploads | Open | Uploads validate magic bytes and size only; AV scanning is a launch gate. |
| Who may grant `RESTRICTED` access | Partially encoded | Phase 2: editors with an active grant on the document may grant others. Confirm editorial policy matches this rule. |
| Public archive (`PUBLIC_*` visibility) | Deferred to Phase 4 | Classification may set visibility values; nothing is published publicly until Phase 4. |
