import { useState, useRef, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { mockBRDSections, mockEvidence, mockAIMessages, type BRDSentence, type Evidence } from "../data/brdData";

const platformIcon = (platform: string) => {
  if (platform === "slack") return <span className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground">#</span>;
  if (platform === "email") return <span className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground">✉</span>;
  return <span className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground">◎</span>;
};

const QualityRing = ({ score }: { score: number }) => {
  const color = score >= 80 ? "#4ade80" : score >= 60 ? "#facc15" : "#f87171";
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="flex items-center gap-3">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(0 0% 18%)" strokeWidth="4" />
        <circle
          cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="butt" transform="rotate(-90 36 36)"
        />
        <text x="36" y="40" textAnchor="middle" fill="white" fontSize="13" fontWeight="600" fontFamily="monospace">
          {score}
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Completeness</span><span className="font-mono ml-8">88</span>
        </div>
        <div className="w-32 h-1 bg-border"><div className="h-full bg-green-400" style={{ width: "88%" }} /></div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Clarity</span><span className="font-mono ml-8">79</span>
        </div>
        <div className="w-32 h-1 bg-border"><div className="h-full bg-yellow-400" style={{ width: "79%" }} /></div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Consistency</span><span className="font-mono ml-8">85</span>
        </div>
        <div className="w-32 h-1 bg-border"><div className="h-full bg-green-400" style={{ width: "85%" }} /></div>
      </div>
    </div>
  );
};

type ChatMessage = { id: string; type: 'ai' | 'user'; text: string; timestamp: string };

