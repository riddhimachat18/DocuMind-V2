# Firebase Callable Functions Migration

## Summary

Successfully converted all Cloud Functions from Express HTTP endpoints to Firebase v2 callable functions. This fixes the authorization issues and provides better integration with the Firebase SDK.

## Changes Made

### 1. Functions Converted

All 5 Cloud Functions were converted from Express apps to Firebase v2 callable functions:

- `generateBrd` - Generates BRD from project snippets
- `detectConflicts` - Detects conflicts between requirements
- `onChatMessage` - Handles chat interactions for BRD refinement
- `classifySnippet` - Classifies text snippets
- `onFileUploaded` - Processes uploaded transcript files

### 2. Key Changes

#### Before (Express HTTP endpoint):
```typescript
import express from "express";
import * as functions from "firebase-functions";

const app = express();
app.use(express.json());

app.post("/endpoint", async (req, res) => {
  const { data } = req.body;
  // ... logic
  res.json({ result });
});

export const myFunction = functions.https.onRequest(app);
```

#### After (Firebase v2 callable function):
```typescript
import { onCall } from "firebase-functions/v2/https";

export const myFunction = onCall(async ({ data, auth }) => {
  if (!auth) {
    throw new Error('User must be authenticated');
  }
  
  const { param } = data;
  // ... logic
  return { result };
});
```

### 3. Frontend Changes

Updated `src/components/TranscriptUploadModal.tsx` to use the callable function instead of HTTP fetch:

#### Before:
```typescript
const response = await fetch(`${onFileUrl}/process`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${idToken}`
  },
  body: JSON.stringify({ projectId, filename, fileContent })
});
```

#### After:
```typescript
import { onFileUploadedFn } from "../lib/functions";

const result = await onFileUploadedFn({
  projectId,
  filename: file.name,
  fileContent: text
});
```

### 4. Benefits

1. **Automatic Authentication**: Firebase SDK automatically includes auth tokens
2. **Type Safety**: Better TypeScript support with callable functions
3. **Simpler Code**: No need for manual CORS, token verification, or error handling
4. **Consistent API**: All functions use the same pattern
5. **Better Error Handling**: Firebase SDK handles network errors gracefully

### 5. Deployment

All functions successfully deployed to Firebase:
```bash
firebase deploy --only functions
```

Output:
```
✓ functions[generateBrd(us-central1)] Successful update operation.
✓ functions[detectConflicts(us-central1)] Successful update operation.
✓ functions[onChatMessage(us-central1)] Successful update operation.
✓ functions[classifySnippet(us-central1)] Successful update operation.
✓ functions[onFileUploaded(us-central1)] Successful update operation.
```

### 6. Firestore Rules

Updated Firestore rules to properly handle queries:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Projects — any authenticated user can read, owner can write
    match /projects/{projectId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        (resource.data.userId == request.auth.uid ||
         resource.data.createdBy == request.auth.uid);
    }
    
    // All other collections — any authenticated user can read/write
    match /snippets/{snippetId} {
      allow read, write: if request.auth != null;
    }
    
    match /uploadedFiles/{fileId} {
      allow read, write: if request.auth != null;
    }
    
    // ... etc
  }
}
```

## Testing

1. User authentication works correctly
2. File uploads process successfully
3. BRD generation works with proper auth
4. Chat interface functions properly
5. Conflict detection runs without errors

## Notes

- All functions use Firebase Functions v2 API (`firebase-functions/v2/https`)
- Authentication is automatically handled by Firebase SDK
- No need for manual token verification in function code
- Frontend uses `httpsCallable` from `firebase/functions` package
- All functions return data directly (no need for response.json())

## Migration Complete

Authorization is now working correctly. All Cloud Functions have been successfully converted to callable functions and deployed.
