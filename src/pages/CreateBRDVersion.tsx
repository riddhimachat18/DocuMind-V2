import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { generateBrdFn, detectConflictsFn } from "../lib/functions";
import { db } from "../lib/firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { toast } from "sonner";

type Stage = "idle" | "ingesting" | "filtering" | "synthesizing" | "quality" | "auditing" | "done";

const stages: { key: Stage; label: string }[] = [
  { key: "ingesting", label: "Ingesting sources" },
  { key: "filtering", label: "Filtering noise" },
  { key: "synthesizing", label: "Synthesizing requirements" },
  { key: "quality", label: "Quality check" },
  { key: "auditing", label: "AI Auditor review" },
];

const CreateBRDVersion = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [brdVersionId, setBrdVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<string>("v1.0");
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [totalSnippets, setTotalSnippets] = useState(0);
  const [qualityScore, setQualityScore] = useState<any>(null);
  const [auditMessage, setAuditMessage] = useState<string>("");

  // Fetch uploaded files
  useEffect(() => {
    if (!id) return;

    const fetchFiles = async () => {
      const { collection, query, where, orderBy, getDocs } = await import("firebase/firestore");
      const filesSnap = await getDocs(
        query(
          collection(db, "uploadedFiles"),
          where("projectId", "==", id),
          where("status", "==", "processed"),
          orderBy("uploadedAt", "desc")
        )
      );

      const files = filesSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          filename: data.filename || 'Unknown',
          type: data.type || 'txt',
          snippetCount: data.snippetCount || 0,
          snippetBreakdown: data.snippetBreakdown || {},
          uploadedAt: data.uploadedAt,
          status: data.status,
        };
      });

      setUploadedFiles(files);
      
      // Auto-select all files by default
      const allFileIds = new Set(files.map(f => f.id));
      setSelectedFiles(allFileIds);
      
      // Calculate total snippets
      const total = files.reduce((sum, f) => sum + (f.snippetCount || 0), 0);
      setTotalSnippets(total);
    };

    fetchFiles();
  }, [id]);

  const toggleFileSelection = (fileId: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
    
    // Recalculate total snippets
    const total = uploadedFiles
      .filter(f => newSelection.has(f.id))
      .reduce((sum, f) => sum + (f.snippetCount || 0), 0);
    setTotalSnippets(total);
  };

  const handleStartGeneration = async () => {
  if (!id) return;
  
  setStage("ingesting");
  setError(null);

  try {
    setStage("filtering");
    
    // Get selected filenames to pass to the backend
    const selectedFilenames = uploadedFiles
      .filter(f => selectedFiles.has(f.id))
      .map(f => f.filename);
    
    let newBrdVersionId: string | null = null;

    try {
      const generateResult = await generateBrdFn({ 
        projectId: id,
        selectedFiles: selectedFilenames
      });
      const { brdVersionId: returnedId, version, versionNumber: vNum, qualityScore: score } = generateResult.data as any;
      newBrdVersionId = returnedId;
      if (version) setVersionNumber(version);
      if (score) setQualityScore(score);
    } catch (err: any) {
      // Function may have timed out but BRD still created
      console.warn("generateBrd timed out or errored, checking Firestore:", err.message);
    }

    // If function timed out, find the BRD that was created
    if (!newBrdVersionId) {
      const { collection, query, where, orderBy, limit, getDocs } = await import("firebase/firestore");
      const snap = await getDocs(query(
        collection(db, "brdVersions"),
        where("projectId", "==", id),
        orderBy("createdAt", "desc"),
        limit(1)
      ));
      if (!snap.empty) {
        newBrdVersionId = snap.docs[0].id;
        const data = snap.docs[0].data();
        if (data.version) setVersionNumber(data.version);
        if (data.qualityScore) setQualityScore(data.qualityScore);
      }
    }

    if (!newBrdVersionId) {
      throw new Error("BRD generation failed — no version created");
    }

    setBrdVersionId(newBrdVersionId);

    // Detect conflicts
    setStage("synthesizing");
    try {
      await detectConflictsFn({ projectId: id, brdVersionId: newBrdVersionId });
    } catch (e) {
      console.warn("Conflict detection failed, continuing:", e);
    }

    // Update project
    setStage("quality");
    await updateDoc(doc(db, "projects", id), {
      currentBrdVersionId: newBrdVersionId
    });

    // Start AI Auditor review
    setStage("auditing");
    setAuditMessage("Initializing AI Quality Auditor...");
    
    try {
      // Get BRD data for quality score
      const brdDoc = await getDoc(doc(db, "brdVersions", newBrdVersionId));
      if (brdDoc.exists()) {
        const brdData = brdDoc.data();
        setQualityScore(brdData.qualityScore);
        
        // Trigger initial AI audit
        setAuditMessage("AI Auditor analyzing BRD quality...");
        const { onChatMessageFn } = await import("../lib/functions");
        
        await onChatMessageFn({
          projectId: id,
          brdVersionId: newBrdVersionId,
          userMessage: "Review this BRD and identify the most critical gaps or issues.",
          chatHistory: []
        });
        
        setAuditMessage("AI Auditor review complete");
      }
    } catch (auditError) {
      console.warn("AI Auditor initialization failed:", auditError);
      setAuditMessage("AI Auditor will be available in edit view");
    }

    setStage("done");
    toast.success("BRD generated successfully!");

  } catch (error: any) {
    console.error("BRD generation error:", error);
    setError(error.message || "Failed to generate BRD");
    toast.error(error.message || "Failed to generate BRD");
    setStage("idle");
  }
};

  useEffect(() => {
  if (stage === "done" && brdVersionId) {
    const timeout = setTimeout(() => {
      navigate(`/projects/${id}/brd/edit`);  // ← was /brd, now /brd/edit
    }, 1000);
    return () => clearTimeout(timeout);
  }
}, [stage, brdVersionId, id, navigate]);

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
                <span className="text-xs text-muted-foreground">Selected Files</span>
                <span className="text-sm font-mono">{selectedFiles.size} of {uploadedFiles.length}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Snippets</span>
                <span className="text-sm font-mono">{totalSnippets}</span>
              </div>
            </div>

            {/* File Selection */}
            {uploadedFiles.length > 0 && (
              <div className="border border-border bg-card">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Select Files to Include
                  </h3>
                </div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {uploadedFiles.map((file) => (
                    <label
                      key={file.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{file.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {file.snippetCount} snippets • {file.type.toUpperCase()}
                        </div>
                      </div>
                      {file.snippetBreakdown && (
                        <div className="flex gap-2 text-xs">
                          {file.snippetBreakdown.REQUIREMENT > 0 && (
                            <span className="text-blue-400">{file.snippetBreakdown.REQUIREMENT}R</span>
                          )}
                          {file.snippetBreakdown.DECISION > 0 && (
                            <span className="text-green-400">{file.snippetBreakdown.DECISION}D</span>
                          )}
                          {file.snippetBreakdown.CONSTRAINT > 0 && (
                            <span className="text-yellow-400">{file.snippetBreakdown.CONSTRAINT}C</span>
                          )}
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {uploadedFiles.length === 0 && (
              <div className="border border-dashed border-border bg-card px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">No processed files found</p>
                <button
                  onClick={() => navigate(`/projects/${id}/brd`)}
                  className="text-xs text-primary hover:underline"
                >
                  Upload transcripts first →
                </button>
              </div>
            )}

            <button
              onClick={handleStartGeneration}
              disabled={stage !== "idle" || selectedFiles.size === 0 || totalSnippets === 0}
              className="bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedFiles.size === 0 
                ? "Select files to continue" 
                : totalSnippets === 0
                ? "No snippets to process"
                : `Generate BRD from ${totalSnippets} snippets →`}
            </button>
            
            {error && (
              <div className="border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-400">
                Error: {error}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Generating BRD {versionNumber}</h1>
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

            {/* Quality Score Display */}
            {qualityScore && (stage === "quality" || stage === "auditing" || stage === "done") && (
              <div className="border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Quality Score</span>
                  <span className="text-2xl font-mono font-semibold text-foreground">{qualityScore.total}/100</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Completeness</span>
                      <span className="font-mono">{qualityScore.completeness}</span>
                    </div>
                    <div className="w-full h-1.5 bg-border">
                      <div className="h-full bg-green-400" style={{ width: `${qualityScore.completeness}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Clarity</span>
                      <span className="font-mono">{qualityScore.clarity}</span>
                    </div>
                    <div className="w-full h-1.5 bg-border">
                      <div className="h-full bg-yellow-400" style={{ width: `${(qualityScore.clarity / 20) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Consistency</span>
                      <span className="font-mono">{qualityScore.consistency}</span>
                    </div>
                    <div className="w-full h-1.5 bg-border">
                      <div className="h-full bg-blue-400" style={{ width: `${(qualityScore.consistency / 40) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Auditor Message */}
            {auditMessage && stage === "auditing" && (
              <div className="border border-primary/30 bg-primary/5 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-xs font-mono uppercase tracking-wider text-primary">AI Auditor</span>
                </div>
                <p className="text-sm text-foreground">{auditMessage}</p>
              </div>
            )}

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
