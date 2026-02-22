import admin from "firebase-admin";
import { ChromaClient } from "chromadb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";

// Load service account
const serviceAccount = JSON.parse(
  fs.readFileSync("./documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable is required");
  process.exit(1);
}

const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const chroma = new ChromaClient({ path: CHROMA_URL });

async function embedText(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function seed() {
  console.log(`Connecting to ChromaDB at ${CHROMA_URL}...`);
  
  const collection = await chroma.getOrCreateCollection({
    name: "documind-snippets"
  });

  console.log("Fetching snippets from Firestore...");
  const snap = await db
    .collection("snippets")
    .where("classification", "!=", "NOISE")
    .get();

  console.log(`Seeding ${snap.docs.length} snippets into ChromaDB...`);

  let successCount = 0;
  let errorCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    
    try {
      const embedding = await embedText(data.rawText);
      
      await collection.add({
        ids: [doc.id],
        embeddings: [embedding],
        documents: [data.rawText],
        metadatas: [{
          projectId: data.projectId || "",
          source: data.source || "",
          author: data.author ?? "",
          classification: data.classification || "",
          filename: data.filename ?? ""
        }]
      });
      
      successCount++;
      console.log(`✓ Seeded: ${doc.id} (${successCount}/${snap.docs.length})`);
    } catch (e) {
      errorCount++;
      console.error(`✗ Failed ${doc.id}:`, e);
      continue;
    }
  }

  console.log("\n=== ChromaDB Seeding Complete ===");
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${snap.docs.length}`);
}

seed()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
