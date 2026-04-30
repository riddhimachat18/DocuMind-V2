"""
config.py — Central configuration for all classification experiments.

Folder structure:
    DocuMind-main/
        data/
            PURE_train.csv
            PURE_test.csv
            PURE_valid.csv
            Final_dataset_RFIs.csv
            results/                         ← auto-created
                pure_four_class_train.json
                pure_four_class_test.json
                pure_four_class_valid.json
                rfi_four_class.json
                validation_sample.json
                kappa_report.txt
                experiment4_report.txt
                cross_domain_report.txt
                distilbert_model/
        scripts/
            classification/
                config.py
                1_relabel.py
                2_kappa.py
                3_finetune_distilbert.py
                4_evaluate.py
                5_cross_domain.py
"""

import os

# ── Column names (confirmed from CSV headers) ─────────────────────────────────
# PURE files header: ,Requirement,Name of Doc,Req/Not Req
# (first col is unnamed index, ignored by pandas index_col=0)
SENTENCE_COL  = "Requirement"
LABEL_COL     = "Req/Not Req"
REQ_VALUE     = "Req"        # positive class in PURE
NON_REQ_VALUE = "Not Req"    # negative class in PURE

# RFI file header: Requirement,Name of Doc,Req/Not Req,Req/Not Req
# Duplicate column name — loader reads col at position 2
RFI_SENTENCE_COL = "Requirement"
RFI_REQ_VALUES   = {"1", "yes", "Yes", "YES", "Req", "req"}

# ── Four-class taxonomy ───────────────────────────────────────────────────────
CLASSES  = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"]
LABEL2ID = {c: i for i, c in enumerate(CLASSES)}
ID2LABEL = {i: c for i, c in enumerate(CLASSES)}

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR    = "data"
RESULTS_DIR = os.path.join(DATA_DIR, "results")

PURE_TRAIN_CSV = os.path.join(DATA_DIR, "PURE_train.csv")
PURE_TEST_CSV  = os.path.join(DATA_DIR, "PURE_test.csv")
PURE_VALID_CSV = os.path.join(DATA_DIR, "PURE_valid.csv")
RFI_CSV        = os.path.join(DATA_DIR, "Final_dataset_RFIs.csv")

FOUR_CLASS_TRAIN_JSON  = os.path.join(DATA_DIR, "pure_four_class_train.json")
FOUR_CLASS_TEST_JSON   = os.path.join(DATA_DIR, "pure_four_class_test.json")
FOUR_CLASS_VALID_JSON  = os.path.join(DATA_DIR, "pure_four_class_valid.json")
RFI_FOUR_CLASS_JSON    = os.path.join(DATA_DIR, "rfi_four_class.json")
VALIDATION_SAMPLE_JSON = os.path.join(DATA_DIR, "pure_validation_sample.json")
DISTILBERT_MODEL_DIR   = os.path.join(DATA_DIR, "distilbert_model")

# ── Sampling ──────────────────────────────────────────────────────────────────
SAMPLE_REQUIREMENTS     = 200   # from Req class in PURE_train
SAMPLE_NON_REQUIREMENTS = 300   # from Not Req class (keyword-guided)
VALIDATION_SAMPLE_SIZE  = 50    # subset for human kappa annotation

# ── Gemini ────────────────────────────────────────────────────────────────────
GEMINI_MODEL   = "gemini-2.5-flash"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ── DistilBERT ────────────────────────────────────────────────────────────────
DISTILBERT_BASE = "distilbert-base-uncased"
MAX_SEQ_LENGTH  = 128
BATCH_SIZE      = 16
NUM_EPOCHS      = 4
LEARNING_RATE   = 2e-5
WEIGHT_DECAY    = 0.01
WARMUP_STEPS    = 50