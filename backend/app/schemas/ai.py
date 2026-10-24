"""
AI Schemas for Samadhan Setu Phase 2.

Pydantic models for all AI service responses.
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class TextAnalysisResult(BaseModel):
    category: str
    subcategory: Optional[str] = None
    category_confidence: int = 0
    category_source: str = "default"
    urgency_score: int = 0
    urgency_level: str = "Low"
    severity_score: int = 0
    severity_level: str = "Low"
    keyword_highlights: List[str] = []
    explanation: str = ""


class SimilarComplaint(BaseModel):
    complaint_id: str
    similarity_score: float
    is_likely_duplicate: bool = False
    preview: str = ""
    category: str = ""
    status: str = ""


class ImageAnalysisResult(BaseModel):
    status: str = "pending"
    total_images: int = 0
    analyzed_images: int = 0
    total_objects_detected: int = 0
    avg_relevance_score: float = 0.0
    max_visual_severity: int = 1
    has_relevant_evidence: bool = False


class PriorityExplanation(BaseModel):
    score: float
    priority: str
    sla_hours: int
    formula: str = ""
    factors: Dict[str, Any] = {}
    bands: Dict[str, float] = {}


class SLARiskResult(BaseModel):
    risk_score: float = 1.0
    risk_level: str = "Low"
    factors: Dict[str, Any] = {}
    explanation: str = ""


class RoutingSuggestion(BaseModel):
    suggested_category: str = ""
    primary_department: Optional[Dict[str, Any]] = None
    secondary_departments: List[Dict[str, Any]] = []
    suggested_urgency_band: str = "Low"
    duplicate_links: List[Dict[str, Any]] = []
    suggested_officer: Optional[Dict[str, Any]] = None
    explanation: str = ""
    status: str = "pending"


class AIAnalysisResponse(BaseModel):
    """Complete AI analysis summary for a complaint."""
    complaint_id: str
    text_analysis: Optional[TextAnalysisResult] = None
    similar_complaints: List[SimilarComplaint] = []
    image_analysis: Optional[ImageAnalysisResult] = None
    priority_explanation: Optional[PriorityExplanation] = None
    sla_risk: Optional[SLARiskResult] = None
    routing_suggestion: Optional[RoutingSuggestion] = None
    pipeline_status: str = "pending"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class ModelHealthResponse(BaseModel):
    """Model availability and health."""
    distilbert_available: bool = False
    sbert_available: bool = False
    yolo_available: bool = False
    fallback_rate: float = 0.0
    total_inferences: int = 0
    avg_latency_ms: float = 0.0


class OfficerQueueItem(BaseModel):
    """AI-ranked officer queue item."""
    task_id: str
    complaint_id: str
    complaint_title: str = ""
    complaint_description: str = ""
    complaint_location: str = ""
    department_name: str = ""
    task_status: str = ""
    priority: str = "Low"
    priority_score: float = 0.0
    urgency_level: str = "Low"
    ai_category: str = ""
    ai_confidence: int = 0
    similar_count: int = 0
    sla_risk_level: str = "Low"
    created_at: Optional[str] = None
    sla_deadline: Optional[str] = None
    sla_breached: bool = False
    complaint_number: str = ""
    ward: Optional[str] = None
    vote_count: int = 0

    class Config:
        from_attributes = True
