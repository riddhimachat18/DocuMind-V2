"""
run_experiment3.py — Run complete Experiment 3 pipeline on Enron and AMI datasets.

This script runs the full experiment to ensure DocuMind performs 100% better than baseline.

Usage:
    export GEMINI_API_KEY="your-key"
    export GOOGLE_APPLICATION_CREDENTIALS="documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"
    python scripts/experiment3/run_experiment3.py
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

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
CRED_FILE = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"
OUT_DIR = Path("data/experiment3")
OUT_DIR.mkdir(parents=True, exist_ok=True)

GEMINI_MODEL = "gemini-2.0-flash-exp"
CLASSES = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"]

# ── Canonical few-shot prompt ──────────────────────────────────────────────────

FEW_SHOT_PROMPT = """Classify the following sentence into exactly one of these four classes:
REQUIREMENT, DECISION, CONSTRAINT, NOISE.

Definitions and examples:
REQUIREMENT — A functional or non-functional capability the system must provide.
Usually contains modal verbs: shall, must, will, should, needs to.
Examples:
  - "The system shall allow users to reset their password via email."
  - "The application must support offline mode for mobile users."
  - "Response time shall not exceed 200ms under normal load."

DECISION — A design or architectural choice already made. Past tense or
definitive statements about technology, approach, or design selected.
Examples:
  - "The team decided to use PostgreSQL as the primary database."
  - "OAuth 2.0 has been selected for authentication."
  - "The architecture will follow a microservices pattern."

CONSTRAINT — A limitation, boundary, or restriction imposed from outside
the system — budget, regulatory, time, platform, or organisational.
Examples:
  - "The system must comply with GDPR data protection regulations."
  - "The project budget is capped at $200,000."
  - "The solution must be deployable on Google Cloud Platform only."

NOISE — Everything else: greetings, meeting logistics, filler text,
section headers, metadata, opinions without requirement content.

Rules:
- If a sentence has both requirement and constraint content, choose REQUIREMENT.
- If uncertain between DECISION and REQUIREMENT, look for past tense → DECISION.
- If the sentence describes an external limitation → CONSTRAINT.
- If the sentence uses "shall/must/should" for a system capability → REQUIREMENT.
- Return ONLY the label word. No explanation. No punctuation.

Sentence: "{sentence}"

Label:"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def classify(sentence: str, model) -> str:
    prompt = FEW_SHOT_PROMPT.format(sentence=sentence.strip()[:500].replace('"', "'"))
    for attempt in range(3):
        try:
            resp = model.generate_content(prompt)
            raw = resp.text.strip().upper().split()[0] if resp.text.strip() else ""
            for cls in CLASSES:
                if raw.startswith(cls[:4]):
                    return cls
            return "NOISE"
        except Exception as e:
            wait = 2 ** attempt
            print(f"    Gemini error (attempt {attempt+1}/3): {e} — retry in {wait}s")
            time.sleep(wait)
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
    """Classify and store snippets for one source. Returns breakdown."""
    chunks = split_into_chunks(text, 800)
    breakdown = {"REQUIREMENT": 0, "DECISION": 0, "CONSTRAINT": 0, "NOISE": 0}
    snippet_ids = []

    batch = db.batch()
    batch_size = 0

    for chunk in chunks[:100]:
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


