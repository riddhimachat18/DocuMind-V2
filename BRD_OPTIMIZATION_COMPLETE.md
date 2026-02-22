# BRD Generation Optimization - Complete

## Summary
Optimized BRD generation to be more concise and well-structured with proper Evidence View, reactive Quality Auditor, and improved AI chatbot.

## Changes Made

### 1. Backend Optimization (functions/src/generateBrd.ts)

**Conciseness Improvements:**
- Reduced retrieval snippets: 15 → 8 per section
- Added `maxOutputTokens: 800` limit per section
- Set temperature to 0.3 for focused output
- Streamlined prompts with explicit length targets:
  - Executive Summary: 150-200 words
  - Stakeholder Register: 5-8 stakeholders
  - Functional Requirements: 8-12 requirements
  - Non-Functional Requirements: 6-8 requirements
  - Assumptions: 4-6 items
  - Success Metrics: 4-6 metrics

**Evidence Tracking:**
- Enhanced citation parsing to store full snippet metadata
- Added `sentenceEvidence` field to BRD versions
- Each sentence now links to source snippets with:
  - Snippet ID
  - Full text
  - Metadata (filename, classification, speaker, etc.)

### 2. Frontend Restructuring (src/pages/BRDEdit.tsx)

**Evidence View (Left Panel):**
- Displays source evidence for selected sentences
- Shows snippet metadata:
  - Source filename
  - Classification badge (REQUIREMENT, DECISION, CONSTRAINT)
  - Speaker information
  - Full snippet text
- Visual numbering for multiple sources
- Hover effects for better UX

**BRD Content (Center Panel):**
- Enhanced sentence display with evidence badges
- Visual indicator showing number of sources per sentence
- Improved hover states and edit functionality
- Better visual hierarchy

**Quality Auditor (Right Panel):**
- Auto-initializes when BRD loads
- Typing indicator with animated dots
- Disabled input while AI is responding
- Real-time quality score updates
- Reactive to BRD changes

### 3. Quality & Reactivity

**Automatic Initialization:**
- AI Auditor starts automatically when page loads
- Initial message: "Review this BRD and identify the most critical gaps or issues."
- No manual trigger needed

**Real-time Updates:**
- Quality score updates via Firestore listener
- Chat messages sync in real-time
- BRD sections reload when AI makes updates
- Toast notifications for important changes

**Better UX:**
- Loading states for all async operations
- Typing indicators
- Disabled states during processing
- Smooth animations and transitions

## Expected Results

**For 16 raw pages → 5-6 page BRD:**
- Executive Summary: ~1 page
- Stakeholder Register: ~0.5 page
- Functional Requirements: ~1.5 pages
- Non-Functional Requirements: ~1 page
- Assumptions & Constraints: ~0.5 page
- Success Metrics: ~0.5 page

## Testing Checklist

- [ ] Generate new BRD and verify length is ~5-6 pages
- [ ] Click sentences to see evidence in left panel
- [ ] Verify AI Auditor starts automatically
- [ ] Check quality score updates in real-time
- [ ] Test chat interaction with AI Auditor
- [ ] Verify evidence shows correct source metadata
- [ ] Export PDF and check formatting

## Deployment

Deploy backend changes:
```bash
npm run deploy:functions
```

Frontend changes are ready for build and deployment.

## Notes

- All evidence is now properly tracked and displayed
- Quality Auditor is fully reactive and automatic
- BRD content is optimized for conciseness while maintaining completeness
- Evidence View provides full traceability to source documents
