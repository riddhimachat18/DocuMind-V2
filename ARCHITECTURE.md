# DocuMind Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Data Flow](#data-flow)
3. [Core Components](#core-components)
4. [AI & Machine Learning](#ai--machine-learning)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [Algorithms](#algorithms)

---

## System Overview

DocuMind is a three-tier architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  - Authentication UI                                         │
│  - Project Dashboard                                         │
│  - BRD Editor/Viewer                                        │
│  - Real-time Updates                                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ HTTPS/WebSocket
┌─────────────────────────────────────────────────────────────┐
│              Firebase Backend Services                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Auth       │  │  Firestore   │  │   Storage    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────────────────────────────────────────┐     │
│  │         Cloud Functions (Node.js)                 │     │
│  │  - generateBrd                                    │     │
│  │  - onFileUploaded                                │     │
│  │  - detectConflicts                               │     │
│  │  - onChatMessage                                 │     │
│  │  - classifySnippet                               │     │
│  │  - ingestGmail (NEW)                             │     │
│  │  - ingestSlack (NEW)                             │     │
│  └──────────────────────────────────────────────────┘     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓ HTTP API
┌─────────────────────────────────────────────────────────────┐
│                  External Services                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Google       │  │  ChromaDB    │  │  Gmail/Slack │     │
│  │ Gemini AI    │  │  Vector DB   │  │  APIs        │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Document Upload & Processing

```
User uploads file
    ↓
Frontend → Cloud Storage
    ↓
onFileUploaded trigger
    ↓
Text extraction (PDF/DOCX)
    ↓
Chunking (600 chars, max 120 chunks)
    ↓
Parallel classification (batches of 20)
    ├→ REQUIREMENT
    ├→ DECISION
    ├→ CONSTRAINT
    └→ NOISE (filtered out)
    ↓
Parallel embedding generation (batches of 30)
    ↓
Store in Firestore + ChromaDB
    ↓
Update file status → "processed"
```

### 1.5. Gmail & Slack Ingestion (NEW)

**Gmail Ingestion Flow:**
```
User authorizes Gmail access
    ↓
Frontend calls ingestGmail()
    ↓
Fetch emails via Gmail API (OAuth2)
    ↓
Extract: subject, from, date, body
    ↓
Few-shot classification with Gemini
    ├→ REQUIREMENT
    ├→ DECISION
    ├→ CONSTRAINT
    └→ NOISE (filtered out)
    ↓
Parallel embedding generation (batches of 30)
    ↓
Store in Firestore with source="gmail"
    ↓
Update project.connectedSources.gmail = true
```

**Slack Ingestion Flow:**
```
User provides Slack token + channel ID
    ↓
Frontend calls ingestSlack()
    ↓
Fetch messages via Slack Web API
    ↓
Extract: text, author, timestamp, thread
    ↓
Few-shot classification with Gemini
    ├→ REQUIREMENT
    ├→ DECISION
    ├→ CONSTRAINT
    └→ NOISE (filtered out)
    ↓
Parallel embedding generation (batches of 30)
    ↓
Store in Firestore with source="slack"
    ↓
Update project.connectedSources.slack = true
```

**Few-Shot Classification:**
Both Gmail and Slack ingestion use few-shot prompting with Gemini to improve classification accuracy:
- 6 example classifications provided in prompt
- Examples cover all 4 categories (REQUIREMENT, DECISION, CONSTRAINT, NOISE)
- Each example includes reasoning to guide the model
- Model outputs JSON: `{"classification": "LABEL", "reason": "explanation"}`

### 2. BRD Generation

```
User clicks "Generate BRD"
    ↓
Frontend calls generateBrd()
    ↓
For each of 10 sections:
    ├→ Hybrid retrieval (8 snippets)
    │   ├→ BM25 keyword scoring
    │   ├→ Vector semantic search
    │   ├→ Cross-encoder reranking
    │   └→ RRF fusion
    ├→ AI generation (Gemini)
    ├→ Evidence mapping
    └→ Citation extraction
    ↓
Generate use case diagram (Mermaid.js)
    ↓
Calculate quality score
    ↓
Run conflict detection
    ↓
Save to Firestore
    ↓
Return brdVersionId
```

### 3. Conflict Detection

```
BRD generated
    ↓
detectConflicts() called
    ↓
Phase 1: Candidate Identification
    ├→ Extract all requirements
    ├→ Generate embeddings
    ├→ Pairwise cosine similarity
    └→ Filter by threshold (0.82)
    ↓
Phase 2: Semantic Validation
    ├→ Batch candidates (10 at a time)
    ├→ AI validation (Gemini)
    ├→ Determine conflict type
    └→ Assign severity
    ↓
Store in conflictFlags collection
    ↓
Update BRD conflict count
```

### 4. AI Auditor Chat

```
User opens BRD editor
    ↓
AI auditor auto-initializes
    ↓
Run deterministic gap check
    ↓
Identify highest severity gap
    ↓
Ask user for information
    ↓
User responds
    ↓
AI generates update
    ↓
Parse <BRD_UPDATE> XML tags
    ↓
Apply update to Firestore
    ↓
Notify user "Done. I've updated [section]."
    ↓
Move to next gap
    ↓
Repeat until AUDIT_COMPLETE
```

---

## Core Components

### Frontend Components

#### 1. Authentication
- **Files**: `src/context/AuthContext.tsx`, `src/services/authService.ts`
- **Features**: Email/password, Google OAuth, session management
- **State**: React Context API

#### 2. Dashboard
- **Files**: `src/pages/Dashboard.tsx`
- **Features**: Project grid, quality badges, quick actions
- **Data**: Real-time Firestore listeners

#### 3. BRD Editor
- **Files**: `src/pages/BRDEdit.tsx`
- **Features**: Three-column layout, evidence tracing, AI chat
- **State**: Local state + Firestore sync

#### 4. BRD Viewer
- **Files**: `src/pages/BRDView.tsx`
- **Features**: Read-only view, PDF export, version history
- **Data**: Firestore document snapshots

### Backend Functions

#### 1. generateBrd
- **File**: `functions/src/generateBrd.ts`
- **Timeout**: 540 seconds
- **Memory**: 512 MiB
- **Process**:
  1. Retrieve snippets for each section (parallel)
  2. Detect domain (policy/software/process)
  3. Generate 10 sections (parallel)
  4. Generate use case diagram from UC content
  5. Calculate quality score
  6. Run conflict detection
  7. Save to Firestore

#### 2. onFileUploaded
- **File**: `functions/src/onFileUploaded.ts`
- **Trigger**: Cloud Storage object finalized
- **Timeout**: 540 seconds
- **Process**:
  1. Download file from storage
  2. Extract text (PDF/DOCX)
  3. Chunk into 600-char segments
  4. Classify chunks (parallel batches)
  5. Filter noise
  6. Generate embeddings (parallel batches)
  7. Store in Firestore + ChromaDB
  8. Update file status

#### 3. detectConflicts
- **File**: `functions/src/twoPhaseConflictDetector.ts`
- **Timeout**: 300 seconds
- **Process**:
  1. Extract requirements from BRD
  2. Generate embeddings
  3. Phase 1: Cosine similarity
  4. Phase 2: AI validation
  5. Store conflicts in Firestore

#### 4. onChatMessage
- **File**: `functions/src/onChatMessage.ts`
- **Timeout**: 120 seconds
- **Process**:
  1. Load chat history
  2. Run gap check if first message
  3. Call Gemini AI with system instructions
  4. Parse response for <BRD_UPDATE> tags
  5. Apply updates to Firestore
  6. Return message + update status

---

## AI & Machine Learning

### 1. Classification Model

**Model**: Google Gemini 2.5 Flash

**Prompt**: Few-shot learning with 8 examples

**Labels**:
- `REQUIREMENT`: System capabilities, features, behaviors
- `DECISION`: Agreed-upon choices, architectural decisions
- `CONSTRAINT`: Hard boundaries, limitations, regulations
- `NOISE`: Everything else (scheduling, social, FYIs)

**Output**: JSON with `label` and `confidence`

### 2. Embedding Model

**Model**: Google Gemini Embedding (text-embedding-004)

**Dimensions**: 768

**Usage**:
- Snippet embeddings for semantic search
- Requirement embeddings for conflict detection
- Query embeddings for retrieval

### 3. BRD Generation Model

**Model**: Google Gemini 1.5 Pro

**Temperature**: 0.2 (deterministic)

**Max Tokens**: 2048 per section

**Prompts**: Section-specific with strict formatting rules

**Features**:
- Domain-aware (policy/software/process)
- Evidence citation enforcement ([SOURCE:N])
- Traceability validation
- Word count limits (200 words for use cases)

### 4. Conflict Detection Model

**Model**: Google Gemini 2.5 Flash

**Input**: Requirement pairs with similarity scores

**Output**: JSON with conflict type, severity, reason, resolution

**Conflict Types**:
- `direct_contradiction`: Mutually exclusive
- `scope_overlap`: Overlapping functionality
- `priority_clash`: Conflicting priorities
- `none`: No conflict

### 5. Quality Auditor Model

**Model**: Google Gemini 2.5 Flash

**System Instructions**: Gap detection, BRD update generation

**Features**:
- Deterministic gap checking
- Conversational interface
- XML-tagged updates
- One-gap-at-a-time focus

---

## Database Schema

### Firestore Collections

#### projects
```typescript
{
  id: string;
  name: string;
  description: string;
  createdBy: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  currentBrdVersionId: string | null;
  qualityScore: number;
  connectedSources: {
    gmail: boolean;
    slack: boolean;
    meeting: boolean;
  };
}
```

#### brdVersions
```typescript
{
  id: string;
  projectId: string;
  version: string;
  versionNumber: number;
  createdAt: Timestamp;
  createdBy: string;
  status: "draft" | "conflicted" | "approved";
  sections: {
    executiveSummary: string;
    stakeholderRegister: string;
    functionalReqs: string;
    nfrReqs: string;
    assumptions: string;
    successMetrics: string;
    externalInterfaces: string;
    useCases: string;
    glossary: string;
  };
  sentenceEvidence: Record<string, any[]>;
  citations: Record<string, string[]>;
  qualityScore: {
    total: number;
    completeness: number;
    clarity: number;
    consistency: number;
    grade: string;
  };
  useCaseDiagramMermaid: string;
  diagramCoverage: number;
  openConflictCount: number;
  detectedGaps: Gap[];
}
```

#### snippets
```typescript
{
  id: string;
  projectId: string;
  source: "gmail" | "slack" | "meeting";
  filename: string;
  rawText: string;
  classification: "REQUIREMENT" | "DECISION" | "CONSTRAINT" | "NOISE";
  embedding: number[];
  confidence: number;
  author: string;
  timestamp: string;
}
```

#### conflictFlags
```typescript
{
  id: string;
  projectId: string;
  brdVersionId: string;
  requirementA: string;
  requirementB: string;
  conflictType: string;
  severity: "high" | "medium" | "low";
  reason: string;
  suggestedResolution: string;
  status: "open" | "resolved";
  createdAt: Timestamp;
}
```

---

## API Reference

### Cloud Functions

#### generateBrd
```typescript
// Input
{
  projectId: string;
  selectedFiles?: string[];
}

// Output
{
  brdVersionId: string;
  version: string;
  versionNumber: number;
  sections: Record<string, string>;
  qualityScore: QualityScore;
  useCaseDiagramMermaid: string;
  diagramCoverage: number;
}
```

#### detectConflicts
```typescript
// Input
{
  projectId: string;
  brdVersionId: string;
}

// Output
{
  conflictsFound: number;
  summary: {
    high: number;
    medium: number;
    low: number;
  };
}
```

#### onChatMessage
```typescript
// Input
{
  projectId: string;
  brdVersionId: string;
  message: string;
}

// Output
{
  message: string;
  brdUpdated: boolean;
  updatedSection?: string;
  detectedGaps?: Gap[];
}
```

---

## Algorithms

### 1. BM25 Scoring

**Purpose**: Keyword-based relevance scoring

**Formula**:
```
score(D,Q) = Σ IDF(qi) × (f(qi,D) × (k1 + 1)) / (f(qi,D) + k1 × (1 - b + b × |D| / avgdl))
```

**Parameters**:
- k1 = 1.5 (term frequency saturation)
- b = 0.75 (length normalization)

**Implementation**: `functions/src/bm25Scorer.ts`

### 2. Reciprocal Rank Fusion (RRF)

**Purpose**: Merge multiple ranked lists

**Formula**:
```
RRFscore(d) = Σ 1 / (k + rank_i(d))
```

**Parameters**:
- k = 60 (constant)

**Implementation**: `functions/src/rrfMerger.ts`

### 3. Cosine Similarity

**Purpose**: Measure vector similarity for conflict detection

**Formula**:
```
similarity(A,B) = (A · B) / (||A|| × ||B||)
```

**Threshold**: 0.82 for conflict candidates

**Implementation**: `functions/src/twoPhaseConflictDetector.ts`

### 4. Quality Scoring

**Completeness** (40 points):
- Section coverage: 9 sections × 4 points
- Minimum length requirements

**Clarity** (20 points):
- Measurable language (SHALL, numeric thresholds)
- Average word count per requirement

**Consistency** (40 points):
- Base: 40 points
- Penalty: -8 points per open conflict

**Total**: 0-100 points → Grade (A/B/C/D/F)

**Implementation**: `functions/src/scoreQuality.ts`

---

## Performance Characteristics

- **BRD Generation**: 25-35 seconds
- **File Processing**: 30-60 seconds (120 chunks)
- **Conflict Detection**: 60-120 seconds (100 requirements)
- **Retrieval**: < 2 seconds (8 snippets)
- **Classification**: < 1 second per snippet
- **Embedding**: < 500ms per text

---

## Security

- **Authentication**: Firebase Auth tokens
- **Authorization**: Firestore security rules (user-scoped)
- **API Keys**: Cloud Functions secrets
- **CORS**: Configured for frontend domain
- **Input Validation**: File type, size, content sanitization

---

## Scalability

- **Horizontal**: Cloud Functions auto-scale
- **Vertical**: Configurable memory (512 MiB - 8 GiB)
- **Database**: Firestore auto-scales
- **Storage**: Cloud Storage unlimited
- **Vector DB**: ChromaDB can be clustered

---

## Monitoring & Logging

- **Cloud Functions Logs**: Structured logging with context
- **Firestore Metrics**: Read/write counts, latency
- **Error Tracking**: Console errors, function failures
- **Performance**: Execution time tracking

---

**For deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)**
