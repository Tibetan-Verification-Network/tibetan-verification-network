# Authentication

Staff identity is invite-only. The browser keeps the session in an HttpOnly cookie. The React app keeps the CSRF token in memory for the current page load. It does not put session tokens in application state, `localStorage`, `sessionStorage`, or URLs.

The short route table is also in [spa-auth-contract.md](spa-auth-contract.md).

## Session cookie

- **Name:** `tvn_session` (`SESSION_COOKIE_NAME` can rename it).
- **Flags:** `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` when `ENVIRONMENT=production`.
- **Storage:** only the SHA-256 hash of the token is stored in `auth_sessions`. The raw token exists in the cookie and nowhere else on the server.
- **Transport:** `fetch` uses `credentials: "include"`. The JavaScript never reads the cookie.
- **Lifetime:** `SESSION_TTL_HOURS` (168 by default). Logout revokes the current row. Disabling a user revokes every active row for that user.

## CSRF

Cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests must send:

- header `X-CSRF-Token`
- an `Origin` that matches `CORS_ORIGINS` (required in production; in development a missing Origin is allowed, and a present Origin must still match)

`POST /api/v1/auth/login` and `POST /api/v1/auth/activate` are exempt because they do not use the session cookie. Login returns `{ "csrf_token": "..." }`. After a reload, `GET /api/v1/auth/csrf` rotates and returns a new token for the cookie's session. The UI calls that during session bootstrap and keeps the value in a module variable, not in React state that is rendered and not in web storage.

The frontend also sets `referrerPolicy: "no-referrer"` on API calls so an invite token is not leaked in a `Referer` header. Activation removes `?token=` from the address bar as soon as the page reads it.

## Routes

| Method | Path | Who | Result |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Anonymous | Sets the session cookie and returns a CSRF token. Unknown users, wrong passwords, and disabled accounts all receive `401` and `Invalid email or password.` |
| `POST` | `/api/v1/auth/logout` | Session + CSRF | `204`. Revokes the session and clears the cookie. |
| `POST` | `/api/v1/auth/activate` | Anonymous, with the raw invite token | `201` and enables the account. Does not sign the person in. Reuse and expiry return `400` and `Invalid or expired invite`. |
| `GET` | `/api/v1/auth/csrf` | Session | Rotates the CSRF token. |
| `GET` | `/api/v1/me` | Session | Email, display name, roles, and `is_active`. |
| `POST` | `/api/v1/admin/invites` | Platform administrator + CSRF | Creates one invite. The raw token is in this response only. |
| `POST` | `/api/v1/admin/users/{id}/disable` | Platform administrator + CSRF | Disables the account and revokes its sessions. |
| `PUT` | `/api/v1/admin/users/{id}/roles` | Platform administrator + CSRF | Replaces role assignments. |
| `GET` | `/api/v1/editorial/status` | Any staff role | Phase 1 protection probe. No editorial records. |

There is no `/register` route and no signup form. `POST /api/v1/auth/register` is not part of the API.

Missing sessions receive `401` and `Authentication required`. Missing or wrong CSRF receives `403` and `CSRF validation failed.`

## Browser pages

| Path | Purpose |
| --- | --- |
| `/login` | Email and password. On success the app opens `/editorial`. |
| `/activate` | Invite token, optional display name, and password. A link may be `/activate?token=...`; the page removes the query parameter immediately. |
| `/editorial` | Signed-in shell. Inbox, investigations, drafts, and archive are placeholders. |
| `/register` | Not found. |

Passwords must be at least `PASSWORD_MIN_LENGTH` characters (12 unless you change the setting). The forms use the same minimum and also require the activation password to be typed twice. The confirmation is not sent to the API.

## Invite a staff member

1. Bootstrap the platform administrator ([bootstrap-admin.md](bootstrap-admin.md)).
2. Sign in and keep the CSRF token from the login JSON. The cookie jar holds the session. Delete that jar when you are done; it is a credential.

```sh
curl --silent --show-error \
  --cookie-jar "$HOME/tvn-cookies" \
  --header 'Content-Type: application/json' \
  --data '{"email":"admin@example.org","password":"YOUR_PASSWORD"}' \
  http://127.0.0.1:8000/api/v1/auth/login
```

3. Create the invite. Use one of the configured origins. Role codes are `platform_administrator`, `researcher`, `editor`, and `approver`.

```sh
curl --silent --show-error \
  --cookie "$HOME/tvn-cookies" \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://127.0.0.1:5173' \
  --header "X-CSRF-Token: PASTE_CSRF_TOKEN" \
  --data '{"email":"editor@example.org","role_codes":["editor"]}' \
  http://127.0.0.1:8000/api/v1/admin/invites
```

4. Give the `token` value to the staff member out of band. The API does not send email. The token is single-use, expires after `INVITE_TTL_HOURS`, and is stored only as a hash.
5. The staff member opens `http://127.0.0.1:5173/activate`, sets a password, and then signs in at `/login`.

```sh
rm -f "$HOME/tvn-cookies"
```

Do not put the password or the invite token in a committed file, a log, or a shell history if you can avoid it. The examples above use placeholders so the real values are not copied from this document.

## Secret rotation

There is no server signing key for sessions. Rotating a shared HMAC secret is not a step in this system.

**Database password.** Change the PostgreSQL role password, update `DATABASE_URL` and `POSTGRES_PASSWORD` in the uncommitted environment, and restart the API. Production must not keep `tvn_local_dev`. Confirm the new URL still uses TLS and a non-local password before setting `ENVIRONMENT=production`.

**One session.** The staff member uses Log out. That revokes only the current session.

**One account.** A platform administrator calls `POST /api/v1/admin/users/{id}/disable`. The account can no longer sign in, and every active session for that user is revoked.

**Every session.** After a suspected compromise, delete rows from `auth_sessions` with a database role that is allowed to write. Staff must sign in again. Do not copy token hashes into tickets or logs. Changing `SESSION_COOKIE_NAME` makes browsers stop sending the old cookie name; it does not delete the rows. Delete the rows as well if the old tokens might still be presented.

**Invites.** A token cannot be rotated. Ignore a leaked unused token after it expires, or wait it out. Issuing another invite for an email that already has a user fails. Phase 1 has no password-change or password-reset route. Disable a compromised account so its sessions die. If that person still needs access before a later recovery feature exists, invite a new address rather than editing `password_hash` by hand.

**Frontend configuration.** `VITE_API_BASE_URL` is an origin, not a secret. Do not put passwords or tokens in it. Rebuild or restart the dev server after changing it.
