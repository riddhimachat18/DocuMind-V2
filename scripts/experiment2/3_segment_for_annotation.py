"""
3_segment_for_annotation.py — Split selected thread emails into sentences
and export an annotation sheet for gold-standard labelling.

Each thread is capped at MAX_SENTENCES_PER_THREAD sentences, sampled
uniformly across emails so all parts of the thread are represented.

You fill in annotator1_label for each sentence:
    REQ  — a requirement (system must/shall/should do something)
    DEC  — a decision (something agreed or chosen)
    CON  — a constraint (external limitation or boundary)
    NONE — everything else

Reads from:  data/experiment2/selected_threads.json
Writes to:   data/experiment2/annotation_sheet.csv

Usage:
    python3 scripts/experiment2/3_segment_for_annotation.py
"""

import csv
import json
import re
from pathlib import Path

OUT_DIR = Path("data/experiment2")

# Cap per thread — keeps total ~3500 while all 15 threads are represented
MAX_SENTENCES_PER_THREAD = 250


def sent_split(text: str) -> list[str]:
    """Regex sentence splitter — no NLTK dependency."""
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [p.strip() for p in parts if p.strip()]


def clean_body(body: str) -> str:
    """Remove forwarding headers and excessive whitespace."""
    body = re.sub(r"-{5,}.*?-{5,}", " ", body, flags=re.DOTALL)
    body = re.sub(r"^\s*(From|To|Cc|Subject|Date|Sent):\s*.+\n?", "", body, flags=re.MULTILINE)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def main():
    src = OUT_DIR / "selected_threads.json"
    if not src.exists():
        print("ERROR: selected_threads.json not found. Run 2_review_candidates.py first.")
        return

    with open(src, encoding="utf-8") as f:
        threads = json.load(f)

    rows = []
    for t_idx, thread in enumerate(threads):
        thread_id = f"T{t_idx+1:02d}"

        # Collect all sentences across emails
        thread_sentences = []
        for e_idx, em in enumerate(thread["emails"]):
            body = clean_body(em.get("body", ""))
            sentences = sent_split(body)
            for s_idx, sent in enumerate(sentences):
                if len(sent) < 20:
                    continue
                thread_sentences.append({
                    "thread_id":        thread_id,
                    "thread_subject":   thread["thread_subject"][:60],
                    "email_index":      e_idx,
                    "sentence_index":   s_idx,
                    "sentence":         sent,
                    "annotator1_label": "",
                    "annotator1_notes": "",
                })

        # Cap: sample uniformly if over the limit
        if len(thread_sentences) > MAX_SENTENCES_PER_THREAD:
            step = len(thread_sentences) / MAX_SENTENCES_PER_THREAD
            indices = [int(i * step) for i in range(MAX_SENTENCES_PER_THREAD)]
            thread_sentences = [thread_sentences[i] for i in indices]

        rows.extend(thread_sentences)

    out_path = OUT_DIR / "annotation_sheet.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} sentences across {len(threads)} threads → {out_path}")
    print(f"(capped at {MAX_SENTENCES_PER_THREAD} sentences per thread)")
    print()

    from collections import Counter
    counts = Counter(r["thread_id"] for r in rows)
    for tid in sorted(counts):
        subj = next(r["thread_subject"] for r in rows if r["thread_id"] == tid)
        print(f"  {tid}: {counts[tid]:4d} sentences — {subj}")


if __name__ == "__main__":
    main()
