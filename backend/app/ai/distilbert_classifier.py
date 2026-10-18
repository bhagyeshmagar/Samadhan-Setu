"""
DistilBERT Zero-Shot Classifier for Samadhan Setu Phase 2.

Uses Hugging Face zero-shot classification pipeline with DistilBERT
for automatic complaint category prediction. Falls back to rule-based
CategoryClassifier when the model is unavailable or confidence is low.

AI assists, officers decide.
"""
import os
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

# Lazy-loaded model
_pipeline = None
_MODEL_AVAILABLE = None

CANDIDATE_LABELS = [
    "Roads & Transport",
    "Water Supply",
    "Electricity",
    "Sanitation & Waste",
    "Health & Safety",
    "General",
]

# Subcategory mapping per category
SUBCATEGORY_MAP = {
    "Roads & Transport": ["Pothole", "Traffic Signal", "Footpath", "Bridge", "Street Damage"],
    "Water Supply": ["Pipe Leak", "No Water", "Contamination", "Drainage", "Sewage Overflow"],
    "Electricity": ["Power Outage", "Street Light", "Transformer", "Wiring Hazard", "Billing"],
    "Sanitation & Waste": ["Garbage Collection", "Open Dumping", "Public Toilet", "Pest Control", "Debris"],
    "Health & Safety": ["Fire Hazard", "Medical Emergency", "Chemical Spill", "Building Collapse", "Public Danger"],
    "General": ["Administrative", "Other"],
}

MODEL_NAME = os.getenv("CLASSIFICATION_MODEL_NAME", "typeform/distilbert-base-uncased-mnli")
CONFIDENCE_THRESHOLD = float(os.getenv("CLASSIFICATION_CONFIDENCE_THRESHOLD", "0.55"))


def _load_pipeline():
    """Lazy-load the zero-shot classification pipeline."""
    global _pipeline, _MODEL_AVAILABLE

    if _MODEL_AVAILABLE is False:
        return None

    if _pipeline is not None:
        return _pipeline

    try:
        from transformers import pipeline as hf_pipeline
        logger.info(f"[DistilBERT] Loading model: {MODEL_NAME}")
        _pipeline = hf_pipeline(
            "zero-shot-classification",
            model=MODEL_NAME,
            device=-1,  # CPU only
        )
        _MODEL_AVAILABLE = True
        logger.info("[DistilBERT] Model loaded successfully")
        return _pipeline
    except Exception as e:
        logger.warning(f"[DistilBERT] Failed to load model: {e}")
        _MODEL_AVAILABLE = False
        return None


class DistilBERTClassifier:
    """
    Zero-shot complaint classifier using DistilBERT.
    Falls back to rule-based classification when model unavailable.
    """

    def __init__(self):
        from .classifier import CategoryClassifier
        self.fallback = CategoryClassifier()

    def classify(self, text: str) -> Dict[str, Any]:
        """
        Classify complaint text into category with confidence.

        Returns:
            Dict with: category, subcategory, confidence, source,
                       all_scores, explanation, model_name, is_fallback
        """
        if not text or len(text.strip()) < 5:
            return self._make_result("General", None, 0, is_fallback=True,
                                     explanation="Text too short for classification")

        pipe = _load_pipeline()

        if pipe is not None:
            try:
                result = pipe(text, candidate_labels=CANDIDATE_LABELS, multi_label=False)
                top_label = result["labels"][0]
                top_score = result["scores"][0]
                confidence = int(top_score * 100)

                all_scores = {
                    label: round(score, 4)
                    for label, score in zip(result["labels"], result["scores"])
                }

                if top_score >= CONFIDENCE_THRESHOLD:
                    subcategory = self._predict_subcategory(text, top_label)
                    return self._make_result(
                        category=top_label,
                        subcategory=subcategory,
                        confidence=confidence,
                        is_fallback=False,
                        all_scores=all_scores,
                        explanation=f"DistilBERT classified as '{top_label}' with {confidence}% confidence",
                    )
                else:
                    # Low confidence — fall back to rules
                    rule_result = self._rule_classify(text)
                    rule_result["explanation"] = (
                        f"ML confidence too low ({confidence}%), "
                        f"using rule-based classification: '{rule_result['category']}'"
                    )
                    rule_result["ml_scores"] = all_scores
                    return rule_result

            except Exception as e:
                logger.warning(f"[DistilBERT] Inference failed: {e}")

        # Full fallback
        return self._rule_classify(text)

    def _rule_classify(self, text: str) -> Dict[str, Any]:
        """Rule-based fallback classification."""
        category, confidence = self.fallback.classify(text)
        subcategory = self._predict_subcategory(text, category)
        return self._make_result(
            category=category,
            subcategory=subcategory,
            confidence=confidence,
            is_fallback=True,
            explanation=f"Rule-based classification: '{category}' (confidence: {confidence}%)",
        )

    def _predict_subcategory(self, text: str, category: str) -> Optional[str]:
        """Predict subcategory using zero-shot on subcategory labels."""
        subcats = SUBCATEGORY_MAP.get(category, [])
        if not subcats:
            return None

        pipe = _load_pipeline()
        if pipe is not None:
            try:
                result = pipe(text, candidate_labels=subcats, multi_label=False)
                if result["scores"][0] >= 0.3:
                    return result["labels"][0]
            except Exception:
                pass

        # Rule-based subcategory: return first match from keywords
        text_lower = text.lower()
        for subcat in subcats:
            if subcat.lower().split()[0] in text_lower:
                return subcat
        return subcats[0] if subcats else None

    @staticmethod
    def _make_result(
        category: str,
        subcategory: Optional[str],
        confidence: int,
        is_fallback: bool,
        explanation: str = "",
        all_scores: Optional[Dict] = None,
        **extra,
    ) -> Dict[str, Any]:
        return {
            "category": category,
            "subcategory": subcategory,
            "confidence": confidence,
            "source": "rules" if is_fallback else "distilbert",
            "model_name": "rule-based" if is_fallback else MODEL_NAME,
            "is_fallback": is_fallback,
            "all_scores": all_scores or {},
            "explanation": explanation,
            **extra,
        }


# Singleton
distilbert_classifier = DistilBERTClassifier()
