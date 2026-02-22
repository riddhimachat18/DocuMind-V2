import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { toast } from "sonner";

type Step = 1 | 2 | 3;

const NewProject = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleSource = (src: string) => {
    setSources(prev => prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (!user) {
      toast.error("You must be logged in to create a project");
      return;
    }

    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, "projects"), {
        name: name.trim(),
        description: description.trim(),
        createdBy: user.uid,
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        currentBrdVersionId: null,
        qualityScore: 0,
        members: [],
        connectedSources: {
          gmail: sources.includes("gmail"),
          slack: sources.includes("slack"),
          meeting: sources.includes("meeting"),
        },
      });

      toast.success("Project created successfully!");
      navigate(`/projects/${docRef.id}/brd`);
    } catch (error) {
      console.error("Failed to create project:", error);
      toast.error("Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, label: "Details" },
    { num: 2, label: "Sources" },
    { num: 3, label: "Review" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-6">
        <Link to="/dashboard" className="text-sm font-semibold tracking-tight">DocuMind</Link>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="text-xs text-muted-foreground">New Project</span>
      </header>

      <main className="max-w-xl mx-auto px-6 py-16">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-12">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono ${
                step === s.num
                  ? "border border-primary text-primary"
                  : step > s.num
                  ? "border border-border text-muted-foreground bg-card"
                  : "border border-border text-muted-foreground"
              }`}>
                {step > s.num ? "✓" : `0${s.num}`} {s.label}
              </div>
              {i < steps.length - 1 && (
                <div className="w-8 border-t border-dashed border-border" />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Details */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Project details</h1>
              <p className="text-sm text-muted-foreground">Give your project a name and description.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Project name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Customer Portal Redesign"
                className="w-full bg-card border border-border text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief summary of this project's scope and goals..."
                rows={4}
                className="w-full bg-card border border-border text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!name.trim()}
                className="bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Sources */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Connect data sources</h1>
              <p className="text-sm text-muted-foreground">Select where DocuMind should pull requirements from.</p>
            </div>

            {[
              { id: "gmail", label: "Gmail", desc: "Connect your Gmail to pull stakeholder emails and threads.", icon: "✉" },
              { id: "slack", label: "Slack", desc: "Connect Slack to ingest channel discussions and DMs.", icon: "#" },
              { id: "meeting", label: "Meeting Recording", desc: "Upload audio/video recordings — DocuMind will transcribe and extract requirements.", icon: "◎" },
            ].map((src) => (
              <button
                key={src.id}
                onClick={() => toggleSource(src.id)}
                className={`w-full border p-4 text-left flex items-start gap-4 transition-colors ${
                  sources.includes(src.id)
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-foreground/20"
                }`}
              >
                <span className="text-lg font-mono text-muted-foreground mt-0.5">{src.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {src.label}
                    {sources.includes(src.id) && (
                      <span className="text-xs text-primary font-mono">Connected ✓</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{src.desc}</div>
                </div>
              </button>
            ))}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Review & create</h1>
              <p className="text-sm text-muted-foreground">Confirm your project details before creating.</p>
            </div>

            <div className="border border-border bg-card divide-y divide-border">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-xs text-muted-foreground">Project name</span>
                <span className="text-sm">{name}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-xs text-muted-foreground">Description</span>
                <span className="text-sm text-right max-w-xs">{description || "—"}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-xs text-muted-foreground">Sources</span>
                <span className="text-sm font-mono">{sources.length > 0 ? sources.join(", ") : "None selected"}</span>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create project →"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default NewProject;
