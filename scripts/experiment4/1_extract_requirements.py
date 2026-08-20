"""
Experiment 4 - Step 1: Extract requirements from 20 req_dataset documents
Uses the exact few-shot prompt from classifyText.ts
"""
import os
import json
import google.generativeai as genai
from pathlib import Path
import PyPDF2
import docx
import re
from typing import List, Dict

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

# Exact few-shot prompt from classifyText.ts
FEW_SHOT_PROMPT = """Classify the following sentence into exactly one of these four classes:
REQUIREMENT, DECISION, CONSTRAINT, NOISE.
Definitions and examples:
REQUIREMENT — A functional or non-functional capability the system must provide.
Usually contains modal verbs: shall, must, will, should, needs to.
Examples:
  - "The system shall allow users to reset their password via email."
  - "The application must support offline mode for mobile users."
  - "Response time shall not exceed 200ms under normal load."
DECISION — A design or architectural choice already made. Past tense or
definitive statements about technology, approach, or design selected.
Examples:
  - "The team decided to use PostgreSQL as the primary database."
  - "OAuth 2.0 has been selected for authentication."
  - "The architecture will follow a microservices pattern."
  - "Access to the database will be via the training application rather than the production application."
  - "The system will use a three-tier architecture."
  - "It was agreed that React will be used for the frontend."
CONSTRAINT — A limitation, boundary, or restriction imposed from outside
the system — budget, regulatory, time, platform, or organisational.
Examples:
  - "The system must comply with GDPR data protection regulations."
  - "The project budget is capped at $200,000."
  - "The solution must be deployable on Google Cloud Platform only."
  - "Development must be completed by Q3 2024."
  - "Access to the DBMS may only be via the training application, not the production system."
  - "The system is limited to operating within the existing network infrastructure."
  - "Only approved third-party libraries may be used."
NOISE — Everything else: greetings, meeting logistics, filler text,
section headers, metadata, opinions without requirement content.
Examples:
  - "Please find the agenda attached."
  - "This document was last updated on March 2023."
  - "The following section describes the system overview."
  - "Thank you for your participation."
Rules:
- If a sentence has both requirement and constraint content, choose REQUIREMENT.
- If uncertain between DECISION and REQUIREMENT, look for past tense or "will be/has been selected/decided/agreed" → DECISION.
- If the sentence describes an external limitation or boundary NOT under the system's control → CONSTRAINT.
- If the sentence uses "shall/must/should" for a system capability → REQUIREMENT.
- Non-requirements from the original dataset can be CONSTRAINT, DECISION, or NOISE.
- Return ONLY the label word. No explanation. No punctuation.

Sentence: "{sentence}"

Label:"""

VALID_LABELS = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"]


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF file"""
    text = ""
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
    except Exception as e:
        print(f"Error reading PDF {pdf_path}: {e}")
    return text


def extract_text_from_docx(docx_path: str) -> str:
    """Extract text from DOCX file"""
    try:
        doc = docx.Document(docx_path)
        return "\n".join([para.text for para in doc.paragraphs])
    except Exception as e:
        print(f"Error reading DOCX {docx_path}: {e}")
        return ""


def extract_text_from_rtf(rtf_path: str) -> str:
    """Extract text from RTF file (basic extraction)"""
    try:
        with open(rtf_path, 'r', encoding='utf-8', errors='ignore') as file:
            content = file.read()
            # Basic RTF stripping - remove control words
            text = re.sub(r'\\[a-z]+\d*\s?', '', content)
            text = re.sub(r'[{}]', '', text)
            return text
    except Exception as e:
        print(f"Error reading RTF {rtf_path}: {e}")
        return ""


def extract_text_from_doc(doc_path: str) -> str:
    """Extract text from DOC file - try docx library first"""
    try:
        return extract_text_from_docx(doc_path)
    except:
        # Fallback: read as text
        try:
            with open(doc_path, 'r', encoding='utf-8', errors='ignore') as file:
                return file.read()
        except Exception as e:
            print(f"Error reading DOC {doc_path}: {e}")
            return ""


def extract_text(file_path: str) -> str:
    """Extract text based on file extension"""
    ext = Path(file_path).suffix.lower()
    if ext == '.pdf':
        return extract_text_from_pdf(file_path)
    elif ext == '.docx':
        return extract_text_from_docx(file_path)
    elif ext == '.doc':
        return extract_text_from_doc(file_path)
    elif ext == '.rtf':
        return extract_text_from_rtf(file_path)
    else:
        return ""


def split_into_sentences(text: str) -> List[str]:
    """Simple sentence splitter"""
    # Replace newlines with spaces
    text = text.replace('\n', ' ')
    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+', text)
    # Clean and filter
    sentences = [s.strip() for s in sentences if len(s.strip()) > 15]
    return sentences


def classify_sentence(sentence: str) -> str:
    """Classify a sentence using Gemini with few-shot prompt"""
    prompt = FEW_SHOT_PROMPT.replace("{sentence}", sentence[:500].replace('"', "'"))
    
    try:
        response = model.generate_content(prompt)
        raw = response.text.strip().upper().split()[0]
        # Match label
        for label in VALID_LABELS:
            if raw.startswith(label[:4]):
                return label
        return "NOISE"
    except Exception as e:
        print(f"Classification error: {e}")
        return "NOISE"


def quick_filter_requirements(sentences: List[str]) -> List[str]:
    """Quick filter using keyword matching before API classification"""
    requirement_keywords = ['shall', 'must', 'will', 'should', 'needs to', 'required to', 'has to']
    candidates = []
    for sent in sentences:
        sent_lower = sent.lower()
        if any(keyword in sent_lower for keyword in requirement_keywords):
            candidates.append(sent)
    return candidates


def main():
    req_dataset_dir = Path("req_dataset")
    output_file = Path("scripts/experiment4/requirements_extracted.json")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    # Get all 20 files
    files = sorted(req_dataset_dir.glob("*"))[:20]
    
    print(f"Processing {len(files)} documents from req_dataset...")
    
    results = []
    
    for file_path in files:
        doc_id = file_path.stem
        print(f"\nProcessing: {doc_id}")
        
        # Extract text
        text = extract_text(str(file_path))
        if not text:
            print(f"  ⚠️  No text extracted")
            continue
        
        # Split into sentences
        sentences = split_into_sentences(text)
        print(f"  Found {len(sentences)} sentences")
        
        # Quick filter using keywords (reduces API calls by ~70%)
        candidates = quick_filter_requirements(sentences)
        print(f"  Keyword filter: {len(candidates)} candidates")
        
        # Classify only candidates
        requirement_sentences = []
        for i, sentence in enumerate(candidates):
            if i % 10 == 0:
                print(f"  Classifying candidate {i+1}/{len(candidates)}...")
            
            label = classify_sentence(sentence)
            if label == "REQUIREMENT":
                requirement_sentences.append(sentence)
        
        print(f"  ✓ Extracted {len(requirement_sentences)} REQUIREMENT sentences")
        
        results.append({
            "doc_id": doc_id,
            "file_path": str(file_path),
            "total_sentences": len(sentences),
            "requirement_sentences": requirement_sentences,
            "requirement_count": len(requirement_sentences)
        })
    
    # Save results
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\n{'='*60}")
    print(f"✓ Extraction complete!")
    print(f"  Total documents: {len(results)}")
    print(f"  Total requirements: {sum(r['requirement_count'] for r in results)}")
    print(f"  Output: {output_file}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
