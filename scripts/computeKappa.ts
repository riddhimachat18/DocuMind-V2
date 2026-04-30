/**
 * computeKappa.ts
 *
 * Computes Cohen's kappa between Gemini four_class_label and human_label
 * from data/pure_validation_sample.json.
 *
 * Usage:
 *   npx tsx scripts/computeKappa.ts
 */

import * as fs from "fs";
import * as path from "path";

const INPUT = path.join(process.cwd(), "data", "pure_validation_sample.json");

interface Row {
  sentence: string;
  original_label: string;
  four_class_label: string;
  human_label: string;
}

const LABELS = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"];

function computeKappa(rows: Row[]): void {
  const valid = rows.filter(r => r.four_class_label && r.human_label);

  if (valid.length === 0) {
    console.error("No rows with both four_class_label and human_label found.");
    process.exit(1);
  }

  const n = valid.length;

  // Build confusion matrix: matrix[human][gemini]
  const matrix: Record<string, Record<string, number>> = {};
  for (const l of LABELS) {
    matrix[l] = {};
    for (const m of LABELS) matrix[l][m] = 0;
  }

  let agreements = 0;
  for (const row of valid) {
    const h = row.human_label.toUpperCase();
    const g = row.four_class_label.toUpperCase();
    if (matrix[h] && matrix[h][g] !== undefined) {
      matrix[h][g]++;
    }
    if (h === g) agreements++;
  }

  const po = agreements / n;

  // Expected agreement
  const rowSums: Record<string, number> = {};
  const colSums: Record<string, number> = {};
  for (const l of LABELS) {
    rowSums[l] = LABELS.reduce((s, m) => s + matrix[l][m], 0);
    colSums[l] = LABELS.reduce((s, m) => s + matrix[m][l], 0);
  }

  const pe = LABELS.reduce((s, l) => s + (rowSums[l] / n) * (colSums[l] / n), 0);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);

  // Per-class precision / recall / F1
  console.log(`\nCohen's Kappa Report`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Samples evaluated : ${n}`);
  console.log(`Observed agreement: ${(po * 100).toFixed(1)}%`);
  console.log(`Expected agreement: ${(pe * 100).toFixed(1)}%`);
  console.log(`Cohen's kappa     : ${kappa.toFixed(4)}`);
  console.log(`Interpretation    : ${interpret(kappa)}`);

  console.log(`\nConfusion matrix (rows=human, cols=Gemini):`);
  const header = "          " + LABELS.map(l => l.padStart(12)).join("");
  console.log(header);
  for (const h of LABELS) {
    const row = LABELS.map(g => String(matrix[h][g]).padStart(12)).join("");
    console.log(`${h.padEnd(10)}${row}`);
  }

  console.log(`\nPer-class metrics:`);
  console.log(`${"Label".padEnd(14)}${"Precision".padStart(10)}${"Recall".padStart(10)}${"F1".padStart(10)}${"Support".padStart(10)}`);
  for (const l of LABELS) {
    const tp = matrix[l][l];
    const fp = LABELS.reduce((s, h) => s + (h !== l ? matrix[h][l] : 0), 0);
    const fn = LABELS.reduce((s, g) => s + (g !== l ? matrix[l][g] : 0), 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1        = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    console.log(
      `${l.padEnd(14)}${(precision * 100).toFixed(1).padStart(9)}%${(recall * 100).toFixed(1).padStart(9)}%${(f1 * 100).toFixed(1).padStart(9)}%${String(rowSums[l]).padStart(10)}`
    );
  }
  console.log();
}

function interpret(k: number): string {
  if (k < 0)    return "Poor (worse than chance)";
  if (k < 0.20) return "Slight";
  if (k < 0.40) return "Fair";
  if (k < 0.60) return "Moderate";
  if (k < 0.80) return "Substantial";
  return "Almost perfect";
}

const rows: Row[] = JSON.parse(fs.readFileSync(INPUT, "utf8"));
computeKappa(rows);
