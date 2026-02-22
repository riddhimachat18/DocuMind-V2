# BRD Edit Page - New Structure

## Layout Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: DocuMind → Project → Draft Edit — v1.0    [Export] [History]│
├──────────────┬──────────────────────────────┬─────────────────────────┤
│              │                              │                         │
│  EVIDENCE    │      BRD CONTENT             │   QUALITY AUDITOR       │
│  VIEW        │      (Editable)              │   (AI Chatbot)          │
│  (Left)      │      (Center)                │   (Right)               │
│              │                              │                         │
│ ┌──────────┐ │ ┌──────────────────────────┐ │ ┌─────────────────────┐ │
│ │Selected: │ │ │ EXECUTIVE SUMMARY        │ │ │ Quality Score: 85   │ │
│ │"System   │ │ │                          │ │ │ ┌─────────────────┐ │ │
│ │shall..." │ │ │ This document outlines...│ │ │ │ Completeness: 40│ │ │
│ └──────────┘ │ │                          │ │ │ │ Clarity: 20     │ │ │
│              │ │ Objectives:              │ │ │ │ Consistency: 25 │ │ │
│ ┌──────────┐ │ │ 1. Improve safety...     │ │ │ └─────────────────┘ │ │
│ │ [1]      │ │ │ 2. Reduce incidents...   │ │ │                     │ │
│ │ File:    │ │ │                          │ │ │ ┌─────────────────┐ │ │
│ │ meeting  │ │ │ FUNCTIONAL REQUIREMENTS  │ │ │ │ AI: I've        │ │ │
│ │ .txt     │ │ │                          │ │ │ │ reviewed the    │ │ │
│ │          │ │ │ FR-01: System shall      │ │ │ │ BRD. The most   │ │ │
│ │ REQUIRE  │ │ │ authenticate users [3]   │ │ │ │ critical gap... │ │ │
│ │ MENT     │ │ │ ← Click to see evidence  │ │ │ └─────────────────┘ │ │
│ │          │ │ │                          │ │ │                     │ │
│ │ "Users   │ │ │ FR-02: System shall      │ │ │ ┌─────────────────┐ │ │
│ │ must be  │ │ │ encrypt data [2]         │ │ │ │ You: Can you    │ │ │
│ │ authenti │ │ │                          │ │ │ │ elaborate?      │ │ │
│ │ cated"   │ │ │ Double-click to edit →   │ │ │ └─────────────────┘ │ │
│ └──────────┘ │ │                          │ │ │                     │ │
│              │ │ NON-FUNCTIONAL REQS      │ │ │ [Reply to AI...]    │ │
│ ┌──────────┐ │ │                          │ │ │ [→]                 │ │
│ │ [2]      │ │ │ NFR-01: Performance...   │ │ └─────────────────────┘ │
│ │ File:    │ │ │                          │ │                         │
│ │ email    │ │ │ ...                      │ │                         │
│ │ .txt     │ │ │                          │ │                         │
│ └──────────┘ │ └──────────────────────────┘ │                         │
│              │                              │                         │
└──────────────┴──────────────────────────────┴─────────────────────────┘
```

## Key Features

### Evidence View (Left - 288px)
- Shows source snippets for selected sentence
- Displays:
  - Snippet number badge
  - Source filename
  - Classification badge (REQUIREMENT/DECISION/CONSTRAINT)
  - Speaker name (if available)
  - Full snippet text with border highlight
- Empty state: "Click any sentence in the BRD to see its source evidence here."

### BRD Content (Center - Flexible)
- Editable sections with inline editing
- Each sentence shows:
  - Evidence badge with count (e.g., "[3]" sources)
  - Hover state with edit icon
  - Double-click to edit
  - Click to view evidence
- Sections:
  - Executive Summary
  - Stakeholder Register
  - Functional Requirements
  - Non-Functional Requirements
  - Assumptions & Constraints
  - Success Metrics

### Quality Auditor (Right - 320px)
- Quality score ring with breakdown
- AI chat interface
- Auto-starts on page load
- Features:
  - Typing indicator (animated dots)
  - Message history
  - Real-time updates
  - Disabled input while AI responds

## Interaction Flow

1. **Page Load:**
   - BRD content loads from Firestore
   - Quality score displays
   - AI Auditor auto-initializes with review

2. **Click Sentence:**
   - Evidence View updates with sources
   - Sentence highlights in blue
   - Source count badge visible

3. **Double-Click Sentence:**
   - Inline editor appears
   - Save/Cancel buttons
   - Updates BRD on save

4. **Chat with AI:**
   - Type message
   - AI responds with suggestions
   - Can update BRD automatically
   - Quality score recalculates

## Color Coding

- **Primary (Blue):** Selected items, evidence badges, links
- **Secondary (Gray):** Hover states, backgrounds
- **Green:** Quality score (high), success states
- **Yellow:** Quality score (medium), warnings
- **Red:** Quality score (low), conflicts
- **Muted:** Helper text, timestamps

## Responsive Behavior

- Evidence View: Fixed 288px width
- Quality Auditor: Fixed 320px width
- BRD Content: Flexible, takes remaining space
- All panels have independent scroll
