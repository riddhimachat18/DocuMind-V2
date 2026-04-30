import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * The canonical few-shot prompt from scripts/classification/4_evaluate.py.
 * This is the exact prompt that produced the 0.824 macro-F1 result.
 * DO NOT modify — any change breaks reproducibility.
 */
export const FEW_SHOT_PROMPT = `Classify the following sentence into exactly one of these four classes:
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

Sentence: "{sentence}"

Label:`;

const VALID_LABELS = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"];

export async function classifyText(
  text: string,
  geminiKey: string
): Promise<{ label: string; confidence: number }> {
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = FEW_SHOT_PROMPT.replace(
    "{sentence}",
    text.slice(0, 500).replace(/"/g, "'")
  );

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toUpperCase().split(/\s/)[0];
    const label = VALID_LABELS.find((c) => raw.startsWith(c.slice(0, 4))) ?? "NOISE";
    return { label, confidence: 0.9 };
  } catch {
    return { label: "NOISE", confidence: 0.5 };
  }
}
