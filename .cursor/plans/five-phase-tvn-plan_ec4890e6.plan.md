---
name: five-phase-tvn-plan
overview: Build the greenfield “Tibetan Verification Network” as five sequential, acceptance-gated sprints using React + TypeScript, FastAPI, PostgreSQL, SQLAlchemy, and Alembic. The controlled MVP launches only after Phase 5 includes private, human-reviewed AI assistance.
todos:
  - id: phase-1-foundation
    content: "Phase 1: Build the reproducible foundation, core schema, bilingual shell, invite-only staff authentication, and CI."
    status: completed
  - id: phase-2-editorial-safety
    content: "Phase 2: Implement submissions, triage, investigations, evidence provenance, private archive storage, and object-level permissions."
    status: completed
  - id: phase-3-publication-integrity
    content: "Phase 3: Implement workflow transitions, review, independent approval, immutable publication snapshots, audit, and corrections."
    status: pending
  - id: phase-4-public-experience
    content: "Phase 4: Build the bilingual public/editorial interfaces, search, accessibility tests, end-to-end coverage, and managed deployment."
    status: pending
  - id: phase-5-ai-launch
    content: "Phase 5: Add controlled provider-neutral AI research assistance, evaluation, cost/privacy controls, and complete launch hardening."
    status: pending
isProject: false
---

# Tibetan Verification Network — Five-Phase Implementation Plan

## Confirmed product decisions
- Use the requirements in [docs/Tibetan_FactCheck_PRD_and_Design.md](docs/Tibetan_FactCheck_PRD_and_Design.md), replacing the working name “Tibetan FactCheck” with “Tibetan Verification Network” in product copy, metadata, and configuration.
- Use React + TypeScript for `frontend/` and FastAPI + PostgreSQL + SQLAlchemy 2.x + Alembic for `backend/`.
- Staff accounts are invite-only/admin-created; there are no public reader accounts.
- Editors author structured article fields plus Markdown with sanitized preview/rendering.
- Tibetan and English versions have independent review and publication states; a published version may show its translation as pending.
- Use budget managed hosting for the frontend, API/database, and private object storage. Keep provider details behind configuration.
- Phase 5 is part of launch scope. AI uses a provider-neutral adapter with one configurable provider implemented first and can never approve or publish.

## Phase 1 — Foundation and identity
**Goal:** Create a reproducible, tested application skeleton and secure staff identity foundation.

- Establish a monorepo with `frontend/`, `backend/`, local Docker Compose, environment templates, formatting/linting, pytest/frontend tests, and CI.
- Create the React application shell, Tibetan/English locale framework, responsive navigation placeholders, Tibetan-capable font stack, and accessible base components.
- Create FastAPI configuration, versioned API router, database session management, health/readiness endpoints, structured safe logging, and Alembic.
- Model the core domain IDs and relationships: `User`, `Submission`, `Claim`, `Investigation`, `Source`, `EvidenceItem`, `FactCheck`, language-specific content, `Review`, `ArticleVersion`, `ArchiveDocument`, `ResearchRun`, and `AuditEvent`. Add timestamps, ownership, visibility, and lifecycle fields without exposing ORM models directly.
- Implement invite-only staff activation, password hashing, secure HttpOnly session cookies, logout/session revocation, role assignment, CSRF protection, and disabled-account handling. Seed the first administrator through a one-time operational command rather than a public route.
- Document local setup, migration, test, secret, and bootstrap-admin procedures.

**Exit gate:** A clean checkout starts reproducibly; migrations apply to an empty database; invited staff can authenticate; protected routes reject anonymous users; CI passes; no public signup exists.

## Phase 2 — Editorial intake, research, and access safety
**Goal:** Safely move a public submission into private evidence-based research.

- Implement a centralized permission policy for researcher, editor, approver, and platform administrator roles plus object-level assignment/access checks. Administrators do not automatically receive restricted-document access.
- Add public claim submission with claim text, optional context/source URL/contact details, privacy consent, strict request validation, request-size limits, rate limiting, abuse controls, and safe URL parsing. Keep contact data separate from public claim/article data.
- Build the editorial inbox and triage actions: reject, hold, mark duplicate, merge/link multiple submissions to a canonical claim, assign staff, or open an investigation. Preserve original wording and context.
- Build investigation workspaces for sources, retrieval metadata, evidence excerpts, support/contradict/context classification, reliability notes, internal notes, assignment, and status.
- Implement archive metadata with `PUBLIC_METADATA`, `PUBLIC_DOCUMENT`, `INTERNAL`, and `RESTRICTED`; default every new item to `INTERNAL`. Store files privately, validate type/size, authorize before issuing short-lived signed links, and audit restricted access.
- Keep remote URL fetching disabled until SSRF-safe retrieval is implemented; user-provided URLs are references only in this phase.
- Test permission matrices, guessed IDs, cross-investigation access, pagination-before-filtering failures, duplicate linking, contact-data isolation, and archive download denial.

**Exit gate:** A submission can become an assigned investigation with traceable sources/evidence, while unauthorized users and public endpoints cannot discover editorial records, personal data, or private files.

