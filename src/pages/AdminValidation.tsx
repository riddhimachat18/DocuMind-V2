import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, query, orderBy, limit, doc, setDoc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BrdRecord {
  id: string;
  projectName: string;
  version: string;
  qualityScore: any;
  sections: Record<string, string>;
  createdAt: any;
}

interface RaterScores {
  [brdId: string]: {
    completeness: number;
    clarity: number;
    consistency: number;
    traceability: number;
    correctness: number;
    feasibility: number;
    unambiguity: number;
    verifiability: number;
  };
}

const CRITERIA = [
  { key: "completeness",  label: "Completeness",  desc: "All requirements are present" },
  { key: "clarity",       label: "Clarity",        desc: "Requirements are clearly stated" },
  { key: "consistency",   label: "Consistency",    desc: "No contradictions between requirements" },
  { key: "traceability",  label: "Traceability",   desc: "Requirements trace to source evidence" },
  { key: "correctness",   label: "Correctness",    desc: "Requirements accurately reflect needs" },
  { key: "feasibility",   label: "Feasibility",    desc: "Requirements are technically achievable" },
  { key: "unambiguity",   label: "Unambiguity",    desc: "Each requirement has one interpretation" },
  { key: "verifiability", label: "Verifiability",  desc: "Requirements can be tested/verified" },
];

// ── Stats helpers ─────────────────────────────────────────────────────────────
function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(
    xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
    ys.reduce((s, y) => s + (y - my) ** 2, 0)
  );
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

function cohensKappa(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const po = a.filter((v, i) => Math.round(v) === Math.round(b[i])).length / n;
  const levels = [1, 2, 3, 4, 5];
  const pe = levels.reduce((s, l) => {
    const pa = a.filter(v => Math.round(v) === l).length / n;
    const pb = b.filter(v => Math.round(v) === l).length / n;
    return s + pa * pb;
  }, 0);
  return pe === 1 ? 1 : Math.round(((po - pe) / (1 - pe)) * 1000) / 1000;
}

