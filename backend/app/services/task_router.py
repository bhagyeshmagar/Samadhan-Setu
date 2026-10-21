"""
Task Routing Service for Samadhan Setu.
Provides multi-department category detection based on complaint text keywords.
"""
from typing import List, Dict

# Multi-category keywords: if a complaint matches these,
# route to additional departments beyond the primary.
MULTI_DEPT_KEYWORDS: Dict[str, List[str]] = {
    "Roads & Transport": ["road", "pothole", "traffic", "bridge", "footpath"],
    "Water Supply": ["water", "pipe", "drain", "sewage", "tap", "leaking"],
    "Electricity": ["power", "electricity", "streetlight", "wire", "transformer", "outage"],
    "Sanitation & Waste": ["garbage", "trash", "waste", "cleaning", "dump", "gutter"],
    "Health & Safety": ["health", "hospital", "disease", "mosquito", "safety", "fire"],
}


def detect_departments_from_text(description: str, primary_category: str) -> List[str]:
    """
    Detect additional departments from complaint text.
    Returns list of category names that the complaint touches.
    Always includes the primary category.
    """
    if not description:
        return [primary_category] if primary_category else []
    text_lower = description.lower()
    categories = {primary_category} if primary_category else set()

    for category, keywords in MULTI_DEPT_KEYWORDS.items():
        if category == primary_category:
            continue
        for keyword in keywords:
            if keyword in text_lower:
                categories.add(category)
                break

    return list(categories)

