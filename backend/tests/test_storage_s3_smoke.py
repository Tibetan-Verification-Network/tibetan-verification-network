"""Optional S3/MinIO integration smoke test (runs in CI when MinIO is available)."""

from __future__ import annotations

import os
import uuid

import pytest

from app.storage.s3 import S3CompatibleStorage

pytestmark = pytest.mark.skipif(
    not os.environ.get("STORAGE_ENDPOINT_URL"),
    reason="STORAGE_ENDPOINT_URL not configured",
)


def test_s3_put_presign_and_delete_roundtrip() -> None:
    endpoint = os.environ["STORAGE_ENDPOINT_URL"]
    bucket = os.environ.get("STORAGE_BUCKET", "tvn-archive")
    access_key = os.environ.get("STORAGE_ACCESS_KEY_ID", "minioadmin")
    secret_key = os.environ.get("STORAGE_SECRET_ACCESS_KEY", "minioadmin")
    region = os.environ.get("STORAGE_REGION", "us-east-1")

    storage = S3CompatibleStorage(
        endpoint_url=endpoint,
        bucket=bucket,
        access_key_id=access_key,
        secret_access_key=secret_key,
        region=region,
    )
    key = f"ci-smoke/{uuid.uuid4()}"
    payload = b"tvn-archive-smoke"
    storage.put_stream(key, iter([payload]), content_type="text/plain", content_length=len(payload))
    head = storage.head(key)
    assert head is not None
    assert head["content_length"] == len(payload)
    url = storage.presign_get(key, ttl_seconds=60, filename="smoke.txt")
    assert url.startswith("http")
    storage.delete(key)
    assert storage.head(key) is None
