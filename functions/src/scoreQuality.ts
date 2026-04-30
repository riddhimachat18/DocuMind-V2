/**
 * DocuMind — Rigorous Quality Scoring Engine
 * Deterministic, rule-based, modular. Each dimension is independently testable.
 */

import { IndependentQualityScorer } from "./independentQualityScorer.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BrdSections {
  executiveSummary?: string;
  stakeholderRegister?: string;
  functionalReqs?: string;
  nfrReqs?: string;
  assumptions?: string;
  successMetrics?: string;
  externalInterfaces?: string;
  useCases?: string;
  glossary?: string;
  [key: string]: string | undefined;
}

export interface BrdInput {
  sections: BrdSections;
  openConflictCount?: number;
  diagramCoverage?: number;
  version?: string;
}

export interface CompletenessBreakdown {
  ieee830: number;
  acceptanceCriteria: number;
  stakeholders: number;
  metrics: number;
}

export interface ConsistencyBreakdown {
  startScore: number;
  conflictDeductions: number;
  vagueWordDeductions: number;
  terminologyDeductions: number;
}

export interface FrScore {
  id: string;
  verbCheck: boolean;
  objectCheck: boolean;
  wordCount: number;
  deduction: number;
}

export interface ClarityBreakdown {
  frScores: FrScore[];
  totalDeduction: number;
}

export interface QualityScoreResult {
  composite: number;
  completeness: { total: number; breakdown: CompletenessBreakdown };
  consistency: { total: number; breakdown: ConsistencyBreakdown };
  clarity: { total: number; breakdown: ClarityBreakdown };
  grade: "A" | "B" | "C" | "D" | "F";
  timestamp: string;
  brdVersion: string;
  evaluationMethod?: 'independent' | 'deterministic';
  reasoning?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasMinWords(text: string | undefined, min = 50): boolean {
  if (!text || text.trim().length < 10) return false;
  const fillers = ["section could not be generated", "to be determined", "tbd", "n/a", "none"];
  if (fillers.some(f => text.trim().toLowerCase().startsWith(f))) return false;
  return wordCount(text) >= min;
}

function extractFrLines(text: string): string[] {
  return (text || "").split("\n")
    .map(l => l.trim())
    .filter(l => /^FR-\d+/i.test(l));
}

function extractMetricLines(text: string): string[] {
  return (text || "").split("\n")
    .map(l => l.trim())
    .filter(l => /^METRIC-\d+/i.test(l) || l.includes("|"));
}

// ── STEP 1: Completeness (40 pts) ─────────────────────────────────────────────
export function scoreCompleteness(brd: BrdInput): { total: number; breakdown: CompletenessBreakdown } {
  const s = brd.sections;

  // IEEE 830 Section Presence (20 pts) — 9 sections, 2.22 pts each
  const SECTION_IDS = [
    "executiveSummary", "stakeholderRegister", "functionalReqs", "nfrReqs",
    "assumptions", "successMetrics", "externalInterfaces", "useCases", "glossary",
  ];
  const presentCount = SECTION_IDS.filter(id => hasMinWords(s[id], 50)).length;
  const ieee830 = Math.max(0, Math.round((presentCount / 9) * 20 * 10) / 10);

  // Measurable Acceptance Criteria (10 pts)
  const frLines = extractFrLines(s.functionalReqs || "");
  let acceptanceCriteria = 0;
  if (frLines.length > 0) {
    const withCriteria = frLines.filter(fr =>
      /\d+(\.\d+)?(%|ms|s|sec|min|hour|day|week|month|year|users?|requests?|calls?|kb|mb|gb)|\bpass\b|\bfail\b|\bwithin\b|\bat least\b|\bat most\b|\bno more than\b|\bno less than\b/i.test(fr)
    ).length;
    acceptanceCriteria = Math.round((withCriteria / frLines.length) * 10 * 10) / 10;
  }

  // Stakeholder Register (5 pts)
  const stakeholderText = s.stakeholderRegister || "";
  const stakeholderLines = stakeholderText.split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 15 && (l.includes("|") || l.includes("—") || l.includes("-")));
  let stakeholders = 0;
  if (stakeholderLines.length >= 3) stakeholders = 5;
  else if (stakeholderLines.length === 2) stakeholders = 3;
  else if (stakeholderLines.length === 1) stakeholders = 1;

  // Success Metrics Quantifiability (5 pts)
  const metricLines = extractMetricLines(s.successMetrics || "");
  let metrics = 0;
  if (metricLines.length > 0) {
    const quantified = metricLines.filter(m =>
      /\d+(\.\d+)?(%|ms|s|sec|min|hour|day|week|month|year|users?|requests?|kb|mb|gb|\bpercent\b|\bseconds?\b|\bminutes?\b)/i.test(m)
    ).length;
    metrics = Math.round((quantified / metricLines.length) * 5 * 10) / 10;
  }

  const total = Math.min(40, Math.round((ieee830 + acceptanceCriteria + stakeholders + metrics) * 10) / 10);
  return { total, breakdown: { ieee830, acceptanceCriteria, stakeholders, metrics } };
}

