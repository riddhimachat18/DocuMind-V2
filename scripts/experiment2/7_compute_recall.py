"""
7_compute_recall.py — Track B: measure requirement recall using Gemini embeddings.

For each thread:
  1. Load gold-standard REQ/DEC/CON sentences from annotation_sheet_filled.csv
  2. Embed them with gemini-embedding-001
  3. Embed all BRD sentences with the same model
  4. A gold sentence is "recalled" if cosine similarity ≥ THRESHOLD with any BRD sentence
  5. Recall = recalled / total gold sentences for that thread

Reads from:
    data/experiment2/annotation_sheet_filled.csv   ← your filled annotation
    data/experiment2/brds_export.json

Writes to:
    data/experiment2/recall_results.json
    data/experiment2/recall_results.csv

Prerequisites:
    export GEMINI_API_KEY="..."

Usage:
    python3 scripts/experiment2/7_compute_recall.py
"""

import csv
import json
import os
import re
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)

import numpy as np

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
OUT_DIR        = Path("data/experiment2")
THRESHOLD      = 0.85   # cosine similarity threshold — calibrated for gemini-embedding-001
                        # which has high baseline similarity (~0.73 even for unrelated sentences
GOLD_LABELS    = {"REQ", "DEC", "CON"}   # labels that count as ground-truth requirements


def cosine_sim(a: list[float], b: list[float]) -> float:
    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0


def embed_texts(texts: list[str], model) -> list[list[float]]:
    """Embed a list of texts, batching to avoid rate limits."""
    embeddings = []
    for i, text in enumerate(texts):
        for attempt in range(3):
            try:
                result = model.embed_content(
                    model="models/gemini-embedding-001",
                    content=text[:2000],
                    task_type="SEMANTIC_SIMILARITY",
                )
                embeddings.append(result["embedding"])
                break
            except Exception as e:
                if attempt == 2:
                    print(f"    Embedding failed for text {i}: {e}")
                    embeddings.append([0.0] * 768)
                else:
                    time.sleep(2 ** attempt)
        # Respect rate limits
        if (i + 1) % 10 == 0:
            time.sleep(1)
    return embeddings


def sent_split(text: str) -> list[str]:
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [p.strip() for p in parts if len(p.strip()) > 20]


def main():
    if not GEMINI_API_KEY:
        print("ERROR: export GEMINI_API_KEY='your-key'")
        sys.exit(1)

    annotation_path = OUT_DIR / "annotation_sheet_filled.csv"
    if not annotation_path.exists():
        print("ERROR: annotation_sheet_filled.csv not found.")
        print("  Fill in annotation_sheet.csv and save as annotation_sheet_filled.csv first.")
        sys.exit(1)

    brds_path = OUT_DIR / "brds_export.json"
    if not brds_path.exists():
        print("ERROR: brds_export.json not found. Run 5_export_brds.py first.")
        sys.exit(1)

    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    embed_model = genai

    with open(annotation_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        annotation_rows = list(reader)

    with open(brds_path, encoding="utf-8") as f:
        brds = json.load(f)

    # Build gold standard: thread_id → list of gold sentences
    gold: dict[str, list[str]] = {}
    for row in annotation_rows:
        label = row.get("annotator1_label", "").strip().upper()
        if label not in GOLD_LABELS:
            continue
        tid = row["thread_id"]
        if tid not in gold:
            gold[tid] = []
        gold[tid].append(row["sentence"])

    print(f"Gold standard: {sum(len(v) for v in gold.values())} sentences "
          f"across {len(gold)} threads")

    # Build BRD lookup: thread_id → full BRD text
    brd_lookup = {b["threadId"]: b["fullBrdText"] for b in brds}

    results = []

    for tid, gold_sentences in sorted(gold.items()):
        brd_text = brd_lookup.get(tid, "")
        if not brd_text:
            print(f"  {tid}: no BRD found, skipping")
            continue

        brd_sentences = sent_split(brd_text)
        if not brd_sentences:
            print(f"  {tid}: BRD has no sentences, skipping")
            continue

        # Remove section headers like [assumptions] from BRD sentences
        brd_sentences = [s for s in brd_sentences if not s.startswith('[') or len(s) > 30]

        print(f"  {tid}: {len(gold_sentences)} gold sentences, "
              f"{len(brd_sentences)} BRD sentences — embedding...")

        gold_embeddings = embed_texts(gold_sentences, embed_model)
        brd_embeddings  = embed_texts(brd_sentences, embed_model)

        recalled = 0
        recall_detail = []
        for g_sent, g_emb in zip(gold_sentences, gold_embeddings):
            sims = [cosine_sim(g_emb, b_emb) for b_emb in brd_embeddings]
            max_sim = max(sims) if sims else 0.0
            is_recalled = max_sim >= THRESHOLD
            if is_recalled:
                recalled += 1
            recall_detail.append({
                "gold_sentence": g_sent,
                "max_similarity": round(max_sim, 4),
                "recalled": is_recalled,
            })

        recall = recalled / len(gold_sentences)
        results.append({
            "thread_id":       tid,
            "total_gold":      len(gold_sentences),
            "recalled":        recalled,
            "recall":          round(recall, 4),
            "recall_detail":   recall_detail,
        })
        print(f"    Recall: {recalled}/{len(gold_sentences)} = {recall:.3f}")

    # Summary
    if results:
        mean_recall = sum(r["recall"] for r in results) / len(results)
        print(f"\nMean recall across {len(results)} threads: {mean_recall:.3f}")

    # Save JSON (with detail)
    out_json = OUT_DIR / "recall_results.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Save CSV (summary only)
    out_csv = OUT_DIR / "recall_results.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["thread_id", "total_gold", "recalled", "recall"])
        writer.writeheader()
        for r in results:
            writer.writerow({k: r[k] for k in ["thread_id", "total_gold", "recalled", "recall"]})

    print(f"\nSaved → {out_json}")
    print(f"Saved → {out_csv}")
    print("Next: run 8_analyze.py")


if __name__ == "__main__":
    main()
