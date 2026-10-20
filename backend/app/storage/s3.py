"""S3-compatible object storage (MinIO, AWS S3, etc.)."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, cast
from urllib.parse import quote

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import ClientError

from app.storage.base import ObjectStorage


class S3CompatibleStorage(ObjectStorage):
    """Upload and presign objects through boto3."""

    def __init__(
        self,
        *,
        endpoint_url: str,
        bucket: str,
        access_key_id: str,
        secret_access_key: str,
        region: str,
        presign_client: BaseClient | None = None,
    ) -> None:
        self._bucket = bucket
        self._client = presign_client or boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )

    def put_stream(
        self,
        key: str,
        chunks: Iterator[bytes],
        *,
        content_type: str,
        content_length: int | None = None,
    ) -> None:
        body = b"".join(chunks)
        extra: dict[str, Any] = {"ContentType": content_type}
        if content_length is not None:
            extra["ContentLength"] = content_length
        self._client.put_object(Bucket=self._bucket, Key=key, Body=body, **extra)

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def presign_get(self, key: str, *, ttl_seconds: int, filename: str) -> str:
        safe_name = quote(filename)
        return cast(
            str,
            self._client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": key,
                    "ResponseContentDisposition": f'attachment; filename="{safe_name}"',
                },
                ExpiresIn=ttl_seconds,
            ),
        )

    def head(self, key: str) -> dict[str, str | int] | None:
        try:
            response = self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        return {
            "content_type": response.get("ContentType", "application/octet-stream"),
            "content_length": int(response.get("ContentLength", 0)),
        }
