import { useState, useRef, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { saveBRDVersion } from "../services/brdVersionService";
import { exportBrdPdf } from "../services/pdfExportService";
import { toast } from "sonner";
import { onChatMessageFn } from "../lib/functions";
import { db } from "../lib/firebase";
import { collection, query, where, orderBy as firestoreOrderBy, onSnapshot, addDoc, Timestamp, getDoc, doc } from "firebase/firestore";
import QualityScorePanel from "../components/QualityScorePanel";
import { runDeterministicGapCheck, markGapResolved, Gap } from "../lib/gapChecker";
import { UseCaseDiagram } from "../components/UseCaseDiagram";

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
    (sections.externalInterfaces?.length ?? 0) > 0,
    (sections.useCases?.length ?? 0) > 0,
    (sections.glossary?.length ?? 0) > 0,
  ];
  
  const completeness = Math.round((sectionChecks.filter(Boolean).length / 9) * 40);
  
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

const QualityRing = ({ score, completeness, consistency, clarity, diagramCoverage }: { 
  score: number; 
  completeness?: number; 
  consistency?: number; 
  clarity?: number;
  diagramCoverage?: number;
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
        {diagramCoverage !== undefined && diagramCoverage !== null && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Diagram Coverage</span>
              <span className="font-mono text-foreground">{diagramCoverage}%</span>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${diagramCoverage >= 80 ? "bg-green-400" : diagramCoverage >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                style={{ width: `${diagramCoverage}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Actor legend extracted from PlantUML SVG ─────────────────────────────────
const ActorLegend = ({ svgString }: { svgString: string }) => {
  // Extract actor names from SVG title/text elements
  const actors: string[] = [];
  const matches = svgString.matchAll(/<text[^>]*>([^<]{2,40})<\/text>/g);
  const seen = new Set<string>();
  for (const m of matches) {
    const t = m[1].trim();
    if (t && !t.startsWith("UC") && !t.startsWith("<<") && !seen.has(t) && t.length > 1) {
      seen.add(t);
      actors.push(t);
    }
  }
  if (actors.length === 0) return null;
  return (
    <div className="mt-4 border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            <th className="text-left px-3 py-2 font-mono text-muted-foreground">Actor</th>
            <th className="text-left px-3 py-2 font-mono text-muted-foreground">Role</th>
          </tr>
        </thead>
        <tbody>
          {actors.slice(0, 8).map((actor, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-foreground font-mono">{actor}</td>
              <td className="px-3 py-2 text-muted-foreground">Identified from requirements</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [conflictStatus, setConflictStatus] = useState<"pending" | "done">("done");
  const [useCaseDiagramMermaid, setUseCaseDiagramMermaid] = useState<string>("");
  const [diagramCoverage, setDiagramCoverage] = useState<number | null>(null);
  const [detectedGaps, setDetectedGaps] = useState<Gap[]>([]);
  const [auditRound, setAuditRound] = useState(0);
  const [auditComplete, setAuditComplete] = useState(false);
  const [conflictSummary, setConflictSummary] = useState<any>(null);
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
        { id: "externalInterfaces",  title: "External Interfaces" },
        { id: "useCases",            title: "Use Cases" },
        { id: "glossary",            title: "Glossary" },
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

        // Set conflict status
        setConflictStatus(data.conflictStatus === "pending" ? "pending" : "done");
        
        // Load use case diagram
        if (data.useCaseDiagramMermaid) setUseCaseDiagramMermaid(data.useCaseDiagramMermaid);
        if (typeof data.diagramCoverage === "number") setDiagramCoverage(data.diagramCoverage);

        // Load conflict summary
        if (data.conflictSummary) setConflictSummary(data.conflictSummary);
        
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
          { id: "externalInterfaces",  title: "External Interfaces" },
          { id: "useCases",            title: "Use Cases" },
          { id: "glossary",            title: "Glossary" },
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

        // Run deterministic gap check on loaded sections
        const rawSectionsForGap: Record<string, string | undefined> = {};
        for (const key of Object.keys(rawSections)) rawSectionsForGap[key] = rawSections[key];
        const gaps = data.detectedGaps ?? runDeterministicGapCheck(rawSectionsForGap);
        setDetectedGaps(gaps);
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

        // Update conflict status
        if (data.conflictStatus) {
          setConflictStatus(data.conflictStatus === "pending" ? "pending" : "done");
        }

        // Update diagram if available
        if (data.useCaseDiagramMermaid) setUseCaseDiagramMermaid(data.useCaseDiagramMermaid);
        if (typeof data.diagramCoverage === "number") setDiagramCoverage(data.diagramCoverage);

        // Update detected gaps from Firestore (persisted by backend)
        if (data.detectedGaps) setDetectedGaps(data.detectedGaps);

        // Update conflict summary
        if (data.conflictSummary) setConflictSummary(data.conflictSummary);
        
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
          { id: "externalInterfaces",  title: "External Interfaces" },
          { id: "useCases",            title: "Use Cases" },
          { id: "glossary",            title: "Glossary" },
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
    
    try {
      await addDoc(collection(db, "chatMessages"), {
        brdVersionId,
        role: "user",
        content: userMessage,
        timestamp: Timestamp.now()
      });
      
      setIsTyping(true);
      const nextRound = auditRound + 1;
      setAuditRound(nextRound);
      
      const chatHistory = chatMessages.map(msg => ({
        role: msg.role || (msg.type === "user" ? "user" : "assistant"),
        content: msg.text
      }));
      
      const result = await onChatMessageFn({
        projectId: id,
        brdVersionId,
        userMessage,
        chatHistory
      });
      
      const { brdUpdated, detectedGaps: updatedGaps } = result.data as any;
      
      if (brdUpdated) {
        toast.success("BRD updated by AI auditor");
      }

      // Update gap state from backend response
      if (updatedGaps) {
        setDetectedGaps(updatedGaps);
      }

      // Check for AUDIT_COMPLETE in the response message
      const msg = (result.data as any).message ?? "";
      if (msg.includes("AUDIT_COMPLETE")) {
        setAuditComplete(true);
        toast.success("Audit complete — document validated");
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

    try {
      // Wait for Mermaid to finish rendering if it hasn't already
      const container = document.getElementById("uc-diagram-container");
      let svg = container?.querySelector("svg");
      
      if (!svg && useCaseDiagramMermaid) {
        // Mermaid hasn't rendered yet — wait up to 3 seconds
        console.log("[PDF Export] Waiting for Mermaid diagram to render...");
        await new Promise<void>((resolve) => {
          let attempts = 0;
          const check = setInterval(() => {
            const ready = document.getElementById("uc-diagram-container")?.querySelector("svg");
            if (ready || attempts >= 15) {
              clearInterval(check);
              svg = ready || null;
              resolve();
            }
            attempts++;
          }, 200);
        });
      }

      // Capture the rendered Mermaid SVG from the DOM (will be captured inside exportBrdPdf)
      const brdContent = {
        projectName: project.name,
        sections: sections,
        qualityScore: qualityScore
      };

      await exportBrdPdf(brdContent, project.name, null, undefined, diagramCoverage);
      toast.success("PDF exported successfully");
    } catch (error: any) {
      console.error("Error exporting BRD:", error);
      alert(`PDF export failed: ${error.message}`);
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
          <Link to="/" className="text-sm font-semibold tracking-tight">DocuMind</Link>
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
            {isExporting ? '⏳ Building PDF…' : 'Export PDF  ↓'}
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
            {conflictSummary && (
              <button
                onClick={() => document.getElementById("section-conflictAnalysis")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={`text-left text-xs px-2 py-2 rounded transition-colors leading-tight ${
                  conflictSummary.confirmedConflicts > 0 ? "text-red-400" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Conflict Analysis
                {conflictSummary.confirmedConflicts > 0 && (
                  <span className="ml-1 font-mono">({conflictSummary.confirmedConflicts})</span>
                )}
              </button>
            )}
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

                    {/* Use Case Diagram — rendered client-side with Mermaid.js */}
                    {section.id === "useCases" && useCaseDiagramMermaid && (
                      <div className="mb-6">
                        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                          8.1 System Use Case Diagram
                        </p>
                        <UseCaseDiagram 
                          mermaidSyntax={useCaseDiagramMermaid}
                          coverageScore={diagramCoverage || undefined}
                        />
                      </div>
                    )}
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

                  {/* Conflict Analysis subsection */}
                  {conflictSummary && (
                    <section id="section-conflictAnalysis" className="mb-8">
                      <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3 border-b border-border pb-2">
                        Conflict Analysis
                      </h2>
                      <div className="flex gap-4 mb-4 text-xs">
                        <div className="border border-border bg-card px-3 py-2">
                          <div className="text-muted-foreground">Requirements</div>
                          <div className="font-mono text-foreground text-lg">{conflictSummary.totalRequirements}</div>
                        </div>
                        <div className="border border-border bg-card px-3 py-2">
                          <div className="text-muted-foreground">Phase 1 Candidates</div>
                          <div className="font-mono text-foreground text-lg">{conflictSummary.candidatePairs}</div>
                        </div>
                        <div className={`border bg-card px-3 py-2 ${conflictSummary.confirmedConflicts > 0 ? "border-red-400/40" : "border-border"}`}>
                          <div className="text-muted-foreground">Confirmed Conflicts</div>
                          <div className={`font-mono text-lg ${conflictSummary.confirmedConflicts > 0 ? "text-red-400" : "text-green-400"}`}>
                            {conflictSummary.confirmedConflicts}
                          </div>
                        </div>
                      </div>

                      {conflictSummary.conflicts?.length > 0 && (
                        <div className="flex flex-col gap-3">
                          {(["high", "medium", "low"] as const).map(sev => {
                            const sevConflicts = conflictSummary.conflicts.filter((c: any) => c.severity === sev);
                            if (sevConflicts.length === 0) return null;
                            return (
                              <div key={sev}>
                                <div className={`text-xs font-mono uppercase tracking-widest mb-2 ${
                                  sev === "high" ? "text-red-400" : sev === "medium" ? "text-amber-400" : "text-yellow-400"
                                }`}>
                                  {sev} severity {sev === "high" && "— blocks export"}
                                </div>
                                {sevConflicts.map((c: any, i: number) => (
                                  <div key={i} className={`border p-3 mb-2 text-xs ${
                                    sev === "high" ? "border-red-400/30 bg-red-400/5" :
                                    sev === "medium" ? "border-amber-400/30 bg-amber-400/5" :
                                    "border-yellow-400/20 bg-yellow-400/5"
                                  }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="font-mono text-muted-foreground">{c.reqAId}</span>
                                      <span className="text-muted-foreground">↔</span>
                                      <span className="font-mono text-muted-foreground">{c.reqBId}</span>
                                      <span className={`ml-auto border px-1.5 py-0.5 font-mono text-[10px] ${
                                        sev === "high" ? "border-red-400/40 text-red-400" :
                                        sev === "medium" ? "border-amber-400/40 text-amber-400" :
                                        "border-yellow-400/40 text-yellow-400"
                                      }`}>{c.conflictType?.replace("_", " ")}</span>
                                    </div>
                                    <p className="text-muted-foreground mb-1">{c.reason}</p>
                                    {c.suggestedResolution && (
                                      <p className="text-primary/70 text-[10px] font-mono">→ {c.suggestedResolution}</p>
                                    )}
                                    <p className="text-muted-foreground/50 text-[10px] mt-1 font-mono">
                                      similarity: {c.similarityScore}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {conflictSummary.confirmedConflicts === 0 && (
                        <p className="text-xs text-green-400 font-mono">✓ No conflicts detected — document cleared for export</p>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right pane: AI Quality Auditor */}
        <div className="w-80 border-l border-border flex flex-col overflow-hidden flex-shrink-0">
          {/* Quality score */}
          <div className="px-4 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Quality Auditor</p>
              {conflictStatus === "pending" && (
                <span className="text-xs font-mono text-amber-400 border border-amber-400/30 px-2 py-0.5 animate-pulse">
                  Checking conflicts…
                </span>
              )}
            </div>
            <QualityScorePanel
              qualityScore={qualityScore}
              diagramCoverage={diagramCoverage ?? qualityScore?.diagramCoverage}
            />
          </div>

          {/* Gap resolution tracker */}
          {detectedGaps.length > 0 && (
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Gap Tracker</p>
                {auditComplete && (
                  <span className="text-xs font-mono text-green-400 border border-green-400/30 px-2 py-0.5">
                    ✓ Audit Complete
                  </span>
                )}
              </div>
              <div className="flex gap-3 text-xs mb-2">
                <span className="text-muted-foreground">
                  Total: <span className="font-mono text-foreground">{detectedGaps.length}</span>
                </span>
                <span className="text-green-400">
                  Resolved: <span className="font-mono">{detectedGaps.filter(g => g.resolved).length}</span>
                </span>
                <span className="text-amber-400">
                  Remaining: <span className="font-mono">{detectedGaps.filter(g => !g.resolved).length}</span>
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {detectedGaps.map((gap, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs px-2 py-1.5 border ${
                    gap.resolved
                      ? "border-green-400/20 bg-green-400/5 text-muted-foreground"
                      : gap.severity === "critical"
                      ? "border-red-400/30 bg-red-400/5"
                      : "border-amber-400/30 bg-amber-400/5"
                  }`}>
                    <span className="flex-shrink-0 font-mono">
                      {gap.resolved ? "✓" : gap.severity === "critical" ? "✗" : "⚠"}
                    </span>
                    <span className={gap.resolved ? "line-through" : ""}>
                      {gap.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
