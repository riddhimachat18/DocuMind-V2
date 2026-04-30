# DocuMind Deployment Guide

## Prerequisites

- Node.js 18+ installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- Google Cloud Project with billing enabled
- Google AI API key (Gemini)
- Firebase project created

---

## Initial Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd DocuMind-V2-main
```

### 2. Install Dependencies

```bash
# Frontend dependencies
npm install

# Backend dependencies
cd functions
npm install
cd ..
```

### 3. Firebase Configuration

```bash
# Login to Firebase
firebase login

# Initialize project (if not already done)
firebase init

# Select:
# - Hosting
# - Functions
# - Firestore
# - Storage
```

---

## Environment Configuration

### 1. Frontend Environment Variables

Create `.env` file in root directory:

```bash
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Get these values from Firebase Console → Project Settings → General

### 2. Backend Secrets

Set Cloud Functions secret for Gemini API:

```bash
firebase functions:secrets:set GEMINI_API_KEY
# Enter your Google AI API key when prompted
```

Get API key from: https://aistudio.google.com/app/apikey

### 3. Firestore Security Rules

Deploy security rules:

```bash
firebase deploy --only firestore:rules
```

Rules file: `firestore.rules`

### 4. Storage CORS Configuration

Enable CORS for Cloud Storage:

```bash
gsutil cors set cors.json gs://your-project.appspot.com
```

CORS file: `cors.json`

---

## Build & Deploy

### Option 1: Deploy Everything

```bash
# Build frontend
npm run build

# Deploy all services
firebase deploy
```

### Option 2: Deploy Individually

```bash
# Deploy frontend only
npm run build
firebase deploy --only hosting

# Deploy backend functions only
cd functions
npm run build
cd ..
firebase deploy --only functions

# Deploy Firestore rules only
firebase deploy --only firestore:rules

# Deploy Storage rules only
firebase deploy --only storage
```

### Option 3: Deploy Specific Function

```bash
firebase deploy --only functions:generateBrd
firebase deploy --only functions:onFileUploaded
firebase deploy --only functions:detectConflicts
```

---

## Post-Deployment Configuration

### 1. Enable Required APIs

In Google Cloud Console, enable:
- Cloud Functions API
- Cloud Build API
- Artifact Registry API
- Secret Manager API
- Cloud Storage API
- Firestore API

### 2. Set Up ChromaDB

**Option A: Cloud Run (Recommended)**

```bash
# Build Docker image
cd chroma-server
docker build -t gcr.io/your-project/chroma-server .

# Push to Container Registry
docker push gcr.io/your-project/chroma-server

# Deploy to Cloud Run
gcloud run deploy chroma-server \
  --image gcr.io/your-project/chroma-server \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

**Option B: Local Development**

```bash
# Run ChromaDB locally
docker run -p 8000:8000 chromadb/chroma
```

Update `functions/src/storeInChroma.ts` with ChromaDB URL.

### 3. Configure Authentication

In Firebase Console → Authentication:
- Enable Email/Password provider
- Enable Google provider
- Add authorized domains

### 4. Create Firestore Indexes

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

Indexes file: `firestore.indexes.json`

---

## Verification

### 1. Check Deployment Status

```bash
firebase deploy --only hosting
# Note the hosting URL

firebase functions:list
# Verify all functions are deployed
```

### 2. Test Frontend

Visit your hosting URL: `https://your-project.web.app`

- Sign up with email/password
- Create a project
- Upload a test file
- Generate BRD
- Verify all features work

### 3. Check Function Logs

```bash
firebase functions:log
# Or in Firebase Console → Functions → Logs
```

### 4. Monitor Firestore

Firebase Console → Firestore Database
- Verify collections exist: projects, brdVersions, snippets
- Check document structure

---

## Troubleshooting

### Issue: Functions Timeout

**Solution**: Increase timeout in `firebase.json`:

```json
{
  "functions": {
    "timeoutSeconds": 540,
    "memory": "512MB"
  }
}
```

### Issue: CORS Errors

**Solution**: Update `cors.json` and redeploy:

```bash
gsutil cors set cors.json gs://your-project.appspot.com
```

### Issue: API Key Not Found

**Solution**: Verify secret is set:

```bash
firebase functions:secrets:access GEMINI_API_KEY
```

If not set:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

### Issue: Firestore Permission Denied

**Solution**: Check security rules in `firestore.rules`:

```javascript
match /projects/{projectId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
}
```

### Issue: ChromaDB Connection Failed

**Solution**: Verify ChromaDB URL in `functions/src/storeInChroma.ts`:

```typescript
const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";
```

### Issue: Build Fails

**Solution**: Clear cache and rebuild:

```bash
# Frontend
rm -rf node_modules dist
npm install
npm run build

# Backend
cd functions
rm -rf node_modules lib
npm install
npm run build
```

---

## Performance Optimization

### 1. Enable Caching

In `firebase.json`:

```json
{
  "hosting": {
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|gif|png|svg|webp)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

### 2. Optimize Functions

- Use appropriate memory allocation (512 MiB for most)
- Set reasonable timeouts (540s for long operations)
- Enable concurrency for parallel processing

### 3. Firestore Optimization

- Create composite indexes for complex queries
- Use pagination for large result sets
- Implement caching for frequently accessed data

---

## Monitoring & Maintenance

### 1. Set Up Alerts

Firebase Console → Alerts:
- Function errors
- High latency
- Quota exceeded

### 2. Monitor Costs

Google Cloud Console → Billing:
- Set budget alerts
- Monitor API usage
- Track function invocations

### 3. Regular Updates

```bash
# Update dependencies
npm update
cd functions && npm update && cd ..

# Rebuild and redeploy
npm run build
firebase deploy
```

---

## Rollback Procedure

### Rollback Hosting

```bash
firebase hosting:rollback
```

### Rollback Functions

```bash
# List versions
gcloud functions list --project your-project

# Rollback specific function
gcloud functions deploy generateBrd \
  --source previous-version-path \
  --runtime nodejs18
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Secrets set (GEMINI_API_KEY)
- [ ] Firestore rules deployed
- [ ] Storage CORS configured
- [ ] Authentication providers enabled
- [ ] ChromaDB deployed and accessible
- [ ] All functions deployed successfully
- [ ] Frontend built and deployed
- [ ] Indexes created
- [ ] Test user account created
- [ ] End-to-end test passed
- [ ] Monitoring alerts configured
- [ ] Budget alerts set
- [ ] Documentation updated

---

## Support

For deployment issues:
1. Check Firebase Console logs
2. Review function execution logs
3. Verify environment configuration
4. Check API quotas and limits
5. Contact development team

---

**For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md)**
