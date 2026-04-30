/**
 * relabelTest.ts
 *
 * Relabels PURE_test.csv and Final_dataset_RFIs.csv to four-class
 * using the same few-shot Gemini prompt as relabelPURE.ts.
 * These become evaluation sets for Experiment 4.
 *
 * Usage:
 *   $env:GEMINI_API_KEY="your-key"
 *   npx tsx scripts/relabelTest.ts
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── CONFIG ─────────────────────────────────────────────────────────────────
const FILES = [
  {
    input:  path.join(process.cwd(), "data", "PURE_test.csv"),
    output: path.join(process.cwd(), "data", "pure_four_class_test.json"),
    name:   "PURE_test"
  },
  {
    input:  path.join(process.cwd(), "data", "Final_dataset_RFIs.csv"),
    output: path.join(process.cwd(), "data", "rfi_four_class.json"),
    name:   "RFIs"
  }
];

const SENTENCE_COL = "sentence";
const LABEL_COL    = "label";
const REQ_VALUE    = "requirement";
// ───────────────────────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const FEW_SHOT_PROMPT = `Classify the following sentence into exactly one of these four classes:
REQUIREMENT, DECISION, CONSTRAINT, NOISE.

Definitions and examples:

REQUIREMENT — A functional or non-functional capability the system must provide.
Usually contains modal verbs: shall, must, will, should, needs to.
Examples:
  - "The system shall allow users to reset their password via email."
  - "The application must support offline mode for mobile users."
  - "Response time shall not exceed 200ms under normal load."

DECISION — A design or architectural choice already made. Past tense or
definitive statements about technology, approach, or design selected.
Examples:
  - "The team decided to use PostgreSQL as the primary database."
  - "OAuth 2.0 has been selected for authentication."
  - "The architecture will follow a microservices pattern."
  - "Access to the database will be via the training application rather than the production application."
  - "The system will use a three-tier architecture."
  - "It was agreed that React will be used for the frontend."

CONSTRAINT — A limitation, boundary, or restriction imposed from outside
the system — budget, regulatory, time, platform, or organisational.
Examples:
  - "The system must comply with GDPR data protection regulations."
  - "The project budget is capped at $200,000."
  - "The solution must be deployable on Google Cloud Platform only."
  - "Development must be completed by Q3 2024."
  - "Access to the DBMS may only be via the training application, not the production system."
  - "The system is limited to operating within the existing network infrastructure."
  - "Only approved third-party libraries may be used."

NOISE — Everything else: greetings, meeting logistics, filler text, 
section headers, metadata, opinions without requirement content.
Examples:
  - "Please find the agenda attached."
  - "This document was last updated on March 2023."
  - "The following section describes the system overview."
  - "Thank you for your participation."

Rules:
- If a sentence has both requirement and constraint content, choose REQUIREMENT.
- If uncertain between DECISION and REQUIREMENT, look for past tense or "will be/has been selected/decided/agreed" → DECISION.
- If the sentence describes an external limitation or boundary NOT under the system's control → CONSTRAINT.
- If the sentence uses "shall/must/should" for a system capability → REQUIREMENT.
- Non-requirements from the original dataset can be CONSTRAINT, DECISION, or NOISE.
- Return ONLY the label word. No explanation. No punctuation.
`;

interface OutputRow {
  sentence: string;
  original_label: string;
  four_class_label: string;
}

async function classifySentence(
  sentence: string,
  originalLabel: string
): Promise<string> {
  const prompt = FEW_SHOT_PROMPT + `"${sentence.slice(0, 500)}"`;
  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (raw.includes("REQUIREMENT")) return "REQUIREMENT";
    if (raw.includes("DECISION"))    return "DECISION";
    if (raw.includes("CONSTRAINT"))  return "CONSTRAINT";
    if (raw.includes("NOISE"))       return "NOISE";
    return originalLabel === REQ_VALUE ? "REQUIREMENT" : "NOISE";
  } catch {
    return originalLabel === REQ_VALUE ? "REQUIREMENT" : "NOISE";
  }
}

async function processFile(
  inputPath: string,
  outputPath: string,
  name: string
) {
  console.log(`\n=== Processing ${name} ===`);
  const raw = fs.readFileSync(inputPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Loaded ${rows.length} rows`);

  // Resume if interrupted
  let results: OutputRow[] = [];
  if (fs.existsSync(outputPath)) {
    results = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    console.log(`Resuming from ${results.length} existing results`);
  }
  const processed = new Set(results.map((r: OutputRow) => r.sentence));

  let count = results.length;
  for (const row of rows) {
    const sentence = row[SENTENCE_COL]?.trim();
    if (!sentence || processed.has(sentence)) continue;

    const originalLabel = row[LABEL_COL]?.toLowerCase() ?? "non-requirement";
    const fourClass = await classifySentence(sentence, originalLabel);

    results.push({ sentence, original_label: originalLabel, four_class_label: fourClass });
    processed.add(sentence);
    count++;

    if (count % 25 === 0) {
      console.log(`  ${count}/${rows.length}`);
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    }

    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  // Distribution
  const dist: Record<string, number> = {};
  results.forEach(r => { dist[r.four_class_label] = (dist[r.four_class_label] ?? 0) + 1; });
  console.log(`Distribution for ${name}:`);
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([l, c]) => {
    console.log(`  ${l}: ${c} (${((c / results.length) * 100).toFixed(1)}%)`);
  });
  console.log(`Saved to ${outputPath}`);
}

async function run() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY required");
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

  for (const file of FILES) {
    if (!fs.existsSync(file.input)) {
      console.warn(`Skipping ${file.name} — file not found: ${file.input}`);
      continue;
    }
    await processFile(file.input, file.output, file.name);
  }

  console.log("\nAll done. Next: run evaluateClassifiers.ts");
}

run().catch(console.error);