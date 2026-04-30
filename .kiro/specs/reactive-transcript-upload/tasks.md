# Implementation Tasks: Reactive Transcript Upload

**Feature**: reactive-transcript-upload  
**Status**: Ready for Implementation

## Task Breakdown

### 1. Create Single-File HTML Structure
- [ ] 1.1 Create base HTML file with CDN dependencies
- [ ] 1.2 Add Google Fonts (Sora, IBM Plex Mono)
- [ ] 1.3 Add pdf.js from CDN
- [ ] 1.4 Add mammoth.js from CDN
- [ ] 1.5 Set up viewport and meta tags

### 2. Implement CSS Styling
- [ ] 2.1 Define CSS variables for color palette
- [ ] 2.2 Create layout styles (sidebar + main content)
- [ ] 2.3 Style API key input component
- [ ] 2.4 Style sidebar data sources section
- [ ] 2.5 Style uploaded files list
- [ ] 2.6 Style BRD viewer sections
- [ ] 2.7 Create animation keyframes (slideInLeft, glow, pulse, flip)
- [ ] 2.8 Style badges (NEW, UPDATED, Connected, etc.)
- [ ] 2.9 Style status messages and error states
- [ ] 2.10 Add responsive design rules

### 3. Initialize Application State
- [ ] 3.1 Create initial state object with mock data
- [ ] 3.2 Set up state management functions (setState, getState)
- [ ] 3.3 Initialize BRD with Customer Portal Redesign data
- [ ] 3.4 Initialize data sources (Gmail: 47, Slack: 23, Meeting: 0)
- [ ] 3.5 Initialize uploaded files list with 3 mock files

### 4. Implement API Configuration Component
- [ ] 4.1 Create API key input field
- [ ] 4.2 Add validation for API key format
- [ ] 4.3 Store API key in state on change
- [ ] 4.4 Show error message for invalid format

### 5. Implement Sidebar Component
- [ ] 5.1 Render data sources with connection status
- [ ] 5.2 Create upload button with file input
- [ ] 5.3 Render uploaded files list
- [ ] 5.4 Show file status icons (spinner/checkmark/error)
- [ ] 5.5 Display snippet count badges
- [ ] 5.6 Show dynamic status message
- [ ] 5.7 Update Meeting Transcripts badge on upload

### 6. Implement BRD Viewer Component
- [ ] 6.1 Render BRD header (project name, version, status, date)
- [ ] 6.2 Render Executive Summary section
- [ ] 6.3 Render Stakeholder Register table
- [ ] 6.4 Render Functional Requirements list
- [ ] 6.5 Render Non-Functional Requirements section
- [ ] 6.6 Render Assumptions section
- [ ] 6.7 Render Success Metrics section
- [ ] 6.8 Add NEW and UPDATED badges to requirements
- [ ] 6.9 Implement skeleton loader for generating state
- [ ] 6.10 Add highlight animations for new/updated items

### 7. Implement Text Extraction Module
- [ ] 7.1 Create extractPdfText function using pdf.js
- [ ] 7.2 Create extractDocxText function using mammoth
- [ ] 7.3 Create extractTxtText function using FileReader
- [ ] 7.4 Create chunkText function (~300 words per chunk)
- [ ] 7.5 Add error handling for extraction failures
- [ ] 7.6 Update UI with extraction progress

### 8. Implement File Upload Handler
- [ ] 8.1 Handle file selection event
- [ ] 8.2 Validate file type and size (<10MB)
- [ ] 8.3 Add file to uploaded files list with spinner
- [ ] 8.4 Update status to "Uploading..."
- [ ] 8.5 Trigger text extraction based on file type
- [ ] 8.6 Update status to "Extracting text..."
- [ ] 8.7 Chunk extracted text
- [ ] 8.8 Update snippet count in UI
- [ ] 8.9 Update file status to checkmark on success
- [ ] 8.10 Handle errors and show error icon

### 9. Implement Snippet Classification Module
- [ ] 9.1 Create classifySnippet function with Claude API
- [ ] 9.2 Set up API request with correct headers
- [ ] 9.3 Use claude-sonnet-4-20250514 model
- [ ] 9.4 Set max_tokens to 2000
- [ ] 9.5 Parse JSON response
- [ ] 9.6 Handle API errors (missing key, rate limit, network)
- [ ] 9.7 Process all chunks in parallel with Promise.all()
- [ ] 9.8 Update status with "Classifying X snippets..."
- [ ] 9.9 Show progress indicator
- [ ] 9.10 Filter out "noise" classifications
- [ ] 9.11 Store classified snippets in state

