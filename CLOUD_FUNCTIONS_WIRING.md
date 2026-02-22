# Cloud Functions Wiring Documentation

## Overview
All Firebase Cloud Functions are now wired to the React frontend with proper data flow and error handling.

## Step 1: Functions Library ✓
Created `src/lib/functions.ts` with callable function references:
- `classifySnippetFn` - Classify text snippets
- `generateBrdFn` - Generate BRD from snippets
- `detectConflictsFn` - Detect conflicts in BRD
- `onChatMessageFn` - AI chat assistant
- `onFileUploadedFn` - Process uploaded files

## Step 2: Generate BRD Button ✓
**File**: `src/pages/CreateBRDVersion.tsx`

**Flow**:
1. User clicks "Start generation" button
2. Sets loading state and progresses through stages
3. Calls `generateBrdFn({ projectId })`
4. Receives `{ brdVersionId, sections }` from response
5. Calls `detectConflictsFn({ projectId, brdVersionId })`
6. Receives `{ conflictsFound }` from response
7. Updates project document with `currentBrdVersionId`
8. Refetches BRD version document from Firestore
9. Navigates to BRD view page
10. Error handling: catches errors, shows toast, resets to idle state

**Error Handling**:
- Try/catch wraps all async operations
- Errors logged to console
- Toast notifications for user feedback
- Loading state reset on error

## Step 3: Chat Send ✓
**File**: `src/pages/BRDEdit.tsx`

**Flow**:
1. User types message and clicks send
2. Message saved to Firestore `chatMessages` collection immediately
3. Sets typing indicator to true
4. Builds chat history from current messages
5. Calls `onChatMessageFn({ projectId, brdVersionId, userMessage, chatHistory })`
6. Receives `{ message, brdUpdated }` from response
7. Saves AI response to Firestore `chatMessages` collection
8. If `brdUpdated === true`, refetches BRD version document
9. Sets typing indicator to false
10. Auto-start: On page load, if no chat messages exist, automatically sends initial message

**Initial Message**:
- Triggered when `chatMessages` collection is empty
- Message: "Start the review. What is the most critical gap in this BRD?"
- Only runs once per BRD version

**Error Handling**:
- Try/catch wraps all async operations
- Errors logged to console
- Toast notifications for user feedback
- Typing indicator reset on error

## Step 4: Chat History Loading ✓
**File**: `src/pages/BRDEdit.tsx`

**Implementation**:
- Real-time listener on `chatMessages` collection
- Query filters by `brdVersionId`
- Orders by `timestamp` ascending
- Maps Firestore documents to chat message format
- Persists across page refreshes
- Auto-scrolls to latest message

**Query**:
```typescript
query(
  collection(db, "chatMessages"),
  where("brdVersionId", "==", brdVersionId),
  orderBy("timestamp", "asc")
)
```

## Step 5: Conflict Resolution (Automatic) ✓
**Implementation**:
- When user resolves a conflict, updates `conflictFlags` document
- `onConflictResolved` Cloud Function triggers automatically (Firestore trigger)
- Function recalculates quality score
- Updates `brdVersions` document automatically
- Quality score display updates via existing Firestore listener

**Note**: This is handled by Cloud Function triggers, no frontend wiring needed beyond updating the conflict document.

## Step 6: Quality Score Display (TODO)
**File**: `src/pages/BRDEdit.tsx` (needs implementation)

**Required Implementation**:
```typescript
useEffect(() => {
  if (!brdVersionId) return;
  
  const unsubscribe = onSnapshot(
    doc(db, "brdVersions", brdVersionId),
    (snap) => {
      const data = snap.data();
      setQualityScore(data?.qualityScore ?? null);
      setOpenConflictCount(data?.openConflictCount ?? 0);
    }
  );
  
  return () => unsubscribe();
}, [brdVersionId]);
```

**Quality Score Shape**:
```typescript
{
  total: number,
  completeness: number,
  consistency: number,
  clarity: number
}
```

## Step 7: Sentence Click for Evidence View (TODO)
**File**: `src/pages/BRDEdit.tsx` (needs implementation)

**Required Implementation**:
1. Get `brdVersions` document from Firestore (already in state)
2. Access `data.citations` with shape:
   ```typescript
   {
     sectionId: {
       "sentence text": ["snippetId1", "snippetId2"]
     }
   }
   ```
3. Match clicked sentence against citation keys
4. Fetch snippet documents from `snippets` collection
5. Pass snippets to evidence view component

**Snippet Fields**:
- `rawText` - The snippet content
- `author` - Who said it
- `source` - Where it came from (gmail, slack, meeting)
- `timestamp` - When it was created
- `filename` - File name if from upload

## Step 8: Error Handling ✓
All function calls wrapped in try/catch with:
- Console logging of full error
- Toast notification for user feedback
- Loading/typing state reset
- Never leaves UI in frozen state

## Testing Checklist

### Generate BRD
- [ ] Click "Start generation" button
- [ ] Verify stages progress correctly
- [ ] Check BRD appears in Firestore `brdVersions` collection
- [ ] Verify conflicts detected and stored
- [ ] Confirm navigation to BRD view page
- [ ] Test error handling by disconnecting network

### Chat
- [ ] Open BRD edit page
- [ ] Verify initial AI message appears automatically
- [ ] Send a user message
- [ ] Verify AI response appears
- [ ] Refresh page and verify chat history persists
- [ ] Test error handling by disconnecting network

### File Upload
- [ ] Upload a PDF or TXT file
- [ ] Verify file appears in uploaded files list
- [ ] Check snippets created in Firestore
- [ ] Verify snippets included in next BRD generation

### Conflict Resolution
- [ ] Resolve a conflict in the UI
- [ ] Verify quality score updates automatically
- [ ] Check `conflictFlags` document status changed

## Architecture Diagram

```
Frontend (React)
    ↓
src/lib/functions.ts (Firebase callable functions)
    ↓
Firebase Cloud Functions
    ↓
- generateBrd → ChromaDB + Gemini AI
- detectConflicts → Gemini AI
- onChatMessage → Gemini AI
- classifySnippet → Gemini AI
- onFileUploaded → Gemini AI + ChromaDB
    ↓
Firestore (data persistence)
    ↓
Real-time listeners update UI
```

## Environment Variables Required

Frontend (`.env`):
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ONFILE_URL=... (Cloud Run URL)
```

Backend (`functions/.env.local`):
```
GEMINI_API_KEY=...
CHROMA_URL=...
```

## Deployment

1. Deploy Cloud Functions:
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

2. Deploy Cloud Run services (if using):
   ```bash
   gcloud run deploy onfileuploaded --source . --region us-central1
   ```

3. Update frontend `.env` with deployed URLs

4. Deploy frontend:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```
