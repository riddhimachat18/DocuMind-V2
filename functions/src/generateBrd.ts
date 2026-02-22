import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { retrieveForSection } from "./retrieval";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const BRD_SECTIONS = [
  { id: "executiveSummary", query: "project overview objectives goals scope purpose summary" },
  { id: "stakeholderRegister", query: "stakeholders team members roles responsibilities owners participants" },
  { id: "functionalReqs", query: "system must feature capability requirement function shall functionality" },
  { id: "nfrReqs", query: "performance security availability scalability reliability response time quality" },
  { id: "assumptions", query: "assumption constraint limitation boundary dependency restriction" },
  { id: "successMetrics", query: "success metric KPI measure target baseline acceptance criteria outcome" },
];

function cleanSection(text: string): string {
  return text
    .split("\n")
    .map(line => line
      // Remove incomplete SOURCE tags and stray brackets
      .replace(/\[SOURCE:\d+\]/g, "")
      .replace(/\[SOURCE:\d*/g, "")
      .replace(/\[SOURCE$/g, "")
      .replace(/\s*\[$/g, "")
      .replace(/\]$/g, "")
      .replace(/^\]/g, "")
      // Remove stray commas
      .replace(/,{2,}/g, "")
      .replace(/\s,\s/g, " ")
      .replace(/,\s*$/g, "")
      // Remove stray numbers on their own
      .replace(/^\d+\s*$/, "")
      // Remove lines that are just punctuation or symbols
      .replace(/^[,.\]\[;:\s]+$/, "")
      // Remove markdown artifacts
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      // Remove trailing whitespace
      .trim()
    )
    // Remove empty or too-short lines after cleaning
    .filter(line => 
      line.length > 10 &&
      !line.match(/^[\]\[,.\s]+$/) &&
      !line.match(/^\d+$/) &&
      !line.match(/^,+$/)
    )
    .join("\n")
    .trim();
}

export const generateBrd = onCall(
  { 
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
    cors: true
  },
  async ({ data, auth }) => {
    // Verify authentication
    if (!auth) {
      throw new Error('User must be authenticated');
    }

    const { projectId, selectedFiles } = data;
    
    console.log('generateBrd called with:', { projectId, selectedFiles });
    
    if (!projectId) {
      throw new Error('projectId is required');
    }

    const key = GEMINI_API_KEY.value();
    if (!key) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        topP: 0.9,
      }
    });

    const sections: Record<string, any> = {};
    const allCitations: Record<string, any> = {};

    // Process sections in parallel for speed
    const sectionPromises = BRD_SECTIONS.map(async (section) => {
      console.log(`Processing section: ${section.id}`);
      
      const retrieved = await retrieveForSection(
  section.query, 
  projectId, 
  key, 
  50
);
      
      console.log(`Retrieved ${retrieved.length} snippets for ${section.id}`);
      
      const snippetTexts = retrieved.map((r, i) => `[${i + 1}] ${r.text}`);
      const snippetIds = retrieved.map(r => r.id);

      const prompt = `Generate the "${section.id}" section of a professional BRD. Use the evidence below. Cite each statement with [SOURCE:N]. Be thorough and comprehensive — include ALL relevant information from the evidence. Use proper formatting with IDs (FR-01, NFR-01 etc).

CRITICAL FORMATTING RULES:
- Do NOT use markdown bold (**text**) anywhere
- Do NOT use asterisks for any formatting
- Use plain text only
- Never truncate or cut off mid-sentence

EVIDENCE:
${snippetTexts.join("\n")}

Generate the complete section now with proper citations.`;

      const result = await model.generateContent(prompt);
      const rawText = result.response.text();

      // Parse citations with full snippet metadata
      const citations: Record<string, any[]> = {};
      const sentenceEvidence: Record<string, any[]> = {};
      
      for (const line of rawText.split("\n")) {
        const matches = line.match(/\[SOURCE:(\d+)\]/g);
        if (matches) {
          const clean = line.replace(/\[SOURCE:\d+\]/g, "").trim();
          const evidenceItems = matches
            .map(m => parseInt(m.replace(/\D/g, "")) - 1)
            .filter(i => i >= 0 && i < retrieved.length)
            .map(i => ({
              snippetId: snippetIds[i],
              text: retrieved[i].text,
              metadata: retrieved[i].metadata
            }));
          
          citations[clean] = evidenceItems.map(e => e.snippetId);
          sentenceEvidence[clean] = evidenceItems;
        }
      }

      return {
        id: section.id,
        content: rawText.replace(/\[SOURCE:\d+\]/g, "").trim(),
        citations,
        sentenceEvidence
      };
    });

    // Wait for all sections to complete
    const sectionResults = await Promise.all(sectionPromises);
    
    // Organize results
    const allSentenceEvidence: Record<string, any> = {};
    sectionResults.forEach(result => {
      sections[result.id] = cleanSection(result.content);
      allCitations[result.id] = result.citations;
      allSentenceEvidence[result.id] = result.sentenceEvidence || {};
    });

    // Get next version number
    const versionsSnapshot = await db.collection("brdVersions")
      .where("projectId", "==", projectId)
      .orderBy("versionNumber", "desc")
      .limit(1)
      .get();
    
    const versionNumber = versionsSnapshot.empty 
      ? 1.0 
      : Math.floor((versionsSnapshot.docs[0].data().versionNumber || 1.0)) + 1.0;
    
    const version = `v${versionNumber.toFixed(1)}`;

    // Calculate initial quality score IMMEDIATELY
    const qualityScore = computeQualityScore(sections, 0);
    
    const versionRef = await db.collection("brdVersions").add({
      projectId,
      version,
      versionNumber,
      sections,
      citations: allCitations,
      sentenceEvidence: allSentenceEvidence,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      status: "draft",
      qualityScore: qualityScore,
      openConflictCount: 0,
      changeLog: `Generated ${version}`
    });

    await db.collection("projects").doc(projectId).update({
      currentBrdVersionId: versionRef.id
    });

    console.log(`BRD ${version} created with quality score:`, qualityScore);

    return { brdVersionId: versionRef.id, version, versionNumber, sections, qualityScore };
  }
);

