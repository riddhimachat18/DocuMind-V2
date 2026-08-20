"""
4_ingest_and_generate.py — Ingest 15 selected Enron threads into Firestore
and generate a BRD for each using the canonical few-shot classification prompt.

Same pattern as scripts/experiment3/3_ingest_and_generate.py.
Fully resumable — skips threads that already have a BRD in Firestore.

Reads from:  data/experiment2/selected_threads.json
Writes to:   data/experiment2/exp2_brd_ids.json

Prerequisites:
    export GEMINI_API_KEY="..."
    export GOOGLE_APPLICATION_CREDENTIALS="documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"

Usage:
    python3 scripts/experiment2/4_ingest_and_generate.py
"""

import datetime
import json
import os
import re
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

import firebase_admin
from firebase_admin import credentials, firestore
import google.generativeai as genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
CRED_FILE      = "documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"
OUT_DIR        = Path("data/experiment2")
GEMINI_MODEL   = "gemini-2.5-flash"
CLASSES        = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"]

# ── Canonical few-shot prompt (4_evaluate.py — 0.824 macro-F1) ───────────────

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

BRD_SECTIONS = [
    "executiveSummary", "stakeholderRegister", "functionalReqs",
    "nfrReqs", "assumptions", "successMetrics",
]


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


def split_chunks(text: str, max_len: int = 800) -> list[str]:
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


def ingest_source(db, model, project_id: str, text: str, label: str) -> dict:
    chunks = split_chunks(text, 800)
    breakdown = {c: 0 for c in CLASSES}
    batch = db.batch()
    batch_size = 0
    snippet_ids = []

    for chunk in chunks[:100]:
        lbl = classify(chunk, model)
        breakdown[lbl] += 1
        if lbl == "NOISE":
            continue

        ref = db.collection("snippets").document()
        batch.set(ref, {
            "projectId":    project_id,
            "source":       "email",
            "filename":     label,
            "rawText":      chunk[:1000],
            "classification": lbl,
            "confidence":   0.9,
            "author":       label,
            "authorRole":   "Enron Employee",
            "timestamp":    datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "experiment":   "exp2",
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
    snaps = (
        db.collection("snippets")
        .where("projectId", "==", project_id)
        .where("classification", "!=", "NOISE")
        .limit(200)
        .get()
    )
    snippets = [s.to_dict() for s in snaps]
    if not snippets:
        print(f"    No snippets for {project_id}, skipping BRD generation")
        return ""

    evidence = "\n".join(
        f"[{i+1}] ({s['classification']}) {s['rawText'][:300]}"
        for i, s in enumerate(snippets)
    )

    sections: dict[str, str] = {}
    flat_citations: dict[str, list] = {}

    for section in BRD_SECTIONS:
        prompt = (
            f'Generate the "{section}" section of a professional BRD.\n'
            f"Use the evidence below. Cite each statement with [SOURCE:N].\n"
            f"Return plain text only — no markdown bold, no asterisks.\n\n"
            f"EVIDENCE:\n{evidence[:6000]}\n\n"
            f"Generate the complete {section} section now:"
        )
        raw = ""
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

        for line in raw.split("\n"):
            matches = re.findall(r"\[SOURCE:(\d+)\]", line)
            if matches:
                clean = re.sub(r"\[SOURCE:\d+\]", "", line).strip()
                if len(clean) > 20:
                    ids = [
                        snaps[int(m) - 1].id
                        for m in matches
                        if 0 < int(m) <= len(snaps)
                    ]
                    flat_citations[clean] = ids

        sections[section] = re.sub(r"\[SOURCE:\d+\]", "", raw).strip()

    # Flatten citations — ensure all keys are strings and values are lists of strings
    safe_citations = {
        str(k): [str(v) for v in vals] if isinstance(vals, list) else []
        for k, vals in flat_citations.items()
        if k and str(k).strip()
    }

    ref = db.collection("brdVersions").add({
        "projectId":   project_id,
        "version":     "v1.0",
        "versionNumber": 1.0,
        "sections":    sections,
        "citations":   safe_citations,
        "createdAt":   firestore.SERVER_TIMESTAMP,
        "status":      "draft",
        "experiment":  "exp2",
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

    src = OUT_DIR / "selected_threads.json"
    if not src.exists():
        print("ERROR: selected_threads.json not found. Run 2_review_candidates.py first.")
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_FILE)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)

    with open(src, encoding="utf-8") as f:
        threads = json.load(f)

    brd_ids = []

    print(f"\n=== Ingesting {len(threads)} Enron threads ===")
    for i, thread in enumerate(threads):
        thread_id = f"T{i+1:02d}"
        project_id = f"exp2-{thread_id}"
        subject = thread["thread_subject"][:60]
        print(f"\n  {project_id}: {subject}")

        # Skip if already done
        existing = (
            db.collection("brdVersions")
            .where("projectId", "==", project_id)
            .limit(1)
            .get()
        )
        if existing:
            brd_id = existing[0].id
            print(f"    Already done — BRD: {brd_id}")
            brd_ids.append({
                "threadId":      thread_id,
                "projectId":     project_id,
                "brdId":         brd_id,
                "threadSubject": thread["thread_subject"],
            })
            continue

        # Create project
        db.collection("projects").document(project_id).set({
            "name":        f"Enron: {subject}",
            "description": "Experiment 2 — BRD generation quality",
            "createdAt":   firestore.SERVER_TIMESTAMP,
            "sources":     ["gmail"],
            "experiment":  "exp2",
        })

        # Concatenate thread emails
        parts = [f"Thread: {thread['thread_subject']}\n"]
        for em in thread["emails"]:
            parts.append(
                f"From: {em.get('from','')}\n"
                f"Date: {em.get('date','')}\n"
                f"{em.get('body','')}\n\n---\n"
            )
        full_text = "\n".join(parts)

        result = ingest_source(db, model, project_id, full_text, thread_id)
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd(db, model, project_id)
        if brd_id:
            print(f"    BRD: {brd_id}")
            brd_ids.append({
                "threadId":      thread_id,
                "projectId":     project_id,
                "brdId":         brd_id,
                "threadSubject": thread["thread_subject"],
            })

        time.sleep(1)

    out_path = OUT_DIR / "exp2_brd_ids.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(brd_ids, f, indent=2)

    print(f"\n=== Done — {len(brd_ids)} BRDs → {out_path} ===")


if __name__ == "__main__":
    main()
