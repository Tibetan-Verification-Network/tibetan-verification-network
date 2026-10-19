---
name: phase-one-four-stage
overview: "Expand the existing Phase 1 foundation work into four sequential, acceptance-gated stages: reproducible scaffolding, core schema, secure staff identity, and the bilingual/authenticated application shell with complete CI. The plan uses async SQLAlchemy, PostgreSQL-backed opaque sessions, and GitHub Actions as selected."
todos:
  - id: phase-1a-scaffold
    content: "Stage 1A: Create the reproducible monorepo, local PostgreSQL runtime, FastAPI/React skeletons, baseline quality tooling, and health/readiness tests."
    status: completed
  - id: phase-1b-schema
    content: "Stage 1B: Implement async SQLAlchemy/Alembic and the privacy-aware core relational model with migration and constraint tests."
    status: completed
  - id: phase-1c-identity
    content: "Stage 1C: Implement invite-only staff activation, PostgreSQL sessions, CSRF, roles, revocation, bootstrap administration, audit events, and security tests."
    status: completed
  - id: phase-1d-shell-ci
    content: "Stage 1D: Build the accessible Tibetan/English shell and staff auth UI, finish documentation, and enforce the complete Phase 1 gate in GitHub Actions."
    status: completed
isProject: false
---

# Tibetan Verification Network — Phase 1 Four-Stage Plan

## Scope and fixed decisions
- Treat [the five-phase plan](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/.cursor/plans/five-phase-tvn-plan_ec4890e6.plan.md) as the governing scope and [the PRD](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/docs/Tibetan_FactCheck_PRD_and_Design.md) as the requirements source.
- Use React + TypeScript + Vite in `frontend/`; FastAPI + async SQLAlchemy 2.x + Alembic + PostgreSQL in `backend/`; `uv`/`pyproject.toml` for Python and npm for frontend dependencies.
- Use random opaque session IDs stored as hashes in PostgreSQL. Send the raw ID only in a secure HttpOnly cookie; do not store auth tokens in browser storage.
- Use GitHub Actions for CI. Keep deployment providers and object storage behind environment configuration for later phases.
- Use UUID primary keys, UTC timestamps, explicit enums/check constraints, separate ORM and Pydantic models, and additive Alembic migrations.
- Use BCP 47 locale `bo` for Tibetan and `en` for English. Keep terminology in locale files so the editorial team can revise it without changing components.
- Defer submissions APIs, editorial CRUD, object-level policy enforcement, publication workflows, file storage, and AI behavior to Phases 2–5. Phase 1 creates only their schema foundations.

## Stage 1A — Reproducible monorepo and service skeletons
**Objective:** A clean checkout can start PostgreSQL, the API, and the frontend and can run baseline checks consistently.

- Create root operational files: [`README.md`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/README.md), [`.gitignore`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/.gitignore), [`.env.example`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/.env.example), [`compose.yaml`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/compose.yaml), and a small [`Makefile`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/Makefile) or equivalent task scripts for install, start, lint, test, and migrate.
- Scaffold [`backend/pyproject.toml`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/pyproject.toml) and an application factory in [`backend/app/main.py`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/app/main.py). Add typed environment settings, environment validation, `/api/v1` routing, structured JSON logging with redaction, request IDs, controlled CORS, and separate `/health` liveness and `/ready` readiness endpoints.
- Scaffold [`frontend/package.json`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/frontend/package.json), Vite, strict TypeScript, ESLint/Prettier, React Router, Vitest, and Testing Library. Add a minimal branded app that reads only a configured API base URL and reports API readiness without exposing configuration secrets.
- Configure local Compose services for PostgreSQL, API, and frontend with health checks, named database storage, deterministic ports, and startup ordering. Commit examples only; keep real credentials out of source control and logs.
- Add baseline backend and frontend tests for configuration failure, liveness/readiness behavior, app rendering, and production builds.

**Exit gate:** From a clean checkout, documented commands install dependencies and start all three services; `/health` is process-only, `/ready` verifies database connectivity, frontend and backend lint/type checks pass, tests pass, and no secrets are committed.

## Stage 1B — Core relational model and migration safety
**Objective:** Establish the complete Phase 1 data foundation without exposing private/editorial CRUD endpoints.

- Add the async engine and request-scoped session factory under [`backend/app/db/`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/app/db), with transaction helpers, test database isolation, connection cleanup, and PostgreSQL-aware health checks.
- Configure Alembic in [`backend/alembic/`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/alembic) and create an explicit reviewed initial migration; do not rely on runtime table creation.
- Model the PRD domain in [`backend/app/models/`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/app/models):
  - Identity primitives: `User`, normalized roles through `Role`/`UserRole`, `StaffInvite`, and `AuthSession`.
  - Intake/research: `Submission`, separately protected submitter contact data, `Claim`, `Investigation`, `Source`, and `EvidenceItem`.
  - Editorial/publication: `FactCheck`, language-specific `FactCheckContent`, `Review`, and immutable-ready `ArticleVersion` metadata.
  - Archive/permissions: `ArchiveDocument` metadata and `AccessGrant`, with new documents defaulting to internal visibility; no object storage access yet.
  - Future AI/audit: `ResearchRun` and append-oriented `AuditEvent`; no AI execution yet.
- Add ownership, creator/updater, lifecycle, visibility, language, status, and created/updated timestamps where applicable. Keep workflow status distinct from public verdict and model Tibetan/English states independently. Add structural foreign keys, uniqueness, safe deletion behavior, and indexes, but defer Phase 3 transition rules and verdict policy.
- Keep request/response types under [`backend/app/schemas/`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/app/schemas); never serialize ORM rows directly. Do not add public or editorial domain routes in this stage.
- Document the relationship graph and privacy boundaries in [`docs/data-model.md`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/docs/data-model.md), including why administrator role does not imply restricted-document access.
- Test migration upgrade from an empty database, schema constraint/index presence, representative relationship inserts, rollback on failed transactions, role uniqueness, independent language rows, contact-data separation, and internal archive visibility defaults.

