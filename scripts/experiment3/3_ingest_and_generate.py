"""
3_ingest_and_generate.py — Seed snippets into Firestore and generate BRDs
for all 20 sources (10 Enron email threads + 10 AMI transcripts).

For each source:
  1. Create a Firestore project document
  2. Classify each chunk with the canonical few-shot Gemini prompt
  3. Store non-NOISE snippets in Firestore (snippets collection)
  4. Call generateBrd via the Firebase callable function
  5. Record the resulting brdVersionId in exp3_brd_ids.json

Reads from:
    data/experiment3/enron_threads.json
    data/experiment3/ami_transcripts.json

Writes to:
    data/experiment3/exp3_brd_ids.json   ← input for step 4

Prerequisites:
    export GEMINI_API_KEY="..."
    export GOOGLE_APPLICATION_CREDENTIALS="documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"

Usage:
    python3 scripts/experiment3/3_ingest_and_generate.py
"""

import json
import os
import sys
import time
import re
from pathlib import Path

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

GEMINI_MODEL = "gemini-2.5-flash"
CLASSES = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"]

# ── Canonical few-shot prompt (from 4_evaluate.py — 0.824 macro-F1) ──────────

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
  - "Access to the database will be via the training application rather than the production application."
  - "The system will use a three-tier architecture."
  - "It was agreed that React will be used for the frontend."
CONSTRAINT — A limitation, boundary, or restriction imposed from outside
the system — budget, regulatory, time, platform, or organisational.
Examples:
  - "The system must comply with GDPR data protection regulations."
  - "The project budget is capped at $200,000."
  - "The solution must be deployable on Google Cloud Platform only."
  - "Development must be completed by Q3 2024."
  - "Access to the DBMS may only be via the training application, not the production system."
  - "The system is limited to operating within the existing network infrastructure."
  - "Only approved third-party libraries may be used."
NOISE — Everything else: greetings, meeting logistics, filler text,
section headers, metadata, opinions without requirement content.
Examples:
  - "Please find the agenda attached."
  - "This document was last updated on March 2023."
  - "The following section describes the system overview."
  - "Thank you for your participation."
Rules:
- If a sentence has both requirement and constraint content, choose REQUIREMENT.
- If uncertain between DECISION and REQUIREMENT, look for past tense or "will be/has been selected/decided/agreed" → DECISION.
- If the sentence describes an external limitation or boundary NOT under the system's control → CONSTRAINT.
- If the sentence uses "shall/must/should" for a system capability → REQUIREMENT.
- Non-requirements from the original dataset can be CONSTRAINT, DECISION, or NOISE.
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


def ingest_source(
    db,
    model,
    project_id: str,
    source_type: str,
    source_label: str,
    text: str,
) -> dict:
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
            "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            "experiment": "exp3",
        })
        snippet_ids.append(ref.id)
        batch_size += 1

        # Firestore batch limit is 500
        if batch_size >= 400:
            batch.commit()
            batch = db.batch()
            batch_size = 0

    if batch_size > 0:
        batch.commit()

    return {"breakdown": breakdown, "snippet_count": len(snippet_ids)}


def generate_brd(db, model, project_id: str) -> str:
    """
    Generate a BRD directly via Firestore + Gemini (bypasses the HTTP callable
    so we can run this script without a live frontend session).
    Returns the new brdVersionId.
    """
    # Fetch all non-NOISE snippets for this project
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

        # Extract citations: sentence → [snippet indices]
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
        citations[section] = section_citations  # type: ignore

    # Flatten citations to sentence → [snippet_ids] for extract_citations.py
    flat_citations: dict[str, list[str]] = {}
    for sec_cites in citations.values():
        flat_citations.update(sec_cites)

    # Write BRD version to Firestore
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
    with open(OUT_DIR / "enron_threads.json", encoding="utf-8") as f:
        enron_threads = json.load(f)
    with open(OUT_DIR / "ami_transcripts.json", encoding="utf-8") as f:
        ami_transcripts = json.load(f)

    brd_ids = []

    # ── Enron email threads ───────────────────────────────────────────────────
    print("\n=== Ingesting Enron threads ===")
    for thread in enron_threads:
        project_id = f"exp3-email-{thread['thread_id']}"
        print(f"\n  {project_id}: {thread['subject'][:50]}")

        # Skip if already completed in a previous run
        existing = db.collection("brdVersions") \
            .where("projectId", "==", project_id) \
            .limit(1).get()
        if existing:
            brd_id = existing[0].id
            print(f"    Already done — BRD: {brd_id}")
            brd_ids.append({
                "projectId": project_id,
                "brdId": brd_id,
                "source_type": "email",
                "source_label": thread["thread_id"],
                "subject": thread["subject"],
            })
            continue

        db.collection("projects").document(project_id).set({
            "name": f"Enron: {thread['subject'][:60]}",
            "description": "Experiment 3 — email source",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "sources": ["gmail"],
            "experiment": "exp3",
        })

        text = f"Subject: {thread['subject']}\n\n{thread['body']}"
        result = ingest_source(db, model, project_id, "email", thread["thread_id"], text)
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd(db, model, project_id)
        if brd_id:
            print(f"    BRD: {brd_id}")
            brd_ids.append({
                "projectId": project_id,
                "brdId": brd_id,
                "source_type": "email",
                "source_label": thread["thread_id"],
                "subject": thread["subject"],
            })

        time.sleep(1)

    # ── AMI transcripts ───────────────────────────────────────────────────────
    print("\n=== Ingesting AMI transcripts ===")
    for meeting in ami_transcripts:
        project_id = f"exp3-transcript-{meeting['meeting_id']}"
        print(f"\n  {project_id}: {meeting.get('word_count', meeting.get('utterance_count', '?'))} words")

        # Skip if already completed in a previous run
        existing = db.collection("brdVersions") \
            .where("projectId", "==", project_id) \
            .limit(1).get()
        if existing:
            brd_id = existing[0].id
            print(f"    Already done — BRD: {brd_id}")
            brd_ids.append({
                "projectId": project_id,
                "brdId": brd_id,
                "source_type": "transcript",
                "source_label": meeting["meeting_id"],
            })
            continue

        db.collection("projects").document(project_id).set({
            "name": f"AMI: {meeting['meeting_id']}",
            "description": "Experiment 3 — transcript source",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "sources": ["meeting"],
            "experiment": "exp3",
        })

        result = ingest_source(
            db, model, project_id, "transcript", meeting["meeting_id"], meeting["transcript"]
        )
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd(db, model, project_id)
        if brd_id:
            print(f"    BRD: {brd_id}")
            brd_ids.append({
                "projectId": project_id,
                "brdId": brd_id,
                "source_type": "transcript",
                "source_label": meeting["meeting_id"],
            })

        time.sleep(1)

    # Save BRD ID manifest
    out_path = OUT_DIR / "exp3_brd_ids.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(brd_ids, f, indent=2)

    print(f"\n=== Done ===")
    print(f"Generated {len(brd_ids)} BRDs → {out_path}")


if __name__ == "__main__":
    main()
