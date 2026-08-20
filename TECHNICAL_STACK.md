# DocuMind - Technical Stack Documentation

## Overview

DocuMind is a full-stack web application for automated Business Requirements Document (BRD) generation using AI and machine learning. The system follows a modern serverless architecture built on Google Cloud Platform and Firebase.

---

## Frontend Stack

### Core Framework & Libraries

#### **React 18.3.1**
- Modern React with hooks and concurrent features
- Function components with TypeScript
- Context API for state management

#### **TypeScript 5.8.3**
- Strong typing for better code quality
- Enhanced IDE support and refactoring
- Type-safe API interactions

#### **Vite 5.4.19**
- Lightning-fast HMR (Hot Module Replacement)
- Optimized build with code splitting
- ES modules native support

### UI Framework & Components

#### **Radix UI**
- Complete suite of unstyled, accessible UI components
- Includes: Dialog, Dropdown, Tooltip, Tabs, Accordion, etc.
- Full keyboard navigation and ARIA compliance

#### **shadcn/ui**
- Beautiful component library built on Radix UI
- Customizable with Tailwind CSS
- Copy-paste component architecture

#### **Tailwind CSS 3.4.17**
- Utility-first CSS framework
- Custom design system
- Responsive design out of the box
- Dark mode support via `next-themes`

#### **Lucide React 0.462.0**
- Modern icon library
- 1000+ icons
- Tree-shakeable and lightweight

### State Management & Data Fetching

#### **TanStack Query 5.83.0** (React Query)
- Server state management
- Automatic caching and refetching
- Optimistic updates
- Background data synchronization

#### **React Hook Form 7.61.1**
- Performant form handling
- Built-in validation
- Minimal re-renders
- Integration with Zod for schema validation

#### **Zod 3.25.76**
- TypeScript-first schema validation
- Runtime type checking
- Integration with React Hook Form

### Routing & Navigation

#### **React Router DOM 6.30.1**
- Client-side routing
- Nested routes
- Protected routes with auth guards
- URL state management

### Data Visualization & Charts

#### **Recharts 2.15.4**
- Composable chart library
- Built on D3.js
- Responsive charts
- Used for quality metrics and analytics

#### **Mermaid 11.14.0**
- Diagram and flowchart generation
- Used for use case diagrams
- Markdown-like syntax
- Dynamic diagram rendering

### PDF Export

#### **jsPDF 2.5.2**
- Client-side PDF generation
- Export BRDs to PDF format
- Custom styling and formatting

### Backend Integration

#### **Firebase 12.9.0** (Client SDK)
- Authentication (Email/Password, Google OAuth)
- Firestore real-time database
- Cloud Storage for file uploads
- Hosting for static assets

#### **@google/generative-ai 0.24.1**
- Google Gemini AI integration
- Direct API calls from frontend
- AI-powered features and chat

### Additional Libraries

#### **date-fns 3.6.0**
- Modern date utility library
- Lightweight alternative to Moment.js
- Immutable and pure functions

#### **embla-carousel-react 8.6.0**
- Lightweight carousel component
- Touch-enabled
- Responsive

#### **cmdk 1.1.1**
- Command palette component
- Keyboard-first navigation
- Search and filtering

#### **sonner 1.7.4**
- Toast notification system
- Beautiful animations
- Customizable

### Development Tools

#### **ESLint 9.32.0**
- Code linting and quality
- TypeScript rules
- React-specific rules

#### **Vitest 3.2.4**
- Fast unit test runner
- Vite-native testing
- Jest-compatible API

#### **@testing-library/react 16.0.0**
- Testing utilities for React
- User-centric testing approach
- Integration with Vitest

---

## Backend Stack

### Runtime & Platform

#### **Node.js 24**
- Latest LTS runtime
- ES modules support
- Modern JavaScript features

#### **Firebase Cloud Functions 7.0.0**
- Serverless function execution
- Event-driven architecture
- Auto-scaling

#### **TypeScript 5.7.3**
- Backend code written in TypeScript
- Compiled to JavaScript for deployment
- Type-safe cloud functions

### Backend Framework

#### **Express 4.22.1**
- Web application framework
- Middleware support
- RESTful API endpoints
- Used for HTTP-triggered functions

### Database & Storage

#### **Firebase Admin SDK 13.6.0**
- Server-side Firebase integration
- Firestore database operations
- Authentication management
- Cloud Storage access

#### **Firestore**
- NoSQL document database
- Real-time synchronization
- Offline support
- ACID transactions
- Security rules

