import express from "express";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  next();
});

export function computeQualityScore(brd: any, openConflictCount: number) {
  const sections = brd.sections ?? {};
  const frs = sections.functionalReqs
    ? sections.functionalReqs.split("\n").filter((l: string) => l.includes("FR-"))
    : [];

  const sectionChecks = [
    (sections.executiveSummary?.length ?? 0) > 100,
    (sections.stakeholderRegister?.length ?? 0) > 0,
    (sections.functionalReqs?.length ?? 0) > 0,
    (sections.nfrReqs?.length ?? 0) > 0,
    (sections.assumptions?.length ?? 0) > 0,
    (sections.successMetrics?.length ?? 0) > 0,
  ];
  const completeness = Math.round(
    (sectionChecks.filter(Boolean).length / 6) * 40
  );
  const consistency = Math.max(0, 40 - openConflictCount * 10);
  const avgWords = frs.length > 0
    ? frs.reduce((s: number, l: string) => s + l.split(" ").length, 0) / frs.length
    : 0;
  const clarity = avgWords === 0 ? 0
    : avgWords < 10 ? 5
    : avgWords < 15 ? 12
    : avgWords <= 40 ? 20 : 15;

  return { completeness, consistency, clarity, total: completeness + consistency + clarity };
}

app.post("/resolve", async (req, res) => {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      await admin.auth().verifyIdToken(idToken);
    }

    const { conflictId, brdVersionId } = req.body;

    // Mark conflict as resolved
    await db.collection("conflictFlags").doc(conflictId).update({
      status: "resolved",
      resolvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Recalculate quality score
    const openSnap = await db.collection("conflictFlags")
      .where("brdVersionId", "==", brdVersionId)
      .where("status", "==", "open").get();
    
    const brdDoc = await db.collection("brdVersions").doc(brdVersionId).get();
    const score = computeQualityScore(brdDoc.data(), openSnap.size);
    
    await db.collection("brdVersions").doc(brdVersionId)
      .update({ qualityScore: score, openConflictCount: openSnap.size });

    res.json({ success: true, qualityScore: score, openConflicts: openSnap.size });
  } catch (error: any) {
    console.error("Conflict resolution error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;

// Only start server if running standalone (not as Firebase Function)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`onConflictResolved service listening on port ${PORT}`);
  });
}

export default app;
