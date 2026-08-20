import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { retrieveForSection } from "./retrieval.js";
import { computeQualityScore as computeRigorousScore } from "./scoreQuality.js";
import { runTwoPhaseDetection } from "./twoPhaseConflictDetector.js";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Token budget configuration per section (optimized for quality + performance) ──
const SECTION_TOKEN_LIMITS: Record<string, number> = {
  executiveSummary: 1500,      // ~350-400 words for detailed summary
  stakeholderRegister: 2000,   // 8-10 stakeholders with good details
  functionalReqs: 5000,        // 12-18 FRs with detailed descriptions
  nfrReqs: 2500,               // 6-8 NFRs with good explanations
  assumptions: 2000,           // 6-8 assumptions + 4-6 constraints
  successMetrics: 2500,        // 6-8 metrics with context
  externalInterfaces: 2000,    // 5-8 interfaces with descriptions
  useCases: 2000,              // 3 UCs with detailed steps
  glossary: 2500,              // 12-18 terms with good definitions
};

// ── Snippet count configuration per section (balanced for performance) ────────
const SNIPPETS_PER_SECTION: Record<string, number> = {
  executiveSummary: 15,       // Good context for overview
  stakeholderRegister: 12,    // Stakeholder mentions
  functionalReqs: 18,         // Rich requirement extraction
  nfrReqs: 15,                // Good NFR coverage
  assumptions: 12,            // Constraints/assumptions
  successMetrics: 15,         // Metric sources
  externalInterfaces: 12,     // Interface mentions
  useCases: 15,               // Use case context
  glossary: 15,               // Term coverage
};

