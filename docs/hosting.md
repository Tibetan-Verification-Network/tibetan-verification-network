# Hosting (provider-agnostic)

Deployment targets are **not fixed** in this repository. Wire your chosen providers through environment variables and the existing Docker images. The checklist below is what any production layout must satisfy, regardless of vendor.

## Components

| Piece | Role | Repository artifact |
| --- | --- | --- |
| Static frontend | Locale-prefixed SPA, optional edge HTML rewriting | `frontend/` production build (`npm run build`) |
| API | FastAPI, sessions, editorial and public routes | `backend/Dockerfile` |
| PostgreSQL | Primary data store | Migrations in `backend/alembic/` |
| Object storage | Private archive bucket (S3-compatible API) | `STORAGE_*` settings |

## Environment contract

**Site origin.** Set `CORS_ORIGINS` to the exact HTTPS origin(s) of the frontend (no wildcards). The session cookie uses `SameSite=Lax`; the site and API should live on one registrable domain (for example `example.org` and `api.example.org`) so the cookie stays first-party.

**API hardening (production).**

- `ENVIRONMENT=production`
- `SESSION_COOKIE_SECURE=true` (default in production)
- `TRUSTED_HOSTS` — comma-separated `Host` values the API accepts
- `TRUST_FORWARDED_FOR=true` and `PROXY_HEADERS=true` only when the API sits behind a trusted reverse proxy (for submission rate limits)
- `SUBMISSION_CAPTCHA_ENABLED=true` and `TURNSTILE_SECRET_KEY` when Turnstile is on
- `SENTRY_DSN` optional; install `sentry-sdk[fastapi]` in the API image if used

**Frontend build.** Set `VITE_API_BASE_URL` to the public API origin. If you use Cloudflare Pages Functions for meta tags, set `API_BASE_URL` and `SITE_ORIGIN` in the Pages project (see `frontend/wrangler.toml` as a template). Update `connect-src` in `frontend/public/_headers` to match the API host.

**Database.** Run `alembic upgrade head` before serving new API versions. Use a direct connection for migrations and a pooled connection for the app if your host provides both.

**Health checks.** Liveness: `GET /health`. Readiness (DB): `GET /ready`.

## Staging and production

Use separate databases, object-storage buckets, and secrets for staging and production. CI in `.github/workflows/ci.yml` validates the stack in Compose; add your own deploy workflow when the provider is chosen.

## Budget

Re-check provider pricing when you pick a host. The product target remains roughly US$10–30/month for early traffic; exact numbers depend on the vendors you select.

## Vercel (services)

`vercel.json` at the repository root deploys both apps as one Vercel project on one domain:

| Service                             | Root        | Public path                                                      |
| ----------------------------------- | ----------- | ---------------------------------------------------------------- |
| `backend` (FastAPI, `app.main:app`) | `backend/`  | `/api/*` (the service sees the full `/api/v1/...` path)          |
| `frontend` (Vite SPA)               | `frontend/` | everything else, with an `index.html` fallback for client routes |

- The SPA calls the API on its own origin. During a Vercel build `VITE_API_BASE_URL` defaults to `/` (same origin), so it does not need to be set.
- Security headers from `frontend/public/_headers` are repeated in `vercel.json`, because Vercel does not read `_headers`. `connect-src` is `'self'`.
- Set `CORS_ORIGINS` on the project to the site's HTTPS origin (for example `https://tvn.example.org`). Staff mutations check `Origin` against it.
- Set `DATABASE_URL`, `STORAGE_*`, `SUBMISSION_SUBMITTER_HMAC_KEY` and `ENVIRONMENT=production` as project environment variables. Run `alembic upgrade head` against the database before you deploy.
- `/health` and `/ready` are not under `/api`, so they are not public on Vercel.
- The Cloudflare Pages Functions in `frontend/functions/` (per-page meta tags, `robots.txt`, `sitemap.xml`) do not run on Vercel.
- Test locally with `vercel dev`.
