import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

const SLACK_CLIENT_ID = defineSecret("SLACK_CLIENT_ID");
const SLACK_CLIENT_SECRET = defineSecret("SLACK_CLIENT_SECRET");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/**
 * Slack OAuth callback — exchanges the authorization code for an access token
 * and stores it in Firestore under users/{uid}/integrations/slack.
 *
 * Query params expected:
 *   code  — the authorization code from Slack
 *   state — the Firebase UID of the user who initiated the flow
 *
 * On success, closes the popup via a small HTML page that posts a message
 * to the opener window so the frontend can react.
 */
export const slackOAuthCallback = onRequest(
  {
    secrets: [SLACK_CLIENT_ID, SLACK_CLIENT_SECRET],
    cors: true,
  },
  async (req, res) => {
    const { code, state: uid, error } = req.query as Record<string, string>;

    const closePopup = (success: boolean, message: string) => {
      res.send(`<!DOCTYPE html><html><body><script>
        window.opener && window.opener.postMessage(
          { type: "slack-oauth", success: ${success}, message: ${JSON.stringify(message)} },
          window.location.origin
        );
        window.close();
      </script></body></html>`);
    };

    if (error) {
      return closePopup(false, `Slack OAuth denied: ${error}`);
    }

    if (!code || !uid) {
      return closePopup(false, "Missing code or state parameter");
    }

    const clientId = SLACK_CLIENT_ID.value();
    const clientSecret = SLACK_CLIENT_SECRET.value();

    if (!clientId || !clientSecret) {
      return closePopup(false, "Slack OAuth credentials not configured");
    }

    // Exchange code for access token
    const redirectUri = `${req.protocol}://${req.hostname}/slackOAuthCallback`;
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    let tokenData: any;
    try {
      const tokenRes = await fetch(
        `https://slack.com/api/oauth.v2.access?${params.toString()}`,
        { method: "POST" }
      );
      tokenData = await tokenRes.json();
    } catch (e: any) {
      return closePopup(false, `Token exchange failed: ${e.message}`);
    }

    if (!tokenData.ok) {
      return closePopup(false, `Slack error: ${tokenData.error}`);
    }

    // Store token in Firestore — users/{uid}/integrations/slack
    await db
      .collection("users")
      .doc(uid)
      .collection("integrations")
      .doc("slack")
      .set({
        access_token: tokenData.access_token,
        team_id: tokenData.team?.id ?? "",
        team_name: tokenData.team?.name ?? "",
        authed_user_id: tokenData.authed_user?.id ?? "",
        connected_at: admin.firestore.FieldValue.serverTimestamp(),
      });

    return closePopup(true, "Slack connected successfully");
  }
);
