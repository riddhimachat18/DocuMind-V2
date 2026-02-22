import { db, storage } from "../lib/firebase";
import { 
  doc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch 
} from "firebase/firestore";
import { ref, listAll, deleteObject } from "firebase/storage";
import { toast } from "sonner";

/**
 * Delete a project and all its associated data
 * This includes:
 * - Project document
 * - BRD versions
 * - BRD exports
 * - Uploaded files (Firestore + Storage)
 * - Snippets
 * - Chat messages
 * - Conflict flags
 */
export async function deleteProject(projectId: string): Promise<void> {
  try {
    console.log(`Starting deletion of project: ${projectId}`);
    
    // Step 1: Delete all BRD versions
    try {
      await deleteBRDVersions(projectId);
    } catch (error: any) {
      console.error("Failed to delete BRD versions:", error);
      throw new Error(`Failed to delete BRD versions: ${error.message}`);
    }
    
    // Step 2: Delete all BRD exports
    try {
      await deleteBRDExports(projectId);
    } catch (error: any) {
      console.error("Failed to delete BRD exports:", error);
      throw new Error(`Failed to delete BRD exports: ${error.message}`);
    }
    
    // Step 3: Delete all uploaded files (Firestore metadata)
    try {
      await deleteUploadedFiles(projectId);
    } catch (error: any) {
      console.error("Failed to delete uploaded files:", error);
      throw new Error(`Failed to delete uploaded files: ${error.message}`);
    }
    
    // Step 4: Delete all snippets
    try {
      await deleteSnippets(projectId);
    } catch (error: any) {
      console.error("Failed to delete snippets:", error);
      throw new Error(`Failed to delete snippets: ${error.message}`);
    }
    
    // Step 5: Delete all chat messages
    try {
      await deleteChatMessages(projectId);
    } catch (error: any) {
      console.error("Failed to delete chat messages:", error);
      throw new Error(`Failed to delete chat messages: ${error.message}`);
    }
    
    // Step 6: Delete all conflict flags
    try {
      await deleteConflictFlags(projectId);
    } catch (error: any) {
      console.error("Failed to delete conflict flags:", error);
      throw new Error(`Failed to delete conflict flags: ${error.message}`);
    }
    
    // Step 7: Delete storage files (non-critical, don't fail if this errors)
    try {
      await deleteStorageFiles(projectId);
    } catch (error: any) {
      console.warn("Storage deletion failed, continuing with project deletion:", error.message);
    }
    
    // Step 8: Finally, delete the project document itself
    try {
      await deleteDoc(doc(db, "projects", projectId));
    } catch (error: any) {
      console.error("Failed to delete project document:", error);
      throw new Error(`Failed to delete project document: ${error.message}`);
    }
    
    console.log(`Successfully deleted project: ${projectId}`);
    toast.success("Project deleted successfully");
    
  } catch (error: any) {
    console.error("Error deleting project:", error);
    toast.error(`Failed to delete project: ${error.message}`);
    throw error;
  }
}

/**
 * Delete all BRD versions for a project
 */
async function deleteBRDVersions(projectId: string): Promise<void> {
  console.log("Deleting BRD versions...");
  
  const versionsQuery = query(
    collection(db, "brdVersions"),
    where("projectId", "==", projectId)
  );
  
  const snapshot = await getDocs(versionsQuery);
  
  if (snapshot.empty) {
    console.log("No BRD versions to delete");
    return;
  }
  
  // Use smaller batches (100 per batch)
  const BATCH_SIZE = 100;
  const batches: any[] = [];
  let currentBatch = writeBatch(db);
  let operationCount = 0;
  
  snapshot.docs.forEach((docSnapshot) => {
    currentBatch.delete(docSnapshot.ref);
    operationCount++;
    
    if (operationCount === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      operationCount = 0;
    }
  });
  
  if (operationCount > 0) {
    batches.push(currentBatch);
  }
  
  // Execute batches sequentially
  for (const batch of batches) {
    await batch.commit();
  }
  
  console.log(`Deleted ${snapshot.size} BRD versions`);
}

/**
 * Delete all BRD exports for a project
 */
