import { Link, useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useState } from "react";
import { TranscriptUploadModal } from "../components/TranscriptUploadModal";
import { Snippet } from "../services/transcriptService";
import { exportBRDToPDF } from "../services/pdfExportService";
import { toast } from "sonner";
import { useBRDData } from "../hooks/useBRDData";

type TabType = 'sources' | 'versions' | 'conflicts' | null;

const BRDView = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);
  const [activeTab, setActiveTab] = useState<TabType>('sources');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [meetingTranscriptsConnected, setMeetingTranscriptsConnected] = useState(false);
  const [totalSnippets, setTotalSnippets] = useState(0);
  const [isExporting, setIsExporting] = useState(false);


  // Fetch real data from Firebase
  const { 
    brdSections, 
    dataSources, 
    uploadedFiles, 
    versions, 
    conflicts, 
    loading 
  } = useBRDData(id);

  const handleNewVersion = () => {
    if (!id) return;
    navigate(`/projects/${id}/brd/new`);
  };

  const handleUploadComplete = (snippets: Snippet[]) => {
    toast.success(`Added ${snippets.length} snippets from transcript`);
    // The useBRDData hook will automatically refetch and update the data
  };

  const handleSourceClick = (sourceId: string) => {
    if (sourceId === 'meetings') {
      setShowUploadModal(true);
    }
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
        sections: mockBRDSections
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
      
      // Extract BRD sections from real data
      const sections: any = {};
      
      brdSections.forEach(section => {
        const content = section.sentences.map(s => s.text).join('\n\n');
        sections[section.id] = content;
      });

      // Save BRD version
      const brdVersion = await saveBRDVersion(
        id,
        sections,
        "Manual save from BRD view",
        "draft"
      );

      toast.success(`BRD ${brdVersion.version} saved successfully!`);
      
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

  const getFileIcon = (type: string) => {
    if (type === 'pdf') return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
    if (type === 'docx') return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    );
  };

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
          <span className="text-xs text-muted-foreground">{project?.name || 'Project'}</span>
          <span className="text-xs text-muted-foreground">→</span>
          <span className="text-xs text-foreground">
            {versions.length > 0 ? `BRD ${versions[0].v}` : 'BRD (No versions yet)'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? 'Exporting...' : 'Export to PDF'}
          </button>
          <button
            onClick={() => navigate(`/projects/${id}/brd/history`)}
            className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Version history
          </button>
          <button
            onClick={handleNewVersion}
            onClick={() => navigate(`/projects/${id}/brd/new`)}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 transition-colors"
          >
            + New version
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar with Icon Rail */}
        <div className="flex border-r border-border">
          {/* Icon Rail */}
          <div className="w-16 bg-card border-r border-border flex flex-col items-center py-4 gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'sources' ? null : 'sources')}
              className={`w-10 h-10 flex items-center justify-center rounded transition-all ${
                activeTab === 'sources'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Data Sources"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTab(activeTab === 'versions' ? null : 'versions')}
              className={`w-10 h-10 flex items-center justify-center rounded transition-all ${
                activeTab === 'versions'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Version History"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTab(activeTab === 'conflicts' ? null : 'conflicts')}
              className={`w-10 h-10 flex items-center justify-center rounded transition-all relative ${
                activeTab === 'conflicts'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Conflicts"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {conflicts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs flex items-center justify-center rounded-full font-mono">
                  {conflicts.length}
                </span>
              )}
            </button>
          </div>

          {/* Expandable Content Panel */}
          {activeTab && (
            <div className="w-60 bg-background overflow-y-auto border-r border-border animate-slideIn">
              {/* Data Sources Tab */}
              {activeTab === 'sources' && (
                <div className="flex flex-col h-full">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Data Sources</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {loading ? (
                      <div className="p-4 text-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <p className="text-xs text-muted-foreground mt-2">Loading sources...</p>
                      </div>
                    ) : dataSources.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-xs text-muted-foreground">No data sources available</p>
                      </div>
                    ) : (
                      <>
                        <div className="p-3 space-y-2">
                          {dataSources.map((source) => (
                        <div
                          key={source.id}
                          onClick={() => handleSourceClick(source.id)}
                          className={`border border-border bg-card p-3 rounded transition-colors ${
                            source.id === 'meetings' 
                              ? 'hover:border-primary cursor-pointer hover:shadow-md' 
                              : 'hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{source.icon}</span>
                              <span className="text-xs font-medium text-foreground">{source.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              source.connected
                                ? 'bg-green-500/10 text-green-500'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {source.connected ? 'Connected' : 'Not Connected'}
                            </span>
                            {source.snippets > 0 && (
                              <span className="text-xs font-mono text-muted-foreground">
                                {source.snippets} snippets
                              </span>
                            )}
                          </div>
                          {source.id === 'meetings' && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <div className="flex items-center gap-2 text-xs text-primary">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <span>Click to upload transcripts</span>
                              </div>
                            </div>
                          )}
                        </div>
                          ))}
                          
                          {/* Upload Modal */}
                          {showUploadModal && (
                            <TranscriptUploadModal
                              projectId={id || ''}
                              onUploadComplete={handleUploadComplete}
                              onClose={() => setShowUploadModal(false)}
                            />
                          )}
                        </div>

                        <div className="border-t border-border mt-4">
                          <div className="px-4 py-3">
                            <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
                              Uploaded Files
                            </h4>
                            <div className="space-y-2">
                              {uploadedFiles.map((file) => (
                            <div
                              key={file.id}
                              className="border border-border bg-card p-2 rounded text-xs"
                            >
                              <div className="flex items-start gap-2 mb-1">
                                <div className="text-muted-foreground mt-0.5">
                                  {getFileIcon(file.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-foreground truncate">{file.name}</div>
                                  <div className="text-muted-foreground">{file.uploaded}</div>
                                </div>
                                {file.status === 'processed' ? (
                                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-primary flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                )}
                              </div>
                              {file.snippets > 0 && (
                                <div className="text-muted-foreground font-mono mt-1">
                                  {file.snippets} snippets extracted
                                </div>
                              )}
                            </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Version History Tab */}
              {activeTab === 'versions' && (
                <div className="flex flex-col h-full">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Version History</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {versions.map((ver) => (
                      <button
                        key={ver.v}
                        className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors ${
                          ver.active ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-mono font-semibold ${ver.active ? 'text-primary' : 'text-foreground'}`}>
                            {ver.v}
                          </span>
                          {ver.active && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mb-1">{ver.date}</div>
                        <div className="text-xs text-muted-foreground mb-2">by {ver.by}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Quality:</span>
                          <span className={`text-xs font-mono font-semibold ${
                            ver.score >= 80 ? 'text-green-500' : ver.score >= 60 ? 'text-yellow-500' : 'text-red-500'
                          }`}>
                            {ver.score}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-border px-4 py-3">
                    <button
                      onClick={() => navigate(`/projects/${id}/brd/history`)}
                      className="text-xs text-primary hover:underline w-full text-left"
                    >
                      View full history →
                    </button>
                  </div>
                </div>
              )}

              {/* Conflicts Tab */}
              {activeTab === 'conflicts' && (
                <div className="flex flex-col h-full">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Open Conflicts ({conflicts.length})
                    </h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {conflicts.map((conflict) => (
                      <div
                        key={conflict.id}
                        className="border border-red-400/30 bg-red-400/5 rounded p-3"
                      >
                        <div className="space-y-3">
                          <div className="border-l-2 border-red-400 pl-2">
                            <div className="text-xs font-mono text-red-400 mb-1">{conflict.req1.source}</div>
                            <div className="text-xs text-foreground leading-relaxed">{conflict.req1.text}</div>
                          </div>

                          <div className="flex items-center justify-center">
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                          </div>

                          <div className="border-l-2 border-red-400 pl-2">
                            <div className="text-xs font-mono text-red-400 mb-1">{conflict.req2.source}</div>
                            <div className="text-xs text-foreground leading-relaxed">{conflict.req2.text}</div>
                          </div>
                        </div>

                        <button className="w-full mt-3 text-xs bg-primary text-primary-foreground px-3 py-2 rounded hover:bg-primary/90 transition-colors">
                          Resolve Conflict
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main BRD content */}
        <main className="flex-1 overflow-y-auto px-8 py-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            {versions.length > 0 ? (
              <>
                <span className="text-xs font-mono border border-border px-2 py-0.5 text-muted-foreground">
                  {versions[0].v}
                </span>
                <span className="text-xs text-muted-foreground">{versions[0].date}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No versions created yet</span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">{project?.name || 'Project'}</h1>
          <p className="text-sm text-muted-foreground mb-10">Business Requirements Document — Read-only view</p>

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground mt-4">Loading BRD...</p>
            </div>
          ) : brdSections.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <p className="text-sm text-muted-foreground">No BRD sections found. Generate a BRD to get started.</p>
            </div>
          ) : (
            brdSections.map((section) => (
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
          ))
          )}
        </main>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slideIn {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default BRDView;
