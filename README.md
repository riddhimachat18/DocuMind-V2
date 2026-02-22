# 🧠 DocuMind — AI-Powered Requirements Intelligence System

### 🚀 [**View Live Project → documind-6c687.web.app**](https://documind-6c687.web.app/)

*Transform unstructured enterprise conversations into structured, conflict-free Business Requirements Documents — automatically.*

</div>

---

## 📌 What is DocuMind?

In modern enterprises, critical business requirements are scattered across **Slack threads**, **email chains**, and **meeting transcripts**. Turning this fragmented communication into a structured Business Requirements Document (BRD) is manual, time-consuming, and error-prone.

**DocuMind** is an AI-native Requirements Intelligence System that ingests multi-source communication and automatically generates structured, evidence-traced BRDs — with full traceability, conflict detection, and quality scoring.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 📥 **Multi-Source Ingestion** | Connects to Gmail, Slack, and Meeting Transcripts |
| 🧹 **Noise Filtering** | Separates business signals from small talk and filler |
| 🤖 **AI BRD Synthesis** | Generates structured BRDs using Gemini 1.5 Pro |
| 🔗 **Evidence Tracing** | Every sentence linked back to its original source |
| ⚔️ **Conflict Detection** | Auto-detects contradictions between stakeholders |
| 📊 **Quality Auditor** | Scores BRD on completeness, clarity, and consistency |
| 📂 **PDF/DOCX Upload** | Upload transcripts and watch the BRD update live |
| 🔄 **Version Control** | Full version history with diff tracking |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│          React + TypeScript  (Firebase Hosting)         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  DATA SOURCES                           │
│   Gmail API    │    Slack API    │   File Upload        │
└────────┬────────────────┬────────────────┬──────────────┘
         │                │                │
         ▼                ▼                ▼
┌─────────────────────────────────────────────────────────┐
│            GCS Bucket: transcript_upload25              │
│               (Raw file storage — GCP)                  │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              CLOUD RUN SERVICES (us-central1)           │
│                                                         │
│  ┌─────────────────┐    ┌──────────────────────┐        │
│  │ classifysnippet │    │     generatebrd      │        │
│  │  Noise filter + │───▶│  Full BRD synthesis  │        │
│  │  categorization │    │  via Gemini 1.5 Pro  │        │
│  └─────────────────┘    └──────────┬───────────┘        │
│                                    │                    │
│  ┌─────────────────┐    ┌──────────▼───────────┐        │
│  │ onconflict      │    │   detectconflicts    │        │
│  │ resolved        │◀───│  Graph-based conflict│        │
│  │ BRD patch       │    │  detection           │        │
│  └─────────────────┘    └──────────────────────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │           onchatmessage                     │        │
│  │     RAG-powered BRD Q&A chatbot             │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                AI LAYER — Gemini 1.5 Pro                │
│   Snippet Classification │ BRD Generation │ Conflicts   │
└─────────────────────────────────────────────────────────┘
```

---

## 🧩 BRD Sections Generated

- **Executive Summary** — High-level project overview
- **Stakeholder Register** — All stakeholders with roles and accountability
- **Functional Requirements** — FR-01, FR-02... with source tracing
- **Non-Functional Requirements** — Performance, security, scalability
- **Assumptions** — Documented project assumptions
- **Success Metrics** — Measurable outcomes and KPIs

---

## 🛠️ Tech Stack

**Frontend**
- React + TypeScript
- Firebase Hosting
- Firebase Authentication (Google Sign-In)
- pdf.js — Client-side PDF text extraction
- mammoth.js — DOCX text extraction

**Backend (Cloud Run — us-central1)**
- FastAPI (Python)
- Gemini 1.5 Pro API — AI classification & BRD generation
- Google Cloud Storage — Raw file storage
- Signed URL upload — Direct GCS upload, no CORS issues

**Infrastructure**
- Google Cloud Project: `documind-6c687`
- GCS Bucket: `transcript_upload25`
- Firebase Project: `documind-6c687`
- Region: `us-central1 (Iowa)`

---

## ☁️ Cloud Run Services

| Service | Purpose | Status |
|---|---|---|
| `classifysnippet` | Classify text chunks into BRD categories | ✅ Healthy |
| `generatebrd` | Synthesize full BRD from all snippets | ✅ Healthy |
| `detectconflicts` | Find contradictions between requirements | ✅ Healthy |
| `onconflictresolved` | Patch BRD after conflict resolution | ✅ Healthy |
| `onchatmessage` | RAG-powered BRD Q&A chatbot | ✅ Healthy |

---

## 📁 Project Structure

```
documind/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BRDViewer.tsx          # Main BRD document renderer
│   │   │   ├── DataSources.tsx        # Gmail, Slack, Transcript sidebar
│   │   │   ├── ConflictPanel.tsx      # Conflict detection UI
│   │   │   └── VersionHistory.tsx     # BRD version control
│   │   ├── hooks/
│   │   │   └── useTranscriptUpload.ts # PDF/DOCX upload + AI pipeline hook
│   │   ├── services/
│   │   │   └── authService.ts         # Firebase Auth (Google Sign-In)
│   │   └── pages/
│   │       ├── Signup.tsx
│   │       └── Dashboard.tsx
│   └── public/
│
├── backend/
│   ├── main.py                        # FastAPI entrypoint
│   ├── gcs_upload.py                  # Signed URL generation + GCS upload
│   ├── services/
│   │   ├── classifysnippet/           # Cloud Run service
│   │   ├── generatebrd/               # Cloud Run service
│   │   ├── detectconflicts/           # Cloud Run service
│   │   ├── onconflictresolved/        # Cloud Run service
│   │   └── onchatmessage/             # Cloud Run service
│   └── requirements.txt
│
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- Google Cloud SDK (`gcloud`)
- Firebase CLI

