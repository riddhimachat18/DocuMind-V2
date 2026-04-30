import { auth, storage } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// PDF.js types
declare const pdfjsLib: any;

export interface Snippet {
  id: string;
  source: string;
  fileName: string;
  chunkIndex: number;
  rawText: string;
  timestamp: number;
  category: string;
  insight: string;
  confidence: number;
}

/**
 * Extract text from PDF using pdf.js
 * Optimized for speed with parallel page processing
 */
export async function extractPdfText(file: File): Promise<string> {
  console.log("Starting PDF text extraction for:", file.name);
  
  // Load pdf.js dynamically
  if (typeof pdfjsLib === 'undefined') {
    await loadPdfJs();
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log("PDF loaded:", pdf.numPages, "pages");
  
  // Process pages in parallel batches of 5 for speed
  const BATCH_SIZE = 5;
  const pageTexts: string[] = new Array(pdf.numPages);
  
  for (let i = 0; i < pdf.numPages; i += BATCH_SIZE) {
    const batchPromises = [];
    
    for (let j = i; j < Math.min(i + BATCH_SIZE, pdf.numPages); j++) {
      batchPromises.push(
        (async () => {
          const page = await pdf.getPage(j + 1);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          pageTexts[j] = pageText;
        })()
      );
    }
    
    await Promise.all(batchPromises);
    
    // Log progress every batch
    const processed = Math.min(i + BATCH_SIZE, pdf.numPages);
    console.log(`Extracted ${processed}/${pdf.numPages} pages`);
  }
  
  const fullText = pageTexts.join('\n');
  console.log("Extraction complete:", fullText.length, "chars");
  
  return fullText;
}

/**
 * Extract text from TXT file
 */
export async function extractTxtText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Chunk text into segments
 */
export function chunkText(text: string, wordsPerChunk = 300): string[] {
  console.log("Chunking text, total length:", text.length);
  
  const words = text.split(/\s+/).filter(w => w.length > 0);
  console.log("Total words:", words.length);
  
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }
  
  console.log("Created chunks:", chunks.length);
  
  return chunks;
}

/**
 * Classify snippet using Gemini API
 */
export async function classifySnippet(text: string): Promise<any> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file");
  }
  
  const prompt = `You are a business analyst AI. Classify the following text chunk from a document into exactly one category: functional_requirement, non_functional_requirement, stakeholder, assumption, constraint, success_metric, or noise. Also extract the key insight in one sentence. Respond only in JSON: { "category": "...", "insight": "...", "confidence": 0.0-1.0 }

Text to classify:
${text}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2000
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error response:", errorText);
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  const content = data.candidates[0].content.parts[0].text;
  
  // Extract JSON from markdown code blocks if present
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
  return JSON.parse(jsonStr);
}

/**
 * Upload file to Firebase Storage default bucket
 */
export async function uploadToStorage(file: File, projectId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  console.log("Upload starting:", { userId: user.uid, projectId, fileName: file.name });

  try {
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    
    // Upload to Firebase Storage default bucket
    // Path: transcript_uploads/{userId}/{projectId}/{filename}
    const storagePath = `transcript_uploads/${user.uid}/${projectId}/${fileName}`;
    console.log("Storage path:", storagePath);
    
    const storageRef = ref(storage, storagePath);
    
    console.log("Starting upload to Firebase Storage...");
    
    // Upload file
    const uploadResult = await uploadBytes(storageRef, file, {
      contentType: file.type || 'application/pdf',
      customMetadata: {
        userId: user.uid,
        projectId,
        originalName: file.name,
        uploadedAt: new Date().toISOString()
      }
    });
    
    console.log("Upload successful!");
    
    // Try to get download URL, but don't fail if it doesn't work
    let downloadURL = storagePath;
    try {
      downloadURL = await getDownloadURL(uploadResult.ref);
      console.log("Download URL obtained:", downloadURL);
    } catch (urlError) {
      console.warn("Could not get download URL, using storage path instead:", urlError);
      // Use the storage path as fallback
      downloadURL = `gs://${uploadResult.ref.bucket}/${uploadResult.ref.fullPath}`;
    }
    
    // Store metadata in Firestore
    const fileId = `${user.uid}_${projectId}_${timestamp}`;
    await setDoc(doc(db, "uploadedFiles", fileId), {
      userId: user.uid,
      projectId,
      fileName: file.name,
      storagePath,
      downloadURL,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      status: "uploaded"
    });
    
    console.log("Metadata saved to Firestore");
    
    return storagePath; // Return storage path instead of download URL
    
  } catch (error: any) {
    console.error("Storage upload error:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    
    // Provide more specific error messages
    if (error.code === 'storage/unauthorized') {
      throw new Error("You don't have permission to upload files. Please check Firebase Storage rules.");
    } else if (error.code === 'storage/canceled') {
      throw new Error("Upload was canceled");
    } else if (error.code === 'storage/unknown') {
      throw new Error("An unknown error occurred during upload. Please try again.");
    }
    
    throw new Error(`Upload failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Load pdf.js library dynamically
 */
function loadPdfJs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof pdfjsLib !== 'undefined') {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
