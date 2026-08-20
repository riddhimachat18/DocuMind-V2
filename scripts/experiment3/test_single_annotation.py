"""Test single annotation to debug"""

import os
import firebase_admin
from firebase_admin import credentials, firestore
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

SERVICE_ACCOUNT_PATH = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")

if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()
genai.configure(api_key=GEMINI_API_KEY)

# Test with first sentence
brd_id = "7pr9rpwHRmu27bdWS1VE"
sentence = "FR-001: The system shall provide the last change of hands date for Chelsea Villa."

print(f"BRD: {brd_id}")
print(f"Sentence: {sentence}\n")

# Fetch BRD
brd_ref = db.collection('brdVersions').document(brd_id)
brd_doc = brd_ref.get()
brd_data = brd_doc.to_dict()
citations = brd_data.get('citations', {})

# Get snippet IDs
snippet_ids = citations.get(sentence, [])
print(f"Snippet IDs: {snippet_ids}\n")

# Fetch snippets
for snippet_id in snippet_ids:
    snippet_ref = db.collection('snippets').document(snippet_id)
    snippet_doc = snippet_ref.get()
    if snippet_doc.exists:
        snippet_data = snippet_doc.to_dict()
        text = snippet_data.get('text', '')
        print(f"Source snippet:\n{text}\n")
        
        # Test annotation
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = f"""Does this source snippet support this BRD sentence?

BRD Sentence: "{sentence}"

Source Snippet: "{text}"

Answer with SUPPORTS, PARTIALLY, or DOES_NOT_SUPPORT and explain why."""
        
        response = model.generate_content(prompt)
        print(f"Gemini response:\n{response.text}")
