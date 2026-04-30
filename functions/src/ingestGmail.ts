import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import { classifyText } from "./classifyText";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/** Strip HTML tags and decode basic entities from Gmail message body */
function decodeBody(encoded: string): string {
  const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Recursively extract plain-text body from MIME parts */
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBody(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  // Fallback: base64 body on the payload itself
  if (payload.body?.data) return decodeBody(payload.body.data);
  return "";
}

export const ingestGmail = onCall(
  {
    secrets: [GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const {
      projectId,
      accessToken,
      refreshToken,
      query = "subject:(requirements OR project OR feature OR specification)",
      maxResults = 50,
    } = data;

    if (!projectId || !accessToken) {
      throw new Error("projectId and accessToken are required");
    }

    const geminiKey = GEMINI_API_KEY.value();
    const clientId = GOOGLE_CLIENT_ID.value();
    const clientSecret = GOOGLE_CLIENT_SECRET.value();

    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

    // Set up OAuth2 client
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    // Fetch matching threads
    const threadsRes = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: Math.min(maxResults, 100),
    });

    const threads = threadsRes.data.threads ?? [];
    if (threads.length === 0) return { success: true, snippetCount: 0, breakdown: {} };

    const breakdown: Record<string, number> = { REQUIREMENT: 0, DECISION: 0, CONSTRAINT: 0 };
    let snippetCount = 0;
    const batch = db.batch();

    // Process threads in batches of 5 to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < threads.length; i += BATCH_SIZE) {
      const slice = threads.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        slice.map(async (thread) => {
          if (!thread.id) return;

          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: thread.id,
            format: "full",
          });

          for (const message of threadData.data.messages ?? []) {
            const headers = message.payload?.headers ?? [];
            const sender = headers.find((h) => h.name === "From")?.value ?? "Unknown";
            const dateHeader = headers.find((h) => h.name === "Date")?.value;
            const timestamp = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();
            const subject = headers.find((h) => h.name === "Subject")?.value ?? "";

            const body = extractBody(message.payload);
            if (!body || body.length < 20) continue;

            // Classify inline at ingest time
            const { label, confidence } = await classifyText(body.slice(0, 800), geminiKey);
            if (label === "NOISE" || confidence < 0.7) continue;

            const ref = db.collection("snippets").doc();
            batch.set(ref, {
              projectId,
              source: "gmail",
              filename: subject || `Gmail thread ${thread.id}`,
              rawText: body.slice(0, 1000),
              classification: label,
              confidence,
              author: sender,
              authorRole: "Email Sender",
              timestamp,
              threadId: thread.id,
              messageId: message.id,
            });

            breakdown[label as keyof typeof breakdown]++;
            snippetCount++;
          }
        })
      );
    }

    await batch.commit();
    return { success: true, snippetCount, breakdown };
  }
);
