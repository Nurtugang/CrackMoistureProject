# crack_classification_pipeline.py
"""Simple Building Crack Classification Pipeline"""

import cv2
import base64
import requests
import numpy as np
from pathlib import Path

def classify_crack(image_input):
    """
    Classify crack in image using Roboflow direct HTTP
    
    Args:
        image_input: Can be file path or numpy array
    
    Returns:
        Dict with classification results
    """
    try:
        # Convert input to image array
        if isinstance(image_input, (str, Path)):
            # File path
            img = cv2.imread(str(image_input))
        elif isinstance(image_input, np.ndarray):
            # Numpy array
            img = image_input
        else:
            raise ValueError("Unsupported image input type")
        
        if img is None:
            raise ValueError("Could not read image")
        
        # Convert to base64 - ТОЧНО как в рабочем коде
        retval, buffer = cv2.imencode('.jpg', img)
        img_str = base64.b64encode(buffer)
        
        # Roboflow API call
        url = "https://detect.roboflow.com/crackclassification/1"
        params = {"api_key": "X4Xar6Q7oAP00zWzQBET"}
        
        response = requests.post(
            url,
            params=params,
            data=img_str,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30
        )
        
        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")
            
        result = response.json()
        
        # Map classes to our format
        class_mapping = {
            'Categories 0,1&2 (Aesthetic)': {
                'category': 'Aesthetic',
                'severity': 'Low',
                'description': 'Hairline to fine cracks (≤5mm) - Aesthetic concern only',
                'action_required': 'Monitor for changes',
                'color': '#28a745'
            },
            'Categories 3&4 (Serviceability)': {
                'category': 'Serviceability', 
                'severity': 'Medium',
                'description': 'Moderate cracks (5-25mm) - May affect serviceability',
                'action_required': 'Inspect and repair recommended',
                'color': '#ffc107'
            },
            'Category 5 (Stability)': {
                'category': 'Stability',
                'severity': 'High', 
                'description': 'Large cracks (>25mm) - Structural stability concern',
                'action_required': 'Immediate professional assessment required',
                'color': '#dc3545'
            }
        }
        
        # Get the top prediction
        top_class = result.get('top', '')
        confidence = result.get('confidence', 0.0)
        
        # Map to our format
        category_info = class_mapping.get(top_class, {
            'category': 'Unknown',
            'severity': 'Unknown',
            'description': 'Classification uncertain',
            'action_required': 'Manual inspection recommended',
            'color': '#6c757d'
        })
        
        return {
            'success': True,
            'classification': {
                'raw_class': top_class,
                'category': category_info['category'],
                'severity': category_info['severity'],
                'description': category_info['description'],
                'action_required': category_info['action_required'],
                'color': category_info['color']
            },
            'confidence': round(confidence, 3),
            'raw_result': result
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'classification': None,
            'confidence': 0.0
        }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python crack_classification_pipeline.py <image_path>")
        sys.exit(1)
    
    result = classify_crack(sys.argv[1])
    print(result)