// ── Domain detection ──────────────────────────────────────────────────────────
async function detectDomain(
  snippets: Array<{ text: string; id: string; metadata: any }>,
  model: any
): Promise<"software" | "policy" | "process" | "mixed"> {
  const sampleText = snippets.slice(0, 10).map(s => s.text).join("\n");
  
  const prompt = `Analyze this text and classify the primary domain.
Reply with ONLY one word: "software" (if about building a software system),
"policy" (if about regulations, compliance, government rules),
"process" (if about business/operational workflows), or "mixed".

Text: ${sampleText}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim().toLowerCase();
    if (["software", "policy", "process", "mixed"].includes(response)) {
      return response as "software" | "policy" | "process" | "mixed";
    }
    return "mixed"; // fallback
  } catch (e) {
    console.warn("Domain detection failed, defaulting to mixed:", e);
    return "mixed";
  }
}

// ── Domain-specific UC prompt generator ───────────────────────────────────────
function getUseCasePrompt(
  domain: "software" | "policy" | "process" | "mixed",
  snippets: Array<{ text: string; id: string; metadata: any }>
): string {
  const snippetText = snippets.map((s, i) => `[SOURCE:${i+1}] ${s.text}`).join("\n\n");
  
  // Use same format for all domains - simpler structure
  return `You are writing the Use Cases section of an IEEE 830 SRS.

Source material:
${snippetText}

════════════════════════════════════════════
FORMAT — follow exactly
════════════════════════════════════════════
UC-ID: UC-001
Actor: [Actor name from source]
Purpose: [One sentence purpose statement].
Preconditions:
- [Precondition 1].
- [Precondition 2].
Main Event Flow:
1. [Step 1].
2. [Step 2].
3. [Step 3].
4. [Step 4].
5. [Step 5].
Alternate Flows: [Brief description of alternate paths].
Postconditions:
- [Postcondition 1].
- [Postcondition 2 with source citation]. [SOURCE:N]

UC-ID: UC-002
Actor: [Actor name from source]
Purpose: [One sentence purpose statement].
Preconditions:
- [Precondition 1].
- [Precondition 2].
Main Event Flow:
1. [Step 1].
2. [Step 2].
3. [Step 3].
4. [Step 4].
5. [Step 5].
Alternate Flows: [Brief description of alternate paths].
Postconditions:
- [Postcondition 1].
- [Postcondition 2 with source citation]. [SOURCE:N]

UC-ID: UC-003
Actor: [Actor name from source]
Purpose: [One sentence purpose statement].
Preconditions:
- [Precondition 1].
- [Precondition 2].
Main Event Flow:
1. [Step 1].
2. [Step 2].
3. [Step 3].
4. [Step 4].
5. [Step 5].
Alternate Flows: [Brief description of alternate paths].
Postconditions:
- [Postcondition 1].
- [Postcondition 2 with source citation]. [SOURCE:N]

════════════════════════════════════════════
CRITICAL TRACEABILITY RULES
════════════════════════════════════════════
1. EVERY use case MUST end with [SOURCE:N] in the last postcondition
2. At minimum, the final postcondition line must have [SOURCE:N]
3. If you can add [SOURCE:N] to more lines, do so
4. 100% TRACEABILITY REQUIRED: At least one [SOURCE:N] per use case

════════════════════════════════════════════
CONTENT RULES
════════════════════════════════════════════
1. Exactly 3 use cases
2. Each use case has: UC-ID, Actor, Purpose, Preconditions (2), Main Event Flow (4-5 steps), Alternate Flows, Postconditions (2)
3. Write clear, concise descriptions
4. Ground all content in source evidence
5. Each UC should cover a different actor and goal
6. Total output: 300-400 words maximum

OUTPUT: 3 complete use cases following the format above`;
}

// ── Use Case validation ───────────────────────────────────────────────────────
function deduplicateCrossSections(sections: Record<string, string>): {
  sections: Record<string, string>;
  duplicatesRemoved: number;
} {
  let duplicatesRemoved = 0;
  
  // Extract facts from each section
  const extractFacts = (text: string): string[] => {
    return text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 20) // Ignore very short lines
      .map(line => {
        // Remove prefixes like "NFR-001:", "ASSM-001:", etc.
        return line
          .replace(/^(NFR|ASSM|CON|METRIC)-\d+:\s*/i, "")
          .replace(/\[SOURCE:\d+\]/g, "")
          .trim()
          .toLowerCase();
      });
  };
  
  // Calculate similarity between two strings (simple word overlap)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 3));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // Jaccard similarity
  };
  
  // Sections to check for duplicates (NFRs, Assumptions, Constraints)
  const nfrFacts = extractFacts(sections.nfrReqs || "");
  const assumptionsFacts = extractFacts(sections.assumptions || "");
  
  // Find duplicates between NFRs and Assumptions/Constraints
  const assumptionLines = (sections.assumptions || "").split("\n").filter(l => l.trim().length > 20);
  
  const duplicateIndices = new Set<number>();
  
  for (let i = 0; i < nfrFacts.length; i++) {
    for (let j = 0; j < assumptionsFacts.length; j++) {
      const similarity = calculateSimilarity(nfrFacts[i], assumptionsFacts[j]);
      if (similarity > 0.6) { // 60% similarity threshold
        // Mark assumption line for removal (keep NFR)
        duplicateIndices.add(j);
        duplicatesRemoved++;
        console.log(`[Deduplication] Found duplicate between NFR and Assumption (similarity: ${(similarity * 100).toFixed(1)}%)`);
      }
    }
  }
  
  // Remove duplicate lines from assumptions
  if (duplicateIndices.size > 0) {
    const filteredAssumptionLines = assumptionLines.filter((_, index) => !duplicateIndices.has(index));
    sections.assumptions = filteredAssumptionLines.join("\n");
    console.log(`[Deduplication] Removed ${duplicateIndices.size} duplicate lines from Assumptions section`);
  }
  
  // Check for duplicates within Assumptions section (between ASSM and CON)
  const assmLines = assumptionLines.filter(l => /^ASSM-\d+/i.test(l));
  const conLines = assumptionLines.filter(l => /^CON-\d+/i.test(l));
  
  const assmFacts = assmLines.map(l => l.replace(/^ASSM-\d+:\s*/i, "").replace(/\[SOURCE:\d+\]/g, "").trim().toLowerCase());
  const conFacts = conLines.map(l => l.replace(/^CON-\d+:\s*/i, "").replace(/\[SOURCE:\d+\]/g, "").trim().toLowerCase());
  
  const internalDuplicates = new Set<number>();
  
  for (let i = 0; i < assmFacts.length; i++) {
    for (let j = 0; j < conFacts.length; j++) {
      const similarity = calculateSimilarity(assmFacts[i], conFacts[j]);
      if (similarity > 0.6) {
        // Mark constraint for removal (keep assumption)
        internalDuplicates.add(j);
        duplicatesRemoved++;
        console.log(`[Deduplication] Found duplicate between ASSM and CON (similarity: ${(similarity * 100).toFixed(1)}%)`);
      }
    }
  }
  
  // Remove internal duplicates
  if (internalDuplicates.size > 0) {
    const filteredConLines = conLines.filter((_, index) => !internalDuplicates.has(index));
    const allAssumptionLines = [...assmLines, ...filteredConLines];
    sections.assumptions = allAssumptionLines.join("\n");
    console.log(`[Deduplication] Removed ${internalDuplicates.size} duplicate constraints from Assumptions section`);
  }
  
  return { sections, duplicatesRemoved };
}

// ── Use Case validation ───────────────────────────────────────────────────────
function validateUseCases(content: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Comprehensive list of banned software CRUD patterns
  const bannedPatterns = [
    { pattern: /authenticate/i, name: "authenticate" },
    { pattern: /directed to their dashboard/i, name: "directed to their dashboard" },
    { pattern: /load the current state/i, name: "load the current state" },
    { pattern: /validate the form data/i, name: "validate the form data" },
    { pattern: /generate a unique.*ID/i, name: "generate a unique ID" },
    { pattern: /submission timestamp/i, name: "Submission Timestamp" },
    { pattern: /audit log/i, name: "audit log" },
    { pattern: /audit trail/i, name: "audit trail" },
    { pattern: /transition.*status.*from/i, name: "transition status FROM X TO Y" },
    { pattern: /recalculate.*display/i, name: "recalculate and display" },
    { pattern: /within \d+ seconds/i, name: "within X seconds" },
    { pattern: /generate a PDF report/i, name: "generate a PDF report" },
  ];
  
  for (const { pattern, name } of bannedPatterns) {
    if (pattern.test(content)) {
      issues.push(`Banned software pattern found: "${name}"`);
    }
  }
  
  // Check step count per UC (4-5 steps for simplified format)
  const ucs = content.split(/UC-\d+:/i).filter(Boolean);
  for (let i = 0; i < ucs.length; i++) {
    // Count numbered steps (lines starting with digit and period)
    const stepMatches = ucs[i].match(/^\s*\d+\./gm) || [];
    if (stepMatches.length > 5) {
      issues.push(`UC-${i + 1} has ${stepMatches.length} steps — max is 5`);
    }
    if (stepMatches.length < 4) {
      issues.push(`UC-${i + 1} has only ${stepMatches.length} steps — min is 4`);
    }
  }
  
  // Check uniqueness — first step of each UC must differ
  const firstSteps = ucs.map(uc => {
    const match = uc.match(/^\s*1\.\s*(.+)/m);
    return match ? match[1].trim().slice(0, 50) : "";
  }).filter(s => s.length > 0);
  
  const unique = new Set(firstSteps);
  if (unique.size < firstSteps.length && firstSteps.length > 1) {
    issues.push("Duplicate first steps detected across use cases");
  }
  
  // Check for step reuse across UCs
  const allSteps: string[] = [];
  for (let i = 0; i < ucs.length; i++) {
    const steps = (ucs[i].match(/^\s*\d+\..+/gm) || [])
      .map(s => s.replace(/^\s*\d+\.\s*/, "").trim().toLowerCase().slice(0, 40));
    
    for (const step of steps) {
      if (allSteps.includes(step)) {
        issues.push(`Duplicate step across UCs: "${step}"`);
      }
      allSteps.push(step);
    }
  }
  
  return { valid: issues.length === 0, issues };
}

// ── Word count enforcement ────────────────────────────────────────────────────
function enforceUCWordLimit(content: string): string {
  const words = content.trim().split(/\s+/).length;
  
  if (words <= 200) {
    console.log(`[UC Word Guard] ${words} words — within 200 limit`);
    return content;
  }
  
  console.warn(`[UC Word Guard] Generated ${words} words — exceeds 200 limit. Trimming verbose phrasing.`);
  
  // Aggressive trimming for strict 1-page limit
  let trimmed = content
    // Remove "The Actor MUST" / "The system SHALL" boilerplate
    .replace(/The\s+\w+\s+(?:MUST|SHALL|SHOULD|MAY)\s+/gi, "")
    .replace(/\b(?:MUST|SHALL|SHOULD)\s+/gi, "")
    // Remove "in order to"
    .replace(/\bin order to\b/gi, "to")
    // Remove "as well as"
    .replace(/\bas well as\b/gi, "and")
    // Remove "in the event that"
    .replace(/\bin the event that\b/gi, "if")
    // Remove "for the purpose of"
    .replace(/\bfor the purpose of\b/gi, "to")
    // Remove "including fields for"
    .replace(/,?\s*including fields for[^.]+/gi, "")
    // Remove "such as" and examples
    .replace(/,?\s*such as[^.]+/gi, "")
    // Collapse multiple spaces
    .replace(/  +/g, " ")
    // Trim each line
    .split("\n")
    .map(line => line.trim())
    .join("\n");
  
  const trimmedWords = trimmed.trim().split(/\s+/).length;
  console.log(`[UC Word Guard] After auto-trim: ${trimmedWords} words`);
  
  // If still over limit, truncate aggressively
  if (trimmedWords > 200) {
    console.warn(`[UC Word Guard] Still over limit after trim (${trimmedWords} words), truncating to 200 words`);
    const wordArray = trimmed.split(/\s+/);
    trimmed = wordArray.slice(0, 200).join(" ") + "\n(Content truncated to meet 1-page PDF constraint)";
  }
  
  return trimmed;
}

// ── Section definitions ───────────────────────────────────────────────────────
const BRD_SECTIONS = [
  { id: "executiveSummary",    prompt: `You are a senior business analyst. Analyze the source evidence and write a comprehensive Executive Summary.

CONTEXT EXTRACTION (analyze first):
- System/product being discussed
- Industry/domain
- Primary problem being solved
- Key regulatory/compliance drivers
- High-level solution approach

STRUCTURE (300-400 words, 4-5 paragraphs):
Paragraph 1: Problem statement - What pain points are mentioned? What is the current situation?
Paragraph 2: Scope - What will the system do? What is explicitly excluded?
Paragraph 3: Key drivers - What regulatory, business, or compliance factors drive this?
Paragraph 4: Solution approach - How will this be addressed? What is the high-level strategy?
Paragraph 5: Expected impact - What outcomes are anticipated?

CRITICAL TRACEABILITY RULES:
- EVERY sentence MUST end with [SOURCE:N] citation
- EVERY statement MUST be grounded in source evidence
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- Do NOT fabricate requirements

WRITING RULES:
- Use detailed, explanatory prose (60-100 words per paragraph)
- Provide context and background
- Explain significance and implications

EXAMPLE STYLE:
"This project addresses critical aspects of occupational safety and health, focusing on ergonomic hazards, heat-related illnesses, and their enforcement within diverse work environments [SOURCE:1]. A primary objective is to enhance clarity and consistency in regulatory treatment, particularly concerning emerging technologies such as goods-to-person systems, where specific guidance on workstation design is currently on the agenda [SOURCE:2]."

OUTPUT: 300-400 words, complete sentences, 100% traceable with [SOURCE:N] on every sentence` },

  { id: "stakeholderRegister", prompt: `You are a senior business analyst. Extract ALL stakeholders from the source evidence.

EXTRACT every role mentioned or implied. For each stakeholder provide:

FORMAT (pipe-delimited):
Role Title | Responsibilities | Goals/Motivations | Pain Points | Priority | Availability

FIELD REQUIREMENTS:
- Role Title: Exact name from source or implied role (e.g., if "admin panel" mentioned, add "System Administrator")
- Responsibilities: What they do (40-80 chars)
- Goals/Motivations: What they want to achieve (30-60 chars)
- Pain Points: Problems they face mentioned in source (30-60 chars)
- Priority: High / Medium / Low (based on involvement in source)
- Availability: When/how they participate (20-50 chars)

CRITICAL TRACEABILITY RULES:
- EVERY stakeholder entry MUST include [SOURCE:N] at the end of the line
- EVERY field MUST be grounded in source evidence
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient info, flag: [NEEDS STAKEHOLDER INPUT: <question>]

EXAMPLE:
Robert Kwiatkowski | Seeks clarification on standards development and regulatory analysis | Understand regulatory implications | Uncertainty about compliance requirements | High | Present and actively participating
Patricia Sousa | Represents small employer concerns about wait times | Reduce consultation delays | Long wait times impact business | High | Present and actively participating
OSHA Compliance Officer | Conducts inspections and enforces regulations | Ensure workplace safety | Complex evaluation of emerging technologies | High | Full-time during business hours

RULES:
- Extract EVERY role mentioned or implied in source (aim for 8-10)
- Include both explicit roles and implied roles
- Provide detailed, descriptive information for each field
- Ground in source evidence
- If insufficient info, flag: [NEEDS STAKEHOLDER INPUT: <question>]

OUTPUT: 8-10 stakeholders minimum, all fields complete` },

  { id: "functionalReqs", prompt: `You are a senior systems architect. Extract ALL functional requirements from source evidence.

Extract every capability, workflow, rule, and behavior described.

FORMAT (simple, concise):
FR-001: The system shall [complete requirement statement]. [SOURCE:N]
FR-002: The system shall [complete requirement statement]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY requirement MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- 100% TRACEABILITY REQUIRED

RULES FOR REQUIREMENTS:
- Use "shall" for all requirements (lowercase)
- Write complete, self-contained requirement statements
- Each requirement is ONE line only
- No rationale, no acceptance criteria, no priority - just the requirement
- Be specific and measurable
- Include exact values, thresholds, and constraints from source
- Minimum 12-18 requirements

EXAMPLE:
FR-001: The system shall analyze the intersection of ergonomics standards with powered industrial truck standards. [SOURCE:2]
FR-002: The system shall analyze the intersection of ergonomics standards with walking working surfaces standards. [SOURCE:3]
FR-003: The system shall analyze the intersection of ergonomics standards with general industry standards for machinery and equipment guarding. [SOURCE:4]
FR-004: The system shall facilitate formal coordination between regulatory frameworks and inspection processes. [SOURCE:5]
FR-005: The system shall evaluate whether the combination of engineering controls, administrative controls, and incentive structures results in worker exposure to hazard levels above design limits. [SOURCE:6]

OUTPUT: 12-18 requirements, one line each, 100% traceable with [SOURCE:N]` },

  { id: "nfrReqs", prompt: `You are a senior systems architect. Extract ALL non-functional requirements (quality attributes) from source evidence.

FORMAT (simple, concise):
NFR-001: [Category] - The system shall [complete requirement statement]. [SOURCE:N]
NFR-002: [Category] - The system shall [complete requirement statement]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY NFR MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- 100% TRACEABILITY REQUIRED

RULES FOR NFRs:
- Use "shall" for all requirements (lowercase)
- Write complete, self-contained requirement statements
- Each NFR is ONE line only
- No rationale, no acceptance criteria, no priority - just the requirement
- Include specific measurable targets from source
- Categories: Performance, Security, Scalability, Availability, Compliance, Usability
- Minimum 6-8 NFRs

EXAMPLE:
NFR-001: Performance - The system shall process all consultation program requests and associated data within 24 hours of submission. [SOURCE:2]
NFR-002: Security - The system shall ensure that all data related to employer participation in the On-Site Consultation Program remains confidential and is not shared with enforcement entities. [SOURCE:3]
NFR-003: Scalability - The system shall support an increasing number of participating employers and diverse warehousing operational models without degradation of service or compliance effectiveness. [SOURCE:7]
NFR-004: Availability - The system shall be accessible to authorized users for 99.5% of scheduled operational hours, excluding planned maintenance. [SOURCE:8]
NFR-005: Compliance - The system shall facilitate compliance with OSHA ergonomics standards and recordkeeping requirements. [SOURCE:9]

OUTPUT: 6-8 NFRs, one line each, 100% traceable with [SOURCE:N]` },

  { id: "assumptions", prompt: `You are a senior business analyst. Extract assumptions and constraints from source evidence.

CRITICAL TRACEABILITY RULES:
- EVERY assumption MUST end with [SOURCE:N]
- EVERY constraint MUST end with [SOURCE:N]
- EVERY basis statement MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]

