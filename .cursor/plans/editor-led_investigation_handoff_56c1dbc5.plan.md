---
name: Editor-led investigation handoff
overview: Phase 1 makes investigation intake editor-led and assigns every new investigation to a researcher owner. Phase 2 makes the approver a selected domain expert, returns approved work to the marking editor for publication, and moves correction and withdrawal authority to editors.
todos:
  - id: backend-policy-contract
    content: Make triage/create editor-only and require a valid researcher owner in both backend creation contracts.
    status: completed
  - id: frontend-handoff
    content: Keep researcher Inbox read-only and add mandatory researcher selection to editor creation dialogs.
    status: completed
  - id: approval-designation
    content: Require one approver per ready revision and restrict approval to that selected domain expert.
    status: pending
  - id: editor-publication
    content: Return approved work to the marking editor for publication and move correction/withdrawal to editors.
    status: pending
  - id: regression-tests
    content: Cover both handoffs, role denials, queues, ownership, publication authority, and UI visibility.
    status: pending
  - id: docs-verification
    content: Update workflow/access documentation and run targeted plus full verification.
    status: pending
isProject: false
---

# Editor-led investigation and publication handoff

## Phase 1: Editor opens and assigns investigations

### 1. Enforce the role boundary in the API
- Update [`backend/app/core/policy.py`](backend/app/core/policy.py) to separate the currently grouped submission permissions: keep `SUBMISSION_LIST` available to researchers and editors, but make `SUBMISSION_TRIAGE` and `INVESTIGATION_CREATE` editor-only.
- Keep existing investigation view/write scoping: editors see all investigations, while researchers can view and work only when they are the owner or have an active assignment.
- Add defense-in-depth checks in [`backend/app/services/intake.py`](backend/app/services/intake.py) and [`backend/app/services/investigations.py`](backend/app/services/investigations.py) so a bypass cannot create an investigation unless the actor is an editor and the selected owner is an active user with the `researcher` role.

### 2. Require a researcher owner on both creation paths
- Extend `TriageOpenInvestigationRequest` in [`backend/app/schemas/intake.py`](backend/app/schemas/intake.py) and `InvestigationCreateRequest` in [`backend/app/schemas/investigations.py`](backend/app/schemas/investigations.py) with a required researcher user ID.
- For both Inbox **Open investigation** and standalone **New investigation**, create the record with the selected researcher as `owner_id`, add an active `OWNER` assignment for that researcher, record the editor as `created_by_id`/`assigned_by_id`, and include the owner in the audit payload.
- Reject missing, inactive, nonexistent, or non-researcher assignees; no database migration is needed because the existing owner and assignment models already support this handoff.

### 3. Align the frontend with the enforced workflow
- Change capability hints in [`frontend/src/editorial/roles.ts`](frontend/src/editorial/roles.ts): researchers retain Inbox visibility, while triage and investigation creation become editor-only.
- Update [`frontend/src/editorial/pages/SubmissionPage.tsx`](frontend/src/editorial/pages/SubmissionPage.tsx) so researchers can read submission text and duplicate suggestions but see no triage, duplicate-marking, assignment, contact, or open-investigation controls. For editors, make the Open dialog require selecting a staff member with the researcher role and send that ID in the triage request.
- Update [`frontend/src/editorial/pages/InvestigationsPage.tsx`](frontend/src/editorial/pages/InvestigationsPage.tsx) so only editors see **New investigation**, and its dialog requires both a claim and a researcher owner.
- Update request types in [`frontend/src/api/editorial/types.ts`](frontend/src/api/editorial/types.ts), staff filtering, and English/Tibetan locale strings for the required researcher field and handoff wording.

### 4. Cover Phase 1 with regression tests
- Backend policy/API tests: researchers can list and view Inbox submissions but every triage action and both investigation-creation endpoints fail closed; editors can create only with a valid researcher; the selected researcher becomes owner and can immediately view/edit the investigation; another researcher receives 404; editor global access remains intact.
- Update the relevant suites in [`backend/tests/test_policy.py`](backend/tests/test_policy.py), [`backend/tests/test_intake.py`](backend/tests/test_intake.py), [`backend/tests/test_investigations.py`](backend/tests/test_investigations.py), and [`backend/tests/test_ui_hidden_controls.py`](backend/tests/test_ui_hidden_controls.py).
- Frontend tests should verify read-only researcher Inbox behavior, editor-only creation controls, mandatory researcher selection, and both request payloads. Extend [`frontend/e2e/editorial.spec.ts`](frontend/e2e/editorial.spec.ts) to cover editor opens/assigns, assigned researcher works, and researcher cannot triage or create directly.

## Phase 2: Domain-expert approval and editor publication

