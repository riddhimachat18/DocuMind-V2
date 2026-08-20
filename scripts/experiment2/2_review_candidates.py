"""
2_review_candidates.py — Build selected_threads.json from a curated list of
high-signal maildir folders + the best subject-threaded candidates.

This replaces the manual KEEP selection from candidate_threads.json.
The 15 sources are:

  Folder-based (10) — project/system folders with proven keyword density:
    hyatt-k/projects              infrastructure projects
    beck-s/eol_access             Enron Online system access management
    beck-s/sap                    SAP ERP system rollout
    kean-s/mckinsey_project       McKinsey consulting project
    sanders-r/project_stanley     Project Stanley (regulatory/legal requirements)
    scott-s/msap_info             MSAP trading platform
    kean-s/project_california     California energy project
    griffith-j/design             Design work
    blair-l/tw___transactional_requirements  TW transactional requirements
    campbell-l/sundevil_pipeline_project     Sundevil pipeline project

  Subject-threaded (5) — from candidate_threads.json:
    [07] weekend outage report    IT system availability / maintenance
    [10] credit applications in grms  GRMS project resource/system requirements
    [17] caithness big sandy llc  Infrastructure project requirements
    [18] summary of commission meeting  FERC strategic/business plan
    [19] fea announces @energy 2.0  Software product release / system features

Reads from:
    data/maildir/                         (folder-based sources)
    data/experiment2/candidate_threads.json  (subject-threaded sources)

Writes to:
    data/experiment2/selected_threads.json

Usage:
    python3 scripts/experiment2/2_review_candidates.py
"""

import json
import re
from pathlib import Path

MAILDIR = Path("data/maildir")
OUT_DIR = Path("data/experiment2")

# ── Folder-based sources ──────────────────────────────────────────────────────
FOLDER_SOURCES = [
    ("hyatt-k",    "projects",                      "Infrastructure Projects"),
    ("beck-s",     "eol_access",                    "Enron Online Access Management"),
    ("beck-s",     "sap",                           "SAP ERP System Rollout"),
    ("kean-s",     "mckinsey_project",              "McKinsey Consulting Project"),
    ("sanders-r",  "project_stanley",               "Project Stanley"),
    ("scott-s",    "msap_info",                     "MSAP Trading Platform"),
    ("kean-s",     "project_california",            "California Energy Project"),
    ("davis-d",    "sap",                           "SAP Technical Architecture"),
    ("blair-l",    "tw___transactional_requirements", "TW Transactional Requirements"),
    ("campbell-l", "sundevil_pipeline_project",     "Sundevil Pipeline Project"),
]

# ── Subject-threaded sources (indices into candidate_threads.json) ────────────
CANDIDATE_KEEP = [7, 10, 17, 18, 19]


def extract_body(raw: str) -> str:
    body_start = raw.find("\n\n")
    body = raw[body_start:].strip() if body_start >= 0 else raw.strip()
    body = re.sub(r"-{5,}.*?-{5,}", " ", body, flags=re.DOTALL)
    body = re.sub(
        r"^\s*(From|To|Cc|Bcc|Subject|Date|Sent|Message-ID):\s*.+\n?",
        "", body, flags=re.MULTILINE
    )
    return re.sub(r"\n{3,}", "\n\n", body).strip()


def build_folder_thread(employee: str, folder: str, display_name: str) -> dict:
    path = MAILDIR / employee / folder
    if not path.exists():
        print(f"  WARNING: {path} not found, skipping")
        return {}

    emails = []
    for f in sorted(path.iterdir()):
        try:
            raw = f.read_text(errors="ignore")
            body = extract_body(raw)
            if len(body) > 50:
                emails.append({
                    "subject": display_name,
                    "from":    f"{employee}@enron.com",
                    "date":    "",
                    "body":    body,
                    "score":   0,
                })
        except Exception:
            continue

    if not emails:
        print(f"  WARNING: no usable emails in {employee}/{folder}")
        return {}

    total_chars = sum(len(e["body"]) for e in emails)
    print(f"  {employee}/{folder}: {len(emails)} emails, {total_chars} chars — {display_name}")
    return {
        "thread_subject": display_name,
        "email_count":    len(emails),
        "aggregate_score": 0,
        "emails":         emails,
        "source":         f"{employee}/{folder}",
    }


def main():
    selected = []

    # ── Folder-based sources ──────────────────────────────────────────────────
    print("Building folder-based sources...")
    for employee, folder, display_name in FOLDER_SOURCES:
        thread = build_folder_thread(employee, folder, display_name)
        if thread:
            selected.append(thread)

    # ── Subject-threaded sources ──────────────────────────────────────────────
    candidates_path = OUT_DIR / "candidate_threads.json"
    if candidates_path.exists():
        print("\nAdding subject-threaded sources from candidate_threads.json...")
        with open(candidates_path, encoding="utf-8") as f:
            candidates = json.load(f)
        for idx in CANDIDATE_KEEP:
            if idx < len(candidates):
                t = candidates[idx]
                print(f"  [{idx:02d}] {t['thread_subject'][:60]} "
                      f"({t['email_count']} emails, score {t['aggregate_score']})")
                selected.append(t)
            else:
                print(f"  WARNING: index {idx} out of range in candidate_threads.json")
    else:
        print("\nWARNING: candidate_threads.json not found — "
              "run 1_select_threads.py first if you want the subject-threaded sources.")

    if len(selected) != 15:
        print(f"\nWARNING: expected 15 threads, got {len(selected)}")

    out_path = OUT_DIR / "selected_threads.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(selected, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(selected)} threads → {out_path}")
    print("Next: run 3_segment_for_annotation.py")


if __name__ == "__main__":
    main()
