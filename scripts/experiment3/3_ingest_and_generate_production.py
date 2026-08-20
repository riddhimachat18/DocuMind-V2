"""
3_ingest_and_generate_production.py — Use PRODUCTION-QUALITY BRD generation with proper citations.

This version uses the EXACT prompts from functions/src/generateBrd.ts to ensure
proper citation generation with [SOURCE:N] on EVERY sentence.

Usage:
    python scripts/experiment3/3_ingest_and_generate_production.py
"""

import json
import os
import sys
import time
import re
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Use more chunks for better coverage
MAX_CHUNKS_PER_SOURCE = 50

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
        return "NOISE"


def classify_chunk_batch(chunk_data: tuple) -> tuple:
    """Classify a single chunk - designed for parallel execution."""
    idx, chunk, api_key = chunk_data
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)
    label = classify(chunk, model)
    return (idx, chunk, label)


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


def ingest_source(db, api_key: str, project_id: str, source_type: str, source_label: str, text: str) -> dict:
    """Ingest source with PARALLEL chunk classification for 10x speed improvement."""
    chunks = split_into_chunks(text, 800)[:MAX_CHUNKS_PER_SOURCE]
    breakdown = {"REQUIREMENT": 0, "DECISION": 0, "CONSTRAINT": 0, "NOISE": 0}
    snippet_ids = []

    print(f"      Processing {len(chunks)} chunks in PARALLEL...")
    start_time = time.time()
    
    # Parallel classification with ThreadPoolExecutor (10 workers for optimal throughput)
    chunk_data = [(idx, chunk, api_key) for idx, chunk in enumerate(chunks)]
    classified_chunks = []
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(classify_chunk_batch, data): data for data in chunk_data}
        
        completed = 0
        for future in as_completed(futures):
            try:
                idx, chunk, label = future.result()
                classified_chunks.append((idx, chunk, label))
                breakdown[label] += 1
                completed += 1
                
                if completed % 10 == 0:
                    print(f"        Classified {completed}/{len(chunks)} chunks...")
            except Exception as e:
                print(f"        Error classifying chunk: {e}")
    
    # Sort by original index to maintain order
    classified_chunks.sort(key=lambda x: x[0])
    
    elapsed = time.time() - start_time
    print(f"      ✓ Classified {len(chunks)} chunks in {elapsed:.1f}s ({len(chunks)/elapsed:.1f} chunks/sec)")
    
    # Batch write to Firestore
    print(f"      Writing {len([c for c in classified_chunks if c[2] != 'NOISE'])} snippets to Firestore...")
    batch = db.batch()
    batch_size = 0

    for idx, chunk, label in classified_chunks:
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
            "experiment": "exp3_production",
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


# ── PRODUCTION-QUALITY BRD GENERATION WITH PROPER CITATIONS ───────────────────

PRODUCTION_PROMPTS = {
    "executiveSummary": """You are a senior business analyst. Analyze the source evidence and write a comprehensive Executive Summary.

STRUCTURE (300-400 words, 4-5 paragraphs):
Paragraph 1: Problem statement - What pain points are mentioned? What is the current situation?
Paragraph 2: Scope - What will the system do? What is explicitly excluded?
Paragraph 3: Key drivers - What regulatory, business, or compliance factors drive this?
Paragraph 4: Solution approach - How will this be addressed? What is the high-level strategy?
Paragraph 5: Expected impact - What outcomes are anticipated?

CRITICAL TRACEABILITY RULES:
- EVERY sentence MUST end with [SOURCE:N] citation
- EVERY statement MUST be grounded in source evidence
- Do NOT write ANY content without a [SOURCE:N] citation
- 100% TRACEABILITY REQUIRED

WRITING RULES:
- Use detailed, explanatory prose (60-100 words per paragraph)
- Provide context and background
- Explain significance and implications

OUTPUT: 300-400 words, complete sentences, 100% traceable with [SOURCE:N] on every sentence""",

    "functionalReqs": """You are a senior systems architect. Extract ALL functional requirements from source evidence.

FORMAT (simple, concise):
FR-001: The system shall [complete requirement statement]. [SOURCE:N]
FR-002: The system shall [complete requirement statement]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY requirement MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- 100% TRACEABILITY REQUIRED

RULES FOR REQUIREMENTS:
- Use "shall" for all requirements (lowercase)
- Write complete, self-contained requirement statements
- Each requirement is ONE line only
- Be specific and measurable
- Minimum 12-18 requirements

OUTPUT: 12-18 requirements, one line each, 100% traceable with [SOURCE:N]""",

    "nfrReqs": """You are a senior systems architect. Extract ALL non-functional requirements from source evidence.

FORMAT (simple, concise):
NFR-001: [Category] - The system shall [complete requirement statement]. [SOURCE:N]
NFR-002: [Category] - The system shall [complete requirement statement]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY NFR MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- 100% TRACEABILITY REQUIRED

RULES FOR NFRs:
- Use "shall" for all requirements (lowercase)
- Write complete, self-contained requirement statements
- Each NFR is ONE line only
- Categories: Performance, Security, Scalability, Availability, Compliance, Usability
- Minimum 6-8 NFRs

OUTPUT: 6-8 NFRs, one line each, 100% traceable with [SOURCE:N]""",

    "stakeholderRegister": """You are a senior business analyst. Extract ALL stakeholders from the source evidence.

FORMAT:
STK-001: [Role/Title]
Responsibilities: [What they do]. [SOURCE:N]
Involvement: [How they interact with system]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY sentence MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT]

OUTPUT: 8-10 stakeholders minimum""",

    "assumptions": """You are a senior business analyst. Extract assumptions and constraints from source evidence.

FORMAT:
ASSM-001: [Statement]. [SOURCE:N]
Basis: [What establishes this]. [SOURCE:N]

CON-001: [Limitation]. [SOURCE:N]
Basis: [What establishes this]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY sentence MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation

OUTPUT: 4-6 assumptions, 3-5 constraints""",

    "successMetrics": """You are a senior business analyst. Extract ALL success metrics from source evidence.

FORMAT:
SM-001: [Metric name]: [Target/threshold]. [SOURCE:N]
SM-002: [Metric name]: [Target/threshold]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY metric MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation

OUTPUT: 6-8 metrics, one line each""",
}


