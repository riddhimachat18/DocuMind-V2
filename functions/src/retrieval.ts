import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { BM25Scorer } from './bm25Scorer';
import { RRFMerger, RetrievalSnippet } from './rrfMerger';
import { CrossEncoderReranker } from './crossEncoderReranker';
import { ChromaClient } from "chromadb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Per-section query strings with domain-specific keywords (Fix 6) ──────────
export const SECTION_QUERIES: Record<string, string> = {
  executiveSummary:    "project overview objectives goals scope purpose mission vision strategic importance business value outcomes deliverables",
  stakeholderRegister: "stakeholders team members roles responsibilities participants users customers clients sponsors owners managers administrators",
  functionalReqs:      "system must feature capability requirement shall function behavior action operation task process workflow capability feature",
  nfrReqs:             "performance security availability scalability reliability usability maintainability compliance standards quality attributes response time throughput uptime encryption authentication",
  assumptions:         "assumption constraint limitation dependency prerequisite condition requirement restriction boundary scope exclusion",
  successMetrics:      "success metric KPI target acceptance criteria measurement goal objective performance indicator benchmark threshold",
  externalInterfaces:  "API integration external system interface hardware protocol data format service third-party connector endpoint database legacy system",
  useCases:            "user workflow actor event flow scenario steps use case interaction process procedure task activity action sequence",
  glossary:            "definition term acronym domain concept meaning terminology vocabulary glossary abbreviation phrase jargon technical term",
};

// ── In-memory retrieval cache (10-minute TTL) ─────────────────────────────────
interface CacheEntry {
  snippets: Array<{ text: string; id: string; metadata: any }>;
  expiresAt: number;
}
const retrievalCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(projectId: string, selectedFiles?: string[]): string {
  const raw = projectId + (selectedFiles ? selectedFiles.sort().join(",") : "");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function invalidateCache(projectId: string): void {
  for (const key of retrievalCache.keys()) {
    // Keys are hashes so we store a reverse map for invalidation
    if (key.startsWith(projectId + ":")) {
      retrievalCache.delete(key);
    }
  }
  // Also clear all entries for this project by brute-force scan
  for (const [k] of retrievalCache) {
    retrievalCache.delete(k); // clear all on any upload — safe, TTL is short
  }
}

// ── Keyword-based relevance scoring (no embeddings needed) ───────────────────
function scoreSnippet(text: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/);
  const lower = text.toLowerCase();
  return words.reduce((score, w) => score + (lower.includes(w) ? 1 : 0), 0);
}

// ── Fetch all snippets for a project (with cache) ────────────────────────────
async function fetchAllSnippets(
  projectId: string,
  selectedFiles?: string[],
  limitN = 200
): Promise<Array<{ text: string; id: string; metadata: any }>> {
  const key = cacheKey(projectId, selectedFiles);
  const cached = retrievalCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snippets;
  }

  let query: any = db
    .collection("snippets")
    .where("projectId", "==", projectId)
    .where("classification", "!=", "NOISE");

  if (selectedFiles && selectedFiles.length > 0) {
    query = query.where("filename", "in", selectedFiles.slice(0, 10));
  }

  const snap = await query.limit(limitN).get();

  if (selectedFiles && selectedFiles.length > 10) {
    const remaining = selectedFiles.slice(10);
    for (let i = 0; i < remaining.length; i += 10) {
      const batch = remaining.slice(i, i + 10);
      const batchSnap = await db
        .collection("snippets")
        .where("projectId", "==", projectId)
        .where("classification", "!=", "NOISE")
        .where("filename", "in", batch)
        .limit(limitN)
        .get();
      snap.docs.push(...batchSnap.docs);
    }
  }

  const snippets = snap.docs.map((d: any) => ({
    text: d.data().rawText,
    id: d.id,
    metadata: d.data(),
  }));

  retrievalCache.set(key, { snippets, expiresAt: Date.now() + CACHE_TTL_MS });
  return snippets;
}

