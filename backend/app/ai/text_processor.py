"""
Text Processing Module for Samadhan Setu
Handles text cleaning and preprocessing for AI classification
"""
import re
from typing import List, Set

class TextProcessor:
    """Handles text cleaning and preprocessing for AI classification"""
    
    # Common stopwords for Indian English context
    STOPWORDS: Set[str] = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
        'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
        'from', 'as', 'into', 'through', 'during', 'before', 'after',
        'above', 'below', 'between', 'under', 'again', 'further', 'then',
        'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
        'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
        'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
        'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about',
        'against', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
        'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
        'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
        'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
        'who', 'whom', 'this', 'that', 'these', 'those', 'am'
    }
    
    @staticmethod
    def clean_text(text: str) -> str:
        """
        Clean and normalize text for processing
        - Lowercase
        - Remove special characters (keep alphanumeric and spaces)
        - Remove extra whitespace
        """
        if not text:
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove special characters but keep spaces
        text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    @staticmethod
    def tokenize(text: str, remove_stopwords: bool = True) -> List[str]:
        """
        Tokenize text into words
        Optionally removes stopwords
        """
        cleaned = TextProcessor.clean_text(text)
        tokens = cleaned.split()
        
        if remove_stopwords:
            tokens = [t for t in tokens if t not in TextProcessor.STOPWORDS]
        
        return tokens
    
    @staticmethod
    def extract_keywords(text: str, min_length: int = 3) -> List[str]:
        """
        Extract meaningful keywords from text
        - Removes stopwords
        - Filters by minimum length
        """
        tokens = TextProcessor.tokenize(text, remove_stopwords=True)
        keywords = [t for t in tokens if len(t) >= min_length]
        return keywords
    
    @staticmethod
    def contains_any(text: str, keywords: List[str]) -> bool:
        """Check if text contains any of the given keywords"""
        cleaned = TextProcessor.clean_text(text)
        return any(keyword.lower() in cleaned for keyword in keywords)
    
    @staticmethod
    def count_keyword_matches(text: str, keywords: List[str]) -> int:
        """Count how many keywords from the list appear in the text"""
        cleaned = TextProcessor.clean_text(text)
        return sum(1 for keyword in keywords if keyword.lower() in cleaned)
