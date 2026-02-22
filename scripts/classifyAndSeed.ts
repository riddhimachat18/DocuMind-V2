import admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChromaClient } from "chromadb";

admin.initializeApp();
const db = admin.firestore();

const key = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(key);
const chroma = new ChromaClient({ path: "http://localhost:8000" });

async function embedText(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function classify(text: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Classify as REQUIREMENT, DECISION, CONSTRAINT, or NOISE.
Return JSON only: {"label": "..."}
Text: "${text.slice(0, 300)}"`;
  const result = await model.generateContent(prompt);
  const raw = result.response.text().replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(raw).label ?? "NOISE";
  } catch {
    return "NOISE";
  }
}

async function run() {
  // Fetch all snippets with null classification
  const snap = await db.collection("snippets")
    .where("projectId", "==", "demo-project-001")
    .get();

  console.log(`Found ${snap.size} snippets to process`);

  const collection = await chroma.getOrCreateCollection({
  name: "documind-snippets",
  embeddingFunction: { generate: async (texts: string[]) => [] } // dummy — we provide embeddings manually
});

  let seeded = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    
    try {
      // Classify if null
      let label = data.classification;
      if (!label) {
        label = await classify(data.rawText);
        await db.collection("snippets").doc(docSnap.id).update({
          classification: label
        });
      }

      // Skip NOISE
      if (label === "NOISE") {
        skipped++;
        continue;
      }

      // Embed and store in ChromaDB
      const embedding = await embedText(data.rawText);
      await collection.add({
        ids: [docSnap.id],
        embeddings: [embedding],
        documents: [data.rawText],
        metadatas: [{
          projectId: data.projectId,
          source: data.source,
          author: data.author ?? "",
          classification: label
        }]
      });

      seeded++;
      console.log(`✓ ${docSnap.id} → ${label}`);
    } catch (e: any) {
      // Skip duplicates in ChromaDB
      if (e.message?.includes("already exists")) {
        seeded++;
        continue;
      }
      console.error(`✗ ${docSnap.id}:`, e.message);
    }
  }

  console.log(`\nDone. Seeded: ${seeded}, Skipped (NOISE): ${skipped}`);
}

run();