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

/**
 * Format version number as string (e.g., 1.0 -> "v1.0")
 */
function formatVersion(versionNumber: number): string {
  return `v${versionNumber.toFixed(1)}`;
}

/**
 * Generate a clean, structured PDF from BRD content data
 * Uses document-based generation with proper typography and layout
 */
function generatePDFFromContent(brdContent: BRDContent, version: string): jsPDF {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 25;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = margin;
  let pageNumber = 1;

  // Color palette
  const colors = {
    primary: [37, 99, 235],      // Blue
    text: [31, 41, 55],           // Dark gray
    textLight: [107, 114, 128],   // Medium gray
    border: [229, 231, 235],      // Light gray
    conflict: [220, 38, 38]       // Red
  };

  // Helper: Check if new page is needed
  const checkPageBreak = (requiredSpace: number = 15): boolean => {
    if (yPosition + requiredSpace > pageHeight - 35) {
      addFooter();
      pdf.addPage();
      pageNumber++;
      yPosition = margin;
      return true;
    }
    return false;
  };

  // Helper: Add footer with version and page number
  const addFooter = () => {
    const footerY = pageHeight - 15;
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.textLight);
    pdf.setFont('helvetica', 'normal');
    
    // Left: Version and date
    const exportDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    pdf.text(`${version} • Exported ${exportDate}`, margin, footerY);
    
    // Right: Page number
    pdf.text(`Page ${pageNumber}`, pageWidth - margin, footerY, { align: 'right' });
  };

  // Helper: Wrap text to fit width
  const wrapText = (text: string, maxWidth: number): string[] => {
    return pdf.splitTextToSize(text, maxWidth);
  };

  // ===== TITLE PAGE =====
  yPosition = pageHeight / 3;
  
  // Project name
  pdf.setFontSize(32);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.text);
  const titleLines = wrapText(brdContent.projectName, contentWidth);
  titleLines.forEach(line => {
    pdf.text(line, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 12;
  });

  yPosition += 8;

  // Document type
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.textLight);
  pdf.text('Business Requirements Document', pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 15;

  // Version badge
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.primary);
  pdf.text(version, pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 8;

  // Export date
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.textLight);
  const exportDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  pdf.text(exportDate, pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 15;

  // Quality Score Box (if available)
  if (brdContent.qualityScore) {
    const score = brdContent.qualityScore;
    const boxWidth = 60;
    const boxHeight = 35;
    const boxX = pageWidth - margin - boxWidth;
    const boxY = yPosition;

    // Box background
    pdf.setFillColor(249, 250, 251);
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'FD');

    // Title
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.textLight);
    pdf.text('QUALITY SCORE', boxX + boxWidth / 2, boxY + 5, { align: 'center' });

    // Total score
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    const scoreColor = score.total >= 80 ? [34, 197, 94] : score.total >= 60 ? [234, 179, 8] : [239, 68, 68];
    pdf.setTextColor(...scoreColor);
    pdf.text(`${score.total}`, boxX + boxWidth / 2, boxY + 15, { align: 'center' });

    // Breakdown
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.textLight);
    pdf.text(`Completeness: ${score.completeness}`, boxX + 3, boxY + 22);
    pdf.text(`Consistency: ${score.consistency}`, boxX + 3, boxY + 26);
    pdf.text(`Clarity: ${score.clarity}`, boxX + 3, boxY + 30);
  }

  addFooter();

  // ===== CONTENT PAGES =====
  pdf.addPage();
  pageNumber++;
  yPosition = margin;

  brdContent.sections.forEach((section, sectionIndex) => {
    // Check if we need a new page for section header
    checkPageBreak(25);

    // Section title
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.text);
    
    const sectionTitle = section.title.toUpperCase();
    pdf.text(sectionTitle, margin, yPosition);
    yPosition += 3;

    // Section underline
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Section content
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.text);

    // Special formatting for Stakeholder Register
    if (section.id === 'stakeholders') {
      pdf.setFontSize(11);
      
      section.sentences.forEach((sentence, idx) => {
        checkPageBreak(18);
        
        // Parse stakeholder entry: "Name (Role) — Description"
        const parts = sentence.text.split('—');
        
        if (parts.length >= 2) {
          // Name and role (bold)
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colors.text);
          const nameRole = parts[0].trim();
          pdf.text(nameRole, margin + 3, yPosition);
          yPosition += 6;

          // Description (normal)
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...colors.textLight);
          const description = parts.slice(1).join('—').trim();
          const wrappedDesc = wrapText(description, contentWidth - 6);
          
          wrappedDesc.forEach(line => {
            checkPageBreak(6);
            pdf.text(line, margin + 3, yPosition);
            yPosition += 5;
          });
          
          yPosition += 4;
        } else {
          // Fallback for non-standard format
          const wrapped = wrapText(sentence.text, contentWidth - 6);
          wrapped.forEach(line => {
            checkPageBreak(6);
            pdf.text(line, margin + 3, yPosition);
            yPosition += 5;
          });
          yPosition += 4;
        }
      });
    } 
    // Special formatting for Traceability Matrix
    else if (section.id === 'traceability') {
      pdf.setFontSize(10);
      pdf.setFont('courier', 'normal');
      pdf.setTextColor(...colors.text);
      
      section.sentences.forEach(sentence => {
        checkPageBreak(12);
        const wrapped = wrapText(sentence.text, contentWidth - 6);
        wrapped.forEach(line => {
          checkPageBreak(5);
          pdf.text(line, margin + 3, yPosition);
          yPosition += 5;
        });
        yPosition += 3;
      });
    }
    // Standard paragraph formatting
    else {
      pdf.setFontSize(11);
      
      section.sentences.forEach((sentence, idx) => {
        checkPageBreak(18);

        // Conflict indicator
        if (sentence.hasConflict) {
          pdf.setTextColor(...colors.conflict);
          pdf.setFont('helvetica', 'bold');
          pdf.text('⚠', margin, yPosition);
          pdf.setTextColor(...colors.text);
          pdf.setFont('helvetica', 'normal');
        }

        // Sentence text
        const xOffset = sentence.hasConflict ? 8 : 0;
        const wrapped = wrapText(sentence.text, contentWidth - xOffset);
        
        wrapped.forEach((line, lineIdx) => {
          if (lineIdx > 0) checkPageBreak(6);
          pdf.text(line, margin + xOffset, yPosition);
          yPosition += 6;
        });

        // Spacing between sentences
        yPosition += 5;
      });
    }

    // Spacing between sections
    yPosition += 10;

    // Add page break before next section if near bottom
    if (sectionIndex < brdContent.sections.length - 1 && yPosition > pageHeight - 50) {
      addFooter();
      pdf.addPage();
      pageNumber++;
      yPosition = margin;
    }
  });

  // Final footer
  addFooter();

  return pdf;
}

