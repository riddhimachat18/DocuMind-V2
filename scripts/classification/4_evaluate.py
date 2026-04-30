"""
4_evaluate.py — Evaluate all three classifiers on PURE_test.
Produces the main Experiment 4 results table for the paper.

Classifiers compared:
    Option A — Zero-shot Gemini (no examples in prompt)
    Option B — Fine-tuned DistilBERT (trained in step 3)
    Option C — Few-shot Gemini (same prompt as step 1 relabeling)

Outputs:
    data/results/experiment4_report.txt  ← paste into paper
    data/results/experiment4_raw.json    ← raw predictions

Usage:
    cd DocuMind-main
    export GEMINI_API_KEY="your-key"
    python scripts/classification/4_evaluate.py
"""

import json
import os
import sys
import time
from collections import Counter

import numpy as np
import torch
from sklearn.metrics import (
    classification_report,
    f1_score,
    precision_score,
    recall_score,
)
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizerFast,
)
import google.generativeai as genai

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    CLASSES, LABEL2ID, ID2LABEL,
    FOUR_CLASS_TEST_JSON,
    DISTILBERT_MODEL_DIR, RESULTS_DIR,
    MAX_SEQ_LENGTH, BATCH_SIZE,
    GEMINI_MODEL, GEMINI_API_KEY,
)

os.makedirs(RESULTS_DIR, exist_ok=True)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Prompts ───────────────────────────────────────────────────────────────────

ZERO_SHOT_PROMPT = """Classify the following sentence from a software requirements document.
Classes: REQUIREMENT, DECISION, CONSTRAINT, NOISE.
Return ONLY the class label. No explanation.

Sentence: "{sentence}"

Label:"""

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


# ── Loaders ───────────────────────────────────────────────────────────────────

def load_test_data() -> tuple[list[str], list[str]]:
    with open(FOUR_CLASS_TEST_JSON, encoding="utf-8") as f:
        data = json.load(f)
    def get_label(d):
        return d.get("four_class_label") or d.get("gemini_label", "")
    valid     = [d for d in data if get_label(d) in CLASSES
                 and d.get("sentence", "").strip()]
    sentences = [d["sentence"] for d in valid]
    labels    = [get_label(d) for d in valid]
    return sentences, labels


# ── Classifier A: Zero-shot Gemini ────────────────────────────────────────────

def classify_zero_shot(sentences: list[str], model) -> list[str]:
    preds = []
    for i, s in enumerate(sentences):
        if (i + 1) % 50 == 0:
            print(f"    Option A: {i+1}/{len(sentences)}")
        prompt = ZERO_SHOT_PROMPT.format(sentence=s.strip()[:500])
        for attempt in range(3):
            try:
                resp = model.generate_content(prompt)
                raw  = resp.text.strip().upper().split()[0] if resp.text.strip() else ""
                pred = next((c for c in CLASSES if raw.startswith(c[:4])), "NOISE")
                preds.append(pred)
                break
            except Exception as e:
                if attempt == 2:
                    preds.append("NOISE")
                else:
                    time.sleep(2 ** attempt)
    return preds


# ── Classifier B: DistilBERT ──────────────────────────────────────────────────

