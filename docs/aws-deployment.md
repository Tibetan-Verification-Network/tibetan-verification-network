# AWS deployment (testing and small pilots)

This guide deploys the **whole application**—PostgreSQL, the FastAPI API, object storage (MinIO or Amazon S3), and the **production-built** React SPA—on **Amazon Web Services**. It is written for **experimentation**, **free-tier exploration**, and **small non-production pilots**. For provider-neutral requirements (CORS, cookies, env vars), see [hosting.md](hosting.md).

## What you are deploying

| Layer        | Repository pieces                                      | AWS patterns in this doc                                      |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------- |
| Database     | PostgreSQL 17 (see `compose.yaml`)                     | Postgres in Docker on EC2, **or** Amazon RDS PostgreSQL       |
| API          | `backend/Dockerfile` (`tvn-api`)                       | Docker on EC2 (same instance as DB for the **simplest** path) |
| Object store | S3-compatible (`STORAGE_*`; MinIO in Compose)          | **MinIO in Docker** on EC2, **or** **Amazon S3** + IAM user   |
| Frontend     | Vite app (`frontend/`); production is `npm run build` | Static files from `frontend/dist/` served by **nginx** on EC2 |

The **frontend `Dockerfile` in this repo runs the Vite dev server** (`npm run dev`). For AWS you **build static assets** and serve `dist/`, not that container. See [hosting.md](hosting.md).

## New AWS account and email

You can sign up with a **new Gmail address** dedicated to AWS testing. That keeps billing alerts and IAM identity separate from personal accounts.

1. Create the AWS account and **turn on MFA** on the root user (console login).
2. Prefer a **daily-use IAM administrator user** and avoid logging in as root except for account settings.

Do **not** commit secrets. The repo’s `.env.example` is for local development only; production-shaped settings must use strong, unique values.

## Free tier and billing (read before you launch anything)

