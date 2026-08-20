"""
3b_auto_annotate.py — Pre-label annotation_sheet.csv using the canonical
few-shot Gemini classifier, then export an editable CSV for human review.

The classifier maps the four-class labels to the three-class gold standard:
    REQUIREMENT → REQ
    DECISION    → DEC
    CONSTRAINT  → CON
    NOISE       → NONE

You open the output CSV, review each row, and correct any labels that look
wrong. Save as annotation_sheet_filled.csv when done. That file is your
human-reviewed gold standard.

Reads from:  data/experiment2/annotation_sheet.csv
Writes to:   data/experiment2/annotation_sheet_filled.csv

Prerequisites:
    export GEMINI_API_KEY="..."

Usage:
    python3 scripts/experiment2/3b_auto_annotate.py
"""

import csv
import os
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
OUT_DIR        = Path("data/experiment2")
GEMINI_MODEL   = "gemini-2.5-flash"

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

LABEL_MAP = {
    "REQUIREMENT": "REQ",
    "DECISION":    "DEC",
    "CONSTRAINT":  "CON",
    "NOISE":       "NONE",
}
CLASSES = list(LABEL_MAP.keys())


def classify(sentence: str, model) -> str:
    prompt = FEW_SHOT_PROMPT.format(
        sentence=sentence.strip()[:500].replace('"', "'")
    )
    for attempt in range(3):
        try:
            resp = model.generate_content(prompt)
            raw = resp.text.strip().upper().split()[0] if resp.text.strip() else ""
            for cls in CLASSES:
                if raw.startswith(cls[:4]):
                    return LABEL_MAP[cls]
            return "NONE"
        except Exception as e:
            wait = 2 ** attempt
            print(f"    Gemini error (attempt {attempt+1}/3): {e} — retry in {wait}s")
            time.sleep(wait)
    return "NONE"


def main():
    if not GEMINI_API_KEY:
        print("ERROR: export GEMINI_API_KEY='your-key'")
        sys.exit(1)

    src = OUT_DIR / "annotation_sheet.csv"
    if not src.exists():
        print("ERROR: annotation_sheet.csv not found. Run 3_segment_for_annotation.py first.")
        sys.exit(1)

    import warnings
    warnings.filterwarnings("ignore", category=FutureWarning)
    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)

    with open(src, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    total = len(rows)
    print(f"Classifying {total} sentences...")

    # Check for existing partial output to resume from
    out_path = OUT_DIR / "annotation_sheet_filled.csv"
    done: dict[str, str] = {}
    if out_path.exists():
        with open(out_path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                label = r.get("annotator1_label", "").strip()
                if label:
                    key = f"{r['thread_id']}_{r['email_index']}_{r['sentence_index']}"
                    done[key] = label
        print(f"  Resuming — {len(done)} already labelled")

    fieldnames = list(rows[0].keys())
    if "annotator1_label" not in fieldnames:
        fieldnames.append("annotator1_label")
    if "annotator1_notes" not in fieldnames:
        fieldnames.append("annotator1_notes")

    results = []
    label_counts = {"REQ": 0, "DEC": 0, "CON": 0, "NONE": 0}

    for i, row in enumerate(rows):
        key = f"{row['thread_id']}_{row['email_index']}_{row['sentence_index']}"

        if key in done:
            row["annotator1_label"] = done[key]
            row.setdefault("annotator1_notes", "")
            results.append(row)
            label_counts[done[key]] = label_counts.get(done[key], 0) + 1
            continue

        label = classify(row["sentence"], model)
        row["annotator1_label"] = label
        row.setdefault("annotator1_notes", "")
        results.append(row)
        label_counts[label] = label_counts.get(label, 0) + 1

        # Save checkpoint every 100 rows
        if (i + 1) % 100 == 0:
            with open(out_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(results)
            print(f"  [{i+1}/{total}] checkpoint saved — "
                  f"REQ:{label_counts['REQ']} DEC:{label_counts['DEC']} "
                  f"CON:{label_counts['CON']} NONE:{label_counts['NONE']}")

    # Final save
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    non_noise = label_counts["REQ"] + label_counts["DEC"] + label_counts["CON"]
    print(f"\nDone. {total} sentences labelled → {out_path}")
    print(f"  REQ:  {label_counts['REQ']}")
    print(f"  DEC:  {label_counts['DEC']}")
    print(f"  CON:  {label_counts['CON']}")
    print(f"  NONE: {label_counts['NONE']}")
    print(f"  Non-NOISE (gold standard): {non_noise} sentences")
    print()
    print("Next steps:")
    print("  1. Open annotation_sheet_filled.csv in Excel or Google Sheets")
    print("  2. Review and correct any labels that look wrong")
    print("     (focus on REQ/DEC/CON rows — NONE rows rarely need correction)")
    print("  3. Save the file (keep the name annotation_sheet_filled.csv)")
    print("  4. Run 4_ingest_and_generate.py")


if __name__ == "__main__":
    main()
