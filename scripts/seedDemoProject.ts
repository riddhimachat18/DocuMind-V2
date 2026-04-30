import admin from "firebase-admin";
import * as fs from "fs";

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "documind-6c687"
});

const db = admin.firestore();
const DEMO_PROJECT_ID = "demo-project-001";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];  // ← add T[][] here
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function seed() {
  await db.collection("projects").doc(DEMO_PROJECT_ID).set({
    name: "Gas Pipeline Management System",
    description: "Internal system for managing gas trading operations",
    createdAt: new Date(),
    connectedSources: { gmail: true, slack: false, meeting: true },
    currentBrdVersionId: null
  });

  const enron = JSON.parse(fs.readFileSync("./data/enron-filtered.json", "utf8"));
  const ami = JSON.parse(fs.readFileSync("./data/ami.json", "utf8"));
  const all = [...enron, ...ami].map(s => ({ ...s, projectId: DEMO_PROJECT_ID }));

  const batches = chunkArray(all, 499);
  for (const batch of batches) {
    const wb = db.batch();
    for (const snippet of batch) {
      wb.set(db.collection("snippets").doc(), snippet);
    }
    await wb.commit();
  }
  console.log(`Seeded ${all.length} snippets`);
}

seed();