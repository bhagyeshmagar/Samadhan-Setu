"""
Multi-Modal Severity Fusion for Samadhan Setu Phase 2.

Combines text-based severity with image-based visual severity
into a single fused severity score. Adapts weights based on
data availability and text quality.
"""
from typing import Dict, Any, Optional


def fuse_severity(
    text_severity: int,
    image_severity: Optional[int] = None,
    text_length: int = 0,
    has_image: bool = False,
    image_relevance: float = 0.0,
) -> Dict[str, Any]:
    """
    Fuse text and image severity into final severity estimate.

    Args:
        text_severity: Text-based severity score (1-3 or 0-10 normalized to 1-3)
        image_severity: Image-based visual severity (1-3), None if no image
        text_length: Character count of complaint text
        has_image: Whether complaint has images
        image_relevance: Image relevance score (0-1)

    Returns:
        Dict with: fused_severity (1-3), fused_level, weights, explanation
    """
    # Normalize text severity to 1-3 scale if it's on 0-10 scale
    if text_severity > 3:
        text_norm = _normalize_to_3(text_severity)
    else:
        text_norm = max(1, min(3, text_severity))

    if not has_image or image_severity is None:
        # Text-only mode
        return {
            "fused_severity": text_norm,
            "fused_level": _severity_label(text_norm),
            "mode": "text_only",
            "weights": {"text": 1.0, "image": 0.0},
            "explanation": f"Text-only severity: {_severity_label(text_norm)} (no image available)",
        }

    img_norm = max(1, min(3, image_severity))

    # Adaptive weighting
    if text_length < 20:
        # Very short/vague text — lean on image
        text_weight = 0.35
        img_weight = 0.65
        reason = "short text, image-weighted"
    elif text_length < 50:
        text_weight = 0.50
        img_weight = 0.50
        reason = "moderate text, balanced"
    else:
        text_weight = 0.65
        img_weight = 0.35
        reason = "detailed text, text-weighted"

    # Reduce image weight if relevance is low
    if image_relevance < 0.3:
        img_weight *= 0.5
        text_weight = 1.0 - img_weight
        reason += ", low image relevance"

    fused = text_weight * text_norm + img_weight * img_norm
    fused_rounded = max(1, min(3, round(fused)))

    return {
        "fused_severity": fused_rounded,
        "fused_level": _severity_label(fused_rounded),
        "fused_raw": round(fused, 3),
        "mode": "multi_modal",
        "weights": {"text": round(text_weight, 3), "image": round(img_weight, 3)},
        "components": {"text_severity": text_norm, "image_severity": img_norm},
        "explanation": (
            f"Multi-modal severity: {_severity_label(fused_rounded)} "
            f"(text={text_norm}, image={img_norm}, {reason})"
        ),
    }


def _normalize_to_3(score_0_10: int) -> int:
    """Convert 0-10 score to 1-3 scale."""
    if score_0_10 >= 7:
        return 3
    elif score_0_10 >= 4:
        return 2
    return 1


def _severity_label(severity: int) -> str:
    return {3: "High", 2: "Medium", 1: "Low"}.get(severity, "Low")
