/**
 * evaluateClassifiers.ts
 *
 * Experiment 4 — Classification Accuracy
 * Runs Option A (zero-shot) and Option C (few-shot) Gemini classifiers
 * against the four-class test sets and reports precision, recall, F1.
 *
 * Outputs:
 *   data/results_pure_test.json
 *   data/results_rfi.json
 *   data/experiment4_report.txt  (copy-paste into your paper)
 *
 * Usage:
 *   $env:GEMINI_API_KEY="your-key"
 *   npx tsx scripts/evaluateClassifiers.ts
 */

import * as fs from "fs";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const CLASSES = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"] as const;
type Class = typeof CLASSES[number];

// ── Option A: Zero-shot prompt ───────────────────────────────────────────
const ZERO_SHOT = (sentence: string) =>
  `Classify this sentence into exactly one of: REQUIREMENT, DECISION, CONSTRAINT, NOISE.
Return ONLY the label. No explanation.
Sentence: "${sentence.slice(0, 500)}"`;

// ── Option C: Few-shot prompt ────────────────────────────────────────────
const FEW_SHOT = (sentence: string) =>
  `Classify the following sentence into exactly one of these four classes:
REQUIREMENT, DECISION, CONSTRAINT, NOISE.

REQUIREMENT — System capability using shall/must/will/should.
  Example: "The system shall allow password reset via email."
DECISION — Design choice already made, past tense.
  Example: "OAuth 2.0 has been selected for authentication."
CONSTRAINT — External limitation: budget, regulation, platform, time.
  Example: "The system must comply with GDPR."
NOISE — Section headers, filler, metadata, logistics.
  Example: "This document was last updated in March 2023."

Rules: If uncertain between DECISION/REQUIREMENT, choose REQUIREMENT.
Return ONLY the label word. No explanation. No punctuation.

Sentence: "${sentence.slice(0, 500)}"`;

async function classify(prompt: string, fallback: string): Promise<Class> {
  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toUpperCase().replace(/[^A-Z]/g, "");
    for (const cls of CLASSES) {
      if (raw.includes(cls)) return cls;
    }
    return fallback as Class;
  } catch {
    return fallback as Class;
  }
}

// ── Metrics ───────────────────────────────────────────────────────────────
function computeMetrics(
  predictions: string[],
  groundTruth: string[]
): Record<string, { precision: number; recall: number; f1: number; support: number }> {
  const metrics: Record<string, { tp: number; fp: number; fn: number; support: number }> = {};
  
  for (const cls of CLASSES) {
    metrics[cls] = { tp: 0, fp: 0, fn: 0, support: 0 };
  }

  for (let i = 0; i < groundTruth.length; i++) {
    const gt = groundTruth[i];
    const pred = predictions[i];
    if (metrics[gt]) metrics[gt].support++;
    if (pred === gt) {
      if (metrics[gt]) metrics[gt].tp++;
    } else {
      if (metrics[gt]) metrics[gt].fn++;
      if (metrics[pred]) metrics[pred].fp++;
    }
  }

  const result: Record<string, { precision: number; recall: number; f1: number; support: number }> = {};
  for (const cls of CLASSES) {
    const { tp, fp, fn, support } = metrics[cls];
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1        = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    result[cls] = { precision, recall, f1, support };
  }

  return result;
}

function macroF1(metrics: Record<string, { f1: number }>): number {
  const values = Object.values(metrics).map(m => m.f1);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function binaryF1(predictions: string[], groundTruth: string[]): number {
  // Collapse to binary: REQUIREMENT vs NOT
  const bPred = predictions.map(p => p === "REQUIREMENT" ? "REQ" : "NOT");
  const bGT   = groundTruth.map(g => g === "REQUIREMENT" ? "REQ" : "NOT");
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < bGT.length; i++) {
    if (bPred[i] === "REQ" && bGT[i] === "REQ") tp++;
    else if (bPred[i] === "REQ" && bGT[i] === "NOT") fp++;
    else if (bPred[i] === "NOT" && bGT[i] === "REQ") fn++;
  }
  const p = tp + fp > 0 ? tp / (tp + fp) : 0;
  const r = tp + fn > 0 ? tp / (tp + fn) : 0;
  return p + r > 0 ? 2 * p * r / (p + r) : 0;
}

