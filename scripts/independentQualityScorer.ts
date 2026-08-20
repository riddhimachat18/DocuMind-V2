/**
 * IndependentQualityScorer — Separate evaluator model for unbiased BRD quality assessment
 * Uses independent Gemini API call with evaluator system prompt
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import type { BrdInput } from "./scoreQuality.js";

export interface QualityAssessment {
  completeness: number;
  clarity: number;
  consistency: number;
  evidence: number;
  overall: number;
  reasoning: string;
  timestamp: string;
  evaluatorModel: string;
}

export class IndependentQualityScorer {
  private model: GenerativeModel;

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.1, // Low temperature for consistent evaluation
        maxOutputTokens: 4096, // Increased to ensure complete JSON response
        topP: 0.9,
      },
    });
  }

  /**
   * Evaluate BRD quality using independent judge model
   */
  async evaluateQuality(brd: BrdInput): Promise<QualityAssessment> {
    const startTime = performance.now();
    const evaluatorPrompt = this.buildEvaluatorPrompt(brd);

    try {
      const result = await this.model.generateContent(evaluatorPrompt);
      const responseText = result.response.text().trim();

      // Try to parse JSON from response
      // First try to find JSON block with code fences (non-greedy match)
      let jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonText: string;
      
      if (jsonMatch && jsonMatch[1]) {
        jsonText = jsonMatch[1].trim();
      } else {
        // Try to find raw JSON object (greedy match to get complete JSON)
        const rawMatch = responseText.match(/(\{[\s\S]*\})/);
        if (!rawMatch) {
          console.error("Evaluator response length:", responseText.length);
          console.error("Evaluator response (first 1000 chars):", responseText.substring(0, 1000));
          throw new Error("No JSON found in evaluator response");
        }
        jsonText = rawMatch[1];
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        console.error("JSON text length:", jsonText.length);
        console.error("JSON text (first 1000 chars):", jsonText.substring(0, 1000));
        throw new Error(`Failed to parse JSON: ${parseError}`);
      }

      // Validate and normalize scores
      const assessment: QualityAssessment = {
        completeness: this.normalizeScore(parsed.completeness),
        clarity: this.normalizeScore(parsed.clarity),
        consistency: this.normalizeScore(parsed.consistency),
        evidence: this.normalizeScore(parsed.evidence),
        overall: this.normalizeScore(parsed.overall),
        reasoning: parsed.reasoning || "No reasoning provided",
        timestamp: new Date().toISOString(),
        evaluatorModel: "gemini-2.5-flash",
      };

      const evaluationTimeMs = performance.now() - startTime;
      
      // Log performance metrics with score distribution
      console.log(`[Quality Scorer Performance] Evaluation completed in ${evaluationTimeMs.toFixed(2)}ms`);
      console.log(`  - Completeness: ${assessment.completeness}/100`);
      console.log(`  - Clarity: ${assessment.clarity}/100`);
      console.log(`  - Consistency: ${assessment.consistency}/100`);
      console.log(`  - Evidence: ${assessment.evidence}/100`);
      console.log(`  - Overall: ${assessment.overall}/100`);

      return assessment;
    } catch (error) {
      const errorTimeMs = performance.now() - startTime;
      console.error(`[Quality Scorer Performance] Evaluation failed after ${errorTimeMs.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Build evaluator system prompt with BRD content
   */
  private buildEvaluatorPrompt(brd: BrdInput): string {
    const sections = brd.sections;

    return `You are an independent BRD quality evaluator. Your role is to assess the quality of a Business Requirements Document (BRD) across four explicit criteria. You have no knowledge of how this BRD was generated - you are acting as an unbiased judge.

EVALUATION CRITERIA:

1. COMPLETENESS (0-100): Assess whether all required BRD sections are present and substantive.
   - Check for: Executive Summary, Stakeholder Register, Functional Requirements, Non-Functional Requirements, Assumptions, Success Metrics, External Interfaces, Use Cases, Glossary
   - Each section should have meaningful content (not placeholders like "TBD" or "N/A")
   - Functional requirements should have measurable acceptance criteria
   - Success metrics should have quantifiable targets
   - Stakeholder register should list multiple roles with responsibilities

2. CLARITY (0-100): Assess whether language is specific, unambiguous, and uses precise terminology.
   - Requirements should use modal verbs (SHALL, MUST, WILL) not vague language (may, might, should, could)
   - Requirements should specify named actors, components, or data entities
   - Avoid vague qualifiers like "typically", "generally", "usually", "approximately"
   - Each requirement should be understandable without external context
   - Word count should be appropriate (not too brief, not overly verbose)

3. CONSISTENCY (0-100): Identify contradictions between sections and conflicting requirements.
   - Check for terminology consistency (e.g., don't mix "user", "customer", "client" for same concept)
   - Verify no conflicting requirements or constraints
   - Check that assumptions don't contradict requirements
   - Verify success metrics align with stated objectives
   - Note: Open conflict count is ${brd.openConflictCount || 0}

4. EVIDENCE (0-100): Verify that claims and requirements are linked to source evidence.
   - Check if requirements reference specific source snippets
   - Assess whether evidence attribution is present throughout sections
   - Verify that claims are grounded in provided evidence, not speculation
   - Note: This BRD has ${brd.diagramCoverage || 0}% diagram coverage

BRD CONTENT TO EVALUATE:

Executive Summary:
${sections.executiveSummary || "(missing)"}

Stakeholder Register:
${sections.stakeholderRegister || "(missing)"}

Functional Requirements:
${sections.functionalReqs || "(missing)"}

Non-Functional Requirements:
${sections.nfrReqs || "(missing)"}

Assumptions:
${sections.assumptions || "(missing)"}

Success Metrics:
${sections.successMetrics || "(missing)"}

External Interfaces:
${sections.externalInterfaces || "(missing)"}

Use Cases:
${sections.useCases || "(missing)"}

Glossary:
${sections.glossary || "(missing)"}

INSTRUCTIONS:
1. Evaluate each criterion independently on a 0-100 scale
2. Calculate an overall score (0-100) that reflects the composite quality
3. Provide detailed reasoning explaining your scores and identifying specific areas for improvement
4. Return your evaluation as JSON in this exact format (IMPORTANT: Complete the entire JSON object, do not truncate):

{
  "completeness": <number 0-100>,
  "clarity": <number 0-100>,
  "consistency": <number 0-100>,
  "evidence": <number 0-100>,
  "overall": <number 0-100>,
  "reasoning": "<detailed explanation - keep concise, max 500 characters>"
}

CRITICAL: Return ONLY the JSON object above. Ensure the JSON is complete and properly closed with all closing braces. Keep the reasoning field concise (max 500 characters) to ensure the response fits within token limits.`;
  }

  /**
   * Normalize score to 0-100 range
   */
  private normalizeScore(score: any): number {
    const num = typeof score === "number" ? score : parseFloat(score);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
  }

  /**
   * Individual scoring methods for specific criteria
   */
  async scoreCompleteness(brd: BrdInput): Promise<number> {
    const assessment = await this.evaluateQuality(brd);
    return assessment.completeness;
  }

  async scoreClarity(brd: BrdInput): Promise<number> {
    const assessment = await this.evaluateQuality(brd);
    return assessment.clarity;
  }

  async scoreConsistency(brd: BrdInput): Promise<number> {
    const assessment = await this.evaluateQuality(brd);
    return assessment.consistency;
  }

  async scoreEvidence(brd: BrdInput): Promise<number> {
    const assessment = await this.evaluateQuality(brd);
    return assessment.evidence;
  }
}