// ── STEP 2: Consistency (40 pts) ──────────────────────────────────────────────
export function scoreConsistency(brd: BrdInput): { total: number; breakdown: ConsistencyBreakdown } {
  const startScore = 40;
  const allText = Object.values(brd.sections).join(" ").toLowerCase();

  // Conflict deductions: 8 pts per open conflict
  const openConflicts = brd.openConflictCount ?? 0;
  const conflictDeductions = Math.min(40, openConflicts * 8);

  // Vague language: 3 pts per distinct vague word type found
  const VAGUE_WORDS = [
    "maybe", "should", "might", "could", "typically", "generally",
    "usually", "often", "sometimes", "approximately", "various",
  ];
  const foundVague = VAGUE_WORDS.filter(w => new RegExp(`\\b${w}\\b`, "i").test(allText));
  const vagueWordDeductions = Math.min(33, foundVague.length * 3);

  // Terminology inconsistency: 5 pts per synonym group with >1 variant
  const SYNONYM_GROUPS = [
    ["user", "customer", "client"],
    ["system", "application", "platform", "tool"],
    ["requirement", "need", "feature"],
    ["stakeholder", "sponsor", "owner"],
  ];
  let terminologyDeductions = 0;
  for (const group of SYNONYM_GROUPS) {
    const found = group.filter(term => new RegExp(`\\b${term}\\b`, "i").test(allText));
    if (found.length > 1) terminologyDeductions += 5;
  }
  terminologyDeductions = Math.min(20, terminologyDeductions);

  const total = Math.max(0, startScore - conflictDeductions - vagueWordDeductions - terminologyDeductions);
  return {
    total,
    breakdown: { startScore, conflictDeductions, vagueWordDeductions, terminologyDeductions },
  };
}

// ── STEP 3: Clarity (20 pts) ──────────────────────────────────────────────────
export function scoreClarity(brd: BrdInput): { total: number; breakdown: ClarityBreakdown } {
  const frLines = extractFrLines(brd.sections.functionalReqs || "");
  const MODAL_VERBS = /\b(shall|must|will|is required to)\b/i;
  // Named components, roles, or data entities — anything capitalized or quoted
  const SPECIFIC_OBJECT = /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*|"[^"]+"|'[^']+')\b/;

  let totalDeduction = 0;
  const frScores: FrScore[] = [];

  for (const fr of frLines) {
    const id = (fr.match(/^(FR-\d+)/i) || ["", "FR-?"])[1];
    const verbCheck = MODAL_VERBS.test(fr);
    const objectCheck = SPECIFIC_OBJECT.test(fr);
    const wc = wordCount(fr);

    let deduction = 0;
    if (!verbCheck && !objectCheck) deduction += 2;
    else if (!verbCheck || !objectCheck) deduction += 1;

    if (wc < 15) deduction += 0.5;
    else if (wc > 40) deduction += 0.5;

    totalDeduction += deduction;
    frScores.push({ id, verbCheck, objectCheck, wordCount: wc, deduction });
  }

  const total = Math.max(0, Math.round((20 - totalDeduction) * 10) / 10);
  return { total, breakdown: { frScores, totalDeduction } };
}

// ── STEP 4: Composite ─────────────────────────────────────────────────────────
export async function computeQualityScore(brd: BrdInput, apiKey?: string): Promise<QualityScoreResult> {
  // Try independent quality scoring first if API key is provided
  if (apiKey) {
    try {
      return await computeQualityScoreWithIndependentEvaluator(brd, apiKey);
    } catch (error) {
      console.warn("Independent quality scoring failed, falling back to deterministic method:", error);
      // Fall through to deterministic scoring
    }
  }

  // Deterministic scoring (fallback or when no API key provided)
  return computeQualityScoreDeterministic(brd);
}

// ── Deterministic Quality Scoring (Fallback Method) ───────────────────────────
export function computeQualityScoreDeterministic(brd: BrdInput): QualityScoreResult {
  const completeness = scoreCompleteness(brd);
  const consistency = scoreConsistency(brd);
  const clarity = scoreClarity(brd);

  const composite = Math.min(100, Math.round(
    completeness.total + consistency.total + clarity.total
  ));

  const grade: QualityScoreResult["grade"] =
    composite >= 85 ? "A" :
    composite >= 70 ? "B" :
    composite >= 55 ? "C" :
    composite >= 40 ? "D" : "F";

  return {
    composite,
    completeness,
    consistency,
    clarity,
    grade,
    timestamp: new Date().toISOString(),
    brdVersion: brd.version ?? "unknown",
    evaluationMethod: 'deterministic',
  };
}

// ── Independent Quality Scoring (Primary Method) ──────────────────────────────
async function computeQualityScoreWithIndependentEvaluator(
  brd: BrdInput,
  apiKey: string
): Promise<QualityScoreResult> {
  const scorer = new IndependentQualityScorer(apiKey);
  const assessment = await scorer.evaluateQuality(brd);

  // Map independent scores to existing breakdown structure
  // For independent evaluation, we don't have detailed breakdowns, so we create simplified ones
  const completeness = {
    total: assessment.completeness,
    breakdown: {
      ieee830: assessment.completeness * 0.5,
      acceptanceCriteria: assessment.completeness * 0.25,
      stakeholders: assessment.completeness * 0.125,
      metrics: assessment.completeness * 0.125,
    },
  };

  const consistency = {
    total: assessment.consistency,
    breakdown: {
      startScore: 100,
      conflictDeductions: Math.max(0, 100 - assessment.consistency),
      vagueWordDeductions: 0,
      terminologyDeductions: 0,
    },
  };

  const clarity = {
    total: assessment.clarity,
    breakdown: {
      frScores: [],
      totalDeduction: Math.max(0, 100 - assessment.clarity),
    },
  };

  const grade: QualityScoreResult["grade"] =
    assessment.overall >= 85 ? "A" :
    assessment.overall >= 70 ? "B" :
    assessment.overall >= 55 ? "C" :
    assessment.overall >= 40 ? "D" : "F";

  return {
    composite: assessment.overall,
    completeness,
    consistency,
    clarity,
    grade,
    timestamp: assessment.timestamp,
    brdVersion: brd.version ?? "unknown",
    evaluationMethod: 'independent',
    reasoning: assessment.reasoning,
  };
}
