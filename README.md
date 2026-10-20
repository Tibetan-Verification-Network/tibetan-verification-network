# Tibetan Verification Network

Local foundation for the Tibetan Verification Network: PostgreSQL, a FastAPI service, and a Tibetan/English React application. Staff accounts are invite-only. There is no public registration.

Requirements are in [docs/Tibetan_FactCheck_PRD_and_Design.md](docs/Tibetan_FactCheck_PRD_and_Design.md). The product name in the application is Tibetan Verification Network.

## Prerequisites

- Docker with Compose v2
- Python 3.13 and [uv](https://docs.astral.sh/uv/) 0.11.28
- Node.js 22 (see `.nvmrc`)

## Start from a clean checkout

```sh
cp .env.example .env
make install
make start
make migrate
```

`make install` uses the committed lockfiles. `make start` builds and starts PostgreSQL, the API, and the frontend, then waits until they are healthy. Ports are fixed and published only on `127.0.0.1`:

| Service | URL |
| --- | --- |
| Frontend | http://127.0.0.1:5173 or http://localhost:5173 |
| API liveness | http://127.0.0.1:8000/health |
| API readiness | http://127.0.0.1:8000/ready |
| API metadata | http://127.0.0.1:8000/api/v1 |
| PostgreSQL | `127.0.0.1:5432` |

`/health` only checks that the API process can respond. `/ready` opens a short-lived PostgreSQL connection and runs `SELECT 1`.

Copying `.env.example` to `.env` gives host-side `uv` commands the same values Compose uses by default. Do not commit `.env`.

Then create the first administrator and invite staff. The exact commands are in [docs/bootstrap-admin.md](docs/bootstrap-admin.md). Staff activate at `/activate` and sign in at `/login`. Editorial pages under `/editorial` require a session.

```sh
make smoke
make logs
make stop
```

`make stop` keeps the named database volume `tvn-postgres-data`. Remove that volume with `docker compose down -v` when you want an empty database.

## Checks

```sh
make lint
make test
make check
```

`make test` runs the API tests, including the Phase 1 smoke test, the frontend unit and accessibility tests, and the production frontend build. The build check rejects the old product name, remote font hosts, and connection strings in the generated files.

Public pages are locale-prefixed (`/en/...`, `/bo/...`). Routes, Pages Functions, and the Playwright suite (`npm run e2e` in `frontend/`, run against a seeded stack) are described in [docs/local-development.md](docs/local-development.md).

GitHub Actions runs the same checks in independent jobs. See [docs/testing.md](docs/testing.md).

## Documentation

- [Local development](docs/local-development.md) — environment, services, and migrations
- [Testing](docs/testing.md) — pytest, Vitest, accessibility, and CI
- [Authentication](docs/authentication.md) — sessions, CSRF, invites, and secret rotation
- [Bootstrap administrator](docs/bootstrap-admin.md) — the one-time administrator command
- [Data model](docs/data-model.md) — relationships and privacy boundaries
- [SPA authentication contract](docs/spa-auth-contract.md) — cookie and header rules

## Configuration

The API reads configuration from the process environment. `TVN_ENV_FILE` can point at a dotenv file; an empty value disables dotenv loading. Logs are JSON on stdout. Database URLs, bearer tokens, and fields whose names look like secrets are redacted. Request lines record the path, not the query string or headers.

Browser calls are accepted only from the origins in `CORS_ORIGINS`. Origins are explicit `http` or `https` URLs, and credentialed cross-origin requests are allowed for those origins only.

The API refuses to start when `ENVIRONMENT=production` and the database URL uses the local password `tvn_local_dev`, uses an `http` browser origin, or omits CORS origins.

## Open decisions for later phases

These stay open. They do not weaken the Phase 1 privacy or identity rules.

- Tibetan UI wording in `frontend/src/i18n/locales/bo.ts` is provisional. Editors can revise that file without changing components.
- Per-language approval policy, who may be assigned as approver, hosting, and data residency.
- Archive access policy beyond the Phase 1 default: new archive rows are internal, and the platform administrator role does not grant restricted-document access.