**Exit gate:** `alembic upgrade head` succeeds against a fresh PostgreSQL database locally and in a disposable test database; all planned tables and constraints exist; migration/model tests pass; and no endpoint can list or retrieve editorial records.

## Stage 1C — Invite-only staff identity and backend protection
**Objective:** Staff can be securely provisioned and authenticated, sessions can be revoked, and protected routes fail closed.

- Implement password hashing with Argon2id, cryptographically random invite/session tokens, constant-time digest comparison, generic login failures, expiry, revocation, and disabled-account checks in [`backend/app/core/security.py`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/app/core/security.py) and focused services under [`backend/app/services/`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/app/services).
- Implement the operational lifecycle:
  1. A one-time CLI bootstraps the first platform administrator without an HTTP signup route.
  2. An authorized administrator creates a time-limited, single-use staff invite and assigns one or more roles.
  3. The activation route accepts the raw invite token once, stores the password hash, and enables the account.
  4. Login creates a PostgreSQL session and sets a `Secure`-in-production, HttpOnly, SameSite cookie.
  5. Logout revokes the current session; disabling a user revokes all active sessions.
- Add CSRF protection for all cookie-authenticated state changes using a session-bound token and required custom header, plus strict Origin validation for production origins. Document the SPA contract before frontend integration.
- Add versioned routes for CSRF initialization, invite activation, login, logout, current user (`GET /api/v1/me`), and narrowly scoped administrator invite/user-management operations. There must be no `/register` or public account creation route.
- Add reusable authentication and role dependencies in [`backend/app/core/permissions.py`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/backend/app/core/permissions.py). Prove protection with a minimal authenticated editorial status route; leave record-level policies for Phase 2.
- Append minimal audit events for bootstrap, invite creation/acceptance, role changes, login/logout, failed activation, session revocation, and account disablement without recording passwords, raw tokens, cookies, or unnecessary personal data.
- Add focused tests for invite expiry/reuse, duplicate email normalization, password behavior, valid login, anonymous rejection, missing/invalid CSRF, logout revocation, account disablement, role checks, cookie flags, audit redaction, bootstrap idempotency, and absence of public signup.

**Exit gate:** An operator can bootstrap an admin, issue an invite, activate staff, authenticate, call `/me` and a protected route, then revoke access through logout or disablement. Every negative-path test returns the intended 401/403 without leaking account state, and no public signup path exists.

## Stage 1D — Bilingual shell, auth integration, documentation, and CI gate
**Objective:** Deliver the usable Tibetan/English shell and make the entire Phase 1 contract continuously verifiable.

- Build the i18n layer in [`frontend/src/i18n/`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/frontend/src/i18n) with `en` and `bo` message catalogs, language detection/persistence, document `lang` updates, fallback behavior, and a keyboard-accessible language switcher. Display the product name as “Tibetan Verification Network”; do not retain “Tibetan FactCheck” in product metadata or UI copy.
- Create responsive public and editorial layouts with navigation placeholders only. Add reusable accessible buttons, links, fields, alerts, loading states, error summaries, skip links, visible focus styles, and a self-hosted Tibetan-capable font stack with robust fallbacks.
- Add staff login, invite activation, logout, and protected editorial-shell routes. Centralize API calls with `credentials: include`, CSRF header injection for mutations, typed error mapping, and a `/me` session bootstrap. Keep session tokens out of application state, local storage, and URLs.
- Add frontend tests for English/Tibetan switching and persistence, Tibetan sample rendering, keyboard navigation, labels/errors, login and activation states, protected-route behavior, CSRF request wiring, logout, responsive shell smoke behavior, and automated accessibility checks on critical pages.
- Complete [`README.md`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/README.md), [`docs/local-development.md`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/docs/local-development.md), [`docs/testing.md`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/docs/testing.md), [`docs/authentication.md`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/docs/authentication.md), and [`docs/bootstrap-admin.md`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/docs/bootstrap-admin.md) with exact setup, environment, migration, test, CSRF/session, invite, secret-rotation, and bootstrap procedures.
- Create [`.github/workflows/ci.yml`](/Users/ngawanglhamo/Desktop/workspace/Tibetan-Verification-Network/.github/workflows/ci.yml) with independent jobs for backend lint/type checks, PostgreSQL-backed migration and pytest checks, frontend lint/type/unit/accessibility checks, and production build. Pin runtime versions, cache dependencies, use service health checks, grant minimal workflow permissions, and cancel superseded runs.
- Add a final smoke script or integration test for: empty database → migrate → bootstrap admin → create/accept invite → login → `/me` → protected route → logout → rejected reused session.

**Exit gate:** The full documented clean-checkout path works; migrations apply to an empty database; invited staff can use the UI and protected API while anonymous/revoked/disabled sessions are rejected; both locales render accessibly; GitHub Actions passes all jobs; and neither signup UI nor signup API exists.

## Phase 1 completion and handoff
- Tag or checkpoint the repository only after all four stage gates pass.
- Record unresolved editorial terminology, per-language approval policy, approver assignment, hosting/data residency, and archive policy as Phase 2/3 decision items; do not weaken the Phase 1 privacy or identity invariants while they remain open.
- Hand Phase 2 a stable versioned API shell, tested async database layer, complete core schema, authenticated staff context, role primitives, audit primitives, bilingual UI foundation, and green CI.