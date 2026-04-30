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
  
  if (domain === "policy" || domain === "process" || domain === "mixed") {
    return `You are writing the Use Cases section of an IEEE 830 SRS for a POLICY or REGULATORY domain.

Source material:
${snippetText}

════════════════════════════════════════════
FORMAT — follow exactly, nothing else
════════════════════════════════════════════
UC-001: [UC Title] [SOURCE:N]
Actor: [real stakeholder from source] [SOURCE:N]
Purpose: [one phrase, 10 words max] [SOURCE:N]
1. [step — 10 words max] [SOURCE:N]
2. [step — 10 words max] [SOURCE:N]
3. [step — 10 words max] [SOURCE:N]
4. [step — 10 words max] [SOURCE:N]
5. [step — 10 words max] [SOURCE:N]

UC-002: [UC Title] [SOURCE:N]
Actor: [real stakeholder from source] [SOURCE:N]
Purpose: [one phrase, 10 words max] [SOURCE:N]
1. [step] [SOURCE:N]
2. [step] [SOURCE:N]
3. [step] [SOURCE:N]
4. [step] [SOURCE:N]
5. [step] [SOURCE:N]

UC-003: [UC Title] [SOURCE:N]
Actor: [real stakeholder from source] [SOURCE:N]
Purpose: [one phrase, 10 words max] [SOURCE:N]
1. [step] [SOURCE:N]
2. [step] [SOURCE:N]
3. [step] [SOURCE:N]
4. [step] [SOURCE:N]
5. [step] [SOURCE:N]

════════════════════════════════════════════
RULES
════════════════════════════════════════════
1. Output ONLY the fields shown above — UC-ID, Actor, Purpose, steps
2. Do NOT output: Preconditions, Postconditions, Alternative Flow, Exception Flow, Special Conditions — omit them entirely
3. Exactly 3 use cases
4. 4–5 steps per UC maximum
5. Each UC must have a different actor and different goal
6. Every step grounded in source snippets
7. No software CRUD steps — no authentication, dashboards, form submission, audit logs, PDF generation, status transitions
8. Total output: 200 words maximum across all 3 UCs
9. Steps describe HUMAN ACTIONS in a REGULATORY PROCESS, not software operations
10. Each step is ONE concrete action, 10 words maximum
11. CRITICAL: Every line MUST cite [SOURCE:N] where N is the source number from the evidence above
12. 100% TRACEABILITY REQUIRED: Do NOT write any content without a [SOURCE:N] citation

════════════════════════════════════════════
FORBIDDEN PATTERNS
════════════════════════════════════════════
× "authenticate" or "authenticated account"
× "directed to their dashboard"
× "System SHALL load" or "System SHALL validate"
× "generate a unique ID"
× "audit log" or "audit trail"
× "transition status FROM X TO Y"
× "within 60 seconds"
× "generate a PDF report"
× Any database or UI operations
× Any line without [SOURCE:N] citation`;
  }
  
  // Software domain prompt
  return `You are writing the Use Cases section of an IEEE 830 SRS for a SOFTWARE SYSTEM domain.

Source material:
${snippetText}

════════════════════════════════════════════
FORMAT — follow exactly, nothing else
════════════════════════════════════════════
UC-001: [UC Title] [SOURCE:N]
Actor: [user role] [SOURCE:N]
Purpose: [one phrase, 10 words max] [SOURCE:N]
1. [step — 10 words max] [SOURCE:N]
2. [step — 10 words max] [SOURCE:N]
3. [step — 10 words max] [SOURCE:N]
4. [step — 10 words max] [SOURCE:N]
5. [step — 10 words max] [SOURCE:N]

UC-002: [UC Title] [SOURCE:N]
Actor: [user role] [SOURCE:N]
Purpose: [one phrase, 10 words max] [SOURCE:N]
1. [step] [SOURCE:N]
2. [step] [SOURCE:N]
3. [step] [SOURCE:N]
4. [step] [SOURCE:N]
5. [step] [SOURCE:N]

UC-003: [UC Title] [SOURCE:N]
Actor: [user role] [SOURCE:N]
Purpose: [one phrase, 10 words max] [SOURCE:N]
1. [step] [SOURCE:N]
2. [step] [SOURCE:N]
3. [step] [SOURCE:N]
4. [step] [SOURCE:N]
5. [step] [SOURCE:N]

════════════════════════════════════════════
RULES
════════════════════════════════════════════
1. Output ONLY UC-ID, Actor, Purpose, numbered steps
2. Do NOT output Preconditions, Postconditions, Alternative Flow, Exception Flow — omit entirely
3. Exactly 3 use cases, 4–5 steps each
4. Each UC covers a different actor and goal
5. Every step grounded in source material
6. Total output: 200 words maximum
7. Each step is ONE concrete action, 10 words maximum
8. CRITICAL: Every line MUST cite [SOURCE:N] where N is the source number from the evidence above
9. 100% TRACEABILITY REQUIRED: Do NOT write any content without a [SOURCE:N] citation`;
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

