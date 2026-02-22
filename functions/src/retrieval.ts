import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export async function retrieveForSection(
  sectionQuery: string,
  projectId: string,
  key: string,
  nResults: number = 15,
  selectedFiles?: string[]
): Promise<Array<{ text: string; id: string; metadata: any }>> {
  let query = db
    .collection("snippets")
    .where("projectId", "==", projectId)
    .where("classification", "!=", "NOISE");

  // If specific files are selected, filter by filename
  if (selectedFiles && selectedFiles.length > 0) {
    query = query.where("filename", "in", selectedFiles.slice(0, 10)); // Firestore 'in' limit is 10
  }

  const snap = await query.limit(100).get();

  // If we have more than 10 files selected, fetch additional batches
  if (selectedFiles && selectedFiles.length > 10) {
    const remainingFiles = selectedFiles.slice(10);
    for (let i = 0; i < remainingFiles.length; i += 10) {
      const batch = remainingFiles.slice(i, i + 10);
      const batchSnap = await db
        .collection("snippets")
        .where("projectId", "==", projectId)
        .where("classification", "!=", "NOISE")
        .where("filename", "in", batch)
        .limit(100)
        .get();
      
      snap.docs.push(...batchSnap.docs);
    }
  }

  return snap.docs.map(d => ({
    text: d.data().rawText,
    id: d.id,
    metadata: d.data()
  }));
}