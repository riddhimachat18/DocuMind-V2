# Quick Test Guide - Ultra-Concise BRD

## ✅ Deployment Complete
All changes deployed to Firebase successfully.

## Test Checklist

### 1. Test Ultra-Concise Generation (5 min)

**Steps:**
1. Go to project → Generate BRD
2. Select files (at least 16 pages of content)
3. Click "Generate BRD"
4. Watch the progress stages

**Expected Results:**
- ✅ Generation completes in 25-45 seconds (not 60-90s)
- ✅ "AI Auditor review" stage appears
- ✅ Quality score displays during generation
- ✅ Output is 3-4 pages (not 10-12 pages)

**Check Points:**
```
Stage 1: Ingesting sources ✓
Stage 2: Filtering noise ✓
Stage 3: Synthesizing requirements ✓
Stage 4: Quality check ✓ ← Quality score appears here
Stage 5: AI Auditor review ← NEW! Watch for this
Stage 6: Done ✓
```

### 2. Test Quality Score Display (2 min)

**During Generation:**
- ✅ Quality score box appears after "Quality check" stage
- ✅ Shows total score (e.g., 85/100)
- ✅ Shows three bars: Completeness, Clarity, Consistency
- ✅ Bars animate/fill based on scores

**Visual Check:**
```
┌─────────────────────────┐
│ Quality Score   85/100  │
│ Completeness: 40 ████   │
│ Clarity: 20      ████   │
│ Consistency: 25  ███    │
└─────────────────────────┘
```

### 3. Test AI Auditor Stage (2 min)

**During Generation:**
- ✅ "AI Auditor review" stage appears
- ✅ Shows message: "AI Auditor analyzing BRD quality..."
- ✅ Blue pulsing dot indicator
- ✅ Stage completes before redirect

**Visual Check:**
```
┌─────────────────────────────┐
│ • AI Auditor                │
│ AI Auditor analyzing BRD... │
└─────────────────────────────┘
```

### 4. Test BRD Content Format (5 min)

**After Redirect to Edit Page:**

**Executive Summary:**
- ✅ 100-120 words (not 300+)
- ✅ 3-4 objectives (numbered)
- ✅ One paragraph overview
- ✅ One sentence scope
- ✅ One sentence outcome

**Functional Requirements:**
- ✅ 6-8 requirements (not 12-15)
- ✅ Each requirement is ONE line
- ✅ Format: "FR-01: System shall [action]. [SOURCE:N]"
- ✅ No verbose descriptions
- ✅ Measurable and specific

**Other Sections:**
- ✅ Stakeholder Register: 4-6 entries
- ✅ Non-Functional Requirements: 4-6 items
- ✅ Assumptions: 3-4 items
- ✅ Success Metrics: 3-5 metrics

### 5. Test Evidence View (3 min)

**In Edit Page:**
1. Click any sentence in BRD
2. Check left panel (Evidence View)

**Expected:**
- ✅ Evidence View updates immediately
- ✅ Shows selected sentence at top
- ✅ Lists all source snippets
- ✅ Each source shows:
  - Numbered badge (1, 2, 3...)
  - Filename
  - Classification badge (REQUIREMENT/DECISION/CONSTRAINT)
  - Speaker name (if available)
  - Full snippet text

**Visual Check:**
```
┌──────────────────────┐
│ EVIDENCE VIEW        │
│ Selected: "System    │
│ shall authenticate..." │
│                      │
│ [1] meeting.txt      │
│ REQUIREMENT          │
│ "Users must be       │
│ authenticated..."    │
│                      │
│ [2] email.txt        │
│ DECISION             │
│ "We decided to use   │
│ MFA..."              │
└──────────────────────┘
```

### 6. Test AI Auditor Chat (3 min)

**In Edit Page:**
1. Check right panel (Quality Auditor)
2. Look for existing messages

**Expected:**
- ✅ Chat already has messages (auto-initialized)
- ✅ First message from AI Auditor
- ✅ Quality score ring displays
- ✅ Can type and send messages
- ✅ AI responds within 3-5 seconds
- ✅ Typing indicator shows while AI responds

**Test Interaction:**
1. Type: "What's the most critical issue?"
2. Press Enter or click →
3. Watch for typing indicator (animated dots)
4. AI responds with specific feedback

### 7. Test Evidence Badges (2 min)

**In BRD Content:**
- ✅ Sentences with sources show badge (e.g., "[3]")
- ✅ Badge shows number of sources
- ✅ Badge has icon and count
- ✅ Clicking sentence shows evidence in left panel

**Visual Check:**
```
FR-01: System shall authenticate users. [📄 3]
                                         ↑
                                    Evidence badge
```

### 8. Test Editing (2 min)

**In BRD Content:**
1. Double-click any sentence
2. Edit text
3. Click Save

**Expected:**
- ✅ Inline editor appears
- ✅ Save/Cancel buttons show
- ✅ Changes persist after save
- ✅ Evidence still linked after edit

## Quick Verification Script

Run through this in 10 minutes:

1. **Generate BRD** (3 min)
   - Start generation
   - Watch for 5 stages
   - Note quality score appears
   - Note AI Auditor stage

2. **Check Output** (3 min)
   - Count pages (should be 3-4)
   - Check Executive Summary length (~100 words)
   - Count Functional Requirements (6-8)
   - Verify one-line format

3. **Test Evidence** (2 min)
   - Click 3 different sentences
   - Verify evidence shows each time
   - Check source metadata displays

4. **Test AI Chat** (2 min)
   - Verify chat has initial message
   - Send one test message
   - Verify AI responds

## Success Criteria

✅ Generation: 25-45 seconds
✅ Output: 3-4 pages
✅ Quality score: Visible during generation
✅ AI Auditor: Stage appears and completes
✅ Evidence: Shows for all sentences
✅ Chat: Auto-initialized and responsive
✅ Format: Point-to-point, one line per item

## Common Issues & Fixes

**Issue: BRD still too long**
- Check: Verify functions deployed (firebase deploy --only functions)
- Check: Look for "Successful update operation" in deploy log

**Issue: Quality score not showing**
- Check: Wait for "Quality check" stage to complete
- Check: Browser console for errors

**Issue: AI Auditor stage skipped**
- Check: onChatMessage function deployed
- Check: Firebase Functions logs for errors

**Issue: Evidence not showing**
- Check: sentenceEvidence field in Firestore
- Check: Click sentence (don't just hover)

**Issue: Chat not auto-starting**
- Check: Refresh page
- Check: Firebase Functions logs
- Manually send first message if needed

## Performance Benchmarks

| Test | Target | Acceptable | Fail |
|------|--------|------------|------|
| Generation Time | 25-45s | 45-60s | >60s |
| BRD Length (16 pages) | 3-4 pages | 4-5 pages | >5 pages |
| Executive Summary | 100-120 words | 120-150 words | >150 words |
| Requirements/Section | 6-8 | 8-10 | >10 |
| Evidence Load Time | <1s | 1-2s | >2s |
| AI Response Time | 3-5s | 5-8s | >8s |

## Report Issues

If any test fails:
1. Check browser console for errors
2. Check Firebase Functions logs
3. Verify deployment completed successfully
4. Check Firestore data structure
5. Try clearing browser cache

## Next Steps After Testing

1. ✅ Verify all tests pass
2. ✅ Test with real project data
3. ✅ Export PDF and check formatting
4. ✅ Test with different file sizes
5. ✅ Monitor performance over time
