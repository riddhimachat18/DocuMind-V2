# PDF Export Integration Guide

This guide shows how to integrate the content-based PDF export feature into your BRD pages.

## Overview

The PDF export service generates clean, professional PDFs from structured BRD content data. It does NOT use screenshot capture - instead, it builds PDFs programmatically with proper typography, pagination, and formatting.

## Integration Steps

### 1. Import the Service

```typescript
import { exportBRDToPDF, type BRDContent } from '../services/pdfExportService';
```

### 2. Prepare BRD Content

Structure your BRD data according to the `BRDContent` interface:

```typescript
const brdContent: BRDContent = {
  projectName: project.name,
  sections: [
    {
      id: 'exec-summary',
      title: 'Executive Summary',
      sentences: [
        {
          id: 's1',
          text: 'The Customer Portal Redesign initiative aims to...',
          hasConflict: false
        }
      ]
    },
    {
      id: 'stakeholders',
      title: 'Stakeholder Register',
      sentences: [
        {
          id: 'sk1',
          text: 'Sarah Chen (Product Owner) — Accountable for product vision.',
        }
      ]
    },
    // ... more sections
  ]
};
```

### 3. Create Export Handler

```typescript
const [isExporting, setIsExporting] = useState(false);

const handleExportPDF = async () => {
  if (!project || !projectId) {
    toast.error("Unable to export BRD");
    return;
  }

  setIsExporting(true);
  
  try {
    // Structure BRD content for export
    const brdContent: BRDContent = {
      projectName: project.name,
      sections: sections // Your BRD sections from state or Firestore
    };

    // Export to PDF
    const brdExport = await exportBRDToPDF(projectId, brdContent);

    toast.success(`BRD ${brdExport.version} exported successfully!`);
    
    // Optionally trigger download
    const link = document.createElement('a');
    link.href = brdExport.downloadURL;
    link.download = brdExport.fileName;
    link.click();
    
  } catch (error: any) {
    console.error("Error exporting BRD:", error);
    toast.error(`Failed to export BRD: ${error.message}`);
  } finally {
    setIsExporting(false);
  }
};
```

### 4. Add Export Button

```tsx
<button
  onClick={handleExportPDF}
  disabled={isExporting}
  className="text-xs bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
>
  {isExporting ? 'Exporting...' : 'Export to PDF'}
</button>
```

## Complete Example: BRDView Integration

```typescript
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { exportBRDToPDF } from '../services/pdfExportService';
import { mockBRDSections } from '../data/brdData';
import { toast } from 'sonner';

const BRDView = () => {
  const { id } = useParams();
  const { projects } = useApp();
  const project = projects.find(p => p.id === id);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    if (!project || !id) {
      toast.error("Unable to export BRD");
      return;
    }

    setIsExporting(true);
    
    try {
      // Structure BRD content from your data source
      const brdContent = {
        projectName: project.name,
        sections: mockBRDSections // Replace with actual sections from Firestore
      };

      const brdExport = await exportBRDToPDF(id, brdContent);

      toast.success(`BRD ${brdExport.version} exported successfully!`);
      
      // Auto-download the PDF
      const link = document.createElement('a');
      link.href = brdExport.downloadURL;
      link.download = brdExport.fileName;
      link.click();
      
    } catch (error: any) {
      console.error("Error exporting BRD:", error);
      toast.error(`Failed to export BRD: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      {/* Header with export button */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Breadcrumbs */}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="text-xs bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export to PDF'}
          </button>
        </div>
      </header>

      {/* BRD Content */}
      <main className="flex-1 overflow-y-auto px-8 py-10 max-w-3xl">
        {/* Your BRD sections */}
      </main>
    </div>
  );
};
```

## Fetching BRD Data from Firestore

If your BRD content is stored in Firestore, fetch it before exporting:

```typescript
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const handleExportPDF = async () => {
  if (!projectId) return;

  setIsExporting(true);
  
  try {
    // Fetch BRD document from Firestore
    const brdDoc = await getDoc(doc(db, 'brds', projectId));
    
    if (!brdDoc.exists()) {
      toast.error("BRD not found");
      return;
    }

    const brdData = brdDoc.data();
    
    // Structure content for export
    const brdContent = {
      projectName: brdData.projectName,
      sections: brdData.sections
    };

    // Export to PDF
    const brdExport = await exportBRDToPDF(projectId, brdContent);
    
    toast.success(`BRD ${brdExport.version} exported successfully!`);
    
    // Download
    window.open(brdExport.downloadURL, '_blank');
    
  } catch (error: any) {
    console.error("Error exporting BRD:", error);
    toast.error(`Failed to export: ${error.message}`);
  } finally {
    setIsExporting(false);
  }
};
```

## Viewing Export History

Retrieve all exports for a project:

```typescript
import { getBRDExports } from '../services/pdfExportService';

