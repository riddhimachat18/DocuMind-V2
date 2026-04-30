import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { storage, auth } from "../lib/firebase";

const CLASSIFY_URL = import.meta.env.VITE_CLASSIFY_SNIPPET_URL;
const GENERATE_BRD_URL = import.meta.env.VITE_GENERATE_BRD_URL;
const DETECT_CONFLICTS_URL = import.meta.env.VITE_DETECT_CONFLICTS_URL;

/**
 * Upload meeting transcript to Firebase Storage and trigger processing pipeline
 */
export const uploadTranscript = async (
  file: File,
  projectId: string
): Promise<{ url: string; path: string; snippets?: any[] }> => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const timestamp = Date.now();
  const fileName = `${timestamp}_${file.name}`;
  const storagePath = `transcript_upload/${user.uid}/${projectId}/${fileName}`;
  
  const storageRef = ref(storage, storagePath);
  
  console.log("Step 1: Uploading transcript to GCS:", storagePath);
  await uploadBytes(storageRef, file);
  
  const downloadURL = await getDownloadURL(storageRef);
  console.log("Transcript uploaded successfully:", downloadURL);
  
  // Step 2: Trigger classify snippet service
  console.log("Step 2: Triggering classifysnippet service...");
  const snippets = await triggerClassifySnippet(downloadURL, projectId, fileName);
  
  // Step 3: Trigger generate BRD service
  console.log("Step 3: Triggering generatebrd service...");
  await triggerGenerateBRD(projectId);
  
  // Step 4: Trigger detect conflicts service
  console.log("Step 4: Triggering detectconflicts service...");
  await triggerDetectConflicts(projectId);
  
  return {
    url: downloadURL,
    path: storagePath,
    snippets,
  };
};

/**
 * Step 2: Call classifysnippet Cloud Run service
 */
const triggerClassifySnippet = async (
  gcsUrl: string,
  projectId: string,
  fileName: string
): Promise<any[]> => {
  try {
    const response = await fetch(`${CLASSIFY_URL}/classify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gcs_url: gcsUrl,
        project_id: projectId,
        file_name: fileName,
        source_type: "meeting_transcript",
      }),
    });

    if (!response.ok) {
      throw new Error(`Classify service failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Snippets classified:", data);
    return data.snippets || [];
  } catch (error) {
    console.error("Error calling classify service:", error);
    throw error;
  }
};

/**
 * Step 3: Call generatebrd Cloud Run service
 */
const triggerGenerateBRD = async (projectId: string): Promise<any> => {
  try {
    const response = await fetch(`${GENERATE_BRD_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: projectId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generate BRD service failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("BRD generated:", data);
    return data;
  } catch (error) {
    console.error("Error calling generate BRD service:", error);
    throw error;
  }
};

/**
 * Step 4: Call detectconflicts Cloud Run service
 */
const triggerDetectConflicts = async (projectId: string): Promise<any> => {
  try {
    const response = await fetch(`${DETECT_CONFLICTS_URL}/detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: projectId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Detect conflicts service failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Conflicts detected:", data);
    return data;
  } catch (error) {
    console.error("Error calling detect conflicts service:", error);
    throw error;
  }
};

/**
 * Step 5: Resolve conflict (called when user resolves in UI)
 */
export const resolveConflict = async (
  conflictId: string,
  resolution: string,
  brdId: string
): Promise<any> => {
  const RESOLVE_URL = import.meta.env.VITE_RESOLVE_CONFLICT_URL;
  
  try {
    const response = await fetch(`${RESOLVE_URL}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conflict_id: conflictId,
        resolution,
        brd_id: brdId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resolve conflict service failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Conflict resolved:", data);
    return data;
  } catch (error) {
    console.error("Error calling resolve conflict service:", error);
    throw error;
  }
};

/**
 * List all transcripts for a project
 */
export const listTranscripts = async (
  projectId: string
): Promise<Array<{ name: string; url: string; path: string }>> => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const folderPath = `transcript_upload/${user.uid}/${projectId}`;
  const folderRef = ref(storage, folderPath);
  
  const result = await listAll(folderRef);
  
  const transcripts = await Promise.all(
    result.items.map(async (itemRef) => {
      const url = await getDownloadURL(itemRef);
      return {
        name: itemRef.name,
        url,
        path: itemRef.fullPath,
      };
    })
  );
  
  return transcripts;
};