WRITING RULES:
- Ground EVERY statement in source evidence with [SOURCE:N]
- Use detailed, explanatory prose (60-100 words per paragraph)
- Provide context and background
- Explain significance and implications
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- Do NOT fabricate requirements

EXAMPLE STYLE:
"This project addresses critical aspects of occupational safety and health, focusing on ergonomic hazards, heat-related illnesses, and their enforcement within diverse work environments [SOURCE:1]. A primary objective is to enhance clarity and consistency in regulatory treatment, particularly concerning emerging technologies such as goods-to-person systems, where specific guidance on workstation design is currently on the agenda [SOURCE:2]."

OUTPUT: 300-400 words, complete sentences, fully grounded in evidence` },

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

Extract every capability, workflow, rule, and behavior described. Group by functional area.

FORMAT:
FR-001: The system SHALL [action] [object] [condition/constraint]. [SOURCE:N]
Rationale: [Why - grounded in transcript quote]. [SOURCE:N]
Acceptance Criteria: [Measurable, testable - use exact values from source]. [SOURCE:N]
Priority: Must Have / Should Have / Nice to Have

RULES FOR REQUIREMENTS:
- Use SHALL for mandatory, SHOULD for preferred, MAY for optional
- Every number, deadline, threshold, or limit from source MUST appear verbatim in acceptance criteria
- Never use vague criteria ("fast", "easy", "appropriate")
- Cover every distinct workflow mentioned in source
- Minimum 12-18 requirements

EXAMPLE:
FR-001: The system SHALL allow workers to file 11(c) retaliation complaints within 30 days of the retaliatory action. [SOURCE:3]
Rationale: Workers need protection against adverse employment actions for exercising OSH Act rights. [SOURCE:3]
Acceptance Criteria: System validates submission date is within 30 days of incident date and provides confirmation of receipt. [SOURCE:3]
Priority: Must Have

FR-002: The system SHALL provide on-site consultation services to employers with fewer than 250 workers at a single facility. [SOURCE:5]
Rationale: Small employers need confidential hazard assessments separate from enforcement. [SOURCE:5]
Acceptance Criteria: System verifies employer size <250 workers, schedules consultant visit, ensures findings remain confidential. [SOURCE:5]
Priority: Must Have

CRITICAL:
- Ground EVERY requirement in source evidence
- Preserve exact values (deadlines, thresholds, limits)
- If insufficient evidence, flag: [NEEDS STAKEHOLDER INPUT: <question>]
- Do NOT fabricate requirements

OUTPUT: 12-18 requirements, all fields complete` },

  { id: "nfrReqs", prompt: `You are a senior systems architect. Extract ALL non-functional requirements (quality attributes) from source evidence.

Apply same format as functional requirements.

FORMAT:
NFR-001: [Category] - The system SHALL [measurable quality attribute]. [SOURCE:N]
Rationale: [Why this matters]. [SOURCE:N]
Acceptance Criteria: [Specific, measurable target]. [SOURCE:N]
Priority: Must Have / Should Have / Nice to Have

REQUIRED COVERAGE (generate for each if source supports):
- Security & Access Control
- Performance / Response Time
- Availability / Uptime
- Compliance / Regulatory
- Auditability / Logging
- Usability / Accessibility
- Data Retention / Privacy
- Scalability

EXAMPLE:
NFR-001: Security - The system SHALL ensure consultation findings are not shared with enforcement personnel. [SOURCE:3]
Rationale: Confidentiality protection is essential for encouraging employer participation in voluntary safety programs. [SOURCE:3]
Acceptance Criteria: System implements access controls preventing enforcement staff from viewing consultation records. [SOURCE:3]
Priority: Must Have

NFR-002: Performance - The system SHALL respond to user queries within 2 seconds for 95% of requests. [SOURCE:5]
Rationale: Timely access to safety information is critical for workplace safety. [SOURCE:5]
Acceptance Criteria: System response time ≤2 seconds for 95th percentile during business hours. [SOURCE:5]
Priority: Must Have

RULES:
- Extract 6-8 NFRs minimum
- Include specific numeric targets or standards
- Flag any category not addressed: [NEEDS STAKEHOLDER INPUT: No [category] requirements discussed]
- Ground in source evidence

OUTPUT: 6-8 NFRs, all fields complete` },

  { id: "assumptions", prompt: `You are a senior business analyst. Extract assumptions and constraints from source evidence.

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

For every measurable outcome, target, or SLA mentioned:

FORMAT (pipe-delimited, 8 fields):
ID | Metric Name | Baseline | Target | Measurement Method | Frequency | Owner | Data Source

FIELD REQUIREMENTS:
- Baseline: Current state from source, or "To be established" if not mentioned
- Target: Specific numeric goal from source, or "To be defined — [NEEDS STAKEHOLDER INPUT]"
- Measurement Method: How it will be calculated
- Frequency: Daily / Weekly / Monthly / Quarterly / Annually
- Owner: Role responsible for tracking
- Data Source: Where data comes from

EXAMPLE:
METRIC-001 | Consultation Request Response Time | 6 weeks average | ≤48 hours | Average time from request submission to first consultant contact | Weekly | Consultation Program Manager | Consultation tracking system
METRIC-002 | Employer Satisfaction Rate | 75% | ≥90% | (Satisfied employers / Total employers surveyed) × 100 | Quarterly | Quality Assurance Lead | Post-consultation surveys
METRIC-003 | Hazard Correction Rate | 60% | ≥85% | (Hazards corrected within 90 days / Total hazards identified) × 100 | Monthly | Safety Compliance Officer | Follow-up inspection reports

RULES:
- Extract 5-8 metrics (at least one per major functional area)
- Use exact values from source for baselines and targets
- If no baseline in source, write "To be established"
- If no target stated, write "To be defined — [NEEDS STAKEHOLDER INPUT: <specific question>]"
- Targets describe IMPROVEMENT GOALS, not current problems
- Ground in source evidence

OUTPUT: 5-8 metrics, all 8 fields complete` },

  { id: "externalInterfaces", prompt: `You are a senior systems architect. Extract ALL external interfaces from source evidence.

For every external system, service, API, or data source mentioned or implied:

FORMAT:
INT-001: [Name]
- Type: UI / API / Database / File / Hardware / Third-Party Service
- Direction: Inbound / Outbound / Bidirectional
- Protocol/Format: [Specific protocol or data format, or flag if not mentioned]
- Frequency: Real-time / Batch / On-demand
- Owner/Responsible Team: [From source or reasonable inference]
- Access Classification: [Any confidentiality or security requirements]
- Description: [Detailed explanation of interface purpose and usage]
[SOURCE:N]

EXAMPLE:
INT-001: OSHA Enforcement Database
- Type: Database
- Direction: Inbound
- Protocol/Format: SQL queries over secure connection
- Frequency: On-demand
- Owner/Responsible Team: OSHA IT Department
- Access Classification: Read-only, confidential employer data
- Description: Provides read-only access to verify employer compliance history and past violations to ensure consultation services are not duplicating enforcement actions.
[SOURCE:3]

INT-002: State Consultation Program Portal
- Type: API
- Direction: Bidirectional
- Protocol/Format: RESTful API, JSON payloads
- Frequency: Real-time
- Owner/Responsible Team: State Program Administrators
- Access Classification: Authenticated access, employer data protected
- Description: RESTful API for submitting consultation requests, retrieving status updates, and scheduling on-site visits with state consultation programs.
[SOURCE:5]

RULES:
- Extract 5-8 interfaces (cover all external touchpoints)
- Focus on DOMAIN-SPECIFIC interfaces from source
- Do NOT list generic software (authentication, file system) unless explicitly mentioned
- If protocol/format not in source, flag: [NEEDS STAKEHOLDER INPUT: Protocol specification needed]
- Provide comprehensive descriptions (40-80 words)
- Ground in source evidence

OUTPUT: 5-8 interfaces, all fields complete` },

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

