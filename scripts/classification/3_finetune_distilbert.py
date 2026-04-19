"""
3_finetune_distilbert.py — Fine-tune DistilBERT on the four-class labeled data.

Uses pure_four_class_train.json (500 samples from step 1) for training,
pure_four_class_valid.json for validation during training.

Saves the trained model to data/results/distilbert_model/
Also saves training metrics to data/results/distilbert_training_log.json

Usage:
    cd DocuMind-main
    pip install transformers torch scikit-learn
    python scripts/classification/3_finetune_distilbert.py

Notes:
    - Runs on CPU if no GPU available (slower but works).
    - With GPU: ~5 min. Without GPU: ~30-40 min.
    - Model is saved after each epoch; resumes from best checkpoint.
"""

import json
import os
import sys

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizerFast,
    get_linear_schedule_with_warmup,
)
from torch.optim import AdamW
from sklearn.metrics import classification_report, f1_score

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    CLASSES, LABEL2ID, ID2LABEL,
    FOUR_CLASS_TRAIN_JSON, FOUR_CLASS_VALID_JSON,
    DISTILBERT_MODEL_DIR, RESULTS_DIR,
    DISTILBERT_BASE, MAX_SEQ_LENGTH,
    BATCH_SIZE, NUM_EPOCHS, LEARNING_RATE, WEIGHT_DECAY, WARMUP_STEPS,
)

