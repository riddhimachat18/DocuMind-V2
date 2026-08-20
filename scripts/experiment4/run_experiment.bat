@echo off
REM Master script to run Experiment 4: Conflict Detection Evaluation

echo ==========================================
echo EXPERIMENT 4: CONFLICT DETECTION
echo ==========================================
echo.

REM Check if GEMINI_API_KEY is set
if "%GEMINI_API_KEY%"=="" (
    echo ERROR: GEMINI_API_KEY environment variable not set
    echo Please set it with: set GEMINI_API_KEY=your-key-here
    exit /b 1
)

REM Check Python dependencies
echo Checking Python dependencies...
python -c "import google.generativeai, sentence_transformers, sklearn, pandas, PyPDF2, docx" 2>nul
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r scripts\experiment4\requirements.txt
)

echo.
echo ==========================================
echo STEP 1: Extract Requirements
echo ==========================================
python scripts\experiment4\1_extract_requirements.py
if errorlevel 1 exit /b 1

echo.
echo ==========================================
echo STEP 2: Generate Annotation Candidates
echo ==========================================
python scripts\experiment4\2_generate_annotation_candidates.py
if errorlevel 1 exit /b 1

echo.
echo ==========================================
echo MANUAL ANNOTATION REQUIRED
echo ==========================================
echo.
echo Please complete the following steps:
echo 1. Open scripts\experiment4\conflict_annotation_sheet.csv
echo 2. Have 2 annotators label the conflicts (YES/NO)
echo 3. Run: python scripts\experiment4\compute_kappa.py
echo 4. Resolve disagreements
echo 5. Save gold standard as conflict_annotation_gold.csv
echo.
echo Press any key when annotation is complete to continue...
pause >nul

REM Check if gold standard exists
if not exist "scripts\experiment4\conflict_annotation_gold.csv" (
    echo ERROR: Gold standard file not found
    echo Please create conflict_annotation_gold.csv before continuing
    exit /b 1
)

echo.
echo ==========================================
echo STEP 3: Run Conflict Detector
echo ==========================================
python scripts\experiment4\3_run_conflict_detector.py
if errorlevel 1 exit /b 1

echo.
echo ==========================================
echo STEP 4: Compute Metrics
echo ==========================================
python scripts\experiment4\4_compute_metrics.py
if errorlevel 1 exit /b 1

echo.
echo ==========================================
echo EXPERIMENT 4 COMPLETE!
echo ==========================================
echo.
echo Results saved to:
echo   - scripts\experiment4\experiment4_report.txt
echo   - scripts\experiment4\experiment4_detailed.csv
echo.
pause
