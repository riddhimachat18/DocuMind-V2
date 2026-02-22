# Design Document: Reactive Transcript Upload with Live BRD Synthesis

**Feature**: reactive-transcript-upload  
**Status**: Draft  
**Created**: 2026-02-21

## Architecture Overview

This feature implements a client-side document processing pipeline with AI-powered classification and BRD synthesis. All components exist in a single HTML file with embedded JavaScript and CSS.

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Application                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Sidebar    │  │  BRD Viewer  │  │  API Config  │      │
│  │              │  │              │  │              │      │
│  │ - Data       │  │ - Executive  │  │ - API Key    │      │
│  │   Sources    │  │   Summary    │  │   Input      │      │
│  │ - Upload     │  │ - Stakeholder│  │              │      │
│  │   Status     │  │ - Functional │  │              │      │
│  │ - Files List │  │   Reqs       │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘      │
│         │                 │                                  │
│         └────────┬────────┘                                  │
│                  │                                           │
│         ┌────────▼────────┐                                 │
│         │  State Manager  │                                 │
│         │                 │                                 │
│         │ - Upload State  │                                 │
│         │ - Snippets      │                                 │
│         │ - BRD Data      │                                 │
│         │ - Conflicts     │                                 │
│         └────────┬────────┘                                 │
│                  │                                           │
│    ┌─────────────┼─────────────┐                           │
│    │             │             │                           │
│    ▼             ▼             ▼                           │
│ ┌──────┐   ┌──────────┐   ┌──────────┐                   │
│ │ Text │   │ Snippet  │   │   BRD    │                   │
│ │Extract│   │Classifier│   │Generator │                   │
│ └──────┘   └──────────┘   └──────────┘                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Upload Pipeline

```
User Selects File
    ↓
File Added to UI (spinner)
    ↓
Text Extraction (pdf.js/mammoth/FileReader)
    ↓
Text Chunking (~300 words)
    ↓
Snippet Classification (Claude API - parallel)
    ↓
BRD Regeneration (Claude API)
    ↓
Conflict Detection
    ↓
UI Update (highlights, badges, version bump)
```

## State Management

### Application State Structure

```javascript
const initialState = {
  apiKey: '',
  uploadStatus: 'idle', // idle | uploading | extracting | classifying | generating | complete | error
  currentFile: null,
  
  dataSources: {
    gmail: { connected: true, snippetCount: 47 },
    slack: { connected: true, snippetCount: 23 },
    meetingTranscripts: { connected: false, snippetCount: 0 }
  },
  
  uploadedFiles: [
    { 
      id: 'file-1', 
      name: 'requirements_draft.pdf', 
      status: 'complete', 
      snippetCount: 12,
      timestamp: 1708531200000
    },
    { 
      id: 'file-2', 
      name: 'stakeholder_notes.docx', 
      status: 'complete', 
      snippetCount: 8,
      timestamp: 1708531200000
    },
    { 
      id: 'file-3', 
      name: 'meeting_recording.mp3', 
      status: 'processing', 
      snippetCount: 0,
      timestamp: 1708531200000
    }
  ],
  
  snippets: [],
  
  brd: {
    projectName: 'Customer Portal Redesign',
    version: '3.0',
    status: 'Approved',
    lastUpdated: '2026-02-18',
    
    executiveSummary: 'The Customer Portal Redesign initiative aims to deliver a unified self-service platform...',
    
    stakeholders: [
      { id: 'sh-1', name: 'Sarah Chen', role: 'Product Owner', email: 'sarah@acme.com' }
    ],
    
    functionalRequirements: [
      {
        id: 'FR-01',
        title: 'Users shall be able to manage subscription plans',
        description: 'Including upgrade, downgrade, and cancellation without requiring assistance...',
        source: 'gmail',
        isNew: false,
        isUpdated: false
      }
    ],
    
    nonFunctionalRequirements: [],
    assumptions: [],
    successMetrics: [],
    conflicts: []
  },
  
  statusMessage: '',
  errorMessage: ''
};
```

## Component Specifications

### 1. API Configuration Component

**Purpose**: Allow user to input Anthropic API key

**UI Elements**:
- Text input field (password type)
- Label: "Anthropic API Key"
- Placeholder: "sk-ant-..."
- Positioned at top of interface

**Behavior**:
- Store key in state on change
- Validate format (starts with "sk-ant-")
- Show error if invalid format

### 2. Sidebar Component