function formatTable(
  metrics: Record<string, { precision: number; recall: number; f1: number; support: number }>
): string {
  const header = `${"Class".padEnd(14)} ${"Precision".padEnd(10)} ${"Recall".padEnd(10)} ${"F1".padEnd(10)} Support`;
  const sep = "-".repeat(60);
  const rows = CLASSES.map(cls => {
    const m = metrics[cls];
    return `${cls.padEnd(14)} ${m.precision.toFixed(3).padEnd(10)} ${m.recall.toFixed(3).padEnd(10)} ${m.f1.toFixed(3).padEnd(10)} ${m.support}`;
  });
  return [header, sep, ...rows].join("\n");
}

// ── Evaluate one dataset with one classifier ──────────────────────────────
async function evaluate(
  dataset: Array<{ sentence: string; four_class_label: string }>,
  classifierName: string,
  promptFn: (s: string) => string,
  outputPath: string
): Promise<{ metrics: Record<string, any>; macro: number; binary: number }> {
  
  // Resume from existing
  let existing: Array<{ sentence: string; predicted: string }> = [];
  if (fs.existsSync(outputPath)) {
    existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  }
  const done = new Set(existing.map(e => e.sentence));

  console.log(`  ${classifierName}: ${existing.length}/${dataset.length} already done`);

  for (const row of dataset) {
    if (done.has(row.sentence)) continue;
    const defaultFallback = row.four_class_label; // use GT as fallback (won't affect accuracy)
    const predicted = await classify(promptFn(row.sentence), defaultFallback);
    existing.push({ sentence: row.sentence, predicted });
    done.add(row.sentence);

    if (existing.length % 25 === 0) {
      console.log(`    ${existing.length}/${dataset.length}`);
      fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));
    }
    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

  const predictions = dataset.map(row => {
    const found = existing.find(e => e.sentence === row.sentence);
    return found?.predicted ?? row.four_class_label;
  });
  const groundTruth = dataset.map(row => row.four_class_label);

  const metrics = computeMetrics(predictions, groundTruth);
  const macro   = macroF1(metrics);
  const binary  = binaryF1(predictions, groundTruth);

  return { metrics, macro, binary };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function run() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY required");

  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const datasets: Record<string, string> = {
    PURE_test: path.join(dataDir, "pure_four_class_test.json"),
    RFIs:      path.join(dataDir, "rfi_four_class.json")
  };

  let report = "=== Experiment 4: Classification Accuracy ===\n\n";
  report += "Baseline (ReqExp BERT, binary, PURE): P=0.92 R=0.80 F1=0.86\n";
  report += "Baseline (GPT-4o zero-shot, binary):  Not published\n\n";

  for (const [datasetName, datasetPath] of Object.entries(datasets)) {
    if (!fs.existsSync(datasetPath)) {
      console.warn(`Skipping ${datasetName} — run relabelTest.ts first`);
      continue;
    }

    const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
    console.log(`\n=== Evaluating on ${datasetName} (${dataset.length} sentences) ===`);

    report += `\n--- Dataset: ${datasetName} ---\n`;

    for (const [optionName, promptFn] of [
      ["Option A (zero-shot)", ZERO_SHOT],
      ["Option C (few-shot)",  FEW_SHOT]
    ] as [string, (s: string) => string][]) {
      const outputPath = path.join(
        dataDir,
        `predictions_${datasetName}_${optionName.replace(/\W/g, "_")}.json`
      );

      console.log(`\nRunning ${optionName}...`);
      const { metrics, macro, binary } = await evaluate(
        dataset, optionName, promptFn, outputPath
      );

      report += `\n${optionName}:\n`;
      report += formatTable(metrics) + "\n";
      report += `Macro F1: ${macro.toFixed(3)}\n`;
      report += `Binary F1 (REQ vs NOT, for comparison with ReqExp 0.86): ${binary.toFixed(3)}\n`;

      console.log(formatTable(metrics));
      console.log(`Macro F1: ${macro.toFixed(3)}, Binary F1: ${binary.toFixed(3)}`);
    }
  }

  const reportPath = path.join(dataDir, "experiment4_report.txt");
  fs.writeFileSync(reportPath, report);
  console.log(`\nFull report saved to ${reportPath}`);
}

run().catch(console.error);