function exportCsv(brds: BrdRecord[], raterA: RaterScores, raterB: RaterScores) {
  const header = ["BRD ID", "Project", "Version", "Algo Score", ...CRITERIA.map(c => `RaterA_${c.key}`), ...CRITERIA.map(c => `RaterB_${c.key}`), "Avg Human"].join(",");
  const rows = brds.map(b => {
    const a = raterA[b.id] ?? {};
    const bR = raterB[b.id] ?? {};
    const avgHuman = CRITERIA.reduce((s, c) => s + ((a as any)[c.key] ?? 0) + ((bR as any)[c.key] ?? 0), 0) / (CRITERIA.length * 2);
    return [
      b.id, `"${b.projectName}"`, b.version, b.qualityScore?.total ?? 0,
      ...CRITERIA.map(c => (a as any)[c.key] ?? ""),
      ...CRITERIA.map(c => (bR as any)[c.key] ?? ""),
      Math.round(avgHuman * 10) / 10,
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "documind_validation.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminValidation() {
  const navigate = useNavigate();
  const [raterToken, setRaterToken] = useState("");
  const [raterRole, setRaterRole] = useState<"A" | "B" | null>(null);
  const [brds, setBrds] = useState<BrdRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [raterA, setRaterA] = useState<RaterScores>({});
  const [raterB, setRaterB] = useState<RaterScores>({});
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<{ pearson: number; kappa: Record<string, number> } | null>(null);

  // Simple token auth
  const TOKENS: Record<string, "A" | "B"> = {
    "rater-alpha-2024": "A",
    "rater-beta-2024":  "B",
  };

  function login() {
    const role = TOKENS[raterToken.trim()];
    if (role) { setRaterRole(role); loadData(); }
    else alert("Invalid token");
  }

  async function loadData() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "brdVersions"), orderBy("createdAt", "desc"), limit(15))
      );
      const records: BrdRecord[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        // Get project name
        let projectName = "Unknown";
        try {
          const proj = await getDoc(doc(db, "projects", data.projectId));
          if (proj.exists()) projectName = proj.data().name;
        } catch {}
        records.push({
          id: d.id,
          projectName,
          version: data.version ?? "v1.0",
          qualityScore: data.qualityScore,
          sections: data.sections ?? {},
          createdAt: data.createdAt,
        });
      }
      setBrds(records);

      // Load existing ratings
      const ratingSnap = await getDocs(collection(db, "validationRatings"));
      const a: RaterScores = {};
      const b: RaterScores = {};
      ratingSnap.docs.forEach(d => {
        const data = d.data();
        if (data.rater === "A") a[data.brdId] = data.scores;
        if (data.rater === "B") b[data.brdId] = data.scores;
      });
      setRaterA(a);
      setRaterB(b);
    } finally {
      setLoading(false);
    }
  }

  function setScore(brdId: string, criterion: string, value: number) {
    const setter = raterRole === "A" ? setRaterA : setRaterB;
    setter(prev => ({
      ...prev,
      [brdId]: { ...(prev[brdId] ?? {}), [criterion]: value } as any,
    }));
  }

  async function saveRatings() {
    const scores = raterRole === "A" ? raterA : raterB;
    for (const [brdId, s] of Object.entries(scores)) {
      await setDoc(doc(db, "validationRatings", `${brdId}_${raterRole}`), {
        brdId, rater: raterRole, scores: s,
        savedAt: new Date().toISOString(),
      });
    }
    setSaved(true);
    computeStats();
  }

  function computeStats() {
    const algoScores: number[] = [];
    const humanAvgs: number[] = [];
    const kappaPerCriterion: Record<string, number> = {};

    for (const brd of brds) {
      const a = raterA[brd.id];
      const b = raterB[brd.id];
      if (!a || !b) continue;
      algoScores.push(brd.qualityScore?.total ?? 0);
      const avg = CRITERIA.reduce((s, c) => s + ((a as any)[c.key] ?? 0) + ((b as any)[c.key] ?? 0), 0) / (CRITERIA.length * 2);
      humanAvgs.push(avg * 20); // scale 1-5 → 0-100
    }

    for (const c of CRITERIA) {
      const aVals = brds.map(b => (raterA[b.id] as any)?.[c.key] ?? 0).filter(Boolean);
      const bVals = brds.map(b => (raterB[b.id] as any)?.[c.key] ?? 0).filter(Boolean);
      if (aVals.length > 1) kappaPerCriterion[c.key] = cohensKappa(aVals, bVals);
    }

    setStats({ pearson: pearsonR(algoScores, humanAvgs), kappa: kappaPerCriterion });
  }

  if (!raterRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="border border-border bg-card p-8 w-80 flex flex-col gap-4">
          <p className="text-sm font-semibold">Admin Validation Access</p>
          <input
            type="password"
            value={raterToken}
            onChange={e => setRaterToken(e.target.value)}
            placeholder="Enter rater token"
            className="bg-transparent border border-border text-sm px-3 py-2 focus:outline-none focus:border-primary"
            onKeyDown={e => e.key === "Enter" && login()}
          />
          <button onClick={login} className="text-sm bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors">
            Enter
          </button>
          <button onClick={() => navigate("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground text-center">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="text-sm font-semibold tracking-tight">DocuMind</button>
          <span className="text-xs text-muted-foreground">→</span>
          <span className="text-xs text-foreground">Validation — Rater {raterRole}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => exportCsv(brds, raterA, raterB)}
            className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
            Export CSV
          </button>
          <button onClick={saveRatings}
            className="text-xs bg-primary text-primary-foreground px-4 py-1.5 hover:bg-primary/90 transition-colors">
            {saved ? "Saved ✓" : "Save Ratings"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats dashboard */}
        {stats && (
          <div className="mb-8 border border-border bg-card p-4">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Validation Statistics</p>
            <div className="flex gap-8 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground">Pearson r (algo vs human)</p>
                <p className={`text-xl font-mono font-bold ${stats.pearson >= 0.7 ? "text-green-400" : "text-amber-400"}`}>
                  {stats.pearson}
                </p>
                <p className="text-xs text-muted-foreground">{stats.pearson >= 0.7 ? "✓ Target met (r > 0.7)" : "⚠ Below target"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cohen's κ per criterion</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.kappa).map(([k, v]) => (
                    <span key={k} className={`text-xs font-mono border px-2 py-0.5 ${v >= 0.6 ? "border-green-400/30 text-green-400" : "border-amber-400/30 text-amber-400"}`}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading BRDs...</p>
        ) : (
          <div className="flex flex-col gap-8">
            {brds.map(brd => {
              const scores = (raterRole === "A" ? raterA : raterB)[brd.id] ?? {};
              return (
                <div key={brd.id} className="border border-border bg-card">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold">{brd.projectName}</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">{brd.version}</span>
                    </div>
                    <span className="text-xs font-mono border border-border px-2 py-0.5 text-muted-foreground">
                      Algo: {brd.qualityScore?.total ?? "—"}
                      {brd.qualityScore?.grade && ` (${brd.qualityScore.grade})`}
                    </span>
                  </div>

                  {/* BRD preview */}
                  <div className="px-4 py-3 border-b border-border max-h-40 overflow-y-auto">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {brd.sections.executiveSummary?.slice(0, 400) ?? "No executive summary"}...
                    </p>
                  </div>

                  {/* Rating sliders */}
                  <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {CRITERIA.map(c => (
                      <div key={c.key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{c.label}</span>
                          <span className="font-mono text-foreground">{(scores as any)[c.key] ?? "—"}</span>
                        </div>
                        <input
                          type="range" min={1} max={5} step={1}
                          value={(scores as any)[c.key] ?? 3}
                          onChange={e => setScore(brd.id, c.key, Number(e.target.value))}
                          className="w-full accent-primary"
                          title={c.desc}
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>1</span><span>5</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
