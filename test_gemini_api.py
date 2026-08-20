"""
Quick test to verify Gemini API key is working
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key
api_key = os.getenv('VITE_GEMINI_API_KEY')

if not api_key:
    print("❌ ERROR: VITE_GEMINI_API_KEY not found in .env file")
    exit(1)

print(f"✓ API Key found: {api_key[:10]}...{api_key[-4:]}")
print("\nTesting Gemini API connection...")

try:
    import google.generativeai as genai
    
    # Configure API
    genai.configure(api_key=api_key)
    
    # List available models
    print("\nListing available models...")
    models = genai.list_models()
    available_models = [m.name for m in models if 'generateContent' in m.supported_generation_methods]
    
    if not available_models:
        print("❌ No models available for content generation")
        exit(1)
    
    print(f"\nAvailable models: {len(available_models)}")
    for model_name in available_models[:5]:  # Show first 5
        print(f"  - {model_name}")
    
    # Use the first available model
    model_to_use = available_models[0]
    print(f"\nUsing model: {model_to_use}")
    
    model = genai.GenerativeModel(model_to_use)
    response = model.generate_content("Say 'Hello, API is working!' in exactly 5 words.")
    
    print("\n✓ SUCCESS! Gemini API is working")
    print(f"\nTest Response: {response.text}")
    
except ImportError:
    print("\n❌ ERROR: google-generativeai package not installed")
    print("Install with: pip install google-generativeai")
    exit(1)
    
except Exception as e:
    print(f"\n❌ ERROR: API call failed")
    print(f"Error type: {type(e).__name__}")
    print(f"Error message: {str(e)}")
    exit(1)