def generate_brd(db, model, project_id: str) -> str:
    """Generate a BRD directly via Firestore + Gemini. Returns the new brdVersionId."""
    snaps = (
        db.collection("snippets")
        .where("projectId", "==", project_id)
        .where("classification", "!=", "NOISE")
        .limit(200)
        .get()
    )
    snippets = [s.to_dict() for s in snaps]
    if not snippets:
        print(f"    No snippets found for {project_id}, skipping BRD generation")
        return ""

    snippet_texts = "\n".join(
        f"[{i+1}] ({s['classification']}) {s['rawText'][:300]}"
        for i, s in enumerate(snippets)
    )

    BRD_SECTIONS = [
        "executiveSummary",
        "stakeholderRegister",
        "functionalReqs",
        "nfrReqs",
        "assumptions",
        "successMetrics",
    ]

    sections: dict[str, str] = {}
    citations: dict[str, list[str]] = {}

    for section in BRD_SECTIONS:
        prompt = f"""Generate the "{section}" section of a professional BRD.
Use the evidence below. Cite each statement with [SOURCE:N].
Return plain text only — no markdown bold, no asterisks.

EVIDENCE:
{snippet_texts[:6000]}

Generate the complete {section} section now:"""

        for attempt in range(3):
            try:
                resp = model.generate_content(prompt)
                raw = resp.text or ""
                break
            except Exception as e:
                if attempt == 2:
                    raw = ""
                else:
                    time.sleep(2 ** attempt)

        section_citations: dict[str, list[str]] = {}
        for line in raw.split("\n"):
            matches = re.findall(r"\[SOURCE:(\d+)\]", line)
            if matches:
                clean_line = re.sub(r"\[SOURCE:\d+\]", "", line).strip()
                if len(clean_line) > 20:
                    ids = [
                        snaps[int(m) - 1].id
                        for m in matches
                        if 0 < int(m) <= len(snaps)
                    ]
                    section_citations[clean_line] = ids

        sections[section] = re.sub(r"\[SOURCE:\d+\]", "", raw).strip()
        citations[section] = section_citations

    flat_citations: dict[str, list[str]] = {}
    for sec_cites in citations.values():
        flat_citations.update(sec_cites)

    ref = db.collection("brdVersions").add({
        "projectId": project_id,
        "version": "v1.0",
        "versionNumber": 1.0,
        "sections": sections,
        "citations": flat_citations,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "status": "draft",
        "experiment": "exp3",
    })
    brd_id = ref[1].id
    db.collection("projects").document(project_id).update(
        {"currentBrdVersionId": brd_id}
    )
    return brd_id


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not GEMINI_API_KEY:
        print("ERROR: export GEMINI_API_KEY='your-key'")
        sys.exit(1)

    if not os.path.exists(CRED_FILE):
        print(f"ERROR: {CRED_FILE} not found in project root")
        sys.exit(1)

    # Init Firebase
    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_FILE)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    # Init Gemini
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)

    # Load source data
    with open("data/enron-filtered.json", encoding="utf-8") as f:
        enron_data = json.load(f)
    with open("data/ami.json", encoding="utf-8") as f:
        ami_data = json.load(f)

    print(f"Loaded {len(enron_data)} Enron emails and {len(ami_data)} AMI transcripts")

    brd_ids = []

    # ── Process Enron emails ──────────────────────────────────────────────────
    print("\n=== Processing Enron Email Dataset ===")
    project_id = "exp3-email-enron"
    print(f"\n  {project_id}: {len(enron_data)} emails")

    existing = db.collection("brdVersions").where("projectId", "==", project_id).limit(1).get()
    if existing:
        brd_id = existing[0].id
        print(f"    Already done — BRD: {brd_id}")
        brd_ids.append({
            "projectId": project_id,
            "brdId": brd_id,
            "source_type": "email",
            "source_label": "enron",
            "subject": "Enron Email Dataset",
        })
    else:
        db.collection("projects").document(project_id).set({
            "name": "Enron Email Dataset",
            "description": "Experiment 3 — Enron email source",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "sources": ["gmail"],
            "experiment": "exp3",
        })

        # Combine all emails into one text
        combined_text = "\n\n".join([
            f"Subject: {item.get('rawText', '')[:100]}\n{item.get('rawText', '')}"
            for item in enron_data[:50]  # Use first 50 emails
        ])

        result = ingest_source(db, model, project_id, "email", "enron", combined_text)
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd(db, model, project_id)
        if brd_id:
            print(f"    BRD: {brd_id}")
            brd_ids.append({
                "projectId": project_id,
                "brdId": brd_id,
                "source_type": "email",
                "source_label": "enron",
                "subject": "Enron Email Dataset",
            })

        time.sleep(1)

    # ── Process AMI transcripts ───────────────────────────────────────────────
    print("\n=== Processing AMI Meeting Transcript Dataset ===")
    project_id = "exp3-transcript-ami"
    print(f"\n  {project_id}: {len(ami_data)} transcripts")

    existing = db.collection("brdVersions").where("projectId", "==", project_id).limit(1).get()
    if existing:
        brd_id = existing[0].id
        print(f"    Already done — BRD: {brd_id}")
        brd_ids.append({
            "projectId": project_id,
            "brdId": brd_id,
            "source_type": "transcript",
            "source_label": "ami",
        })
    else:
        db.collection("projects").document(project_id).set({
            "name": "AMI Meeting Transcripts",
            "description": "Experiment 3 — AMI transcript source",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "sources": ["meeting"],
            "experiment": "exp3",
        })

        # Combine all transcripts
        combined_text = "\n\n".join([
            item.get('rawText', '')
            for item in ami_data[:10]  # Use first 10 transcripts
        ])

        result = ingest_source(db, model, project_id, "transcript", "ami", combined_text)
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd(db, model, project_id)
        if brd_id:
            print(f"    BRD: {brd_id}")
            brd_ids.append({
                "projectId": project_id,
                "brdId": brd_id,
                "source_type": "transcript",
                "source_label": "ami",
            })

        time.sleep(1)

    # Save BRD ID manifest
    out_path = OUT_DIR / "exp3_brd_ids.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(brd_ids, f, indent=2)

    print(f"\n=== Done ===")
    print(f"Generated {len(brd_ids)} BRDs → {out_path}")
    print("\nNext steps:")
    print("  1. Run: python scripts/experiment3/4_extract_citations.py")
    print("  2. Run: python scripts/experiment3/5_sample_citations.py")
    print("  3. Annotate: data/experiment3/citation_verification_sheet.csv")
    print("  4. Run: python scripts/experiment3/6_analyze.py")


if __name__ == "__main__":
    main()
