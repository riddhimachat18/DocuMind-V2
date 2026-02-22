# Deploy BRD Optimization

## Quick Deploy

### 1. Deploy Backend Functions
```bash
cd functions
npm run build
firebase deploy --only functions:generateBrd,functions:onChatMessage
```

Or deploy all functions:
```bash
npm run deploy:functions
```

### 2. Test Locally (Optional)
```bash
# Start frontend dev server
npm run dev

# In another terminal, start functions emulator
cd functions
npm run serve
```

### 3. Deploy Frontend
```bash
npm run build
firebase deploy --only hosting
```

## What Changed

### Backend (Cloud Functions)
- `generateBrd.ts`: Optimized for conciseness, added evidence tracking
- `onChatMessage.ts`: Already optimized (no changes needed)
- `scoreQuality.ts`: Already working (no changes needed)

### Frontend (React)
- `BRDEdit.tsx`: Restructured with Evidence View, improved reactivity
- `CreateBRDVersion.tsx`: No changes (already working)

## Verification Steps

After deployment:

1. **Generate New BRD:**
   - Go to project → Generate BRD
   - Select files
   - Wait for generation (~30-60 seconds)
   - Should redirect to BRD Edit page

2. **Check Evidence View:**
   - Click any sentence in BRD
   - Left panel should show source snippets
   - Verify metadata displays correctly

3. **Test AI Auditor:**
   - Should auto-start when page loads
   - Type a message and send
   - Verify AI responds
   - Check quality score updates

4. **Test Editing:**
   - Double-click a sentence
   - Edit text
   - Save changes
   - Verify updates persist

5. **Export PDF:**
   - Click "Export Draft (PDF)"
   - Verify PDF opens in new tab
   - Check formatting

## Rollback Plan

If issues occur:

```bash
# Rollback functions
firebase functions:delete generateBrd
firebase functions:delete onChatMessage

# Redeploy previous version
git checkout HEAD~1 functions/src/generateBrd.ts
cd functions && npm run build
firebase deploy --only functions
```

## Environment Variables

Ensure these are set in Firebase:
```bash
firebase functions:secrets:set GEMINI_API_KEY
```

## Performance Expectations

- **BRD Generation:** 30-60 seconds (down from 60-90 seconds)
- **BRD Size:** 5-6 pages for 16 raw pages (down from 10-12 pages)
- **AI Response:** 3-5 seconds
- **Evidence Load:** Instant (loaded with BRD)

## Monitoring

Check Firebase Console:
- Functions → Logs → Filter by `generateBrd` or `onChatMessage`
- Firestore → Collections → `brdVersions` (check `sentenceEvidence` field)
- Firestore → Collections → `chatMessages` (verify auto-initialization)

## Troubleshooting

**BRD too long:**
- Check `maxOutputTokens` is set to 800
- Verify temperature is 0.3
- Check retrieval limit is 8 (not 15)

**Evidence not showing:**
- Check `sentenceEvidence` field exists in Firestore
- Verify citations are being parsed correctly
- Check browser console for errors

**AI not auto-starting:**
- Check `hasInitializedChat` ref logic
- Verify `onChatMessage` function is deployed
- Check Firebase Functions logs

**Quality score not updating:**
- Verify Firestore listener is active
- Check `onConflictResolved` trigger is deployed
- Verify `qualityScore` field structure

## Success Criteria

✅ BRD generates in 30-60 seconds
✅ Output is 5-6 pages for 16 raw pages
✅ Evidence View shows sources correctly
✅ AI Auditor auto-starts on page load
✅ Quality score updates in real-time
✅ Chat interaction works smoothly
✅ PDF export works correctly
