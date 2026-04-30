import { onCall } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
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

    const VALID = ["REQUIREMENT", "DECISION", "CONSTRAINT", "NOISE"];

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
    const snippetClasses: string[] = [];

    // Process chunks in parallel batches of 10 to avoid timeout
    const BATCH_SIZE = 10;
    const chunksToProcess = chunks.slice(0, 100);
    
    for (let i = 0; i < chunksToProcess.length; i += BATCH_SIZE) {
      const batchChunks = chunksToProcess.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batchChunks.map(async (chunk) => {
          const prompt = FEW_SHOT_PROMPT.replace("{sentence}", chunk.slice(0, 500).replace(/"/g, "'"));
          const result = await model.generateContent(prompt);
          const raw = result.response.text().trim().toUpperCase().split(/\s/)[0];
          const label = VALID.find(c => raw.startsWith(c.slice(0, 4))) ?? "NOISE";
          const parsed = { label, confidence: 0.9 };

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
            snippetClasses.push(parsed.label);
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

    // Store classified snippets in ChromaDB with embeddings
    const chromaUrlValue = process.env.CHROMA_URL ?? "";
    if (chromaUrlValue && snippetIds.length > 0) {
      try {
        const chroma = new ChromaClient({
          ssl: true,
          host: new URL(chromaUrlValue).hostname,
          port: 443
        });
        const collection = await chroma.getOrCreateCollection({
          name: "documind-snippets",
          embeddingFunction: { generate: async () => [] }
        });

        for (let i = 0; i < snippetIds.length; i++) {
          const text = snippetTexts[i];
          if (!text) continue;
          try {
            const embedding = await embedQuery(text, key);
            await collection.upsert({
              ids: [snippetIds[i]],
              embeddings: [embedding],
              documents: [text],
              metadatas: [{
                projectId,
                source: "upload",
                filename,
                classification: snippetClasses[i]
              }]
            });
          } catch (e: any) {
            console.warn("ChromaDB upsert failed for snippet:", e.message);
          }
        }
      } catch (e) {
        console.warn("ChromaDB batch store failed, snippets saved to Firestore only:", e);
      }
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
