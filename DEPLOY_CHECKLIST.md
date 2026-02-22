# Deployment Checklist - CORS & Timeout Fixes

## Pre-Deployment Checks
- [x] All Cloud Functions have `cors: true` configured
- [x] onFileUploaded has timeout increased to 540s
- [x] Parallel processing implemented in onFileUploaded
- [x] All TypeScript files pass diagnostics (no errors)
- [x] Dependencies installed in functions folder

## Deploy Now

### Option 1: Quick Deploy (Recommended)
```bash
deploy-functions.bat
```

### Option 2: Manual Deploy
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### Option 3: Deploy Single Function (for testing)
```bash
firebase deploy --only functions:onFileUploaded
```

## Post-Deployment Verification

### 1. Check Deployment Status
```bash
firebase functions:list
```

Expected output should show:
- ✅ onFileUploaded (us-central1)
- ✅ generateBrd (us-central1)
- ✅ detectConflicts (us-central1)
- ✅ onChatMessage (us-central1)
- ✅ classifySnippet (us-central1)

### 2. Wait for Propagation
⏳ Wait 1-2 minutes for changes to propagate globally

### 3. Test File Upload
1. Open http://localhost:8084
2. Navigate to a project
3. Click "Upload Transcript"
4. Select a PDF or TXT file (test with small file first)
5. Click "Upload & Process"

### 4. Expected Results
✅ No CORS errors in browser console
✅ No 504 timeout errors
✅ Progress bar shows: "Processing and classifying snippets..."
✅ Success message: "Successfully processed X snippets from [filename]"
✅ Snippets appear in the project

### 5. Check Logs (if issues occur)
```bash
firebase functions:log --only onFileUploaded
```

## Troubleshooting

### Still getting CORS errors?
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+F5)
3. Check Firebase Console → Functions → onFileUploaded → Details
4. Verify "Allow unauthenticated invocations" is enabled (if needed)

### Still getting 504 timeout?
1. Check file size (should be < 10MB)
2. Check Firebase Console → Functions → Logs
3. Look for "File processing error" messages
4. Verify GEMINI_API_KEY is configured:
   ```bash
   firebase functions:secrets:access GEMINI_API_KEY
   ```

### Function not found?
1. Verify deployment: `firebase functions:list`
2. Check region matches (us-central1)
3. Ensure function is exported in functions/src/index.ts

## Performance Monitoring

After successful deployment, monitor:
- Execution time (should be < 30 seconds for typical files)
- Memory usage (should be < 512MB)
- Error rate (should be < 1%)

Check in Firebase Console → Functions → onFileUploaded → Metrics

## Rollback (if needed)

If issues occur, rollback to previous version:
```bash
firebase functions:delete onFileUploaded
# Then redeploy from backup
```

## Success Criteria
- ✅ File uploads complete without errors
- ✅ Processing time < 30 seconds for typical files
- ✅ No CORS errors in browser console
- ✅ Snippets correctly classified and stored
- ✅ Quality score calculated correctly
