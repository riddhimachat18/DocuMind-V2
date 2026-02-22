# Deploy BRD Versioning System

## Quick Deployment Guide

### 1. Deploy Cloud Functions
The backend changes need to be deployed to Firebase Cloud Functions:

```bash
# Windows
deploy-functions.bat

# Linux/Mac
./deploy-functions.sh
```

Or manually:
```bash
cd functions
npm run deploy
```

### 2. Test the Changes

#### Test 1: Generate First BRD (v1.0)
1. Navigate to a project
2. Click "Generate BRD" or "New version"
3. Select files to include
4. Click "Generate BRD from X snippets"
5. Verify progress shows "Generating BRD v1.0"
6. After completion, verify edit page shows "Draft Edit — v1.0"

#### Test 2: Generate Second BRD (v2.0)
1. From the same project, click "New version"
2. Generate another BRD
3. Verify progress shows "Generating BRD v2.0"
4. Verify edit page shows "Draft Edit — v2.0"

#### Test 3: View Version History
1. Click "History" button
2. Verify both versions appear in timeline
3. Verify v2.0 is marked as "Latest"
4. Verify version numbers, dates, and metadata display correctly

#### Test 4: Version Persistence
1. Refresh the page
2. Navigate away and back
3. Verify version numbers remain consistent
4. Check Firestore console to verify data structure

### 3. Verify Firestore Data

Check the `brdVersions` collection in Firestore console:

Expected fields for each document:
- `projectId`: string
- `version`: "v1.0", "v2.0", etc.
- `versionNumber`: 1.0, 2.0, etc.
- `sections`: object with BRD content
- `createdAt`: timestamp
- `createdBy`: user ID
- `status`: "draft"
- `changeLog`: "Generated v1.0"

### 4. Rollback Plan (if needed)

If issues occur, you can rollback:

1. **Cloud Functions**: Deploy previous version
   ```bash
   cd functions
   git checkout <previous-commit>
   npm run deploy
   ```

2. **Frontend**: The changes are backward compatible
   - Old BRD versions without `version` field will still work
   - They'll just show as "v1.0" by default

### 5. Known Limitations

- Existing BRD versions created before this update won't have version numbers
- They will be assigned sequential numbers when viewed (v1.0, v2.0, etc.)
- To fix: Manually add `version` and `versionNumber` fields in Firestore

### 6. Monitoring

After deployment, monitor:
- Cloud Function logs for any errors
- Firestore writes to `brdVersions` collection
- User feedback on version display
- Performance of version queries

### 7. Success Criteria

✅ New BRDs start at v1.0
✅ Each generation increments version by 1.0
✅ Version displays correctly on all pages
✅ History page shows all versions
✅ No hardcoded "v4.0" references
✅ Version persists across page refreshes
✅ Firestore documents have correct structure

## Troubleshooting

### Issue: Version shows as "v1.0" for all BRDs
**Solution**: Check Firestore - ensure `versionNumber` field exists and is numeric

### Issue: "Generating BRD v1.0" but should be v2.0
**Solution**: Check the version calculation query in `generateBrd.ts` - ensure it's ordering by `versionNumber` DESC

### Issue: History page shows no versions
**Solution**: 
1. Check Firestore `brdVersions` collection has documents
2. Verify `projectId` matches
3. Check browser console for errors

### Issue: Function timeout during generation
**Solution**: 
- This is expected for large projects
- The BRD is still created in Firestore
- The UI will fetch it automatically
- Version number will be correct

## Next Steps

After successful deployment:

1. Update user documentation
2. Notify users of new versioning system
3. Consider implementing version comparison feature
4. Add version restore functionality
5. Implement version approval workflow
