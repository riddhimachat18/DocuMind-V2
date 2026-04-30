# Feature: Reactive Transcript/PDF Upload with Live BRD Synthesis

**Feature Name**: reactive-transcript-upload  
**Status**: Draft  
**Created**: 2026-02-21  
**Priority**: High

## Overview

DocuMind needs a fully reactive file upload system that extracts text from PDFs/transcripts, classifies content using AI, and automatically updates the BRD with new requirements in real-time. The system must provide live feedback at every step and visually highlight changes.

## Problem Statement

Currently, the Meeting Transcripts section shows "Not Connected" and uploading files doesn't update the BRD. Users need immediate feedback and automatic BRD synthesis when they upload project documents.

## User Stories

### US-1: File Upload and Text Extraction
**As a** product manager  
**I want to** upload PDF/DOCX/TXT files and see text extracted immediately  
**So that** I can quickly add document content to my BRD without manual copying

**Acceptance Criteria:**
- AC-1.1: File picker accepts .pdf, .txt, .docx, .mp3, .mp4 formats
- AC-1.2: Selected file appears in "Uploaded Files" list with loading spinner
- AC-1.3: PDF text extraction happens client-side using pdf.js
- AC-1.4: TXT files read directly using FileReader API
- AC-1.5: DOCX files extracted using mammoth.js
- AC-1.6: Extracted text chunked into ~300 word segments
- AC-1.7: Snippet count badge shows "X snippets extracted"
- AC-1.8: File status changes from spinner to green checkmark on success
- AC-1.9: Meeting Transcripts status changes from "Not Connected" to "Connected" with snippet count

### US-2: AI-Powered Snippet Classification
**As a** business analyst  
**I want** uploaded content automatically classified into requirement types  
**So that** I don't have to manually categorize each piece of information

**Acceptance Criteria:**
- AC-2.1: Each text chunk sent to Anthropic Claude API for classification
- AC-2.2: Chunks classified into: functional_requirement, non_functional_requirement, stakeholder, assumption, constraint, success_metric, or noise
- AC-2.3: "Analyzing X snippets..." progress indicator shown in sidebar
- AC-2.4: Classified snippets stored with metadata: source, fileName, chunkIndex, rawText, timestamp, category, insight, confidence
- AC-2.5: Noise-classified chunks discarded automatically
- AC-2.6: Classification uses structured JSON response format

### US-3: Automatic BRD Regeneration
**As a** project stakeholder  
**I want** the BRD to automatically update with new requirements from uploaded files  
**So that** the document stays current without manual editing

**Acceptance Criteria:**
- AC-3.1: After classification, BRD regeneration triggered automatically
- AC-3.2: Claude API receives existing BRD + new classified snippets as context
- AC-3.3: Updated BRD includes sections: Executive Summary, Stakeholder Register, Functional Requirements, Non-Functional Requirements, Assumptions, Success Metrics
- AC-3.4: New items show "NEW" badge in accent color
- AC-3.5: Updated items show "UPDATED" badge
- AC-3.6: New/updated items have glowing highlight animation for 3 seconds
- AC-3.7: Version number auto-increments (v3.0 → v4.0)
- AC-3.8: Status changes from "Approved" to "Draft — Pending Review"
- AC-3.9: Each requirement has: id, title, description, source, isNew, isUpdated flags

### US-4: Conflict Detection
**As a** technical lead  
**I want** contradicting requirements automatically flagged  
**So that** I can resolve conflicts before implementation

**Acceptance Criteria:**
- AC-4.1: After BRD update, new requirements compared against existing ones
- AC-4.2: Contradictions automatically detected
- AC-4.3: Conflict count shown in sidebar warning icon badge
- AC-4.4: Each conflict shows: conflicting requirements, source documents, suggested resolution
- AC-4.5: Conflicts persist until manually resolved

### US-5: Real-Time UI Feedback
**As a** user  
**I want** clear visual feedback at every processing step  
**So that** I know the system is working and what's happening

