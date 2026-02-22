import { onCall } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { storeSnippet } from "./storeInChroma";
import { defineString } from "firebase-functions/params";
import { defineSecret } from "firebase-functions/params";
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const chromaUrl = defineString("CHROMA_URL", { default: "" });

export const onFileUploaded = onCall(
  { 
    secrets: [GEMINI_API_KEY],
    cors: true,  // Enable CORS for all origins (development + production)
    timeoutSeconds: 540,  // 9 minutes (max for gen2)
    memory: "512MiB"
  },
  async ({ data, auth }) => {
  // Verify authentication
  if (!auth) {
    throw new Error('User must be authenticated');
  }

  const { projectId, filename, fileContent } = data;

  if (!projectId || !filename || !fileContent) {
    throw new Error('projectId, filename, and fileContent are required');
  }

  try {
    const key = GEMINI_API_KEY.value();
    if (!key) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Find existing uploadedFiles document to update
    const existing = await db
      .collection("uploadedFiles")
      .where("projectId", "==", projectId)
      .where("filename", "==", filename)
      .where("status", "==", "processing")
      .limit(1)
      .get();

    if (existing.empty) {
      throw new Error('uploadedFiles document not found');
    }

    const fileRef = existing.docs[0].ref;

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Split content into chunks at sentence boundaries
    function splitIntoChunks(text: string, maxLen = 800): string[] {
      const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
      const chunks: string[] = [];
      let current = "";
      
      for (const sentence of sentences) {
        if ((current + sentence).length > maxLen && current.length > 0) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current += " " + sentence;
        }
      }
      
      if (current.trim()) chunks.push(current.trim());
      return chunks;
    }

    const chunks = splitIntoChunks(fileContent as string, 800);

    let snippetCount = 0;
    const breakdown: Record<string, number> = {
      REQUIREMENT: 0,
      DECISION: 0,
      CONSTRAINT: 0,
    };

    const batch = db.batch();
    const snippetIds: string[] = [];
    const snippetTexts: string[] = [];

    // Process chunks in parallel batches of 10 to avoid timeout
    const BATCH_SIZE = 10;
    const chunksToProcess = chunks.slice(0, 100);
    
    for (let i = 0; i < chunksToProcess.length; i += BATCH_SIZE) {
      const batchChunks = chunksToProcess.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batchChunks.map(async (chunk) => {
          const prompt = `Classify this text as REQUIREMENT, DECISION, CONSTRAINT, or NOISE.
Return JSON only: {"label": "...", "confidence": 0.0-1.0}

Text: "${chunk.slice(0, 300)}"`;

          const result = await model.generateContent(prompt);
          const raw = result.response.text().replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(raw);
          
          return { chunk, parsed };
        })
      );

      // Process successful results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { chunk, parsed } = result.value;
          
          if (parsed.label !== "NOISE" && parsed.confidence > 0.7) {
            const ref = db.collection("snippets").doc();
            batch.set(ref, {
              projectId,
              source: "meeting",
              filename,
              rawText: chunk,
              classification: parsed.label,
              confidence: parsed.confidence,
              author: "Uploaded File",
              authorRole: "Document",
              timestamp: new Date().toISOString(),
            });

            snippetIds.push(ref.id);
            snippetTexts.push(chunk);
            breakdown[parsed.label as keyof typeof breakdown]++;
            snippetCount++;
          }
        } else {
          console.warn("Classification failed for chunk:", result.reason);
        }
      }
    }

    // Commit all snippets to Firestore
    await batch.commit();

    // Store snippets in ChromaDB in parallel (optional - continues if fails)
    const chromaUrlValue = chromaUrl.value();
    if (chromaUrlValue && snippetIds.length > 0) {
      await Promise.allSettled(
        snippetIds.map((id, i) => {
          const chunk = snippetTexts[i];
          if (!chunk) return Promise.resolve();
          
          return storeSnippet(
            {
              id,
              text: chunk,
              metadata: { projectId, source: "meeting", filename },
            },
            key
          ).catch(e => {
            console.warn(`ChromaDB store failed for snippet ${id}:`, e);
          });
        })
      );
    } else if (!chromaUrlValue) {
      console.warn("CHROMA_URL not configured, skipping ChromaDB storage");
    }

    // Update uploadedFiles document — never create a new one
    await fileRef.update({
      status: "processed",
      snippetCount,
      snippetBreakdown: breakdown,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, snippetCount, breakdown };
  } catch (error: any) {
    console.error("File processing error:", error);
    throw new Error(error.message || 'File processing failed');
  }
});
