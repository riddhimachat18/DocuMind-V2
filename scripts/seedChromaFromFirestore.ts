import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChromaClient } from "chromadb";
import * as fs from "fs";

// Load service account
const serviceAccount = JSON.parse(
  fs.readFileSync("./documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json", "utf8")
);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function embed(text: string, key: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function seed() {
  const key = process.env.GEMINI_API_KEY!;
  const chromaUrl = process.env.CHROMA_URL!;

  if (!key || !chromaUrl) {
    console.error("GEMINI_API_KEY and CHROMA_URL environment variables are required");
    process.exit(1);
  }

  const chroma = new ChromaClient({
    ssl: true,
    host: new URL(chromaUrl).hostname,
    port: 443
  });

  const collection = await chroma.getOrCreateCollection({
    name: "documind-snippets",
    embeddingFunction: { generate: async () => [] }
  });

  const snap = await db
    .collection("snippets")
    .where("classification", "!=", "NOISE")
    .limit(500)
    .get();

  console.log(`Seeding ${snap.size} snippets into ChromaDB...`);

  let success = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.rawText || data.rawText.length < 20) { skipped++; continue; }

    try {
      const embedding = await embed(data.rawText, key);
      await collection.upsert({
        ids: [doc.id],
        embeddings: [embedding],
        documents: [data.rawText],
        metadatas: [{
          projectId: data.projectId,
          source: data.source ?? "unknown",
          classification: data.classification
        }]
      });
      success++;
      if (success % 10 === 0) console.log(`Seeded ${success}/${snap.size}`);
    } catch (e: any) {
      console.warn(`Failed ${doc.id}:`, e.message);
      skipped++;
    }
  }

  console.log(`Done. Success: ${success}, Skipped: ${skipped}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