**Purpose**: Display data sources, upload status, and file list

**Sections**:

#### Data Sources
- Gmail: Green badge "Connected • 47 snippets"
- Slack: Green badge "Connected • 23 snippets"  
- Meeting Transcripts: Gray badge "Not Connected" (changes to green after upload)

#### Upload Button
- Text: "Click to upload transcripts"
- File input accepts: .pdf, .txt, .docx, .mp3, .mp4
- Hidden file input triggered by button click

#### Uploaded Files List
- Each file shows:
  - File name
  - Status icon (spinner/checkmark/error)
  - Snippet count badge
  - Timestamp

#### Status Message
- Dynamic text showing current operation
- Examples: "Uploading...", "Extracting text...", "Classifying 12 snippets...", "Updating BRD..."

### 3. BRD Viewer Component

**Purpose**: Display and update BRD sections with visual feedback

**Header**:
- Project name
- Version badge (animated on change)
- Status badge (Approved/Draft)
- Last updated date

**Sections**:
- Executive Summary
- Stakeholder Register (table format)
- Functional Requirements (numbered list)
- Non-Functional Requirements
- Assumptions
- Success Metrics

**Visual Feedback**:
- New items: "NEW" badge, slide-in animation from left
- Updated items: "UPDATED" badge, amber glow for 3s
- Generating: Skeleton loader with pulse animation

### 4. Text Extraction Module

**Purpose**: Extract text from uploaded files client-side

**PDF Extraction** (pdf.js):
```javascript
async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
}
```

**DOCX Extraction** (mammoth):
```javascript
async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
```

**TXT Extraction** (FileReader):
```javascript
async function extractTxtText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
```

**Text Chunking**:
```javascript
function chunkText(text, wordsPerChunk = 300) {
  const words = text.split(/\s+/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    chunks.push(chunk);
  }
  
  return chunks;
}
```

### 5. Snippet Classification Module

**Purpose**: Classify text chunks using Claude API

**API Call**:
```javascript
async function classifySnippet(text, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'You are a business analyst AI. Classify the following text chunk from a document into exactly one category: functional_requirement, non_functional_requirement, stakeholder, assumption, constraint, success_metric, or noise. Also extract the key insight in one sentence. Respond only in JSON: { "category": "...", "insight": "...", "confidence": 0.0-1.0 }',
      messages: [
        {
          role: 'user',
          content: text
        }
      ]
    })
  });
  
  const data = await response.json();
  const content = data.content[0].text;
  return JSON.parse(content);
}
```

**Parallel Processing**:
- Process all chunks concurrently with Promise.all()
- Update progress indicator as each completes
- Filter out "noise" classifications

### 6. BRD Generation Module

**Purpose**: Regenerate BRD with new snippets

**API Call**:
```javascript
async function regenerateBRD(existingBRD, newSnippets, apiKey) {
  const prompt = `Existing BRD: ${JSON.stringify(existingBRD)}

New evidence snippets: ${JSON.stringify(newSnippets)}