**AWS “Free Tier” is not unlimited and not forever.** Limits change; always confirm in the console under **Billing → Free Tier** and the official [AWS Free Tier](https://aws.amazon.com/free/) page.

Typical patterns:

- **12-month introductory offers** (often for new accounts): e.g. monthly hours for **small EC2** and sometimes **small RDS**, plus caps on **EBS** storage and **data transfer**.
- **Always Free** slices: small amounts on some products; they **do not** replace “run Postgres + API 24/7 on two managed services” at zero cost indefinitely.

**Expect that anything over the free allowance is billed.** Set guardrails **on day one**:

1. **AWS Budgets** — e.g. a monthly budget of **$5** with an email alert at **80%** and **100%**.
2. **Billing alarms** (CloudWatch) — alert on estimated charges **> $1**.
3. **Cost Explorer** — review weekly while learning.
4. **Tag resources** (e.g. `Project=tvn-test`) so you can trace spend.

### Common causes of surprise bills

- **NAT Gateways** — hourly + data processing; **avoid** for simple EC2 tests (use a **public subnet + Elastic IP** only if you understand the tradeoff, or keep the box private and use **SSM Session Manager** without a public IPv4 if you do not need public HTTP).
- **RDS** running 24/7 on a **non–free-tier** class or **Multi-AZ**.
- **EBS** volumes larger than the free allowance or **orphaned volumes**.
- **Elastic IPs** not attached to a **running** instance (historically a common fee—verify current pricing).
- **S3** over the included storage/requests, or **egress** from heavy downloads.
- **Data transfer out** to the internet (serving a busy site or large assets).
- **Public IPv4** charges in some regions/accounts—check [current EC2 networking pricing](https://aws.amazon.com/ec2/pricing/on-demand/) for your region.

**Operational habit:** when you finish testing for the day, **stop** EC2 instances you do not need (RDS will still incur storage if you stop an instance depending on setup—check RDS behavior). For a throwaway lab, **terminate** unneeded instances and **delete** unattached volumes after snapshots if you do not need them.

---

## Recommended layouts

### Option A — Single EC2 + Docker Compose (best for “make it work like local” on a budget)

**Idea:** One **small** EC2 instance runs Docker; you use **`compose.yaml`**-style services with **small changes** (publish HTTP on the host, secrets via env file).

**Pros:** Closest to `make start`; one place to debug; one EC2 hour counter (plus EBS).  
**Cons:** You patch the OS, Docker, and backups; not highly available.

**Free tier:** Often **one** eligible **`t3.micro` / `t2.micro`** (verify eligibility in your region) for **750 hours/month** in many **12-month** introductory programs—roughly **one instance 24/7**. **Stay within EBS GiB** caps.

**Critical for cost control:**

- Use **one** small instance; do not add RDS, NAT, or extra instances until you understand billing.
- Restrict the **security group**: SSH (port 22) **only from your IP**; HTTP/HTTPS only as needed (prefer **your IP** for a private test, not `0.0.0.0/0`, unless you accept world-accessible risk).

**Compose adjustments on the server (conceptual):**

- Publish ports on **`0.0.0.0`** (not only `127.0.0.1`) for **api**, **frontend static server** (see below), and optionally **minio** if the API must reach it from another host (usually everything is on one machine, so **internal** Docker networking is enough).
- The stock `frontend` service runs **Vite dev**; for AWS, **omit** that service and instead:
  - On the host: `cd frontend && npm ci && npm run build` (with `VITE_API_BASE_URL` set to your **public API URL**), then serve **`dist/`** with **nginx** (recommended) or a minimal static server bound to port 80.
- Set **`CORS_ORIGINS`** to the **exact** browser origin of the site (scheme + host + port). For HTTPS later, use `https://…` only if you run `ENVIRONMENT=production` (see [Production-shaped settings](#production-shaped-settings-envIRONMENTproduction)).

For **first tests without TLS**, you can run `ENVIRONMENT=development` and **http** origins **only if** you **strictly** limit who can reach the instance (security group + strong passwords). **Do not** use development mode for public production traffic.

### Option B — EC2 (API + Docker MinIO) + RDS PostgreSQL (learn managed DB)

**Idea:** **RDS** hosts Postgres; EC2 runs API + nginx for static `dist/` + optional MinIO **or** switch MinIO to **S3**.

**Pros:** Closer to how many teams run production databases.  
**Cons:** **Two** billable footprints (EC2 + RDS); easier to misconfigure storage or run a non–free-tier DB class. **Verify** RDS free-tier eligibility before creating.

Use the **same** environment rules as in [hosting.md](hosting.md): migrations before cutover (`alembic upgrade head`), `DATABASE_URL` pointing at RDS (use the RDS endpoint, **not** `localhost`).

### Option C — S3 instead of MinIO (optional)

Point **`STORAGE_*`** at **Amazon S3**: `STORAGE_ENDPOINT_URL` as `https://s3.<region>.amazonaws.com` (or the regional endpoint your client expects), **`STORAGE_BUCKET`**, and **IAM access key + secret** for a user or role with least privilege. The API validates production storage (**https**, non-placeholder bucket, not `minioadmin` credentials); see `backend/app/core/config.py`.

You can keep MinIO on EC2 for the **shortest** path; move to S3 when you want fewer moving parts and AWS-native storage.

---

## Production-shaped settings (`ENVIRONMENT=production`)

The API **refuses** to start in production if you leave local placeholders (for example the **local DB password**, default submitter HMAC key, **http** `CORS_ORIGINS`, `minioadmin`, or **http** storage endpoint). See `backend/app/core/config.py` (`check_production_constraints`).

Minimum expectations:

| Variable | Notes |
| -------- | ----- |
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Strong Postgres password; **not** `tvn_local_dev` |
| `CORS_ORIGINS` | **HTTPS** origins only, exact match to your site (no wildcards) |
| `SUBMISSION_SUBMITTER_HMAC_KEY` | Long random secret (not the local dev value) |
| `STORAGE_ENDPOINT_URL` | **HTTPS** S3 endpoint **or** **HTTPS** endpoint to MinIO behind TLS |
| `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Real bucket and credentials (not `minioadmin` placeholders) |

You will also want **`TRUSTED_HOSTS`**, **`SESSION_COOKIE_SECURE=true`** (default in production), and optional **`TRUST_FORWARDED_FOR` / `PROXY_HEADERS`** if the API sits behind **nginx** or a load balancer. See [hosting.md](hosting.md).

**Frontend build:** set **`VITE_API_BASE_URL`** to the **public API origin** (e.g. `https://api.yourdomain.com`) **during** `npm run build`. If the API is on the **same host and path**, see [hosting.md](hosting.md) (Vercel pattern); on plain EC2, separate **https://api.…** and **https://www.…** with **`SameSite=Lax`** cookies typically requires a **common registrable parent domain** (e.g. `app.example.com` and `api.example.com`).

**CSP:** update **`frontend/public/_headers`** `connect-src` for your API host before relying on strict browser CSP in production (see [hosting.md](hosting.md)).

---

## HTTPS on EC2 (short pointers)

Free-tier testing often starts without TLS; moving to **HTTPS** is strongly recommended for anything beyond a locked-down lab.

Practical options:

1. **Application Load Balancer + ACM certificate** — common; extra cost (ALB is usually **not** free).
2. **nginx on EC2 + Let’s Encrypt (Certbot)** — certificate automation on the instance; you manage renewal.
3. **CloudFront** in front of S3 for static **`dist/`** and/or ALB for API — can reduce origin load; **watch** CloudFront and egress pricing.

The exact steps depend on your DNS (Route 53 or another registrar).

---

## Bootstrap admin after deploy

After Postgres is up and migrations have been applied, create the first platform administrator. Locally the repo uses `make bootstrap-admin`; on the server you need the same **`DATABASE_URL`** and the backend tooling (or run the command from a CI job / bastion with network access to the DB).

See [bootstrap-admin.md](bootstrap-admin.md) for semantics and [authentication.md](authentication.md) for the session model.

---

## Nginx sketch (static SPA + API reverse proxy)

Many teams put **one nginx** on the EC2 host:

- **`/`** — `root` points at `frontend/dist/`; **`try_files $uri $uri/ /index.html;`** for the React router.
- **`/api/`** — `proxy_pass` to `http://127.0.0.1:8000` (or the Docker bridge IP for the API container).

That gives **one origin** for the browser if you terminate TLS on nginx, which simplifies **CORS** and cookies; configure **`TRUSTED_HOSTS`** and forwarded headers per [hosting.md](hosting.md).

---

## Destroy / pause checklist (avoid ongoing charges)

1. **Terminate** test EC2 instances you no longer need (not just “stop” if you will not return—note EBS behavior).
2. **Delete** unattached **EBS** volumes and old **snapshots** you do not need.
3. **Delete** RDS instances (final snapshot optional) and **subnet groups** if unused.
4. **Empty and delete** S3 buckets created for experiments.
5. **Release Elastic IPs** not in use.
6. **Delete** NAT Gateways, load balancers, and unused **Elastic IPs** tied to them.
7. **Confirm** Billing / Cost Explorer drops to **zero** or expected free-tier usage after cleanup.

---

## Final suggestion (summary)

| Goal | Suggestion |
| ---- | ---------- |
| **Minimize surprise bills** | **AWS Budgets** + alarms **first**; **one** free-tier **EC2**; **no NAT Gateway**; **tight security groups**; **stop/terminate** when idle; watch **EBS, RDS, egress, IPv4**. |
| **Fastest path to run the whole stack** | **Option A:** single EC2 + Docker for **postgres + api + minio**, plus **nginx** serving **`npm run build`** output from `frontend/dist/`. |
| **Closer to “real” AWS databases** | **Option B:** **RDS** for Postgres + EC2 for API and static site; accept **two** services to monitor for cost. |
| **Production-quality** | **`ENVIRONMENT=production`**, **HTTPS**, **S3** or **TLS-backed MinIO**, strong secrets, **`TRUSTED_HOSTS`**, and a proper DNS/TLS layout—see [hosting.md](hosting.md) and [runbook.md](runbook.md). |

This document does **not** replace AWS’s pricing pages or your account’s **Free Tier** view. Re-check limits before every new resource type you enable.