#### **Cloud Storage**
- File upload and storage
- Signed URLs for secure access
- Automatic backup

#### **ChromaDB 3.3.1**
- Vector database for embeddings
- Semantic search
- Similarity matching
- Used for requirement retrieval

### AI & Machine Learning

#### **Google Gemini AI**
- **Gemini 2.5 Flash**: Classification, conflict detection, chat
- **Gemini 1.5 Pro**: BRD generation
- **text-embedding-004**: Vector embeddings

#### **@google/generative-ai 0.24.1**
- Official Google Generative AI SDK
- Function calling support
- Structured output
- Streaming responses

### External API Integration

#### **Gmail API** (googleapis 171.4.0)
- Email ingestion
- OAuth2 authentication
- Thread parsing
- Attachment handling

#### **Slack Web API** (@slack/web-api 7.15.1)
- Message retrieval
- Channel history
- Thread support
- Token-based authentication

### File Processing

#### **Busboy 1.6.0**
- Multipart form-data parsing
- File upload handling
- Streaming support

#### **Cloud Storage (@google-cloud/storage 7.19.0)**
- Google Cloud Storage SDK
- File operations
- Signed URLs
- Metadata management

### Testing

#### **Fast-check 4.7.0**
- Property-based testing
- Generative testing
- Shrinking for minimal failing cases

#### **firebase-functions-test 3.4.1**
- Unit testing for Cloud Functions
- Mock Firebase services
- Offline testing

---

## AI/ML Pipeline

### Models Used

| Model | Purpose | Configuration |
|-------|---------|---------------|
| **Gemini 2.5 Flash** | Snippet classification, conflict detection, AI chat | Temperature: 0.1-0.3, Max tokens: 2048 |
| **Gemini 1.5 Pro** | BRD generation | Temperature: 0.2, Max tokens: 2048 per section |
| **text-embedding-004** | Vector embeddings | Dimensions: 768 |

### Classification System

**Categories:**
- **REQUIREMENT**: System capabilities, features
- **DECISION**: Architectural choices, agreed-upon decisions
- **CONSTRAINT**: External limitations, regulations
- **NOISE**: Background, context, non-requirements

**Approach:** Few-shot learning (6-8 examples per category)

### Retrieval System

**Hybrid Approach:**
1. **BM25**: Keyword-based scoring (k1=1.5, b=0.75)
2. **Vector Similarity**: Semantic search via ChromaDB
3. **Cross-Encoder Reranking**: Precision improvement
4. **RRF Fusion**: Merge ranked lists (k=60)

**Result:** Top 8 most relevant snippets per BRD section

### Conflict Detection

**Two-Phase Approach:**
1. **Phase 1**: Cosine similarity (threshold=0.65, optimized from 0.50)
2. **Phase 2**: LLM validation with Gemini

**Conflict Types:**
- CONTRADICTION: Mutually exclusive
- OVERLAP: Redundant functionality
- IMPLICIT: Hidden assumption violations
- NO_CONFLICT: Independent requirements

---

## Infrastructure & DevOps

### Cloud Platform

#### **Google Cloud Platform (GCP)**
- Primary cloud provider
- Region: us-central1
- Auto-scaling infrastructure

#### **Firebase**
- Authentication
- Firestore database
- Cloud Functions
- Cloud Storage
- Hosting

### CI/CD

#### **Firebase CLI**
- Deployment automation
- Function deployment
- Hosting deployment
- Configuration management

#### **npm scripts**
- Build pipeline
- Testing automation
- Development server
- Linting and formatting

### Monitoring & Logging

#### **Firebase Console**
- Real-time metrics
- Function logs
- Error tracking
- Performance monitoring

#### **Cloud Functions Logs**
- Structured logging
- Request tracing
- Error reporting
- Performance metrics

---

## Security

### Authentication & Authorization

- **Firebase Authentication**: JWT tokens
- **OAuth 2.0**: Google sign-in
- **Firestore Security Rules**: Row-level security
- **API Keys**: Environment variables and Firebase secrets

### Data Protection

- **HTTPS**: All traffic encrypted
- **CORS**: Configured for frontend domain
- **Input Validation**: Zod schemas on frontend, sanitization on backend
- **File Validation**: Type checking, size limits
- **XSS Protection**: React's built-in escaping

---

## Performance Optimizations

### Frontend

- **Code Splitting**: Vite automatic chunking
- **Lazy Loading**: React.lazy for route components
- **Image Optimization**: Responsive images
- **Caching**: TanStack Query cache
- **Bundle Size**: Tree shaking, minification