**Acceptance Criteria:**
- AC-5.1: Idle state: "Click to upload transcripts" button visible
- AC-5.2: Uploading state: file in list with spinner, "Uploading..." status
- AC-5.3: Extracting state: spinner on file, "Extracting text..." status
- AC-5.4: Classifying state: "Classifying X snippets..." status
- AC-5.5: Generating state: BRD skeleton loader, "Updating BRD..." status
- AC-5.6: Complete state: green checkmark, snippet count, BRD updated with highlights
- AC-5.7: Error state: red X icon, inline error message
- AC-5.8: All state transitions animated (fade/slide)
- AC-5.9: BRD sections pulse with amber glow during updates
- AC-5.10: New requirements animate in from left
- AC-5.11: Version badge flips/animates on increment

## Technical Requirements

### TR-1: Client-Side Text Extraction
- Use pdf.js (v3.11.174) from CDN for PDF extraction
- Use mammoth.js for DOCX extraction
- Use FileReader API for TXT files
- All extraction must complete before API calls
- Chunk text into ~300 word segments

### TR-2: AI Integration
- Anthropic Claude API endpoint: /v1/messages
- Model: claude-sonnet-4-20250514
- Max tokens: 2000
- Structured JSON responses required
- Error handling for API failures

### TR-3: State Management
- React useState/useReducer for component state
- No localStorage persistence required
- In-memory snippet storage
- Real-time UI updates on state changes

### TR-4: Styling Requirements
- Match existing dark theme (#0e0e0e background)
- Accent color: #c8a84b
- Font: IBM Plex Mono for code, Sora for body
- Smooth animations for all state transitions
- Responsive design

## Data Models

### Snippet Model
```typescript
interface Snippet {
  id: string;
  source: 'meeting_transcript' | 'pdf' | 'docx' | 'txt';
  fileName: string;
  chunkIndex: number;
  rawText: string;
  timestamp: number;
  category: 'functional_requirement' | 'non_functional_requirement' | 
            'stakeholder' | 'assumption' | 'constraint' | 
            'success_metric' | 'noise';
  insight: string;
  confidence: number;
}
```

### BRD Requirement Model
```typescript
interface Requirement {
  id: string;
  title: string;
  description: string;
  source: string;
  isNew: boolean;
  isUpdated: boolean;
  category: string;
}
```

### Conflict Model
```typescript
interface Conflict {
  id: string;
  requirement1: Requirement;
  requirement2: Requirement;
  description: string;
  suggestedResolution: string;
  status: 'open' | 'resolved';
}
```

## API Specifications

### Classification API Call
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 2000,
  "system": "You are a business analyst AI. Classify the following text chunk...",
  "messages": [
    {
      "role": "user",
      "content": "[chunk text]"
    }
  ]
}
```

**Expected Response:**
```json
{
  "category": "functional_requirement",
  "insight": "Users must be able to reset passwords via email",
  "confidence": 0.95
}
```

### BRD Regeneration API Call
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 2000,
  "system": "You are an expert business analyst. Update the BRD...",
  "messages": [
    {
      "role": "user",
      "content": "Existing BRD: [JSON] + New snippets: [JSON]"
    }
  ]
}
```

## UI States Flow

```
IDLE → UPLOADING → EXTRACTING → CLASSIFYING → GENERATING → COMPLETE
                                                          ↓
                                                       ERROR
```

## Success Metrics

- File upload to BRD update completes in < 30 seconds for typical PDF
- 95%+ accuracy in requirement classification
- Zero page reloads required
- All UI states provide clear feedback
- Conflicts detected with 90%+ accuracy

## Out of Scope

- Audio/video transcription (files accepted but not processed)
- Real-time collaborative editing
- Version history/rollback
- Export to other formats
- Integration with external project management tools

## Dependencies

- Anthropic Claude API access and API key
- pdf.js library (CDN)
- mammoth.js library (CDN)
- Existing BRD data structure
- Firebase Storage (already implemented)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large PDF files crash browser | High | Implement file size limit (10MB), show warning |
| Claude API rate limits | Medium | Implement retry logic, queue snippets |
| Incorrect classification | Medium | Show confidence scores, allow manual override |
| Network failures during upload | Medium | Implement retry mechanism, save progress |

## Definition of Done

- [ ] All acceptance criteria met for US-1 through US-5
- [ ] PDF/DOCX/TXT extraction working client-side
- [ ] Claude API integration complete with error handling
- [ ] BRD auto-updates with visual highlights
- [ ] Conflict detection functional
- [ ] All UI states implemented with animations
- [ ] No console errors
- [ ] Responsive on desktop and tablet
- [ ] Code reviewed and tested
- [ ] Documentation updated
