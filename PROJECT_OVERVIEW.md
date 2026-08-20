# DocuMind: AI-Powered Business Requirements Documentation

## Project Overview (3-Paragraph Summary)

**The Problem:** Software development teams spend countless hours manually sifting through scattered communication channels—emails, Slack messages, meeting transcripts, and documents—to extract business requirements and compile them into formal Business Requirements Documents (BRDs). This manual process is time-consuming, error-prone, and often results in incomplete or inconsistent documentation. Requirements hidden in informal conversations get lost, stakeholder needs are misinterpreted, and conflicting requirements go undetected until late in the development cycle when they're expensive to fix. Additionally, maintaining traceability between source communications and final requirements is nearly impossible, making it difficult to validate that documented requirements actually reflect stakeholder needs.

**Our Solution:** DocuMind is an AI-powered platform that automatically transforms informal stakeholder communications into comprehensive, traceable Business Requirements Documents. The system ingests multiple data sources—PDF documents, Word files, Gmail threads, Slack conversations, and meeting transcripts—and processes them through a sophisticated NLP pipeline. Using Google's Gemini AI with few-shot learning, DocuMind classifies text segments into four categories: REQUIREMENTS (functional/non-functional system capabilities), DECISIONS (architectural choices already made), CONSTRAINTS (external limitations), and NOISE (non-relevant content like greetings and scheduling). Non-noise content is then embedded using Google's text-embedding-004 model (768 dimensions) and stored in a hybrid database architecture combining Firestore for structured data and ChromaDB for vector search. When generating a BRD, DocuMind employs a three-stage hybrid retrieval system: BM25 keyword scoring for lexical matching, semantic vector search for conceptual similarity, and cross-encoder reranking for precision, all fused using Reciprocal Rank Fusion (RRF). The system generates ten standardized BRD sections with automatic citation tracking, ensuring every requirement is traceable back to its source communication. An intelligent two-phase conflict detector identifies contradictory requirements using cosine similarity (Phase 1: threshold ≥0.65) followed by AI validation (Phase 2), while an AI auditor chatbot interactively helps users fill documentation gaps.

**Technical Stack & Architecture:** The system follows a three-tier architecture built on Firebase's serverless platform. The frontend is a React application (TypeScript, Vite) with Tailwind CSS and shadcn/ui components, providing real-time collaboration through Firestore listeners and WebSocket connections. The backend consists of Node.js Cloud Functions deployed on Firebase, including specialized functions for document processing (`onFileUploaded`), BRD generation (`generateBrd`), conflict detection (`detectConflicts`), Gmail ingestion (`ingestGmail`), Slack ingestion (`ingestSlack`), and AI chat (`onChatMessage`). Data flows through a multi-stage pipeline: uploaded documents trigger text extraction (PDF/DOCX parsing), chunking into 600-character segments (max 120 chunks), parallel classification in batches of 20, and parallel embedding generation in batches of 30. All processed snippets are stored in Firestore with their embeddings indexed in ChromaDB for fast vector search. External integrations include Gmail API with OAuth2 for email ingestion, Slack Web API for message retrieval, and Google Gemini AI (models: Gemini 2.5 Flash for classification/conflict detection, Gemini 1.5 Pro for BRD generation, text-embedding-004 for embeddings). The system implements sophisticated algorithms including BM25 scoring (k1=1.5, b=0.75), RRF fusion (k=60), and quality scoring across three dimensions (completeness, clarity, consistency) yielding grades from A to F. Performance characteristics include 25-35 second BRD generation, sub-2-second retrieval, and automated conflict detection completing in 60-120 seconds for 100 requirements, all secured with Firebase Auth tokens and Firestore security rules ensuring user-scoped data access.

---

## Key Innovations

1. **Hybrid Retrieval System**: Combines lexical (BM25), semantic (vector search), and neural (cross-encoder) approaches for superior evidence retrieval

2. **Source Traceability**: Every requirement automatically maps back to source communications with inline citations

3. **Two-Phase Conflict Detection**: Efficient candidate filtering (Phase 1) followed by AI validation (Phase 2), achieving F1=0.698 with 74.1% computational savings

4. **Multi-Source Ingestion**: Unified pipeline for documents, emails, Slack, and transcripts with consistent classification

5. **Interactive Gap Filling**: AI auditor identifies missing information and guides users through completion

6. **Real-time Collaboration**: Live document updates with automatic version control and conflict resolution

---

## Research Validation

- **Citation Accuracy**: Cohen's κ = 0.667 (substantial agreement) validating citation verification
- **Conflict Detection**: Cohen's κ = 0.491 (moderate agreement) with precision = 0.732 at threshold 0.65
- **Domain Generalization**: Tested across Transportation, Embedded Systems, Web/E-commerce, Infrastructure, and Inventory/Management domains
- **Performance**: Optimal Phase 1 threshold (0.65) filters 74.1% of candidate pairs while maintaining high recall

---

## Tech Stack Summary

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: React Context API
- **Real-time**: Firestore listeners

### Backend
- **Platform**: Firebase Cloud Functions (Node.js)
- **Runtime**: Node.js 20
- **Database**: Firestore (NoSQL)
- **Vector Store**: ChromaDB
- **Storage**: Firebase Cloud Storage
- **Auth**: Firebase Authentication

### AI/ML
- **Classification**: Google Gemini 2.5 Flash (few-shot learning)
- **Generation**: Google Gemini 1.5 Pro (temperature=0.2)
- **Embeddings**: text-embedding-004 (768 dimensions)
- **Retrieval**: BM25 + Vector Search + Cross-encoder reranking
- **Fusion**: Reciprocal Rank Fusion (RRF)

### External APIs
- **Email**: Gmail API (OAuth2)
- **Chat**: Slack Web API
- **AI**: Google AI Studio API

### Algorithms
- **BM25**: k1=1.5, b=0.75
- **RRF**: k=60
- **Conflict Detection**: Cosine similarity (threshold=0.65)
- **Quality Scoring**: Completeness (40%) + Clarity (20%) + Consistency (40%)

---

## Use Cases

1. **Software Development Teams**: Automatically document requirements from sprint planning meetings and stakeholder emails
2. **Product Managers**: Transform customer feedback and feature requests into structured requirements
3. **Consultants**: Quickly compile client communications into professional requirement specifications
4. **Enterprise IT**: Maintain compliance by ensuring all requirements are traceable to source communications
5. **Agile Teams**: Keep documentation synchronized with evolving requirements from multiple channels
