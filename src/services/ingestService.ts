import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import app from "../lib/firebase";
import { db } from "../lib/firebase";
import { getAuth } from "firebase/auth";

const functions = getFunctions(app);

const ingestGmailFn = httpsCallable(functions, "ingestGmail", { timeout: 540000 });
const ingestSlackFn = httpsCallable(functions, "ingestSlack", { timeout: 540000 });

export interface IngestResult {
  success: boolean;
  snippetCount: number;
  breakdown: Record<string, number>;
}

export interface SlackIntegration {
  access_token: string;
  team_id: string;
  team_name: string;
  connected_at: any;
}

// ── Gmail ─────────────────────────────────────────────────────────────────────

export async function ingestGmail(params: {
  projectId: string;
  accessToken: string;
  refreshToken?: string;
  query?: string;
  maxResults?: number;
}): Promise<IngestResult> {
  const res = await ingestGmailFn(params);
  return res.data as IngestResult;
}

/**
 * Opens a Google OAuth2 popup (implicit flow, read-only Gmail scope).
 * Returns the access token once the popup completes.
 */
export async function getGoogleAccessToken(): Promise<{ accessToken: string }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID not configured");

  const redirectUri = `${window.location.origin}/oauth/callback`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly");
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${scope}` +
    `&prompt=consent`;

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, "gmail-oauth", "width=500,height=600");
    if (!popup) { reject(new Error("Popup blocked")); return; }

    const timer = setInterval(() => {
      try {
        const url = popup.location.href;
        if (url.includes("access_token=")) {
          clearInterval(timer);
          popup.close();
          const hash = new URL(url.replace("#", "?")).searchParams;
          const accessToken = hash.get("access_token") ?? "";
          resolve({ accessToken });
        }
      } catch {
        // Cross-origin — still loading
      }
      if (popup.closed) {
        clearInterval(timer);
        reject(new Error("OAuth popup closed"));
      }
    }, 500);
  });
}

// ── Slack ─────────────────────────────────────────────────────────────────────

export async function ingestSlack(params: {
  projectId: string;
  channelIds: string[];
  daysBack?: number;
  maxMessagesPerChannel?: number;
}): Promise<IngestResult> {
  const res = await ingestSlackFn(params);
  return res.data as IngestResult;
}

/**
 * Check whether the current user has a connected Slack workspace.
 */
export async function getSlackIntegration(): Promise<SlackIntegration | null> {
  const uid = getAuth(app).currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid, "integrations", "slack"));
  return snap.exists() ? (snap.data() as SlackIntegration) : null;
}

/**
 * Opens the Slack OAuth popup. Passes the user's Firebase UID as `state`
 * so the backend callback can store the token against the right user.
 *
 * Resolves when the popup posts a success message back, rejects on error.
 */
export async function connectSlack(): Promise<void> {
  const clientId = import.meta.env.VITE_SLACK_CLIENT_ID;
  if (!clientId) throw new Error("VITE_SLACK_CLIENT_ID not configured");

  const uid = getAuth(app).currentUser?.uid;
  if (!uid) throw new Error("Must be signed in to connect Slack");

  const redirectUri = encodeURIComponent(
    `${import.meta.env.VITE_FUNCTIONS_BASE_URL ?? ""}/slackOAuthCallback`
  );
  const scopes = encodeURIComponent(
    "channels:history,channels:read,users:read"
  );
  const authUrl =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${uid}`;

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, "slack-oauth", "width=500,height=700");
    if (!popup) { reject(new Error("Popup blocked")); return; }

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "slack-oauth") return;
      window.removeEventListener("message", onMessage);
      clearInterval(closedTimer);
      if (event.data.success) {
        resolve();
      } else {
        reject(new Error(event.data.message ?? "Slack OAuth failed"));
      }
    };

    window.addEventListener("message", onMessage);

    // Fallback: detect if user just closed the popup without completing
    const closedTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedTimer);
        window.removeEventListener("message", onMessage);
        reject(new Error("OAuth popup closed"));
      }
    }, 500);
  });
}
