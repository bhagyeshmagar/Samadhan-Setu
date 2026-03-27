import sys
import os

# Add relevant paths to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from ai_services.insights.service import get_insights

def test_clustering():
    print("Starting Clustering Verification...")
    
    mock_complaints = [
        # Cluster 1: Water leaks in Ward 5
        {"id": 1, "text": "Huge water leakage near the market area in Ward 5", "ward": "Ward 5", "category": "Water Supply"},
        {"id": 2, "text": "Water is flooding the road since morning near Ward 5 market", "ward": "Ward 5", "category": "Water Supply"},
        {"id": 3, "text": "Pipe burst in Ward 5 near market, water wasting", "ward": "Ward 5", "category": "Water Supply"},
        
        # Cluster 2: Garbage in Ward 2
        {"id": 4, "text": "Garbage not collected for 3 days in Ward 2", "ward": "Ward 2", "category": "Sanitation & Waste"},
        {"id": 5, "text": "Stinking trash piled up near the park in Ward 2", "ward": "Ward 2", "category": "Sanitation & Waste"},
        
        # Isolated issue
        {"id": 6, "text": "Street light not working in Ward 10", "ward": "Ward 10", "category": "Electricity"}
    ]
    
    print(f"Feeding {len(mock_complaints)} complaints to the system...")
    insights = get_insights(mock_complaints)
    
    print("\nGenerated Insights:")
    for i, insight in enumerate(insights):
        print(f"\n[{i+1}] {insight['insight_name']}")
        print(f"    - Category: {insight['category']}")
        print(f"    - Support Count: {insight['support_count']}")
        print(f"    - Locations: {', '.join(insight['locations'])}")
        print(f"    - Keywords: {', '.join(insight['top_keywords'])}")
        print(f"    - IDs: {insight['complaint_ids']}")

    # Basic Assertions
    assert len(insights) >= 2, "Should have identified at least 2 clusters"
    assert insights[0]['support_count'] == 3, "First cluster should have 3 complaints (Water)"
    assert any(k in ["water", "leakage", "leak"] for k in insights[0]['top_keywords']), "Key words missing"
    
    print("\nVerification Successful!")

if __name__ == "__main__":
    try:
        test_clustering()
    except Exception as e:
        print(f"\nVerification Failed: {str(e)}")
        import traceback
        traceback.print_exc()
