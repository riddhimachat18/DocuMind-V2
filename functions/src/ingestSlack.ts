import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { WebClient } from "@slack/web-api";
import { classifyText } from "./classifyText";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const ingestSlack = onCall(
  {
    secrets: [GEMINI_API_KEY],
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const {
      projectId,
      channelIds,              // string[] — Slack channel IDs to ingest
      daysBack = 30,
      maxMessagesPerChannel = 200,
    } = data;

    if (!projectId || !channelIds?.length) {
      throw new Error("projectId and channelIds are required");
    }

    const geminiKey = GEMINI_API_KEY.value();
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

    // Read the per-user Slack token from Firestore
    const integrationDoc = await db
      .collection("users")
      .doc(auth.uid)
      .collection("integrations")
      .doc("slack")
      .get();

    if (!integrationDoc.exists) {
      throw new Error("Slack not connected. Please connect Slack first.");
    }

    const slackToken: string = integrationDoc.data()!.access_token;
    if (!slackToken) throw new Error("Slack access token missing. Please reconnect Slack.");

    const client = new WebClient(slackToken);

    // oldest timestamp = now minus daysBack
    const oldest = String(Math.floor(Date.now() / 1000) - daysBack * 86400);

    // Resolve user IDs to display names once
    const usersMap: Record<string, string> = {};
    try {
      const usersRes = await client.users.list({});
      for (const member of usersRes.members ?? []) {
        if (member.id) {
          usersMap[member.id] = member.profile?.display_name || member.name || member.id;
        }
      }
    } catch {
      // Non-fatal — fall back to raw user IDs
    }

    const breakdown: Record<string, number> = { REQUIREMENT: 0, DECISION: 0, CONSTRAINT: 0 };
    let snippetCount = 0;
    const batch = db.batch();

    for (const channelId of channelIds as string[]) {
      let channelName = channelId;
      try {
        const info = await client.conversations.info({ channel: channelId });
        channelName = (info.channel as any)?.name ?? channelId;
      } catch {
        // Non-fatal
      }

      let cursor: string | undefined;
      let fetched = 0;

      do {
        const result = await client.conversations.history({
          channel: channelId,
          oldest,
          limit: Math.min(200, maxMessagesPerChannel - fetched),
          cursor,
        });

        const messages = result.messages ?? [];

        const BATCH_SIZE = 10;
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
          const slice = messages.slice(i, i + BATCH_SIZE);

          await Promise.allSettled(
            slice.map(async (msg) => {
              const text = msg.text ?? "";
              if (!text || text.length < 20) return;

              const author = msg.user ? (usersMap[msg.user] ?? msg.user) : "Unknown";
              const timestamp = msg.ts
                ? new Date(parseFloat(msg.ts) * 1000).toISOString()
                : new Date().toISOString();

              const { label, confidence } = await classifyText(text.slice(0, 800), geminiKey);
              if (label === "NOISE" || confidence < 0.7) return;

              const ref = db.collection("snippets").doc();
              batch.set(ref, {
                projectId,
                source: "slack",
                filename: `#${channelName}`,
                rawText: text.slice(0, 1000),
                classification: label,
                confidence,
                author,
                authorRole: "Slack User",
                timestamp,
                channelId,
                messageTs: msg.ts,
              });

              breakdown[label as keyof typeof breakdown]++;
              snippetCount++;
            })
          );
        }

        fetched += messages.length;
        cursor = result.response_metadata?.next_cursor;
      } while (cursor && fetched < maxMessagesPerChannel);
    }

    await batch.commit();
    return { success: true, snippetCount, breakdown };
  }
);