const [exports, setExports] = useState([]);

useEffect(() => {
  const loadExports = async () => {
    if (!projectId) return;
    
    try {
      const projectExports = await getBRDExports(projectId);
      setExports(projectExports);
    } catch (error) {
      console.error("Error loading exports:", error);
    }
  };

  loadExports();
}, [projectId]);

// Display exports
{exports.map(exp => (
  <div key={exp.id}>
    <a href={exp.downloadURL} target="_blank" rel="noopener noreferrer">
      {exp.version} - {exp.fileName}
    </a>
    <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
  </div>
))}
```

## Content Structure Requirements

### Section IDs and Special Formatting

The PDF generator applies special formatting based on section IDs:

- `stakeholders`: Bold names with indented descriptions
- `traceability`: Monospace font for technical mapping
- All others: Standard paragraph formatting

### Sentence Format

Each sentence should follow this structure:

```typescript
{
  id: string;           // Unique identifier
  text: string;         // The actual content
  hasConflict?: boolean; // Optional: adds ⚠ indicator
}
```

### Stakeholder Format

For stakeholder sections, use this text format:

```
"Name (Role) — Description"
```

Example:
```
"Sarah Chen (Product Owner) — Accountable for product vision and acceptance criteria."
```

The PDF generator will automatically:
- Bold the name and role
- Indent and format the description
- Add proper spacing

## Error Handling

Common errors and solutions:

### "User not authenticated"
- Ensure user is logged in before exporting
- Check Firebase auth state

### "Failed to upload PDF"
- Verify Firebase Storage rules allow writes to `brd-exports/`
- Check storage bucket configuration

### "Invalid BRD content structure"
- Ensure `projectName` is a non-empty string
- Verify `sections` is an array with valid section objects
- Check that each section has `id`, `title`, and `sentences` array

### "Version number query failed"
- Ensure Firestore indexes exist for `brdExports` collection
- Verify user has read permissions on `brdExports`

## Best Practices

1. **Loading States**: Always show loading indicator during export
2. **Error Messages**: Provide clear, actionable error messages
3. **Success Feedback**: Confirm successful export with toast notification
4. **Auto-Download**: Trigger automatic download for better UX
5. **Version Tracking**: Display version number in success message
6. **Content Validation**: Validate BRD content structure before exporting
7. **Offline Handling**: Handle network errors gracefully

## Testing

Test the export feature with:

```typescript
// Test data
const testBRDContent = {
  projectName: 'Test Project',
  sections: [
    {
      id: 'exec-summary',
      title: 'Executive Summary',
      sentences: [
        { id: 's1', text: 'This is a test BRD export.' }
      ]
    }
  ]
};

// Test export
const result = await exportBRDToPDF('test-project-id', testBRDContent);
console.log('Export result:', result);
```

## Migration from Screenshot-Based Export

If you're migrating from html2canvas or screenshot-based export:

1. Remove html2canvas imports and usage
2. Remove any DOM capture logic
3. Replace with structured content extraction
4. Update button handlers to use new export function
5. Test with various content lengths and structures
6. Verify PDF output quality and formatting

The new approach provides:
- ✅ Better quality (text-based, not images)
- ✅ Smaller file sizes
- ✅ Searchable PDFs
- ✅ Accessible content
- ✅ Consistent formatting
- ✅ No UI elements in output
