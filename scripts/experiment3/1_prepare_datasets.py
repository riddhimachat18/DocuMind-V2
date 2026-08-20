"""
1_prepare_datasets.py — Prepare AMI and Enron datasets for experiment 3.

Reads from:  data/ami.json, data/enron-filtered.json
Writes to:   data/experiment3/ami_transcripts.json
             data/experiment3/enron_threads.json

Usage:
    python scripts/experiment3/1_prepare_datasets.py
"""

import json
from pathlib import Path

OUT_DIR = Path("data/experiment3")
OUT_DIR.mkdir(parents=True, exist_ok=True)

print("=== Preparing Datasets for Experiment 3 ===\n")

# ── Process AMI transcripts ───────────────────────────────────────────────────
print("Processing AMI transcripts...")
with open("data/ami.json", encoding="utf-8") as f:
    ami_data = json.load(f)

# Use ALL AMI data, group by speaker
ami_transcripts = []
speakers = {}

for item in ami_data:  # Use ALL data
    speaker = item.get("author", "Unknown")
    if speaker not in speakers:
        speakers[speaker] = []
    speakers[speaker].append(item.get("rawText", ""))

# Create one document per speaker
for idx, (speaker, texts) in enumerate(speakers.items()):
    combined_text = "\n\n".join(texts)
    ami_transcripts.append({
        "meeting_id": f"AMI_{speaker.replace(' ', '_')}_{idx}",
        "transcript": combined_text,
        "word_count": len(combined_text.split()),
        "speaker": speaker,
    })

ami_out = OUT_DIR / "ami_transcripts.json"
with open(ami_out, "w", encoding="utf-8") as f:
    json.dump(ami_transcripts, f, indent=2, ensure_ascii=False)

print(f"  Created {len(ami_transcripts)} AMI transcript documents")
print(f"  Total words: {sum(t['word_count'] for t in ami_transcripts):,}")
print(f"  Saved → {ami_out}")

# ── Process Enron emails ──────────────────────────────────────────────────────
print("\nProcessing Enron emails...")
with open("data/enron-filtered.json", encoding="utf-8") as f:
    enron_data = json.load(f)

# Use ALL Enron data, group by author
enron_threads = []
authors = {}

for item in enron_data:  # Use ALL data
    author = item.get("author", "unknown@enron.com")
    if author not in authors:
        authors[author] = []
    authors[author].append(item.get("rawText", ""))

# Create one document per author (top 10 authors by email count)
sorted_authors = sorted(authors.items(), key=lambda x: len(x[1]), reverse=True)[:10]

for idx, (author, texts) in enumerate(sorted_authors):
    combined_text = "\n\n".join(texts)
    enron_threads.append({
        "thread_id": f"enron_{author.split('@')[0]}_{idx}",
        "subject": f"Enron Emails - {author}",
        "body": combined_text,
        "email_count": len(texts),
        "total_chars": len(combined_text),
        "author": author,
    })

enron_out = OUT_DIR / "enron_threads.json"
with open(enron_out, "w", encoding="utf-8") as f:
    json.dump(enron_threads, f, indent=2, ensure_ascii=False)

print(f"  Created {len(enron_threads)} Enron thread documents")
print(f"  Total emails: {sum(t['email_count'] for t in enron_threads):,}")
print(f"  Saved → {enron_out}")

print("\n=== Dataset Preparation Complete ===")
print(f"Total documents: {len(ami_transcripts) + len(enron_threads)}")
print(f"  AMI transcripts: {len(ami_transcripts)}")
print(f"  Enron threads: {len(enron_threads)}")
