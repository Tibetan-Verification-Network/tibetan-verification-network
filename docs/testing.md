# Testing

`make test` runs the backend suite and the frontend suite, then builds the frontend and checks the production files.

`make lint` runs Ruff, mypy, ESLint, `tsc`, and Prettier. `make check` runs lint and test.

PostgreSQL must be reachable at `DATABASE_URL` (default `postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn`). Start it with `docker compose up postgres --detach --wait` or `make start`.

## Backend

```sh
cd backend && uv run pytest
```

Tests that need PostgreSQL create a disposable `tvn_test` database from `DATABASE_URL`. Override that target with `TVN_TEST_DATABASE_URL`. Set `TVN_ENV_FILE=` so a developer `.env` is not loaded. `backend/tests/conftest.py` does this.

Migration tests use a separate `tvn_test_migrate_test` database: they downgrade to empty and upgrade to head.

The Phase 1 smoke test is `backend/tests/test_phase1_smoke.py`. It drops and creates `tvn_phase1_smoke`, checks that the public schema has no tables, upgrades to head, bootstraps an administrator through the CLI, creates and accepts an invite, signs in, calls `/api/v1/me` and `/api/v1/editorial/status`, logs out, and checks that the same session cookie is then rejected. Run it on its own with:

```sh
cd backend && TVN_ENV_FILE= uv run pytest tests/test_phase1_smoke.py
```

If PostgreSQL is not accepting connections, database tests skip. The configuration and HTTP tests still run.

## Frontend

```sh
cd frontend && npm test
cd frontend && npm run lint && npm run typecheck && npm run format:check
cd frontend && npm run build && node scripts/verify-dist.mjs
```

Vitest and Testing Library cover:

- English and Tibetan switching, persistence in `localStorage` under `tvn.locale`, and `document.documentElement.lang`
- Tibetan sample copy and a blank-string fallback to English
- Keyboard use of the skip link, language switcher, and narrow-viewport menu
- Login and activation labels, errors, success, and the not-found page for `/register`
- Protected `/editorial` routes, logout, and the `X-CSRF-Token` header on mutations
- axe-core checks for the home, login, activation, editorial, and configuration screens
- Every editorial screen (inbox, investigations, fact-checks, language page in each status and role, approvals, archive, topics, staff accounts), driven by a stateful in-memory fake of the staff API in `src/test/editorialApi.ts`
- Role-aware navigation, role-gated routes, and that a control hidden for a role still gets the API's 403/404 (the backend side is `backend/tests/test_ui_hidden_controls.py`)
- `ConfirmDialog` focus trap, typed confirmation and Escape, and the 404/409/422 mapping in `EditorialError`
- The API client's single retry after a stale CSRF token (a second tab rotates the session's token)

### End-to-end (Playwright)

`frontend/e2e/` runs against a migrated and seeded Compose stack (`backend/scripts/seed_e2e.py`). `public.spec.ts` covers the public site. `keyboard.spec.ts` and `security.spec.ts` cover keyboard-only flows and public/private separation. `editorial.spec.ts` takes a public claim through triage, evidence, drafting in both languages with an edit conflict, review, approval, publication, a correction and a withdrawal using the three seeded staff. Each run uses its own claim and slug, so it can be repeated. CI job *End-to-end and accessibility* installs Chromium and WebKit.

```sh
cd frontend && npx playwright install chromium
cd frontend && E2E_BASE_URL=http://localhost:5173 npm run e2e
```

Use the same host for the site and the API (`localhost` with the default Compose settings). Cookies and the CORS allow-list differ between `localhost` and `127.0.0.1`, and CI uses `127.0.0.1` for both.

`npm run build` is `tsc --noEmit` plus `vite build`. `scripts/verify-dist.mjs` fails the build if the old product name, a database URL, or a Google Fonts host appears, or if the self-hosted Tibetan font file is missing.

Session cookies and CSRF tokens are not written to `localStorage` or `sessionStorage`. The locale key is the only browser storage the UI uses.

## Continuous integration

`.github/workflows/ci.yml` runs four independent jobs on Ubuntu with read-only `contents` permission. A newer push to the same ref cancels the older run.

| Job | What it runs |
| --- | --- |
| `backend-lint` | Ruff and mypy, using uv 0.11.28 and Python 3.13 |
| `backend-test` | PostgreSQL 17, `alembic upgrade head` on an empty database, then pytest |
| `frontend-check` | ESLint, `tsc`, Prettier, and Vitest (including axe) on Node 22 |
| `frontend-build` | Production build and `scripts/verify-dist.mjs` |

The backend test job uses the same local database password as `.env.example`. That value is a placeholder for the throwaway service container, not a production secret.
