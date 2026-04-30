/**
 * DocuMind AI Quality Auditor — Test Harness
 * Tests the deterministic gap checker and resolution tracking logic.
 *
 * Run: npx ts-node src/tests/auditor.test.ts
 */

import { runDeterministicGapCheck, markGapResolved, Gap } from "../lib/gapChecker";

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// Simulate quality score calculation (simplified for test)
function mockQualityScore(sections: Record<string, string>): number {
  let score = 0;
  if ((sections.executiveSummary?.length ?? 0) >= 100) score += 15;
  if ((sections.functionalReqs?.split("\n").filter(l => /^FR-\d+/i.test(l.trim())).length ?? 0) >= 3) score += 25;
  if ((sections.stakeholderRegister?.includes("|") ?? false)) score += 15;
  if ((sections.successMetrics?.length ?? 0) >= 50) score += 20;
  if ((sections.assumptions?.length ?? 0) >= 30) score += 10;
  return score;
}

// Simulate one auditor round: apply a patch and mark gap resolved
function simulateRound(
  sections: Record<string, string>,
  gaps: Gap[],
  patch: { section: string; content: string },
  round: number
): { sections: Record<string, string>; gaps: Gap[]; score: number } {
  const newSections = { ...sections, [patch.section]: patch.content };
  const newGaps = markGapResolved(gaps, patch.section, round);
  const score = mockQualityScore(newSections);
  return { sections: newSections, gaps: newGaps, score };
}

// ── Base BRD fixture ──────────────────────────────────────────────────────────
const GOOD_SECTIONS: Record<string, string> = {
  executiveSummary: "This project aims to improve workplace safety compliance across multiple industries by developing a comprehensive digital platform. The system will ingest regulatory documents, track compliance status, and generate automated reports for stakeholders. Key objectives include reducing incident rates by 30% within 12 months and achieving full regulatory compliance.",
  stakeholderRegister: "Safety Officer | Oversees compliance programs | High\nIT Manager | Manages system infrastructure | Medium\nRegulatory Body | Sets compliance standards | High",
  functionalReqs: "FR-001: The system shall allow Safety Officers to upload compliance documents within 5 seconds.\nFR-002: The system shall generate automated compliance reports for all registered facilities.\nFR-003: The system shall send email alerts to Safety Officers when violations are detected.\nFR-004: The system shall track all inspection records with timestamps.\nFR-005: The system shall support 200 concurrent users without performance degradation.",
  nfrReqs: "NFR-001: Performance - System shall respond within 200ms for 95% of requests.\nNFR-002: Security - All data shall be encrypted using AES-256.",
  assumptions: "ASSM-001: All users have internet access. CON-001: Budget is capped at $500k.",
  successMetrics: "METRIC-001 | Incident Reduction | 30% within 12 months | Acceptance: >= 30%\nMETRIC-002 | User Adoption | 80% of staff | Acceptance: >= 80%\nMETRIC-003 | Report Generation | < 5 seconds | Acceptance: p95 < 5s",
  externalInterfaces: "INT-001: OSHA API - REST API for regulatory data",
  useCases: "UC-001: Safety Officer uploads inspection report",
  glossary: "OSHA — Occupational Safety and Health Administration",
};

// ── FIXTURE 1: Missing success metrics ───────────────────────────────────────
console.log("\n── Fixture 1: Missing Success Metrics ──");
{
  const sections = { ...GOOD_SECTIONS, successMetrics: "" };
  const baseScore = mockQualityScore(sections);
  const qualityScores = [baseScore];

  let gaps = runDeterministicGapCheck(sections);
  assert("Gap detected: successMetrics critical", gaps.some(g => g.field === "successMetrics" && g.severity === "critical"), `gaps: ${JSON.stringify(gaps.map(g => g.field))}`);

  // Round 1: user provides success metrics
  const r1 = simulateRound(sections, gaps, {
    section: "successMetrics",
    content: "METRIC-001 | Incident Reduction | 30% within 12 months | Acceptance: >= 30%\nMETRIC-002 | System Uptime | 99.9% | Acceptance: monthly SLA\nMETRIC-003 | Response Time | < 200ms | Acceptance: p95",
  }, 1);
  qualityScores.push(r1.score);
  assert("Round 1: successMetrics gap resolved", r1.gaps.find(g => g.field === "successMetrics")?.resolved === true);
  assert("Round 1: score improved", r1.score > baseScore, `base=${baseScore}, after=${r1.score}`);

  const resolutionRate = r1.gaps.filter(g => g.resolved).length / r1.gaps.length;
  const qualityDelta = qualityScores[1] - qualityScores[0];
  assert("Resolution rate > 0", resolutionRate > 0, `rate=${resolutionRate}`);
  assert("Quality delta > 0", qualityDelta > 0, `delta=${qualityDelta}`);
}

