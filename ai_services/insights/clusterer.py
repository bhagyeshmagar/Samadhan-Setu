from sklearn.cluster import KMeans
import numpy as np
import math
from typing import List, Dict
from ..similarity.embedder import embed_texts

class ComplaintClusterer:
    """
    Handles unsupervised clustering of complaints using SBERT embeddings.
    """
    
    def cluster_complaints(self, complaints: List[Dict]) -> List[Dict]:
        """
        Clusters complaints using K-Means with dynamic K selection.
        
        Logic:
        - K = min(5, ceil(sqrt(n)))
        - Clusters with < 2 items are tagged as "Isolated".
        """
        if not complaints:
            return []
            
        texts = [c['text'] for c in complaints]
        embeddings = embed_texts(texts)
        
        n = len(complaints)
        if n < 2:
            # Single complaint case
            return [{"cluster_id": 0, "complaints": complaints, "is_noise": True}]
            
        # Dynamic K: min(5, ceil(sqrt(n)))
        k = min(5, math.ceil(math.sqrt(n)))
        
        # Run K-Means
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(embeddings)
        
        # Organize results
        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(complaints[idx])
            
        results = []
        for cluster_id, members in clusters.items():
            is_noise = len(members) < 2
            results.append({
                "cluster_id": int(cluster_id),
                "complaints": members,
                "is_noise": is_noise
            })
            
        return results
