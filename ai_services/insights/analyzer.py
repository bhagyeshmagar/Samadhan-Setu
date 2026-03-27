from collections import Counter
import re
from typing import List, Dict

class InsightAnalyzer:
    """
    Analyzes clusters of complaints to generate human-readable insights.
    """
    
    # Common stopwords to ignore in keyword extraction
    STOPWORDS = {
        'the', 'is', 'are', 'was', 'were', 'and', 'but', 'for', 'with', 'this',
        'there', 'that', 'from', 'near', 'since', 'after', 'before', 'please',
        'issue', 'complaint', 'problem', 'reported', 'need', 'want', 'help'
    }

    def analyze_clusters(self, clusters: List[Dict]) -> List[Dict]:
        """
        Processes a list of clusters to generate metadata for each.
        """
        insights = []
        for cluster in clusters:
            if cluster.get("is_noise"):
                continue
                
            members = cluster["complaints"]
            
            # 1. Extract Keywords
            keywords = self._extract_top_keywords(members)
            
            # 2. Find Dominant Location/Ward
            location_info = self._get_location_summary(members)
            
            # 3. Determine Dominant Category
            category = self._get_dominant_category(members)
            
            # 4. Generate Insight Name
            # Example: "Recurring Water/Pipe issues in Ward 12"
            top_k = " & ".join(keywords[:2]).title()
            loc = location_info['primary_location']
            insight_name = f"Recurring {top_k} patterns in {loc}"
            
            insights.append({
                "insight_name": insight_name,
                "category": category,
                "locations": location_info['all_locations'],
                "support_count": len(members),
                "complaint_ids": [c['id'] for c in members],
                "top_keywords": keywords[:5]
            })
            
        return insights

    def _extract_top_keywords(self, complaints: List[Dict]) -> List[str]:
        words = []
        for c in complaints:
            # Simple tokenization
            clean = re.sub(r'[^a-zA-Z\s]', '', c['text'].lower())
            tokens = [w for w in clean.split() if len(w) > 3 and w not in self.STOPWORDS]
            words.extend(tokens)
            
        counts = Counter(words)
        return [word for word, count in counts.most_common(5)]

    def _get_location_summary(self, complaints: List[Dict]) -> Dict:
        wards = [c.get('ward') for c in complaints if c.get('ward')]
        locations = [c.get('location') for c in complaints if c.get('location')]
        
        all_locs = sorted(list(set(wards + locations)))
        
        # Simple heuristic: most common ward or first location
        ward_counts = Counter(wards)
        primary = ward_counts.most_common(1)[0][0] if wards else (locations[0] if locations else "Unknown Location")
        
        return {
            "primary_location": primary,
            "all_locations": all_locs
        }

    def _get_dominant_category(self, complaints: List[Dict]) -> str:
        categories = [c.get('category') for c in complaints if c.get('category')]
        if not categories:
            return "General"
        return Counter(categories).most_common(1)[0][0]
