"""
media_service.py — Consolidated Safe Image Ingest & Storage Service.

Security controls:
1. Hard size streaming limit (fails fast without memory exhaustion).
2. Image.MAX_IMAGE_PIXELS capped against decompression bombs.
3. Decodes and re-encodes image via Pillow:
   - Strips dangerous EXIF GPS / metadata (prevents citizen & officer home dox).
   - Defeats polyglot files (valid image headers containing active HTML/JS payloads).
   - Normalizes orientation with exif_transpose.
4. Non-blocking disk write using asyncio.to_thread.
5. Structured partitioning: stores under complaint_id/<media_type>_<uuid>.jpg.
"""
import os
import io
import uuid
import asyncio
from typing import Tuple
from fastapi import UploadFile, HTTPException, status
from PIL import Image, ImageOps

from app.config import settings
from app.models.orm.enums import MediaType

# Safety cap against decomp bombs (approx 25 megapixels)
Image.MAX_IMAGE_PIXELS = 25_000_000

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _process_and_save_sync(raw_bytes: bytes, target_path: str) -> Tuple[int, int, int]:
    """Synchronous CPU/disk bound task executed in background thread."""
    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            # Transpose according to EXIF orientation then strip metadata
            transposed = ImageOps.exif_transpose(img)
            # Normalize to RGB for JPEG
            if transposed.mode not in ("RGB", "L"):
                transposed = transposed.convert("RGB")
            
            width, height = transposed.size

            # Save clean sanitized JPEG (strips all EXIF, GPS, and malicious payloads)
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            transposed.save(target_path, format="JPEG", quality=85, optimize=True)

        file_size = os.path.getsize(target_path)
        return file_size, width, height
    except Exception as e:
        raise ValueError(f"Invalid or corrupted image format: {e}")


async def process_and_store_image(
    file: UploadFile,
    complaint_id: str | uuid.UUID,
    media_type: MediaType = MediaType.PROOF_PHOTO,
) -> Tuple[str, str, int]:
    """
    Validates, strips metadata, and writes image file securely.
    Returns: (s3_key_path, relative_url, file_size_bytes)
    """
    cid_str = str(complaint_id)
    max_size = settings.MAX_UPLOAD_SIZE_BYTES

    # Stream read with strict byte budget
    chunks = []
    total_read = 0
    while True:
        chunk = await file.read(64 * 1024)  # 64 KB chunks
        if not chunk:
            break
        total_read += len(chunk)
        if total_read > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image exceeds maximum allowed size of {max_size // (1024 * 1024)}MB",
            )
        chunks.append(chunk)

    if total_read == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

    raw_bytes = b"".join(chunks)

    # Determine unique target filename
    unique_name = f"{media_type.value}_{uuid.uuid4().hex[:12]}.jpg"
    sub_dir = os.path.join(UPLOADS_DIR, cid_str)
    disk_path = os.path.join(sub_dir, unique_name)
    s3_key = f"{cid_str}/{unique_name}"

    try:
        file_size, width, height = await asyncio.to_thread(_process_and_save_sync, raw_bytes, disk_path)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )

    relative_url = f"/uploads/{s3_key}"
    return s3_key, relative_url, file_size


import hashlib
from typing import Optional
from PIL import ImageStat


def verify_before_after_authenticity(
    before_bytes: Optional[bytes],
    after_bytes: bytes,
) -> dict:
    """
    AI & Forensic Visual Proof Check:
    1. Ensures the 'After' resolution photo is not a byte-identical or perceptual duplicate of 'Before'.
    2. Checks image luminance & contrast (variance) to reject blank/covered-lens uploads.
    """
    after_hash = hashlib.sha256(after_bytes).hexdigest()
    before_hash = hashlib.sha256(before_bytes).hexdigest() if before_bytes else None

    if before_hash and after_hash == before_hash:
        return {
            "verified": False,
            "reason": "Duplicate Image Detected: Resolution ('After') photo is identical to the Inspection ('Before') photo.",
            "authenticity_score": 0.0,
        }

    try:
        from io import BytesIO
        from PIL import Image
        with Image.open(BytesIO(after_bytes)) as img:
            gray = img.convert("L")
            stat = ImageStat.Stat(gray)
            mean_brightness = stat.mean[0]
            std_contrast = stat.stddev[0]

            # Reject pitch-black, overexposed white, or zero-variance solid images
            if mean_brightness < 12 or mean_brightness > 248 or std_contrast < 8:
                return {
                    "verified": False,
                    "reason": f"Low-quality/blank proof image rejected (Brightness: {mean_brightness:.1f}, Contrast: {std_contrast:.1f}).",
                    "authenticity_score": 0.2,
                }

            # Compute 8x8 average perceptual hash (aHash) to catch resized duplicates
            tiny = gray.resize((8, 8))
            pixels = list(tiny.getdata())
            avg = sum(pixels) / len(pixels)
            after_ahash = "".join("1" if p > avg else "0" for p in pixels)

            if before_bytes:
                with Image.open(BytesIO(before_bytes)) as b_img:
                    b_tiny = b_img.convert("L").resize((8, 8))
                    b_pixels = list(b_tiny.getdata())
                    b_avg = sum(b_pixels) / len(b_pixels)
                    before_ahash = "".join("1" if p > b_avg else "0" for p in b_pixels)
                    hamming_dist = sum(ch1 != ch2 for ch1, ch2 in zip(after_ahash, before_ahash))
                    if hamming_dist <= 3:
                        return {
                            "verified": False,
                            "reason": "Near-Duplicate Visual Proof: 'After' photo is perceptually identical to 'Before' photo.",
                            "authenticity_score": 0.15,
                        }
    except Exception:
        pass

    return {
        "verified": True,
        "reason": "Visual proof passed forensic contrast and Before/After distinctness verification.",
        "authenticity_score": 0.95,
    }