/**
 * Compute quality score for a BRD with advanced analysis
 */
function computeQualityScore(sections: any, openConflictCount: number) {
  const VAGUE_WORDS = ["maybe", "should", "might", "could", "typically", "generally",
    "usually", "often", "sometimes", "probably", "possibly", "perhaps"];

  // Helper: Check if content is meaningful
  function isMeaningfulContent(content: string | undefined): boolean {
    if (!content) return false;
    const trimmed = content.trim();
    if (trimmed.length < 20) return false;
    const fillerPhrases = ["to be determined", "tbd", "n/a", "none", "todo", "coming soon"];
    const lowerContent = trimmed.toLowerCase();
    if (fillerPhrases.some(phrase => lowerContent === phrase)) return false;
    return true;
  }

  // Helper: Extract requirements from text
  function extractRequirements(text: string): string[] {
    if (!text) return [];
    return text.split("\n")
      .map(line => line.trim())
      .filter(line => 
        line.match(/^[-*•]\s+/) || // Bullet points
        line.match(/^\d+\.\s+/) || // Numbered lists
        line.match(/^[A-Z]{2,3}-\d+/) // Requirement IDs
      );
  }

  // Helper: Find vague words
  function findVagueWords(text: string): string[] {
    const found: string[] = [];
    const lowerText = text.toLowerCase();
    VAGUE_WORDS.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      if (regex.test(lowerText)) {
        found.push(word);
      }
    });
    return [...new Set(found)];
  }

  // Helper: Check if requirement has measurable criteria
  function hasMeasurableCriteria(req: string): boolean {
    return /\d+|<|>|<=|>=|within|under|over|at least|at most|maximum|minimum/i.test(req);
  }

  // ── COMPLETENESS (40 points) ──────────────────────────
  const sectionChecks = [
    isMeaningfulContent(sections.executiveSummary),
    isMeaningfulContent(sections.stakeholderRegister),
    isMeaningfulContent(sections.functionalReqs),
    isMeaningfulContent(sections.nfrReqs),
    isMeaningfulContent(sections.assumptions),
    isMeaningfulContent(sections.successMetrics),
  ];
  
  const presentSections = sectionChecks.filter(Boolean).length;
  const completeness = Math.round((presentSections / 6) * 40);

  // ── CONSISTENCY (40 points) ───────────────────────────
  let consistency = 40;
  
  // Deduct for open conflicts
  consistency -= openConflictCount * 10;
  
  // Check for terminology inconsistencies
  const allText = Object.values(sections).join(" ").toLowerCase();
  const conflicts = [
    ["user", "customer", "client"],
    ["system", "application", "platform", "product"],
  ];
  
  conflicts.forEach(terms => {
    const foundTerms = terms.filter(term => allText.includes(term));
    if (foundTerms.length > 1) {
      consistency -= 5;
    }
  });
  
  consistency = Math.max(0, consistency);

  // ── CLARITY (20 points) ───────────────────────────────
  let clarity = 20;
  
  // Check for vague words
  const vagueWords = findVagueWords(allText);
  clarity -= Math.min(vagueWords.length * 0.5, 5);
  
  // Check functional requirements for measurable criteria
  const functionalReqs = extractRequirements(sections.functionalReqs || "");
  const unmeasurableReqs = functionalReqs.filter(req => !hasMeasurableCriteria(req));
  
  if (functionalReqs.length > 0) {
    const measurableRatio = 1 - (unmeasurableReqs.length / functionalReqs.length);
    clarity = Math.round(clarity * measurableRatio);
  }
  
  // Check for overly long requirements
  const longReqs = functionalReqs.filter(req => req.split(" ").length > 50);
  clarity -= longReqs.length * 2;
  
  clarity = Math.max(0, Math.round(clarity));

  const total = completeness + consistency + clarity;

  return { completeness, consistency, clarity, total };
}