### 1. Store one selected approver per ready revision
- Add a nullable foreign key for the selected approver to the `Review` model in [`backend/app/models/publication.py`](backend/app/models/publication.py) and create an Alembic migration. Populate it on the active `mark_ready` review so the designation is revision-specific and is invalidated with that review when the draft changes.
- Add a one-time administrative backfill command that accepts an explicit revision-to-approver mapping for existing `ready_for_approval` or `approved` revisions. It must validate active approver roles and separation rules, preserve the existing marking editor, support dry-run/reporting, and leave no in-flight legacy revision without a selected approver before the new authorization is enabled.
- Add a required `approver_id` body for **Mark ready** in [`backend/app/schemas/factchecks.py`](backend/app/schemas/factchecks.py) and [`backend/app/api/routes/factchecks.py`](backend/app/api/routes/factchecks.py).
- In [`backend/app/services/reviews.py`](backend/app/services/reviews.py), validate that the selected account is active, has the `approver` role, is not an author of the current cycle, and is not the editor marking the revision ready. Store the selection and include it in the audit event.

### 2. Restrict approval and queues to the selected domain expert
- Add an object-level guard in [`backend/app/workflow/guards.py`](backend/app/workflow/guards.py) so only the approver selected on the active mark-ready review can approve that exact revision; retain the existing author and separation-of-duty checks.
- Filter `list_approval_queue()` and approver fact-check visibility in [`backend/app/services/reviews.py`](backend/app/services/reviews.py) and [`backend/app/core/policy.py`](backend/app/core/policy.py) so other approvers cannot discover or approve the item merely because it is ready.
- Expose the selected approver and marking editor in the internal fact-check responses needed for permission hints and handoff labels.

### 3. Return approved work to the marking editor
- Change `PUBLISH` policy in [`backend/app/core/policy.py`](backend/app/core/policy.py) from approver to editor, then replace the current “approving reviewer publishes” guard in [`backend/app/services/publication.py`](backend/app/services/publication.py) with “the editor who marked this revision ready publishes.” Apply the same rule to publication preview and keep `published_by_id` as the actual publishing editor.
- Change `WITHDRAW` and `CORRECTION_START` policy to any editor with access. Approvers lose publish, withdrawal, and correction controls and retain only domain review actions such as approve or request changes.
- Add an editor-facing **Ready to publish** list/filter for approved languages whose active mark-ready review belongs to the current editor, while the designated approver’s queue ends after approval.

### 4. Update the Phase 2 interface
- In [`frontend/src/editorial/factcheck/ReviewPanel.tsx`](frontend/src/editorial/factcheck/ReviewPanel.tsx), require the editor to select exactly one active approver before confirming **Mark ready** and send `approver_id`.
- Split role hints in [`frontend/src/editorial/roles.ts`](frontend/src/editorial/roles.ts): approvers can approve; editors can publish; any editor can start corrections or withdraw.
- Update [`frontend/src/editorial/factcheck/PublishPanel.tsx`](frontend/src/editorial/factcheck/PublishPanel.tsx), [`frontend/src/editorial/NextActions.tsx`](frontend/src/editorial/NextActions.tsx), API types/queries, error mappings, and locale strings so the selected approver sees approval controls, the marking editor sees publication controls after approval, and approvers never see publish/withdraw/correction actions.

### 5. Cover Phase 2 with regression tests
- Backend tests must prove: mark-ready rejects a missing or invalid approver; only the selected approver sees and approves the revision; a different approver fails closed; the marking editor alone can preview/publish; any editor can withdraw or start a correction; approvers cannot publish, withdraw, or start corrections.
- Test the backfill command in dry-run and apply modes, including invalid mappings, independence violations, and an assertion that every in-flight revision has a selected approver before rollout.
- Update [`backend/tests/test_reviews.py`](backend/tests/test_reviews.py), [`backend/tests/security/test_phase3_gate.py`](backend/tests/security/test_phase3_gate.py), [`backend/tests/test_ui_hidden_controls.py`](backend/tests/test_ui_hidden_controls.py), public API tests, and E2E seed data.
- Update frontend publishing/review tests and [`frontend/e2e/editorial.spec.ts`](frontend/e2e/editorial.spec.ts) for the complete researcher → editor → selected approver → same editor publish flow.

## Documentation and final verification
- Rewrite [`docs/workflow-testing.md`](docs/workflow-testing.md): the editor opens and assigns the investigation; the researcher drafts; the editor marks the exact revision ready and selects one approver; only that approver approves; the same marking editor publishes; any editor may later correct or withdraw.
- Synchronize [`docs/access-policy.md`](docs/access-policy.md), [`docs/editorial-policy.md`](docs/editorial-policy.md), and [`docs/design-document.md`](docs/design-document.md) with both phases, including the revised role matrix, state diagram, independence rules, negative checks, and scorecard.
- Run the migration checks, targeted backend/frontend/E2E suites, then the full repository test commands; check linters on every changed file.