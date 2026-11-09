"""
storage.py – Abstract file storage for Samadhan Setu.

Provides a config-driven interface that works in two modes:
  1. Local disk  – default, no extra config needed.
                   Files land in backend/uploads/ and are served securely via
                   the authenticated /api/media/{media_id} endpoint.
  2. S3-compatible – enabled when S3_BUCKET env var is present.
                     Requires boto3 and the following env vars:
                       S3_BUCKET, S3_ENDPOINT_URL (for MinIO / Cloudflare R2 etc.),
                       AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (optional).
                     Presigned GET URLs are generated with the configured expiry.

Usage:
    from app.services.storage import storage
    key = await storage.save_file(raw_bytes, key="complaint-id/proof_abc123.jpg")
    file_bytes = await storage.read_bytes(key)
    await storage.delete_file(key)
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional

# ── Backend uploads directory (used in local mode) ───────────────────────────
_UPLOADS_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "uploads",
    )
)


# ── Local-disk backend ───────────────────────────────────────────────────────

class LocalStorage:
    """Stores files on local disk; served securely via /api/media/."""

    def __init__(self, uploads_dir: str = _UPLOADS_DIR) -> None:
        self._dir = os.path.abspath(uploads_dir)
        os.makedirs(self._dir, exist_ok=True)

    def _resolve_safe_path(self, key: str) -> str:
        """Resolve a storage key to an absolute path inside self._dir, preventing traversal."""
        clean = key.replace("\\", "/").lstrip("/")
        if clean.startswith("uploads/"):
            clean = clean[len("uploads/"):]
        target = os.path.abspath(os.path.join(self._dir, *clean.split("/")))
        if not target.startswith(self._dir):
            raise PermissionError("Directory traversal detected")
        return target

    def _write_sync(self, raw_bytes: bytes, key: str) -> None:
        target = self._resolve_safe_path(key)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as fh:
            fh.write(raw_bytes)

    def _read_sync(self, key: str) -> bytes:
        target = self._resolve_safe_path(key)
        if not os.path.isfile(target):
            raise FileNotFoundError(f"File not found: {key}")
        with open(target, "rb") as fh:
            return fh.read()

    def _delete_sync(self, key: str) -> None:
        try:
            target = self._resolve_safe_path(key)
            if os.path.isfile(target):
                os.remove(target)
        except (FileNotFoundError, PermissionError):
            pass

    async def save_file(self, raw_bytes: bytes, key: str) -> str:
        """Write bytes to disk and return the storage key."""
        self._write_sync(raw_bytes, key)
        return key

    async def read_bytes(self, key: str) -> bytes:
        """Read bytes directly from local storage."""
        return self._read_sync(key)

    def get_file_path(self, key: str) -> Optional[str]:
        """Return absolute path if the file exists locally and is within the uploads directory."""
        try:
            target = self._resolve_safe_path(key)
            return target if os.path.isfile(target) else None
        except Exception:
            return None

    async def get_file_url(self, key: str, expires_in: int = 3600) -> str:  # noqa: ARG002
        """Return relative path for the key."""
        clean = key.replace("\\", "/").lstrip("/")
        return f"/api/media/{clean}"

    async def delete_file(self, key: str) -> None:
        """Delete the file from disk; silently ignores missing files."""
        self._delete_sync(key)

    @property
    def backend(self) -> str:
        return "local"


# ── S3-compatible backend ────────────────────────────────────────────────────

class S3Storage:
    """Stores files in an S3-compatible bucket (AWS S3, MinIO, Cloudflare R2…)."""

    def __init__(
        self,
        bucket: str,
        endpoint_url: Optional[str] = None,
        region: str = "ap-south-1",
        presign_expires: int = 300,
    ) -> None:
        import boto3  # imported lazily so local-mode doesn't require boto3

        self._bucket = bucket
        self._presign_expires = presign_expires
        self._s3 = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )

    def _put_sync(self, raw_bytes: bytes, key: str) -> None:
        self._s3.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=raw_bytes,
            ContentType="image/jpeg",
        )

    def _read_sync(self, key: str) -> bytes:
        response = self._s3.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()

    def _delete_sync(self, key: str) -> None:
        self._s3.delete_object(Bucket=self._bucket, Key=key)

    def _presign_sync(self, key: str, expires_in: int) -> str:
        return self._s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    async def save_file(self, raw_bytes: bytes, key: str) -> str:
        """Upload bytes to S3 and return the key."""
        await asyncio.to_thread(self._put_sync, raw_bytes, key)
        return key

    async def read_bytes(self, key: str) -> bytes:
        """Read bytes directly from S3 bucket."""
        return await asyncio.to_thread(self._read_sync, key)

    def get_file_path(self, key: str) -> Optional[str]:  # noqa: ARG002
        """S3 storage does not provide local file paths."""
        return None

    async def get_file_url(self, key: str, expires_in: int = 300) -> str:
        """Return a presigned GET URL for the given S3 key (default 5 min)."""
        expires_in = expires_in or self._presign_expires
        return await asyncio.to_thread(self._presign_sync, key, expires_in)

    async def delete_file(self, key: str) -> None:
        await asyncio.to_thread(self._delete_sync, key)

    @property
    def backend(self) -> str:
        return "s3"


# ── Factory: pick backend from environment ───────────────────────────────────

def _build_storage() -> LocalStorage | S3Storage:
    bucket = os.environ.get("S3_BUCKET", "").strip()
    if bucket:
        return S3Storage(
            bucket=bucket,
            endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
            region=os.environ.get("AWS_REGION", "ap-south-1"),
            presign_expires=int(os.environ.get("S3_PRESIGN_EXPIRES", "300")),
        )
    return LocalStorage()


# ── Module-level singleton ───────────────────────────────────────────────────

storage: LocalStorage | S3Storage = _build_storage()

__all__ = ["storage", "LocalStorage", "S3Storage", "_UPLOADS_DIR"]