def generate_brd_production(db, model, project_id: str) -> str:
    """Generate BRD using PRODUCTION-QUALITY prompts with proper citations."""
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
        f"[SOURCE:{i+1}] {s.to_dict()['rawText'][:500]}"
        for i, s in enumerate(snaps)
    )

    sections = {}
    citations = {}
    
    for section_id, prompt_template in PRODUCTION_PROMPTS.items():
        print(f"      Generating {section_id} with PRODUCTION prompts...")
        
        full_prompt = f"""{prompt_template}

EVIDENCE:
{snippet_texts[:8000]}

Generate the section content now. Follow the format and rules exactly. EVERY sentence must have [SOURCE:N]."""

        try:
            resp = model.generate_content(full_prompt)
            raw_content = resp.text if resp.text else "No content generated"
            
            # Extract citations
            section_citations = {}
            for line in raw_content.split("\n"):
                matches = re.findall(r"\[SOURCE:(\d+)\]", line)
                if matches:
                    clean_line = re.sub(r"\[SOURCE:\d+\]", "", line).strip()
                    if len(clean_line) > 20:
                        ids = [
                            snaps[int(m) - 1].id
                            for m in matches
                            if 0 < int(m) <= len(snaps)
                        ]
                        if ids:
                            section_citations[clean_line] = ids
            
            # Clean content (remove [SOURCE:N] markers for display)
            clean_content = re.sub(r"\[SOURCE:\d+\]", "", raw_content).strip()
            sections[section_id] = clean_content
            citations.update(section_citations)
            
            print(f"        Generated {len(section_citations)} cited sentences")
            
        except Exception as e:
            print(f"        Error: {e}")
            sections[section_id] = "Error generating content"
        
        time.sleep(0.5)

    ref = db.collection("brdVersions").add({
        "projectId": project_id,
        "version": "v1.0",
        "versionNumber": 1.0,
        "sections": sections,
        "citations": citations,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "status": "draft",
        "experiment": "exp3_production",
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

    # ── Process datasets ──────────────────────────────────────────────────────
    print("\n=== Processing with PRODUCTION-QUALITY Citation Generation ===")
    
    all_sources = []
    for thread in enron_threads:
        all_sources.append(("email", thread["thread_id"], f"{thread['subject']}\n\n{thread['body']}"))
    
    for meeting in ami_transcripts:
        all_sources.append(("transcript", meeting["meeting_id"], meeting["transcript"]))
    
    for source_type, source_label, text in all_sources:
        project_id = f"exp3-prod-{source_type}-{source_label}"
        print(f"\n  {project_id}")

        existing = list(db.collection("brdVersions").where(filter=firestore.FieldFilter("projectId", "==", project_id)).limit(1).stream())
        if existing:
            brd_id = existing[0].id
            print(f"    ✓ Already done — BRD: {brd_id}")
            brd_ids.append({"projectId": project_id, "brdId": brd_id, "source_type": source_type})
            continue

        db.collection("projects").document(project_id).set({
            "name": f"{source_type.title()}: {source_label}",
            "description": "Experiment 3 — Production-quality citations",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "sources": ["gmail" if source_type == "email" else "meeting"],
            "experiment": "exp3_production",
        })

        result = ingest_source(db, GEMINI_API_KEY, project_id, source_type, source_label, text)
        print(f"    Snippets: {result['snippet_count']} | {result['breakdown']}")

        brd_id = generate_brd_production(db, model, project_id)
        if brd_id:
            print(f"    ✓ BRD: {brd_id}")
            brd_ids.append({"projectId": project_id, "brdId": brd_id, "source_type": source_type})

    # Save results
    out_path = OUT_DIR / "exp3_production_brd_ids.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(brd_ids, f, indent=2)

    print(f"\n=== Complete ===")
    print(f"Generated {len(brd_ids)} BRDs with PRODUCTION-QUALITY citations → {out_path}")
    print("\nNext: Run python scripts/experiment3/4_extract_citations.py")


if __name__ == "__main__":
    main()
