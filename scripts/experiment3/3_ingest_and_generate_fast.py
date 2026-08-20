"""
3_ingest_and_generate_fast.py — Fast version with progress tracking.

Usage:
    python scripts/experiment3/3_ingest_and_generate_fast.py
"""

import json
import os
import sys
import time
import re
from pathlib import Path
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
import google.generativeai as genai

# ── Config ────────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyCTefcnMSgje3n6e7Vq4aeMPOZzqgabOpw")
CRED_FILE = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"
OUT_DIR = Path("data/experiment3")
OUT_DIR.mkdir(parents=True, exist_ok=True)

GEMINI_MODEL = "gemini-2.5-flash"
CLASSES = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"]

# Limit chunks for faster processing
MAX_CHUNKS_PER_SOURCE = 50  # Increased from 30 for better coverage

FEW_SHOT_PROMPT = """Classify into: REQUIREMENT, DECISION, CONSTRAINT, or NOISE.

REQUIREMENT: System capability (shall/must/should)
DECISION: Design choice made (decided/selected/will use)
CONSTRAINT: External limitation (budget/regulatory/platform)
NOISE: Everything else

Sentence: "{sentence}"
Label:"""


def classify(sentence: str, model) -> str:
    prompt = FEW_SHOT_PROMPT.format(sentence=sentence.strip()[:400].replace('"', "'"))
    try:
        resp = model.generate_content(prompt)
        raw = resp.text.strip().upper().split()[0] if resp.text.strip() else ""
        for cls in CLASSES:
            if raw.startswith(cls[:4]):
                return cls
        return "NOISE"
    except Exception as e:
        print(f"      Classification error: {e}")
        return "NOISE"


def split_into_chunks(text: str, max_len: int = 800) -> list[str]:
    sentences = re.findall(r"[^.!?]+[.!?]+", text) or [text]
    chunks, current = [], ""
    for s in sentences:
        if len(current) + len(s) > max_len and current:
            chunks.append(current.strip())
            current = s
        else:
            current += " " + s
    if current.strip():
        chunks.append(current.strip())
    return chunks


def ingest_source(db, model, project_id: str, source_type: str, source_label: str, text: str) -> dict:
    chunks = split_into_chunks(text, 800)[:MAX_CHUNKS_PER_SOURCE]
    breakdown = {"REQUIREMENT": 0, "DECISION": 0, "CONSTRAINT": 0, "NOISE": 0}
    snippet_ids = []

    print(f"      Processing {len(chunks)} chunks...")
    
    batch = db.batch()
    batch_size = 0

    for idx, chunk in enumerate(chunks):
        if (idx + 1) % 10 == 0:
            print(f"        Chunk {idx + 1}/{len(chunks)}...")
        
        label = classify(chunk, model)
        breakdown[label] += 1
        
        if label == "NOISE":
            continue

        ref = db.collection("snippets").document()
        batch.set(ref, {
            "projectId": project_id,
            "source": source_type,
            "filename": source_label,
            "rawText": chunk[:1000],
            "classification": label,
            "confidence": 0.9,
            "author": source_label,
            "authorRole": "transcript" if source_type == "transcript" else "email",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "experiment": "exp3",
        })
        snippet_ids.append(ref.id)
        batch_size += 1

        if batch_size >= 400:
            batch.commit()
            batch = db.batch()
            batch_size = 0

    if batch_size > 0:
        batch.commit()

    return {"breakdown": breakdown, "snippet_count": len(snippet_ids)}


