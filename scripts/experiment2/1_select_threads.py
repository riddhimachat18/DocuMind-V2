"""
1_select_threads.py — Walk the Enron maildir, score emails by keyword density,
group into threads by subject, and export the top 20 candidates.

Reads from:  data/maildir/
Writes to:   data/experiment2/candidate_threads.json

Runtime: 5–15 minutes (walks ~500k files).

Usage:
    python3 scripts/experiment2/1_select_threads.py
"""

import email as email_lib
import json
import re
import warnings
warnings.filterwarnings("ignore")

from collections import defaultdict
from pathlib import Path

MAILDIR = Path("data/maildir")
OUT_DIR = Path("data/experiment2")
OUT_DIR.mkdir(parents=True, exist_ok=True)

KEYWORDS = [
    "requirement", "feature", "must have", "should have",
    "deadline", "deliverable", "scope", "stakeholder",
    "system", "interface", "constraint", "approval",
    "specification", "milestone", "budget",
]

MIN_SCORE      = 3   # minimum keyword hits per email
MIN_EMAILS     = 3   # minimum emails per thread
MIN_AGG_SCORE  = 15  # minimum aggregate score per thread
TOP_N          = 20  # candidates to export


def score_text(text: str) -> int:
    t = text.lower()
    return sum(1 for kw in KEYWORDS if kw in t)


def extract_body(msg) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    body += payload.decode("utf-8", errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            body = payload.decode("utf-8", errors="replace")
    return body


def parse_email(filepath: Path) -> dict | None:
    try:
        with open(filepath, "r", errors="replace") as f:
            msg = email_lib.message_from_file(f)
        body = extract_body(msg)
        sc = score_text(body)
        if sc < MIN_SCORE:
            return None
        return {
            "subject": msg.get("Subject", "").strip(),
            "from":    msg.get("From", "").strip(),
            "date":    msg.get("Date", "").strip(),
            "body":    body.strip(),
            "score":   sc,
        }
    except Exception:
        return None


def normalise_subject(subject: str) -> str:
    s = re.sub(r"^(re|fwd|fw):\s*", "", subject.lower().strip())
    return re.sub(r"\s+", " ", s).strip()


def main():
    print(f"Walking {MAILDIR} ...")
    all_emails = []
    skipped = 0

    for emp_dir in sorted(MAILDIR.iterdir()):
        if not emp_dir.is_dir():
            continue
        for folder in emp_dir.iterdir():
            if not folder.is_dir():
                continue
            for mail_file in folder.iterdir():
                if not mail_file.is_file():
                    continue
                parsed = parse_email(mail_file)
                if parsed:
                    all_emails.append(parsed)
                else:
                    skipped += 1

    print(f"Collected {len(all_emails)} emails with score ≥ {MIN_SCORE} "
          f"(skipped/malformed: {skipped})")

    # Group by normalised subject
    threads: dict[str, list] = defaultdict(list)
    for em in all_emails:
        norm = normalise_subject(em["subject"])
        if norm:
            threads[norm].append(em)

    # Filter by thread quality
    good = {
        subj: emails for subj, emails in threads.items()
        if len(emails) >= MIN_EMAILS
        and sum(e["score"] for e in emails) >= MIN_AGG_SCORE
    }
    print(f"Found {len(good)} qualifying threads "
          f"(≥{MIN_EMAILS} emails, aggregate score ≥{MIN_AGG_SCORE})")

    # Sort by aggregate score, take top N
    sorted_threads = sorted(
        good.items(),
        key=lambda x: sum(e["score"] for e in x[1]),
        reverse=True,
    )[:TOP_N]

    output = []
    for subj, emails in sorted_threads:
        output.append({
            "thread_subject":  subj,
            "email_count":     len(emails),
            "aggregate_score": sum(e["score"] for e in emails),
            "emails":          sorted(emails, key=lambda e: e["date"]),
        })

    out_path = OUT_DIR / "candidate_threads.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nExported {len(output)} candidate threads → {out_path}")
    print("Next: run 2_review_candidates.py to preview and pick 15.")


if __name__ == "__main__":
    main()
