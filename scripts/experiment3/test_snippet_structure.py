"""Test to see snippet structure"""

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_PATH = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

snippet_id = "mpcTSsBVpL2E1qZZAM8H"

print(f"Fetching snippet: {snippet_id}\n")
snippet_ref = db.collection('snippets').document(snippet_id)
snippet_doc = snippet_ref.get()

if snippet_doc.exists:
    data = snippet_doc.to_dict()
    print("Snippet fields:")
    for key, value in data.items():
        if isinstance(value, str) and len(value) > 200:
            print(f"  {key}: {value[:200]}...")
        else:
            print(f"  {key}: {value}")
else:
    print("Snippet not found!")