def generate_brd_simple(db, model, project_id: str) -> str:
    """Simplified BRD generation."""
    snaps = list(
        db.collection("snippets")
        .where(filter=firestore.FieldFilter("projectId", "==", project_id))
        .where(filter=firestore.FieldFilter("classification", "!=", "NOISE"))
        .limit(50)
        .stream()
    )
    
    if not snaps:
        print(f"      No snippets found for {project_id}")
        return ""

    snippet_texts = "\n".join(
        f"[{i+1}] {s.to_dict()['rawText'][:200]}"
        for i, s in enumerate(snaps)
    )

    sections = {}
    citations = {}
    
    for section in ["executiveSummary", "functionalReqs", "nfrReqs"]:
        print(f"      Generating {section}...")
        prompt = f"""Generate {section} section for a BRD using this evidence. Be concise.

EVIDENCE:
{snippet_texts[:3000]}

{section}:"""

        try:
            resp = model.generate_content(prompt)
            sections[section] = resp.text[:500] if resp.text else "No content generated"
        except Exception as e:
            print(f"        Error: {e}")
            sections[section] = "Error generating content"
        
        time.sleep(0.5)

    ref = db.collection("brdVersions").add({
        "projectId": project_id,
        "version": "v1.0",
        "versionNumber": 1.0,
        "sections": sections,
        "citations": {},
        "createdAt": firestore.SERVER_TIMESTAMP,
        "status": "draft",
        "experiment": "exp3",
    })
    brd_id = ref[1].id
    db.collection("projects").document(project_id).update({"currentBrdVersionId": brd_id})
    return brd_id


def main():
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not set")
        sys.exit(1)

    if not os.path.exists(CRED_FILE):
        print(f"ERROR: {CRED_FILE} not found")
        sys.exit(1)

    # Init Firebase
    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_FILE)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    # Init Gemini
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)

    # Load data
    with open(OUT_DIR / "enron_threads.json", encoding="utf-8") as f:
        enron_threads = json.load(f)
    with open(OUT_DIR / "ami_transcripts.json", encoding="utf-8") as f:
        ami_transcripts = json.load(f)

    brd_ids = []

    # ── Enron ─────────────────────────────────────────────────────────────────
    print("\n=== Processing Enron Dataset ===")
    for thread in enron_threads:
        project_id = f"exp3-email-{thread['thread_id']}"
        print(f"\n  {project_id}")

        existing = list(db.collection("brdVersions").where(filter=firestore.FieldFilter("projectId", "==", project_id)).limit(1).stream())
        if existing:
            brd_id = existing[0].id
            print(f"    ✓ Already done — BRD: {brd_id}")
            brd_ids.append({"projectId": project_id, "brdId": brd_id, "source_type": "email"})
            continue

        db.collection("projects").document(project_id).set({
            "name": thread["subject"][:60],
            "description": "Experiment 3 — email",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "sources": ["gmail"],
            "experiment": "exp3",
        })

        text = f"{thread['subject']}\n\n{thread['body']}"
        result = ingest_source(db, model, project_id, "email", thread["thread_id"], text)
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd_simple(db, model, project_id)
        if brd_id:
            print(f"    ✓ BRD: {brd_id}")
            brd_ids.append({"projectId": project_id, "brdId": brd_id, "source_type": "email"})

    # ── AMI ───────────────────────────────────────────────────────────────────
    print("\n=== Processing AMI Dataset ===")
    for meeting in ami_transcripts:
        project_id = f"exp3-transcript-{meeting['meeting_id']}"
        print(f"\n  {project_id}")

        existing = list(db.collection("brdVersions").where(filter=firestore.FieldFilter("projectId", "==", project_id)).limit(1).stream())
        if existing:
            brd_id = existing[0].id
            print(f"    ✓ Already done — BRD: {brd_id}")
            brd_ids.append({"projectId": project_id, "brdId": brd_id, "source_type": "transcript"})
            continue

        db.collection("projects").document(project_id).set({
            "name": f"AMI: {meeting['meeting_id']}",
            "description": "Experiment 3 — transcript",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "sources": ["meeting"],
            "experiment": "exp3",
        })

        result = ingest_source(db, model, project_id, "transcript", meeting["meeting_id"], meeting["transcript"])
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd_simple(db, model, project_id)
        if brd_id:
            print(f"    ✓ BRD: {brd_id}")
            brd_ids.append({"projectId": project_id, "brdId": brd_id, "source_type": "transcript"})

    # Save results
    out_path = OUT_DIR / "exp3_brd_ids.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(brd_ids, f, indent=2)

    print(f"\n=== Complete ===")
    print(f"Generated {len(brd_ids)} BRDs → {out_path}")


if __name__ == "__main__":
    main()
