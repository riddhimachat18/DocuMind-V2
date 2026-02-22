# Deploy onFileUploaded Cloud Run Service

## Overview
The `onFileUploaded` service processes uploaded transcript files by:
1. Classifying text chunks using Gemini AI
2. Storing snippets in Firestore
3. Storing embeddings in ChromaDB for RAG
4. Updating the uploadedFiles document status

## Prerequisites
- Google Cloud SDK installed (`gcloud` command)
- Authenticated with Google Cloud: `gcloud auth login`
- Project set: `gcloud config set project documind-6c687`

## Build the Functions

```bash
cd functions
npm install
npm run build
```

## Deploy to Cloud Run

```bash
gcloud run deploy onfileuploaded \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=YOUR_GEMINI_API_KEY,CHROMA_URL=http://your-chroma-url:8000 \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 540s
```

## Update Environment Variables

After deployment, copy the service URL and update `.env`:

```
VITE_ONFILE_URL=https://onfileuploaded-xxxxx-uc.a.run.app
```

Replace the placeholder URL with your actual Cloud Run service URL.

## Test the Service

1. Upload a PDF or TXT file through the BRD page
2. Check the browser console for any errors
3. Verify in Firestore:
   - `uploadedFiles` collection: status should change from "processing" to "processed"
   - `snippets` collection: new documents should appear with source="meeting"
4. Check ChromaDB (if accessible) for new embeddings

## Troubleshooting

### Service returns 500 error
- Check Cloud Run logs: `gcloud run services logs read onfileuploaded --region us-central1`
- Verify GEMINI_API_KEY is set correctly
- Verify CHROMA_URL is accessible from Cloud Run

### Snippets not appearing in BRD generation
- Verify snippets are in Firestore with correct projectId
- Check that generateBrd service has Firestore fallback enabled
- Verify ChromaDB is seeded with embeddings

### File stays in "processing" status
- Check if the onFileUploaded service was called successfully
- Verify the uploadedFiles document exists before calling the service
- Check Cloud Run logs for errors

## Architecture Flow

```
Frontend Upload
    ↓
1. Create uploadedFiles doc (status: processing)
    ↓
2. Upload file to Storage
    ↓
3. Extract text (PDF/TXT)
    ↓
4. Call onFileUploaded Cloud Run service
    ↓
5. Service classifies chunks with Gemini
    ↓
6. Service stores snippets in Firestore
    ↓
7. Service stores embeddings in ChromaDB
    ↓
8. Service updates uploadedFiles doc (status: processed)
    ↓
9. Frontend shows success
```

## Related Files

- `functions/src/onFileUploaded.ts` - Cloud Run service
- `src/components/TranscriptUploadModal.tsx` - Frontend upload handler
- `functions/src/generateBrd.ts` - BRD generation with Firestore fallback
- `.env` - Environment variables including VITE_ONFILE_URL