### 10. Implement BRD Generation Module
- [ ] 10.1 Create regenerateBRD function with Claude API
- [ ] 10.2 Build prompt with existing BRD + new snippets
- [ ] 10.3 Use claude-sonnet-4-20250514 model
- [ ] 10.4 Set max_tokens to 2000
- [ ] 10.5 Parse JSON response
- [ ] 10.6 Handle API errors
- [ ] 10.7 Update status to "Updating BRD..."
- [ ] 10.8 Show skeleton loader on BRD sections
- [ ] 10.9 Merge new BRD data with existing
- [ ] 10.10 Increment version number
- [ ] 10.11 Change status to "Draft — Pending Review"
- [ ] 10.12 Trigger version badge flip animation
- [ ] 10.13 Apply highlight animations to new/updated items

### 11. Implement Conflict Detection Module
- [ ] 11.1 Create detectConflicts function
- [ ] 11.2 Compare requirements for contradictions
- [ ] 11.3 Identify conflicting keywords
- [ ] 11.4 Generate conflict objects
- [ ] 11.5 Update conflict count in sidebar
- [ ] 11.6 Store conflicts in state

### 12. Implement UI State Transitions
- [ ] 12.1 Create state transition logic (idle → uploading → extracting → classifying → generating → complete)
- [ ] 12.2 Update UI based on current state
- [ ] 12.3 Show appropriate status messages
- [ ] 12.4 Handle error state transitions
- [ ] 12.5 Add fade/slide animations between states

### 13. Implement Visual Feedback
- [ ] 13.1 Add spinner animation for loading states
- [ ] 13.2 Add checkmark icon for success
- [ ] 13.3 Add error icon for failures
- [ ] 13.4 Implement 3-second glow animation for new items
- [ ] 13.5 Implement slide-in animation for new requirements
- [ ] 13.6 Implement version badge flip animation
- [ ] 13.7 Implement skeleton loader pulse animation
- [ ] 13.8 Update Meeting Transcripts badge color on connect

### 14. Error Handling and Validation
- [ ] 14.1 Validate API key format
- [ ] 14.2 Validate file size (<10MB)
- [ ] 14.3 Validate file type
- [ ] 14.4 Handle extraction errors
- [ ] 14.5 Handle API authentication errors
- [ ] 14.6 Handle API rate limit errors
- [ ] 14.7 Handle network errors
- [ ] 14.8 Handle invalid JSON responses
- [ ] 14.9 Show user-friendly error messages
- [ ] 14.10 Provide retry options

### 15. Testing and Polish
- [ ] 15.1 Test PDF upload and extraction
- [ ] 15.2 Test DOCX upload and extraction
- [ ] 15.3 Test TXT upload and extraction
- [ ] 15.4 Test snippet classification
- [ ] 15.5 Test BRD regeneration
- [ ] 15.6 Test conflict detection
- [ ] 15.7 Test all animations
- [ ] 15.8 Test error scenarios
- [ ] 15.9 Test with invalid API key
- [ ] 15.10 Verify all UI states work correctly
- [ ] 15.11 Check responsive design
- [ ] 15.12 Verify no console errors
- [ ] 15.13 Test version increment
- [ ] 15.14 Test status changes
- [ ] 15.15 Final visual polish

## Implementation Order

Execute tasks in this sequence:
1. Tasks 1-2: Structure and styling foundation
2. Task 3: State initialization
3. Tasks 4-6: UI components
4. Tasks 7-8: File upload and extraction
5. Tasks 9-10: AI classification and BRD generation
6. Task 11: Conflict detection
7. Tasks 12-13: State management and visual feedback
8. Task 14: Error handling
9. Task 15: Testing and polish

## Deliverable

Single HTML file named `reactive-transcript-upload.html` containing:
- Complete HTML structure
- Embedded CSS styles
- Embedded JavaScript logic
- CDN links for external dependencies
- Ready to open in browser
- No build process required
