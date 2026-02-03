
import sys
import json
import torch
from transformers import AutoImageProcessor, AutoModel
from PIL import Image
from sklearn.metrics.pairwise import cosine_similarity
import logging
import os

# Suppress warnings
logging.getLogger("transformers").setLevel(logging.ERROR)

def load_model(device):
    local_quantized_path = "dinov2_small_quantized"
    model_name = 'facebook/dinov2-small'
    
    if os.path.exists(local_quantized_path) and os.path.exists(os.path.join(local_quantized_path, "pytorch_model.bin")):
        try:
            processor = AutoImageProcessor.from_pretrained(local_quantized_path)
            torch.backends.quantized.engine = 'qnnpack'
            model = AutoModel.from_pretrained(model_name)
            model = torch.quantization.quantize_dynamic(
                model, 
                {torch.nn.Linear}, 
                dtype=torch.qint8
            )
            state_dict = torch.load(os.path.join(local_quantized_path, "pytorch_model.bin"), map_location=device)
            model.load_state_dict(state_dict)
            model.to(device)
            return processor, model
        except Exception as e:
            sys.stderr.write(f"Failed to load quantized model: {e}\n")
    
    processor = AutoImageProcessor.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name).to(device)
    return processor, model

def extract_features_batch(image_paths, processor, model, device):
    features_list = []
    valid_indices = []
    
    for idx, image_path in enumerate(image_paths):
        try:
            image = Image.open(image_path).convert('RGB')
            with torch.no_grad():
                inputs = processor(images=image, return_tensors='pt').to(device)
                outputs = model(**inputs)
                # Use CLS token
                features = outputs.last_hidden_state[:, 0, :]
                features_list.append(features.cpu())
                valid_indices.append(idx)
        except Exception as e:
            sys.stderr.write(f"Error processing {image_path}: {e}\n")
    
    if not features_list:
        return None, []
        
    return torch.cat(features_list), valid_indices

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python dinov2_matrix.py <img1> <img2> ..."}))
        sys.exit(1)

    image_paths = sys.argv[1:]

    try:
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        processor, model = load_model(device)

        features, valid_indices = extract_features_batch(image_paths, processor, model, device)

        if features is None:
            print(json.dumps({"error": "Failed to extract features from any image"}))
            sys.exit(1)

        # Calculate cosine similarity matrix
        # features is (N, D)
        # similarity will be (N, N)
        similarity_matrix = cosine_similarity(features, features)
        
        # Map back to original paths (some might have failed)
        result = {
            "matrix": similarity_matrix.tolist(),
            "paths": [image_paths[i] for i in valid_indices]
        }
        
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
