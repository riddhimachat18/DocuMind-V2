"""
exp2_iaa_sample.py — Extract a stratified IAA sample from the Experiment 2
gold standard for second-annotator validation.

Selects sentences from threads T07 (low recall=0.238), T09 (high recall=0.824),
T12 (mid recall=0.577), T15 (high recall=0.954) — covering the full recall
range. Only REQ/DEC/CON rows are included (NONE rows are trivially agreed upon
and inflate κ artificially).

Reads from:  data/experiment2/annotation_sheet_filled.csv
Writes to:   scripts/iaa/exp2_iaa_sheet.csv   ← give to second annotator

Usage:
    python3 scripts/iaa/exp2_iaa_sample.py
"""

import csv
import random
from pathlib import Path

SRC = Path("data/experiment2/annotation_sheet_filled.csv")
OUT = Path("scripts/iaa/exp2_iaa_sheet.csv")
OUT.parent.mkdir(parents=True, exist_ok=True)

# Threads chosen to cover low/mid/high recall range
TARGET_THREADS = ["T07", "T09", "T12", "T15"]
GOLD_LABELS = {"REQ", "DEC", "CON"}
RANDOM_SEED = 42
N_TOTAL = 35       # total rows in final sheet
N_NONE = 9         # how many NONE rows to include


def main():
    with open(SRC, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Separate NONE and non-NONE rows, deduplicate by sentence text within each group
    seen_signal: set[str] = set()
    seen_none: set[str] = set()
    by_thread: dict[str, list] = {t: [] for t in TARGET_THREADS}
    none_pool: list = []

    for row in rows:
        tid = row["thread_id"]
        label = row.get("annotator1_label", "").strip()
        sentence = row["sentence"].strip()
        if tid not in TARGET_THREADS:
            continue
        if label in GOLD_LABELS and sentence not in seen_signal:
            seen_signal.add(sentence)
            by_thread[tid].append(row)
        elif label == "NONE" and sentence not in seen_none:
            seen_none.add(sentence)
            none_pool.append(row)

    random.seed(RANDOM_SEED)

    # Sample NONE rows first
    none_sample = random.sample(none_pool, min(N_NONE, len(none_pool)))

    # Remaining slots go to REQ/DEC/CON, proportional across threads
    n_signal = N_TOTAL - len(none_sample)
    total_unique = sum(len(v) for v in by_thread.values())
    signal_sample = []
    for tid in TARGET_THREADS:
        pool = by_thread[tid]
        n = max(1, round(n_signal * len(pool) / total_unique))
        n = min(n, len(pool))
        signal_sample.extend(random.sample(pool, n))

    # Trim signal to fit exactly
    random.shuffle(signal_sample)
    signal_sample = signal_sample[:n_signal]

    # Combine and shuffle so NONE rows aren't all at the end
    sample = signal_sample + none_sample
    random.shuffle(sample)

    print(f"  REQ/DEC/CON: {len(signal_sample)} sentences across threads")
    print(f"  NONE:        {len(none_sample)} sentences")

    # Write sheet
    fieldnames = [
        "thread_id",
        "thread_subject",
        "sentence",
        "annotator1_label",   # YOUR labels (hidden from annotator 2 until after)
        "annotator2_label",   # BLANK — second annotator fills this in
        "annotator2_notes",
    ]

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in sample:
            writer.writerow({
                "thread_id":       row["thread_id"],
                "thread_subject":  row["thread_subject"],
                "sentence":        row["sentence"],
                "annotator1_label": row["annotator1_label"],
                "annotator2_label": "",
                "annotator2_notes": "",
            })

    print(f"\nTotal: {len(sample)} sentences → {OUT}")
    print()
    print("IMPORTANT: Before giving to second annotator, hide the")
    print("annotator1_label column (or delete it from their copy).")
    print("Reveal it only after they have finished labelling.")


if __name__ == "__main__":
    main()
