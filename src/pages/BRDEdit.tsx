import { useState, useRef, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { saveBRDVersion } from "../services/brdVersionService";
import { exportBRDToPDF } from "../services/pdfExportService";
import { toast } from "sonner";
import { onChatMessageFn } from "../lib/functions";
import { db } from "../lib/firebase";
import { collection, query, where, orderBy as firestoreOrderBy, onSnapshot, addDoc, Timestamp, getDoc, doc } from "firebase/firestore";

type BRDSentence = { 
  id: string; 
  text: string; 
  sectionId?: string;
  hasConflict?: boolean; 
  evidence?: any[] 
};

type Evidence = {
  id: string;
  author: string;
  avatarInitials: string;
  timestamp: string;
  platform: string;
  content: string;
};
const platformIcon = (platform: string) => {
  if (platform === "slack") return <span className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground">#</span>;
  if (platform === "email") return <span className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground">✉</span>;
  return <span className="text-xs font-mono border border-border px-1.5 py-0.5 text-muted-foreground">◎</span>;
};

// Calculate quality score from sections
const calculateQualityScore = (sections: any) => {
  const sectionChecks = [
    (sections.executiveSummary?.length ?? 0) > 50,
    (sections.stakeholderRegister?.length ?? 0) > 0,
    (sections.functionalReqs?.length ?? 0) > 0,
    (sections.nfrReqs?.length ?? 0) > 0,
    (sections.assumptions?.length ?? 0) > 0,
    (sections.successMetrics?.length ?? 0) > 0,
  ];
  
  const completeness = Math.round((sectionChecks.filter(Boolean).length / 6) * 40);
  
  // Count requirements
  const frs = sections.functionalReqs
    ? sections.functionalReqs.split("\n").filter((l: string) => l.includes("FR-") || l.includes("NFR-"))
    : [];
  
  const avgWords = frs.length > 0
    ? frs.reduce((s: number, l: string) => s + l.split(" ").length, 0) / frs.length
    : 0;
  
  const clarity = avgWords === 0 ? 10
    : avgWords < 10 ? 18
    : avgWords < 15 ? 20
    : avgWords <= 25 ? 18 : 12;
  
  const consistency = 40; // Default, will be updated by conflict detection
  
  const total = completeness + consistency + clarity;
  
  return { completeness, consistency, clarity, total };
};

const QualityRing = ({ score, completeness, consistency, clarity }: { 
  score: number; 
  completeness?: number; 
  consistency?: number; 
  clarity?: number; 
}) => {
  // Ensure we have valid numbers
  const safeScore = Math.max(0, Math.min(100, score || 0));
  const safeCompleteness = Math.max(0, Math.min(40, completeness || 0));
  const safeClarity = Math.max(0, Math.min(20, clarity || 0));
  const safeConsistency = Math.max(0, Math.min(40, consistency || 0));
  
  const color = safeScore >= 80 ? "#4ade80" : safeScore >= 60 ? "#facc15" : safeScore >= 40 ? "#fb923c" : "#f87171";
  const r = 32;
  const circ = 2 * Math.PI * r;
  const offset = circ - (safeScore / 100) * circ;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center">
        <svg width="80" height="80" viewBox="0 0 80 80" className="drop-shadow-lg">
          {/* Background circle */}
          <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(0 0% 15%)" strokeWidth="6" />
          {/* Progress circle */}
          <circle
            cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
          {/* Score text */}
          <text x="40" y="45" textAnchor="middle" fill={color} fontSize="18" fontWeight="700" fontFamily="monospace">
            {safeScore}
          </text>
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Completeness</span>
            <span className="font-mono text-foreground">{safeCompleteness}/40</span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-400 transition-all duration-500" 
              style={{ width: `${(safeCompleteness / 40) * 100}%` }} 
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Clarity</span>
            <span className="font-mono text-foreground">{safeClarity}/20</span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div 
              className="h-full bg-yellow-400 transition-all duration-500" 
              style={{ width: `${(safeClarity / 20) * 100}%` }} 
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Consistency</span>
            <span className="font-mono text-foreground">{safeConsistency}/40</span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-400 transition-all duration-500" 
              style={{ width: `${(safeConsistency / 40) * 100}%` }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

type ChatMessage = { id: string; type: 'ai' | 'user'; text: string; timestamp: string; role?: 'user' | 'assistant' };

const BRDEdit = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);

  const [selectedSentence, setSelectedSentence] = useState<BRDSentence | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence[]>([]);
  const [allSentenceEvidence, setAllSentenceEvidence] = useState<Record<string, any>>({});
  const [citations, setCitations] = useState<Record<string, any>>({});
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sections, setSections] = useState<any[]>([]);
  const [brdLoading, setBrdLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [brdVersionId, setBrdVersionId] = useState<string | null>(null);
  const [qualityScore, setQualityScore] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("v1.0");
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasInitializedChat = useRef(false);

  // Load BRD version ID from project
  useEffect(() => {
    if (!id) return;
    
    const loadBrdVersionId = async () => {
      try {
        const projectDoc = await getDoc(doc(db, "projects", id));
        if (projectDoc.exists()) {
          const data = projectDoc.data();
          setBrdVersionId(data.currentBrdVersionId || null);
        }
      } catch (error) {
        console.error("Error loading BRD version ID:", error);
      }
    };
    
    loadBrdVersionId();
  }, [id]);

  // Reload BRD sections (used after AI updates)
  const reloadBrdSections = async () => {
    if (!brdVersionId) return;
    
    try {
      const brdDoc = await getDoc(doc(db, "brdVersions", brdVersionId));
      if (!brdDoc.exists()) return;

      const data = brdDoc.data();
      const rawSections = data.sections ?? {};
      const sentenceEvidenceData = data.sentenceEvidence ?? {};
      const rawCitations = data.citations ?? {};
      
      setAllSentenceEvidence(sentenceEvidenceData);
      setCitations(rawCitations);
      
      if (data.version) setCurrentVersion(data.version);
      
      const score = data.qualityScore;
      if (score && typeof score === 'object' && score.total > 0) {
        setQualityScore(score);
      }

      // Check for last updated section and flash it
      const lastUpdated = data.lastUpdatedSection ?? null;
      if (lastUpdated) {
        setFlashSection(lastUpdated);
        setTimeout(() => setFlashSection(null), 3000);
      }

      const SECTION_ORDER = [
        { id: "executiveSummary",    title: "Executive Summary" },
        { id: "stakeholderRegister", title: "Stakeholder Register" },
        { id: "functionalReqs",      title: "Functional Requirements" },
        { id: "nfrReqs",             title: "Non-Functional Requirements" },
        { id: "assumptions",         title: "Assumptions & Constraints" },
        { id: "successMetrics",      title: "Success Metrics" },
      ];

      const mapped = SECTION_ORDER
        .filter(s => rawSections[s.id])
        .map(s => {
          const sectionEvidence = sentenceEvidenceData[s.id] || {};
          return {
            id: s.id,
            title: s.title,
            sentences: rawSections[s.id]
              .split("\n")
              .map((line: string) => line.trim())
              .filter((line: string) => 
                line.length > 10 &&
                !line.match(/^\[/) &&
                !line.match(/^\]/) &&
                !line.match(/^,+$/) &&
                !line.match(/^\d+$/) &&
                !line.match(/^[,.\]\[;:\s]+$/) &&
                !line.match(/\[SOURCE\s*$/)
              )
              .map((line: string, i: number) => {
                const evidence = sectionEvidence[line] || [];
                return {
                  id: `${s.id}-${i}`,
                  text: line,
                  sectionId: s.id,
                  hasConflict: false,
                  evidence: evidence
                };
              })
          };
        });

      setSections(mapped);
    } catch (err) {
      console.error("Error reloading BRD sections:", err);
    }
  };

  // Load BRD sections from Firestore
  useEffect(() => {
    if (!brdVersionId) return;

    const loadBrdSections = async () => {
      setBrdLoading(true);
      try {
        const brdDoc = await getDoc(doc(db, "brdVersions", brdVersionId));
        if (!brdDoc.exists()) return;

        const data = brdDoc.data();
        const rawSections = data.sections ?? {};
        const sentenceEvidenceData = data.sentenceEvidence ?? {};
        const rawCitations = data.citations ?? {};
        
        // Store sentence evidence for lookup
        setAllSentenceEvidence(sentenceEvidenceData);
        setCitations(rawCitations);
        
        // Set version number
        if (data.version) setCurrentVersion(data.version);
        
        // Set quality score with fallback
        const score = data.qualityScore;
        console.log("Quality score from Firestore:", score);
        
        if (score && typeof score === 'object' && score.total > 0) {
          setQualityScore(score);
        } else {
          // Calculate quality score from sections if not present
          console.log("Calculating quality score from sections");
          const calculatedScore = calculateQualityScore(rawSections);
          setQualityScore(calculatedScore);
          
          // Update Firestore with calculated score
          if (brdVersionId) {
            const { doc, updateDoc } = await import("firebase/firestore");
            await updateDoc(doc(db, "brdVersions", brdVersionId), {
              qualityScore: calculatedScore
            }).catch(err => console.warn("Failed to update quality score:", err));
          }
        }

        // Map Firestore sections object into the array format the UI expects
        const SECTION_ORDER = [
          { id: "executiveSummary",    title: "Executive Summary" },
          { id: "stakeholderRegister", title: "Stakeholder Register" },
          { id: "functionalReqs",      title: "Functional Requirements" },
          { id: "nfrReqs",             title: "Non-Functional Requirements" },
          { id: "assumptions",         title: "Assumptions & Constraints" },
          { id: "successMetrics",      title: "Success Metrics" },
        ];

        const mapped = SECTION_ORDER
          .filter(s => rawSections[s.id])
          .map(s => {
            const sectionEvidence = sentenceEvidenceData[s.id] || {};
            return {
              id: s.id,
              title: s.title,
              sentences: rawSections[s.id]
                .split("\n")
                .map((line: string) => line.trim())
                .filter((line: string) => 
                  line.length > 10 &&
                  !line.match(/^\[/) &&
                  !line.match(/^\]/) &&
                  !line.match(/^,+$/) &&
                  !line.match(/^\d+$/) &&
                  !line.match(/^[,.\]\[;:\s]+$/) &&
                  !line.match(/\[SOURCE\s*$/)
                )
                .map((line: string, i: number) => {
                  const evidence = sectionEvidence[line] || [];
                  return {
                    id: `${s.id}-${i}`,
                    text: line,
                    sectionId: s.id,
                    hasConflict: false,
                    evidence: evidence
                  };
                })
            };
          });

        setSections(mapped);
      } catch (err) {
        console.error("Error loading BRD sections:", err);
        toast.error("Failed to load BRD content");
      } finally {
        setBrdLoading(false);
      }
    };

    loadBrdSections();
    
    // Set up real-time listener for BRD updates
    const unsubscribe = onSnapshot(
      doc(db, "brdVersions", brdVersionId),
      (snapshot) => {
        if (!snapshot.exists()) return;
        
        const data = snapshot.data();
        
        // Update quality score
        if (data.qualityScore) {
          setQualityScore(data.qualityScore);
        }
        
        // Reload sections whenever Firestore document changes
        const rawSections = data.sections ?? {};
        const rawCitations = data.citations ?? {};
        
        const SECTION_ORDER = [
          { id: "executiveSummary",    title: "Executive Summary" },
          { id: "stakeholderRegister", title: "Stakeholder Register" },
          { id: "functionalReqs",      title: "Functional Requirements" },
          { id: "nfrReqs",             title: "Non-Functional Requirements" },
          { id: "assumptions",         title: "Assumptions & Constraints" },
          { id: "successMetrics",      title: "Success Metrics" },
        ];
        
        const mapped = SECTION_ORDER
          .filter(s => rawSections[s.id])
          .map(s => ({
            id: s.id,
            title: s.title,
            sentences: rawSections[s.id]
              .split("\n")
              .map((line: string) => line.trim())
              .filter((line: string) => 
                line.length > 10 &&
                !line.match(/^\[/) &&
                !line.match(/^\]/) &&
                !line.match(/^,+$/) &&
                !line.match(/^\d+$/) &&
                !line.match(/^[,.\]\[;:\s]+$/) &&
                !line.match(/\[SOURCE\s*$/)
              )
              .map((line: string, i: number) => ({
                id: `${s.id}-${i}`,
                text: line,
                sectionId: s.id,
                hasConflict: false,
                evidence: []
              }))
          }));
        
        if (mapped.length > 0) {
          setSections(mapped);
          setCitations(rawCitations);
        }
        
        // Flash the last updated section if present
        const lastUpdated = data.lastUpdatedSection ?? null;
        if (lastUpdated) {
          setFlashSection(lastUpdated);
          setTimeout(() => setFlashSection(null), 3000);
        }
      },
      (error) => {
        console.error("Error listening to BRD updates:", error);
      }
    );
    
    return () => unsubscribe();
  }, [brdVersionId]);

  // Load chat history from Firestore
  useEffect(() => {
    if (!brdVersionId) return;

    const q = query(
      collection(db, "chatMessages"),
      where("brdVersionId", "==", brdVersionId),
      firestoreOrderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.role === "user" ? "user" : "ai",
          text: data.content || data.message || "",
          timestamp: data.timestamp?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || "",
          role: data.role,
        } as ChatMessage;
      });
      
      setChatMessages(messages);
      
      // Auto-start chat if no messages exist
      if (messages.length === 0 && !hasInitializedChat.current) {
        hasInitializedChat.current = true;
        handleInitialChatMessage();
      }
    });

    return () => unsubscribe();
  }, [brdVersionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sectionEls = sections.map(s => ({
        id: s.id,
        el: document.getElementById(`section-${s.id}`)
      })).filter(s => s.el);
      
      const centerPane = document.getElementById("brd-center-pane");
      const scrollTop = centerPane?.scrollTop ?? 0;
      
      for (let i = sectionEls.length - 1; i >= 0; i--) {
        const el = sectionEls[i].el!;
        if (el.offsetTop <= scrollTop + 100) {
          setActiveSection(sectionEls[i].id);
          break;
        }
      }
    };

    const centerPane = document.getElementById("brd-center-pane");
    centerPane?.addEventListener("scroll", handleScroll);
    return () => centerPane?.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const handleInitialChatMessage = async () => {
    if (!id || !brdVersionId) return;
    
    setIsTyping(true);
    
    try {
      // Save initial user message
      await addDoc(collection(db, "chatMessages"), {
        brdVersionId,
        role: "user",
        content: "Review this BRD and identify the most critical gaps or issues.",
        timestamp: Timestamp.now()
      });
      
      const result = await onChatMessageFn({
        projectId: id,
        brdVersionId,
        userMessage: "Review this BRD and identify the most critical gaps or issues.",
        chatHistory: []
      });
      
      const { message, brdUpdated } = result.data as any;
      
      if (brdUpdated) {
        toast.success("BRD updated based on AI analysis");
        // Trigger reload of BRD sections
        const brdDoc = await getDoc(doc(db, "brdVersions", brdVersionId));
        if (brdDoc.exists()) {
          // The real-time listener will handle the update
        }
      }
    } catch (error: any) {
      console.error("Error initializing chat:", error);
      // Don't show error toast for initial message - it's automatic
    } finally {
      setIsTyping(false);
    }
  };

  const handleSentenceClick = async (sentence: BRDSentence, sectionId: string) => {
    setSelectedSentence(sentence);
    setSelectedEvidence([]);
    setEvidenceLoading(true);

    // Find citation keys that match this sentence
    const sectionCitations = citations[sectionId] ?? {};
    
    // Match sentence text against citation keys
    // Citations keys are cleaned sentence text — do a partial match
    const matchedSnippetIds: string[] = [];
    for (const [citationKey, snippetIds] of Object.entries(sectionCitations)) {
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const sentenceNorm = normalize(sentence.text);
      const keyNorm = normalize(citationKey as string);
      
      // Match if either contains the other (handles truncation)
      if (sentenceNorm.includes(keyNorm.slice(0, 40)) || 
          keyNorm.includes(sentenceNorm.slice(0, 40))) {
        matchedSnippetIds.push(...(snippetIds as string[]));
      }
    }

    if (matchedSnippetIds.length === 0) {
      setSelectedEvidence([]);
      setEvidenceLoading(false);
      return;
    }

    // Fetch each snippet from Firestore
    try {
      const snippetDocs = await Promise.all(
        matchedSnippetIds.slice(0, 5).map(sid => getDoc(doc(db, "snippets", sid)))
      );
      
      const evidence: Evidence[] = snippetDocs
        .filter(d => d.exists())
        .map(d => {
          const data = d.data()!;
          const author = data.author ?? "Unknown";
          const initials = author.split("@")[0].slice(0, 2).toUpperCase();
          
          // Format timestamp
          let timestamp = "";
          if (data.timestamp) {
            try {
              timestamp = new Date(data.timestamp).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              });
            } catch { 
              timestamp = data.timestamp; 
            }
          }
          
          // Map source to platform
          const platformMap: Record<string, string> = {
            gmail: "email",
            meeting: "meeting",
            upload: "meeting",
            slack: "slack"
          };
          
          // Truncate at sentence boundary
          const raw = data.rawText ?? "";
          const truncated = raw.length <= 500 ? raw : (() => {
            const cut = raw.slice(0, 500);
            const lastPeriod = Math.max(
              cut.lastIndexOf(". "),
              cut.lastIndexOf(".\n"),
              cut.lastIndexOf("? "),
              cut.lastIndexOf("! ")
            );
            return lastPeriod > 100 ? cut.slice(0, lastPeriod + 1) : cut;
          })();
          
          return {
            id: d.id,
            author,
            avatarInitials: initials,
            timestamp,
            platform: platformMap[data.source] ?? "email",
            content: truncated
          };
        });
      
      setSelectedEvidence(evidence);
    } catch (err) {
      console.error("Error fetching evidence:", err);
      setSelectedEvidence([]);
    } finally {
      setEvidenceLoading(false);
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || !id || !brdVersionId) return;
    
    const userMessage = chatInput.trim();
    setChatInput("");
    
    // Save user message to Firestore
    try {
      await addDoc(collection(db, "chatMessages"), {
        brdVersionId,
        role: "user",
        content: userMessage,
        timestamp: Timestamp.now()
      });
      
      setIsTyping(true);
      
      // Build chat history
      const chatHistory = chatMessages.map(msg => ({
        role: msg.role || (msg.type === "user" ? "user" : "assistant"),
        content: msg.text
      }));
      
      // Call AI - the Cloud Function will save the assistant message
      const result = await onChatMessageFn({
        projectId: id,
        brdVersionId,
        userMessage,
        chatHistory
      });
      
      const { brdUpdated } = result.data as any;
      
      if (brdUpdated) {
        toast.success("BRD updated by AI auditor");
      }
    } catch (error: any) {
      console.error("Error sending chat message:", error);
      toast.error(error.message || "Failed to send message");
    } finally {
      setIsTyping(false);
    }
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

  const handleExportPDF = async () => {
    if (!project || !id) {
      toast.error("Unable to export BRD");
      return;
    }

    setIsExporting(true);
    
    // Open new tab immediately to avoid popup blocker
    const newTab = window.open('about:blank', '_blank');
    
    try {
      // Structure BRD content for PDF export
      const brdContent = {
        projectName: project.name,
        sections: sections,
        qualityScore: qualityScore
      };

      const brdExport = await exportBRDToPDF(id, brdContent);

      toast.success(`BRD ${brdExport.version} exported successfully!`);
      
      // Update the new tab with PDF URL
      if (newTab) {
        newTab.location.href = brdExport.downloadURL;
      } else {
        // Fallback if popup was blocked
        window.open(brdExport.downloadURL, '_blank');
      }
      
    } catch (error: any) {
      console.error("Error exporting BRD:", error);
      toast.error(`Failed to export BRD: ${error.message}`);
      // Close the blank tab if export failed
      if (newTab) {
        newTab.close();
      }
    } finally {
      setIsExporting(false);
    }
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
          <span className="text-xs text-foreground">Draft Edit — {currentVersion}</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="text-xs bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? 'Exporting...' : 'Export Draft (PDF)'}
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
        <div className="w-72 border-r border-border flex flex-col overflow-hidden flex-shrink-0 bg-card">
          <div className="px-4 py-3 border-b border-border flex-shrink-0">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Evidence View</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedSentence && (
              <div className="px-4 py-6 text-xs text-muted-foreground leading-relaxed">
                Click any sentence in the BRD to see its source evidence here.
              </div>
            )}
            {selectedSentence && (
              <div className="px-4 py-3 border-b border-border bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Selected:</p>
                <p className="text-xs text-foreground leading-relaxed">{selectedSentence.text}</p>
              </div>
            )}
            {evidenceLoading && (
              <div className="px-4 py-6 text-xs text-muted-foreground">
                Loading sources...
              </div>
            )}
            {!evidenceLoading && selectedEvidence.length > 0 ? (
              <div className="divide-y divide-border">
                {selectedEvidence.map((ev, idx) => (
                  <div key={ev.id} className="px-4 py-4 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-start gap-2 mb-2">
                      <div className="w-6 h-6 bg-primary/10 border border-primary/30 flex items-center justify-center text-xs font-mono text-primary flex-shrink-0">
                        {ev.avatarInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground mb-1">
                          {ev.author}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {platformIcon(ev.platform)}
                          {ev.timestamp && <span>• {ev.timestamp}</span>}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3 bg-secondary/20 py-2">
                      {ev.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : !evidenceLoading && selectedSentence && (
              <div className="px-4 py-4 text-xs text-muted-foreground">
                No evidence linked to this sentence.
              </div>
            )}
          </div>
        </div>

        {/* Center pane: Editable BRD */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* Section navigation rail */}
          <div className="w-40 flex-shrink-0 border-r border-border overflow-y-auto py-6 px-2 flex flex-col gap-1">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground px-2 mb-3">Sections</p>
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => {
                  document.getElementById(`section-${section.id}`)?.scrollIntoView({ 
                    behavior: "smooth", 
                    block: "start" 
                  });
                }}
                className={`text-left text-xs px-2 py-2 rounded transition-colors leading-tight ${
                  activeSection === section.id
                    ? "text-primary border-l-2 border-primary pl-1.5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {section.title}
              </button>
            ))}
          </div>

          {/* Scrollable content area */}
          <div id="brd-center-pane" className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-2xl bg-background">
              <h1 className="text-xl font-semibold tracking-tight mb-1">{project.name}</h1>
              <p className="text-xs text-muted-foreground mb-8 font-mono">Draft {currentVersion} — Inline editing enabled</p>

              {brdLoading ? (
                <div className="text-sm text-muted-foreground py-10 text-center">
                  Loading BRD content...
                </div>
              ) : sections.length === 0 ? (
                <div className="text-sm text-muted-foreground py-10 text-center">
                  No BRD content found. Generate a BRD first.
                </div>
              ) : (
                <>
                  {sections.map((section) => (
                  <section 
                    key={section.id}
                    id={`section-${section.id}`}
                    className={`mb-8 transition-all duration-500 ${
                      flashSection === section.id ? "ring-2 ring-primary bg-primary/5 p-4 rounded" : ""
                    }`}
                  >
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
                          onClick={() => handleSentenceClick(sentence, section.id)}
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
                          {(() => {
                            const sectionCits = citations[section.id] ?? {};
                            const hasEvidence = Object.keys(sectionCits).some(key => 
                              sentence.text.toLowerCase().includes(key.toLowerCase().slice(0, 30))
                            );
                            return hasEvidence;
                          })() && (
                            <span className="ml-2 text-xs text-primary/60 group-hover:text-primary transition-colors font-mono">
                              sources
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right pane: AI Quality Auditor */}
        <div className="w-80 border-l border-border flex flex-col overflow-hidden flex-shrink-0">
          {/* Quality score */}
          <div className="px-4 py-4 border-b border-border flex-shrink-0">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Quality Auditor</p>
            <QualityRing 
              score={qualityScore?.total ?? 0}
              completeness={qualityScore?.completeness ?? 0}
              consistency={qualityScore?.consistency ?? 0}
              clarity={qualityScore?.clarity ?? 0}
            />
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
            {isTyping && (
              <div className="text-xs leading-relaxed">
                <div className="text-xs text-muted-foreground mb-1 font-mono">AI Auditor · typing...</div>
                <div className="inline-block bg-secondary border border-border text-foreground px-3 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-border px-4 py-3 flex-shrink-0">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && !isTyping && handleChatSend()}
                placeholder={isTyping ? "AI is typing..." : "Reply to AI auditor…"}
                disabled={isTyping}
                className="flex-1 bg-card border border-border text-xs text-foreground px-3 py-2 focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleChatSend}
                disabled={isTyping || !chatInput.trim()}
                className="bg-primary text-primary-foreground px-3 py-2 text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
