#!/bin/bash

# Deploy Firebase Cloud Functions with CORS enabled
# This script deploys all functions that have been updated with CORS configuration

echo "🚀 Deploying Firebase Cloud Functions with CORS enabled..."
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed."
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase."
    echo "Run: firebase login"
    exit 1
fi

echo "📦 Installing function dependencies..."
cd functions
npm install
cd ..

echo ""
echo "🔧 Deploying Cloud Functions..."
echo ""

# Deploy all functions
firebase deploy --only functions

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Functions deployed with CORS enabled:"
echo "  - onFileUploaded"
echo "  - generateBrd"
echo "  - detectConflicts"
echo "  - onChatMessage"
echo "  - classifySnippet"
echo ""
echo "⏳ Wait 1-2 minutes for changes to propagate"
echo "🧪 Then test file upload from http://localhost:8084"
echo ""
