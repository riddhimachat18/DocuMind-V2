import { ChromaClient } from "chromadb";
import { embedText } from "./embedSnippet";

function getChromaClient() {
  return new ChromaClient({
    path: process.env.CHROMA_URL ?? "http://localhost:8000"
  });
}

export async function storeSnippet(snippet: {
  id: string;
  text: string;
  metadata: Record<string, string>;
}, key: string) {
  const chroma = getChromaClient();
  const collection = await chroma.getOrCreateCollection({
    name: "documind-snippets"
  });
  const embedding = await embedText(snippet.text, key);
  await collection.add({
    ids: [snippet.id],
    embeddings: [embedding],
    documents: [snippet.text],
    metadatas: [snippet.metadata]
  });
}