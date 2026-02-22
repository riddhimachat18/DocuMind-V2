# DocuMind — Teammate Setup Guide

Complete CLI setup from scratch. Follow every step in order.

---

## Prerequisites

Make sure you have these installed before starting:

- **Node.js v22+** — https://nodejs.org
- **Python 3.11+** — https://python.org
- **Git** — https://git-scm.com
- **Google Cloud CLI** — https://cloud.google.com/sdk/docs/install

Verify:
```powershell
node --version
python --version
git --version
gcloud --version
```

---

## Step 1: Clone the Repo

```powershell
git clone <your-repo-url>
cd documind-clarity-main
```

---

## Step 2: Install Firebase CLI

```powershell
npm install -g firebase-tools
npm install -g tsx
firebase login
```

When prompted, log in with the **same Google account** as the Firebase project.

Verify you can see the project:
```powershell
firebase projects:list
```

You should see `documind-6c687` in the list.

---

## Step 3: Initialize Firebase in Project Root

```powershell
firebase use documind-6c687
```

If `firebase.json` already exists in the repo, skip `firebase init`. If it doesn't exist:

```powershell
firebase init
```

Select with spacebar:
- ✅ Functions
- ✅ Firestore
- ✅ Storage

When asked:
- Use existing project → `documind-6c687`
- Language → **TypeScript**
- ESLint → **Yes**
- Install dependencies → **Yes**
- Firestore rules file → press Enter (keep default)
- Storage rules file → press Enter (keep default)

---

## Step 4: Fix ESLint & Predeploy Scripts

Open `functions/package.json` and change the lint script:
```json
"scripts": {
  "lint": "eslint .",
  "build": "tsc"
}
```

Open `firebase.json` and change predeploy to remove lint:
```json
"predeploy": [
  "npm --prefix \"$RESOURCE_DIR\" run build"
]
```

---

## Step 5: Install Functions Dependencies

```powershell
cd functions
npm install @google/generative-ai chromadb @google-cloud/storage firebase-admin
cd ..
```

---

## Step 6: Install Root-Level Dependencies

```powershell
cd C:\Users\<yourname>\documind-clarity-main
npm install csv-parse mailparser @types/mailparser firebase-admin
```

---

## Step 7: Install Python Dependencies

```powershell
pip install datasets chromadb
```

---

## Step 8: Get Your Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Click **Create API key**
3. Select the `documind-6c687` project
4. Copy the key

Test it works:
```powershell
$key = "YOUR_KEY_HERE"
Invoke-WebRequest `
  -Uri "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$key" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"contents":[{"parts":[{"text":"say hello"}]}]}' `
  -UseBasicParsing
```

Should return `200` and `"Hello!"`.

---

## Step 9: Set Firebase Secrets

```powershell
firebase functions:secrets:set GEMINI_API_KEY
# Paste your key when prompted — no quotes
```

Set the key in `.env.local` for local use:
```powershell
[System.IO.File]::WriteAllText(
  "$PWD\functions\.env.local",
  "GEMINI_API_KEY=YOUR_KEY_HERE"
)
```

Verify:
```powershell
Get-Content functions\.env.local
```

---

## Step 10: Set Firestore Rules

Open `firestore.rules` and paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Deploy:
```powershell
firebase deploy --only firestore:rules
```

---

## Step 11: Set Storage Rules

Open `storage.rules` and paste:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{projectId}/{filename} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Deploy:
```powershell
firebase deploy --only storage
```

---

## Step 12: Update tsconfig.json in Functions

Open `functions/tsconfig.json` and make sure it has:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2018"
  },
  "compileOnSave": true,
  "include": ["src"]
}
```

The critical line is `"target": "es2018"` — without this the regex flags in the chat function will fail.

---

## Step 13: Create All Function Files

Create these files in `functions/src/`:

```powershell
New-Item functions/src/classifySnippet.ts
New-Item functions/src/embedSnippet.ts
New-Item functions/src/storeInChroma.ts
New-Item functions/src/generateBrd.ts
New-Item functions/src/detectConflicts.ts
New-Item functions/src/scoreQuality.ts
New-Item functions/src/onChatMessage.ts
New-Item functions/src/onFileUploaded.ts
```

Paste the code from the codebase into each file. Then update `functions/src/index.ts`:

```typescript
export { classifySnippet } from "./classifySnippet";
export { generateBrd } from "./generateBrd";
export { detectConflicts } from "./detectConflicts";
export { onConflictResolved } from "./scoreQuality";
export { onChatMessage } from "./onChatMessage";
export { onFileUploaded } from "./onFileUploaded";
```

---

## Step 14: Build and Deploy Functions

```powershell
cd functions
npm run build
cd ..
firebase deploy --only functions
```

If `onConflictResolved` fails with Eventarc permissions error, wait 5 minutes and retry. If still failing:

```powershell
$PROJECT_NUMBER = $(gcloud projects describe documind-6c687 --format="value(projectNumber)")
gcloud projects add-iam-policy-binding documind-6c687 `
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-eventarc.iam.gserviceaccount.com" `
  --role="roles/eventarc.serviceAgent"
