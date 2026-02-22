# Quick Guide: Delete Project Feature

## For Users

### How to Delete a Project

1. Navigate to your project
2. Click the settings icon (···) or go to Project Settings
3. Scroll to the "Danger Zone" section at the bottom
4. Click the red "Delete" button
5. Review the data summary in the confirmation dialog
6. Type the exact project name to confirm
7. Click "Delete Project"
8. You'll be redirected to the dashboard

### What Gets Deleted

Everything related to the project:
- All BRD versions
- All uploaded files
- All extracted snippets
- All AI chat messages
- All conflict flags
- All storage files

### Important Notes

⚠️ **This action cannot be undone!**
- All data is permanently deleted
- No recovery option available
- Make sure to export any BRDs you want to keep before deleting

## For Developers

### Quick Implementation Overview

**Service**: `src/services/projectService.ts`
```typescript
import { deleteProject } from "../services/projectService";

// Delete a project
await deleteProject(projectId);
```

**UI**: `src/pages/ProjectSettings.tsx`
- Confirmation dialog with data summary
- Project name verification
- Loading states
- Toast notifications

### Collections Deleted

1. `brdVersions` - where projectId == projectId
2. `brdExports` - where projectId == projectId
3. `uploadedFiles` - where projectId == projectId
4. `snippets` - where projectId == projectId
5. `chatMessages` - where brdVersionId in [brdVersionIds]
6. `conflictFlags` - where projectId == projectId
7. `projects` - the project document itself

### Storage Folders Deleted

1. `transcripts/{projectId}/`
2. `brd-version/{projectId}/`
3. `uploads/{projectId}/`

### Key Functions

**`deleteProject(projectId: string)`**
- Main deletion function
- Orchestrates all deletions
- Returns Promise<void>

**`getProjectDeletionSummary(projectId: string)`**
- Returns counts of data to be deleted
- Used for confirmation dialog
- Returns Promise<DeletionSummary>

### Error Handling

```typescript
try {
  await deleteProject(projectId);
  toast.success("Project deleted");
  navigate("/dashboard");
} catch (error) {
  toast.error(`Failed: ${error.message}`);
}
```

### Testing

```bash
# 1. Create test project
# 2. Upload files
# 3. Generate BRD
# 4. Delete project
# 5. Verify all data removed
```

## Troubleshooting

### Issue: Deletion takes too long
**Solution**: Normal for large projects (1000+ snippets). Consider background deletion.

### Issue: Some data not deleted
**Solution**: Check console logs. May need to manually clean up orphaned data.

### Issue: User can't delete project
**Solution**: Verify user is authenticated. Add ownership check if needed.

### Issue: Projects list not updating
**Solution**: AppContext uses real-time listeners, should update automatically. Check Firestore connection.

## Quick Reference

| Action | Function | Location |
|--------|----------|----------|
| Delete project | `deleteProject()` | `src/services/projectService.ts` |
| Get summary | `getProjectDeletionSummary()` | `src/services/projectService.ts` |
| UI component | `ProjectSettings` | `src/pages/ProjectSettings.tsx` |
| Confirmation | Modal in ProjectSettings | `src/pages/ProjectSettings.tsx` |

## Performance Tips

1. **Batch Operations**: Already implemented (500 per batch)
2. **Parallel Processing**: Already implemented where possible
3. **Indexed Queries**: Use existing indexes
4. **Background Jobs**: Consider for very large projects

## Security Checklist

- [ ] Add ownership verification
- [ ] Add role-based permissions
- [ ] Add audit logging
- [ ] Add soft delete option
- [ ] Add recovery mechanism

## Next Steps

1. Test thoroughly in development
2. Deploy to production
3. Monitor deletion metrics
4. Gather user feedback
5. Consider implementing soft delete
6. Add audit trail
7. Add ownership checks

## Support

For issues or questions:
1. Check console logs
2. Verify Firestore rules
3. Check Storage permissions
4. Review error messages
5. Test with small project first