## Phase 3 — Review, approval, publication integrity, and corrections
**Goal:** Enforce the complete human editorial workflow and immutable publication history.

- Implement an explicit workflow state machine for `INBOX`, `TRIAGED`, `RESEARCHING`, `DRAFTING`, `IN_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `PUBLISHED`, `REJECTED`, and `ON_HOLD`; reject invalid transitions in the backend.
- Build language-specific structured drafts for title, claim, context, verdict proposal/explanation, Markdown analysis, limitations, source references, and translation status. Sanitize Markdown output and distinguish public copy from internal notes.
- Add review comments, change requests, readiness checks, and approval records. Enforce approver role, independent approval, no self-approval, and re-approval after material changes.
- Make publication transactional: verify required content/evidence/review state, create an immutable language-specific `ArticleVersion` snapshot, set publication metadata, and append an audit event atomically.
- Add corrections as a new immutable version plus public correction note; retain prior versions and prohibit silent overwrites.
- Define and document launch policies for verdict criteria, source standards, corrections/takedowns, attribution, required publication fields, and approver assignment. Encode enforceable rules in validation and tests.
- Test every allowed/forbidden transition, concurrent approval/publication attempts, author-role combinations, post-approval edits, snapshot immutability, and rollback on partial failure.

**Exit gate:** A different authorized person must approve each language version; publication always creates an immutable snapshot and audit trail; corrections preserve history; bypass and race-condition tests pass.

## Phase 4 — Public bilingual experience and managed deployment
**Goal:** Deliver a safe, accessible public product and production-ready operations.

- Create allow-listed public response schemas and endpoints for paginated published fact-checks, slug-based article detail, topics, verdict/language/date filters, translation links/status, source lists, and correction/version history.
- Implement PostgreSQL-backed bilingual search using normalized text plus trigram/substring indexing for Tibetan and English rather than assuming PostgreSQL language stemming supports Tibetan. Measure query plans with representative data.
- Build public Home, Fact-checks/Search, Article, Topics, About/Methodology, and Submit-a-claim pages under the “Tibetan Verification Network” brand. Add clear empty/error/loading states and per-language metadata.
- Build the editorial inbox, investigation, draft, review, approval, archive, and audit interfaces needed to exercise Phases 2–3; sensitive actions require confirmation and always depend on backend authorization.
- Complete keyboard navigation, focus/contrast, non-color verdict labels, form errors, responsive layouts, and Tibetan rendering/input tests on representative desktop and mobile devices.
- Add end-to-end tests for submission-to-publication, independent language publishing, pending translations, public/private field separation, inaccessible guessed IDs, and accessibility-critical flows.
- Deploy the static frontend, API/worker-ready service, managed PostgreSQL, and private object storage with HTTPS, restricted CORS, secrets management, migrations, error monitoring, backups, and a tested restore/runbook. Confirm current provider pricing against the target budget before selection.

**Exit gate:** Users can submit, search, filter, and read only published content in Tibetan or English; staff can complete the non-AI workflow through the UI; security/accessibility checks pass in staging; backup restoration is proven.

## Phase 5 — Controlled AI-assisted research and launch hardening
**Goal:** Add useful private AI assistance without weakening editorial accountability.

- Define an `AIProvider` interface and implement one provider through configuration; isolate provider/model selection from editorial services so another provider can be added without changing workflow logic.
- Add queued/retryable research jobs and `ResearchRun` records containing task type, provider/model, prompt-template version, source references, initiator, timestamps, status, output, token/usage/cost estimates, and failure details. Make retries idempotent.
- Implement only bounded internal tools: search-query suggestions, source summarization, relevant-passage extraction, counter-evidence/missing-context prompts, draft outlines, and language-editing suggestions.
- Require editors to select approved source material; label all generated output as AI-assisted; preserve links/excerpts for verification; require explicit human adoption into a draft. AI cannot set the final verdict, approve, publish, or write directly into an immutable version.
- Treat sources as untrusted prompt content, separate instructions from evidence, redact submitter/private data by default, exclude restricted documents unless policy explicitly permits them, apply time/token/budget limits, and log without storing secrets or unnecessary personal data.
- Create a bilingual evaluation set and score citation fidelity, unsupported claims, Tibetan/English usefulness, counter-evidence coverage, latency, and cost. Add feature flags and per-role/per-user usage limits.
- Run final threat modeling, permission/regression tests, dependency and secret scans, staging editorial rehearsal, operational monitoring checks, and launch checklist against all PRD acceptance criteria.

**Exit gate:** AI outputs remain private and traceable, factual claims can be checked against supplied sources, budgets and failure modes are controlled, all critical workflow/security tests pass, and the editorial team completes a full staged submission-to-AI-assisted-publication rehearsal.

## Implementation order and scope control
- Complete each phase’s exit gate before starting the next; create a tagged release or stable checkpoint after every gate.
- Keep RSS monitoring, public accounts/comments, public API, advanced analytics, automatic translations, and autonomous verdict/publication outside this five-phase launch scope.
- Track unresolved editorial/operational policy as blocking launch decisions, but do not weaken backend invariants while those policies are being finalized.