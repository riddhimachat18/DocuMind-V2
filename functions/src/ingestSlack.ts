import { onCall } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { WebClient } from "@slack/web-api";
import { invalidateCache } from "./retrieval.js";
import { embedText } from "./embedSnippet.js";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Few-shot classification prompt for Gemini ─────────────────────────────────
function getFewShotClassificationPrompt(messageContent: string): string {
  return `You are a requirements analyst. Classify Slack messages into: REQUIREMENT, DECISION, CONSTRAINT, or NOISE.

EXAMPLES:

Message: "We need to implement OAuth2 authentication for the API"
Classification: REQUIREMENT
Reason: Describes a specific feature the system must have.

Message: "After the standup, we agreed to use React for the frontend"
Classification: DECISION
Reason: Documents an agreed-upon choice.

Message: "The database must be hosted in the EU region for GDPR compliance"
Classification: CONSTRAINT
Reason: Establishes a non-negotiable boundary.

Message: "lol thanks! 😂"
Classification: NOISE
Reason: Social message with no technical content.

Message: "API calls must complete within 500ms or timeout"
Classification: CONSTRAINT
Reason: Defines a hard performance limit.

Message: "Users should be able to filter results by date range"
Classification: REQUIREMENT
Reason: Specifies system capability.

NOW CLASSIFY THIS MESSAGE:
${messageContent}

Output ONLY a JSON object: {"classification": "REQUIREMENT|DECISION|CONSTRAINT|NOISE", "reason": "brief explanation"}`;
}

export const ingestSlack = onCall(
  {
    secrets: [GEMINI_API_KEY],
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const { projectId, slackToken, channelId, daysBack = 7 } = data;
    if (!projectId || !slackToken || !channelId) {
      throw new Error("projectId, slackToken, and channelId are required");
    }

    const key = GEMINI_API_KEY.value();
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Initialize Slack client
    const slack = new WebClient(slackToken);

    try {
      // Calculate timestamp for daysBack
      const oldest = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;

      // Fetch messages from channel
      const result = await slack.conversations.history({
        channel: channelId,
        oldest: oldest.toString(),
        limit: 1000,
      });

      const messages = result.messages || [];
      if (messages.length === 0) {
        return { success: true, messageCount: 0, snippetCount: 0, breakdown: {} };
      }

      // Fetch user info for author names
      const userCache = new Map<string, string>();
      const getUserName = async (userId: string): Promise<string> => {
        if (userCache.has(userId)) return userCache.get(userId)!;
        try {
          const userInfo = await slack.users.info({ user: userId });
          const name = userInfo.user?.real_name || userInfo.user?.name || userId;
          userCache.set(userId, name);
          return name;
        } catch {
          return userId;
        }
      };

      // Process messages
      const processedMessages = await Promise.all(
        messages
          .filter((msg: any) => msg.text && msg.text.trim().length > 10) // Filter out empty/short messages
          .map(async (msg: any) => {
            const author = msg.user ? await getUserName(msg.user) : "Unknown";
            const timestamp = msg.ts
              ? new Date(parseFloat(msg.ts) * 1000).toISOString()
              : new Date().toISOString();

            return {
              text: msg.text!,
              author,
              timestamp,
              threadTs: msg.thread_ts,
            };
          })
      );

      // Classify messages using few-shot Gemini prompting
      const classifyPromises = processedMessages.map(async (msg: any) => {
        const prompt = getFewShotClassificationPrompt(msg.text);

        try {
          const result = await model.generateContent(prompt);
          const raw = result.response.text().trim();
          const cleaned = raw.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          return {
            ...msg,
            classification: parsed.classification || "NOISE",
            reason: parsed.reason || "",
          };
        } catch (error) {
          console.warn(`Classification failed for message:`, error);
          return { ...msg, classification: "NOISE", reason: "Classification error" };
        }
      });

      const classifiedMessages = await Promise.all(classifyPromises);

      // Filter out NOISE
      const validMessages = classifiedMessages.filter((m: any) => m.classification !== "NOISE");

      // Embed valid messages
      const EMBED_CONCURRENCY = 30;
      const embedded: Array<{
        message: typeof validMessages[0];
        embedding: number[];
      }> = [];

      for (let i = 0; i < validMessages.length; i += EMBED_CONCURRENCY) {
        const slice = validMessages.slice(i, i + EMBED_CONCURRENCY);
        const results = await Promise.allSettled(
          slice.map(async (message: any) => {
            const embedding = await embedText(message.text, key);
            return { message, embedding };
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled") embedded.push(r.value);
          else console.warn("Embedding failed:", (r as PromiseRejectedResult).reason?.message);
        }
      }

      // Store in Firestore
      const breakdown: Record<string, number> = { REQUIREMENT: 0, DECISION: 0, CONSTRAINT: 0 };
      const firestoreBatch = db.batch();

      for (const item of embedded) {
        const ref = db.collection("snippets").doc();
        firestoreBatch.set(ref, {
          projectId,
          source: "slack",
          filename: `Slack: ${channelId}`,
          rawText: item.message.text,
          classification: item.message.classification,
          embedding: item.embedding,
          confidence: 0.85,
          author: item.message.author,
          authorRole: "Slack User",
          timestamp: item.message.timestamp,
          metadata: {
            channelId,
            threadTs: item.message.threadTs,
          },
        });
        breakdown[item.message.classification as keyof typeof breakdown] =
          (breakdown[item.message.classification as keyof typeof breakdown] || 0) + 1;
      }

      await firestoreBatch.commit();

      // Update project
      await db.collection("projects").doc(projectId).update({
        "connectedSources.slack": true,
      });

      invalidateCache(projectId);

      return {
        success: true,
        messageCount: messages.length,
        snippetCount: embedded.length,
        breakdown,
      };
    } catch (error: any) {
      console.error("Slack ingestion error:", error);
      throw new Error(`Slack ingestion failed: ${error.message}`);
    }
  }
);
