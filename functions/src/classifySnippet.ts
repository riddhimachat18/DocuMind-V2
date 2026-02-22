import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const FEW_SHOT_EXAMPLES = `
EXAMPLE 1:
Text: "The dashboard must support export to CSV and PDF formats"
{"label": "REQUIREMENT", "confidence": 0.98}

EXAMPLE 2:
Text: "We agreed in today's call to use Stripe for all payment processing"
{"label": "DECISION", "confidence": 0.97}

EXAMPLE 3:
Text: "We cannot use any AWS services — client mandates Azure only"
{"label": "CONSTRAINT", "confidence": 0.96}

EXAMPLE 4:
Text: "Hey, are we still on for the 3pm sync? Let me know!"
{"label": "NOISE", "confidence": 0.99}

EXAMPLE 5:
Text: "Response time should be under 200ms for all API endpoints"
{"label": "REQUIREMENT", "confidence": 0.97}

EXAMPLE 6:
Text: "Just a heads up — the client approved the revised timeline"
{"label": "DECISION", "confidence": 0.94}

EXAMPLE 7:
Text: "Budget is capped at $50k for the entire first phase"
{"label": "CONSTRAINT", "confidence": 0.95}

EXAMPLE 8:
Text: "FYI I'll be out Friday, ping Sarah if anything urgent comes up"
{"label": "NOISE", "confidence": 0.99}
`;

export const classifySnippet = onCall(
  { 
    secrets: [GEMINI_API_KEY],
    cors: true  // Enable CORS for all origins
  },
  async ({ data, auth }) => {
    // Verify authentication
    if (!auth) {
      throw new Error('User must be authenticated');
    }

    const { text, source } = data;
    
    if (!text) {
      throw new Error('text is required');
    }

    const key = GEMINI_API_KEY.value();
    if (!key) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a requirements classifier for business communications.
Classify the snippet below as REQUIREMENT, DECISION, CONSTRAINT, or NOISE.

REQUIREMENT = a feature or behavior the system must have
DECISION = a choice that was agreed upon  
CONSTRAINT = a hard boundary or limitation
NOISE = everything else (scheduling, social, status, FYIs)

${FEW_SHOT_EXAMPLES}

Now classify this:
Text: "${text.slice(0, 300)}"

Return JSON only, no explanation: {"label": "...", "confidence": 0.0-1.0}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const clean = raw.replace(/```json|```/g, "").trim();

    const VALID_LABELS = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"];
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return { label: "NOISE", confidence: 0.5, text, source };
    }

    if (!VALID_LABELS.includes(parsed.label)) {
      return { label: "NOISE", confidence: 0.5, text, source };
    }

    return {
      label: parsed.label,
      confidence: parsed.confidence,
      text,
      source
    };
  }
);