// ── Per-section retrieval: top-8 most relevant snippets using hybrid ranking ──
export async function retrieveForSection(
  sectionId: string,
  projectId: string,
  _key: string,                  // kept for API compat, unused
  nResults = 8,
  selectedFiles?: string[]
): Promise<Array<{ text: string; id: string; metadata: any }>> {
  const overallStartTime = performance.now();
  const metrics = {
    fetchTime: 0,
    bm25Time: 0,
    rrfTime: 0,
    crossEncoderTime: 0,
    totalTime: 0,
    candidateCount: 0,
    resultCount: 0
  };

  // Fetch more candidates for hybrid ranking (20 instead of 8)
  const candidateCount = 20;
  
  const fetchStart = performance.now();
  const all = await fetchAllSnippets(projectId, selectedFiles, 200);
  metrics.fetchTime = performance.now() - fetchStart;
  
  const query = SECTION_QUERIES[sectionId] ?? sectionId;

  // Handle empty query or no snippets
  if (!query || all.length === 0) {
    metrics.totalTime = performance.now() - overallStartTime;
    console.log(`[Retrieval Performance] Section: ${sectionId}, Total: ${metrics.totalTime.toFixed(2)}ms (empty query/snippets)`);
    return all.slice(0, nResults);
  }

  try {
    // Step 1: Get semantic ranking (simulate with position-based scoring for now)
    // TODO: Replace with actual ChromaDB semantic similarity when available
    const semanticRanking = all
      .map((snippet, index) => ({
        snippet: {
          text: snippet.text,
          id: snippet.id,
          metadata: snippet.metadata
        } as RetrievalSnippet,
        score: Math.max(0, 1 - (index / all.length)) // Position-based semantic score simulation
      }))
      .slice(0, candidateCount);

    metrics.candidateCount = semanticRanking.length;

    // Step 2: Calculate BM25 keyword scores (Requirement 8.1)
    const bm25Start = performance.now();
    const bm25Scorer = new BM25Scorer();
    const documents = semanticRanking.map(item => ({
      id: item.snippet.id,
      text: item.snippet.text
    }));

    const bm25Results = bm25Scorer.scoreForRRF(query, documents);
    const bm25Map = new Map(bm25Results.map(r => [r.id, r.normalizedScore]));
    metrics.bm25Time = performance.now() - bm25Start;

    // Step 3: Create keyword ranking from BM25 scores
    const keywordRanking = semanticRanking.map(item => ({
      snippet: item.snippet,
      score: bm25Map.get(item.snippet.id) || 0
    }));

    // Step 4: Apply RRF fusion to combine rankings (Requirement 8.1)
    const rrfStart = performance.now();
    const rrfMerger = new RRFMerger();
    const fusedRankings = rrfMerger.fuseRankings(semanticRanking, keywordRanking);
    metrics.rrfTime = performance.now() - rrfStart;

    // Step 5: Apply cross-encoder re-ranking with fallback to RRF (Requirement 8.1)
    const crossEncoderStart = performance.now();
    const crossEncoder = new CrossEncoderReranker({ enabled: false }); // Disabled until model integrated
    const candidateSnippets = fusedRankings.map(r => r.snippet);
    const rerankedSnippets = await crossEncoder.rerank(query, candidateSnippets, nResults);
    metrics.crossEncoderTime = performance.now() - crossEncoderStart;

    // Step 6: Convert to expected format (Requirement 8.5 - maintain existing cache invalidation and project filtering)
    const topResults = rerankedSnippets.map(snippet => ({
      text: snippet.text,
      id: snippet.id,
      metadata: snippet.metadata
    }));

    metrics.resultCount = topResults.length;
    metrics.totalTime = performance.now() - overallStartTime;

    // Log comprehensive performance metrics
    console.log(`[Retrieval Performance] Section: ${sectionId}`);
    console.log(`  - Total Time: ${metrics.totalTime.toFixed(2)}ms`);
    console.log(`  - Fetch Time: ${metrics.fetchTime.toFixed(2)}ms`);
    console.log(`  - BM25 Time: ${metrics.bm25Time.toFixed(2)}ms`);
    console.log(`  - RRF Time: ${metrics.rrfTime.toFixed(2)}ms`);
    console.log(`  - CrossEncoder Time: ${metrics.crossEncoderTime.toFixed(2)}ms`);
    console.log(`  - Candidates: ${metrics.candidateCount}, Results: ${metrics.resultCount}`);

    return topResults;

  } catch (error) {
    metrics.totalTime = performance.now() - overallStartTime;
    
    // Fallback to original keyword-only scoring on any error (Requirement 8.1 - graceful fallback)
    console.warn(`[Retrieval Performance] Hybrid retrieval failed for section ${sectionId} after ${metrics.totalTime.toFixed(2)}ms, falling back to keyword-only:`, error);
    return all
      .map(s => ({ ...s, score: scoreSnippet(s.text, query) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, nResults);
  }
}

// ── Retrieve all snippets (used by detectConflicts etc.) ─────────────────────
export async function retrieveAllSnippets(
  projectId: string,
  selectedFiles?: string[],
  limitN = 200
): Promise<Array<{ text: string; id: string; metadata: any }>> {
  return fetchAllSnippets(projectId, selectedFiles, limitN);
}
