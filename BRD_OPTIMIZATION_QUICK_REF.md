# BRD Optimization - Quick Reference

## What Was Optimized

### 🎯 Conciseness (16 pages → 5-6 pages)
- Reduced snippets: 15 → 8 per section
- Token limit: 800 per section
- Temperature: 0.3 (focused output)
- Explicit length targets for each section

### 📊 Evidence View (Left Panel)
- Click sentence → See source snippets
- Shows: filename, classification, speaker, full text
- Numbered badges for multiple sources
- Real-time updates

### 🤖 AI Quality Auditor (Right Panel)
- Auto-starts on page load
- Typing indicator
- Real-time quality score
- Interactive chat

### 📝 BRD Content (Center Panel)
- Evidence badges on sentences
- Double-click to edit
- Click to view sources
- Hover effects

## Deploy Commands

```bash
# Backend only
deploy-functions.bat

# Frontend only
npm run build
firebase deploy --only hosting

# Everything
firebase deploy
```

## File Changes

### Backend
- `functions/src/generateBrd.ts` - Optimized generation + evidence tracking

### Frontend
- `src/pages/BRDEdit.tsx` - Restructured UI with Evidence View

## Key Features

1. **Evidence Traceability:** Every sentence links to source snippets
2. **Auto AI Review:** Quality Auditor starts automatically
3. **Real-time Updates:** Quality score and chat sync live
4. **Concise Output:** 5-6 pages instead of 10-12 pages
5. **Better UX:** Loading states, typing indicators, smooth animations

## Testing Checklist

- [ ] Generate BRD (should be 5-6 pages)
- [ ] Click sentence (Evidence View updates)
- [ ] AI auto-starts (check right panel)
- [ ] Chat with AI (verify responses)
- [ ] Edit sentence (double-click)
- [ ] Export PDF (verify format)

## Expected Metrics

| Metric | Before | After |
|--------|--------|-------|
| Generation Time | 60-90s | 30-60s |
| BRD Length (16 raw pages) | 10-12 pages | 5-6 pages |
| Snippets per Section | 15 | 8 |
| Token Limit | None | 800 |
| Evidence Tracking | No | Yes |
| AI Auto-start | No | Yes |

## Troubleshooting

**BRD still too long?**
- Check `maxOutputTokens: 800` in generateBrd.ts
- Verify `nResults: 8` in retrieveForSection call

**Evidence not showing?**
- Check `sentenceEvidence` field in Firestore
- Verify citations are parsed correctly

**AI not starting?**
- Check browser console for errors
- Verify `onChatMessage` function deployed
- Check Firebase Functions logs

## Support

See detailed docs:
- `BRD_OPTIMIZATION_COMPLETE.md` - Full implementation details
- `BRD_UI_STRUCTURE.md` - UI layout and interactions
- `DEPLOY_BRD_OPTIMIZATION.md` - Deployment guide
