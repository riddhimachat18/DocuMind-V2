"""List available Gemini models."""
import os
import google.generativeai as genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyCTefcnMSgje3n6e7Vq4aeMPOZzqgabOpw")
genai.configure(api_key=GEMINI_API_KEY)

print("Available Gemini models:")
for model in genai.list_models():
    if 'generateContent' in model.supported_generation_methods:
        print(f"  - {model.name}")
