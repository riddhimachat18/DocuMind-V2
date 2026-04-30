import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { embedText } from "./embedSnippet";
import * as admin from "firebase-admin";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (magA * magB);
}

export const detectConflicts = onCall(
  { 
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 300,
    cors: true  // Enable CORS for all origins
  },
  async ({ data, auth }) => {
    // Verify authentication
    if (!auth) {
      throw new Error('User must be authenticated');
    }

    const { projectId, brdVersionId } = data;
    
    if (!projectId || !brdVersionId) {
      throw new Error('projectId and brdVersionId are required');
    }

    const key = GEMINI_API_KEY.value();
    if (!key) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const snap = await db.collection("snippets")
      .where("projectId", "==", projectId)
      .where("classification", "in", ["REQUIREMENT", "DECISION"])
      .get();

    const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    // Embed any that don't have embeddings yet
    for (const req of reqs) {
      if (!req.embedding) {
        req.embedding = await embedText(req.rawText, key);
        await db.collection("snippets").doc(req.id)
          .update({ embedding: req.embedding });
      }
    }

    // Pairwise comparison
    const candidatePairs = [];
    for (let i = 0; i < reqs.length; i++) {
      for (let j = i + 1; j < reqs.length; j++) {
        const sim = cosineSimilarity(reqs[i].embedding, reqs[j].embedding);
        if (sim > 0.85) {
          candidatePairs.push({ a: reqs[i], b: reqs[j] });
        }
      }
    }

    let conflictCount = 0;
    for (const pair of candidatePairs) {
      const prompt = `Do these two requirements CONTRADICT each other?
Answer YES or NO only.
Requirement A: "${pair.a.rawText}"
Requirement B: "${pair.b.rawText}"`;

      const result = await model.generateContent(prompt);
      const answer = result.response.text().trim().toUpperCase();

      if (answer === "YES") {
        await db.collection("conflictFlags").add({
          projectId, brdVersionId,
          snippetIdA: pair.a.id,
          snippetIdB: pair.b.id,
          requirementA: pair.a.rawText,
          requirementB: pair.b.rawText,
          authorA: pair.a.author,
          authorB: pair.b.author,
          sourceA: pair.a.source,
          sourceB: pair.b.source,
          status: "open",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        conflictCount++;
      }
    }

    if (conflictCount > 0) {
      await db.collection("brdVersions").doc(brdVersionId)
        .update({ status: "conflicted", openConflictCount: conflictCount });
    }

    return { conflictsFound: conflictCount };
  }
);
