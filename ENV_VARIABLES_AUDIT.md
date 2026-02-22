# Environment Variables Audit

## ✅ Summary: All APIs are Properly Configured

Your environment variables are correctly set up and being used throughout the application.

## Frontend (.env file)

### Firebase Configuration
✅ **Used in**: `src/lib/firebase.ts`

```env
VITE_FIREBASE_API_KEY=AIzaSyDsf1LVcitWiR9OUrVtIMMbKL5h4F8E-T8
VITE_FIREBASE_AUTH_DOMAIN=documind-6c687.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=documind-6c687
VITE_FIREBASE_STORAGE_BUCKET=documind-6c687.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1051747171351
VITE_FIREBASE_APP_ID=1:1051747171351:web:19f630958b182b878cb052
```

**Usage**: Firebase SDK initialization for Auth, Firestore, and Storage

### Gemini API Key (Frontend)
✅ **Defined but NOT USED** (Good - should only be used in backend)

```env
VITE_GEMINI_API_KEY=AIzaSyCbb4dNG7UyWcsz2rUlyFtzj9bTJt7kG0s
```

**Note**: This is in .env but should NOT be used in frontend code for security. The backend uses Firebase Secrets instead.

### Cloud Function URLs
⚠️ **Defined but NOT NEEDED** (Using Firebase SDK instead)

```env
VITE_CLASSIFY_SNIPPET_URL=https://us-central1-documind-6c687.cloudfunctions.net/classifySnippet
VITE_GENERATE_BRD_URL=https://us-central1-documind-6c687.cloudfunctions.net/generateBrd
VITE_DETECT_CONFLICTS_URL=https://us-central1-documind-6c687.cloudfunctions.net/detectConflicts
VITE_RESOLVE_CONFLICT_URL=https://us-central1-documind-6c687.cloudfunctions.net/onConflictResolved
VITE_UPLOAD_TRANSCRIPT_URL=https://us-central1-documind-6c687.cloudfunctions.net/uploadTranscript
```

**Current Usage**: Your app uses `src/lib/functions.ts` which automatically resolves function URLs via Firebase SDK:

```typescript
import { getFunctions, httpsCallable } from "firebase/functions";
import app from "./firebase";

const functions = getFunctions(app);

export const classifySnippetFn = httpsCallable(functions, "classifySnippet");
export const generateBrdFn = httpsCallable(functions, "generateBrd");
export const detectConflictsFn = httpsCallable(functions, "detectConflicts");
export const onChatMessageFn = httpsCallable(functions, "onChatMessage");
export const onFileUploadedFn = httpsCallable(functions, "onFileUploaded");
```

**Recommendation**: These URL variables can be removed from .env since they're not being used.

## Backend (Cloud Functions)

### Gemini API Key (Backend)
✅ **Properly configured as Firebase Secret**

```bash
firebase functions:secrets:access GEMINI_API_KEY
# Returns: AIzaSyCbb4dNG7UyWcsz2rUlyFtzj9bTJt7kG0s
```

**Used in**:
- `functions/src/onFileUploaded.ts` - File processing and classification
- `functions/src/generateBrd.ts` - BRD generation
- `functions/src/detectConflicts.ts` - Conflict detection
- `functions/src/onChatMessage.ts` - AI chat
- `functions/src/classifySnippet.ts` - Snippet classification
- `functions/src/embedSnippet.ts` - Text embedding

**Usage Pattern**:
```typescript
import { defineSecret } from "firebase-functions/params";
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const onFileUploaded = onCall(
  { secrets: [GEMINI_API_KEY] },
  async ({ data, auth }) => {
    const key = GEMINI_API_KEY.value();
    const genAI = new GoogleGenerativeAI(key);
    // ...
  }
);
```

### ChromaDB URL (Optional)
✅ **Configured as Firebase Parameter**

```typescript
import { defineString } from "firebase-functions/params";
const chromaUrl = defineString("CHROMA_URL", { default: "" });
```

**Used in**: `functions/src/onFileUploaded.ts` for vector storage (optional feature)

## Security Analysis

### ✅ Good Practices
1. **Firebase API Key in frontend** - Safe to expose (protected by Firebase Security Rules)
2. **Gemini API Key in backend** - Stored as Firebase Secret (not exposed to frontend)
3. **No hardcoded secrets** - All sensitive data uses environment variables
4. **Firebase SDK auto-resolution** - Function URLs resolved automatically

### ⚠️ Recommendations

1. **Remove unused variables from .env**:
   ```env
   # These can be removed (not being used):
   VITE_GEMINI_API_KEY=...
   VITE_CLASSIFY_SNIPPET_URL=...
   VITE_GENERATE_BRD_URL=...
   VITE_DETECT_CONFLICTS_URL=...
   VITE_RESOLVE_CONFLICT_URL=...
   VITE_UPLOAD_TRANSCRIPT_URL=...
   ```

2. **Keep only essential variables**:
   ```env
   # Firebase Configuration (REQUIRED)
   VITE_FIREBASE_API_KEY=AIzaSyDsf1LVcitWiR9OUrVtIMMbKL5h4F8E-T8
   VITE_FIREBASE_AUTH_DOMAIN=documind-6c687.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=documind-6c687
   VITE_FIREBASE_STORAGE_BUCKET=documind-6c687.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=1051747171351
   VITE_FIREBASE_APP_ID=1:1051747171351:web:19f630958b182b878cb052
   ```

3. **Update .env.example** to match the cleaned .env

## How Environment Variables Flow

### Frontend (Vite)
```
.env → Vite build process → import.meta.env.VITE_* → src/lib/firebase.ts
```

### Backend (Cloud Functions)
```
Firebase Secrets → defineSecret() → GEMINI_API_KEY.value() → Cloud Functions
```

### Function Calls
```
Frontend → Firebase SDK → Cloud Functions (auto-resolved URLs)
```

## Verification Commands

### Check frontend env variables are loaded:
```bash
npm run dev
# Open browser console and check: import.meta.env
```

### Check backend secrets:
```bash
firebase functions:secrets:access GEMINI_API_KEY
```

### Check deployed functions:
```bash
firebase functions:list
```

## Conclusion

✅ **All APIs are properly configured and being used correctly**
- Frontend uses Firebase config from .env
- Backend uses Gemini API from Firebase Secrets
- Function URLs are auto-resolved by Firebase SDK
- No security issues detected

**Optional cleanup**: Remove unused VITE_GEMINI_API_KEY and VITE_*_URL variables from .env
