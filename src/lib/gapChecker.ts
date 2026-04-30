/**
 * Deterministic BRD Gap Checker — frontend mirror of functions/src/gapChecker.ts
 */

export interface Gap {
  field: string;
  severity: "critical" | "warning";
  message: string;
  resolved?: boolean;
  resolvedAtRound?: number;
}

function extractFRs(text: string): string[] {
  if (!text) return [];
  return text.split("\n").map(l => l.trim()).filter(l => /^FR-\d+/i.test(l));
}

export function runDeterministicGapCheck(sections: Record<string, string | undefined>): Gap[] {
  const gaps: Gap[] = [];

  if (!sections.successMetrics || sections.successMetrics.length < 50)
    gaps.push({ field: "successMetrics", severity: "critical", message: "Success metrics section is empty or insufficient" });

  if (extractFRs(sections.functionalReqs ?? "").length < 3)
    gaps.push({ field: "functionalReqs", severity: "critical", message: "Fewer than 3 functional requirements identified" });

  if (!sections.stakeholderRegister || !sections.stakeholderRegister.includes("|"))
    gaps.push({ field: "stakeholderRegister", severity: "warning", message: "Stakeholder register may be missing structured entries" });

  if (!sections.assumptions || sections.assumptions.length < 30)
    gaps.push({ field: "assumptions", severity: "warning", message: "Constraints and assumptions section is too thin" });

  if (!sections.executiveSummary || sections.executiveSummary.length < 100)
    gaps.push({ field: "executiveSummary", severity: "warning", message: "Executive summary is too brief to be meaningful" });

  if (!sections.useCases || sections.useCases.length < 200)
    gaps.push({ field: "useCases", severity: "warning", message: "Use cases section is too thin — each UC requires 12-step Main Event Flow with preconditions, postconditions, and alternate flows" });

  return gaps;
}

export function markGapResolved(gaps: Gap[], sectionKey: string, round: number): Gap[] {
  return gaps.map(g =>
    g.field === sectionKey ? { ...g, resolved: true, resolvedAtRound: round } : g
  );
}
