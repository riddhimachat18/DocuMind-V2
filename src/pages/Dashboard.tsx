import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { toast } from "sonner";

const QualityBadge = ({ score }: { score: number }) => {
  const color =
    score >= 80
      ? "text-green-400 border-green-400/30 bg-green-400/10"
      : score >= 60
      ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
      : "text-red-400 border-red-400/30 bg-red-400/10";
  return (
    <span className={`text-xs font-mono border px-2 py-0.5 ${color}`}>
      {score}
    </span>
  );
};

const SourceIcon = ({ source }: { source: string }) => {
  if (source === "gmail") return <span title="Gmail" className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5">✉</span>;
  if (source === "slack") return <span title="Slack" className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5">#</span>;
  return <span title="Meeting" className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5">◎</span>;
};

const Dashboard = () => {
  const { user, projects, logout } = useApp();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out successfully!");
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to sign out. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm font-semibold tracking-tight">DocuMind</Link>
          <span className="text-xs text-muted-foreground">{user?.org}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{projects.length} active projects</p>
          </div>
          <button
            onClick={() => navigate("/projects/new")}
            className="bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + New Project
          </button>
        </div>

        {/* Projects grid */}
        <div className="grid gap-px bg-border">
          {/* Table header */}
          <div className="bg-background grid grid-cols-[1fr_120px_80px_100px_120px] gap-4 px-4 py-2 text-xs text-muted-foreground font-mono uppercase tracking-wider">
            <span>Project</span>
            <span>Sources</span>
            <span>Quality</span>
            <span>Updated</span>
            <span></span>
          </div>
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-card grid grid-cols-[1fr_120px_80px_100px_120px] gap-4 px-4 py-4 items-center hover:bg-secondary/50 transition-colors"
            >
              <div>
                <div
                  className="text-sm font-medium hover:text-primary cursor-pointer transition-colors"
                  onClick={() => navigate(`/projects/${project.id}/brd`)}
                >
                  {project.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{project.description}</div>
              </div>
              <div className="flex items-center gap-1">
                {project.sources.map((s) => (
                  <SourceIcon key={s} source={s} />
                ))}
              </div>
              <div>
                <QualityBadge score={project.qualityScore} />
              </div>
              <div className="text-xs text-muted-foreground font-mono">{project.lastUpdated}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/projects/${project.id}/brd`)}
                  className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  View BRD
                </button>
                <button
                  onClick={() => navigate(`/projects/${project.id}/settings`)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ···
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
