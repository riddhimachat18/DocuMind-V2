import { onCall } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { invalidateCache } from "./retrieval.js";
import { embedText } from "./embedSnippet.js";
import { ChromaClient } from "chromadb";
import { defineSecret } from "firebase-functions/params";
import { FEW_SHOT_PROMPT } from "./classifyText";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function embedQuery(text: string, key: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export const onFileUploaded = onCall(
  {
    secrets: [GEMINI_API_KEY],
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const { projectId, filename, fileContent } = data;
    if (!projectId || !filename || !fileContent) {
      throw new Error("projectId, filename, and fileContent are required");
    }

    const key = GEMINI_API_KEY.value();
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    // Find the uploadedFiles doc to update
    const existing = await db
      .collection("uploadedFiles")
      .where("projectId", "==", projectId)
      .where("filename", "==", filename)
      .where("status", "==", "processing")
      .limit(1)
      .get();

    if (existing.empty) throw new Error("uploadedFiles document not found");
    const fileRef = existing.docs[0].ref;

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // ── 1. Chunk the document ─────────────────────────────────────────────
    function splitIntoChunks(text: string, maxLen = 600): string[] {
      const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) ?? [text];
      const chunks: string[] = [];
      let current = "";
      for (const s of sentences) {
        if ((current + s).length > maxLen && current.length > 0) {
          chunks.push(current.trim());
          current = s;
        } else {
          current += " " + s;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks.filter(c => c.length > 20);
    }

    const allChunks = splitIntoChunks(fileContent as string, 600).slice(0, 120);

    // ── 2. Classify ALL chunks in parallel batches of 20 ─────────────────
    const BATCH_SIZE = 20;
    const batches: string[][] = [];
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      batches.push(allChunks.slice(i, i + BATCH_SIZE));
    }

    const classifyBatch = async (batchChunks: string[]): Promise<Record<number, string>> => {
      const snippetList = batchChunks.map((c, i) => `[${i}] ${c.slice(0, 250)}`).join("\n");
      const prompt = `Classify each snippet. Output one JSON per line: {"index": N, "label": "LABEL"}
Labels: REQUIREMENT, DECISION, CONSTRAINT, NOISE.
REQUIREMENT = feature/behavior the system must have.
DECISION = agreed choice. CONSTRAINT = hard boundary. NOISE = everything else.

Snippets:
${snippetList}`;

      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const labels: Record<number, string> = {};
      for (const line of raw.split("\n")) {
        const clean = line.replace(/```json|```/g, "").trim();
        if (!clean.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(clean);
          if (typeof parsed.index === "number" && typeof parsed.label === "string") {
            labels[parsed.index] = parsed.label.toUpperCase();
          }
        } catch { /* skip */ }
      }
      return labels;
    };

    // Run all classification batches in parallel
    const classifyResults = await Promise.allSettled(batches.map(classifyBatch));

    // Collect non-NOISE chunks
    const VALID = ["REQUIREMENT", "DECISION", "CONSTRAINT"];
    const toStore: Array<{ chunk: string; label: string }> = [];

    for (let bi = 0; bi < batches.length; bi++) {
      const r = classifyResults[bi];
      if (r.status !== "fulfilled") continue;
      const labels = r.value;
      batches[bi].forEach((chunk, i) => {
        const label = labels[i] ?? "NOISE";
        if (VALID.includes(label)) toStore.push({ chunk, label });
      });
    }

    // ── 3. Embed all kept snippets in parallel (max 30 concurrent) ────────
    const EMBED_CONCURRENCY = 30;
    const embedded: Array<{ chunk: string; label: string; embedding: number[] }> = [];

    for (let i = 0; i < toStore.length; i += EMBED_CONCURRENCY) {
      const slice = toStore.slice(i, i + EMBED_CONCURRENCY);
      const results = await Promise.allSettled(
        slice.map(async (item) => {
          const embedding = await embedText(item.chunk, key);
          return { ...item, embedding };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") embedded.push(r.value);
        else console.warn("Embedding failed for chunk:", (r as any).reason?.message);
      }
    }

    // ── 4. Write all snippets to Firestore in a single batch ──────────────
    const breakdown: Record<string, number> = { REQUIREMENT: 0, DECISION: 0, CONSTRAINT: 0 };
    const firestoreBatch = db.batch();

    for (const item of embedded) {
      const ref = db.collection("snippets").doc();
      firestoreBatch.set(ref, {
        projectId,
        source: "meeting",
        filename,
        rawText: item.chunk,
        classification: item.label,
        embedding: item.embedding,
        confidence: 0.85,
        author: "Uploaded File",
        authorRole: "Document",
        timestamp: new Date().toISOString(),
      });
      breakdown[item.label as keyof typeof breakdown] =
        (breakdown[item.label as keyof typeof breakdown] ?? 0) + 1;
    }

    await firestoreBatch.commit();

    const snippetCount = embedded.length;

    // ── 5. Finalize ───────────────────────────────────────────────────────
    await fileRef.update({
      status: "processed",
      snippetCount,
      snippetBreakdown: breakdown,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("projects").doc(projectId).update({
      "connectedSources.meeting": true,
    });

    invalidateCache(projectId);

    return { success: true, snippetCount, breakdown };
  }
);
