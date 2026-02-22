import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";

interface BRDVersionHistory {
  id: string;
  version: string;
  versionNumber: number;
  timestamp: string;
  savedBy: string;
  qualityScore: number;
  diffSummary: string;
  status: string;
}

const BRDHistory = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);
  const [versions, setVersions] = useState<BRDVersionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);

  // Load version history from Firestore
  useEffect(() => {
    if (!id) return;

    const loadVersionHistory = async () => {
      setLoading(true);
      try {
        // Get current version ID from project
        const { doc: firestoreDoc, getDoc } = await import("firebase/firestore");
        const projectDoc = await getDoc(firestoreDoc(db, "projects", id));
        if (projectDoc.exists()) {
          setCurrentVersionId(projectDoc.data().currentBrdVersionId || null);
        }

        // Fetch all versions
        const versionsQuery = query(
          collection(db, "brdVersions"),
          where("projectId", "==", id),
          orderBy("versionNumber", "desc")
        );

        const snapshot = await getDocs(versionsQuery);
        
        const versionsList: BRDVersionHistory[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            version: data.version || "v1.0",
            versionNumber: data.versionNumber || 1.0,
            timestamp: data.createdAt?.toDate?.()?.toLocaleString() || "Unknown",
            savedBy: data.createdBy || "System",
            qualityScore: data.qualityScore?.total || 0,
            diffSummary: data.changeLog || "No changes recorded",
            status: data.status || "draft"
          };
        });

        setVersions(versionsList);
      } catch (error) {
        console.error("Error loading version history:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVersionHistory();
  }, [id]);

  if (!project) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Project not found.</p>
    </div>
  );

  const scoreColor = (score: number) =>
    score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-sm font-semibold tracking-tight">DocuMind</Link>
          <span className="text-xs text-muted-foreground">→</span>
          <button onClick={() => navigate(`/projects/${id}/brd`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {project.name}
          </button>
          <span className="text-xs text-muted-foreground">→</span>
          <span className="text-xs text-foreground">Version History</span>
        </div>
        <button
          onClick={() => navigate(`/projects/${id}/brd/new`)}
          className="text-xs bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors"
        >
          + New version
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold tracking-tight mb-2">Version History</h1>
        <p className="text-sm text-muted-foreground mb-10">
          {loading ? "Loading..." : `${versions.length} version${versions.length !== 1 ? 's' : ''} saved for ${project.name}`}
        </p>

        {loading ? (
          <div className="text-center py-10">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground mt-4">Loading version history...</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground mb-4">No versions found</p>
            <button
              onClick={() => navigate(`/projects/${id}/brd/new`)}
              className="text-xs bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors"
            >
              Generate first BRD
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />

            <div className="flex flex-col gap-0">
              {versions.map((version, i) => {
                const isLatest = version.id === currentVersionId;
                return (
                  <div key={version.id} className="flex gap-6 pb-8">
                    {/* Dot */}
                    <div className="relative flex-shrink-0 mt-1">
                      <div className={`w-6 h-6 border flex items-center justify-center text-xs font-mono ${
                        isLatest ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
                      }`}>
                        {isLatest ? "●" : "○"}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 border border-border bg-card">
                      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono font-medium">{version.version}</span>
                          {isLatest && (
                            <span className="text-xs font-mono border border-primary text-primary px-2 py-0.5">Latest</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            version.status === 'approved' 
                              ? 'bg-green-500/10 text-green-500' 
                              : version.status === 'archived'
                              ? 'bg-gray-500/10 text-gray-500'
                              : 'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {version.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {version.qualityScore > 0 && (
                            <>
                              <span className={`text-sm font-mono font-semibold ${scoreColor(version.qualityScore)}`}>
                                {version.qualityScore}
                              </span>
                              <span className="text-xs text-muted-foreground">quality score</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="px-5 py-4">
                        <div className="flex items-center gap-4 mb-3">
                          <span className="text-xs text-muted-foreground font-mono">{version.timestamp}</span>
                          <span className="text-xs text-muted-foreground">by {version.savedBy}</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{version.diffSummary}</p>
                      </div>

                      <div className="px-5 py-3 border-t border-border flex gap-3">
                        <button
                          onClick={() => navigate(`/projects/${id}/brd/edit`)}
                          className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                        >
                          View version
                        </button>
                        {!isLatest && (
                          <button className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BRDHistory;
