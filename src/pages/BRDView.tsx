import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { mockBRDSections } from "../data/brdData";

const BRDView = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);

  if (!project) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Project not found.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-sm font-semibold tracking-tight">DocuMind</Link>
          <span className="text-xs text-muted-foreground">→</span>
          <span className="text-xs text-muted-foreground">{project.name}</span>
          <span className="text-xs text-muted-foreground">→</span>
          <span className="text-xs text-foreground">BRD v3.0</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/projects/${id}/brd/history`)}
            className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Version history
          </button>
          <button
            onClick={() => navigate(`/projects/${id}/brd/new`)}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 transition-colors"
          >
            + New version
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main BRD content */}
        <main className="flex-1 overflow-y-auto px-8 py-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-mono border border-border px-2 py-0.5 text-muted-foreground">v3.0</span>
            <span className="text-xs text-muted-foreground">Approved — 2026-02-18</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">{project.name}</h1>
          <p className="text-sm text-muted-foreground mb-10">Business Requirements Document — Read-only view</p>

          {mockBRDSections.map((section) => (
            <section key={section.id} className="mb-10">
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4 border-b border-border pb-2">
                {section.title}
              </h2>
              {section.id === 'stakeholders' ? (
                <div className="border border-border divide-y divide-border">
                  {section.sentences.map(s => (
                    <div key={s.id} className="px-4 py-3 text-sm text-foreground">{s.text}</div>
                  ))}
                </div>
              ) : section.id === 'traceability' ? (
                <div className="border border-border px-4 py-3">
                  <p className="text-sm font-mono text-foreground">{section.sentences[0]?.text}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {section.sentences.map(s => (
                    <p key={s.id} className={`text-sm leading-relaxed text-foreground ${s.hasConflict ? 'border-l-2 border-red-400 pl-3' : ''}`}>
                      {s.hasConflict && <span className="text-red-400 mr-1">⚠</span>}
                      {s.text}
                    </p>
                  ))}
                </div>
              )}
            </section>
          ))}
        </main>

        {/* Version sidebar */}
        <aside className="w-64 border-l border-border bg-card overflow-y-auto">
          <div className="px-4 py-4 border-b border-border">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Version History</p>
          </div>
          {[
            { v: 'v3.0', date: '2026-02-18 14:32', by: 'Sarah Chen', active: true },
            { v: 'v2.0', date: '2026-02-16 09:15', by: 'Alex Kim', active: false },
            { v: 'v1.0', date: '2026-02-14 11:00', by: 'Alex Kim', active: false },
          ].map((ver) => (
            <button
              key={ver.v}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors ${ver.active ? 'bg-primary/10' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-mono ${ver.active ? 'text-primary' : 'text-foreground'}`}>{ver.v}</span>
                {ver.active && <span className="text-xs text-primary font-mono">Current</span>}
              </div>
              <div className="text-xs text-muted-foreground">{ver.date}</div>
              <div className="text-xs text-muted-foreground">{ver.by}</div>
            </button>
          ))}
          <div className="px-4 py-4">
            <button
              onClick={() => navigate(`/projects/${id}/brd/history`)}
              className="text-xs text-primary hover:underline"
            >
              View full history →
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default BRDView;
