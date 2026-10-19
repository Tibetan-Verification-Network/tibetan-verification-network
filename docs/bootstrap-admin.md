# Bootstrap the first administrator

The first platform administrator is created with a command, not with an HTTP signup route. The command refuses to run once any platform administrator exists.

## Before you run it

1. Start PostgreSQL. `make start` or `docker compose up postgres --detach --wait`.
2. Apply migrations so the `platform_administrator` role exists:

```sh
cp .env.example .env   # skip if .env is already present
make migrate
```

3. Choose an email address and a password of at least `PASSWORD_MIN_LENGTH` characters (12 by default).

The command reads `DATABASE_URL` from the environment or from the repository `.env`. It does not print the password.

## Command

From the repository root:

```sh
export TVN_BOOTSTRAP_EMAIL=admin@example.org
make bootstrap-admin
```

`make bootstrap-admin` runs:

```sh
cd backend && uv run tvn-bootstrap-admin --email "$TVN_BOOTSTRAP_EMAIL"
```

You are prompted for `Administrator password:` and then `Confirm password:`. The prompts must match. A successful run prints `Platform administrator created.` and exits 0.

Optional flags:

- `--display-name "Name"` sets the display name stored on the user.
- `--password` supplies the first password on the command line. The confirmation prompt still runs, so this is not a non-interactive mode. Prefer the prompts so the password is not stored in shell history.

## What it writes

- One active `users` row with an Argon2id password hash.
- One `user_roles` row for `platform_administrator`.
- One `audit_events` row of type `bootstrap_admin` with the normalized email. The password is not in the event.

Run it again and it exits 1 with `A platform administrator already exists`. It will not create a second administrator and it will not reset the first password.

## Next step

Sign in at http://127.0.0.1:5173/login, or call `POST /api/v1/auth/login`, and create a staff invite. The curl sequence is in [authentication.md](authentication.md). Send the invite token to the new staff member. They open `/activate`, choose a password, and then sign in.

There is still no public registration page or API.
