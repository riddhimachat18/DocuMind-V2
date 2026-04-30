# 🧠 DocuMind — AI-Powered Requirements Intelligence System

**Live Project:** [documind-6c687.web.app](https://documind-6c687.web.app/)

Transform unstructured enterprise conversations into structured, conflict-free Business Requirements Documents automatically.

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install
cd functions && npm install && cd ..

# Start development
npm run dev

# Build and deploy
npm run build
firebase deploy
```

---

## 📋 What is DocuMind?

DocuMind solves the enterprise requirements chaos problem. Instead of manually compiling BRDs from scattered Slack threads, email chains, and meeting transcripts, DocuMind:

- ✅ **Ingests** from multiple sources (Gmail, Slack, file uploads)
- ✅ **Classifies** content using AI (requirements vs noise)
- ✅ **Generates** structured 10-section IEEE 830 BRDs
- ✅ **Traces** every sentence to original sources (100% traceability)
- ✅ **Detects** conflicts between stakeholders automatically
- ✅ **Scores** quality in real-time with AI auditor
- ✅ **Exports** professional PDFs with diagrams

**Result:** 16 pages of raw conversations → 5-6 pages of structured BRD in < 30 seconds

---

## 🏗️ Architecture

```
Frontend (React + TypeScript)
    ↓
Firebase Auth → Cloud Functions → Gemini AI
    ↓                ↓              ↓
Firestore ← Cloud Storage ← ChromaDB Vector Store
```

**Tech Stack:**
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Firebase Cloud Functions v2 (Node.js)
- **AI**: Google Gemini 2.5 Flash + Gemini 1.5 Pro
- **Vector DB**: ChromaDB for semantic search
- **Database**: Firestore (NoSQL)
- **Storage**: Google Cloud Storage
- **Hosting**: Firebase Hosting

---

## 🎯 Core Features

### 1. Multi-Source Ingestion
- **File Upload**: PDF, DOCX, TXT with drag-and-drop
- **Gmail Integration**: Email thread extraction (planned)
- **Slack Integration**: Channel message extraction (planned)
- **Processing**: Automatic chunking, classification, embedding

### 2. AI-Powered BRD Generation
- **10 Sections**: Executive Summary, Stakeholder Register, Functional Requirements, Non-Functional Requirements, Assumptions & Constraints, Success Metrics, External Interfaces, Use Cases, Glossary, Use Case Diagram
- **100% Traceable**: Every sentence linked to source with [SOURCE:N] citations
- **Domain-Aware**: Detects policy/software/process domains
- **Quality Scored**: Real-time completeness, clarity, consistency metrics

### 3. Hybrid Retrieval System
- **BM25**: Keyword-based scoring
- **Vector Search**: Semantic similarity via embeddings
- **Cross-Encoder**: AI-powered reranking
- **RRF Fusion**: Combines all three methods for optimal results

### 4. Conflict Detection
- **Two-Phase**: Cosine similarity + AI validation
- **Automatic**: Runs on every BRD generation
- **Actionable**: Severity levels, suggested resolutions
- **Traceable**: Links to source evidence

### 5. AI Quality Auditor
- **Proactive**: Auto-starts on BRD load
- **Conversational**: Natural language chat interface
- **Auto-Update**: Applies fixes without confirmation
- **Gap Detection**: Identifies missing/incomplete sections

### 6. Version Control
- **Full History**: Every generation creates new version
- **Diff View**: Compare versions (planned)
- **Rollback**: One-click restore previous version
- **Audit Trail**: Track all changes with timestamps

### 7. Professional PDF Export
- **Complete**: All 10 sections + use case diagram
- **Formatted**: Tables, headers, page numbers
- **Traceable**: [SOURCE:N] citations preserved

---

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
├── context/            # React Context providers (auth, app state)
├── lib/               # Utilities and Firebase config
├── pages/             # Route components (Dashboard, BRDEdit, etc.)
├── services/          # API service layers
└── types/             # TypeScript definitions

functions/src/
├── generateBrd.ts              # Main BRD generation orchestrator
├── retrieval.ts                # Hybrid retrieval system
├── bm25Scorer.ts              # Keyword scoring
├── crossEncoderReranker.ts    # AI reranking
├── rrfMerger.ts               # Reciprocal Rank Fusion
├── scoreQuality.ts            # Quality assessment
├── twoPhaseConflictDetector.ts # Conflict detection
├── classifySnippet.ts         # AI classification
├── embedSnippet.ts            # Vector embeddings
├── onFileUploaded.ts          # File processing pipeline
└── onChatMessage.ts           # AI auditor chat
```

---

## ⚙️ Environment Setup

### 1. Frontend Environment Variables

Create `.env` file in root:

```bash
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 2. Backend Secrets

Set Cloud Functions secret:

```bash
firebase functions:secrets:set GEMINI_API_KEY
# Enter your Google AI API key when prompted
```

### 3. Firebase Configuration

Ensure `firebase.json` has correct settings:
- Hosting: `dist` directory
- Functions: Node.js runtime, proper timeouts
- Firestore: Security rules configured
- Storage: CORS enabled

---

## 🧪 Development

```bash
# Frontend development
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build           # Production build
npm run preview         # Preview production build

# Backend development
cd functions
npm run build           # Compile TypeScript
npm run test            # Run test suites

# Deployment
firebase deploy --only hosting          # Deploy frontend only
firebase deploy --only functions        # Deploy backend only
firebase deploy                         # Deploy everything
```

---

## 📊 Key Metrics

- **Generation Speed**: < 30 seconds for full BRD
- **Compression Ratio**: 16 pages input → 5-6 pages structured output
- **Traceability**: 100% sentence-to-source linking
- **Conflict Detection**: 95%+ accuracy
- **Test Coverage**: 257 passing tests
- **Quality Score**: 75-90 range (A-B grade)

---

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Detailed technical architecture, data flows, algorithms
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guide, environment setup, troubleshooting

---

## 🔒 Security

- Firebase Authentication (Email/Password + Google OAuth)
- Firestore security rules (user-scoped data)
- API key secrets management
- CORS configuration
- Input validation and sanitization

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is proprietary software. All rights reserved.

---

## 🆘 Support

For issues, questions, or feature requests, please contact the development team.

---

**Built with ❤️ using React, TypeScript, Firebase, and Google Gemini AI**
