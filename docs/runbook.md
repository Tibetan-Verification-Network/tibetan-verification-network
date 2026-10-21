# Operations runbook

Procedures are provider-neutral. Adapt host names and console steps to your deployment.

## Deploy

1. Merge changes through CI (lint, tests, Playwright on Compose).
2. Run database migrations: `alembic upgrade head` against the target database (direct connection).
3. Deploy the API container or process; confirm `GET /ready` returns 200.
4. Deploy the static frontend build; confirm locale home pages load and `connect-src` allows the API.
5. Smoke-test: public search, one article in each locale, staff login, submission form.

## Rollback

1. Roll back the API to the previous image or release.
2. If the release included a **backward-compatible** migration, leave the schema as-is.
3. If the migration was **not** backward-compatible, restore the database from backup (see Restore) or run the documented down migration only when safe.
4. Roll back the frontend to the previous static assets.

## Migration failure

1. Stop new API instances from taking traffic.
2. Inspect Alembic logs and PostgreSQL errors.
3. Fix forward with a corrective migration; avoid editing applied revision files.
4. Re-run `alembic upgrade head` on staging before production.

## Backups

- Enable point-in-time recovery or automated backups on the managed Postgres service.
- Optionally schedule an encrypted logical dump (`pg_dump`) to object storage with credentials separate from the archive bucket.
- Document the maximum acceptable data-loss window (RPO) and recovery time (RTO).

## Restore drill (staging)

Run periodically on a **non-production** database:

```sh
cd backend
uv run python scripts/restore_drill.py
```

The script verifies every `ArticleVersion` checksum, rebuilds the public index, and compares row counts. Record elapsed time and any mismatch.

## Secret rotation

| Secret | Action |
| --- | --- |
| Staff sessions | Rotate `SESSION` invalidation by disabling accounts or waiting for TTL; no global pepper |
| `SUBMISSION_SUBMITTER_HMAC_KEY` | Rotate in env; existing rate-limit buckets reset |
| Storage keys | Issue new keys in the object store, update env, revoke old keys |
| Turnstile | Rotate site/secret keys in Cloudflare; update frontend and API env |

## Incident response

1. Triage severity (public leak, auth bypass, data loss, availability).
2. For a **public data leak**, withdraw affected fact-checks through the editorial UI and capture audit entries.
3. For **availability**, check `/ready`, database connectivity, and object storage.
4. Post-mortem: timeline, root cause, and follow-up issues.

## Takedown / withdrawal

Approvers use **Withdraw** on the published language. The URL stays live with the withdrawal notice; lists, search, topics, and sitemap exclude the article. Internal reasons stay in editorial fields only.
