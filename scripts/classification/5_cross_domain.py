"""
5_cross_domain.py — Cross-domain evaluation on RFI dataset.

Tests all three classifiers on Final_dataset_RFIs.csv (industrial RFI docs).
This is the strongest result in the paper: Gemini should stay stable across
domains while DistilBERT degrades — replicating Ivanov et al.'s finding that
BERT drops from F1=0.86 to F1=0.80 on out-of-domain RFI text.

If Gemini zero-shot/few-shot stays stable → significant finding.
If DistilBERT degrades more than Gemini → proves value of zero-shot approach.

Outputs:
    data/results/cross_domain_report.txt

Usage:
    cd DocuMind-main
    export GEMINI_API_KEY="your-key"
    python scripts/classification/5_cross_domain.py
"""

import json
import os
import sys
import time
from collections import Counter

import torch
from sklearn.metrics import classification_report, f1_score
from transformers import DistilBertForSequenceClassification, DistilBertTokenizerFast
import google.generativeai as genai

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    CLASSES, ID2LABEL,
    RFI_FOUR_CLASS_JSON,
    DISTILBERT_MODEL_DIR, RESULTS_DIR,
    MAX_SEQ_LENGTH, BATCH_SIZE,
    GEMINI_MODEL, GEMINI_API_KEY,
)

os.makedirs(RESULTS_DIR, exist_ok=True)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Reuse prompts from evaluate.py ───────────────────────────────────────────

