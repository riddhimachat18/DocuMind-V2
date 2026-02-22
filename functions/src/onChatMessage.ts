import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { computeQualityScore } from "./scoreQuality";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function detectGaps(brd: any) {
  const gaps = [];
  //const text = JSON.stringify(brd.sections ?? {});
  if ((brd.sections?.executiveSummary?.length ?? 0) < 100)
    gaps.push({ type: "missing_section", description: "Executive summary too short or missing" });
  if (!brd.sections?.successMetrics || brd.sections.successMetrics.length < 50)
    gaps.push({ type: "missing_metrics", description: "Success metrics section is empty or too brief" });
  if (!brd.sections?.nfrReqs || brd.sections.nfrReqs.length < 50)
    gaps.push({ type: "missing_nfr", description: "Non-functional requirements section is incomplete" });
  return gaps;
}

async function applyBrdUpdate(brdVersionId: string, update: any) {
  await db.collection("brdVersions").doc(brdVersionId).update({
    [`sections.${update.section}`]: update.value,
    lastUpdatedSection: update.section,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

export const onChatMessage = onCall(
  { 
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 120,
    cors: true  // Enable CORS for all origins
  },
  async ({ data, auth }) => {
    // Verify authentication
    if (!auth) {
      throw new Error('User must be authenticated');
    }

    const { projectId, brdVersionId, userMessage, chatHistory } = data;
    
    if (!projectId || !brdVersionId || !userMessage) {
      throw new Error('projectId, brdVersionId, and userMessage are required');
    }

    const key = GEMINI_API_KEY.value();
    if (!key) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const [brdDoc, conflictsSnap] = await Promise.all([
      db.collection("brdVersions").doc(brdVersionId).get(),
      db.collection("conflictFlags")
        .where("brdVersionId", "==", brdVersionId)
        .where("status", "==", "open").get()
    ]);

    const brd = brdDoc.data()!;
    const openConflicts = conflictsSnap.docs.map(d => d.data());
    const gaps = detectGaps(brd);

    const systemPrompt = `You are the DocuMind AI Quality Auditor — an expert Business Analyst.

CURRENT BRD:
${JSON.stringify(brd.sections, null, 2)}

OPEN CONFLICTS (${openConflicts.length}):
${openConflicts.map(c => `- "${c.requirementA}" CONFLICTS WITH "${c.requirementB}"`).join("\n") || "None"}

GAPS (${gaps.length}):
${gaps.map(g => `- ${g.description}`).join("\n") || "None"}

QUALITY SCORE: ${brd.qualityScore?.total ?? 0}/100

RULES:
- NEVER use markdown formatting, asterisks, bold, italic, or bullet points
- Plain text only
- Keep responses to 3-4 sentences MAXIMUM
- Ask only ONE question per response
- Be conversational and direct — like a colleague, not a consultant
- No numbered steps, no headers, no lists
- Surface ONE gap at a time, not all gaps at once
- If giving feedback, state the issue in one sentence then ask one specific question
- Never write more than 60 words in a single response
- When the user agrees to a suggestion or provides missing info, immediately apply the change using the BRD_UPDATE tag
- Do not ask for confirmation before updating — just update and tell the user what you changed in one sentence
- After updating say: "Done. I've updated [section name]." then ask the next most critical question
- You can update any of these sections: executiveSummary, stakeholderRegister, functionalReqs, nfrReqs, assumptions, successMetrics
- To update BRD include: <BRD_UPDATE>{"section": "sectionName", "value": "new content"}</BRD_UPDATE>`;

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt
    });

    const mappedHistory = (chatHistory ?? []).map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));

    // Remove leading assistant/model messages — Gemini requires user first
    while (mappedHistory.length > 0 && mappedHistory[0].role === "model") {
      mappedHistory.shift();
    }

    // Also ensure history alternates properly — remove consecutive same roles
    const cleanHistory = mappedHistory.filter((msg: any, i: number) => {
      if (i === 0) return true;
      return msg.role !== mappedHistory[i - 1].role;
    });

    const chat = model.startChat({
      history: cleanHistory
    });

    const result = await chat.sendMessage(userMessage);
    const rawResponse = result.response.text();
    
    // Strip all markdown formatting
    const cleanResponse = rawResponse
      .replace(/\*\*(.*?)\*\*/g, "$1")        // remove bold **text**
      .replace(/\*(.*?)\*/g, "$1")            // remove italic *text*
      .replace(/#{1,6}\s/g, "")               // remove headers
      .replace(/`{1,3}[^`]*`{1,3}/g, "")      // remove code blocks
      .replace(/<BRD_UPDATE>.*?<\/BRD_UPDATE>/gs, "") // remove update tags
      .trim();

    const updateMatch = rawResponse.match(/<BRD_UPDATE>(.*?)<\/BRD_UPDATE>/s);
    if (updateMatch) {
      const update = JSON.parse(updateMatch[1]);
      await applyBrdUpdate(brdVersionId, update);
      const openSnap = await db.collection("conflictFlags")
        .where("brdVersionId", "==", brdVersionId)
        .where("status", "==", "open").get();
      const updatedBrd = await db.collection("brdVersions").doc(brdVersionId).get();
      const score = computeQualityScore(updatedBrd.data(), openSnap.size);
      await db.collection("brdVersions").doc(brdVersionId).update({ qualityScore: score });
    }

    await db.collection("chatMessages").add({
      projectId, brdVersionId,
      role: "assistant",
      content: cleanResponse,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { message: cleanResponse, brdUpdated: !!updateMatch };
  }
);
