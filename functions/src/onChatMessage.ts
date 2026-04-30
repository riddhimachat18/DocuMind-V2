import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { computeQualityScore } from "./scoreQuality.js";
import { runDeterministicGapCheck, Gap } from "./gapChecker.js";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Robust BRD_UPDATE parser ──────────────────────────────────────────────────
function parseBRDUpdates(response: string): Array<{ section: string; action: string; content: string }> {
  const UPDATE_REGEX = /<BRD_UPDATE>([\s\S]*?)<\/BRD_UPDATE>/g;
  const updates: Array<{ section: string; action: string; content: string }> = [];

  for (const match of response.matchAll(UPDATE_REGEX)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.section && parsed.action && parsed.content) {
        updates.push(parsed);
      } else {
        console.warn("BRD_UPDATE block missing required fields:", parsed);
      }
    } catch (e) {
      console.error("Failed to parse BRD_UPDATE block:", match[1], e);
    }
  }

  return updates;
}

// ── Apply BRD update to Firestore ─────────────────────────────────────────────
async function applyBrdUpdate(
  brdVersionId: string,
  update: { section: string; action: string; content: string },
  roundNumber: number
) {
  const brdRef = db.collection("brdVersions").doc(brdVersionId);
  const before = await brdRef.get();
  const oldContent = before.data()?.sections?.[update.section] ?? "";

  let newContent = "";
  if (update.action === "replace") {
    newContent = update.content;
  } else if (update.action === "append") {
    newContent = oldContent + "\n" + update.content;
  } else {
    newContent = update.content; // fallback
  }

  await brdRef.update({
    [`sections.${update.section}`]: newContent,
    lastUpdatedSection: update.section,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Log patch to audit trail
  await db.collection("brdVersions").doc(brdVersionId)
    .collection("auditPatches").add({
      section: update.section,
      action: update.action,
      oldLength: oldContent.length,
      newLength: newContent.length,
      roundNumber,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ── Mark gap resolved ─────────────────────────────────────────────────────────
function markGapResolved(gaps: Gap[], sectionKey: string, roundNumber: number): Gap[] {
  return gaps.map(g =>
    g.field === sectionKey ? { ...g, resolved: true, resolvedAtRound: roundNumber } : g
  );
}

// ── Main Cloud Function ───────────────────────────────────────────────────────
export const onChatMessage = onCall(
  {
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 120,
    cors: true,
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const { projectId, brdVersionId, userMessage, chatHistory } = data;
    if (!projectId || !brdVersionId || !userMessage) {
      throw new Error("projectId, brdVersionId, and userMessage are required");
    }

    const key = GEMINI_API_KEY.value();
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    // ── Load BRD and conflicts ────────────────────────────────────────────
    const [brdDoc, conflictsSnap] = await Promise.all([
      db.collection("brdVersions").doc(brdVersionId).get(),
      db.collection("conflictFlags")
        .where("brdVersionId", "==", brdVersionId)
        .where("status", "==", "open")
        .get(),
    ]);

    const brd = brdDoc.data()!;
    const openConflicts = conflictsSnap.docs.map(d => d.data());

    // ── Run deterministic gap check ───────────────────────────────────────
    const detectedGaps = runDeterministicGapCheck(brd.sections ?? {});

    // Load persisted gaps from Firestore (if this is a continuation)
    let persistedGaps: Gap[] = brd.detectedGaps ?? detectedGaps;
    const roundNumber = (chatHistory?.length ?? 0) + 1;

    // ── Build Gemini system prompt with injected gaps ────────────────────
    const systemPrompt = `You are the DocuMind AI Quality Auditor — an expert Business Analyst.

CURRENT BRD:
${JSON.stringify(brd.sections, null, 2)}

OPEN CONFLICTS (${openConflicts.length}):
${openConflicts.map(c => `- "${c.requirementA}" CONFLICTS WITH "${c.requirementB}"`).join("\n") || "None"}

CONFIRMED GAPS (${detectedGaps.filter(g => !g.resolved).length}):
${detectedGaps.filter(g => !g.resolved).map(g => `- [${g.severity.toUpperCase()}] ${g.field}: ${g.message}`).join("\n") || "None"}

QUALITY SCORE: ${brd.qualityScore?.total ?? 0}/100 (${brd.qualityScore?.grade ?? "F"})

RULES:
- NEVER use markdown formatting, asterisks, bold, italic, or bullet points
- Plain text only
- Keep responses to 3-4 sentences MAXIMUM
- Ask only ONE question per response
- Be conversational and direct — like a colleague, not a consultant
- No numbered steps, no headers, no lists
- Surface ONE gap at a time, starting with highest severity (critical before warning)
- If giving feedback, state the issue in one sentence then ask one specific question
- Never write more than 60 words in a single response
- When the user agrees to a suggestion or provides missing info, immediately apply the change using the BRD_UPDATE tag
- Do not ask for confirmation before updating — just update and tell the user what you changed in one sentence
- After updating say: "Done. I've updated [section name]." then ask the next most critical question
- You can update any of these sections: executiveSummary, stakeholderRegister, functionalReqs, nfrReqs, assumptions, successMetrics, externalInterfaces, useCases, glossary
- To update BRD include: <BRD_UPDATE>{"section": "sectionName", "action": "replace", "content": "new content"}</BRD_UPDATE>
- Once all confirmed gaps are resolved, perform your own semantic conflict check on the full BRD
- When no gaps or conflicts remain, emit: AUDIT_COMPLETE`;

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
    });

    const mappedHistory = (chatHistory ?? []).map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Remove leading assistant/model messages
    while (mappedHistory.length > 0 && mappedHistory[0].role === "model") {
      mappedHistory.shift();
    }

    // Ensure history alternates properly
    const cleanHistory = mappedHistory.filter((msg: any, i: number) => {
      if (i === 0) return true;
      return msg.role !== mappedHistory[i - 1].role;
    });

    const chat = model.startChat({ history: cleanHistory });
    const result = await chat.sendMessage(userMessage);
    const rawResponse = result.response.text();

    // Strip markdown formatting
    const cleanResponse = rawResponse
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/<BRD_UPDATE>.*?<\/BRD_UPDATE>/gs, "")
      .trim();

    // ── Parse and apply BRD updates ───────────────────────────────────────
    const updates = parseBRDUpdates(rawResponse);
    let brdUpdated = false;

    if (updates.length > 0) {
      for (const update of updates) {
        await applyBrdUpdate(brdVersionId, update, roundNumber);
        persistedGaps = markGapResolved(persistedGaps, update.section, roundNumber);
        brdUpdated = true;
      }

      // Recalculate quality score after patches
      const openSnap = await db.collection("conflictFlags")
        .where("brdVersionId", "==", brdVersionId)
        .where("status", "==", "open")
        .get();

      const updatedBrd = await db.collection("brdVersions").doc(brdVersionId).get();
      const brdData = updatedBrd.data();
      const score = await computeQualityScore({
        sections: brdData?.sections ?? {},
        openConflictCount: openSnap.size,
        version: brdData?.version,
      }, GEMINI_API_KEY.value());

      // Flatten for legacy UI
      const flatScore = {
        total: score.composite,
        completeness: score.completeness.total,
        consistency: score.consistency.total,
        clarity: score.clarity.total,
        grade: score.grade,
        breakdown: {
          completeness: score.completeness.breakdown,
          consistency: score.consistency.breakdown,
          clarity: score.clarity.breakdown,
        },
      };

      await db.collection("brdVersions").doc(brdVersionId).update({
        qualityScore: flatScore,
        detectedGaps: persistedGaps,
      });
    }

    // Save assistant message
    await db.collection("chatMessages").add({
      projectId,
      brdVersionId,
      role: "assistant",
      content: cleanResponse,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      message: cleanResponse,
      brdUpdated,
      detectedGaps: persistedGaps,
      gapsResolved: persistedGaps.filter(g => g.resolved).length,
      gapsRemaining: persistedGaps.filter(g => !g.resolved).length,
    };
  }
);
