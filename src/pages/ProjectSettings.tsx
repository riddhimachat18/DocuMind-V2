import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useState, useEffect } from "react";
import { deleteProject, getProjectDeletionSummary } from "../services/projectService";
import { toast } from "sonner";

const ProjectSettings = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionSummary, setDeletionSummary] = useState<{
    brdVersions: number;
    uploadedFiles: number;
    snippets: number;
    chatMessages: number;
    conflicts: number;
  } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  // Load deletion summary when dialog opens
  useEffect(() => {
    if (showDeleteConfirm && id && !deletionSummary) {
      loadDeletionSummary();
    }
  }, [showDeleteConfirm, id]);

  const loadDeletionSummary = async () => {
    if (!id) return;
    try {
      const summary = await getProjectDeletionSummary(id);
      setDeletionSummary(summary);
    } catch (error) {
      console.error("Error loading deletion summary:", error);
      toast.error("Failed to load project data");
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id || !project) return;
    
    // Verify user typed the project name correctly
    if (confirmText !== project.name) {
      toast.error("Project name doesn't match");
      return;
    }

    setIsDeleting(true);
    
    try {
      await deleteProject(id);
      toast.success("Project deleted successfully");
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      console.error("Error deleting project:", error);
      toast.error(`Failed to delete project: ${error.message}`);
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setConfirmText("");
    setDeletionSummary(null);
  };

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
            <button 
              onClick={handleDeleteClick}
              className="text-xs border border-red-400/40 text-red-400 px-4 py-2 hover:bg-red-400/10 transition-colors"
            >
              Delete
            </button>
          </div>
        </section>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-red-400/30 max-w-lg w-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-red-400/30 bg-red-400/5">
              <h2 className="text-lg font-semibold text-red-400">Delete Project</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This action cannot be undone. All data will be permanently deleted.
              </p>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
              {deletionSummary ? (
                <>
                  <div className="mb-6">
                    <p className="text-sm text-foreground mb-4">
                      The following data will be permanently deleted:
                    </p>
                    <div className="border border-border bg-card divide-y divide-border text-sm">
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-muted-foreground">BRD Versions</span>
                        <span className="font-mono text-foreground">{deletionSummary.brdVersions}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-muted-foreground">Uploaded Files</span>
                        <span className="font-mono text-foreground">{deletionSummary.uploadedFiles}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-muted-foreground">Snippets</span>
                        <span className="font-mono text-foreground">{deletionSummary.snippets}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-muted-foreground">Chat Messages</span>
                        <span className="font-mono text-foreground">{deletionSummary.chatMessages}</span>
                      </div>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-muted-foreground">Conflict Flags</span>
                        <span className="font-mono text-foreground">{deletionSummary.conflicts}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="text-sm text-foreground block mb-2">
                      Type <span className="font-mono text-red-400">{project?.name}</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="Enter project name"
                      className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-red-400 transition-colors"
                      disabled={isDeleting}
                    />
                  </div>

                  <div className="bg-red-400/10 border border-red-400/30 px-4 py-3 text-sm text-red-400">
                    ⚠ Warning: This will delete all project data including storage files, BRD versions, and chat history.
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-400"></div>
                  <p className="text-sm text-muted-foreground mt-4">Loading project data...</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="text-sm border border-border px-4 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting || !deletionSummary || confirmText !== project?.name}
                className="text-sm bg-red-500 text-white px-4 py-2 hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectSettings;
