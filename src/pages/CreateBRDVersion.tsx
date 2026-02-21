import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

type Stage = "idle" | "ingesting" | "filtering" | "synthesizing" | "quality" | "done";

const stages: { key: Stage; label: string }[] = [
  { key: "ingesting", label: "Ingesting sources" },
  { key: "filtering", label: "Filtering noise" },
  { key: "synthesizing", label: "Synthesizing requirements" },
  { key: "quality", label: "Quality check" },
];

const CreateBRDVersion = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    if (stage === "idle") return;
    const stageKeys: Stage[] = ["ingesting", "filtering", "synthesizing", "quality", "done"];
    let idx = stageKeys.indexOf(stage);
    if (idx < stageKeys.length - 1) {
      const timeout = setTimeout(() => {
        setStage(stageKeys[idx + 1]);
      }, 1800);
      return () => clearTimeout(timeout);
    }
  }, [stage]);

  useEffect(() => {
    if (stage === "done") {
      const timeout = setTimeout(() => {
        navigate(`/projects/${id}/brd/edit`);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [stage, id, navigate]);

  if (!project) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Project not found.</p>
    </div>
  );

  const currentStageIdx = stages.findIndex(s => s.key === stage);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Link to="/dashboard" className="text-sm font-semibold tracking-tight">DocuMind</Link>
        <span className="text-xs text-muted-foreground">→</span>
        <button onClick={() => navigate(`/projects/${id}/brd`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {project.name}
        </button>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="text-xs text-foreground">Generate BRD</span>
      </header>

      <main className="max-w-lg mx-auto px-6 py-20">
        {stage === "idle" ? (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Generate new BRD version</h1>
              <p className="text-sm text-muted-foreground">
                DocuMind will ingest all connected sources and generate a structured BRD draft.
              </p>
            </div>

            <div className="border border-border bg-card divide-y divide-border">
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Project</span>
                <span className="text-sm">{project.name}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Sources</span>
                <span className="text-sm font-mono">{project.sources.length > 0 ? project.sources.join(", ") : "None"}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Previous version</span>
                <span className="text-sm font-mono">v3.0</span>
              </div>
            </div>

            <button
              onClick={() => setStage("ingesting")}
              className="bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Start generation →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Generating BRD v4.0</h1>
              <p className="text-sm text-muted-foreground">This usually takes 30–60 seconds.</p>
            </div>

            {/* Progress steps */}
            <div className="flex flex-col gap-0">
              {stages.map((s, i) => {
                const isActive = s.key === stage;
                const isDone = currentStageIdx > i;
                return (
                  <div key={s.key} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                    <div className={`w-5 h-5 flex items-center justify-center text-xs font-mono border ${
                      isDone
                        ? "border-green-400 text-green-400"
                        : isActive
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground"
                    }`}>
                      {isDone ? "✓" : isActive ? (
                        <span className="animate-pulse">•</span>
                      ) : (i + 1)}
                    </div>
                    <span className={`text-sm ${isActive ? "text-foreground" : isDone ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                      {s.label}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-xs text-primary font-mono animate-pulse">Processing…</span>
                    )}
                    {isDone && (
                      <span className="ml-auto text-xs text-muted-foreground font-mono">Done</span>
                    )}
                  </div>
                );
              })}
            </div>

            {stage === "done" && (
              <div className="border border-green-400/30 bg-green-400/5 px-4 py-3 text-sm text-green-400">
                ✓ BRD draft ready — redirecting to editor…
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateBRDVersion;