/**
 * Export BRD content to PDF and save to Firebase Storage
 * Uses structured content data instead of screenshot capture
 */
export async function exportBRDToPDF(
  projectId: string,
  brdContent: BRDContent
): Promise<BRDExport> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  try {
    console.log("Step 1: Getting next version number...");
    const versionNumber = await getNextVersionNumber(projectId);
    const version = formatVersion(versionNumber);
    
    console.log(`Step 2: Generating PDF document for ${version}...`);
    
    // Generate PDF from structured content
    const pdf = generatePDFFromContent(brdContent, version);
    
    console.log("Step 3: Converting PDF to blob...");
    const pdfBlob = pdf.output('blob');
    
    // Create filename
    const fileName = `BRD_${version}_${brdContent.projectName.replace(/\s+/g, '_')}.pdf`;
    const storagePath = `brd-version/${projectId}/${fileName}`;
    
    console.log("Step 4: Uploading PDF to storage:", storagePath);
    
    // Upload to Firebase Storage
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, pdfBlob, {
      contentType: 'application/pdf',
      customMetadata: {
        projectId,
        version,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      }
    });
    
    console.log("Step 5: PDF uploaded successfully, getting download URL...");
    
    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    
    console.log("Step 6: Saving metadata to Firestore...");
    
    // Save metadata to Firestore
    const exportData: Omit<BRDExport, "id"> = {
      projectId,
      version,
      versionNumber,
      fileName,
      storagePath,
      downloadURL,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      fileSize: pdfBlob.size
    };
    
    const docRef = await addDoc(collection(db, "brdExports"), exportData);
    
    console.log("Step 7: BRD export completed successfully:", docRef.id);
    
    return {
      id: docRef.id,
      ...exportData,
      createdAt: new Date()
    };
    
  } catch (error: any) {
    console.error("Error exporting BRD to PDF:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    throw new Error(`Failed to export BRD: ${error.message}`);
  }
}

/**
 * Get all BRD exports for a project
 */
export async function getBRDExports(projectId: string): Promise<BRDExport[]> {
  const exportsRef = collection(db, "brdExports");
  const q = query(
    exportsRef,
    where("projectId", "==", projectId),
    orderBy("versionNumber", "desc")
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as BRDExport));
}

/**
 * Get latest BRD export for a project
 */
export async function getLatestBRDExport(projectId: string): Promise<BRDExport | null> {
  const exports = await getBRDExports(projectId);
  return exports.length > 0 ? exports[0] : null;
}
