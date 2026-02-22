# BRD Versioning System Implementation

## Overview
Implemented a proper versioning system for BRD (Business Requirements Document) generation, replacing hardcoded version numbers with dynamic versioning starting from v1.0, with full history tracking.

## Changes Made

### 1. Backend - Cloud Function (`functions/src/generateBrd.ts`)
- Added automatic version number calculation based on existing versions
- Version starts at v1.0 for first BRD generation
- Each new generation increments by 1.0 (v1.0 → v2.0 → v3.0)
- Added version fields to Firestore document:
  - `version`: String format (e.g., "v1.0")
  - `versionNumber`: Numeric format (e.g., 1.0)
  - `createdBy`: User ID who generated the BRD
  - `changeLog`: Description of changes (e.g., "Generated v1.0")
- Returns version information in the response

### 2. Frontend - BRD Generation Page (`src/pages/CreateBRDVersion.tsx`)
- Removed hardcoded "v4.0" reference
- Added state to track current version number
- Displays dynamic version during generation (e.g., "Generating BRD v1.0")
- Captures version from backend response
- Falls back to Firestore query if function times out

### 3. Frontend - BRD Edit Page (`src/pages/BRDEdit.tsx`)
- Removed hardcoded "v4.0" references
- Added state to track current version
- Loads version from Firestore `brdVersions` document
- Displays dynamic version in:
  - Page header breadcrumb
  - Document title area

### 4. Frontend - BRD History Page (`src/pages/BRDHistory.tsx`)
- Complete rewrite to use real Firestore data instead of mock data
- Fetches all BRD versions from Firestore
- Displays versions in chronological order (newest first)
- Shows version metadata:
  - Version number (v1.0, v2.0, etc.)
  - Creation timestamp
  - Created by user
  - Quality score (if available)
  - Status (draft, approved, archived)
  - Change log
- Highlights current/latest version
- Empty state with "Generate first BRD" button

### 5. Frontend - BRD Data Hook (`src/hooks/useBRDData.ts`)
- Fixed version fetching to use actual `version` field from Firestore
- Changed ordering from `createdAt` to `versionNumber` for proper sorting
- Displays version as stored in database (e.g., "v1.0")

## Database Schema

### `brdVersions` Collection
Each document contains:
```typescript
{
  projectId: string;           // Reference to parent project
  version: string;             // Display version (e.g., "v1.0")
  versionNumber: number;       // Numeric version for sorting (e.g., 1.0)
  sections: {                  // BRD content sections
    executiveSummary?: string;
    stakeholderRegister?: string;
    functionalReqs?: string;
    nfrReqs?: string;
    assumptions?: string;
    successMetrics?: string;
  };
  citations: object;           // Source citations for each section
  createdAt: Timestamp;        // When version was created
  createdBy: string;           // User ID who created it
  status: string;              // "draft" | "approved" | "archived"
  qualityScore: object | null; // Quality metrics
  openConflictCount: number;   // Number of unresolved conflicts
  changeLog: string;           // Description of changes
}
```

### `projects` Collection
Updated to track current version:
```typescript
{
  currentBrdVersionId: string; // ID of the active BRD version
  // ... other project fields
}
```

## Version Numbering Logic

1. **First BRD Generation**: Starts at v1.0
2. **Subsequent Generations**: Increments by 1.0
   - Query existing versions ordered by `versionNumber` DESC
   - Take the highest version number
   - Add 1.0 to get next version
   - Example: v1.0 → v2.0 → v3.0

3. **Version Format**: 
   - Stored as number: `1.0`, `2.0`, `3.0`
   - Displayed as string: `v1.0`, `v2.0`, `v3.0`

## User Experience Flow

1. **Generate First BRD**:
   - User clicks "Generate BRD" → Creates v1.0
   - Progress shows "Generating BRD v1.0"
   - Redirects to edit page showing "Draft Edit — v1.0"

2. **Generate Subsequent BRDs**:
   - User clicks "New version" → Creates v2.0
   - Progress shows "Generating BRD v2.0"
   - Previous versions remain accessible in history

3. **View History**:
   - Navigate to "Version History"
   - See all versions in timeline format
   - Latest version highlighted with "Latest" badge
   - Each version shows: number, date, creator, quality score, status

4. **Version Persistence**:
   - All versions stored permanently in Firestore
   - Can view any historical version
   - Current version tracked at project level

## Benefits

1. **Accurate Tracking**: No more hardcoded versions
2. **History**: Complete audit trail of all BRD generations
3. **Scalability**: Supports unlimited versions per project
4. **Consistency**: Version numbers synchronized across all pages
5. **User Clarity**: Always know which version you're viewing/editing

## Future Enhancements

Potential improvements for the versioning system:

1. **Minor Versions**: Support v1.1, v1.2 for small edits
2. **Version Comparison**: Diff view between versions
3. **Version Restore**: Rollback to previous version
4. **Version Branching**: Create variants from existing versions
5. **Version Approval**: Workflow for approving versions
6. **Version Export**: Export specific version to PDF with version number
7. **Version Comments**: Add notes/comments to each version
8. **Version Tags**: Label versions (e.g., "Initial Draft", "Client Review")

## Testing Checklist

- [x] First BRD generation creates v1.0
- [x] Second BRD generation creates v2.0
- [x] Version displayed correctly during generation
- [x] Version displayed correctly in edit page
- [x] Version history shows all versions
- [x] Latest version highlighted in history
- [x] Version persisted to Firestore correctly
- [x] No hardcoded version references remain

## Files Modified

1. `functions/src/generateBrd.ts` - Backend version logic
2. `src/pages/CreateBRDVersion.tsx` - Generation UI
3. `src/pages/BRDEdit.tsx` - Edit page display
4. `src/pages/BRDHistory.tsx` - History page rewrite
5. `src/hooks/useBRDData.ts` - Data fetching hook

## Deployment Notes

1. Deploy cloud functions: `npm run deploy:functions`
2. No database migration needed (backward compatible)
3. Existing BRD versions without version field will default to v1.0
4. New generations will automatically get proper version numbers
