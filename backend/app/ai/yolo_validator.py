"""
YOLOv8 Image Validator for Samadhan Setu Phase 2.

Validates uploaded complaint images using YOLOv8 object detection.
Scores image relevance based on detected objects vs complaint category.
Estimates visual severity from detection density and object types.

Uses YOLOv8n (nano) model for lightweight CPU inference.
Falls back gracefully if model/image is unavailable.
"""
import os
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Lazy-loaded model
_model = None
_MODEL_AVAILABLE = None

# Category-to-relevant-objects mapping (COCO classes)
CATEGORY_RELEVANCE = {
    "Roads & Transport": {
        "relevant": ["car", "truck", "bus", "motorcycle", "bicycle", "traffic light",
                      "stop sign", "person"],
        "weight": 0.7,
    },
    "Water Supply": {
        "relevant": ["bottle", "sink", "person"],
        "weight": 0.5,
    },
    "Electricity": {
        "relevant": ["person"],
        "weight": 0.3,  # Low — COCO doesn't have electrical equipment
    },
    "Sanitation & Waste": {
        "relevant": ["person", "bottle", "cup", "bowl"],
        "weight": 0.5,
    },
    "Health & Safety": {
        "relevant": ["person", "fire hydrant", "car", "truck"],
        "weight": 0.7,
    },
    "General": {
        "relevant": ["person"],
        "weight": 0.3,
    },
}


def _load_model():
    """Lazy-load YOLOv8n model."""
    global _model, _MODEL_AVAILABLE

    if _MODEL_AVAILABLE is False:
        return None

    if _model is not None:
        return _model

    try:
        from ultralytics import YOLO
        logger.info("[YOLO] Loading YOLOv8n model...")
        _model = YOLO("yolov8n.pt")
        _MODEL_AVAILABLE = True
        logger.info("[YOLO] Model loaded successfully")
        return _model
    except Exception as e:
        logger.warning(f"[YOLO] Failed to load model: {e}")
        _MODEL_AVAILABLE = False
        return None


class YOLOValidator:
    """
    Image evidence validator using YOLOv8.
    """

    @property
    def is_available(self) -> bool:
        return _load_model() is not None

    def analyze_image(self, image_path: str) -> Dict[str, Any]:
        """
        Run object detection on a single image.

        Returns:
            Dict with: detections, object_count, detected_classes,
                       confidence_avg, quality_flag, raw_boxes
        """
        if not os.path.exists(image_path):
            return self._error_result("Image file not found")

        model = _load_model()
        if model is None:
            return self._error_result("YOLO model unavailable")

        try:
            results = model(image_path, verbose=False, conf=0.25)

            if not results or len(results) == 0:
                return self._empty_detection()

            result = results[0]
            detections = []
            classes_found = set()

            if result.boxes is not None and len(result.boxes) > 0:
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    cls_name = result.names[cls_id]
                    conf = float(box.conf[0])
                    bbox = box.xyxy[0].tolist()

                    detections.append({
                        "class": cls_name,
                        "confidence": round(conf, 3),
                        "bbox": [round(b, 1) for b in bbox],
                    })
                    classes_found.add(cls_name)

            avg_conf = (
                sum(d["confidence"] for d in detections) / len(detections)
                if detections
                else 0.0
            )

            # Quality flag
            quality = "good"
            if len(detections) == 0:
                quality = "no_objects_detected"
            elif avg_conf < 0.35:
                quality = "low_confidence"

            return {
                "status": "success",
                "detections": detections,
                "object_count": len(detections),
                "detected_classes": list(classes_found),
                "confidence_avg": round(avg_conf, 3),
                "quality_flag": quality,
            }

        except Exception as e:
            logger.warning(f"[YOLO] Analysis failed for {image_path}: {e}")
            return self._error_result(f"Analysis failed: {str(e)}")

    def score_relevance(
        self, detections: List[Dict], category: str
    ) -> Dict[str, Any]:
        """
        Score how relevant detected objects are to the complaint category.

        Returns:
            Dict with: relevance_score (0-1), relevant_objects, explanation
        """
        config = CATEGORY_RELEVANCE.get(category, CATEGORY_RELEVANCE["General"])
        relevant_classes = set(config["relevant"])
        base_weight = config["weight"]

        if not detections:
            return {
                "relevance_score": 0.0,
                "relevant_objects": [],
                "explanation": "No objects detected in image",
            }

        detected_classes = set(d["class"] for d in detections)
        relevant_found = detected_classes & relevant_classes
        irrelevant_count = len(detected_classes) - len(relevant_found)

        # Score: proportion of relevant objects weighted by category config
        if len(detected_classes) > 0:
            relevance_ratio = len(relevant_found) / len(detected_classes)
        else:
            relevance_ratio = 0.0

        # Object density bonus (more objects = more complex scene = more relevant)
        density_bonus = min(0.2, len(detections) * 0.02)

        relevance_score = min(1.0, relevance_ratio * base_weight + density_bonus + 0.2)

        explanation_parts = []
        if relevant_found:
            explanation_parts.append(f"Relevant objects: {', '.join(relevant_found)}")
        if irrelevant_count > 0:
            explanation_parts.append(f"{irrelevant_count} unrelated object(s) detected")
        if not relevant_found and detections:
            explanation_parts.append("No category-specific objects detected, but image has content")

        return {
            "relevance_score": round(relevance_score, 3),
            "relevant_objects": list(relevant_found),
            "explanation": ". ".join(explanation_parts) if explanation_parts else "No analysis available",
        }

    def estimate_visual_severity(self, detections: List[Dict]) -> Dict[str, Any]:
        """
        Estimate visual severity from detected objects.

        Returns:
            Dict with: visual_severity (1-3), severity_label, explanation
        """
        if not detections:
            return {
                "visual_severity": 1,
                "severity_label": "Low",
                "explanation": "No visual evidence detected",
            }

        # Severity heuristics based on detection patterns
        object_count = len(detections)
        has_person = any(d["class"] == "person" for d in detections)
        has_vehicle = any(d["class"] in ["car", "truck", "bus"] for d in detections)
        high_conf_count = sum(1 for d in detections if d["confidence"] > 0.7)

        # Scoring
        if object_count >= 5 and has_person:
            severity = 3
            label = "High"
            explanation = f"Complex scene with {object_count} objects including people — potential serious issue"
        elif object_count >= 3 or (has_person and has_vehicle):
            severity = 2
            label = "Medium"
            explanation = f"Moderate scene complexity ({object_count} objects) — likely real issue"
        else:
            severity = 1
            label = "Low"
            explanation = f"Simple scene ({object_count} objects) — limited visual evidence"

        return {
            "visual_severity": severity,
            "severity_label": label,
            "explanation": explanation,
        }

    @staticmethod
    def _error_result(message: str) -> Dict[str, Any]:
        return {
            "status": "error",
            "error": message,
            "detections": [],
            "object_count": 0,
            "detected_classes": [],
            "confidence_avg": 0.0,
            "quality_flag": "analysis_unavailable",
        }

    @staticmethod
    def _empty_detection() -> Dict[str, Any]:
        return {
            "status": "success",
            "detections": [],
            "object_count": 0,
            "detected_classes": [],
            "confidence_avg": 0.0,
            "quality_flag": "no_objects_detected",
        }


# Singleton
yolo_validator = YOLOValidator()
