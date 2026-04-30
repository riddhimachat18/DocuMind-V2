import express from "express";
import * as admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";

if (!admin.apps.length) admin.initializeApp();
const storage = new Storage();
const BUCKET_NAME = "transcript_upload25";

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  next();
});

// Generate signed URL for direct upload to GCS
app.post("/get-signed-url", async (req, res) => {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
      return;
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const { userId: requestUserId, projectId, fileName, storagePath, contentType } = req.body;

    // Verify userId matches authenticated user
    if (requestUserId !== userId) {
      res.status(403).json({ error: "Forbidden: User ID mismatch" });
      return;
    }

    // Create file path in bucket
    const filePath = storagePath || `${userId}/${projectId}/${fileName}`;
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filePath);

    // Generate signed URL for upload (valid for 15 minutes)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType || 'application/octet-stream',
    });

    // Generate public URL (will be accessible after upload)
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filePath}`;

    res.json({
      signedUrl,
      publicUrl,
      filePath,
      bucket: BUCKET_NAME
    });
  } catch (error: any) {
    console.error("Signed URL generation error:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: error.stack,
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`uploadTranscript service listening on port ${PORT}`);
});

export default app;
