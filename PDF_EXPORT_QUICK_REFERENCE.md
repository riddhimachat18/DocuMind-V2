# PDF Export - Quick Reference

## What Changed?

✅ **Removed**: html2canvas (screenshot-based export)  
✅ **Updated**: jsPDF v4.2.0 → v2.5.2  
✅ **Implemented**: Content-based PDF generation with professional formatting

## Installation

```bash
npm install
```

This will install the updated jsPDF package and remove html2canvas.

## How It Works

### 1. Content Structure

```typescript
const brdContent = {
  projectName: 'Your Project Name',
  sections: [
    {
      id: 'section-id',
      title: 'Section Title',
      sentences: [
        { id: 's1', text: 'Content here...', hasConflict: false }
      ]
    }
  ]
};
```

### 2. Export Function

```typescript
import { exportBRDToPDF } from '../services/pdfExportService';

const result = await exportBRDToPDF(projectId, brdContent);
// Returns: { id, version, downloadURL, fileName, ... }
```

### 3. Complete Handler Example

```typescript
const [isExporting, setIsExporting] = useState(false);

const handleExportPDF = async () => {
  if (!project || !projectId) {
    toast.error("Unable to export BRD");
    return;
  }

  setIsExporting(true);
  
  try {
    const brdContent = {
      projectName: project.name,
      sections: sections // Your BRD sections
    };

    const brdExport = await exportBRDToPDF(projectId, brdContent);
    toast.success(`BRD ${brdExport.version} exported successfully!`);
    
    // Auto-download
    const link = document.createElement('a');
    link.href = brdExport.downloadURL;
    link.download = brdExport.fileName;
    link.click();
    
  } catch (error: any) {
    toast.error(`Failed to export: ${error.message}`);
  } finally {
    setIsExporting(false);
  }
};
```

## PDF Output Features

### Title Page
- Project name (large, centered)
- "Business Requirements Document"
- Version badge (e.g., "v3.0")
- Export date

### Content Pages
- Section headers with underlines
- Professional typography
- Smart page breaks
- Conflict indicators (⚠)
- Page numbers and version footer

### Special Formatting
- **Stakeholders**: Bold names, indented descriptions
- **Traceability**: Monospace font
- **Requirements**: Numbered with proper spacing

## Button Integration

```tsx
<button
  onClick={handleExportPDF}
  disabled={isExporting}
  className="text-xs bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
>
  {isExporting ? 'Exporting...' : 'Export to PDF'}
</button>
```

## Where It's Implemented

✅ **BRDEdit.tsx** - Export button in header  
✅ **BRDView.tsx** - Export button in header  
✅ **pdfExportService.ts** - Core PDF generation logic

## Storage

PDFs are saved to:
- **Firebase Storage**: `brd-exports/{projectId}/{fileName}`
- **Firestore**: `brdExports` collection with metadata

## Version Management

Versions are auto-incremented:
- First export: v1.0
- Second export: v2.0
- Third export: v3.0
- etc.

## Testing

1. Run app: `npm run dev`
2. Navigate to BRD page
3. Click "Export to PDF"
4. Check downloaded PDF for:
   - Title page formatting
   - Section headers
   - Content layout
   - Page breaks
   - Footer with version

## Benefits

| Feature | Old (Screenshot) | New (Content-Based) |
|---------|-----------------|---------------------|
| Quality | Low | High |
| File Size | Large | Small |
| Searchable | ❌ | ✅ |
| Accessible | ❌ | ✅ |
| UI Elements | Included | Excluded |
| Formatting | Inconsistent | Professional |

## Troubleshooting

### "User not authenticated"
→ Ensure user is logged in

### "Failed to upload PDF"
→ Check Firebase Storage rules for `brd-exports/`

### "Invalid content structure"
→ Verify `projectName` and `sections` array format

## Documentation

- **INSTALL_PDF_PACKAGES.md** - Complete architecture guide
- **PDF_EXPORT_INTEGRATION.md** - Integration examples
- **PDF_EXPORT_CHANGES.md** - Detailed change log
- **PDF_EXPORT_QUICK_REFERENCE.md** - This file

## Key Files

```
src/
  services/
    pdfExportService.ts    ← Core PDF generation
  pages/
    BRDEdit.tsx           ← Export in edit mode
    BRDView.tsx           ← Export in view mode
package.json              ← Updated dependencies
```

## Next Steps

1. Test export functionality
2. Verify PDF output quality
3. Check Firebase Storage uploads
4. Review version numbering
5. Customize formatting if needed

---

**No screenshot capture. No html2canvas. Just clean, professional PDFs from structured content.**
