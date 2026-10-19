"""Bootstrap the first platform administrator."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from app.core.config import get_settings
from app.db.session import create_engine, create_session_factory, session_scope
from app.services.bootstrap import bootstrap_platform_admin


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the first platform administrator")
    parser.add_argument("--email", required=True, help="Administrator email address")
    parser.add_argument("--display-name", default=None, help="Optional display name")
    parser.add_argument(
        "--password",
        default=None,
        help="Administrator password (prompted securely when omitted)",
    )
    return parser.parse_args(argv)


async def _run(email: str, password: str, display_name: str | None) -> int:
    settings = get_settings()
    engine = create_engine(settings.database_url.get_secret_value())
    factory = create_session_factory(engine)
    try:
        async with session_scope(factory) as session:
            await bootstrap_platform_admin(
                session,
                email=email,
                password=password,
                display_name=display_name,
            )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        await engine.dispose()
    print("Platform administrator created.")
    return 0


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    password = args.password or getpass.getpass("Administrator password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.", file=sys.stderr)
        raise SystemExit(1)
    raise SystemExit(asyncio.run(_run(args.email, password, args.display_name)))


if __name__ == "__main__":
    main()
