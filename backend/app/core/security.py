"""Password hashing, opaque tokens, and constant-time digest checks."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Final

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_PASSWORD_HASHER = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)

GENERIC_AUTH_FAILURE: Final = "Invalid email or password."
GENERIC_FORBIDDEN: Final = "Forbidden."
GENERIC_CSRF_FAILURE: Final = "CSRF validation failed."
GENERIC_ORIGIN_FAILURE: Final = "Origin validation failed."

CSRF_HEADER_NAME: Final = "X-CSRF-Token"
SESSION_COOKIE_NAME: Final = "tvn_session"


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_opaque_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def digest_matches(stored_digest: str, raw_value: str) -> bool:
    candidate = hash_opaque_token(raw_value)
    return hmac.compare_digest(stored_digest, candidate)


def hash_password(password: str) -> str:
    return _PASSWORD_HASHER.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _PASSWORD_HASHER.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _PASSWORD_HASHER.check_needs_rehash(password_hash)