```

Then retry deploy.

---

## Step 15: Prepare Data Folders

```powershell
New-Item -ItemType Directory -Name data
New-Item -ItemType Directory -Name scripts
```

Download the **Enron Email Dataset** from:
https://www.kaggle.com/datasets/wcukierski/enron-email-dataset

Save the file as: `data/emails.csv`

> ⚠️ The file is 1.7GB. Don't try to process all of it — the script already limits to the first 5,000 rows.

---

## Step 16: Create Script Files

```powershell
New-Item scripts/ingestEnron.ts
New-Item scripts/downloadAMI.py
New-Item scripts/seedDemoProject.ts
```

Paste the code from the codebase into each file.

---

## Step 17: Run Enron Preprocessing

```powershell
tsx scripts/ingestEnron.ts
```

Expected output:
```
Saved 150-400 relevant emails
```

This creates `data/enron-filtered.json`.

---

## Step 18: Run AMI Preprocessing

```powershell
cd scripts
python downloadAMI.py
cd ..
```

Expected output:
```
Saved ~1000+ utterances
```

This creates `data/ami.json`.

---

## Step 19: Get Service Account Key

1. Go to Firebase console → Project Settings → Service accounts
2. Click **Generate new private key**
3. Choose **Node.js**
4. Save the JSON file to your project root
5. Rename it to something simple like `serviceAccount.json`

> ⚠️ Never commit this file to Git. Add it to `.gitignore`:
```powershell
Add-Content .gitignore "`nserviceAccount.json"
```

---

## Step 20: Seed Firestore with Demo Data

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\<yourname>\documind-clarity-main\serviceAccount.json"
tsx scripts/seedDemoProject.ts
```

Expected output:
```
Seeded X snippets
```

Verify in Firebase console → Firestore → `snippets` collection. You should see documents with `source`, `rawText`, `classification` fields.

---

## Step 21: Set Up ChromaDB Locally

```powershell
pip install chromadb
```

Start ChromaDB in a **separate terminal** (keep it running):
```powershell
chroma run --host localhost --port 8000
```

---

## Step 22: Deploy ChromaDB to Cloud Run (for production)

```powershell
New-Item -ItemType Directory -Name chroma-server
New-Item chroma-server/Dockerfile
```

Paste into `chroma-server/Dockerfile`:
```dockerfile
FROM python:3.11-slim
RUN pip install chromadb
CMD ["chroma", "run", "--host", "0.0.0.0", "--port", "8080"]
```

Deploy:
```powershell
cd chroma-server
gcloud run deploy chroma-server `
  --source . `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated
cd ..
```

Note the URL it gives you (looks like `https://chroma-server-xxxx-uc.a.run.app`).

Set it as a secret:
```powershell
firebase functions:secrets:set CHROMA_URL
# Paste the Cloud Run URL when prompted
```

---

## Step 23: Test the Classifier

Create `testClassify.mjs` in project root:
```javascript
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const app = initializeApp({
  projectId: "documind-6c687",
  apiKey: "YOUR_FIREBASE_WEB_API_KEY"  // Firebase console → Project Settings → Web API Key
});

const functions = getFunctions(app);
const classifySnippet = httpsCallable(functions, "classifySnippet");

const result = await classifySnippet({
  text: "The system must support SSO login",
  source: "gmail"
});

console.log(result.data);
```

Install Firebase client SDK:
```powershell
npm install firebase
```

Run:
```powershell
node testClassify.mjs
```

Expected output:
```json
{ "label": "REQUIREMENT", "confidence": 0.99, ... }
```

---

## Final File Structure

```
documind-clarity-main/
  functions/
    src/
      classifySnippet.ts
      embedSnippet.ts
      storeInChroma.ts
      generateBrd.ts
      detectConflicts.ts
      scoreQuality.ts
      onChatMessage.ts
      onFileUploaded.ts
      index.ts
    tsconfig.json         ← must have "target": "es2018"
    package.json          ← lint script must be "eslint ."
    .env.local            ← GEMINI_API_KEY=your_key (never commit)
  scripts/
    ingestEnron.ts
    downloadAMI.py
    seedDemoProject.ts
  chroma-server/
    Dockerfile
  data/
    emails.csv            ← downloaded from Kaggle
    enron-filtered.json   ← generated by ingestEnron.ts
    ami.json              ← generated by downloadAMI.py
  firebase.json
  firestore.rules
  storage.rules
  serviceAccount.json     ← never commit this
  testClassify.mjs
  .gitignore
```

---

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `Unknown file extension ".ts"` | Use `tsx` instead of `npx ts-node` |
| `Cannot read properties of undefined (reading 'applicationDefault')` | Use `import admin from "firebase-admin"` not `import * as admin` |
| `Argument of type 'T[]' is not assignable to parameter of type 'never'` | Add `T[][]` type annotation to `chunks` array |
| `This regular expression flag is only available when targeting 'es2018'` | Set `"target": "es2018"` in `functions/tsconfig.json` |
| `API key not valid` | Check `.env.local` has full key with no quotes, no spaces |
| `Eventarc permission denied` | Wait 5 min and retry, or manually grant Eventarc Service Agent role |
| `Not in a Firebase app directory` | Run all firebase commands from project root, never from `functions/` |
| ESLint `--ext` flag error | Change lint script to `"eslint ."` in `functions/package.json` |

---

## Quick Reference: Common Commands

```powershell
# Deploy everything
cd functions && npm run build && cd ..
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:classifySnippet

# Deploy rules only
firebase deploy --only firestore:rules
firebase deploy --only storage

# Run a script
tsx scripts/seedDemoProject.ts

# Start ChromaDB locally
chroma run --host localhost --port 8000

# Set a secret
firebase functions:secrets:set SECRET_NAME

# Check project
firebase projects:list
firebase use documind-6c687
```
