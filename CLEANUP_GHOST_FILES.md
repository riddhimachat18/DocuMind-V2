# Clean Up Ghost "Unknown file" Documents

## Problem
Ghost "Unknown file" entries with permanent loading spinners appear in the uploaded files list.

## Root Cause
Old test documents exist in Firestore with missing or empty `filename` fields.

## Solution Applied

### Fix 1: Added Guard in Upload Handler ✓
Added validation in `src/components/TranscriptUploadModal.tsx`:
```typescript
if (!file.name || !projectId) {
  toast.error("Invalid file or project");
  return;
}
```

### Fix 2: Filter Ghost Documents in useBRDData ✓
Added filter in `src/hooks/useBRDData.ts`:
```typescript
.filter(f => f.name && f.name !== 'Unknown file')
```

### Fix 3: Manual Cleanup Required
You need to manually delete ghost documents from Firestore:

1. Go to Firebase Console: https://console.firebase.google.com/project/documind-6c687/firestore
2. Navigate to the `uploadedFiles` collection
3. Look for documents where:
   - `filename` field is missing, empty, or undefined
   - `filename` equals "Unknown file"
4. Delete these documents manually

## Verification Steps

After cleanup:
1. Refresh the BRD page
2. Upload a new file
3. Verify only ONE entry appears with the correct filename
4. No "Unknown file" entries should appear

## Prevention

The code now prevents ghost documents from:
- Being created (guard in upload handler)
- Being displayed (filter in useBRDData)

New uploads will always have valid filenames.
