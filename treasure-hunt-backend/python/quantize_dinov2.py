
import torch
from transformers import AutoImageProcessor, AutoModel
import os
import sys

def quantize_model():
    model_name = 'facebook/dinov2-small'
    print(f"Loading {model_name}...")
    
    # 1. Load original model
    model = AutoModel.from_pretrained(model_name)
    processor = AutoImageProcessor.from_pretrained(model_name)
    
    print("Original model loaded.")
    
    # Set quantization engine for ARM64/x86 compatibility
    torch.backends.quantized.engine = 'qnnpack'
    
    # 2. Apply Dynamic Quantization
    # This quantizes nn.Linear layers to qint8
    quantized_model = torch.quantization.quantize_dynamic(
        model, 
        {torch.nn.Linear}, 
        dtype=torch.qint8
    )
    
    print("Model quantized.")
    
    # 3. Save quantized model
    save_dir = "dinov2_small_quantized"
    os.makedirs(save_dir, exist_ok=True)
    
    # Save the state dict
    torch.save(quantized_model.state_dict(), os.path.join(save_dir, "pytorch_model.bin"))
    # Save config and processor
    model.config.save_pretrained(save_dir)
    processor.save_pretrained(save_dir)
    
    print(f"Quantized model saved to {save_dir}")
    
    # 4. Compare sizes
    original_size = 0
    # Estimate original size from parameters
    for param in model.parameters():
        original_size += param.nelement() * param.element_size()
    
    quantized_size = os.path.getsize(os.path.join(save_dir, "pytorch_model.bin"))
    
    print(f"Original Model Size (Approx in memory): {original_size / 1024 / 1024:.2f} MB")
    print(f"Quantized Model Size (Disk): {quantized_size / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    quantize_model()
