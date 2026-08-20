"""
1_parse_ami.py — Parse AMI word-level XML transcripts into flat documents.

Outputs each meeting as a single continuous text (all words joined in
time order), chunked downstream by 3_ingest_and_generate.py at 800 chars —
the same way onFileUploaded processes uploaded transcripts.

Reads from:  data/ami_public_manual_1.6.2/words/
Writes to:   data/experiment3/ami_transcripts.json

Usage:
    python3 scripts/experiment3/1_parse_ami.py
"""

import xml.etree.ElementTree as ET
import json
from pathlib import Path

AMI_DIR = Path("data/ami_public_manual_1.6.2/words")
OUT_DIR = Path("data/experiment3")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 5 scenario meetings — ES and IS series only (project-design focused)
MEETING_IDS = [
    "ES2002b",  # ES2002a was kickoff/introductions — no design content; b is the design session
    "ES2003a",
    "ES2004a",
    "ES2006a",
    "IS1000a",
]


def parse_meeting(meeting_id: str) -> dict:
    """
    Parse all speaker XML files for a meeting.
    Returns a flat document: words sorted by start time, joined as prose.
    Speaker labels are preserved inline so the classifier sees context like
    "A: the system should support B: yes and it must also handle..."
    """
    words = []

    for xml_file in sorted(AMI_DIR.glob(f"{meeting_id}.*.words.xml")):
        tree = ET.parse(xml_file)
        root = tree.getroot()
        speaker = xml_file.stem.split(".")[1]  # ES2002a.A.words.xml → A

        for word_el in root.findall(".//w"):
            text = word_el.text
            if text and text.strip():
                words.append({
                    "speaker": speaker,
                    "word": text.strip(),
                    "start": float(word_el.get("starttime") or 0),
                })

    if not words:
        return {"meeting_id": meeting_id, "transcript": "", "word_count": 0}

    # Sort all words across all speakers by start time
    words.sort(key=lambda w: w["start"])

    # Build flat text with speaker changes marked inline
    # e.g. "A: Hi I'm David . B: So the project is ..."
    parts = []
    current_speaker = None
    for w in words:
        if w["speaker"] != current_speaker:
            current_speaker = w["speaker"]
            parts.append(f"{current_speaker}:")
        parts.append(w["word"])

    transcript = " ".join(parts)

    return {
        "meeting_id": meeting_id,
        "transcript": transcript,
        "word_count": len(words),
    }


def main():
    output = []
    for meeting_id in MEETING_IDS:
        result = parse_meeting(meeting_id)
        output.append(result)
        print(f"Parsed {meeting_id}: {result['word_count']} words, "
              f"{len(result['transcript'])} chars")

    out_path = OUT_DIR / "ami_transcripts.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(output)} transcripts → {out_path}")


if __name__ == "__main__":
    main()
