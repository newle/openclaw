
import sys
import json
import torch
from transformers import AutoImageProcessor, AutoModel
from PIL import Image
from sklearn.metrics.pairwise import cosine_similarity
import os
import logging

# Suppress warnings
logging.getLogger("transformers").setLevel(logging.ERROR)

def load_model(device):
    local_quantized_path = "dinov2_small_quantized"
    model_name = 'facebook/dinov2-small'
    
    # Check if quantized model exists locally
    if os.path.exists(local_quantized_path) and os.path.exists(os.path.join(local_quantized_path, "pytorch_model.bin")):
        try:
            # Load processor from local
            processor = AutoImageProcessor.from_pretrained(local_quantized_path)
            
            # To load a dynamically quantized model state_dict, we need to:
            # 1. Create original model structure
            # 2. Apply quantization structure
            # 3. Load weights
            
            # Note: For dynamic quantization, we need to set the engine
            torch.backends.quantized.engine = 'qnnpack'
            
            model = AutoModel.from_pretrained(model_name)
            model = torch.quantization.quantize_dynamic(
                model, 
                {torch.nn.Linear}, 
                dtype=torch.qint8
            )
            
            # Load the quantized weights
            state_dict = torch.load(os.path.join(local_quantized_path, "pytorch_model.bin"), map_location=device)
            model.load_state_dict(state_dict)
            model.to(device)
            
            # sys.stderr.write("Loaded quantized model.\n")
            return processor, model
        except Exception as e:
            sys.stderr.write(f"Failed to load quantized model, falling back to original: {e}\n")
    
    # Fallback to original
    processor = AutoImageProcessor.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name).to(device)
    return processor, model

def extract_features(image_path, processor, model, device):
    try:
        image = Image.open(image_path).convert('RGB')
        with torch.no_grad():
            inputs = processor(images=image, return_tensors='pt').to(device)
            outputs = model(**inputs)
            # Use the CLS token (first token) or mean pooling
            # DINOv2 usually uses CLS token for classification/retrieval
            features = outputs.last_hidden_state[:, 0, :] 
            # features = outputs.last_hidden_state.mean(dim=1) # Alternative
        return features.cpu()
    except Exception as e:
        sys.stderr.write(f"Error processing {image_path}: {e}\n")
        return None

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python dinov2_match.py <img1> <img2>"}))
        sys.exit(1)

    img1_path = sys.argv[1]
    img2_path = sys.argv[2]

    try:
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        processor, model = load_model(device)

        feat1 = extract_features(img1_path, processor, model, device)
        feat2 = extract_features(img2_path, processor, model, device)

        if feat1 is None or feat2 is None:
            print(json.dumps({"error": "Failed to extract features"}))
            sys.exit(1)

        # Calculate cosine similarity
        similarity = cosine_similarity(feat1, feat2)[0][0]
        
        # Convert to float for JSON serialization
        score = float(similarity)
        
        # Normalize to 0-1 if it's not (cosine is -1 to 1, but DINO features are usually positive correlated)
        # However, we can just clamp or rescale if needed.
        # For now, raw cosine similarity is fine.
        
        print(json.dumps({
            "score": score,
            "device": str(device)
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