async function deleteBRDExports(projectId: string): Promise<void> {
  console.log("Deleting BRD exports...");
  
  const exportsQuery = query(
    collection(db, "brdExports"),
    where("projectId", "==", projectId)
  );
  
  const snapshot = await getDocs(exportsQuery);
  
  if (snapshot.empty) {
    console.log("No BRD exports to delete");
    return;
  }
  
  const BATCH_SIZE = 100;
  const batches: any[] = [];
  let currentBatch = writeBatch(db);
  let operationCount = 0;
  
  snapshot.docs.forEach((docSnapshot) => {
    currentBatch.delete(docSnapshot.ref);
    operationCount++;
    
    if (operationCount === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      operationCount = 0;
    }
  });
  
  if (operationCount > 0) {
    batches.push(currentBatch);
  }
  
  for (const batch of batches) {
    await batch.commit();
  }
  
  console.log(`Deleted ${snapshot.size} BRD exports`);
}

/**
 * Delete all uploaded files for a project
 */
async function deleteUploadedFiles(projectId: string): Promise<void> {
  console.log("Deleting uploaded files...");
  
  const filesQuery = query(
    collection(db, "uploadedFiles"),
    where("projectId", "==", projectId)
  );
  
  const snapshot = await getDocs(filesQuery);
  
  if (snapshot.empty) {
    console.log("No uploaded files to delete");
    return;
  }
  
  const BATCH_SIZE = 100;
  const batches: any[] = [];
  let currentBatch = writeBatch(db);
  let operationCount = 0;
  
  snapshot.docs.forEach((docSnapshot) => {
    currentBatch.delete(docSnapshot.ref);
    operationCount++;
    
    if (operationCount === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      operationCount = 0;
    }
  });
  
  if (operationCount > 0) {
    batches.push(currentBatch);
  }
  
  for (const batch of batches) {
    await batch.commit();
  }
  
  console.log(`Deleted ${snapshot.size} uploaded files`);
}

/**
 * Delete all snippets for a project
 */
async function deleteSnippets(projectId: string): Promise<void> {
  console.log("Deleting snippets...");
  
  const snippetsQuery = query(
    collection(db, "snippets"),
    where("projectId", "==", projectId)
  );
  
  const snapshot = await getDocs(snippetsQuery);
  
  if (snapshot.empty) {
    console.log("No snippets to delete");
    return;
  }
  
  console.log(`Found ${snapshot.size} snippets to delete`);
  
  // Delete snippets in parallel batches of 20 for speed
  const PARALLEL_BATCH_SIZE = 20;
  const docs = snapshot.docs;
  let deletedCount = 0;
  
  for (let i = 0; i < docs.length; i += PARALLEL_BATCH_SIZE) {
    const batch = docs.slice(i, i + PARALLEL_BATCH_SIZE);
    
    // Delete this batch in parallel
    await Promise.all(
      batch.map(async (docSnapshot) => {
        try {
          await deleteDoc(docSnapshot.ref);
          deletedCount++;
        } catch (error: any) {
          console.warn(`Failed to delete snippet ${docSnapshot.id}:`, error.message);
        }
      })
    );
    
    console.log(`Deleted ${Math.min(deletedCount, docs.length)}/${docs.length} snippets`);
  }
  
  console.log(`Successfully deleted ${deletedCount}/${docs.length} snippets`);
}

/**
 * Delete all chat messages for a project's BRD versions
 */
