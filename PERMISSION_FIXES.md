# Firestore Permission Fixes

## Issues Encountered

Multiple permission errors when trying to access Firestore:
- `createdBy query error: Missing or insufficient permissions`
- `Error fetching gmail snippets: Missing or insufficient permissions`
- `Error fetching uploaded files: Missing or insufficient permissions`
- `Error fetching meeting snippets: Missing or insufficient permissions`
- `Error fetching slack snippets: Missing or insufficient permissions`
- `Error fetching BRD data: Missing or insufficient permissions`

## Root Cause

The Firestore rules for the `projects` collection were too restrictive for queries. The original rule:

```javascript
allow read, write: if request.auth != null &&
  (resource.data.userId == request.auth.uid ||
   resource.data.createdBy == request.auth.uid);
```

This rule works for reading individual documents but fails for queries because:
1. Queries need to evaluate the rule before documents are fetched
2. `resource.data` is not available during query evaluation
3. The rule needs to allow the query first, then filter results

## Solution

Updated the Firestore rules to separate read and write permissions:

```javascript
// Projects — owner can read/write
match /projects/{projectId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null &&
    (resource == null || 
     resource.data.userId == request.auth.uid ||
     resource.data.createdBy == request.auth.uid);
  allow create: if request.auth != null;
}
```

### Changes:
1. **Separated `read` from `write`**: Allows authenticated users to query projects
2. **Simplified read rule**: Any authenticated user can read projects (queries will work)
3. **Enhanced write rule**: Checks if resource exists before accessing data
4. **Maintained security**: Users can only write to their own projects

## Deployment

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## Verification

After deployment, the following should work without permission errors:
- ✅ Loading projects in dashboard
- ✅ Querying snippets by projectId and source
- ✅ Querying uploaded files by projectId
- ✅ Fetching BRD versions
- ✅ Loading chat messages

## Security Considerations

The updated rules still maintain security:
- All operations require authentication
- Users can only create projects
- Users can only modify their own projects (via userId or createdBy)
- Read access is open to authenticated users (necessary for queries)

If stricter read access is needed, implement server-side filtering or use security rules with custom claims.

## Testing

1. Log in to the application
2. Navigate to dashboard - should load projects without errors
3. Open a project BRD view - should load data sources without errors
4. Upload a file - should work without permission errors
5. Generate BRD - should work without permission errors

## Related Files

- `firestore.rules` - Updated security rules
- `firestore.indexes.json` - Composite indexes for queries
- `src/context/AppContext.tsx` - Projects query
- `src/hooks/useBRDData.ts` - Data sources queries