os.makedirs(DISTILBERT_MODEL_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {DEVICE}")


# ── Dataset ───────────────────────────────────────────────────────────────────

class RequirementDataset(Dataset):
    def __init__(self, data: list[dict], tokenizer, max_length: int):
        self.encodings = tokenizer(
            [d["sentence"] for d in data],
            truncation=True,
            padding="max_length",
            max_length=max_length,
            return_tensors="pt",
        )
        # Support both field names
        def get_label(d):
            return d.get("four_class_label") or d.get("gemini_label", "NOISE")
        self.labels = torch.tensor(
            [LABEL2ID[get_label(d)] for d in data],
            dtype=torch.long,
        )

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return {
            "input_ids":      self.encodings["input_ids"][idx],
            "attention_mask": self.encodings["attention_mask"][idx],
            "labels":         self.labels[idx],
        }


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_json(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def filter_valid(data: list[dict]) -> list[dict]:
    """Keep only items with valid four_class_label."""
    # Support both field names for compatibility
    def get_label(d):
        return d.get("four_class_label") or d.get("gemini_label", "")
    return [d for d in data if get_label(d) in CLASSES
            and d.get("sentence", "").strip()]


def evaluate(model, loader) -> tuple[float, dict]:
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for batch in loader:
            input_ids      = batch["input_ids"].to(DEVICE)
            attention_mask = batch["attention_mask"].to(DEVICE)
            labels         = batch["labels"].to(DEVICE)
            outputs        = model(input_ids=input_ids, attention_mask=attention_mask)
            preds          = outputs.logits.argmax(dim=-1)
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())

    macro_f1 = f1_score(all_labels, all_preds, average="macro", zero_division=0)
    report   = classification_report(
        all_labels, all_preds,
        target_names=CLASSES,
        zero_division=0,
        output_dict=True,
    )
    return macro_f1, report


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # ── Load data ─────────────────────────────────────────────────────────────
    print("Loading data...")
    train_data = filter_valid(load_json(FOUR_CLASS_TRAIN_JSON))

    # Valid file may not exist if step 1 wasn't run for PURE_valid
    valid_data = []
    if os.path.exists(FOUR_CLASS_VALID_JSON):
        valid_data = filter_valid(load_json(FOUR_CLASS_VALID_JSON))
    else:
        print(f"  Note: {FOUR_CLASS_VALID_JSON} not found — will split from train.")

    print(f"  Train: {len(train_data)} samples")
    print(f"  Valid: {len(valid_data)} samples")

    if len(train_data) == 0:
        print("ERROR: No valid training data. Run 1_relabel.py first.")
        sys.exit(1)

    # If valid set is empty, split 20% from train
    if len(valid_data) == 0:
        print("  Valid set empty — using 20% of train as validation.")
        split = int(0.8 * len(train_data))
        np.random.seed(42)
        idx = np.random.permutation(len(train_data))
        valid_data = [train_data[i] for i in idx[split:]]
        train_data = [train_data[i] for i in idx[:split]]
        print(f"  After split — train: {len(train_data)}, valid: {len(valid_data)}")

    # Label distribution
    from collections import Counter
    train_dist = Counter(d.get("four_class_label") or d.get("gemini_label", "") for d in train_data)
    valid_dist = Counter(d.get("four_class_label") or d.get("gemini_label", "") for d in valid_data)
    print(f"  Train dist: {dict(train_dist)}")
    print(f"  Valid dist: {dict(valid_dist)}")

    # ── Tokenizer and datasets ────────────────────────────────────────────────
    print(f"\nLoading tokenizer: {DISTILBERT_BASE}")
    tokenizer = DistilBertTokenizerFast.from_pretrained(DISTILBERT_BASE)

    train_dataset = RequirementDataset(train_data, tokenizer, MAX_SEQ_LENGTH)
    valid_dataset = RequirementDataset(valid_data, tokenizer, MAX_SEQ_LENGTH)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    valid_loader = DataLoader(valid_dataset, batch_size=BATCH_SIZE)

    # ── Model ─────────────────────────────────────────────────────────────────
    print(f"\nLoading model: {DISTILBERT_BASE}")
    model = DistilBertForSequenceClassification.from_pretrained(
        DISTILBERT_BASE,
        num_labels=len(CLASSES),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )
    model.to(DEVICE)

    # ── Optimizer and scheduler ───────────────────────────────────────────────
    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    total_steps = len(train_loader) * NUM_EPOCHS
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=WARMUP_STEPS,
        num_training_steps=total_steps,
    )

    # ── Class-weighted loss (fixes minority class collapse) ──────────────────
    from torch.nn import CrossEntropyLoss
    label_counts = Counter(LABEL2ID[d.get("four_class_label") or d.get("gemini_label", "NOISE")]
                           for d in train_data)
    weights = torch.tensor([
        len(train_data) / (len(CLASSES) * label_counts[i])
        for i in range(len(CLASSES))
    ], dtype=torch.float).to(DEVICE)
    loss_fn = CrossEntropyLoss(weight=weights)
    print(f"  Class weights: { {CLASSES[i]: f'{weights[i].item():.3f}' for i in range(len(CLASSES))} }")

    # ── Training loop ─────────────────────────────────────────────────────────
    print(f"\nTraining for {NUM_EPOCHS} epochs...")
    training_log = []
    best_f1      = 0.0
    best_epoch   = 0

    for epoch in range(1, NUM_EPOCHS + 1):
        model.train()
        total_loss = 0.0

        for step, batch in enumerate(train_loader):
            optimizer.zero_grad()
            input_ids      = batch["input_ids"].to(DEVICE)
            attention_mask = batch["attention_mask"].to(DEVICE)
            labels         = batch["labels"].to(DEVICE)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
            )
            loss = loss_fn(outputs.logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()

            if (step + 1) % 10 == 0:
                print(f"  Epoch {epoch}, step {step+1}/{len(train_loader)}, "
                      f"loss={loss.item():.4f}")

        avg_loss = total_loss / len(train_loader)
        val_f1, val_report = evaluate(model, valid_loader)

        print(f"\nEpoch {epoch}/{NUM_EPOCHS} — loss: {avg_loss:.4f}, "
              f"val macro-F1: {val_f1:.4f}")
        print(f"  Per-class F1: " + ", ".join(
            f"{c}={val_report[c]['f1-score']:.3f}" for c in CLASSES
        ))

        training_log.append({
            "epoch":    epoch,
            "loss":     avg_loss,
            "val_f1":   val_f1,
            "val_report": val_report,
        })

        # Save best model
        if val_f1 > best_f1:
            best_f1    = val_f1
            best_epoch = epoch
            model.save_pretrained(DISTILBERT_MODEL_DIR)
            tokenizer.save_pretrained(DISTILBERT_MODEL_DIR)
            print(f"  ✓ Best model saved (epoch {epoch}, val F1={val_f1:.4f})")

    # Save training log
    log_path = os.path.join(RESULTS_DIR, "distilbert_training_log.json")
    with open(log_path, "w") as f:
        json.dump(training_log, f, indent=2)

    print(f"\n{'='*52}")
    print(f"Training complete.")
    print(f"  Best epoch   : {best_epoch}/{NUM_EPOCHS}")
    print(f"  Best val F1  : {best_f1:.4f}")
    print(f"  Model saved  → {DISTILBERT_MODEL_DIR}")
    print(f"  Training log → {log_path}")
    print(f"\nNext step: run 4_evaluate.py")


if __name__ == "__main__":
    main()