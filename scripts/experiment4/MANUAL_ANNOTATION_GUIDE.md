# Manual Annotation Guide - Experiment 4

## Overview
You will annotate **409 requirement pairs** to identify conflicts as a **single annotator**.

## File to Annotate
`conflict_annotation_sample.csv`

## CSV Structure
The file has these columns:
- `doc_id`, `req_i_idx`, `req_j_idx` - Identifiers
- `req_i`, `req_j` - The two requirements to compare
- `cosine_sim` - Semantic similarity score
- `final_verdict` - **YOU FILL THIS** (YES/NO)
- `conflict_type` - **YOU FILL THIS** (CONTRADICTION/OVERLAP/IMPLICIT/NONE)
- `notes` - **OPTIONAL** (your comments)

## Annotation Columns

### 1. `final_verdict` (REQUIRED)
- **YES** - Requirements conflict
- **NO** - Requirements do not conflict

### 2. `conflict_type` (REQUIRED)
- **CONTRADICTION** - Mutually exclusive requirements
- **OVERLAP** - Same functionality, different wording (redundant)
- **IMPLICIT** - Logically incompatible when combined
- **NONE** - No conflict (use when final_verdict = NO)

### 3. `notes` (OPTIONAL)
- Add any comments or uncertainties

## Conflict Types Explained

### CONTRADICTION
Requirements that cannot both be satisfied.

**Examples:**
- "System shall use MySQL database" ↔ "System shall use PostgreSQL database"
- "System shall support Windows only" ↔ "System shall support Linux only"
- "Response time shall be < 100ms" ↔ "Response time shall be > 500ms"

### OVERLAP (Redundancy)
Requirements describing the same functionality differently.

**Examples:**
- "User shall login with credentials" ↔ "User shall authenticate using username and password"
- "System shall store data persistently" ↔ "System shall save information to database"
- "Application must validate input" ↔ "System shall check user input for correctness"

### IMPLICIT CONFLICT
Requirements that create logical impossibility when combined.

**Examples:**
- "System shall be stateless" ↔ "System shall remember user preferences"
- "System shall process requests synchronously" ↔ "System shall handle 10000 concurrent users"
- "System shall have zero latency" ↔ "System shall use remote database"

### NONE
Requirements are compatible and distinct.

**Examples:**
- "System shall support login" ↔ "System shall support logout" (complementary)
- "UI shall be responsive" ↔ "Database shall be encrypted" (different concerns)
- "System shall log errors" ↔ "System shall send email notifications" (compatible)

## Annotation Process

### Step 1: Open the File
Open `conflict_annotation_sample.csv` in Excel, Google Sheets, or any CSV editor.

### Step 2: For Each Row (409 pairs)
1. Read `req_i` (Requirement A)
2. Read `req_j` (Requirement B)
3. Determine if they conflict
4. Fill in `final_verdict`: **YES** or **NO**
5. Fill in `conflict_type`:
   - If YES → **CONTRADICTION**, **OVERLAP**, or **IMPLICIT**
   - If NO → **NONE**
6. Optionally add `notes` for uncertain cases

### Step 3: Save
**Save the file as `conflict_annotation_gold.csv`** (same directory)

## Tips for Accurate Annotation

✅ **DO:**
- Read both requirements carefully
- Consider the core functionality/constraint
- Think about whether both can be satisfied simultaneously
- Mark OVERLAP if they're saying the same thing differently
- Be thorough - real conflicts exist

❌ **DON'T:**
- Rush through annotations
- Assume no conflicts exist
- Confuse stricter requirements with conflicts (e.g., "<100ms" is stricter than "<500ms" but not conflicting)
- Mark compatible requirements as conflicts

## Time Estimate
- **~3-4 hours** for 409 pairs
- **~30 seconds per pair** average

## Quality Checks
- Ensure all `final_verdict` fields are filled (YES/NO)
- Ensure all `conflict_type` fields are filled
- Check for consistency in similar pairs

## After Annotation
1. Save as `conflict_annotation_gold.csv`
2. Run: `python scripts/experiment4/3_run_conflict_detector_on_sample.py`
3. Run: `python scripts/experiment4/4_compute_metrics.py`
4. Review results in `experiment4_report.txt`

## Questions?
- If uncertain, mark as NO (conservative approach)
- Add notes for borderline cases
- Focus on clear, obvious conflicts first
