import { jsPDF } from "jspdf";
import { auth, db, storage } from "../lib/firebase";
import {
  collection, query, where, orderBy, getDocs, limit, addDoc, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ── Color palette ──────────────────────────────────────────────────────────────
const inkBlack:  [number,number,number] = [13,  12,   8];
const amber:     [number,number,number] = [245, 166,  35];
const amberDark: [number,number,number] = [180, 115,  10];
const slate:     [number,number,number] = [60,   58,  52];
const ruleColor: [number,number,number] = [200, 195, 182];
const white:     [number,number,number] = [255, 255, 255];
const pageBase:  [number,number,number] = [252, 250, 246];

// ── Page geometry ──────────────────────────────────────────────────────────────
const ML = 22;   // left margin mm
const MR = 22;   // right margin mm
const MT = 24;   // top margin mm
const MB = 20;   // bottom margin mm
const TW = 166;  // text width mm  (210 - 22 - 22)

// ── Section metadata ──────────────────────────────────────────────────────────
const SECTION_META: { id: string; num: string; title: string }[] = [
  { id: "executiveSummary",    num: "1", title: "Executive Summary" },
  { id: "stakeholderRegister", num: "2", title: "Stakeholder Register" },
  { id: "functionalReqs",      num: "3", title: "Functional Requirements" },
  { id: "nfrReqs",             num: "4", title: "Non-Functional Requirements" },
  { id: "assumptions",         num: "5", title: "Assumptions & Constraints" },
  { id: "successMetrics",      num: "6", title: "Success Metrics" },
  { id: "externalInterfaces",  num: "7", title: "External Interfaces" },
  { id: "useCases",            num: "8", title: "Use Cases" },
  { id: "glossary",            num: "9", title: "Glossary" },
];

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface BRDSection {
  id: string;
  title: string;
  sentences: Array<{ id: string; text: string; hasConflict?: boolean }>;
}

export interface BRDContent {
  projectName: string;
  sections: BRDSection[];
  qualityScore?: { total: number; completeness: number; consistency: number; clarity: number };
}

export interface BRDExport {
  id: string;
import { storage, auth, db } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { jsPDF } from "jspdf";

export interface BRDExport {
  id?: string;
  projectId: string;
  version: string;
  versionNumber: number;
  fileName: string;
  storagePath: string;
  downloadURL: string;
  createdBy: string;
  createdAt: any;
  fileSize?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getNextVersionNumber(projectId: string): Promise<number> {
  try {
    const q = query(
      collection(db, "brdExports"),
export interface BRDSection {
  id: string;
  title: string;
  sentences: Array<{
    id: string;
    text: string;
    hasConflict?: boolean;
  }>;
}

export interface BRDContent {
  projectName: string;
  sections: BRDSection[];
  qualityScore?: {
    total: number;
    completeness: number;
    consistency: number;
    clarity: number;
  };
}

/**
 * Get the next version number for a project
 */
async function getNextVersionNumber(projectId: string): Promise<number> {
  try {
    const exportsRef = collection(db, "brdExports");
    const q = query(
      exportsRef,
      where("projectId", "==", projectId),
      orderBy("versionNumber", "desc"),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return 1.0;
    }
    
    const latestExport = snapshot.docs[0].data();
    const currentVersion = latestExport.versionNumber || 1.0;
    
    return Math.floor(currentVersion) + 1.0;
  } catch (error: any) {
    console.log("Could not query existing versions, starting with v1.0:", error.message);
    return 1.0;
  }
}

function formatVersion(n: number): string {
  return `v${n.toFixed(1)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

// ── Capture Mermaid diagram from DOM ──────────────────────────────────────────
async function captureMermaidDiagramAsPng(
  containerId: string = "uc-diagram-container"
): Promise<string | null> {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn("[PDF Export] UC diagram container not found — skipping diagram");
    return null;
  }

  const svg = container.querySelector("svg");
  if (!svg) {
    console.warn("[PDF Export] No SVG found in UC diagram container — skipping");
    return null;
  }

  try {
    // Get SVG dimensions
    const bbox = svg.getBoundingClientRect();
    const width = bbox.width || 600;
    const height = bbox.height || 400;

    // Serialize SVG to string
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);

    // Ensure SVG has explicit width/height for canvas rendering
    svgString = svgString.replace(
      /<svg/,
      `<svg width="${width}" height="${height}"`
    );

    // Convert SVG string to data URL
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Draw onto canvas to get PNG
    return new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // 2x scale for retina sharpness in PDF
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d")!;
        
        // White background (PDF is white, SVG bg may be transparent)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw SVG scaled 2x
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        
        URL.revokeObjectURL(svgUrl);
        resolve(canvas.toDataURL("image/png"));
      };

      img.onerror = () => {
        console.warn("[PDF Export] SVG to PNG conversion failed — skipping diagram");
        URL.revokeObjectURL(svgUrl);
        resolve(null);
      };

      img.src = svgUrl;
    });
  } catch (err) {
    console.warn("[PDF Export] Diagram capture error:", err);
    return null;
  }
}

// ── Core PDF builder ──────────────────────────────────────────────────────────
function buildPdf(
  brdContent: BRDContent,
  mermaidSvgEl: SVGElement | null
): jsPDF {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const PH = 297; // page height mm
  let y = MT;
  let pageNum = 1;
  let totalPages = 0; // will patch after

  // ── helpers ──────────────────────────────────────────────────────────────
  const setFill   = (c: [number,number,number]) => pdf.setFillColor(c[0], c[1], c[2]);
  const setDraw   = (c: [number,number,number]) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setTxt    = (c: [number,number,number]) => pdf.setTextColor(c[0], c[1], c[2]);

  function drawFooter() {
    const fy = 287;
    pdf.setLineWidth(0.3);
    setDraw(ruleColor);
    pdf.line(ML, 283, ML + TW, 283);
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    setTxt(slate);
    pdf.text("Confidential · DocuMind", ML, fy);
    pdf.text(`Page ${pageNum}`, ML + TW, fy, { align: "right" });
  }

  function drawRunningHeader(projectName: string) {
    setFill(inkBlack);
    pdf.rect(0, 0, 210, 10, "F");
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    setTxt(amber);
    pdf.text(projectName.slice(0, 40), ML, 7);
    setTxt(ruleColor);
    pdf.text("IEEE 830 SRS", ML + TW, 7, { align: "right" });
    // thin amber rule below header
    pdf.setLineWidth(0.4);
    setDraw(amber);
    pdf.line(0, 10, 210, 10);
  }

  function newPage(projectName: string) {
    drawFooter();
    pdf.addPage();
    pageNum++;
    drawRunningHeader(projectName);
    y = MT + 10;
  }

  function checkY(needed: number, projectName: string) {
    if (y + needed > PH - MB - 14) newPage(projectName);
  }

  function drawRule() {
    pdf.setLineWidth(0.3);
    setDraw(ruleColor);
    pdf.line(ML, y, ML + TW, y);
    y += 4;
  }

  function drawSectionHeader(num: string, title: string, projectName: string) {
    checkY(22, projectName);
    // amber left border
    setFill(amber);
    pdf.rect(ML, y, 2.5, 14, "F");
    // section number
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    setTxt(slate);
    if (num) pdf.text(num, ML + 6, y + 4);
    // section title
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    setTxt(inkBlack);
    pdf.text(title, ML + 6, y + 10);
    y += 18;
  }

  function drawBody(text: string, projectName: string) {
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    pdf.setFontSize(9.5);
    const LH = 5.5;

    for (const line of lines) {
      const trimmed = line.trim();
      const isTagged = /^(FR|NFR|ASSM|CON|METRIC|UC)-\d+/.test(trimmed);

      if (isTagged) {
        // split ID prefix from rest
        const match = trimmed.match(/^((FR|NFR|ASSM|CON|METRIC|UC)-\d+[.:]\s*)/);
        const prefix = match ? match[1] : "";
        const rest   = match ? trimmed.slice(prefix.length) : trimmed;

        const wrapped = pdf.splitTextToSize(rest, TW - 8);
        checkY((wrapped.length * LH) + 2, projectName);

        // amber tick
        setFill(amber);
        pdf.rect(ML, y - 3.5, 1.5, 5, "F");

        // bold amber prefix
        pdf.setFont("helvetica", "bold");
        setTxt(amberDark);
        pdf.text(prefix, ML + 4, y);

        // normal continuation
        pdf.setFont("helvetica", "normal");
        setTxt(inkBlack);
        const prefixW = pdf.getTextWidth(prefix);
        pdf.text(wrapped[0] ?? "", ML + 4 + prefixW, y);
        y += LH;
        for (let i = 1; i < wrapped.length; i++) {
          checkY(LH, projectName);
          pdf.text(wrapped[i], ML + 4, y);
          y += LH;
        }
      } else {
        const wrapped = pdf.splitTextToSize(trimmed, TW);
        for (const wl of wrapped) {
          checkY(LH, projectName);
          pdf.setFont("helvetica", "normal");
          setTxt(inkBlack);
          pdf.text(wl, ML, y);
          y += LH;
        }
      }
    }
    y += 5;
  }

  // ── COVER PAGE ────────────────────────────────────────────────────────────
  const pName = brdContent.projectName;
  const today = new Date();

  // warm off-white background
  setFill(pageBase);
  pdf.rect(0, 0, 210, 297, "F");

  // ink-black header band
  setFill(inkBlack);
  pdf.rect(0, 0, 210, 52, "F");

  // DocuMind wordmark
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  setTxt(amber);
  pdf.text("DocuMind", ML, 14);

  // thin amber underline below wordmark
  pdf.setLineWidth(0.5);
  setDraw(amber);
  pdf.line(ML, 16, ML + 32, 16);

  // project name
  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  setTxt(white);
  const pNameLines = pdf.splitTextToSize(pName, TW);
  pdf.text(pNameLines, ML, 30);

  // subtitle
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  setTxt(ruleColor);
  pdf.text("Software Requirements Specification", ML, 42);

  // amber accent strip
  setFill(amber);
  pdf.rect(0, 52, 210, 1.5, "F");

  // IEEE 830 badge pill
  setFill([255, 243, 220]);
  pdf.setLineWidth(0.5);
  setDraw(amber);
  pdf.roundedRect(ML, 58, 58, 7, 1.5, 1.5, "FD");
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  setTxt(amberDark);
  pdf.text("IEEE 830 · Full 9-Section Standard", ML + 29, 63.2, { align: "center" });

  // Metadata block
  const metaRows = [
    ["Document Type",  "Software Requirements Specification"],
    ["Standard",       "IEEE 830 (9 Sections)"],
    ["Project",        pName],
    ["Generated",      formatDate(today)],
    ["Classification", "Confidential — Internal Use Only"],
    ["Version",        "1.0 — Initial Release"],
  ];
  let my = 74;
  for (const [label, value] of metaRows) {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    setTxt(slate);
    pdf.text(label, ML, my);
    pdf.setFont("helvetica", "bold");
    setTxt(inkBlack);
    pdf.text(value, ML + 50, my);
    my += 9;
    pdf.setLineWidth(0.2);
    setDraw(ruleColor);
    pdf.line(ML, my - 4, ML + TW, my - 4);
  }

  // Table of Contents
  let ty = my + 10;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  setTxt(inkBlack);
  pdf.text("Contents", ML, ty);
  ty += 3;
  pdf.setLineWidth(0.5);
  setDraw(amber);
  pdf.line(ML, ty, ML + TW, ty);
  ty += 6;

  const tocSections = SECTION_META.filter(s =>
    brdContent.sections.some(bs => bs.id === s.id && bs.sentences.length > 0)
  );
  for (const s of tocSections) {
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    setTxt(inkBlack);
    pdf.text(`${s.num}  ${s.title}`, ML, ty);
    setTxt(slate);
    pdf.text("——", ML + TW, ty, { align: "right" });
    ty += 8;
  }

  // bottom amber strip
  setFill(amber);
  pdf.rect(0, 285, 210, 12, "F");
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  setTxt(white);
  pdf.text("Confidential · Generated by DocuMind · IEEE 830", 105, 292.5, { align: "center" });

  // cover footer
  drawFooter();

  // ── SECTION PAGES ─────────────────────────────────────────────────────────
  pdf.addPage();
  pageNum++;
  drawRunningHeader(pName);
  y = MT + 10;

  for (const meta of SECTION_META) {
    const section = brdContent.sections.find(s => s.id === meta.id);
    if (!section || section.sentences.length === 0) continue;

    drawSectionHeader(meta.num, meta.title, pName);
    const bodyText = section.sentences.map(s => s.text).join("\n");
    drawBody(bodyText, pName);
    drawRule();
    y += 6;
  }

  // ── UML PAGE (if SVG present) ─────────────────────────────────────────────
  if (mermaidSvgEl) {
    try {
      const svgStr = new XMLSerializer().serializeToString(mermaidSvgEl);
      const blob = new Blob([svgStr], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);

      // We return a promise-based approach via a synchronous placeholder
      // The caller handles async SVG → PNG conversion separately
      // For now, add a placeholder section
      newPage(pName);
      drawSectionHeader("", "UML Sequence Diagram", pName);
      // SVG rendering is async — handled in exportBrdPdf wrapper
      URL.revokeObjectURL(url);
    } catch {
      // silently skip
    }
  }

  return pdf;
}

// ── Embed SVG into PDF (uses outer y via closure-style returned delta) ────────
async function renderSvgToPdfImage(
  svgString: string,
  pdf: jsPDF,
  ml: number,
  tw: number
): Promise<{ dataUrl: string; drawH: number } | null> {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        try {
          const scale = 2;
          const canvas = document.createElement("canvas");
          // Use natural dimensions or fall back to reasonable defaults
          const srcW = img.naturalWidth  || img.width  || 800;
          const srcH = img.naturalHeight || img.height || 600;
          canvas.width  = srcW * scale;
          canvas.height = srcH * scale;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");

          const maxH = 180;
          const aspect = srcH / srcW;
          const drawH = Math.min(maxH, tw * aspect);

          URL.revokeObjectURL(url);
          resolve({ dataUrl, drawH });
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };

      // Force browser to treat as image
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

// ── Public export function ────────────────────────────────────────────────────
export async function exportBrdPdf(
  brdContent: BRDContent,
  projectName: string,
  mermaidSvgEl: SVGElement | null,
  useCaseDiagramSvg?: string,
  diagramCoverage?: number
): Promise<void> {
  // Capture the Mermaid diagram from DOM if not provided
  if (!useCaseDiagramSvg) {
    console.log("[PDF Export] Attempting to capture UC diagram from DOM...");
    useCaseDiagramSvg = await captureMermaidDiagramAsPng() || undefined;
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const PH = 297;
  let y = MT;
  let pageNum = 1;

  const setFill = (c: [number,number,number]) => pdf.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: [number,number,number]) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setTxt  = (c: [number,number,number]) => pdf.setTextColor(c[0], c[1], c[2]);

  function drawFooter() {
    const fy = 287;
    pdf.setLineWidth(0.3);
    setDraw(ruleColor);
    pdf.line(ML, 283, ML + TW, 283);
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    setTxt(slate);
    pdf.text("Confidential · DocuMind", ML, fy);
    pdf.text(`Page ${pageNum}`, ML + TW, fy, { align: "right" });
  }

  function drawRunningHeader() {
    setFill(inkBlack);
    pdf.rect(0, 0, 210, 10, "F");
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    setTxt(amber);
    pdf.text(projectName.slice(0, 40), ML, 7);
    setTxt(ruleColor);
    pdf.text("IEEE 830 SRS", ML + TW, 7, { align: "right" });
    pdf.setLineWidth(0.4);
    setDraw(amber);
    pdf.line(0, 10, 210, 10);
  }

  function newPage() {
    drawFooter();
    pdf.addPage();
    pageNum++;
    drawRunningHeader();
    y = MT + 10;
  }

  function checkY(needed: number) {
    if (y + needed > PH - MB - 14) newPage();
  }

  function drawRule() {
    pdf.setLineWidth(0.3);
    setDraw(ruleColor);
    pdf.line(ML, y, ML + TW, y);
    y += 4;
  }

  function drawSectionHeader(num: string, title: string) {
    checkY(22);
    setFill(amber);
    pdf.rect(ML, y, 2.5, 14, "F");
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    setTxt(slate);
    if (num) pdf.text(num, ML + 6, y + 4);
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    setTxt(inkBlack);
    pdf.text(title, ML + 6, y + 10);
    y += 18;
  }

  // ── UC-specific rendering with STRICT 1-page constraint ───────────────────
  function drawUseCasesBody(text: string, startY: number): void {
    const UC_CONFIG = {
      fontSize: 8,           // Smaller font
      lineHeight: 1.25,      // Tighter line height
      sectionMaxHeight: 240, // STRICT: ~1 page in mm
      labelFontSize: 7,      // Smaller labels
      titleFontSize: 9,      // UC title size
    };
    
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    const LH = UC_CONFIG.fontSize * UC_CONFIG.lineHeight * 0.3527; // Convert pt to mm
    
    let linesRendered = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // STRICT: Check if we've exceeded 1 page BEFORE rendering
      const currentHeight = y - startY;
      if (currentHeight >= UC_CONFIG.sectionMaxHeight) {
        console.warn(`[PDF UC Renderer] UC section HARD STOP at 1 page — ${linesRendered} lines rendered`);
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(7);
        setTxt(slate);
        pdf.text("(Content truncated to fit 1 page)", ML, y);
        return;
      }
      
      // UC Title (UC-001: Title)
      const isUCTitle = /^UC-\d+:/i.test(trimmed);
      if (isUCTitle) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(UC_CONFIG.titleFontSize);
        setTxt(inkBlack);
        pdf.text(trimmed, ML, y);
        y += LH * 1.5; // Extra space after title
        linesRendered++;
        continue;
      }
      
      // Field labels (Actor:, Purpose:)
      const isLabel = /^(Actor|Purpose):/i.test(trimmed);
      if (isLabel) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(UC_CONFIG.labelFontSize);
        setTxt(slate);
        pdf.text(trimmed, ML, y);
        y += LH * 1.2;
        linesRendered++;
        continue;
      }
      
      // Numbered steps
      const isStep = /^\d+\./.test(trimmed);
      if (isStep) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(UC_CONFIG.fontSize);
        setTxt(inkBlack);
        
        // Indent steps slightly
        const wrapped = pdf.splitTextToSize(trimmed, TW - 4);
        for (const wrappedLine of wrapped) {
          const currentHeight = y - startY;
          if (currentHeight >= UC_CONFIG.sectionMaxHeight) {
            pdf.setFont("helvetica", "italic");
            pdf.setFontSize(7);
            setTxt(slate);
            pdf.text("(Content truncated)", ML, y);
            return;
          }
          
          pdf.text(wrappedLine, ML + 2, y);
          y += LH;
          linesRendered++;
        }
        continue;
      }
      
      // Any other content (shouldn't happen with simplified format)
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(UC_CONFIG.fontSize);
      setTxt(inkBlack);
      
      const wrapped = pdf.splitTextToSize(trimmed, TW);
      for (const wrappedLine of wrapped) {
        const currentHeight = y - startY;
        if (currentHeight >= UC_CONFIG.sectionMaxHeight) {
          return;
        }
        
        pdf.text(wrappedLine, ML, y);
        y += LH;
        linesRendered++;
      }
    }
    
    console.log(`[PDF UC Renderer] UC section completed: ${linesRendered} lines, ${(y - startY).toFixed(1)}mm used`);
    y += 3; // small gap after UC section
  }

  function drawBody(text: string) {
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    pdf.setFontSize(9.5);
    const LH = 5.5;

    for (const line of lines) {
      const trimmed = line.trim();
      const isTagged = /^(FR|NFR|ASSM|CON|METRIC|UC)-\d+/.test(trimmed);

      if (isTagged) {
        const match = trimmed.match(/^((FR|NFR|ASSM|CON|METRIC|UC)-\d+[.:]\s*)/);
        const prefix = match ? match[1] : "";
        const rest   = match ? trimmed.slice(prefix.length) : trimmed;
        const wrapped = pdf.splitTextToSize(rest, TW - 8);
        checkY((wrapped.length * LH) + 2);

        setFill(amber);
        pdf.rect(ML, y - 3.5, 1.5, 5, "F");
        pdf.setFont("helvetica", "bold");
        setTxt(amberDark);
        pdf.text(prefix, ML + 4, y);
        pdf.setFont("helvetica", "normal");
        setTxt(inkBlack);
        const prefixW = pdf.getTextWidth(prefix);
        pdf.text(wrapped[0] ?? "", ML + 4 + prefixW, y);
        y += LH;
        for (let i = 1; i < wrapped.length; i++) {
          checkY(LH);
          pdf.text(wrapped[i], ML + 4, y);
          y += LH;
        }
      } else {
        const wrapped = pdf.splitTextToSize(trimmed, TW);
        for (const wl of wrapped) {
          checkY(LH);
          pdf.setFont("helvetica", "normal");
          setTxt(inkBlack);
          pdf.text(wl, ML, y);
          y += LH;
        }
      }
    }
    y += 5;
  }

  // ── COVER PAGE ────────────────────────────────────────────────────────────
  const today = new Date();

  setFill(pageBase);
  pdf.rect(0, 0, 210, 297, "F");

  setFill(inkBlack);
  pdf.rect(0, 0, 210, 52, "F");

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  setTxt(amber);
  pdf.text("DocuMind", ML, 14);

  pdf.setLineWidth(0.5);
  setDraw(amber);
  pdf.line(ML, 16, ML + 32, 16);

  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  setTxt(white);
  const pNameLines = pdf.splitTextToSize(projectName, TW);
  pdf.text(pNameLines, ML, 30);

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  setTxt(ruleColor);
  pdf.text("Software Requirements Specification", ML, 42);

  setFill(amber);
  pdf.rect(0, 52, 210, 1.5, "F");

  setFill([255, 243, 220]);
  pdf.setLineWidth(0.5);
  setDraw(amber);
  pdf.roundedRect(ML, 58, 58, 7, 1.5, 1.5, "FD");
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  setTxt(amberDark);
  pdf.text("IEEE 830 · Full 9-Section Standard", ML + 29, 63.2, { align: "center" });

  const metaRows: [string, string][] = [
    ["Document Type",  "Software Requirements Specification"],
    ["Standard",       "IEEE 830 (9 Sections)"],
    ["Project",        projectName],
    ["Generated",      formatDate(today)],
    ["Classification", "Confidential — Internal Use Only"],
    ["Version",        "1.0 — Initial Release"],
  ];
  let my = 74;
  for (const [label, value] of metaRows) {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    setTxt(slate);
    pdf.text(label, ML, my);
    pdf.setFont("helvetica", "bold");
    setTxt(inkBlack);
    pdf.text(value, ML + 50, my);
    my += 9;
    pdf.setLineWidth(0.2);
    setDraw(ruleColor);
    pdf.line(ML, my - 4, ML + TW, my - 4);
  }

  // Table of Contents
  let ty = my + 10;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  setTxt(inkBlack);
  pdf.text("Contents", ML, ty);
  ty += 3;
  pdf.setLineWidth(0.5);
  setDraw(amber);
  pdf.line(ML, ty, ML + TW, ty);
  ty += 6;

  const tocSections = SECTION_META.filter(s =>
    brdContent.sections.some(bs => bs.id === s.id && bs.sentences.length > 0)
  );
  for (const s of tocSections) {
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    setTxt(inkBlack);
    pdf.text(`${s.num}  ${s.title}`, ML, ty);
    setTxt(slate);
    pdf.text("——", ML + TW, ty, { align: "right" });
    ty += 8;
  }

  setFill(amber);
  pdf.rect(0, 285, 210, 12, "F");
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  setTxt(white);
  pdf.text("Confidential · Generated by DocuMind · IEEE 830", 105, 292.5, { align: "center" });

  drawFooter();

  // ── SECTION PAGES ─────────────────────────────────────────────────────────
  pdf.addPage();
  pageNum++;
  drawRunningHeader();
  y = MT + 10;

  for (const meta of SECTION_META) {
    const section = brdContent.sections.find(s => s.id === meta.id);
    if (!section || section.sentences.length === 0) continue;

    // Check if UC section should start on new page
    if (meta.id === "useCases") {
      const remainingSpace = PH - y;
      if (remainingSpace < 80) {
        newPage();
      }
    }

    const sectionStartY = y; // Track where this section starts
    drawSectionHeader(meta.num, meta.title);

    const bodyText = section.sentences.map(s => s.text).join("\n");
    
    // Use specialized UC renderer for use cases section
    if (meta.id === "useCases") {
      drawUseCasesBody(bodyText, sectionStartY);
      
      // Embed diagram at the END of UC section
      if (useCaseDiagramSvg) {
        // Calculate available space on current page
        const spaceRemaining = PH - y - MB;
        const DIAGRAM_MAX_HEIGHT = 100; // mm (~280pt)
        
        // If less than 70mm remaining, start diagram on a new page
        if (spaceRemaining < 70) {
          newPage();
        }
        
        // Add diagram label
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        setTxt(slate);
        pdf.text("Use Case Diagram", ML, y);
        y += 6;
        
        // Add coverage score if available
        if (diagramCoverage !== undefined && diagramCoverage !== null) {
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "normal");
          setTxt(slate);
          pdf.text(`Diagram coverage: ${diagramCoverage}% of functional requirements represented`, ML, y);
          y += 8;
        } else {
          y += 2;
        }
        
        try {
          // Get image properties to preserve aspect ratio
          const imgProps = pdf.getImageProperties(useCaseDiagramSvg);
          const aspectRatio = imgProps.width / imgProps.height;
          
          let renderWidth = TW; // mm
          let renderHeight = renderWidth / aspectRatio;
          
          // If too tall, scale down from height instead
          if (renderHeight > DIAGRAM_MAX_HEIGHT) {
            renderHeight = DIAGRAM_MAX_HEIGHT;
            renderWidth = renderHeight * aspectRatio;
          }
          
          // Center the diagram horizontally
          const diagramX = ML + (TW - renderWidth) / 2;
          
          // Add a light border around the diagram
          pdf.setDrawColor(220, 220, 220);
          pdf.setLineWidth(0.5);
          pdf.rect(diagramX - 1, y - 1, renderWidth + 2, renderHeight + 2);
          
          // Embed the PNG
          pdf.addImage(useCaseDiagramSvg, "PNG", diagramX, y, renderWidth, renderHeight);
          y += renderHeight + 8;
        } catch (err) {
          console.warn("[PDF Export] Failed to embed diagram:", err);
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "italic");
          setTxt(slate);
          pdf.text("Diagram could not be embedded", ML, y);
          y += 8;
        }
      } else {
        // Diagram unavailable — add a placeholder note
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "italic");
        setTxt(slate);
        pdf.text("Use case diagram not available — open the BRD editor to generate it.", ML, y);
        y += 10;
      }
    } else {
      drawBody(bodyText);
    }
    
    drawRule();
    y += 6;
  }

  // ── UML PAGE ──────────────────────────────────────────────────────────────
  if (mermaidSvgEl) {
    await new Promise<void>((resolve) => {
      try {
        const svgStr = new XMLSerializer().serializeToString(mermaidSvgEl);
        const blob = new Blob([svgStr], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
          try {
            const scale = 2;
            const canvas = document.createElement("canvas");
            canvas.width  = img.width  * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d")!;
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL("image/png");

            const maxH = 110;
            const aspect = img.height / img.width;
            const clampedH = Math.min(maxH, TW * aspect);

            newPage();
            drawSectionHeader("", "UML Sequence Diagram");
            checkY(clampedH + 10);
            pdf.addImage(dataUrl, "PNG", ML, y, TW, clampedH);
            y += clampedH + 6;
          } catch { /* skip */ }
          URL.revokeObjectURL(url);
          resolve();
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };

        img.src = url;
      } catch {
        resolve();
      }
    });
  }

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const safeName = projectName.toLowerCase().replace(/\s+/g, "_").slice(0, 30);
  const dateStr  = today.toISOString().slice(0, 10);
  pdf.save(`${safeName}_BRD_IEEE830_${dateStr}.pdf`);
}

// ── Legacy export (keeps BRDEdit.tsx working) ─────────────────────────────────
export async function exportBRDToPDF(
  projectId: string,
  brdContent: BRDContent
): Promise<BRDExport> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  // Build PDF using new engine
  await exportBrdPdf(brdContent, brdContent.projectName, null);

  // Still save metadata to Firestore for history
  const versionNumber = await getNextVersionNumber(projectId);
  const version = formatVersion(versionNumber);
  const fileName = `${brdContent.projectName.replace(/\s+/g, "_")}_BRD_IEEE830_${new Date().toISOString().slice(0, 10)}.pdf`;
  const storagePath = `brd-version/${projectId}/${fileName}`;

  const exportData: Omit<BRDExport, "id"> = {
    projectId,
    version,
    versionNumber,
    fileName,
    storagePath,
    downloadURL: "",
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "brdExports"), exportData);

  return { id: docRef.id, ...exportData, createdAt: new Date() };
}

export async function getBRDExports(projectId: string): Promise<BRDExport[]> {
  const q = query(
    collection(db, "brdExports"),
    where("projectId", "==", projectId),
    orderBy("versionNumber", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BRDExport));
}

export async function getLatestBRDExport(projectId: string): Promise<BRDExport | null> {
  const exports = await getBRDExports(projectId);
  return exports.length > 0 ? exports[0] : null;
}
