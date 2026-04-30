import { useEffect, useRef } from "react";
import mermaid from "mermaid";

// Initialize Mermaid with configuration
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "system-ui, -apple-system, sans-serif",
});

interface UseCaseDiagramProps {
  mermaidSyntax: string;
  coverageScore?: number;
}

/**
 * UseCaseDiagram Component
 * 
 * Renders use case diagrams client-side using Mermaid.js library.
 * This eliminates external server dependencies and enables offline-capable
 * diagram generation.
 * 
 * Benefits over PlantUML:
 * - Zero external HTTP calls (no PlantUML server dependency)
 * - Offline-capable rendering
 * - Faster generation (no network latency)
 * - Better security (no data sent to external servers)
 */
export function UseCaseDiagram({ mermaidSyntax, coverageScore }: UseCaseDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log("[UseCaseDiagram] Component mounted/updated. Syntax length:", mermaidSyntax?.length || 0);
    
    if (ref.current && mermaidSyntax) {
      console.log("[UseCaseDiagram] Rendering diagram. First 200 chars:", mermaidSyntax.substring(0, 200));
      
      // Clear previous content
      ref.current.innerHTML = "";
      
      // Create a unique ID for this diagram
      const id = `mermaid-${Date.now()}`;
      
      // Create a div with the mermaid syntax
      const div = document.createElement("div");
      div.className = "mermaid";
      div.textContent = mermaidSyntax;
      div.id = id;
      
      ref.current.appendChild(div);
      
      // Render the diagram
      console.log("[UseCaseDiagram] Calling mermaid.run()...");
      mermaid.run({ nodes: [div] }).then(() => {
        console.log("[UseCaseDiagram] Mermaid rendering completed successfully");
      }).catch((error) => {
        console.error("[UseCaseDiagram] Mermaid rendering error:", error);
        if (ref.current) {
          ref.current.innerHTML = `
            <div class="border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-400">
              <p class="font-medium mb-2">Diagram Rendering Error</p>
              <p class="text-xs">The use case diagram could not be rendered. This may be due to invalid Mermaid syntax.</p>
              <p class="text-xs mt-2">Error: ${error.message || error}</p>
            </div>
          `;
        }
      });
    } else {
      console.log("[UseCaseDiagram] No diagram to render. ref.current:", !!ref.current, "mermaidSyntax:", !!mermaidSyntax);
    }
  }, [mermaidSyntax]);

  if (!mermaidSyntax) {
    return (
      <div className="border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>No use case diagram available for this BRD version.</p>
      </div>
    );
  }

  return (
    <div id="uc-diagram-container" className="use-case-diagram-container">
      <div 
        ref={ref} 
        className="mermaid-container bg-white p-4 rounded border border-border overflow-x-auto"
        style={{ minHeight: "400px" }}
      />
      {coverageScore !== undefined && coverageScore !== null && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>
            Diagram Coverage: <span className="font-mono font-medium text-foreground">{coverageScore}%</span> of functional requirements represented
          </span>
        </div>
      )}
    </div>
  );
}
