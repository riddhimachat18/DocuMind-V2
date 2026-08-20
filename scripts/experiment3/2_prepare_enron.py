"""
2_prepare_enron.py — Build 5 Enron project sources for Experiment 3.

Each source = one maildir folder treated as a single project document.
All emails in the folder are concatenated into one text, which is then
chunked by 3_ingest_and_generate.py at 800 chars — same as onFileUploaded.

Selected folders are the highest-signal project/system folders confirmed
by keyword density analysis:
    lokay-m/systems       — SAP ERP implementation (126 emails)
    beck-s/sap            — SAP system rollout (39 emails)
    scott-s/msap_info     — MSAP trading system (30 emails)
    hayslett-r/projects   — infrastructure projects (51 emails)
    richey-c/infrastructure — infrastructure planning (10 emails)

Reads from:  data/maildir/
Writes to:   data/experiment3/enron_threads.json

Usage:
    python3 scripts/experiment3/2_prepare_enron.py
"""

import re
import json
from pathlib import Path

MAILDIR = Path("data/maildir")
OUT_DIR = Path("data/experiment3")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# (employee, folder, display_name)
SOURCES = [
    ("lokay-m",   "systems",        "SAP ERP Implementation"),
    ("beck-s",    "sap",            "SAP System Rollout"),
    ("scott-s",   "msap_info",      "MSAP Trading System"),
    ("hayslett-r","projects",       "Infrastructure Projects"),
    ("richey-c",  "infrastructure", "Infrastructure Planning"),
]


def extract_body(raw: str) -> str:
    """Strip email headers, return the body text only."""
    # Headers end at the first blank line
    body_start = raw.find("\n\n")
    body = raw[body_start:].strip() if body_start >= 0 else raw.strip()
    # Remove forwarding separator lines
    body = re.sub(r"-{5,}.*?-{5,}", " ", body, flags=re.DOTALL)
    # Remove inline header lines (From:, To:, Subject:, Date:, Cc:)
    body = re.sub(r"^\s*(From|To|Cc|Bcc|Subject|Date|Sent|Message-ID):\s*.+\n?",
                  "", body, flags=re.MULTILINE)
    # Collapse excessive whitespace
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def build_source(employee: str, folder: str, display_name: str) -> dict:
    path = MAILDIR / employee / folder
    files = sorted(path.iterdir())

    parts = []
    for f in files:
        try:
            raw = f.read_text(errors="ignore")
            body = extract_body(raw)
            if len(body) > 50:  # skip near-empty emails
                parts.append(body)
        except Exception:
            continue

    full_text = "\n\n".join(parts)
    return {
        "thread_id": f"{employee}_{folder}",
        "subject": display_name,
        "body": full_text,
        "email_count": len(parts),
        "total_chars": len(full_text),
    }


def main():
    output = []
    for employee, folder, display_name in SOURCES:
        source = build_source(employee, folder, display_name)
        output.append(source)
        print(f"  {source['thread_id']}: {source['email_count']} emails, "
              f"{source['total_chars']} chars — {display_name}")

    out_path = OUT_DIR / "enron_threads.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(output)} sources → {out_path}")


if __name__ == "__main__":
    main()