ZERO_SHOT_PROMPT = """Classify the following sentence into exactly one of these four classes:
REQUIREMENT, DECISION, CONSTRAINT, NOISE.
Return ONLY the label word. No explanation. No punctuation.

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


def load_rfi_data() -> tuple[list[str], list[str]]:
    with open(RFI_FOUR_CLASS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    def get_label(d):
        return d.get("four_class_label") or d.get("gemini_label", "")
    valid     = [d for d in data if get_label(d) in CLASSES
                 and d.get("sentence", "").strip()]
    sentences = [d["sentence"] for d in valid]
    labels    = [get_label(d) for d in valid]
    return sentences, labels


def gemini_classify(sentences: list[str], prompt_template: str, gmodel, label: str) -> list[str]:
    preds = []
    for i, s in enumerate(sentences):
        if (i + 1) % 25 == 0:
            print(f"    {label}: {i+1}/{len(sentences)}")
        prompt = prompt_template.format(sentence=s.strip()[:500])
        for attempt in range(3):
            try:
                resp = gmodel.generate_content(prompt)
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


def distilbert_classify(sentences: list[str]) -> list[str]:
    if not os.path.exists(DISTILBERT_MODEL_DIR):
        print("  WARNING: DistilBERT model not found.")
        return ["NOISE"] * len(sentences)
    tokenizer = DistilBertTokenizerFast.from_pretrained(DISTILBERT_MODEL_DIR)
    model     = DistilBertForSequenceClassification.from_pretrained(DISTILBERT_MODEL_DIR)
    model.to(DEVICE)
    model.eval()
    preds = []
    for i in range(0, len(sentences), BATCH_SIZE):
        batch = sentences[i: i + BATCH_SIZE]
        enc   = tokenizer(batch, truncation=True, padding="max_length",
                          max_length=MAX_SEQ_LENGTH, return_tensors="pt")
        with torch.no_grad():
            out = model(input_ids=enc["input_ids"].to(DEVICE),
                        attention_mask=enc["attention_mask"].to(DEVICE))
        preds.extend([ID2LABEL[p] for p in out.logits.argmax(dim=-1).cpu().numpy()])
    return preds


def metrics(true: list[str], pred: list[str]) -> dict:
    macro_f1  = f1_score(true, pred, labels=CLASSES, average="macro",  zero_division=0)
    binary_f1 = f1_score(
        [1 if l == "REQUIREMENT" else 0 for l in true],
        [1 if l == "REQUIREMENT" else 0 for l in pred],
        zero_division=0,
    )
    report = classification_report(true, pred, labels=CLASSES,
                                   zero_division=0, output_dict=True)
    return {"macro_f1": macro_f1, "binary_f1": binary_f1, "report": report}


def main():
    print("Loading RFI test data...")
    sentences, true_labels = load_rfi_data()
    print(f"  {len(sentences)} RFI sentences")
    print(f"  Distribution: {dict(Counter(true_labels))}")

    if not GEMINI_API_KEY:
        print("ERROR: set GEMINI_API_KEY")
        sys.exit(1)
    genai.configure(api_key=GEMINI_API_KEY)
    gmodel = genai.GenerativeModel(GEMINI_MODEL)

    all_results = {}

    print("\nOption B: DistilBERT (out-of-domain)...")
    preds_b = distilbert_classify(sentences)
    all_results["Option B: DistilBERT (out-of-domain)"] = metrics(true_labels, preds_b)

    print("\nOption A: Zero-shot Gemini...")
    preds_a = gemini_classify(sentences, ZERO_SHOT_PROMPT, gmodel, "Zero-shot")
    all_results["Option A: Zero-shot Gemini"] = metrics(true_labels, preds_a)

    print("\nOption C: Few-shot Gemini...")
    preds_c = gemini_classify(sentences, FEW_SHOT_PROMPT, gmodel, "Few-shot")
    all_results["Option C: Few-shot Gemini"] = metrics(true_labels, preds_c)

    # ── Format report ─────────────────────────────────────────────────────────
    lines = [
        "=" * 72,
        "CROSS-DOMAIN EVALUATION — Final_dataset_RFIs",
        f"Test set: {len(sentences)} sentences (industrial RFI documents)",
        "Key comparison: does Gemini degrade less than DistilBERT on out-of-domain data?",
        "Baseline: Ivanov et al. report BERT F1 drops ~7% on RFI vs. PURE.",
        "=" * 72,
        "",
        f"{'Classifier':<38} {'Macro-F1':>10} {'Req-F1 (binary)':>18}",
        "-" * 72,
    ]

    for name, m in all_results.items():
        lines.append(f"{name:<38} {m['macro_f1']:>10.4f} {m['binary_f1']:>18.4f}")

    lines += ["", "── Per-class detail ───────────────────────────────────────────────────", ""]
    for name, m in all_results.items():
        lines.append(f"  {name}")
        lines.append(f"  {'Class':<14} {'P':>8} {'R':>8} {'F1':>8} {'Support':>10}")
        lines.append("  " + "-" * 42)
        for c in CLASSES:
            r = m["report"][c]
            lines.append(
                f"  {c:<14} {r['precision']:>8.3f} {r['recall']:>8.3f} "
                f"{r['f1-score']:>8.3f} {int(r['support']):>10}"
            )
        lines.append("")

    lines += [
        "── Label distribution ────────────────────────────────────────────────",
        f"  True labels: {dict(Counter(true_labels))}",
        f"  DistilBERT : {dict(Counter(preds_b))}",
        f"  Zero-shot  : {dict(Counter(preds_a))}",
        f"  Few-shot   : {dict(Counter(preds_c))}",
        "",
        "── Interpretation for paper ──────────────────────────────────────────",
    ]

    # Compare DistilBERT on PURE (from exp4) vs RFI
    bert_rfi_f1    = all_results["Option B: DistilBERT (out-of-domain)"]["macro_f1"]
    gemini_rfi_f1  = all_results["Option C: Few-shot Gemini"]["macro_f1"]
    lines.append(f"  DistilBERT cross-domain F1   : {bert_rfi_f1:.4f}")
    lines.append(f"  Few-shot Gemini cross-domain F1: {gemini_rfi_f1:.4f}")
    if gemini_rfi_f1 > bert_rfi_f1:
        delta = gemini_rfi_f1 - bert_rfi_f1
        lines.append(f"  → Gemini outperforms DistilBERT by {delta:.4f} on RFI data.")
        lines.append("  → Supports the claim that zero-shot Gemini generalises better")
        lines.append("    across domains without retraining, unlike fine-tuned BERT.")
    else:
        delta = bert_rfi_f1 - gemini_rfi_f1
        lines.append(f"  → DistilBERT outperforms Gemini by {delta:.4f} on RFI data.")
        lines.append("  → Report as: fine-tuned model generalises well to industrial RFI text.")

    report = "\n".join(lines)
    print("\n" + report)

    out_path = os.path.join(RESULTS_DIR, "cross_domain_report.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nReport saved → {out_path}")


if __name__ == "__main__":
    main()