async function deleteChatMessages(projectId: string): Promise<void> {
  console.log("Deleting chat messages...");
  
  // First get all BRD version IDs for this project
  const versionsQuery = query(
    collection(db, "brdVersions"),
    where("projectId", "==", projectId)
  );
  
  const versionsSnapshot = await getDocs(versionsQuery);
  const brdVersionIds = versionsSnapshot.docs.map(doc => doc.id);
  
  if (brdVersionIds.length === 0) {
    console.log("No BRD versions, skipping chat messages");
    return;
  }
  
  // Firestore 'in' queries support max 10 items, so we batch them
  const batchSize = 10;
  let totalDeleted = 0;
  
  for (let i = 0; i < brdVersionIds.length; i += batchSize) {
    const batch = brdVersionIds.slice(i, i + batchSize);
    
    const messagesQuery = query(
      collection(db, "chatMessages"),
      where("brdVersionId", "in", batch)
    );
    
    const snapshot = await getDocs(messagesQuery);
    
    if (!snapshot.empty) {
      const BATCH_SIZE = 100;
      const deleteBatches: any[] = [];
      let currentBatch = writeBatch(db);
      let operationCount = 0;
      
      snapshot.docs.forEach((docSnapshot) => {
        currentBatch.delete(docSnapshot.ref);
        operationCount++;
        
        if (operationCount === BATCH_SIZE) {
          deleteBatches.push(currentBatch);
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      });
      
      if (operationCount > 0) {
        deleteBatches.push(currentBatch);
      }
      
      for (const b of deleteBatches) {
        await b.commit();
      }
      
      totalDeleted += snapshot.size;
    }
  }
  
  console.log(`Deleted ${totalDeleted} chat messages`);
}

/**
 * Delete all conflict flags for a project
 */
async function deleteConflictFlags(projectId: string): Promise<void> {
  console.log("Deleting conflict flags...");
  
  const conflictsQuery = query(
    collection(db, "conflictFlags"),
    where("projectId", "==", projectId)
  );
  
  const snapshot = await getDocs(conflictsQuery);
  
  if (snapshot.empty) {
    console.log("No conflict flags to delete");
    return;
  }
  
  const BATCH_SIZE = 100;
  const batches: any[] = [];
  let currentBatch = writeBatch(db);
  let operationCount = 0;
  
  snapshot.docs.forEach((docSnapshot) => {
    currentBatch.delete(docSnapshot.ref);
    operationCount++;
    
    if (operationCount === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      operationCount = 0;
    }
  });
  
  if (operationCount > 0) {
    batches.push(currentBatch);
  }
  
  for (const batch of batches) {
    await batch.commit();
  }
  
  console.log(`Deleted ${snapshot.size} conflict flags`);
}

/**
 * Delete all storage files for a project
 * This includes uploaded transcripts, BRD PDFs, etc.
 */
async function deleteStorageFiles(projectId: string): Promise<void> {
  console.log("Deleting storage files...");
  
  try {
    // Delete files in the project's storage folders
    const folders = [
      `transcripts/${projectId}`,
      `brd-version/${projectId}`,
      `uploads/${projectId}`
    ];
    
    for (const folder of folders) {
      try {
        const folderRef = ref(storage, folder);
        const fileList = await listAll(folderRef);
        
        if (fileList.items.length > 0) {
          // Delete files one by one to handle permission errors gracefully
          let deletedCount = 0;
          for (const itemRef of fileList.items) {
            try {
              await deleteObject(itemRef);
              deletedCount++;
            } catch (error: any) {
              console.warn(`Failed to delete ${itemRef.fullPath}:`, error.message);
              // Continue with other files even if one fails
            }
          }
          console.log(`Deleted ${deletedCount}/${fileList.items.length} files from ${folder}`);
        } else {
          console.log(`No files found in ${folder}`);
        }
      } catch (error: any) {
        // Folder might not exist or permission denied
        if (error.code === 'storage/object-not-found') {
          console.log(`Folder ${folder} does not exist`);
        } else if (error.code === 'storage/unauthorized') {
          console.warn(`Permission denied for folder ${folder} - skipping`);
        } else {
          console.warn(`Error accessing folder ${folder}:`, error.message);
        }
      }
    }
    
    console.log("Storage file deletion completed (some files may have been skipped due to permissions)");
  } catch (error: any) {
    console.warn("Error deleting storage files:", error.message);
    // Don't throw - storage deletion is not critical
  }
}

/**
 * Get project deletion summary (for confirmation dialog)
 */
export async function getProjectDeletionSummary(projectId: string): Promise<{
  brdVersions: number;
  uploadedFiles: number;
  snippets: number;
  chatMessages: number;
  conflicts: number;
}> {
  try {
    const [
      brdVersionsSnap,
      uploadedFilesSnap,
      snippetsSnap,
      conflictsSnap
    ] = await Promise.all([
      getDocs(query(collection(db, "brdVersions"), where("projectId", "==", projectId))),
      getDocs(query(collection(db, "uploadedFiles"), where("projectId", "==", projectId))),
      getDocs(query(collection(db, "snippets"), where("projectId", "==", projectId))),
      getDocs(query(collection(db, "conflictFlags"), where("projectId", "==", projectId)))
    ]);
    
    // Get BRD version IDs to count chat messages
    const brdVersionIds = brdVersionsSnap.docs.map(doc => doc.id);
    let chatMessageCount = 0;
    
    if (brdVersionIds.length > 0) {
      // Count chat messages in batches of 10
      const batchSize = 10;
      for (let i = 0; i < brdVersionIds.length; i += batchSize) {
        const batch = brdVersionIds.slice(i, i + batchSize);
        const messagesSnap = await getDocs(
          query(collection(db, "chatMessages"), where("brdVersionId", "in", batch))
        );
        chatMessageCount += messagesSnap.size;
      }
    }
    
    return {
      brdVersions: brdVersionsSnap.size,
      uploadedFiles: uploadedFilesSnap.size,
      snippets: snippetsSnap.size,
      chatMessages: chatMessageCount,
      conflicts: conflictsSnap.size
    };
  } catch (error: any) {
    console.error("Error getting deletion summary:", error);
    throw error;
  }
}
