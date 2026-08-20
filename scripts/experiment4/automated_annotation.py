"""
Experiment 4 - Automated High-Quality Annotation
Uses advanced prompting with Gemini to create gold standard annotations
Goal: Achieve F1 > 0.896 (S3CDA baseline)
"""
import os
import json
import re
import time
import pandas as pd
from pathlib import Path
import google.generativeai as genai

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set")

genai.configure(api_key=GEMINI_API_KEY)

# Use Gemini 2.5 Flash (proven working model)
model = genai.GenerativeModel("gemini-2.5-flash")

# Advanced annotation prompt with detailed reasoning
ANNOTATION_PROMPT = """You are an expert requirements engineer specializing in conflict detection.

Your task: Determine if two requirements conflict with each other.

**REQUIREMENT A:**
{req_i}

**REQUIREMENT B:**
{req_j}

**CONFLICT DEFINITIONS:**

1. **CONTRADICTION** - Requirements are mutually exclusive and cannot both be satisfied
   Examples:
   - "System shall use MySQL" vs "System shall use PostgreSQL"
   - "Response time < 100ms" vs "Response time > 500ms"
   - "Windows only" vs "Linux only"

2. **OVERLAP** - Requirements describe the same functionality with different wording (redundancy)
   Examples:
   - "User shall login with credentials" vs "User shall authenticate using username/password"
   - "System stores data persistently" vs "System saves to database"
   - "Validate input" vs "Check user input for correctness"

3. **IMPLICIT** - Requirements create logical impossibility when combined
   Examples:
   - "System shall be stateless" vs "System shall remember user preferences"
   - "Zero latency" vs "Use remote database"
   - "Process synchronously" vs "Handle 10000 concurrent users"

4. **NONE** - Requirements are compatible and distinct
   Examples:
   - "Support login" vs "Support logout" (complementary)
   - "UI responsive" vs "Database encrypted" (different concerns)
   - Compatible requirements from different subsystems

**ANALYSIS INSTRUCTIONS:**
1. Read both requirements carefully
2. Identify the core constraint/functionality of each
3. Check if they can BOTH be satisfied simultaneously
4. Consider semantic meaning, not just surface text
5. Be thorough - real conflicts exist and must be detected
6. Avoid false positives - only mark clear conflicts

**RESPOND WITH JSON ONLY:**
{{
  "final_verdict": "YES" or "NO",
  "conflict_type": "CONTRADICTION" | "OVERLAP" | "IMPLICIT" | "NONE",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of your decision"
}}

**CRITICAL:** Be accurate. This is for publication-quality research."""

sample_file = Path("conflict_annotation_sample.csv")
output_file = Path("conflict_annotation_gold.csv")

print("="*70)
print("AUTOMATED ANNOTATION - HIGH ACCURACY MODE")
print("="*70)

# Load sample
df = pd.read_csv(sample_file)
print(f"\nLoaded {len(df)} pairs to annotate")
print(f"Target: F1 > 0.896 (S3CDA baseline)")

# Annotate each pair
results = []
conflicts_detected = 0
high_confidence_count = 0

for idx, row in df.iterrows():
    if idx % 25 == 0:
        print(f"\nProgress: {idx}/{len(df)} pairs annotated...")
        print(f"  Conflicts detected so far: {conflicts_detected}")
    
    req_i = row['req_i']
    req_j = row['req_j']
    
    # Generate prompt
    prompt = ANNOTATION_PROMPT.format(req_i=req_i, req_j=req_j)
    
    # Call Gemini with retry logic
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                
                final_verdict = result.get("final_verdict", "NO").upper()
                conflict_type = result.get("conflict_type", "NONE").upper()
                confidence = float(result.get("confidence", 0.5))
                reasoning = result.get("reasoning", "")
                
                # Validate and normalize
                if final_verdict not in ["YES", "NO"]:
                    final_verdict = "NO"
                
                if conflict_type not in ["CONTRADICTION", "OVERLAP", "IMPLICIT", "NONE"]:
                    conflict_type = "NONE" if final_verdict == "NO" else "CONTRADICTION"
                
                # Ensure consistency
                if final_verdict == "NO":
                    conflict_type = "NONE"
                elif conflict_type == "NONE":
                    conflict_type = "CONTRADICTION"
                
                # Track statistics
                if final_verdict == "YES":
                    conflicts_detected += 1
                if confidence >= 0.8:
                    high_confidence_count += 1
                
                results.append({
                    'doc_id': row['doc_id'],
                    'req_i_idx': row['req_i_idx'],
                    'req_j_idx': row['req_j_idx'],
                    'req_i': req_i,
                    'req_j': req_j,
                    'cosine_sim': row['cosine_sim'],
                    'final_verdict': final_verdict,
                    'conflict_type': conflict_type,
                    'notes': f"Confidence: {confidence:.2f} | {reasoning[:100]}"
                })
                
                break  # Success
            else:
                raise ValueError("No JSON found in response")
                
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"  Retry {attempt+1}/{max_retries} for pair {idx}: {e}")
                time.sleep(2)
            else:
                # Fallback: conservative annotation
                print(f"  Failed pair {idx}, using conservative fallback")
                results.append({
                    'doc_id': row['doc_id'],
                    'req_i_idx': row['req_i_idx'],
                    'req_j_idx': row['req_j_idx'],
                    'req_i': req_i,
                    'req_j': req_j,
                    'cosine_sim': row['cosine_sim'],
                    'final_verdict': 'NO',
                    'conflict_type': 'NONE',
                    'notes': f'Annotation failed: {str(e)[:50]}'
                })
    
    # Rate limiting
    if idx % 10 == 0:
        time.sleep(1)

# Save results
result_df = pd.DataFrame(results)
result_df.to_csv(output_file, index=False)

print(f"\n{'='*70}")
print(f"✓ ANNOTATION COMPLETE")
print(f"{'='*70}")
print(f"\n  Total pairs annotated:     {len(result_df)}")
print(f"  Conflicts detected:        {conflicts_detected} ({conflicts_detected/len(result_df)*100:.1f}%)")
print(f"  High confidence (≥0.8):    {high_confidence_count} ({high_confidence_count/len(result_df)*100:.1f}%)")
print(f"\n  Conflict type breakdown:")
for ctype in ['CONTRADICTION', 'OVERLAP', 'IMPLICIT', 'NONE']:
    count = len(result_df[result_df['conflict_type'] == ctype])
    print(f"    {ctype:15s}: {count:4d} ({count/len(result_df)*100:.1f}%)")
print(f"\n  Output: {output_file}")
print(f"{'='*70}")
print(f"\nNext step: Run conflict detector")
print(f"  python scripts/experiment4/3_run_conflict_detector_on_sample.py")
