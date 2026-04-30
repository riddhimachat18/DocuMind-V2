/**
 * Two-Phase Hybrid Conflict Detector
 * Phase 1: Pairwise cosine similarity candidate identification
 * Phase 2: Gemini semantic validation in parallel batches of 10
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { embedText } from "./embedSnippet.js";

const db = admin.firestore();

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Requirement {
  id: string;
  text: string;
  source?: string;
}

export interface CandidatePair {
  reqA: Requirement;
  reqB: Requirement;
  similarityScore: number;
}

export interface ConflictResult {
  reqAId: string;
  reqBId: string;
  reqAText: string;
  reqBText: string;
  similarityScore: number;
  conflicts: boolean;
  conflictType: "direct_contradiction" | "scope_overlap" | "priority_clash" | "none";
  severity: "high" | "medium" | "low" | "none";
  reason: string;
  suggestedResolution: string | null;
  phase1Flagged: boolean;
  phase2Validated: boolean;
}

export interface DetectionSummary {
  totalRequirements: number;
  candidatePairs: number;
  confirmedConflicts: number;
  threshold: number;
  conflicts: ConflictResult[];
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Phase 1: Candidate identification ────────────────────────────────────────
export function phase1Candidates(
  requirements: Requirement[],
  embeddings: number[][],
  threshold: number
): CandidatePair[] {
  const candidates: CandidatePair[] = [];
  for (let i = 0; i < requirements.length; i++) {
    for (let j = i + 1; j < requirements.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim > threshold) {
        candidates.push({
          reqA: requirements[i],
          reqB: requirements[j],
          similarityScore: Math.round(sim * 1000) / 1000,
        });
      }
    }
  }
  return candidates;
}

// ── Phase 2: Gemini semantic validation ───────────────────────────────────────
export async function phase2Validate(
  candidates: CandidatePair[],
  model: any
): Promise<ConflictResult[]> {
  const results: ConflictResult[] = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (pair) => {
        const prompt = `You are a requirements conflict analyst. Determine whether the following two requirements conflict with each other. A conflict exists if satisfying one requirement makes it impossible or significantly harder to satisfy the other. Respond in JSON only. No explanation outside the JSON object.

{
  "conflicts": true or false,
  "conflict_type": "direct_contradiction | scope_overlap | priority_clash | none",
  "reason": "one sentence explanation",
  "severity": "high | medium | low | none",
  "suggested_resolution": "one sentence suggestion if conflicts is true, else null"
}

Requirement A (${pair.reqA.id}): ${pair.reqA.text}
Requirement B (${pair.reqB.id}): ${pair.reqB.text}`;

        const result = await model.generateContent(prompt);
        const raw = result.response.text().trim()
          .replace(/```json|```/g, "").trim();

        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Try extracting JSON from response
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        }

        if (!parsed) {
          return {
            reqAId: pair.reqA.id, reqBId: pair.reqB.id,
            reqAText: pair.reqA.text, reqBText: pair.reqB.text,
            similarityScore: pair.similarityScore,
            conflicts: false, conflictType: "none" as const,
            severity: "none" as const, reason: "Parse error",
            suggestedResolution: null,
            phase1Flagged: true, phase2Validated: true,
          };
        }

        return {
          reqAId: pair.reqA.id, reqBId: pair.reqB.id,
          reqAText: pair.reqA.text, reqBText: pair.reqB.text,
          similarityScore: pair.similarityScore,
          conflicts: !!parsed.conflicts,
          conflictType: parsed.conflict_type ?? "none",
          severity: parsed.severity ?? "none",
          reason: parsed.reason ?? "",
          suggestedResolution: parsed.suggested_resolution ?? null,
          phase1Flagged: true,
          phase2Validated: true,
        } as ConflictResult;
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
      else console.warn("Phase 2 batch item failed:", r.reason);
    }
  }

  return results;
}

// ── Full two-phase detection pipeline ────────────────────────────────────────
export async function runTwoPhaseDetection(
  projectId: string,
  brdVersionId: string,
  key: string,
  genAI: GoogleGenerativeAI,
  threshold = 0.82
): Promise<DetectionSummary> {
  // Fetch FR and NFR snippets
  const snap = await db.collection("snippets")
    .where("projectId", "==", projectId)
    .where("classification", "in", ["REQUIREMENT", "DECISION"])
    .get();

  const reqs: Requirement[] = snap.docs.map(d => ({
    id: d.id,
    text: (d.data() as any).rawText ?? "",
    source: (d.data() as any).source,
  })).filter(r => r.text.length > 10);

  if (reqs.length < 2) {
    await db.collection("brdVersions").doc(brdVersionId).update({
      conflictStatus: "done",
      openConflictCount: 0,
      conflictSummary: { totalRequirements: reqs.length, candidatePairs: 0, confirmedConflicts: 0, threshold, conflicts: [] },
    });
    return { totalRequirements: reqs.length, candidatePairs: 0, confirmedConflicts: 0, threshold, conflicts: [] };
  }

  // Embed all requirements in parallel
  const rawEmbeddings = await Promise.allSettled(
    reqs.map(async r => {
      const snap = await db.collection("snippets").doc(r.id).get();
      const existing = snap.data()?.embedding;
      if (existing && Array.isArray(existing)) return existing as number[];
      const emb = await embedText(r.text, key);
      await db.collection("snippets").doc(r.id).update({ embedding: emb });
      return emb;
    })
  );

  const embeddings: number[][] = rawEmbeddings.map((r, i) =>
    r.status === "fulfilled" ? r.value : new Array(768).fill(0)
  );

  // Phase 1
  const candidates = phase1Candidates(reqs, embeddings, threshold);
  console.log(`Phase 1: ${candidates.length} candidate pairs at threshold ${threshold}`);

  // Store candidate pairs in Firestore
  const candidateBatch = db.batch();
  for (const c of candidates) {
    const ref = db.collection("conflictCandidates").doc(`${brdVersionId}_${c.reqA.id}_${c.reqB.id}`);
    candidateBatch.set(ref, {
      brdVersionId, projectId,
      reqAId: c.reqA.id, reqBId: c.reqB.id,
      reqAText: c.reqA.text, reqBText: c.reqB.text,
      similarityScore: c.similarityScore,
      phase1Flagged: true,
      phase2Validated: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await candidateBatch.commit();

  // Phase 2
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const allResults = await phase2Validate(candidates, model);

  // Update Firestore with phase 2 results
  const updateBatch = db.batch();
  for (const r of allResults) {
    const ref = db.collection("conflictCandidates").doc(`${brdVersionId}_${r.reqAId}_${r.reqBId}`);
    updateBatch.update(ref, {
      phase2Validated: true,
      conflicts: r.conflicts,
      conflictType: r.conflictType,
      severity: r.severity,
      reason: r.reason,
      suggestedResolution: r.suggestedResolution,
    });
  }
  await updateBatch.commit();

  // Save confirmed conflicts to conflictFlags collection
  const confirmed = allResults.filter(r => r.conflicts);
  for (const c of confirmed) {
    await db.collection("conflictFlags").add({
      projectId, brdVersionId,
      snippetIdA: c.reqAId, snippetIdB: c.reqBId,
      requirementA: c.reqAText, requirementB: c.reqBText,
      conflictType: c.conflictType,
      severity: c.severity,
      reason: c.reason,
      suggestedResolution: c.suggestedResolution,
      similarityScore: c.similarityScore,
      status: "open",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const highSeverity = confirmed.filter(c => c.severity === "high").length;
  const summary: DetectionSummary = {
    totalRequirements: reqs.length,
    candidatePairs: candidates.length,
    confirmedConflicts: confirmed.length,
    threshold,
    conflicts: confirmed,
  };

  await db.collection("brdVersions").doc(brdVersionId).update({
    conflictStatus: "done",
    openConflictCount: confirmed.length,
    highSeverityConflicts: highSeverity,
    status: highSeverity > 0 ? "conflicted" : "draft",
    conflictSummary: summary,
    "qualityScore.consistency": Math.max(0, 40 - confirmed.length * 8),
  });

  console.log(`Two-phase detection done: ${candidates.length} candidates → ${confirmed.length} confirmed conflicts`);
  return summary;
}