const BRDEdit = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);

  const [selectedSentence, setSelectedSentence] = useState<BRDSentence | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(mockAIMessages);
  const [chatInput, setChatInput] = useState("");
  const [sections, setSections] = useState(mockBRDSections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSentenceClick = (sentence: BRDSentence) => {
    setSelectedSentence(sentence);
    setSelectedEvidence(sentence.evidence || []);
  };

  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      text: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");

    setTimeout(() => {
      const aiReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        type: 'ai',
        text: "✅ Understood. I've noted that context. Would you like me to suggest updated wording for this requirement based on your input?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages(prev => [...prev, aiReply]);
    }, 1200);
  };

  const handleEditSave = (sectionId: string, sentenceId: string) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        sentences: sec.sentences.map(s => s.id === sentenceId ? { ...s, text: editText } : s),
      };
    }));
    setEditingId(null);
  };

  if (!project) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Project not found.</p>
    </div>
  );

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-sm font-semibold tracking-tight">DocuMind</Link>
          <span className="text-xs text-muted-foreground">→</span>
          <button onClick={() => navigate(`/projects/${id}/brd`)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {project.name}
          </button>
          <span className="text-xs text-muted-foreground">→</span>
          <span className="text-xs text-foreground">Draft Edit — v4.0</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors font-medium">
            Save BRD Version
          </button>
          <button
            onClick={() => navigate(`/projects/${id}/brd/history`)}
            className="text-xs border border-border px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            History
          </button>
        </div>
      </header>

      {/* Three-pane layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left pane: Evidence */}
        <div className="w-72 border-r border-border flex flex-col overflow-hidden flex-shrink-0">
          <div className="px-4 py-3 border-b border-border flex-shrink-0">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Evidence View</p>
            {selectedSentence && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{selectedSentence.text.slice(0, 60)}…</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedSentence && (
              <div className="px-4 py-6 text-xs text-muted-foreground leading-relaxed">
                Click any sentence in the BRD to see its source evidence here.
              </div>
            )}
            {selectedEvidence.length > 0 ? selectedEvidence.map((ev) => (
              <div key={ev.id} className="border-b border-border px-4 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-secondary border border-border flex items-center justify-center text-xs font-mono text-muted-foreground">
                    {ev.avatarInitials}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{ev.author}</div>
                    <div className="text-xs text-muted-foreground">{ev.timestamp}</div>
                  </div>
                  <div className="ml-auto">{platformIcon(ev.platform)}</div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed border-l border-border pl-3">
                  "{ev.content}"
                </p>
              </div>
            )) : selectedSentence && (
              <div className="px-4 py-4 text-xs text-muted-foreground">No evidence linked to this sentence.</div>
            )}
          </div>
        </div>

        {/* Center pane: Editable BRD */}
        <div className="flex-1 overflow-y-auto px-8 py-8 pl-16">
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight mb-1">{project.name}</h1>
            <p className="text-xs text-muted-foreground mb-8 font-mono">Draft v4.0 — Inline editing enabled</p>

            {sections.map((section) => (
              <section key={section.id} className="mb-8">
                <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3 border-b border-border pb-2">
                  {section.title}
                </h2>
                <div className="flex flex-col gap-2">
                  {section.sentences.map((sentence) => (
                    <div key={sentence.id}>
                      {editingId === sentence.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="w-full bg-card border border-primary text-sm text-foreground px-3 py-2 focus:outline-none resize-none leading-relaxed"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditSave(section.id, sentence.id)}
                              className="text-xs bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleSentenceClick(sentence)}
                          onDoubleClick={() => { setEditingId(sentence.id); setEditText(sentence.text); }}
                          className={`text-sm leading-relaxed cursor-pointer px-3 py-2 transition-all group relative ${
                            selectedSentence?.id === sentence.id
                              ? "bg-primary/10 border-l-2 border-primary"
                              : sentence.hasConflict
                              ? "border-l-2 border-red-400 bg-red-400/5 hover:bg-red-400/10"
                              : "hover:bg-secondary/50 border-l-2 border-transparent"
                          }`}
                        >
                          {/* Edit indicator icon - appears on hover */}
                          <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </div>

                          {sentence.hasConflict && (
                            <span className="text-red-400 mr-1.5" title="Conflict detected">⚠</span>
                          )}
                          {sentence.text}
                          
                          {/* Source count badge */}
                          {sentence.evidence && sentence.evidence.length > 0 && (
                            <span className="ml-2 text-xs text-primary/60 group-hover:text-primary transition-colors font-mono">
                              {sentence.evidence.length} source{sentence.evidence.length > 1 ? 's' : ''}
                            </span>
                          )}
                          
                          {/* Floating edit hint - positioned above content */}
                          <span className="absolute -top-6 right-2 text-xs text-muted-foreground bg-background border border-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-sm">
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              double-click to edit
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Right pane: AI Quality Auditor */}
        <div className="w-80 border-l border-border flex flex-col overflow-hidden flex-shrink-0">
          {/* Quality score */}
          <div className="px-4 py-4 border-b border-border flex-shrink-0">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Quality Auditor</p>
            <QualityRing score={84} />
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`text-xs leading-relaxed ${msg.type === 'ai' ? '' : 'text-right'}`}
              >
                {msg.type === 'ai' && (
                  <div className="text-xs text-muted-foreground mb-1 font-mono">AI Auditor · {msg.timestamp}</div>
                )}
                <div className={`inline-block max-w-full px-3 py-2 text-left ${
                  msg.type === 'ai'
                    ? 'bg-secondary border border-border text-foreground'
                    : 'bg-primary text-primary-foreground'
                }`}>
                  {msg.text}
                </div>
                {msg.type === 'user' && (
                  <div className="text-xs text-muted-foreground mt-1 font-mono">{msg.timestamp}</div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-border px-4 py-3 flex-shrink-0">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChatSend()}
                placeholder="Reply to AI auditor…"
                className="flex-1 bg-card border border-border text-xs text-foreground px-3 py-2 focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
              />
              <button
                onClick={handleChatSend}
                className="bg-primary text-primary-foreground px-3 py-2 text-xs hover:bg-primary/90 transition-colors"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BRDEdit;
