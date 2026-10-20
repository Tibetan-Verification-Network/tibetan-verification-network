# Editorial policy (Phase 3 enforceable rules)

This document describes publication standards for the Tibetan Verification Network. Rules enforced in code live in `backend/app/core/editorial_rules.py` and `backend/app/workflow/readiness.py`, with automated coverage in `backend/tests/test_readiness.py`, `backend/tests/test_reviews.py`, and `backend/tests/security/test_phase3_gate.py`.

## Independence and roles

Each language version in a publication cycle requires three distinct people:

1. **Author** — anyone who saved a material draft revision in the current cycle (`authors_of` / revision authorship).
2. **Ready-marking editor** — holds the editor role, is not an author, and marks the version ready for approval.
3. **Approver** — holds the approver role, is not an author, is not the ready-marking editor, and records approval against the exact revision.

Only the approver who recorded the approval may publish that revision (`assert_is_approving_reviewer`).

## Required publication fields

Before mark-ready, approve, or publish, readiness checks require: title, claim, context, verdict, verdict explanation, non-empty sanitized analysis and limitations Markdown, at least one linked public source (`MIN_PUBLIC_SOURCES`), verified evidence for referenced sources, a public slug, consistent translation status, and an investigation that is not on hold or rejected.

## Sources and evidence

Public source references must belong to the same investigation as the fact check. Evidence linked to referenced sources must be verified before publication (`POST .../evidence/{id}/verify`).

## Verdicts

Verdict values use the `PublicVerdict` enum. Final definitions and worked examples are owned by the editorial team; until finalized, see [launch-decisions.md](launch-decisions.md).

## Corrections, updates, and clarifications

Published language versions may enter a new cycle via `POST .../corrections` with kind `correction`, `update`, or `clarification`. The prior live snapshot remains public until a new version is published. Republishing requires a non-empty public `correction_note` and the full review and approval flow again.

## Withdrawals

Approvers may withdraw a published language version with a public notice and an internal reason. A withdrawal creates an immutable tombstone snapshot (`ArticleVersionKind.WITHDRAWAL`).

## Attribution

Published snapshots include the `attribution` field. The default byline is configured in `PUBLICATION_ATTRIBUTION` until launch decisions finalize named-staff vs team attribution.

## Approver assignment

Approvers see fact checks in the approval queue when any language is ready for approval or approved, excluding their own authorship and ready-marking work (`scope_factchecks` / approval queue filters).