ASSUMPTIONS (things believed true but not verified):
FORMAT:
ASSM-001: [Statement]. [SOURCE:N]
Basis: [What in source implies this]. [SOURCE:N]

CONSTRAINTS (non-negotiable boundaries):
FORMAT:
CONS-001: [Statement]. [SOURCE:N]
Type: Technical / Legal / Operational / Budget
Basis: [What in source establishes this]. [SOURCE:N]

EXAMPLE ASSUMPTIONS:
ASSM-001: Employers have basic computer literacy to use the consultation request system. [SOURCE:3]
Basis: Source discusses online consultation requests without mentioning training needs. [SOURCE:3]

EXAMPLE CONSTRAINTS:
CONS-001: The system must comply with OSHA confidentiality requirements under 29 CFR 1908. [SOURCE:7]
Type: Legal
Basis: Source explicitly references this regulation as mandatory. [SOURCE:7]

RULES:
- Minimum 4-6 assumptions
- Minimum 3-5 constraints
- Ground in source evidence
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]

OUTPUT: All assumptions and constraints with basis` },

  { id: "successMetrics", prompt: `You are a senior business analyst. Extract ALL success metrics from source evidence.

FORMAT (simple, concise):
METRIC-001 | [Metric Name] | [Target/Goal] | [Measurement description] | [SOURCE:N]
METRIC-002 | [Metric Name] | [Target/Goal] | [Measurement description] | [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY metric line MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- 100% TRACEABILITY REQUIRED

RULES:
- Each metric is ONE line with pipe-delimited fields
- Include: ID, Name, Target, and brief measurement description
- Use exact values from source
- Be specific and measurable
- Minimum 5-8 metrics

EXAMPLE:
METRIC-001 | On-Site Consultation Program Participation Rate | A measurable increase in participation | The number of eligible small and medium-sized employers (fewer than 250 employees at a single site) utilizing the OSHA On-Site Consultation Program increases by at least 5% year-over-year | [SOURCE:2]
METRIC-002 | Days Away, Restricted, or Transferred (DART) Rate | At or below industry average | The facility's DART rate for NAICS 493 (warehousing and storage) is at or below the annual BLS industry average | [SOURCE:3]
METRIC-003 | Total Case Incident Rate (TCIR) | At or below industry average | The facility's TCIR for NAICS 493 (warehousing and storage) is at or below the annual BLS industry average | [SOURCE:4]
METRIC-004 | Recordkeeping Accuracy Compliance | 100% compliance | Zero citations are issued for inaccurate recordkeeping during OSHA inspections | [SOURCE:5]
METRIC-005 | General Duty Clause Ergonomic Hazard Citation Rate | Reduction in citations | The number of General Duty Clause citations involving ergonomic hazards decreases by at least 10% year-over-year | [SOURCE:6]

OUTPUT: 5-8 metrics, one line each, 100% traceable with [SOURCE:N]` },

  { id: "externalInterfaces", prompt: `You are a senior systems architect. Extract ALL external interfaces from source evidence.

FORMAT (simple, concise):
INT-001: [Name] - [Type] - [Brief description]. [SOURCE:N]
INT-002: [Name] - [Type] - [Brief description]. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY interface MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- 100% TRACEABILITY REQUIRED

RULES:
- Each interface is ONE line
- Format: ID, Name, Type (Hardware/Data/Protocol), and brief description
- Be specific about what the interface does
- Minimum 5-8 interfaces

EXAMPLE:
INT-001: Goods-to-person systems - Hardware - These are physical systems used in highly automated environments for material handling. [SOURCE:2]
INT-002: OSHA Website - Data - This website provides information regarding the OSHA On-Site Consultation Program and other resources. [SOURCE:3]
INT-003: BLS (Bureau of Labor Statistics) - Data - This external entity publishes industry-level DART and TCIR rates annually. [SOURCE:4]
INT-004: NAICS Code - Data - This is a standard classification system used by BLS for publishing industry-level DART and TCIR rates. [SOURCE:5]
INT-005: ISO Standards on Workstation Design - Protocol - These are external standards providing guidance on workstation design. [SOURCE:6]
INT-006: ANSI Standards on Workstation Design - Protocol - These are external standards providing guidance on workstation design. [SOURCE:7]
INT-007: NIOSH Lifting Equation - Data - This is a methodology that remains relevant for evaluating lifting tasks, even in high-repetition low-weight scenarios. [SOURCE:8]
INT-008: Automation Vendors' Ergonomic Implementation Guidance - Data - This refers to published guidance from large automation vendors on ergonomic implementation. [SOURCE:9]

OUTPUT: 5-8 interfaces, one line each, 100% traceable with [SOURCE:N]` },

  /**
   * USE CASE SECTION — ENHANCED BEYOND IEEE 830 BASELINE
   * 
   * IEEE 830 standard requires: Actor, Purpose, Event Flow, Special Conditions.
   * 
   * DocuMind implements an enhanced 7-component UC structure:
   *   1. UC-ID (unique identifier)
   *   2. Actor (primary user/system) — IEEE 830 required
   *   3. Purpose (one-sentence goal) — IEEE 830 required
   *   4. Preconditions (3 required conditions) — ENHANCEMENT
   *   5. Main Event Flow (4-8 detailed steps) — ENHANCEMENT over basic event flow
   *   6. Postconditions (3 outcomes) — ENHANCEMENT
   *   7. Alternative + Exception Flows — maps to IEEE 830 "special conditions"
   * 
   * Rationale: The enhanced structure aligns with UML 2.5 Use Case specification
   * and provides richer traceability for the audit system. The domain-aware
   * prompt selection ensures use cases match the source material domain
   * (software vs policy/regulatory vs business process).
   */
  { id: "useCases", prompt: "" }, // Will be set dynamically based on domain

  { id: "glossary", prompt: `You are a senior business analyst. Create a comprehensive glossary of ALL domain-specific terms.

FORMAT (simple, concise):
TERM — Definition. [SOURCE:N]

CRITICAL TRACEABILITY RULES:
- EVERY definition MUST end with [SOURCE:N]
- Do NOT write ANY content without a [SOURCE:N] citation
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- 100% TRACEABILITY REQUIRED

RULES:
- Each term is ONE line: Term, em-dash, definition, source
- Write clear, concise definitions (30-60 words)
- Use formal, objective language
- Include technical terms, acronyms, regulations, role titles
- Minimum 15-20 terms

EXAMPLE:
Hazard — A condition or situation in the workplace that the employer failed to keep free of, and which was causing or likely to cause death or serious physical harm. [SOURCE:2]
Recognized Hazard — A hazard that the employer knew or should have known about. This is evidenced by a pattern of evidence suggesting its existence, employer awareness, and the absence of practical abatement steps. [SOURCE:3]
Abatement — Practical steps or a feasible and useful method to correct a recognized hazard. [SOURCE:2]
Ergonomics Program — A facility-level program that conducts job hazard analyses, tracks injury data, and uses that data to drive interventions. [SOURCE:4]
On-Site Consultation Program — A free, confidential program offered by OSHA for small and medium-sized employers with fewer than 250 employees at a single site, designed to help identify and correct hazards without sharing findings with enforcement or using them as a basis for citation. [SOURCE:5]

OUTPUT: 15-20 terms, one line each, 100% traceable with [SOURCE:N]` },
];

// ── Text cleaner ──────────────────────────────────────────────────────────────
function cleanSection(text: string): string {
  return text
    .split("\n")
    .map(line => line
      .replace(/\[SOURCE:\d+\]/g, "")
      .replace(/\[SOURCE:\d*/g, "")
      .replace(/\[SOURCE$/g, "")
      .replace(/\s*\[$/g, "")
      .replace(/\]$/g, "")
      .replace(/^\]/g, "")
      .replace(/,{2,}/g, "")
      .replace(/\s,\s/g, " ")
      .replace(/,\s*$/g, "")
      .replace(/^\d+\s*$/, "")
      .replace(/^[,.\]\[;:\s]+$/, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .trim()
    )
    .filter(line =>
      line.length > 10 &&
      !line.match(/^[\]\[,.\s]+$/) &&
      !line.match(/^\d+$/) &&
      !line.match(/^,+$/) &&
      !line.match(/^===SECTION:/)
    )
    .join("\n")
    .trim();
}

// ── Parse citations from raw section text ─────────────────────────────────────
function parseCitations(
  rawContent: string,
  snippetIds: string[],
  snippets: Array<{ text: string; id: string; metadata: any }>
) {
  const citations: Record<string, string[]> = {};
  const sentenceEvidence: Record<string, any[]> = {};

  for (const line of rawContent.split("\n")) {
    const matches = line.match(/\[SOURCE:(\d+)\]/g);
    if (!matches) continue;
    const clean = line
      .replace(/\[SOURCE:\d+\]/g, "")
      .replace(/\[SOURCE:\d*/g, "")
      .replace(/\s*\[$/g, "")
      .trim();
    if (clean.length < 10) continue;

    const items = matches
      .map(m => parseInt(m.replace(/\D/g, "")) - 1)
      .filter(i => i >= 0 && i < snippetIds.length)
      .map(i => ({ snippetId: snippetIds[i], text: snippets[i].text, metadata: snippets[i].metadata }));

    citations[clean] = items.map(e => e.snippetId);
    sentenceEvidence[clean] = items;
  }
  return { citations, sentenceEvidence };
}

// ── Generate a single section with direct approach ───────────────────────────
async function generateSection(
  section: typeof BRD_SECTIONS[0],
  snippets: Array<{ text: string; id: string; metadata: any }>,
  model: any
): Promise<{ id: string; content: string; rawContent: string; snippetIds: string[]; snippets: typeof snippets }> {
  const snippetIds = snippets.map(s => s.id);
  const evidenceText = snippets.map((s, i) => `[SOURCE:${i + 1}] ${s.text}`).join("\n\n");
  
  const fullPrompt = `${section.prompt}

EVIDENCE:
${evidenceText}

Generate the section content now. Follow the format and rules exactly.`;

  try {
    const result = await model.generateContent(fullPrompt);
    const rawContent = result.response.text();
    const content = cleanSection(rawContent);
    
    return {
      id: section.id,
      content,
      rawContent,
      snippetIds,
      snippets
    };
  } catch (error) {
    console.error(`Section generation failed for ${section.id}:`, error);
    return {
      id: section.id,
      content: "",
      rawContent: "",
      snippetIds: [],
      snippets: []
    };
  }
}

/**
 * USE CASE DIAGRAM GENERATION — MERMAID.JS CLIENT-SIDE RENDERING
 * 
 * Generates Mermaid.js syntax for use case diagrams. The diagram is rendered
 * client-side in the browser using Mermaid.js library, eliminating external
 * server dependencies and enabling offline-capable diagram generation.
 * 
 * This approach provides:
 * - Zero external HTTP calls (no PlantUML server dependency)
 * - Offline-capable rendering
 * - Faster generation (no network latency)
 * - Better security (no data sent to external servers)
 */

// ── Generate Mermaid.js use case diagram from generated UC content ───────────
async function generateUseCaseDiagram(
  useCaseContent: string,
  snippets: Array<{ text: string; id: string; metadata: any }>,
  model: any
): Promise<{ mermaidSyntax: string; ucTraceability: Record<string, string[]> }> {
  // Extract UC titles and actors from the generated use case content
  const prompt = `Generate a Mermaid.js use case diagram from the use cases below.

USE CASES:
${useCaseContent}

INSTRUCTIONS:
1. Extract the 3 use case titles (UC-001, UC-002, UC-003) EXACTLY as written
2. Extract the actors EXACTLY as written
3. Generate ONLY the Mermaid.js flowchart syntax - no explanations, no markdown fences

OUTPUT FORMAT (use this exact syntax):
flowchart LR
    subgraph System
        UC1["UC-001: [Exact Title from Use Cases]"]
        UC2["UC-002: [Exact Title from Use Cases]"]
        UC3["UC-003: [Exact Title from Use Cases]"]
    end
    
    Actor1(["👤 [Exact Actor Name from UC-001]"]) --> UC1
    Actor2(["👤 [Exact Actor Name from UC-002]"]) --> UC2
    Actor3(["👤 [Exact Actor Name from UC-003]"]) --> UC3

CRITICAL RULES:
- Use EXACT titles and actor names from the use cases above
- Use flowchart LR (left-to-right)
- All use cases inside "subgraph System"
- Format: UC1["UC-001: Exact Title"]
- Human actors: (["👤 Name"])
- System actors: (["⚙️ Name"])
- Connect with arrows: Actor1 --> UC1
- Return ONLY the Mermaid syntax, nothing else
- Each UC must have its own actor connection`;

  let mermaidSyntax = "";

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    
    // Remove markdown code fences if present
    mermaidSyntax = raw
      .replace(/```mermaid\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    
    // Validate it starts with flowchart
    if (!mermaidSyntax.startsWith("flowchart")) {
      console.warn("[UC Diagram] Invalid syntax, using fallback");
      // Fallback: create a simple diagram
      mermaidSyntax = `flowchart LR
    subgraph System
        UC1["UC-001: Primary Use Case"]
        UC2["UC-002: Secondary Use Case"]
        UC3["UC-003: Tertiary Use Case"]
    end
    Actor1(["👤 User"]) --> UC1
    Actor2(["👤 Stakeholder"]) --> UC2
    Actor3(["👤 Administrator"]) --> UC3`;
    }
  } catch (e: any) {
    console.error("[UC Diagram] Generation failed:", e.message);
    // Fallback diagram
    mermaidSyntax = `flowchart LR
    subgraph System
        UC1["UC-001: Primary Use Case"]
        UC2["UC-002: Secondary Use Case"]
        UC3["UC-003: Tertiary Use Case"]
    end
    Actor1(["👤 User"]) --> UC1
    Actor2(["👤 Stakeholder"]) --> UC2
    Actor3(["👤 Administrator"]) --> UC3`;
  }

  // Build UC traceability: map UC IDs to snippet IDs that generated them
  const ucTraceability: Record<string, string[]> = {};
  const ucMatches = mermaidSyntax.matchAll(/UC\d+\["(UC-\d+):/g);
  for (const m of ucMatches) {
    ucTraceability[m[1]] = snippets.map(s => s.id);
  }

  return { mermaidSyntax, ucTraceability };
}

// ── Diagram coverage score ────────────────────────────────────────────────────
function computeDiagramCoverage(functionalReqs: string, mermaidSyntax: string): number {
  if (!mermaidSyntax || !functionalReqs) return 0;
  const frLines = functionalReqs.split("\n").filter(l => /^FR-\d+/.test(l.trim()));
  if (frLines.length === 0) return 100;
  const ucCount = (mermaidSyntax.match(/UC\d+\["/g) || []).length;
  const mapped = Math.min(frLines.length, ucCount);
  return Math.round((mapped / frLines.length) * 100);
}

// ── Main Cloud Function ───────────────────────────────────────────────────────
export const generateBrd = onCall(
  {
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 300,
    memory: "512MiB",
    cors: true,
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const { projectId, selectedFiles } = data;
    if (!projectId) throw new Error("projectId is required");

    const key = GEMINI_API_KEY.value();
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    const genAI = new GoogleGenerativeAI(key);
    
    // Use balanced token limits for performance
    const createModelForSection = (sectionId: string) => {
      const maxTokens = SECTION_TOKEN_LIMITS[sectionId] || 2048;
      return genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { 
          temperature: 0.4,  // Balanced creativity
          maxOutputTokens: maxTokens,  // Use configured limits
          topP: 0.95,
        },
      });
    };
    
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048, topP: 0.95 },
    });

    // ── Step 1: Retrieve per-section snippets in parallel (Fix 2: increased snippet counts) ──────────────────
    console.log("Retrieving per-section snippets in parallel...");
    const retrievalStartTime = performance.now();
    
    const snippetResults = await Promise.allSettled(
      BRD_SECTIONS.map(s => {
        const snippetCount = SNIPPETS_PER_SECTION[s.id] || 8;
        return retrieveForSection(s.id, projectId, key, snippetCount, selectedFiles);
      })
    );

    const retrievalTimeMs = performance.now() - retrievalStartTime;
    console.log(`[BRD Generation Performance] Retrieved snippets for ${BRD_SECTIONS.length} sections in ${retrievalTimeMs.toFixed(2)}ms`);

    const sectionSnippets = BRD_SECTIONS.map((s, i) => {
      const r = snippetResults[i];
      return r.status === "fulfilled" ? r.value : [];
    });

    // Validate we have at least some snippets
    const totalSnippets = sectionSnippets.reduce((n, arr) => n + arr.length, 0);
    if (totalSnippets === 0) {
      throw new Error("No snippets found for this project. Upload documents first before generating a BRD.");
    }

    // ── Step 2: Detect domain for use case generation ─────────────────────
    console.log("Detecting domain for use case generation...");
    const useCaseSnippets = sectionSnippets[BRD_SECTIONS.findIndex(s => s.id === "useCases")];
    const detectedDomain = await detectDomain(useCaseSnippets, model);
    console.log(`[BRD Generation] Detected domain: ${detectedDomain}`);
    
    // Set use case prompt based on detected domain
    const useCaseSectionIndex = BRD_SECTIONS.findIndex(s => s.id === "useCases");
    BRD_SECTIONS[useCaseSectionIndex].prompt = getUseCasePrompt(detectedDomain, useCaseSnippets);

    // ── Step 3: Generate all 9 sections WITHOUT validation initially ───────
    console.log("Generating all 9 sections in parallel...");
    const generationStartTime = performance.now();

    // Generate all sections in parallel with section-specific models
    const sectionResults = await Promise.allSettled(
      BRD_SECTIONS.map(async (section, index) => {
        const sectionModel = createModelForSection(section.id);
        return await generateSection(section, sectionSnippets[index], sectionModel);
      })
    );

    // ── Step 4: Assemble sections object ──────────────────
    const sections: Record<string, string> = {};
    const allCitations: Record<string, any> = {};
    const allSentenceEvidence: Record<string, any> = {};

    for (let i = 0; i < BRD_SECTIONS.length; i++) {
      const s = BRD_SECTIONS[i];
      const r = sectionResults[i];

      if (r.status === "fulfilled" && r.value.content) {
        const { content, rawContent, snippetIds, snippets } = r.value;
        sections[s.id] = content;
        const { citations, sentenceEvidence } = parseCitations(rawContent, snippetIds, snippets);
        allCitations[s.id] = citations;
        allSentenceEvidence[s.id] = sentenceEvidence;
      } else {
        sections[s.id] = "";
        allCitations[s.id] = {};
        allSentenceEvidence[s.id] = {};
        if (r.status === "rejected") {
          console.warn(`Section ${s.id} rejected:`, r.reason);
        }
      }
    }
    
    // ── Step 4.5: Apply cross-section deduplication (Fix 5) ───────────────
    console.log("Applying cross-section deduplication...");
    const deduplicationResult = deduplicateCrossSections(sections);
    Object.assign(sections, deduplicationResult.sections);
    console.log(`[Deduplication] Removed ${deduplicationResult.duplicatesRemoved} duplicate facts across sections`);

    // Generate diagram from the generated use case content (ensures 100% traceability)
    const useCaseContent = sections.useCases || "";
    const diagramResult = await generateUseCaseDiagram(useCaseContent, useCaseSnippets, model);

    const generationTimeMs = performance.now() - generationStartTime;
    console.log(`[BRD Generation Performance] Generated all sections and diagram in ${generationTimeMs.toFixed(2)}ms`);

    // ── Step 5: Simple validation without regeneration ───────
    console.log("Running simple validation checks...");
    const validationIssues: string[] = [];
    
    for (const [sectionId, content] of Object.entries(sections)) {
      // Only log issues, don't regenerate
      const lastChar = content.trim().slice(-1);
      if (content.length > 10 && ![".", "!", "?", "]", "|"].includes(lastChar)) {
        const issue = `Section ${sectionId} may be truncated — ends with '${lastChar}'`;
        console.warn(`[BRD Generation] ${issue}`);
        validationIssues.push(issue);
      }
      
      if (content.length < 50) {
        const issue = `Section ${sectionId} is very short (${content.length} chars)`;
        console.warn(`[BRD Generation] ${issue}`);
        validationIssues.push(issue);
      }
    }

    // Fill any completely missing sections with placeholder
    for (const s of BRD_SECTIONS) {
      if (!sections[s.id]) {
        sections[s.id] = "Section could not be generated from available evidence.";
      }
    }

    // ── Step 5.5: UC-specific validation and word count enforcement ───────
    if (sections.useCases) {
      console.log("Validating use cases...");
      
      // Apply word count enforcement
      sections.useCases = enforceUCWordLimit(sections.useCases);
      
      // Validate UC content
      const ucValidation = validateUseCases(sections.useCases);
      if (!ucValidation.valid) {
        console.warn("[UC Validator] Issues found:", ucValidation.issues);
        validationIssues.push(...ucValidation.issues);
        
        // Attempt regeneration if critical issues found
        const hasCriticalIssues = ucValidation.issues.some(issue => 
          issue.includes("Banned software pattern") || 
          issue.includes("Duplicate first steps")
        );
        
        if (hasCriticalIssues) {
          console.log("[UC Validator] Critical issues detected, attempting regeneration...");
          const useCaseSectionIndex = BRD_SECTIONS.findIndex(s => s.id === "useCases");
          if (useCaseSectionIndex >= 0) {
            try {
              // Add feedback to prompt
              const feedbackPrompt = `
PREVIOUS ATTEMPT HAD THESE ISSUES:
${ucValidation.issues.join("\n")}

YOU MUST FIX THESE ISSUES IN THIS REGENERATION.`;
              
              const originalPrompt = BRD_SECTIONS[useCaseSectionIndex].prompt;
              BRD_SECTIONS[useCaseSectionIndex].prompt = originalPrompt + feedbackPrompt;
              
              const regenerated = await generateSection(
                BRD_SECTIONS[useCaseSectionIndex],
                sectionSnippets[useCaseSectionIndex],
                model
              );
              
              // Restore original prompt
              BRD_SECTIONS[useCaseSectionIndex].prompt = originalPrompt;
              
              // Apply word count enforcement again
              sections.useCases = enforceUCWordLimit(regenerated.content);
              
              const { citations, sentenceEvidence } = parseCitations(
                regenerated.rawContent,
                regenerated.snippetIds,
                regenerated.snippets
              );
              allCitations.useCases = citations;
              allSentenceEvidence.useCases = sentenceEvidence;
              
              console.log("[UC Validator] Successfully regenerated use cases");
            } catch (regenError) {
              console.error("[UC Validator] Regeneration failed:", regenError);
            }
          }
        }
      } else {
        console.log("[UC Validator] Use cases passed validation");
      }
    }

    // ── Step 6: Save to Firestore ──────────────────────────────────────────
    const versionsSnapshot = await db.collection("brdVersions")
      .where("projectId", "==", projectId)
      .orderBy("versionNumber", "desc")
      .limit(1)
      .get();

    const versionNumber = versionsSnapshot.empty
      ? 1.0
      : Math.floor((versionsSnapshot.docs[0].data().versionNumber || 1.0)) + 1.0;

    const version = `v${versionNumber.toFixed(1)}`;

    // Compute diagram coverage and include in quality score
    const diagramCoverage = computeDiagramCoverage(
      sections.functionalReqs || "",
      diagramResult.mermaidSyntax
    );

    // ── Rigorous quality scoring with independent evaluator (Requirement 4.1, 4.2) ───────────────────────────────────────────
    const qualityResult = await computeRigorousScore({
      sections,
      openConflictCount: 0,
      diagramCoverage,
      version,
    }, key); // Pass API key to enable independent quality scoring

    // Flatten to legacy shape so existing UI reads total/completeness/etc.
    const qualityScore = {
      total: qualityResult.composite,
      completeness: qualityResult.completeness.total,
      consistency: qualityResult.consistency.total,
      clarity: qualityResult.clarity.total,
      grade: qualityResult.grade,
      diagramCoverage,
      breakdown: {
        completeness: qualityResult.completeness.breakdown,
        consistency: qualityResult.consistency.breakdown,
        clarity: qualityResult.clarity.breakdown,
      },
    };

    const versionRef = await db.collection("brdVersions").add({
      projectId,
      version,
      versionNumber,
      sections,
      citations: allCitations,
      sentenceEvidence: allSentenceEvidence,
      useCaseDiagramMermaid: diagramResult.mermaidSyntax || "", // Mermaid syntax for client-side rendering
      ucTraceability: diagramResult.ucTraceability || {},
      diagramCoverage,
      detectedDomain, // Store detected domain for reference
      validationIssues, // Store any validation issues
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      status: "draft",
      qualityScore,
      openConflictCount: 0,
      conflictStatus: "pending",
      changeLog: `Generated ${version}`,
    });

    await db.collection("projects").doc(projectId).update({
      currentBrdVersionId: versionRef.id,
      updatedAt: new Date().toISOString(),
    });

    // ── Persist score history ──────────────────────────────────────────────
    await db.collection("brdVersions").doc(versionRef.id)
      .collection("qualityScores").doc(version).set({
        ...qualityResult,
        savedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(`BRD ${version} saved. Quality: ${qualityScore.total} (${qualityScore.grade}). Domain: ${detectedDomain}. Returning to client.`);

    // Log overall performance summary
    const totalTimeMs = performance.now() - retrievalStartTime;
    console.log(`[BRD Generation Performance] SUMMARY:`);
    console.log(`  - Total Time: ${totalTimeMs.toFixed(2)}ms`);
    console.log(`  - Retrieval Phase: ${retrievalTimeMs.toFixed(2)}ms (${((retrievalTimeMs/totalTimeMs)*100).toFixed(1)}%)`);
    console.log(`  - Generation Phase: ${generationTimeMs.toFixed(2)}ms (${((generationTimeMs/totalTimeMs)*100).toFixed(1)}%)`);
    console.log(`  - Sections Generated: ${BRD_SECTIONS.length}`);
    console.log(`  - Total Snippets Used: ${totalSnippets}`);
    console.log(`  - Quality Score: ${qualityScore.total}/100 (${qualityScore.grade})`);
    console.log(`  - Detected Domain: ${detectedDomain}`);
    console.log(`  - Validation Issues: ${validationIssues.length}`);

    // ── Step 7: Fire-and-forget two-phase conflict detection ──────────────
    runTwoPhaseDetection(projectId, versionRef.id, key, genAI).catch(err =>
      console.error("Background conflict detection failed:", err)
    );

    return { brdVersionId: versionRef.id, version, versionNumber, sections, qualityScore, useCaseDiagramMermaid: diagramResult.mermaidSyntax || "", diagramCoverage };
  }
);

// (conflict detection handled by twoPhaseConflictDetector.ts)

// (quality scoring is handled by scoreQuality.ts)
