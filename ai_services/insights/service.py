from typing import List, Dict
from .clusterer import ComplaintClusterer
from .analyzer import InsightAnalyzer

class InsightService:
    """
    High-level service API for generating insights from complaints.
    """
    
    def __init__(self):
        self.clusterer = ComplaintClusterer()
        self.analyzer = InsightAnalyzer()

    def generate_insights(self, complaints: List[Dict]) -> List[Dict]:
        """
        Main entry point for generating descriptive insights.
        """
        if not complaints or len(complaints) < 2:
            return []
            
        # 1. Cluster complaints
        clusters = self.clusterer.cluster_complaints(complaints)
        
        # 2. Analyze clusters and generate insights
        insights = self.analyzer.analyze_clusters(clusters)
        
        # Sort by support count (strongest patterns first)
        insights.sort(key=lambda x: x['support_count'], reverse=True)
        
        return insights

# Singleton instance
insight_service = InsightService()

def get_insights(complaints: List[Dict]) -> List[Dict]:
    """Helper function for external modules."""
    return insight_service.generate_insights(complaints)
