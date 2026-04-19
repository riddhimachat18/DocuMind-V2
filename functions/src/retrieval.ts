import { ChromaClient } from "chromadb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const CHROMA_URL = defineSecret("CHROMA_URL");
export const GEMINI_EMBED_KEY = defineSecret("GEMINI_API_KEY");

async function embedQuery(query: string, key: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(query);
  return result.embedding.values;
}

export async function retrieveForSection(
  sectionQuery: string,
  projectId: string,
  key: string,
  nResults: number = 15
): Promise<Array<{ text: string; id: string; metadata: any }>> {
  const chromaUrl = CHROMA_URL.value();

  // Primary path: ChromaDB vector search
  if (chromaUrl) {
    try {
      const chroma = new ChromaClient({
        ssl: true,
        host: new URL(chromaUrl).hostname,
        port: 443
      });

      const collection = await chroma.getOrCreateCollection({
        name: "documind-snippets",
        embeddingFunction: { generate: async () => [] } // we provide embeddings
      });

      // Count documents for this project in ChromaDB
      const countResult = await collection.get({
        where: { projectId },
        limit: 1
      });

      if (countResult.ids.length > 0) {
        // Embed the section query
        const queryEmbedding = await embedQuery(sectionQuery, key);

        // Query ChromaDB by vector similarity
        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: Math.min(nResults, 50),
          where: { projectId }
        });

        const docs = results.documents[0] ?? [];
        const ids = results.ids[0] ?? [];
        const metadatas = results.metadatas[0] ?? [];
        const distances = results.distances?.[0] ?? [];

        const filtered = docs
          .map((text, i) => ({
            text: text ?? "",
            id: ids[i],
            metadata: metadatas[i] ?? {},
            distance: distances[i] ?? 1.0
          }))
          .filter(r => r.distance < 1.5 && r.text.length > 20)
          .slice(0, nResults);

        // Log retrieval metadata for RAG quality measurement
        const validDistances = distances.filter((d): d is number => d !== null);
        const avgDistance =
          validDistances.length > 0
            ? validDistances.reduce((a, b) => a + b, 0) / validDistances.length
            : 0;
        console.log(`RAG retrieval for "${sectionQuery.slice(0, 30)}":`, {
          method: "vector",
          returned: filtered.length,
          avgDistance
        });

        return filtered;
      }

      console.log("ChromaDB has no snippets for project, falling back to Firestore");
    } catch (chromaError) {
      console.warn("ChromaDB unavailable, falling back to Firestore:", chromaError);
    }
  }

  // Fallback path: Firestore retrieval
  console.log("Using Firestore fallback retrieval", {
    method: "firestore",
    returned: null,
    avgDistance: null
  });

  const snap = await db
    .collection("snippets")
    .where("projectId", "==", projectId)
    .where("classification", "!=", "NOISE")
    .limit(nResults)
    .get();

  return snap.docs.map(d => ({
    text: d.data().rawText,
    id: d.id,
    metadata: d.data()
  }));
}

export async function retrieveAllSnippets(
  projectId: string,
  limit: number = 200
): Promise<Array<{ text: string; id: string; metadata: any }>> {
  const snap = await db
    .collection("snippets")
    .where("projectId", "==", projectId)
    .where("classification", "!=", "NOISE")
    .limit(limit)
    .get();

  return snap.docs.map(d => ({
    text: d.data().rawText,
    id: d.id,
    metadata: d.data()
  }));
}
