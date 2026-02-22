# Project Deletion Flow Diagram

## User Interface Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Project Settings Page                    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              DANGER ZONE                            │    │
│  │                                                     │    │
│  │  Delete project                          [Delete]  │    │
│  │  Permanently delete this project...                │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ User clicks Delete
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Confirmation Modal                          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Delete Project                                     │    │
│  │  This action cannot be undone.                      │    │
│  ├────────────────────────────────────────────────────┤    │
│  │  The following data will be deleted:                │    │
│  │                                                      │    │
│  │  BRD Versions:        5                             │    │
│  │  Uploaded Files:      12                            │    │
│  │  Snippets:           342                            │    │
│  │  Chat Messages:       28                            │    │
│  │  Conflict Flags:       3                            │    │
│  │                                                      │    │
│  │  Type "Project Name" to confirm:                    │    │
│  │  [_________________________________]                │    │
│  │                                                      │    │
│  │  ⚠ Warning: This will delete all project data      │    │
│  ├────────────────────────────────────────────────────┤    │
│  │                    [Cancel] [Delete Project]        │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ User confirms
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Deletion Process                          │
│                                                              │
│  [████████████████████░░░░░░░░░░] Deleting...              │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Success
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Dashboard                               │
│                                                              │
│  ✓ Project deleted successfully                             │
│                                                              │
│  Projects (2 active projects)                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Other Project 1                                    │    │
│  │  Other Project 2                                    │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Backend Deletion Flow

```
deleteProject(projectId)
    │
    ├─► Step 1: Delete BRD Versions
    │   └─► Query: brdVersions where projectId == projectId
    │       └─► Batch delete (500 per batch)
    │
    ├─► Step 2: Delete BRD Exports
    │   └─► Query: brdExports where projectId == projectId
    │       └─► Batch delete (500 per batch)
    │
    ├─► Step 3: Delete Uploaded Files
    │   └─► Query: uploadedFiles where projectId == projectId
    │       └─► Batch delete (500 per batch)
    │
    ├─► Step 4: Delete Snippets
    │   └─► Query: snippets where projectId == projectId
    │       └─► Batch delete (500 per batch)
    │
    ├─► Step 5: Delete Chat Messages
    │   ├─► Get all BRD version IDs
    │   └─► Query: chatMessages where brdVersionId in [ids]
    │       └─► Batch delete (500 per batch, 10 IDs per query)
    │
    ├─► Step 6: Delete Conflict Flags
    │   └─► Query: conflictFlags where projectId == projectId
    │       └─► Batch delete (500 per batch)
    │
    ├─► Step 7: Delete Storage Files
    │   ├─► List files in transcripts/{projectId}/
    │   ├─► List files in brd-version/{projectId}/
    │   ├─► List files in uploads/{projectId}/
    │   └─► Delete all files in parallel
    │
    └─► Step 8: Delete Project Document
        └─► Delete: projects/{projectId}
```

## Data Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                         PROJECT                              │
│                      (projectId)                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ References
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ BRD Versions │    │ Uploaded     │    │   Snippets   │
│              │    │   Files      │    │              │
│ projectId    │    │ projectId    │    │ projectId    │
└──────────────┘    └──────────────┘    └──────────────┘
        │                                        │
        │ References                             │
        │                                        │
        ▼                                        ▼