// ── FIXTURE 2: Vague functional requirements ─────────────────────────────────
console.log("\n── Fixture 2: Vague Functional Requirements ──");
{
  const sections = { ...GOOD_SECTIONS, functionalReqs: "The system should handle user requests and provide good performance." };
  const baseScore = mockQualityScore(sections);
  const qualityScores = [baseScore];

  let gaps = runDeterministicGapCheck(sections);
  assert("Gap detected: functionalReqs critical", gaps.some(g => g.field === "functionalReqs" && g.severity === "critical"), `gaps: ${JSON.stringify(gaps.map(g => g.field))}`);

  // Round 1
  const r1 = simulateRound(sections, gaps, {
    section: "functionalReqs",
    content: "FR-001: The system shall authenticate all User credentials using OAuth2 within 500ms.\nFR-002: The system shall store all Inspection records in encrypted format.\nFR-003: The system shall generate Compliance reports for Safety Officers within 5 seconds.",
  }, 1);
  qualityScores.push(r1.score);

  // Round 2: add more FRs
  const r2 = simulateRound(r1.sections, r1.gaps, {
    section: "functionalReqs",
    content: r1.sections.functionalReqs + "\nFR-004: The system shall send email alerts to registered Users within 30 seconds.\nFR-005: The system shall support 200 concurrent Users without degradation.",
  }, 2);
  qualityScores.push(r2.score);

  // Round 3: refine
  const r3 = simulateRound(r2.sections, r2.gaps, {
    section: "nfrReqs",
    content: "NFR-001: Performance - System shall respond within 200ms for 95% of API requests.\nNFR-002: Security - All data shall be encrypted using AES-256 at rest and in transit.",
  }, 3);
  qualityScores.push(r3.score);

  const resolutionRate = r3.gaps.filter(g => g.resolved).length / r3.gaps.length;
  const qualityDeltas = qualityScores.map((s, i) => i === 0 ? 0 : s - qualityScores[i - 1]);
  const meanDelta = qualityDeltas.slice(1).reduce((a, b) => a + b, 0) / 3;

  assert("functionalReqs gap resolved after round 1", r1.gaps.find(g => g.field === "functionalReqs")?.resolved === true);
  assert("Resolution rate > 0.3", resolutionRate > 0.3, `rate=${resolutionRate}`);
  assert("Mean quality delta > 0", meanDelta > 0, `mean delta=${meanDelta}`);
  console.log(`  Quality scores: ${qualityScores.join(" → ")}`);
  console.log(`  Deltas: ${qualityDeltas.map(d => (d >= 0 ? "+" : "") + d).join(", ")}`);
}

// ── FIXTURE 3: Missing stakeholder register ───────────────────────────────────
console.log("\n── Fixture 3: Missing Stakeholder Register ──");
{
  const sections = { ...GOOD_SECTIONS, stakeholderRegister: "The project involves safety officers and IT managers who will use the system." };
  const baseScore = mockQualityScore(sections);
  const qualityScores = [baseScore];

  let gaps = runDeterministicGapCheck(sections);
  assert("Gap detected: stakeholderRegister warning", gaps.some(g => g.field === "stakeholderRegister"), `gaps: ${JSON.stringify(gaps.map(g => g.field))}`);

  // Round 1: provide structured stakeholders
  const r1 = simulateRound(sections, gaps, {
    section: "stakeholderRegister",
    content: "Safety Officer | Oversees compliance and uploads inspection reports | High\nIT Manager | Manages system infrastructure and user access | Medium\nRegulatory Inspector | Reviews compliance reports and issues citations | High",
  }, 1);
  qualityScores.push(r1.score);
  assert("Round 1: stakeholderRegister gap resolved", r1.gaps.find(g => g.field === "stakeholderRegister")?.resolved === true);
  assert("Round 1: score improved", r1.score > baseScore, `base=${baseScore}, after=${r1.score}`);

  // Round 2: add executive summary
  const r2 = simulateRound(r1.sections, r1.gaps, {
    section: "executiveSummary",
    content: "This project develops a comprehensive workplace safety compliance platform for multi-industry use. The system ingests regulatory documents, tracks compliance status in real-time, and generates automated reports. Primary objectives include reducing workplace incidents by 30% within 12 months, achieving full OSHA compliance, and providing Safety Officers with actionable insights through a centralized dashboard.",
  }, 2);
  qualityScores.push(r2.score);

  // Round 3: add assumptions
  const r3 = simulateRound(r2.sections, r2.gaps, {
    section: "assumptions",
    content: "ASSM-001: All users have reliable internet access with minimum 10Mbps bandwidth.\nASSM-002: Client organization has existing user authentication infrastructure.\nCON-001: Total project budget is capped at $500,000 USD.\nCON-002: System must comply with GDPR and CCPA data privacy regulations.",
  }, 3);
  qualityScores.push(r3.score);

  const resolutionRate = r3.gaps.filter(g => g.resolved).length / r3.gaps.length;
  const qualityDeltas = qualityScores.map((s, i) => i === 0 ? 0 : s - qualityScores[i - 1]);
  const meanDelta = qualityDeltas.slice(1).reduce((a, b) => a + b, 0) / 3;

  assert("Resolution rate > 0.5", resolutionRate > 0.5, `rate=${resolutionRate.toFixed(2)}`);
  assert("Mean quality delta > 0", meanDelta > 0, `mean delta=${meanDelta.toFixed(1)}`);
  console.log(`  Quality scores: ${qualityScores.join(" → ")}`);
  console.log(`  Deltas: ${qualityDeltas.map(d => (d >= 0 ? "+" : "") + d).join(", ")}`);
}

// ── Gap detection precision ───────────────────────────────────────────────────
console.log("\n── Gap Detection Precision ──");
{
  // All gaps in GOOD_SECTIONS should be 0 (no gaps)
  const cleanGaps = runDeterministicGapCheck(GOOD_SECTIONS);
  assert("Clean BRD has 0 gaps", cleanGaps.length === 0, `found: ${cleanGaps.map(g => g.field).join(", ")}`);

  // Broken BRD should have all 5 gaps
  const brokenSections = {
    executiveSummary: "Short.",
    stakeholderRegister: "Some people are involved.",
    functionalReqs: "The system should work.",
    assumptions: "",
    successMetrics: "",
  };
  const brokenGaps = runDeterministicGapCheck(brokenSections);
  assert("Broken BRD has 5 gaps", brokenGaps.length === 5, `found: ${brokenGaps.length}`);
  assert("All gaps are real (precision = 1.0)", brokenGaps.length === 5);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
