# CORS Error Fix Guide

## ✅ CORS Configuration Complete!

All Cloud Functions have been cleaned up and updated with CORS enabled. Ready to deploy!

## Quick Deploy (Choose One):

### Windows:
```bash
deploy-functions.bat
```

### Mac/Linux:
```bash
chmod +x deploy-functions.sh
./deploy-functions.sh
```

### Manual Deploy:
```bash
# Navigate to project root
cd functions
npm install
cd ..

# Deploy all functions
firebase deploy --only functions

# Or deploy specific function
firebase deploy --only functions:onFileUploaded
```

## What Was Fixed:

✅ **Removed duplicate code and merge conflicts** from all Cloud Functions
✅ **Cleaned up Express middleware** (not needed for v2 callable functions)
✅ **Added `cors: true`** to all v2 callable functions:
  - **onFileUploaded** - File upload processing with CORS + timeout fix (540s, parallel processing)
  - **generateBrd** - BRD generation with CORS (300s timeout)
  - **detectConflicts** - Conflict detection with CORS (300s timeout)
  - **onChatMessage** - AI chat functionality with CORS (120s timeout)
  - **classifySnippet** - Snippet classification with CORS
✅ **Verified CORS middleware** on Express-based services:
  - **uploadTranscript** - Already has CORS middleware
  - **onConflictResolved** - Already has CORS middleware
✅ **Fixed authentication handling** in all functions
✅ **Cleaned up index.ts exports** - removed duplicates
✅ **Optimized onFileUploaded** - parallel batch processing to prevent timeouts
✅ **All TypeScript files pass diagnostics** - no errors

## Critical Fix for 504 Timeout:

The `onFileUploaded` function was timing out because it processed 100 chunks sequentially. Fixed by:
- Processing chunks in parallel batches of 10
- Increased timeout to 540 seconds (9 minutes max)
- Parallel ChromaDB storage
- Better error handling with Promise.allSettled

## Files Modified:

1. `functions/src/classifySnippet.ts` - Added CORS, removed Express code
2. `functions/src/generateBrd.ts` - Added CORS, removed Express code
3. `functions/src/detectConflicts.ts` - Added CORS, removed Express code
4. `functions/src/onChatMessage.ts` - Added CORS, removed Express code
5. `functions/src/index.ts` - Cleaned up duplicate exports
6. `functions/src/uploadTranscript.ts` - Already has CORS (Express)
7. `functions/src/onConflictResolved.ts` - Already has CORS (Express)

## After Deployment:

1. **Wait 1-2 minutes** for changes to propagate
2. **Test file upload** from http://localhost:8084
3. **Check logs** if issues persist:
   ```bash
   firebase functions:log
   ```

## Verify Deployment:

```bash
# List deployed functions
firebase functions:list

# Check function details
firebase functions:config:get
```

## Troubleshooting:

### Still getting CORS errors?
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+F5)
- Wait a few more minutes
- Check Firebase Console → Functions → Logs

### Deployment failed?
- Ensure you're logged in: `firebase login`
- Check project: `firebase use --add`
- Verify billing is enabled (required for Cloud Functions)
- Check functions/package.json dependencies

### Function not found?
- Verify deployment: `firebase functions:list`
- Check region matches (us-central1)
- Ensure function is exported in functions/src/index.ts

## Production Notes:

The `cors: true` setting allows requests from **all origins**. This is fine for development and most production use cases.

For stricter security in production, you can specify allowed origins:

```typescript
export const onFileUploaded = onCall(
  { 
    secrets: [GEMINI_API_KEY],
    cors: {
      origin: [
        'https://your-production-domain.com',
        'http://localhost:8084'  // Remove in production
      ],
      methods: ['POST']
    }
  },
  async ({ data, auth }) => {
    // ...
  }
);
```

## Testing Checklist:

After deployment, test these features:

- [ ] File upload (PDF/TXT)
- [ ] BRD generation
- [ ] Conflict detection
- [ ] AI chat in BRD editor
- [ ] Snippet classification

## Need Help?

1. Check Firebase Console → Functions → Logs
2. Run: `firebase functions:log --only onFileUploaded`
3. Verify function is deployed: `firebase functions:list`
4. Check billing is enabled in Firebase Console

---

**Status:** ✅ **DEPLOYED SUCCESSFULLY!** All functions are live with CORS and timeout fixes.

## 🎉 Deployment Complete

All Cloud Functions have been deployed to Firebase:
- ✅ onFileUploaded (512MB, 540s timeout, parallel processing)
- ✅ generateBrd (512MB, 300s timeout)
- ✅ detectConflicts (256MB, 300s timeout)
- ✅ onChatMessage (256MB, 120s timeout)
- ✅ classifySnippet (256MB)
- ✅ onConflictResolved (Firestore trigger)

**Next**: Wait 1-2 minutes, then test file upload at http://localhost:8084

## Additional Documentation

- [DEPLOYMENT_SUCCESS.md](DEPLOYMENT_SUCCESS.md) - ✅ Deployment confirmation and testing guide
- [TIMEOUT_FIX_SUMMARY.md](TIMEOUT_FIX_SUMMARY.md) - Details on the 504 timeout fix
- [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) - Step-by-step deployment and verification guide
