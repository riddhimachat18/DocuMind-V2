# Project Delete Implementation

## Overview
Implemented a comprehensive, reactive project deletion system that removes all associated data from Firestore and Firebase Storage when a project is deleted.

## Features

### 1. Complete Data Deletion
When a project is deleted, the following data is automatically removed:

#### Firestore Collections:
- **projects** - The project document itself
- **brdVersions** - All BRD versions for the project
- **brdExports** - All exported BRD PDFs
- **uploadedFiles** - All uploaded file metadata
- **snippets** - All extracted snippets from transcripts
- **chatMessages** - All AI chat messages for BRD versions
- **conflictFlags** - All detected conflicts

#### Firebase Storage:
- **transcripts/{projectId}/** - All uploaded transcript files
- **brd-version/{projectId}/** - All BRD JSON files
- **uploads/{projectId}/** - All other uploaded files

### 2. Confirmation Dialog
Before deletion, users must:
1. Review a summary of data to be deleted
2. Type the exact project name to confirm
3. Confirm the deletion action

### 3. Batch Operations
- Uses Firestore batch writes for efficiency
- Handles large datasets (500 operations per batch)
- Processes collections in parallel where possible

### 4. Error Handling
- Graceful handling of missing data
- Continues deletion even if some operations fail
- Provides user feedback via toast notifications

## Implementation Details

### Service Layer (`src/services/projectService.ts`)

#### Main Function: `deleteProject(projectId: string)`
Orchestrates the deletion of all project data in the following order:

1. **BRD Versions** - Delete all BRD documents
2. **BRD Exports** - Delete all PDF export records
3. **Uploaded Files** - Delete file metadata
4. **Snippets** - Delete all extracted snippets
5. **Chat Messages** - Delete all AI chat history
6. **Conflict Flags** - Delete all conflict records
7. **Storage Files** - Delete all files from Firebase Storage
8. **Project Document** - Finally delete the project itself

#### Helper Functions:

**`deleteBRDVersions(projectId: string)`**
- Queries all BRD versions for the project
- Uses batched writes (500 per batch)
- Returns count of deleted documents

**`deleteBRDExports(projectId: string)`**
- Queries all BRD exports for the project
- Deletes export metadata
- Note: Storage files deleted separately

**`deleteUploadedFiles(projectId: string)`**
- Queries all uploaded file records
- Deletes metadata only
- Storage files deleted separately

**`deleteSnippets(projectId: string)`**
- Queries all snippets for the project
- Can handle large datasets (thousands of snippets)
- Uses batched writes for efficiency

**`deleteChatMessages(projectId: string)`**
- First gets all BRD version IDs
- Queries chat messages in batches (Firestore 'in' limit is 10)
- Deletes all messages across all BRD versions

**`deleteConflictFlags(projectId: string)`**
- Queries all conflict flags for the project
- Deletes all open and resolved conflicts

**`deleteStorageFiles(projectId: string)`**
- Deletes files from multiple storage folders
- Handles missing folders gracefully
- Continues even if some deletions fail

**`getProjectDeletionSummary(projectId: string)`**
- Counts all data to be deleted
- Returns summary for confirmation dialog
- Used to show user what will be deleted

### UI Layer (`src/pages/ProjectSettings.tsx`)

#### State Management:
```typescript
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [isDeleting, setIsDeleting] = useState(false);
const [deletionSummary, setDeletionSummary] = useState<...>(null);
const [confirmText, setConfirmText] = useState("");
```

#### Confirmation Flow:
1. User clicks "Delete" button
2. Modal opens and loads deletion summary
3. User reviews data counts
4. User types project name to confirm
5. User clicks "Delete Project"
6. Deletion executes with loading state
7. User redirected to dashboard on success

#### Confirmation Dialog Features:
- Shows exact counts of data to be deleted
- Requires typing project name to confirm
- Disables buttons during deletion
- Shows loading spinner while fetching summary
- Displays warning message about permanent deletion

## Data Flow

```
User clicks Delete
    ↓
Modal opens
    ↓
Load deletion summary
    ↓
Display data counts
    ↓
User types project name
    ↓
User confirms deletion
    ↓
deleteProject() called
    ↓
Delete BRD versions
    ↓
Delete BRD exports
    ↓
Delete uploaded files
    ↓
Delete snippets
    ↓
Delete chat messages
    ↓
Delete conflict flags
    ↓
Delete storage files
    ↓
Delete project document
    ↓
Redirect to dashboard
```

## Firestore Queries

All queries use compound indexes for efficiency:

### BRD Versions
```typescript
collection(db, "brdVersions")
  .where("projectId", "==", projectId)
```

### BRD Exports
```typescript
collection(db, "brdExports")
  .where("projectId", "==", projectId)
```

### Uploaded Files
```typescript
collection(db, "uploadedFiles")
  .where("projectId", "==", projectId)
```

### Snippets
```typescript
collection(db, "snippets")
  .where("projectId", "==", projectId)
```

### Chat Messages
```typescript
collection(db, "chatMessages")
  .where("brdVersionId", "in", [brdVersionIds])
```

### Conflict Flags
```typescript
collection(db, "conflictFlags")
  .where("projectId", "==", projectId)
```

## Performance Considerations

### Batch Operations
- Firestore batch writes limited to 500 operations
- Large collections automatically split into multiple batches
- Batches executed in parallel for speed

### Query Optimization
- Uses indexed queries for fast lookups
- Limits 'in' queries to 10 items (Firestore limit)
- Processes large result sets in chunks

### Storage Deletion
- Lists all files in folder before deletion
- Deletes files in parallel
- Handles missing folders gracefully

## Error Handling

### Graceful Degradation
- If storage deletion fails, continues with Firestore
- If some batches fail, logs error but continues
- Non-critical errors don't block deletion

### User Feedback
- Success toast on completion
- Error toast with specific message on failure
- Loading states during operation
- Confirmation before destructive action

## Security Considerations

### Confirmation Required
- User must type exact project name
- Prevents accidental deletions
- Shows summary of data to be deleted

### Authentication
- Only authenticated users can delete
- Project ownership should be verified (future enhancement)

### Audit Trail
- Console logs track deletion progress
- Errors logged for debugging
- Consider adding deletion audit log (future enhancement)

## Testing Checklist

- [x] Delete project with no data
- [x] Delete project with BRD versions
- [x] Delete project with uploaded files
- [x] Delete project with snippets
- [x] Delete project with chat messages
- [x] Delete project with conflicts
- [x] Verify storage files deleted
- [x] Verify Firestore documents deleted
- [x] Test cancellation of deletion
- [x] Test incorrect project name confirmation
- [x] Test deletion with large datasets
- [x] Verify redirect to dashboard after deletion

## Future Enhancements

### 1. Soft Delete
- Mark project as deleted instead of removing
- Allow recovery within 30 days
- Permanent deletion after grace period

### 2. Audit Log
- Record who deleted the project
- Record when deletion occurred
- Store summary of deleted data

### 3. Background Deletion
- Move deletion to Cloud Function
- Return immediately to user
- Process deletion asynchronously
- Send email when complete

### 4. Selective Deletion
- Allow keeping BRD exports
- Option to archive instead of delete
- Export data before deletion

### 5. Permission Checks
- Verify user is project owner
- Require admin role for deletion
- Add team member approval for shared projects

### 6. Undo Functionality
- Implement soft delete first
- Add "Restore Project" feature
- Time-limited undo window

## Deployment Notes

### Prerequisites
- No new Firestore indexes required (uses existing)
- No Cloud Functions deployment needed
- Frontend-only changes

### Deployment Steps
1. Deploy frontend changes
2. Test in development environment
3. Verify deletion works correctly
4. Monitor for errors in production

### Rollback Plan
If issues occur:
1. Revert frontend changes
2. Projects already deleted cannot be recovered
3. Consider implementing soft delete first

## Known Limitations

1. **No Recovery**: Deletion is permanent and irreversible
2. **No Audit Trail**: No record of who deleted what
3. **No Permissions**: Any user can delete any project (should add ownership check)
4. **Synchronous**: Large projects may take time to delete
5. **No Progress**: User doesn't see deletion progress

## Files Modified

1. **src/services/projectService.ts** (NEW)
   - Complete project deletion service
   - Batch operations for efficiency
   - Storage file deletion

2. **src/pages/ProjectSettings.tsx** (MODIFIED)
   - Added confirmation dialog
   - Added deletion summary
   - Added loading states
   - Added project name confirmation

## Usage Example

```typescript
import { deleteProject } from "../services/projectService";

// Delete a project
try {
  await deleteProject("project-id-123");
  console.log("Project deleted successfully");
} catch (error) {
  console.error("Failed to delete project:", error);
}
```

## Monitoring

After deployment, monitor:
- Deletion success rate
- Time to complete deletion
- Storage quota changes
- User feedback on deletion flow
- Error logs for failed deletions

## Support

If users accidentally delete a project:
1. Check Firestore backups (if enabled)
2. Check Firebase Storage backups
3. Restore from backup if available
4. Consider implementing soft delete to prevent this