┌──────────────┐                        ┌──────────────┐
│ Chat         │                        │  Conflict    │
│ Messages     │                        │   Flags      │
│              │                        │              │
│ brdVersionId │                        │ projectId    │
└──────────────┘                        └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    STORAGE STRUCTURE                         │
│                                                              │
│  transcripts/                                                │
│    └─ {projectId}/                                          │
│         ├─ file1.txt                                        │
│         └─ file2.pdf                                        │
│                                                              │
│  brd-version/                                                │
│    └─ {projectId}/                                          │
│         ├─ v1.0.json                                        │
│         └─ v2.0.json                                        │
│                                                              │
│  uploads/                                                    │
│    └─ {projectId}/                                          │
│         └─ document.docx                                    │
└─────────────────────────────────────────────────────────────┘
```

## State Management Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      AppContext                              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Firestore Real-time Listener                      │    │
│  │                                                     │    │
│  │  onSnapshot(                                        │    │
│  │    collection(db, "projects"),                      │    │
│  │    where("userId", "==", currentUser.uid)           │    │
│  │  )                                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          │ Listens for changes               │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  projects: Project[]                                │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Provides to components
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ProjectSettings                           │
│                                                              │
│  const { projects } = useApp()                              │
│                                                              │
│  When project deleted from Firestore:                       │
│    1. Firestore listener detects change                     │
│    2. AppContext updates projects array                     │
│    3. Component re-renders automatically                    │
│    4. Deleted project no longer in list                     │
└─────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
deleteProject(projectId)
    │
    ├─► Try: Delete BRD Versions
    │   ├─► Success → Continue
    │   └─► Error → Log & Continue
    │
    ├─► Try: Delete BRD Exports
    │   ├─► Success → Continue
    │   └─► Error → Log & Continue
    │
    ├─► Try: Delete Uploaded Files
    │   ├─► Success → Continue
    │   └─► Error → Log & Continue
    │
    ├─► Try: Delete Snippets
    │   ├─► Success → Continue
    │   └─► Error → Log & Continue
    │
    ├─► Try: Delete Chat Messages
    │   ├─► Success → Continue
    │   └─► Error → Log & Continue
    │
    ├─► Try: Delete Conflict Flags
    │   ├─► Success → Continue
    │   └─► Error → Log & Continue
    │
    ├─► Try: Delete Storage Files
    │   ├─► Success → Continue
    │   └─► Error → Log & Continue (non-critical)
    │
    └─► Try: Delete Project Document
        ├─► Success → toast.success() → navigate("/dashboard")
        └─► Error → toast.error() → throw error
```

## Batch Processing Flow

```
Collection with 1,234 documents
    │
    ├─► Batch 1: Documents 1-500
    │   └─► writeBatch.commit()
    │
    ├─► Batch 2: Documents 501-1000
    │   └─► writeBatch.commit()
    │
    └─► Batch 3: Documents 1001-1234
        └─► writeBatch.commit()

All batches execute in parallel using Promise.all()
```

## Timeline Visualization

```
Time →

User Action:
├─ Click Delete (t=0s)
├─ Review Summary (t=1s)
├─ Type Project Name (t=3s)
└─ Confirm Delete (t=5s)

Backend Processing:
├─ Delete BRD Versions (t=5.0s - t=5.2s)
├─ Delete BRD Exports (t=5.2s - t=5.3s)
├─ Delete Uploaded Files (t=5.3s - t=5.4s)
├─ Delete Snippets (t=5.4s - t=6.5s) ← Largest collection
├─ Delete Chat Messages (t=6.5s - t=6.7s)
├─ Delete Conflict Flags (t=6.7s - t=6.8s)
├─ Delete Storage Files (t=6.8s - t=7.2s)
└─ Delete Project (t=7.2s - t=7.3s)

UI Updates:
├─ Show Loading (t=5s)
├─ Toast Success (t=7.3s)
├─ Navigate to Dashboard (t=7.3s)
└─ Projects List Updates (t=7.4s) ← Real-time listener
```

## Security Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Implementation                     │
│                                                              │
│  User → Click Delete → Confirm → Delete                     │
│                                                              │
│  ⚠ No ownership check                                       │
│  ⚠ No role verification                                     │
│  ⚠ No audit logging                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Recommended Implementation                   │
│                                                              │
│  User → Click Delete                                         │
│    ↓                                                         │
│  Check Ownership                                             │
│    ↓                                                         │
│  Check Role (Admin/Owner)                                    │
│    ↓                                                         │
│  Confirm → Delete                                            │
│    ↓                                                         │
│  Log Audit Trail                                             │
└─────────────────────────────────────────────────────────────┘
```