### 1. Clone the repo
```bash
git clone https://github.com/your-username/documind.git
cd documind
```

### 2. Frontend setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Backend setup
```bash
cd backend
pip install -r requirements.txt

# Set environment variables
export GEMINI_API_KEY="your-gemini-api-key"
export CLASSIFYSNIPPET_URL="https://classifysnippet-xxxx-uc.a.run.app"
export GENERATEBRD_URL="https://generatebrd-xxxx-uc.a.run.app"
export DETECTCONFLICTS_URL="https://detectconflicts-xxxx-uc.a.run.app"
export ONCONFLICTRESOLVED_URL="https://onconflictresolved-xxxx-uc.a.run.app"
export ONCHATMESSAGE_URL="https://onchatmessage-xxxx-uc.a.run.app"

uvicorn main:app --reload --port 8000
```

### 4. Set GCS CORS (run once)
```bash
echo '[{"origin":["http://localhost:8081","https://documind-6c687.web.app"],"method":["GET","POST","PUT","OPTIONS"],"header":["*"],"maxAgeSeconds":3600}]' > cors.json
gsutil cors set cors.json gs://transcript_upload25
```

### 5. Deploy frontend
```bash
cd frontend
npm run build
firebase deploy --only hosting
```

---

## 🔄 Transcript Upload Flow

```
User uploads PDF/DOCX
        ↓
Frontend requests Signed URL from backend
        ↓
File uploaded directly to GCS (transcript_upload25)
        ↓
Text extracted client-side (pdf.js / mammoth.js)
        ↓
Chunks sent to /api/classify-snippets (Gemini)
        ↓
Valid snippets sent to /api/generate-brd (Gemini)
        ↓
BRD sections updated live in UI
        ↓
/api/detect-conflicts runs automatically
        ↓
Conflicts flagged in sidebar, version bumped
```

---

## 🌐 Live Demo

**👉 [https://documind-6c687.web.app/](https://documind-6c687.web.app/)**

---

## 📄 License

MIT License — feel free to use, modify, and distribute.

---

<div align="center">
Built with ❤️ using React, Gemini AI, and Google Cloud Run
</div>