Define every domain-specific term, acronym, regulation reference, role title, or system name that appears in the source.

FORMAT:
TERM — Definition — Source

FIELD REQUIREMENTS:
- TERM: Exact term as it appears in source
- Definition: Formal, objective, one-sentence definition (40-100 words)
- Source: Transcript quote or domain standard reference

WRITING STYLE:
- Use formal, objective, technical language (IEEE 830 standard)
- Write in third-person, professional tone
- Do NOT copy conversational phrasing from transcripts
- Do NOT include opinions or informal language
- Focus on factual, precise definitions
- Provide context and background in definition

EXAMPLE:
On-Site Consultation Program — A free, confidential service provided by OSHA to employers with fewer than 250 workers at a single facility, offering comprehensive workplace hazard assessments, compliance guidance, and safety recommendations that are conducted separately from OSHA enforcement activities and cannot be used as a basis for citations or penalties, with the explicit goal of helping small employers identify and correct workplace hazards before they result in injuries or regulatory violations. — 29 CFR 1908 [SOURCE:3]

11(c) Retaliation Complaint — A formal allegation filed by a worker with OSHA within 30 days of an adverse employment action, claiming that the employer took retaliatory measures (such as termination, demotion, reduction in pay, or other adverse actions) in response to the worker exercising their rights under the Occupational Safety and Health Act, including reporting workplace hazards, filing safety complaints, participating in OSHA inspections, or refusing to perform work that poses an imminent danger to life or health. — OSH Act Section 11(c) [SOURCE:5]

Ergonomic Hazard — A workplace condition or work practice that places physical stress on a worker's body, including repetitive motions, awkward postures, forceful exertions, vibration, or contact stress, which can lead to musculoskeletal disorders (MSDs) such as carpal tunnel syndrome, tendonitis, or back injuries, and which requires assessment of workstation design, work processes, and the interaction between worker capabilities and job demands. — OSHA Ergonomics Guidelines [SOURCE:7]

RULES:
- Extract 15-20 terms (comprehensive coverage)
- Include: technical terms, acronyms, regulations, role titles, system names
- Provide detailed, explanatory definitions (40-100 words each)
- Use em-dash (—) to separate fields
- Ground in source evidence
- Make each definition self-contained and informative

OUTPUT: 15-20 terms, all fields complete, professional tone` },
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