### Backend

- **Parallel Processing**: Batch operations for classification and embedding
- **Caching**: Firestore query caching
- **Indexing**: Composite indexes for fast queries
- **Function Optimization**: Memory allocation tuning (512 MiB - 8 GiB)
- **Timeout Management**: Appropriate timeouts per function (60s - 540s)

### Database

- **Denormalization**: Optimized for read-heavy workloads
- **Batch Operations**: Firestore batch writes
- **Real-time Listeners**: Efficient snapshot listeners
- **Index Strategy**: Composite indexes for common queries

---

## Development Tools

### Frontend

- **Vite**: Build tool and dev server
- **ESLint**: Code linting
- **TypeScript**: Type checking
- **Vitest**: Unit testing
- **React Testing Library**: Component testing

### Backend

- **TypeScript Compiler**: Type checking
- **ESLint**: Code linting (Google config)
- **Firebase Emulators**: Local development
- **Fast-check**: Property-based testing

### Version Control

- **Git**: Source control
- **GitHub**: Repository hosting
- **.gitignore**: Exclude sensitive files

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Production Environment                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Firebase Hosting (CDN)                     │  │
│  │  - Static assets (HTML, CSS, JS)                    │  │
│  │  - Global CDN distribution                          │  │
│  │  - HTTPS automatic                                  │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │           Firebase Cloud Functions                    │  │
│  │  - Serverless compute                                │  │
│  │  - Auto-scaling (0 to N instances)                  │  │
│  │  - Region: us-central1                              │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                       │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │  Data Layer                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │  │
│  │  │  Firestore   │  │ Cloud Storage│  │ ChromaDB  │ │  │
│  │  │  (NoSQL DB)  │  │ (File Store) │  │(Vector DB)│ │  │
│  │  └──────────────┘  └──────────────┘  └───────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           External Services                           │  │
│  │  - Google Gemini AI (us-central1)                   │  │
│  │  - Gmail API                                         │  │
│  │  - Slack API                                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Frontend Routes

```
/                          → Landing page
/dashboard                → Project dashboard (protected)
/projects/:id             → Project detail
/projects/:id/brd/new     → Create new BRD
/projects/:id/brd/:vId    → View BRD
/projects/:id/brd/:vId/edit → Edit BRD with AI auditor
/projects/:id/history     → BRD version history
/projects/:id/settings    → Project settings
/login                    → Authentication
```

### Cloud Functions

```typescript
// Callable Functions (HTTPS)
generateBrd(projectId, selectedFiles?)
detectConflicts(projectId, brdVersionId)
onChatMessage(projectId, brdVersionId, message)
classifySnippet(text)
ingestGmail(projectId, accessToken, query)
ingestSlack(projectId, token, channelId)

// Triggered Functions
onFileUploaded(object) // Cloud Storage trigger
```

---

## Environment Variables

### Frontend (.env)

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx

# Google Gemini API Key
VITE_GEMINI_API_KEY=xxx

# Cloud Function URLs
VITE_CLASSIFY_SNIPPET_URL=https://...
VITE_GENERATE_BRD_URL=https://...
VITE_DETECT_CONFLICTS_URL=https://...
```

### Backend (Firebase Secrets)

```bash
GEMINI_API_KEY=xxx
GOOGLE_APPLICATION_CREDENTIALS=xxx
```

---

## Dependencies Summary

### Frontend Dependencies (22 major packages)

- **UI**: React, Radix UI, Tailwind CSS, Lucide
- **State**: TanStack Query, React Hook Form, Zod
- **Routing**: React Router DOM
- **Visualization**: Recharts, Mermaid
- **Firebase**: Firebase Client SDK
- **AI**: Google Generative AI
- **Utilities**: date-fns, jsPDF

### Backend Dependencies (11 major packages)

- **Runtime**: Node.js 24, Express
- **Firebase**: Firebase Admin, Cloud Functions
- **AI**: Google Generative AI
- **Database**: ChromaDB
- **APIs**: googleapis, Slack Web API
- **File Handling**: Busboy, Cloud Storage

### Development Dependencies (16 packages)

- **Build**: Vite, TypeScript, PostCSS
- **Testing**: Vitest, React Testing Library, Fast-check
- **Linting**: ESLint, TypeScript ESLint
- **Styling**: Tailwind CSS, Autoprefixer

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## License

Internal research project - not for public distribution

---

## For More Information

- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Deployment**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **README**: See [README.md](./README.md)
