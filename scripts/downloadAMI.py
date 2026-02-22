from datasets import load_dataset
import json

dataset = load_dataset("knkarthick/AMI", split="train")
output = []

for item in dataset:
    lines = item["dialogue"].split("\n")
    utterances = []
    for line in lines:
        line = line.strip()
        if not line or ": " not in line:
            continue
        parts = line.split(": ", 1)
        speaker = parts[0].strip()
        text = parts[1].strip()
        if text:
            utterances.append({
                "source": "meeting",
                "author": speaker,
                "authorRole": "Meeting Participant",
                "rawText": f"[{speaker}]: {text}",
                "timestamp": "2024-01-01T00:00:00Z",
                "classification": None
            })
    output.extend(utterances)

with open("../data/ami.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Saved {len(output)} utterances")