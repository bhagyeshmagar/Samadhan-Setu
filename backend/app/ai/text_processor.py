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
        if not text:
            return ""
        import unicodedata
        text = unicodedata.normalize("NFC", text.lower().strip())
        text = re.sub(r"https?://\S+|www\.\S+", " ", text)
        text = re.sub(r"\S+@\S+", " ", text)
        # Preserve ASCII alphanumeric + full Devanagari Unicode block (\u0900-\u097F)
        text = re.sub(r"[^a-z0-9\u0900-\u097f\s]", " ", text)
        return re.sub(r"\s+", " ", text).strip()
    
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
        """Check if text contains any of the given keywords as full words/phrases"""
        cleaned = TextProcessor.clean_text(text)
        if not cleaned:
            return False
        for keyword in keywords:
            kw = keyword.strip().lower()
            if not kw:
                continue
            pattern = r'(?u)\b' + re.escape(kw) + r'\b'
            if re.search(pattern, cleaned):
                return True
        return False
    
    @staticmethod
    def count_keyword_matches(text: str, keywords: List[str]) -> int:
        """
        Count distinct keyword matches without double counting overlapping substrings
        (e.g., 'leak' and 'leaking' in the same span only count once).
        """
        cleaned = TextProcessor.clean_text(text)
        if not cleaned:
            return 0
        
        # Sort keywords by length descending so longer phrases match first
        sorted_kw = sorted(set(k.strip().lower() for k in keywords if k.strip()), key=len, reverse=True)
        matched_spans = []
        count = 0
        
        for kw in sorted_kw:
            pattern = r'(?u)\b' + re.escape(kw) + r'\b'
            for match in re.finditer(pattern, cleaned):
                start, end = match.span()
                # Check if this span overlaps with an already-counted span
                if not any(max(start, m_start) < min(end, m_end) for m_start, m_end in matched_spans):
                    matched_spans.append((start, end))
                    count += 1
        return count
