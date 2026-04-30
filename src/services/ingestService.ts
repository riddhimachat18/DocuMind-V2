import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../lib/firebase";

const functions = getFunctions(app);

const ingestGmailFn = httpsCallable(functions, "ingestGmail", { timeout: 540000 });
const ingestSlackFn = httpsCallable(functions, "ingestSlack", { timeout: 540000 });

export interface IngestResult {
  success: boolean;
  snippetCount: number;
  breakdown: Record<string, number>;
}

/**
 * Ingest Gmail threads into the project's snippet store.
 * accessToken comes from the Google OAuth2 popup flow.
 */
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
 * Ingest Slack channel messages into the project's snippet store.
 * channelIds is a list of Slack channel IDs (e.g. ["C012AB3CD"]).
 */
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
 * Trigger Google OAuth2 popup and return the access token.
 * Requires VITE_GOOGLE_CLIENT_ID in env.
 */
export async function getGoogleAccessToken(): Promise<{ accessToken: string; refreshToken?: string }> {
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
