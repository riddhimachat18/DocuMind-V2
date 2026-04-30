import { useState } from "react";

interface CompletenessBreakdown {
  ieee830: number;
  acceptanceCriteria: number;
  stakeholders: number;
  metrics: number;
}
interface ConsistencyBreakdown {
  startScore: number;
  conflictDeductions: number;
  vagueWordDeductions: number;
  terminologyDeductions: number;
}
interface ClarityBreakdown {
  frScores: { id: string; verbCheck: boolean; objectCheck: boolean; wordCount: number; deduction: number }[];
  totalDeduction: number;
}

interface QualityScore {
  total: number;
  completeness: number;
  consistency: number;
  clarity: number;
  grade?: string;
  diagramCoverage?: number;
  breakdown?: {
    completeness?: CompletenessBreakdown;
    consistency?: ConsistencyBreakdown;
    clarity?: ClarityBreakdown;
  };
}

interface Props {
  qualityScore: QualityScore | null;
  diagramCoverage?: number | null;
}

const GRADE_COLOR: Record<string, string> = {
  A: "text-green-400 border-green-400/40",
  B: "text-emerald-400 border-emerald-400/40",
  C: "text-yellow-400 border-yellow-400/40",
  D: "text-orange-400 border-orange-400/40",
  F: "text-red-400 border-red-400/40",
};

const DIM_SUGGESTIONS: Record<string, string> = {
  completeness: "Add more detail to thin sections and include measurable acceptance criteria in each FR.",
  consistency:  "Resolve open conflicts and replace vague language (should, might, could) with shall/must.",
  clarity:      "Rewrite FRs using 'The system shall [verb] [specific object]' format, 15–40 words each.",
};

