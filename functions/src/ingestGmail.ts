import { onCall } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { google } from "googleapis";
import { invalidateCache } from "./retrieval.js";
import { embedText } from "./embedSnippet.js";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Few-shot classification prompt for Gemini ─────────────────────────────────
function getFewShotClassificationPrompt(emailContent: string): string {
  return `You are a requirements analyst. Classify email content into: REQUIREMENT, DECISION, CONSTRAINT, or NOISE.

EXAMPLES:

Email: "We need to add a login page with username and password fields."
Classification: REQUIREMENT
Reason: Describes a specific feature the system must have.

Email: "After discussion, we decided to use PostgreSQL instead of MongoDB."
Classification: DECISION
Reason: Documents an agreed-upon choice.

Email: "The system must comply with GDPR regulations."
Classification: CONSTRAINT
Reason: Establishes a non-negotiable boundary.

Email: "Thanks for the update! Looking forward to the meeting."
Classification: NOISE
Reason: Social pleasantry with no technical content.

Email: "The API response time cannot exceed 200ms."
Classification: CONSTRAINT
Reason: Defines a hard performance limit.

Email: "Users should be able to export reports as PDF or Excel."
Classification: REQUIREMENT
Reason: Specifies system capability.

NOW CLASSIFY THIS EMAIL:
${emailContent}

Output ONLY a JSON object: {"classification": "REQUIREMENT|DECISION|CONSTRAINT|NOISE", "reason": "brief explanation"}`;
}

export const ingestGmail = onCall(
  {
    secrets: [GEMINI_API_KEY],
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async ({ data, auth }) => {
    if (!auth) throw new Error("User must be authenticated");

    const { projectId, accessToken, query, maxResults = 50 } = data;
    if (!projectId || !accessToken) {
      throw new Error("projectId and accessToken are required");
    }

    const key = GEMINI_API_KEY.value();
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Fetch emails matching query
      const listResponse = await gmail.users.messages.list({
        userId: "me",
        q: query || "is:unread",
        maxResults: maxResults,
      });

      const messages = listResponse.data.messages || [];
      if (messages.length === 0) {
        return { success: true, emailCount: 0, snippetCount: 0, breakdown: {} };
      }

      // Fetch full email content in parallel
      const emailPromises = messages.map(async (msg: any) => {
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        const headers = fullMsg.data.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "No Subject";
        const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
        const date = headers.find((h: any) => h.name === "Date")?.value || new Date().toISOString();

        // Extract email body
        let body = "";
        const parts = fullMsg.data.payload?.parts || [];
        for (const part of parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            body += Buffer.from(part.body.data, "base64").toString("utf-8");
          }
        }

        // Fallback to snippet if no body found
        if (!body && fullMsg.data.snippet) {
          body = fullMsg.data.snippet;
        }

        return {
          id: msg.id!,
          subject,
          from,
          date,
          body: body.trim(),
        };
      });

      const emails = await Promise.all(emailPromises);

      // Classify emails using few-shot Gemini prompting
      const classifyPromises = emails.map(async (email: any) => {
        const content = `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`;
        const prompt = getFewShotClassificationPrompt(content);

        try {
          const result = await model.generateContent(prompt);
          const raw = result.response.text().trim();
          const cleaned = raw.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          return {
            ...email,
            classification: parsed.classification || "NOISE",
            reason: parsed.reason || "",
          };
        } catch (error) {
          console.warn(`Classification failed for email ${email.id}:`, error);
          return { ...email, classification: "NOISE", reason: "Classification error" };
        }
      });

      const classifiedEmails = await Promise.all(classifyPromises);

      // Filter out NOISE
      const validEmails = classifiedEmails.filter((e: any) => e.classification !== "NOISE");

      // Embed valid emails
      const EMBED_CONCURRENCY = 30;
      const embedded: Array<{
        email: typeof validEmails[0];
        embedding: number[];
      }> = [];

      for (let i = 0; i < validEmails.length; i += EMBED_CONCURRENCY) {
        const slice = validEmails.slice(i, i + EMBED_CONCURRENCY);
        const results = await Promise.allSettled(
          slice.map(async (email: any) => {
            const content = `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`;
            const embedding = await embedText(content, key);
            return { email, embedding };
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
          source: "gmail",
          filename: `Email: ${item.email.subject}`,
          rawText: `Subject: ${item.email.subject}\nFrom: ${item.email.from}\nDate: ${item.email.date}\n\n${item.email.body}`,
          classification: item.email.classification,
          embedding: item.embedding,
          confidence: 0.85,
          author: item.email.from,
          authorRole: "Email Sender",
          timestamp: item.email.date,
          metadata: {
            emailId: item.email.id,
            subject: item.email.subject,
            from: item.email.from,
          },
        });
        breakdown[item.email.classification as keyof typeof breakdown] =
          (breakdown[item.email.classification as keyof typeof breakdown] || 0) + 1;
      }

      await firestoreBatch.commit();

      // Update project
      await db.collection("projects").doc(projectId).update({
        "connectedSources.gmail": true,
      });

      invalidateCache(projectId);

      return {
        success: true,
        emailCount: emails.length,
        snippetCount: embedded.length,
        breakdown,
      };
    } catch (error: any) {
      console.error("Gmail ingestion error:", error);
      throw new Error(`Gmail ingestion failed: ${error.message}`);
    }
  }
);
