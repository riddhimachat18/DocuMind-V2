"""
5_export_brds.py — Pull BRDs and quality scores from Firestore.

Reads from:  data/experiment2/exp2_brd_ids.json  (Firestore)
Writes to:   data/experiment2/brds_export.json

Usage:
    export GOOGLE_APPLICATION_CREDENTIALS="documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"
    python3 scripts/experiment2/5_export_brds.py
"""

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

CRED_FILE    = "documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"
OUT_DIR      = Path("data/experiment2")
GEMINI_MODEL = "gemini-2.5-flash"


def build_evaluator_prompt(sections: dict, open_conflict_count: int = 0) -> str:
    def sec(key):
        return sections.get(key) or "(missing)"

    return f"""You are an independent BRD quality evaluator. Your role is to assess the quality of a Business Requirements Document (BRD) across four explicit criteria. You have no knowledge of how this BRD was generated - you are acting as an unbiased judge.

EVALUATION CRITERIA:

1. COMPLETENESS (0-100): Assess whether all required BRD sections are present and substantive.
   - Check for: Executive Summary, Stakeholder Register, Functional Requirements, Non-Functional Requirements, Assumptions, Success Metrics
   - Each section should have meaningful content (not placeholders like "TBD" or "N/A")
   - Functional requirements should have measurable acceptance criteria
   - Success metrics should have quantifiable targets

2. CLARITY (0-100): Assess whether language is specific, unambiguous, and uses precise terminology.
   - Requirements should use modal verbs (SHALL, MUST, WILL) not vague language (may, might, could)
   - Requirements should specify named actors, components, or data entities
   - Avoid vague qualifiers like "typically", "generally", "usually", "approximately"

3. CONSISTENCY (0-100): Identify contradictions between sections and conflicting requirements.
   - Check for terminology consistency
   - Verify no conflicting requirements or constraints
   - Note: Open conflict count is {open_conflict_count}

4. EVIDENCE (0-100): Verify that claims and requirements are linked to source evidence.
   - Check if requirements reference specific source snippets
   - Assess whether evidence attribution is present throughout sections

BRD CONTENT TO EVALUATE:

Executive Summary:
{sec('executiveSummary')}

Stakeholder Register:
{sec('stakeholderRegister')}

Functional Requirements:
{sec('functionalReqs')}

Non-Functional Requirements:
{sec('nfrReqs')}

Assumptions:
{sec('assumptions')}

Success Metrics:
{sec('successMetrics')}

INSTRUCTIONS:
Return ONLY this JSON object, complete and properly closed:

{{
  "completeness": <number 0-100>,
  "clarity": <number 0-100>,
  "consistency": <number 0-100>,
  "evidence": <number 0-100>,
  "overall": <number 0-100>,
  "reasoning": "<concise explanation, max 300 characters>"
}}"""


def score_brd(sections: dict, model) -> dict:
    """Call Gemini to score a BRD using the independent evaluator prompt."""
    prompt = build_evaluator_prompt(sections)
    for attempt in range(3):
        try:
            resp = model.generate_content(prompt)
            text = resp.text.strip()

            # Extract JSON — try code fence first, then raw object
            match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
            if match:
                json_text = match.group(1).strip()
            else:
                match = re.search(r'(\{[\s\S]*\})', text)
                if not match:
                    raise ValueError("No JSON in response")
                json_text = match.group(1)

            parsed = json.loads(json_text)

            def norm(v):
                try:
                    return max(0, min(100, round(float(v))))
                except Exception:
                    return 0

            return {
                "completeness": norm(parsed.get("completeness", 0)),
                "clarity":      norm(parsed.get("clarity", 0)),
                "consistency":  norm(parsed.get("consistency", 0)),
                "evidence":     norm(parsed.get("evidence", 0)),
                "overall":      norm(parsed.get("overall", 0)),
                "reasoning":    str(parsed.get("reasoning", ""))[:500],
            }
        except Exception as e:
            if attempt == 2:
                print(f"    Scorer failed: {e}")
                return {"completeness": 0, "clarity": 0, "consistency": 0,
                        "evidence": 0, "overall": 0, "reasoning": "scoring failed"}
            time.sleep(2 ** attempt)
    return {"completeness": 0, "clarity": 0, "consistency": 0,
            "evidence": 0, "overall": 0, "reasoning": "scoring failed"}


def main():
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        print("ERROR: export GEMINI_API_KEY='your-key'")
        sys.exit(1)

    if not os.path.exists(CRED_FILE):
        print(f"ERROR: {CRED_FILE} not found")
        sys.exit(1)

    src = OUT_DIR / "exp2_brd_ids.json"
    if not src.exists():
        print("ERROR: exp2_brd_ids.json not found. Run 4_ingest_and_generate.py first.")
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_FILE)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    import google.generativeai as genai
    genai.configure(api_key=gemini_key)
    model = genai.GenerativeModel(
        GEMINI_MODEL,
        generation_config={"temperature": 0.1, "max_output_tokens": 4096, "top_p": 0.9}
    )

    with open(src, encoding="utf-8") as f:
        brd_entries = json.load(f)

    export = []
    for entry in brd_entries:
        doc = db.collection("brdVersions").document(entry["brdId"]).get()
        if not doc.exists:
            print(f"  WARNING: BRD {entry['brdId']} not found in Firestore")
            continue

        data = doc.to_dict()
        sections = data.get("sections", {})

        # Score using the independent LLM evaluator (IndependentQualityScorer port)
        print(f"  {entry['threadId']}: scoring... ", end="", flush=True)
        quality = score_brd(sections, model)
        time.sleep(1)  # avoid rate limits

        full_brd_text = "\n\n".join(
            f"[{k}]\n{v}" for k, v in sections.items() if v
        )

        export.append({
            "threadId":       entry["threadId"],
            "projectId":      entry["projectId"],
            "brdId":          entry["brdId"],
            "threadSubject":  entry["threadSubject"],
            "qualityScore":   quality["overall"],
            "completeness":   quality["completeness"],
            "consistency":    quality["consistency"],
            "clarity":        quality["clarity"],
            "evidence":       quality["evidence"],
            "reasoning":      quality["reasoning"],
            "sections":       sections,
            "fullBrdText":    full_brd_text,
            "citations":      data.get("citations", {}),
        })
        print(f"overall={quality['overall']} — {entry['threadSubject'][:45]}")

    out_path = OUT_DIR / "brds_export.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=2, ensure_ascii=False)

    print(f"\nExported {len(export)} BRDs → {out_path}")
    print("Next: run 6_human_rating.py to generate the rating sheet.")


if __name__ == "__main__":
    main()
