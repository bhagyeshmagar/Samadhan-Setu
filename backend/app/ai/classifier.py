"""
AI Category Classification Module for Samadhan Setu
Rule-based classification using keyword matching
Designed to be easily replaceable with ML models (DistilBERT) in production
"""
from typing import Tuple, Optional, Dict, List
from .text_processor import TextProcessor

def _matches_kw(kw: str, cleaned_text: str, tokens: set[str]) -> bool:
    kw = kw.strip().lower()
    if not kw:
        return False
    return (f" {kw} " in f" {cleaned_text} ") if (" " in kw) else (kw in tokens)


class CategoryClassifier:
    """
    Rule-based complaint category classifier
    
    Uses keyword matching for hackathon demo.
    Architecture supports swapping to DistilBERT/BERT for production.
    """
    
    # Department categories with associated keywords
    # Keywords are ordered by specificity (more specific first)
    CATEGORY_KEYWORDS: Dict[str, List[str]] = {
        'Roads & Transport': [
            'pothole', 'road', 'highway', 'traffic', 'signal', 'bus', 'transport',
            'footpath', 'pavement', 'asphalt', 'tar road', 'bridge', 'flyover', 'metro',
            'auto', 'rickshaw', 'taxi', 'parking', 'divider', 'zebra', 'crossing',
            'speed', 'accident', 'crash', 'vehicle', 'lane', 'street',
            'खड्डा', 'रस्ता', 'रस्ते', 'वाहतूक', 'पादचारी', 'पुल', 'सड़क', 'गड्ढा', 'यातायात'
        ],
        'Water Supply': [
            'water', 'pipe', 'leak', 'leakage', 'drainage', 'drain', 'sewage',
            'sewer', 'supply', 'tap', 'tank', 'bore', 'borewell', 'water well',
            'drinking', 'contaminated', 'dirty water', 'muddy', 'brown water',
            'overflow', 'flood', 'waterlogging', 'pipeline', 'plumbing',
            'पाणी', 'नळ', 'गळती', 'पाईप', 'सांडपाणी', 'जल', 'नल', 'सीवर', 'पानी'
        ],
        'Electricity': [
            'power', 'electricity', 'current', 'voltage', 'wire', 'cable',
            'pole', 'transformer', 'meter', 'billing', 'outage', 'blackout',
            'light', 'bulb', 'lamp', 'streetlight', 'electric', 'spark',
            'short circuit', 'fuse', 'phase', 'generator',
            'वीज', 'करंट', 'वायर', 'खांब', 'लाईट', 'विद्युत', 'बिजली', 'तार', 'अंधेरा'
        ],
        'Sanitation & Waste': [
            'garbage', 'trash', 'waste', 'dustbin', 'bin', 'dump', 'dumping',
            'litter', 'clean', 'cleaning', 'sweeper', 'sanitation', 'toilet',
            'public toilet', 'urinal', 'hygiene', 'stink', 'smell', 'odor',
            'pest', 'rats', 'rodents', 'cockroach', 'mosquito', 'flies', 'debris',
            'कचरा', 'घाण', 'दुर्गंधी', 'नाला', 'गटार', 'सफाई', 'कचरापेटी', 'कूड़ा', 'बदबू'
        ],
        'Health & Safety': [
            'hospital', 'clinic', 'doctor', 'ambulance', 'emergency', 'medical',
            'health', 'disease', 'dengue', 'malaria', 'fever', 'epidemic',
            'vaccination', 'vaccine', 'unsafe', 'danger', 'hazard', 'risk',
            'fire', 'smoke', 'chemical', 'poison', 'injury', 'death', 'dead body',
            'रुग्णालय', 'आजार', 'डास', 'मलेरिया', 'डेंग्यू', 'धोका', 'आग', 'अस्पताल', 'बीमारी', 'मच्छर', 'खतरा'
        ]
    }
    
    # Default category when no match is found
    DEFAULT_CATEGORY = 'General'
    
    def __init__(self):
        """Initialize the classifier"""
        self.text_processor = TextProcessor()
    
    def classify(self, text: str) -> Tuple[str, int]:
        """
        Classify complaint text into a category
        
        Args:
            text: The complaint description
            
        Returns:
            Tuple of (category_name, confidence_score 0-100)
        """
        if not text or len(text.strip()) < 3:
            return (self.DEFAULT_CATEGORY, 0)
        
        cleaned = self.text_processor.clean_text(text)
        tokens = set(cleaned.split())

        # Count matches for each category
        category_scores: Dict[str, int] = {}
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            score = sum(1 for kw in keywords if _matches_kw(kw, cleaned, tokens))
            if score > 0:
                category_scores[category] = score
        
        if not category_scores:
            return (self.DEFAULT_CATEGORY, 30)  # Low confidence for default
        
        # Get the category with highest score
        best_category = max(category_scores, key=category_scores.get)
        best_score = category_scores[best_category]
        
        # Calculate confidence (0-100)
        # More matches = higher confidence, capped at 95
        confidence = min(95, 40 + (best_score * 15))
        
        return (best_category, confidence)
    
    def classify_with_details(self, text: str) -> Dict:
        """
        Classify with detailed information for debugging/display
        """
        category, confidence = self.classify(text)
        
        cleaned = self.text_processor.clean_text(text)
        tokens = set(cleaned.split())

        all_scores = {}
        matched_keywords = []
        
        for cat, keywords in self.CATEGORY_KEYWORDS.items():
            score = sum(1 for kw in keywords if _matches_kw(kw, cleaned, tokens))
            all_scores[cat] = score
            
            if cat == category:
                matched_keywords = [kw for kw in keywords if _matches_kw(kw, cleaned, tokens)]
        
        return {
            'category': category,
            'confidence': confidence,
            'all_scores': all_scores,
            'matched_keywords': matched_keywords[:5]  # Top 5 matches
        }
    
    def get_categories(self) -> List[str]:
        """Return list of all available categories"""
        return list(self.CATEGORY_KEYWORDS.keys()) + [self.DEFAULT_CATEGORY]


# Singleton instance for reuse
classifier = CategoryClassifier()

def classify_complaint(text: str) -> Tuple[str, int]:
    """Convenience function to classify complaint text"""
    return classifier.classify(text)

def get_classification_details(text: str) -> Dict:
    """Convenience function to get detailed classification"""
    return classifier.classify_with_details(text)
