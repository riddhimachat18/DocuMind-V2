import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

const ProjectSettings = () => {
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Link to="/dashboard" className="text-sm font-semibold tracking-tight">DocuMind</Link>
        <span className="text-xs text-muted-foreground">→</span>
        <button onClick={() => navigate(`/projects/${id}/brd`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {project.name}
        </button>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="text-xs text-muted-foreground">Settings</span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight mb-8">Project Settings</h1>

        {/* Project metadata */}
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Metadata</h2>
          <div className="border border-border bg-card divide-y divide-border">
            <div className="px-4 py-3">
              <label className="text-xs text-muted-foreground block mb-1.5">Project name</label>
              <input
                defaultValue={project.name}
                className="w-full bg-transparent text-sm focus:outline-none text-foreground"
              />
            </div>
            <div className="px-4 py-3">
              <label className="text-xs text-muted-foreground block mb-1.5">Description</label>
              <textarea
                defaultValue={project.description}
                rows={3}
                className="w-full bg-transparent text-sm focus:outline-none text-foreground resize-none"
              />
            </div>
          </div>
          <button className="mt-3 text-sm bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors">
            Save changes
          </button>
        </section>

        {/* Connected sources */}
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Connected Sources</h2>
          <div className="border border-border bg-card divide-y divide-border">
            {[
              { id: "gmail", label: "Gmail", icon: "✉" },
              { id: "slack", label: "Slack", icon: "#" },
              { id: "meeting", label: "Meetings", icon: "◎" },
            ].map((src) => {
              const connected = project.sources.includes(src.id);
              return (
                <div key={src.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-muted-foreground">{src.icon}</span>
                    <span className="text-sm">{src.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {connected ? (
                      <span className="text-xs text-green-400 font-mono">Connected</span>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">Not connected</span>
                    )}
                    <button className={`text-xs border px-3 py-1 transition-colors ${
                      connected
                        ? "border-border text-muted-foreground hover:border-red-400/50 hover:text-red-400"
                        : "border-primary text-primary hover:bg-primary/10"
                    }`}>
                      {connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Team members */}
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Team Members</h2>
          <div className="border border-border bg-card divide-y divide-border">
            {project.members.map((member) => (
              <div key={member.email} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm">{member.name}</div>
                  <div className="text-xs text-muted-foreground">{member.email}</div>
                </div>
                <span className="text-xs font-mono border border-border px-2 py-0.5 text-muted-foreground">
                  {member.role}
                </span>
              </div>
            ))}
            <div className="px-4 py-3">
              <button className="text-xs text-primary hover:underline">+ Invite team member</button>
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-xs font-mono uppercase tracking-widest text-red-400 mb-4">Danger Zone</h2>
          <div className="border border-red-400/20 bg-red-400/5 px-4 py-4 flex items-center justify-between">
            <div>
              <div className="text-sm">Delete project</div>
              <div className="text-xs text-muted-foreground mt-0.5">Permanently delete this project and all BRD versions. This cannot be undone.</div>
            </div>
            <button className="text-xs border border-red-400/40 text-red-400 px-4 py-2 hover:bg-red-400/10 transition-colors">
              Delete
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProjectSettings;