Update the BRD to incorporate these new requirements. Return a complete JSON object with the same structure, marking new items with isNew: true and updated items with isUpdated: true.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'You are an expert business analyst. You have an existing BRD and new evidence snippets from uploaded documents. Update the BRD to incorporate the new requirements, fix any gaps, and add missing sections. Be precise and structured. Return a complete JSON BRD object with sections: executiveSummary, stakeholders, functionalRequirements, nonFunctionalRequirements, assumptions, successMetrics. Each requirement must have: id, title, description, source, isNew (boolean), isUpdated (boolean).',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });
  
  const data = await response.json();
  const content = data.content[0].text;
  return JSON.parse(content);
}
```

**Version Increment Logic**:
```javascript
function incrementVersion(version) {
  const [major, minor] = version.split('.').map(Number);
  return `${major + 1}.0`;
}
```

### 7. Conflict Detection Module

**Purpose**: Identify contradicting requirements

**Detection Logic**:
```javascript
function detectConflicts(requirements) {
  const conflicts = [];
  
  for (let i = 0; i < requirements.length; i++) {
    for (let j = i + 1; j < requirements.length; j++) {
      const req1 = requirements[i];
      const req2 = requirements[j];
      
      // Simple keyword-based conflict detection
      const contradictions = [
        ['required', 'optional'],
        ['must', 'should not'],
        ['always', 'never'],
        ['all', 'none']
      ];
      
      for (const [word1, word2] of contradictions) {
        if (req1.description.toLowerCase().includes(word1) && 
            req2.description.toLowerCase().includes(word2)) {
          conflicts.push({
            id: `conflict-${conflicts.length + 1}`,
            requirement1: req1,
            requirement2: req2,
            description: `Potential conflict between ${req1.id} and ${req2.id}`,
            suggestedResolution: 'Review both requirements and clarify intent',
            status: 'open'
          });
        }
      }
    }
  }
  
  return conflicts;
}
```

## Styling Specifications

### Color Palette
```css
:root {
  --bg-primary: #0e0e0e;
  --bg-secondary: #161616;
  --bg-tertiary: #1e1e1e;
  --accent: #c8a84b;
  --accent-dim: rgba(200, 168, 75, 0.2);
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --text-tertiary: #707070;
  --success: #4ade80;
  --error: #ef4444;
  --border: #2a2a2a;
}
```

### Typography
```css
body {
  font-family: 'Sora', sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

.mono {
  font-family: 'IBM Plex Mono', monospace;
}
```

### Animations
```css
@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes glow {
  0%, 100% {
    box-shadow: 0 0 0 rgba(200, 168, 75, 0);
  }
  50% {
    box-shadow: 0 0 20px rgba(200, 168, 75, 0.5);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes flip {
  0% {
    transform: rotateY(0deg);
  }
  50% {
    transform: rotateY(90deg);
  }
  100% {
    transform: rotateY(0deg);
  }
}

.highlight-new {
  animation: slideInLeft 0.5s ease-out, glow 3s ease-in-out;
}

.highlight-updated {
  animation: glow 3s ease-in-out;
}

.skeleton {
  animation: pulse 1.5s ease-in-out infinite;
}

.version-flip {
  animation: flip 0.6s ease-in-out;
}
```

## Error Handling

### File Upload Errors
- File too large (>10MB): Show error, prevent upload
- Unsupported format: Show error message
- Extraction failure: Show error, allow retry

### API Errors
- Missing API key: Show inline error
- Invalid API key: Show authentication error
- Rate limit: Show retry message with countdown
- Network error: Show connection error, allow retry

### Classification Errors
- Invalid JSON response: Skip snippet, log error
- Low confidence (<0.5): Flag for manual review

## Performance Considerations

### Optimization Strategies
1. **Parallel Processing**: Classify all snippets concurrently
2. **Debouncing**: Debounce UI updates during rapid state changes
3. **Lazy Loading**: Only render visible BRD sections
4. **Memoization**: Cache classification results
5. **File Size Limits**: Enforce 10MB max file size

### Expected Performance
- PDF extraction: ~2-5 seconds for 10-page document
- Classification: ~1-2 seconds per snippet (parallel)
- BRD generation: ~3-5 seconds
- Total pipeline: ~15-30 seconds for typical document

## Testing Strategy

### Manual Testing Checklist
- [ ] Upload PDF, verify text extraction
- [ ] Upload DOCX, verify text extraction
- [ ] Upload TXT, verify text extraction
- [ ] Verify snippet count updates
- [ ] Verify classification progress indicator
- [ ] Verify BRD updates with new content
- [ ] Verify NEW badges appear
- [ ] Verify UPDATED badges appear
- [ ] Verify highlight animations
- [ ] Verify version increment
- [ ] Verify status change to Draft
- [ ] Verify Meeting Transcripts badge changes
- [ ] Verify conflict detection
- [ ] Test with invalid API key
- [ ] Test with network error
- [ ] Test with large file (>10MB)

## Security Considerations

1. **API Key Storage**: Never persist API key, only in memory
2. **Client-Side Processing**: All file processing happens in browser
3. **No Server Storage**: Files not uploaded to any server
4. **HTTPS Only**: All API calls over HTTPS
5. **Input Validation**: Validate file types and sizes

## Deployment

### Single File Artifact
- All HTML, CSS, and JavaScript in one file
- External dependencies loaded from CDN
- No build process required
- Can be opened directly in browser

### CDN Dependencies
```html
<!-- PDF.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>

<!-- Mammoth.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>

<!-- Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## Future Enhancements

1. Audio/video transcription support
2. Real-time collaborative editing
3. Version history and rollback
4. Export to PDF/Word
5. Integration with project management tools
6. Advanced conflict resolution suggestions
7. Requirement dependency mapping
8. Automated testing of requirements
