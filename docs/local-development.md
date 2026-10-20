# Local development

This is the clean-checkout path for PostgreSQL, the API, and the frontend.

## Prerequisites

- Docker with Compose v2
- Python 3.13 and [uv](https://docs.astral.sh/uv/) 0.11.28
- Node.js 22

The repository pins Python in `.python-version` and Node in `.nvmrc`.

## Environment

From the repository root:

```sh
cp .env.example .env
```

`.env` is gitignored. Compose reads it for variable substitution and also has the same defaults, so `make start` works before the copy. Host-side `make migrate` and `make bootstrap-admin` need `DATABASE_URL`, which the copied file provides.

| Variable | Local value | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | Relaxes production-only checks. |
| `LOG_LEVEL` | `info` | Python log level. |
| `DATABASE_URL` | `postgresql://tvn:tvn_local_dev@localhost:5432/tvn` | Host-side API, Alembic, and bootstrap. |
| `POSTGRES_USER` | `tvn` | Database role created by Compose. |
| `POSTGRES_PASSWORD` | `tvn_local_dev` | Local placeholder. Production must not use it. |
| `POSTGRES_DB` | `tvn` | Application database name. |
| `CORS_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | Browsers allowed to call the API with cookies. |
| `VITE_API_BASE_URL` | `http://localhost:8000` | API origin baked into the frontend dev server. No credentials in this URL. |
| `READINESS_TIMEOUT_SECONDS` | `2` | Budget for the readiness query. |
| `SESSION_TTL_HOURS` | `168` | Session lifetime. |
| `INVITE_TTL_HOURS` | `168` | Invite lifetime. |
| `PASSWORD_MIN_LENGTH` | `12` | Enforced by the API. The staff forms use the same minimum. |
| `STORAGE_ENDPOINT_URL` | `http://127.0.0.1:9000` | MinIO API when using Compose. Host-side API uses loopback; the API container uses `http://minio:9000`. |
| `STORAGE_BUCKET` | `tvn-archive` | Private archive bucket (created by `minio-init` in Compose). |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | `minioadmin` | Local MinIO credentials only. |
| `ARCHIVE_MAX_UPLOAD_BYTES` | `26214400` (25 MiB) | Enforced on investigation document uploads. |
| `ARCHIVE_SIGNED_URL_TTL_SECONDS` | `120` | Presigned download link lifetime. |

`SESSION_COOKIE_NAME` defaults to `tvn_session` and does not need to be set locally.

Compose starts **MinIO** on http://127.0.0.1:9000 (API) and http://127.0.0.1:9001 (console). The `minio-init` job creates the `tvn-archive` bucket before the API starts.

Set `TVN_ENV_FILE=` (empty) when a process must ignore `.env` and use only the variables you exported. Tests do this.

## Install and start

```sh
make install
make start
```

`make install` runs `uv sync --frozen --all-groups` in `backend/` and `npm ci` in `frontend/`.

`make start` runs `docker compose up --build --detach --wait --wait-timeout 180`. Compose starts PostgreSQL, waits until `pg_isready` succeeds, starts the API, waits until `/ready` succeeds, then starts the frontend.

| Service | URL |
| --- | --- |
| Frontend | http://127.0.0.1:5173 |
| API liveness | http://127.0.0.1:8000/health |
| API readiness | http://127.0.0.1:8000/ready |
| PostgreSQL | `127.0.0.1:5432` |

`/health` does not touch the database. `/ready` runs `SELECT 1`.

```sh
make smoke
make logs
make stop
```

`make stop` runs `docker compose down` and keeps the volume `tvn-postgres-data`. To drop the local database:

```sh
docker compose down -v
```

## Migrations

After PostgreSQL is accepting connections:

```sh
make migrate
```

That runs `uv run alembic upgrade head` from `backend/` against `DATABASE_URL`. The migration creates the core schema, including the four staff roles. The API does not create tables at startup.

The relationship graph is in [data-model.md](data-model.md).

## First administrator

```sh
export TVN_BOOTSTRAP_EMAIL=admin@example.org
make bootstrap-admin
```

The command prompts for the password and then asks you to type it again. Continue with [bootstrap-admin.md](bootstrap-admin.md).

## Run the API on the host

Use this when you want a reloadable API process while Compose runs only PostgreSQL:

```sh
docker compose up postgres --detach --wait
make migrate
cd backend && uv run tvn-api
```

The host API listens on `127.0.0.1:8000` unless `API_HOST` and `API_PORT` are set. Stop the Compose `api` service first so the port is free:

```sh
docker compose stop api
```

The frontend dev server reads `VITE_API_BASE_URL` when its container or `npm run dev` starts. Change that variable and restart the frontend if the API origin changes.

## What the UI includes

- `/` redirects to `/en` or `/bo` using the stored language, then the browser language, then English. Unprefixed public paths such as `/fact-checks` redirect the same way.
- Public pages under `/:locale` (`bo` or `en`): home, `fact-checks` (search), `fact-checks/:slug`, `fact-checks/:slug/versions/:n`, `topics`, `topics/:slug`, `about`, and `submit`.
- `/login`, `/activate`, and `/editorial` (inbox, investigation, draft, and archive placeholders) are staff routes and are not prefixed.

`/register` renders the not-found page. The Tibetan interface copy and the About page text are provisional until editors review them.

Set `VITE_TURNSTILE_SITE_KEY` to show the Cloudflare Turnstile widget on the submit form. Leave it empty locally. The API ignores the token until `SUBMISSION_CAPTCHA_ENABLED` is on and a verifier is configured.

## Pages Functions and headers

`frontend/functions/` holds Cloudflare Pages Functions that run only on Cloudflare, not in the Vite dev server:

- `_middleware.ts` rewrites the HTML shell of public pages with `lang`, title, description, canonical, hreflang, and Open Graph tags. Withdrawn articles and old versions are `noindex`. Unknown articles get HTTP 404.
- `sitemap.xml.ts` and `robots.txt.ts` (which disallows `/editorial`).

They read `API_BASE_URL` and `SITE_ORIGIN` from `frontend/wrangler.toml`. The hostnames there and the `connect-src` host in `frontend/public/_headers` are placeholders until deployment (sub-phase 4.4). `npm run build` followed by `node scripts/verify-dist.mjs` checks the headers file and that the built page has no inline script.

## End-to-end tests

Playwright tests in `frontend/e2e/` run against a running stack that has been seeded with public fact-checks:

```sh
make start
make migrate
cd backend && uv run python scripts/seed_e2e.py   # idempotent
cd ../frontend && npx playwright install chromium
npm run e2e
```

`seed_e2e.py` creates three staff users and three fact-checks (`e2e-river` in both languages, `e2e-pending` English only with a pending Tibetan translation, and `e2e-withdrawn`) by calling the real editorial workflow in-process. Do not run it against a database with real content. To use a throwaway database and different ports, point `DATABASE_URL` at it for `alembic` and the seed script, start the API with `API_PORT`, start Vite with `VITE_API_BASE_URL`, and set `E2E_BASE_URL`.