export default function QualityScorePanel({ qualityScore, diagramCoverage }: Props) {
  const [open, setOpen] = useState(false);
  if (!qualityScore) return null;

  const { total, completeness, consistency, clarity, grade, breakdown } = qualityScore;
  const safeTotal = Math.max(0, Math.min(100, total || 0));
  const color = safeTotal >= 80 ? "#4ade80" : safeTotal >= 60 ? "#facc15" : safeTotal >= 40 ? "#fb923c" : "#f87171";
  const r = 32;
  const circ = 2 * Math.PI * r;
  const offset = circ - (safeTotal / 100) * circ;

  const dims = [
    { key: "completeness", label: "Completeness", val: completeness ?? 0, max: 40, color: "bg-green-400" },
    { key: "consistency",  label: "Consistency",  val: consistency  ?? 0, max: 40, color: "bg-blue-400" },
    { key: "clarity",      label: "Clarity",      val: clarity      ?? 0, max: 20, color: "bg-yellow-400" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Ring + grade */}
      <div className="flex items-center gap-4">
        <svg width="80" height="80" viewBox="0 0 80 80" className="drop-shadow-lg flex-shrink-0">
          <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(0 0% 15%)" strokeWidth="6" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 40 40)"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
          <text x="40" y="45" textAnchor="middle" fill={color} fontSize="18" fontWeight="700" fontFamily="monospace">
            {safeTotal}
          </text>
        </svg>
        {grade && (
          <div className={`text-2xl font-mono font-bold border px-3 py-1 ${GRADE_COLOR[grade] ?? "text-muted-foreground border-border"}`}>
            {grade}
          </div>
        )}
      </div>

      {/* Dimension bars */}
      <div className="flex flex-col gap-2">
        {dims.map(d => (
          <div key={d.key}>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{d.label}</span>
              <span className={`font-mono ${(d.val / d.max) < 0.5 ? "text-amber-400" : "text-foreground"}`}>
                {d.val}/{d.max}
              </span>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div className={`h-full ${d.color} transition-all duration-500`}
                style={{ width: `${(d.val / d.max) * 100}%` }} />
            </div>
            {(d.val / d.max) < 0.5 && (
              <p className="text-xs text-amber-400 mt-1 leading-relaxed">
                ⚠ {DIM_SUGGESTIONS[d.key]}
              </p>
            )}
          </div>
        ))}

        {/* Diagram coverage */}
        {diagramCoverage != null && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Diagram Coverage</span>
              <span className={`font-mono ${diagramCoverage < 80 ? "text-amber-400" : "text-foreground"}`}>
                {diagramCoverage}%
              </span>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-500 ${diagramCoverage >= 80 ? "bg-green-400" : diagramCoverage >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                style={{ width: `${diagramCoverage}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Collapsible breakdown table */}
      {breakdown && (
        <div>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono flex items-center gap-1"
          >
            {open ? "▾" : "▸"} Score breakdown
          </button>

          {open && (
            <div className="mt-2 border border-border text-xs">
              {/* Completeness */}
              <div className="px-3 py-2 border-b border-border bg-secondary/20 font-mono text-muted-foreground uppercase tracking-widest text-[10px]">
                Completeness (40 pts)
              </div>
              {breakdown.completeness && ([
                ["IEEE 830 Sections",       breakdown.completeness.ieee830,            20],
                ["Acceptance Criteria",     breakdown.completeness.acceptanceCriteria, 10],
                ["Stakeholder Register",    breakdown.completeness.stakeholders,        5],
                ["Metrics Quantifiability", breakdown.completeness.metrics,             5],
              ] as [string, number, number][]).map(([label, pts, max]) => (
                <div key={label} className="flex justify-between px-3 py-1.5 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-mono ${pts < max * 0.5 ? "text-amber-400" : "text-foreground"}`}>
                    {pts} / {max}
                  </span>
                </div>
              ))}

              {/* Consistency */}
              <div className="px-3 py-2 border-b border-border bg-secondary/20 font-mono text-muted-foreground uppercase tracking-widest text-[10px]">
                Consistency (40 pts)
              </div>
              {breakdown.consistency && ([
                ["Start Score",              breakdown.consistency.startScore,           40],
                ["− Conflict Deductions",   -breakdown.consistency.conflictDeductions,   0],
                ["− Vague Language",        -breakdown.consistency.vagueWordDeductions,  0],
                ["− Terminology Mismatch",  -breakdown.consistency.terminologyDeductions,0],
              ] as [string, number, number][]).map(([label, pts, max]) => (
                <div key={label} className="flex justify-between px-3 py-1.5 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-mono ${pts < 0 ? "text-red-400" : "text-foreground"}`}>
                    {pts > 0 ? pts : pts} {max > 0 ? `/ ${max}` : ""}
                  </span>
                </div>
              ))}

              {/* Clarity */}
              <div className="px-3 py-2 border-b border-border bg-secondary/20 font-mono text-muted-foreground uppercase tracking-widest text-[10px]">
                Clarity (20 pts)
              </div>
              {breakdown.clarity && (
                <div className="flex justify-between px-3 py-1.5 border-b border-border">
                  <span className="text-muted-foreground">Total Deduction</span>
                  <span className={`font-mono ${breakdown.clarity.totalDeduction > 5 ? "text-amber-400" : "text-foreground"}`}>
                    −{breakdown.clarity.totalDeduction}
                  </span>
                </div>
              )}
              {breakdown.clarity && breakdown.clarity.frScores.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-muted-foreground mb-1">FR-level scores:</p>
                  {breakdown.clarity.frScores.map(fr => (
                    <div key={fr.id} className="flex gap-2 text-[10px] font-mono text-muted-foreground mb-0.5">
                      <span className="w-16">{fr.id}</span>
                      <span>{fr.verbCheck ? "✓verb" : "✗verb"}</span>
                      <span>{fr.objectCheck ? "✓obj" : "✗obj"}</span>
                      <span>{fr.wordCount}w</span>
                      {fr.deduction > 0 && <span className="text-amber-400">−{fr.deduction}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
