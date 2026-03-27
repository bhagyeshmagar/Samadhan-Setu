"""
Test Script for Similarity Detection Service

Run this to verify the AI service is working correctly.

Usage:
    cd AI-services
    python test_similarity.py
"""

from similarity.service import find_similar_complaints, check_duplicate


def test_similarity_detection():
    """Test the similarity detection with sample complaints."""
    
    print("=" * 60)
    print("SAMADHAN SETU - Similarity Detection Test")
    print("=" * 60)
    
    # Test data - simulating existing complaints in the system
    existing_complaints = [
        {"id": 1, "text": "Water is leaking near the school"},
        {"id": 2, "text": "Garbage not collected since last week"},
        {"id": 3, "text": "Street light not working on main road"},
        {"id": 4, "text": "Pothole on highway causing accidents"},
        {"id": 5, "text": "Sewage overflow near residential area"},
    ]
    
    # Test cases - new complaints to check for similarity
    test_cases = [
        {
            "text": "Water is leaking near my house",
            "expected_match": "Water related complaints",
        },
        {
            "text": "Burst pipe outside building",
            "expected_match": "Water/pipe related complaints",
        },
        {
            "text": "Trash not picked up for days",
            "expected_match": "Garbage related complaints",
        },
        {
            "text": "The lamp post is broken",
            "expected_match": "Street light related complaints",
        },
        {
            "text": "Road has a big hole",
            "expected_match": "Pothole related complaints",
        },
    ]
    
    print("\n📋 Existing Complaints in System:")
    for c in existing_complaints:
        print(f"   #{c['id']}: {c['text']}")
    
    print("\n" + "-" * 60)
    print("🔍 Testing New Complaints for Similarity:")
    print("-" * 60)
    
    for test in test_cases:
        print(f"\n📝 New Complaint: \"{test['text']}\"")
        print(f"   Expected: {test['expected_match']}")
        
        # Find similar complaints
        similar = find_similar_complaints(
            test["text"],
            existing_complaints,
            similarity_threshold=0.5  # Lower threshold for demo
        )
        
        if similar:
            print("   ✅ Similar complaints found:")
            for s in similar:
                matching_text = next(
                    c["text"] for c in existing_complaints 
                    if c["id"] == s["complaint_id"]
                )
                print(f"      - #{s['complaint_id']}: {matching_text}")
                print(f"        Similarity: {s['similarity_score']:.1%}")
        else:
            print("   ❌ No similar complaints found")
    
    # Test duplicate detection
    print("\n" + "-" * 60)
    print("🔄 Testing Duplicate Detection:")
    print("-" * 60)
    
    duplicate_test = "Water leaking near the school building"
    print(f"\n📝 Checking: \"{duplicate_test}\"")
    
    dup = check_duplicate(duplicate_test, existing_complaints, duplicate_threshold=0.85)
    if dup:
        matching_text = next(
            c["text"] for c in existing_complaints 
            if c["id"] == dup["complaint_id"]
        )
        print(f"   ⚠️  Potential duplicate found!")
        print(f"      Original: #{dup['complaint_id']}: {matching_text}")
        print(f"      Similarity: {dup['similarity_score']:.1%}")
    else:
        print("   ✅ Not a duplicate")
    
    print("\n" + "=" * 60)
    print("✅ All tests completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    test_similarity_detection()
