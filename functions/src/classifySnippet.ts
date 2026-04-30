import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FEW_SHOT_PROMPT } from "./classifyText";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const VALID_LABELS = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"];

export const classifySnippet = onCall(
  {
    secrets: [GEMINI_API_KEY],
    cors: true,
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const { text, source } = data;
    if (!text) throw new Error("text is required");

    const key = GEMINI_API_KEY.value();
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = FEW_SHOT_PROMPT.replace(
      "{sentence}",
      text.slice(0, 500).replace(/"/g, "'")
    );

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toUpperCase().split(/\s/)[0];
    const label = VALID_LABELS.find((c) => raw.startsWith(c.slice(0, 4))) ?? "NOISE";

    return { label, confidence: 0.9, text, source };
  }
);
