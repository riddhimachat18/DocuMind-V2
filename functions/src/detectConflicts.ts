import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { runTwoPhaseDetection } from "./twoPhaseConflictDetector.js";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
if (!admin.apps.length) admin.initializeApp();

export const detectConflicts = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 300, cors: true },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");
    const { projectId, brdVersionId } = data;
    if (!projectId || !brdVersionId) throw new Error("projectId and brdVersionId are required");

    const key = GEMINI_API_KEY.value();
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    const genAI = new GoogleGenerativeAI(key);
    const summary = await runTwoPhaseDetection(projectId, brdVersionId, key, genAI);
    return { conflictsFound: summary.confirmedConflicts, summary };
  }
);
