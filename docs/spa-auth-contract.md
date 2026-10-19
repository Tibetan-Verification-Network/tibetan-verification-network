# SPA authentication contract

The shell follows this contract. Operational steps, invite curl examples, and secret rotation are in [authentication.md](authentication.md). Session secrets never belong in browser storage, URLs, or application state beyond an in-memory CSRF string. Browser routes are `/login`, `/activate`, and `/editorial`. There is no `/register` page.

## Session cookie

- **Name:** `tvn_session` (override with `SESSION_COOKIE_NAME` for non-default deployments).
- **Flags:** `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- **Transport:** The browser sends the cookie automatically when `fetch` uses `credentials: "include"`.

## CSRF

- **Header:** `X-CSRF-Token` on every cookie-authenticated `POST`, `PUT`, `PATCH`, or `DELETE`.
- **Issuance:** Returned in the JSON body of `POST /api/v1/auth/login`. Authenticated clients may refresh it with `GET /api/v1/auth/csrf`.
- **Exempt routes:** `POST /api/v1/auth/login` and `POST /api/v1/auth/activate` (invite token instead of session).
- **Origin:** Mutations must include an `Origin` header that matches a configured CORS origin (required in production).

## Core routes

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/v1/auth/login` | No | Sets session cookie; returns `{ "csrf_token": "..." }`. |
| `POST` | `/api/v1/auth/logout` | Session + CSRF | Clears cookie and revokes session. |
| `POST` | `/api/v1/auth/activate` | No | Single-use invite token + password. |
| `GET` | `/api/v1/auth/csrf` | Session | Rotates and returns a new CSRF token. |
| `GET` | `/api/v1/me` | Session | Current staff profile and roles. |
| `POST` | `/api/v1/admin/invites` | Platform admin + CSRF | Creates a time-limited invite; raw token returned once. |
| `POST` | `/api/v1/admin/users/{id}/disable` | Platform admin + CSRF | Disables account and revokes all sessions. |
| `PUT` | `/api/v1/admin/users/{id}/roles` | Platform admin + CSRF | Replaces role assignments. |
| `GET` | `/api/v1/editorial/status` | Any staff role | Phase 1 protection probe only. |

There is **no** public registration route. The first platform administrator is created with the `tvn-bootstrap-admin` CLI.

## Error handling

- Invalid credentials and inactive accounts both receive `401` with `"Invalid email or password."` on login.
- Missing/invalid CSRF returns `403` with `"CSRF validation failed."`.
- Missing session returns `401` with `"Authentication required"`.
