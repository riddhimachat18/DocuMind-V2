/**
 * relabelPURE.ts
 *
 * Takes Ivanov et al.'s binary-labeled PURE dataset and relabels
 * sentences to four-class taxonomy using few-shot Gemini.
 *
 * Input:  PURE_train.csv  (columns: sentence, label)
 * Output: data/pure_four_class_train.json
 *         data/pure_validation_sample.json  (50 random for manual check)
 *
 * Usage:
 *   $env:GEMINI_API_KEY="your-key"
 *   npx tsx scripts/relabelPURE.ts
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── CONFIG ─────────────────────────────────────────────────────────────────
const TRAIN_CSV   = path.join(process.cwd(), "data", "PURE_train.csv");
const OUTPUT_JSON = path.join(process.cwd(), "data", "pure_four_class_train.json");
const VALIDATION_JSON = path.join(process.cwd(), "data", "pure_validation_sample.json");

const SAMPLE_REQUIREMENTS     = 200; // these should be REQUIREMENT
const SAMPLE_NON_REQUIREMENTS = 300; // sample more to find rare classes
const VALIDATION_SIZE         = 50;  // for manual kappa check

// Adjust these if your CSV has different column names
const SENTENCE_COL = "Requirement";       // ← was "sentence"
const LABEL_COL    = "Req/Not Req";       // ← was "label"
const REQ_VALUE    = "1";                 // ← was "requirement", now "1"
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

interface InputRow {
  [key: string]: string;
}

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
    // Fallback: use original binary label
    return originalLabel === REQ_VALUE ? "REQUIREMENT" : "NOISE";
  } catch (e: any) {
    console.warn(`Classification failed for sentence: ${e.message}`);
    return originalLabel === REQ_VALUE ? "REQUIREMENT" : "NOISE";
  }
}

async function run() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  // ── Load CSV ──────────────────────────────────────────────────────────────
  console.log(`Loading ${TRAIN_CSV}...`);
  const raw = fs.readFileSync(TRAIN_CSV, "utf8");
  const rows: InputRow[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,   // ← add this
    bom: true                   // ← handles any BOM characters
});
  console.log(`Loaded ${rows.length} rows`);

  // ── Stratified sample ────────────────────────────────────────────────────
  const requirements = rows
    .filter(r => r[LABEL_COL]?.toLowerCase() === REQ_VALUE)
    .slice(0, SAMPLE_REQUIREMENTS);

  // For non-requirements, oversample sentences likely to be DECISION or CONSTRAINT
  const allNonReq = rows.filter(r => r[LABEL_COL]?.toLowerCase() !== REQ_VALUE);

  const likelyDecision = allNonReq.filter(r => {
    const s = (r[SENTENCE_COL] ?? "").toLowerCase();
    return s.includes("decided") || s.includes("selected") ||
           s.includes("will use") || s.includes("was agreed") ||
           s.includes("has been chosen") || s.includes("architecture");
  }).slice(0, 50);

  const likelyConstraint = allNonReq.filter(r => {
    const s = (r[SENTENCE_COL] ?? "").toLowerCase();
    return s.includes("only") || s.includes("must not") ||
           s.includes("limited to") || s.includes("comply") ||
           s.includes("budget") || s.includes("deadline") ||
           s.includes("not allowed") || s.includes("restricted");
  }).slice(0, 50);

  const remaining = allNonReq
    .filter(r => !likelyDecision.includes(r) && !likelyConstraint.includes(r))
    .slice(0, SAMPLE_NON_REQUIREMENTS - likelyDecision.length - likelyConstraint.length);

  const sample = [...requirements, ...likelyDecision, ...likelyConstraint, ...remaining];
  console.log(`Sample breakdown: ${requirements.length} req + ${likelyDecision.length} likely-decision + ${likelyConstraint.length} likely-constraint + ${remaining.length} other = ${sample.length} total`);

  // ── Incremental output ───────────────────────────────────────────────────
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

  // Resume from existing output if interrupted
  let results: OutputRow[] = [];
  if (fs.existsSync(OUTPUT_JSON)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf8"));
    console.log(`Resuming from ${results.length} existing results`);
  }
  const processedSentences = new Set(results.map(r => r.sentence));

  // ── Classify ─────────────────────────────────────────────────────────────
  let processed = results.length;
  for (const row of sample) {
    const sentence = row[SENTENCE_COL]?.trim();
    if (!sentence || processedSentences.has(sentence)) continue;

    const originalLabel = row[LABEL_COL]?.toLowerCase() ?? "non-requirement";
    const fourClass = await classifySentence(sentence, originalLabel);

    results.push({
      sentence,
      original_label: originalLabel,
      four_class_label: fourClass
    });
    processedSentences.add(sentence);
    processed++;

    if (processed % 25 === 0) {
      console.log(`${processed}/${sample.length} — last label: ${fourClass}`);
      fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // ── Final save ────────────────────────────────────────────────────────────
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));

  // ── Validation sample (50 random for manual kappa check) ─────────────────
  const shuffled = [...results].sort(() => Math.random() - 0.5);
  const validationSample = shuffled.slice(0, VALIDATION_SIZE);
  fs.writeFileSync(VALIDATION_JSON, JSON.stringify(validationSample, null, 2));

  // ── Distribution report ───────────────────────────────────────────────────
  const dist: Record<string, number> = {};
  results.forEach(r => {
    dist[r.four_class_label] = (dist[r.four_class_label] ?? 0) + 1;
  });

  console.log("\n=== Label Distribution ===");
  Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, count]) => {
      console.log(`  ${label}: ${count} (${((count / results.length) * 100).toFixed(1)}%)`);
    });

  console.log(`\nDone.`);
  console.log(`  Main output:        ${OUTPUT_JSON}`);
  console.log(`  Validation sample:  ${VALIDATION_JSON}`);
  console.log(`\nNext step: manually check ${VALIDATION_JSON} and compute Cohen's kappa.`);
}

run().catch(console.error);