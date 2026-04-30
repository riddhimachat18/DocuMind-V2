import { auth, storage, db } from "../lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

export interface BRDVersion {
  id?: string;
  projectId: string;
  version: string;
  versionNumber: number;
  sections: {
    executiveSummary?: string;
    stakeholderRegister?: string;
    functionalReqs?: string;
    nfrReqs?: string;
    assumptions?: string;
    successMetrics?: string;
  };
  createdBy: string;
  createdAt: any;
  status: "draft" | "approved" | "archived";
  qualityScore?: number;
  changeLog?: string;
  storagePath?: string;
  downloadURL?: string;
}

/**
 * Get the next version number for a project
 */
async function getNextVersionNumber(projectId: string): Promise<number> {
  const versionsRef = collection(db, "brdVersions");
  const q = query(
    versionsRef,
    where("projectId", "==", projectId),
    orderBy("versionNumber", "desc"),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return 1.0; // Start with v1.0
  }
  
  const latestVersion = snapshot.docs[0].data();
  const currentVersion = latestVersion.versionNumber || 1.0;
  
  // Increment by 0.1 for minor versions, or 1.0 for major versions
  // For now, always increment by 1.0
  return Math.floor(currentVersion) + 1.0;
}

/**
 * Format version number as string (e.g., 1.0 -> "v1.0")
 */
function formatVersion(versionNumber: number): string {
  return `v${versionNumber.toFixed(1)}`;
}

/**
 * Save BRD version to GCS bucket and Firestore
 */
export async function saveBRDVersion(
  projectId: string,
  sections: BRDVersion["sections"],
  changeLog?: string,
  status: "draft" | "approved" = "draft"
): Promise<BRDVersion> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  try {
    // Get next version number
    const versionNumber = await getNextVersionNumber(projectId);
    const version = formatVersion(versionNumber);
    
    console.log(`Creating BRD ${version} for project ${projectId}`);
    
    // Create BRD document content
    const brdContent = {
      version,
      versionNumber,
      projectId,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      status,
      sections,
      changeLog: changeLog || `Created ${version}`
    };
    
    // Convert to JSON string for storage
    const brdJson = JSON.stringify(brdContent, null, 2);
    
    // Upload to GCS bucket: brd-version/{projectId}/{version}.json
    const storagePath = `brd-version/${projectId}/${version}.json`;
    const storageRef = ref(storage, storagePath);
    
    console.log("Uploading BRD to storage:", storagePath);
    
    await uploadString(storageRef, brdJson, "raw", {
      contentType: "application/json",
      customMetadata: {
        projectId,
        version,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      }
    });
    
    console.log("BRD uploaded successfully");
    
    // Get download URL
    let downloadURL = "";
    try {
      downloadURL = await getDownloadURL(storageRef);
    } catch (error) {
      console.warn("Could not get download URL:", error);
      downloadURL = `gs://documind-6c687.firebasestorage.app/${storagePath}`;
    }
    
    // Save metadata to Firestore
    const brdVersionData: Omit<BRDVersion, "id"> = {
      projectId,
      version,
      versionNumber,
      sections,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      status,
      changeLog: changeLog || `Created ${version}`,
      storagePath,
      downloadURL
    };
    
    const docRef = await addDoc(collection(db, "brdVersions"), brdVersionData);
    
    console.log("BRD metadata saved to Firestore:", docRef.id);
    
    return {
      id: docRef.id,
      ...brdVersionData,
      createdAt: new Date()
    };
    
  } catch (error: any) {
    console.error("Error saving BRD version:", error);
    throw new Error(`Failed to save BRD version: ${error.message}`);
  }
}

/**
 * Get all BRD versions for a project
 */
export async function getBRDVersions(projectId: string): Promise<BRDVersion[]> {
  const versionsRef = collection(db, "brdVersions");
  const q = query(
    versionsRef,
    where("projectId", "==", projectId),
    orderBy("versionNumber", "desc")
  );
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as BRDVersion));
}

/**
 * Get latest BRD version for a project
 */
export async function getLatestBRDVersion(projectId: string): Promise<BRDVersion | null> {
  const versions = await getBRDVersions(projectId);
  return versions.length > 0 ? versions[0] : null;
}