def classify_distilbert(sentences: list[str]) -> list[str]:
    if not os.path.exists(DISTILBERT_MODEL_DIR):
        print("  WARNING: DistilBERT model not found. Run 3_finetune_distilbert.py first.")
        return ["NOISE"] * len(sentences)

    tokenizer = DistilBertTokenizerFast.from_pretrained(DISTILBERT_MODEL_DIR)
    model     = DistilBertForSequenceClassification.from_pretrained(DISTILBERT_MODEL_DIR)
    model.to(DEVICE)
    model.eval()

    preds = []
    for i in range(0, len(sentences), BATCH_SIZE):
        batch = sentences[i: i + BATCH_SIZE]
        enc   = tokenizer(
            batch,
            truncation=True,
            padding="max_length",
            max_length=MAX_SEQ_LENGTH,
            return_tensors="pt",
        )
        with torch.no_grad():
            outputs = model(
                input_ids=enc["input_ids"].to(DEVICE),
                attention_mask=enc["attention_mask"].to(DEVICE),
            )
        batch_preds = outputs.logits.argmax(dim=-1).cpu().numpy()
        preds.extend([ID2LABEL[p] for p in batch_preds])
        if (i // BATCH_SIZE + 1) % 10 == 0:
            print(f"    Option B DistilBERT: {min(i+BATCH_SIZE, len(sentences))}/{len(sentences)}")

    return preds


# ── Classifier C: Few-shot Gemini ─────────────────────────────────────────────

def classify_few_shot(sentences: list[str], model) -> list[str]:
    preds = []
    for i, s in enumerate(sentences):
        if (i + 1) % 50 == 0:
            print(f"    Option C: {i+1}/{len(sentences)}")
        prompt = FEW_SHOT_PROMPT.format(sentence=s.strip()[:500])
        for attempt in range(3):
            try:
                resp = model.generate_content(prompt)
                raw  = resp.text.strip().upper().split()[0] if resp.text.strip() else ""
                pred = next((c for c in CLASSES if raw.startswith(c[:4])), "NOISE")
                preds.append(pred)
                break
            except Exception as e:
                if attempt == 2:
                    preds.append("NOISE")
                else:
                    time.sleep(2 ** attempt)
    return preds


# ── Metrics ───────────────────────────────────────────────────────────────────

def compute_metrics(true_labels: list[str], pred_labels: list[str], name: str) -> dict:
    macro_f1  = f1_score(true_labels, pred_labels, labels=CLASSES, average="macro",  zero_division=0)
    micro_f1  = f1_score(true_labels, pred_labels, labels=CLASSES, average="micro",  zero_division=0)
    binary_f1 = f1_score(
        [1 if l == "REQUIREMENT" else 0 for l in true_labels],
        [1 if l == "REQUIREMENT" else 0 for l in pred_labels],
        zero_division=0,
    )
    report = classification_report(
        true_labels, pred_labels,
        labels=CLASSES, zero_division=0, output_dict=True,
    )
    return {
        "name":      name,
        "macro_f1":  macro_f1,
        "micro_f1":  micro_f1,
        "binary_f1": binary_f1,
        "per_class": {
            c: {
                "precision": report[c]["precision"],
                "recall":    report[c]["recall"],
                "f1":        report[c]["f1-score"],
                "support":   report[c]["support"],
            }
            for c in CLASSES
        },
    }


def format_report(results: list[dict], true_labels: list[str], all_preds: dict) -> str:
    lines = [
        "=" * 72,
        "EXPERIMENT 4 — Classification Accuracy Results",
        f"Test set: {len(true_labels)} sentences (PURE_test, Gemini pseudo-labels)",
        "=" * 72,
        "",
        "── Summary Table ──────────────────────────────────────────────────────",
        f"{'Classifier':<30} {'Macro-F1':>10} {'Micro-F1':>10} {'Req-F1 (binary)':>18}",
        "-" * 72,
    ]

    for r in results:
        lines.append(
            f"{r['name']:<30} {r['macro_f1']:>10.4f} {r['micro_f1']:>10.4f} "
            f"{r['binary_f1']:>18.4f}"
        )

    lines += [
        "",
        "  Baseline (ReqExp BERT, binary, PURE) : F1 = 0.86  [Ivanov et al., 2022]",
        "  Note: Binary F1 collapses DECISION+CONSTRAINT+NOISE → non-REQUIREMENT.",
        "",
        "── Per-Class Detail ───────────────────────────────────────────────────",
        "",
    ]

    for r in results:
        lines.append(f"  {r['name']}")
        lines.append(f"  {'Class':<14} {'Precision':>10} {'Recall':>10} {'F1':>10} {'Support':>10}")
        lines.append("  " + "-" * 46)
        for c in CLASSES:
            pc = r["per_class"][c]
            lines.append(
                f"  {c:<14} {pc['precision']:>10.3f} {pc['recall']:>10.3f} "
                f"{pc['f1']:>10.3f} {int(pc['support']):>10}"
            )
        lines.append("")

    lines += [
        "── Label Distribution in Test Set ────────────────────────────────────",
        f"  True labels: {dict(Counter(true_labels))}",
    ]
    for name, preds in all_preds.items():
        lines.append(f"  {name}: {dict(Counter(preds))}")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Loading test data...")
    sentences, true_labels = load_test_data()
    print(f"  {len(sentences)} test sentences")
    print(f"  Distribution: {dict(Counter(true_labels))}")

    if not GEMINI_API_KEY:
        print("ERROR: set GEMINI_API_KEY")
        sys.exit(1)
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel(GEMINI_MODEL)

    raw_output = {}
    results    = []

    # ── Option B: DistilBERT (run first — no API costs) ───────────────────────
    print("\nRunning Option B: DistilBERT...")
    preds_b = classify_distilbert(sentences)
    raw_output["distilbert"] = preds_b
    results.append(compute_metrics(true_labels, preds_b, "Option B: DistilBERT (fine-tuned)"))
    print(f"  Macro-F1: {results[-1]['macro_f1']:.4f}")

    # ── Option A: Zero-shot Gemini ─────────────────────────────────────────────
    print("\nRunning Option A: Zero-shot Gemini...")
    preds_a = classify_zero_shot(sentences, gemini_model)
    raw_output["zero_shot_gemini"] = preds_a
    results.append(compute_metrics(true_labels, preds_a, "Option A: Zero-shot Gemini"))
    print(f"  Macro-F1: {results[-1]['macro_f1']:.4f}")

    # ── Option C: Few-shot Gemini ─────────────────────────────────────────────
    print("\nRunning Option C: Few-shot Gemini...")
    preds_c = classify_few_shot(sentences, gemini_model)
    raw_output["few_shot_gemini"] = preds_c
    results.append(compute_metrics(true_labels, preds_c, "Option C: Few-shot Gemini"))
    print(f"  Macro-F1: {results[-1]['macro_f1']:.4f}")

    # ── Sort by macro-F1 ──────────────────────────────────────────────────────
    results.sort(key=lambda x: x["macro_f1"], reverse=True)

    # ── Format and save report ────────────────────────────────────────────────
    report = format_report(results, true_labels, raw_output)
    print("\n" + report)

    report_path = os.path.join(RESULTS_DIR, "experiment4_report.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nReport saved → {report_path}")

    # Save raw predictions
    raw_path = os.path.join(RESULTS_DIR, "experiment4_raw.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump({
            "sentences":   sentences,
            "true_labels": true_labels,
            "predictions": raw_output,
            "metrics":     results,
        }, f, indent=2)
    print(f"Raw data   → {raw_path}")


if __name__ == "__main__":
    main()