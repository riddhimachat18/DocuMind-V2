"""Test script to check BRD structure in Firestore"""

import firebase_admin
from firebase_admin import credentials, firestore
from pathlib import Path

SERVICE_ACCOUNT_PATH = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Test with first BRD
brd_id = "7pr9rpwHRmu27bdWS1VE"

print(f"Fetching BRD: {brd_id}")
brd_ref = db.collection('brdVersions').document(brd_id)
brd_doc = brd_ref.get()

if brd_doc.exists:
    data = brd_doc.to_dict()
    print(f"\nProject ID: {data.get('projectId')}")
    print(f"\nFunctional Reqs (first 3):")
    fr = data.get('functionalReqs', [])
    for i, req in enumerate(fr[:3]):
        print(f"\n{i+1}. {req}")
    
    print(f"\nCitations map (first 10):")
    citations = data.get('citations', {})
    for i, (key, val) in enumerate(list(citations.items())[:10]):
        print(f"  {key}: {val}")
else:
    print("BRD not found!")
