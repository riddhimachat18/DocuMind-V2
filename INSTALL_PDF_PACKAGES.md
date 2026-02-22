# PDF Export Implementation

## Overview

The BRD PDF export feature generates clean, professionally formatted PDF documents from structured content data stored in Firestore. This implementation uses **document-based generation** (not screenshot capture) for high-quality, accessible PDFs.

## Dependencies

### Install Required Package

```bash
npm install jspdf
```

Or with yarn:

```bash
yarn add jspdf
```

## Architecture

### 1. PDF Export Service (`src/services/pdfExportService.ts`)

The service provides content-to-PDF conversion with:
- **Structured content extraction** from Firestore/state
- **Document-based PDF generation** using jsPDF v2.5+
- **Automatic version management** (v1.0, v2.0, etc.)
- **Firebase Storage integration** at `brd-exports/{projectId}/BRD_v{X.0}_{ProjectName}.pdf`
- **Metadata tracking** in Firestore `brdExports` collection

### 2. Key Features

- **Proper Typography**: Hierarchical headings, consistent spacing, readable fonts
- **Logical Section Order**: Executive Summary → Stakeholders → Requirements → etc.
- **Smart Pagination**: Automatic page breaks with content-aware splitting
- **Professional Layout**: Margins, headers, footers with version and timestamp
- **Conflict Indicators**: Visual markers for conflicting requirements
- **Special Formatting**: 
  - Stakeholder register with bold names and descriptions
  - Traceability matrix in monospace font
  - Requirement IDs and structured content

### 3. Content Structure

The PDF generator expects this data structure:

```typescript
interface BRDContent {
  projectName: string;
  sections: BRDSection[];
}

interface BRDSection {
  id: string;
  title: string;
  sentences: Array<{
    id: string;
    text: string;
    hasConflict?: boolean;
  }>;
}
```

## Usage Flow

1. User clicks "Export to PDF" button in BRD view
2. System extracts BRD content from Firestore or component state
3. `exportBRDToPDF()` generates PDF from structured data:
   - Queries for next version number
   - Builds PDF document with proper formatting
   - Handles multi-page layout automatically
4. Uploads PDF to Firebase Storage `brd-exports` bucket
5. Saves export metadata to Firestore
6. Returns download URL to user

## Example Usage

```typescript
import { exportBRDToPDF } from '../services/pdfExportService';

// Prepare BRD content
const brdContent = {
  projectName: 'Customer Portal Redesign',
  sections: [
    {
      id: 'exec-summary',
      title: 'Executive Summary',
      sentences: [
        {
          id: 's1',
          text: 'The Customer Portal Redesign initiative aims to...',
        }
      ]
    },
    // ... more sections
  ]
};

// Export to PDF
try {
  const exportResult = await exportBRDToPDF(projectId, brdContent);
  console.log('PDF exported:', exportResult.downloadURL);
  console.log('Version:', exportResult.version);
} catch (error) {
  console.error('Export failed:', error);
}
```

## PDF Output Features

### Title Page
- Project name (large, bold, centered)
- Document type: "Business Requirements Document"
- Version badge (e.g., "v3.0")
- Export date (formatted)

### Content Pages
- Section headers with underlines
- Hierarchical typography
- Proper line spacing and margins
- Conflict warnings with ⚠ indicator
- Page numbers and version footer

### Special Sections
- **Stakeholders**: Bold names with role, indented descriptions
- **Traceability Matrix**: Monospace font for technical mapping
- **Requirements**: Numbered with proper formatting

## Firestore Schema

### Collection: `brdExports`

```typescript
{
  projectId: string;
  version: string;           // "v1.0", "v2.0", etc.
  versionNumber: number;     // 1.0, 2.0, etc.
  fileName: string;          // "BRD_v1.0_ProjectName.pdf"
  storagePath: string;       // "brd-exports/{projectId}/{fileName}"
  downloadURL: string;       // Firebase Storage public URL
  createdBy: string;         // User UID
  createdAt: Timestamp;
  fileSize: number;          // Bytes
}
```

## Storage Structure

```
brd-exports/
  {projectId}/
    BRD_v1.0_Customer_Portal_Redesign.pdf
    BRD_v2.0_Customer_Portal_Redesign.pdf
    BRD_v3.0_Customer_Portal_Redesign.pdf
```

## Benefits Over Screenshot Approach

✅ **Clean, professional output** - No UI elements, buttons, or sidebars
✅ **Accessible** - Text-based PDF (searchable, screen-reader friendly)
✅ **Consistent formatting** - Controlled typography and layout
✅ **Smaller file size** - Text-based vs. image-based
✅ **Better pagination** - Smart page breaks at logical points
✅ **Scalable** - Works for any content length
✅ **Maintainable** - Easy to update formatting without UI changes

## Troubleshooting

### PDF Generation Fails
- Check that BRD content structure matches expected interface
- Verify all sections have valid `id`, `title`, and `sentences` arrays
- Check browser console for jsPDF errors

### Upload Fails
- Verify Firebase Storage rules allow authenticated writes to `brd-exports/`
- Check user authentication status
- Verify storage bucket is configured in Firebase config

### Version Numbering Issues
- Ensure Firestore has proper indexes for `projectId` and `versionNumber`
- Check that `brdExports` collection exists and is accessible
- Verify user has read permissions on `brdExports` collection

## Future Enhancements

- [ ] Table of contents with page numbers
- [ ] Custom branding/logo support
- [ ] Configurable color schemes
- [ ] Export to Word/DOCX format
- [ ] Batch export multiple versions
- [ ] PDF annotations and comments
