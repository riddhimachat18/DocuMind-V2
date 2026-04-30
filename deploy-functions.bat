@echo off
REM Deploy Firebase Cloud Functions with CORS enabled
REM This script deploys all functions that have been updated with CORS configuration

echo.
echo 🚀 Deploying Firebase Cloud Functions with CORS enabled...
echo.

REM Check if Firebase CLI is installed
where firebase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Firebase CLI is not installed.
    echo Install it with: npm install -g firebase-tools
    exit /b 1
)

echo 📦 Installing function dependencies...
cd functions
call npm install
cd ..

echo.
echo 🔧 Deploying Cloud Functions...
echo.

REM Deploy all functions
call firebase deploy --only functions

echo.
echo ✅ Deployment complete!
echo.
echo 📝 Functions deployed with CORS enabled:
echo   - onFileUploaded (OPTIMIZED: 540s timeout, parallel processing)
echo   - generateBrd (300s timeout)
echo   - detectConflicts (300s timeout)
echo   - onChatMessage (120s timeout)
echo   - classifySnippet
echo.
echo ⏳ Wait 1-2 minutes for changes to propagate
echo 🧪 Then test file upload from http://localhost:8084
echo.

pause
