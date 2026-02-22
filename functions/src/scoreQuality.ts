import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as adminSdk from "firebase-admin";

if (!adminSdk.apps.length) adminSdk.initializeApp();
const db = adminSdk.firestore();

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

export const onConflictResolved = onDocumentUpdated(
  "conflictFlags/{flagId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status !== "resolved" && after.status === "resolved") {
      const { brdVersionId } = after;
      const openSnap = await db.collection("conflictFlags")
        .where("brdVersionId", "==", brdVersionId)
        .where("status", "==", "open").get();
      const brdDoc = await db.collection("brdVersions").doc(brdVersionId).get();
      const score = computeQualityScore(brdDoc.data(), openSnap.size);
      await db.collection("brdVersions").doc(brdVersionId)
        .update({ qualityScore: score, openConflictCount: openSnap.size });
    }
  }
);