import { useState } from "react";
import { toast } from "sonner";
import { db, auth } from "../lib/firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import {
  extractPdfText,
  extractTxtText,
  uploadToStorage,
  Snippet
} from "../services/transcriptService";
import { onFileUploadedFn } from "../lib/functions";

interface TranscriptUploadModalProps {
  projectId: string;
  onUploadComplete: (snippets: Snippet[]) => void;
  onClose: () => void;
}

export const TranscriptUploadModal = ({ projectId, onUploadComplete, onClose }: TranscriptUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Validate file size (10MB max)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    // Guard: Ensure file.name and projectId are valid
    if (!file.name || !projectId) {
      toast.error("Invalid file or project");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Create file metadata in Firestore (status: processing)
      const fileExt = file.name.split(".").pop()?.toLowerCase() || '';
      
      await addDoc(collection(db, 'uploadedFiles'), {
        projectId: projectId,
        filename: file.name,
        type: fileExt,
        uploadedAt: Timestamp.now(),
        snippetCount: 0,
        snippetBreakdown: {},
        status: 'processing',
        size: file.size,
      });

      // Step 2: Upload to Firebase Storage
      setStatus("Uploading to storage...");
      setProgress(20);
      await uploadToStorage(file, projectId);
      
      // Step 3: Extract text
      setStatus("Extracting text...");
      setProgress(40);
      
      let text = "";
      
      if (fileExt === "pdf") {
        text = await extractPdfText(file);
      } else if (fileExt === "txt") {
        text = await extractTxtText(file);
      } else {
        throw new Error("Unsupported file type. Please upload PDF or TXT files.");
      }
      
      if (!text || text.trim().length === 0) {
        throw new Error("No text could be extracted from the file");
      }
      
      // Step 4: Call Firebase callable function to process file
      setStatus("Processing and classifying snippets...");
      setProgress(60);
      
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      try {
        const result = await onFileUploadedFn({
          projectId,
          filename: file.name,
          fileContent: text
        });
        
        const data = result.data as any;
        
        setStatus("Complete!");
        setProgress(100);
        
        toast.success(`Successfully processed ${data.snippetCount} snippets from ${file.name}`);
        
        // Return empty array since snippets are now in Firestore
        onUploadComplete([]);
        
        // Close modal after a short delay
        setTimeout(() => {
          onClose();
        }, 1000);
      } catch (functionError: any) {
        // Handle CORS or Cloud Function errors gracefully
        console.error("Cloud Function error:", functionError);
        
        if (functionError.code === 'deadline-exceeded') {
          // Timeout error - function is still processing
          toast.error(
            "Processing is taking longer than expected. " +
            "The file is being processed in the background. " +
            "Please check back in a few minutes.",
            { duration: 8000 }
          );
          
          setStatus("Processing in background...");
          setProgress(100);
          
          // Close after delay
          setTimeout(() => {
            onClose();
          }, 3000);
        } else if (functionError.code === 'internal' || 
            functionError.message?.includes('CORS') ||
            functionError.message?.includes('Failed to fetch')) {
          
          // CORS error - provide helpful message
          toast.error(
            "Cloud Function is not accessible. " +
            "File uploaded to storage successfully.",
            { duration: 6000 }
          );
          
          // Still mark as complete since file was uploaded
          setStatus("File uploaded (processing pending)");
          setProgress(100);
          
          // Close after delay
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          // Other errors
          throw functionError;
        }
      }
      
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to process file");
      setStatus("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Upload Transcript</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          {/* File Input */}
          <div>
            <label className="block text-sm text-muted-foreground mb-2">
              Select File (PDF or TXT, max 10MB)
            </label>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileChange}
              disabled={uploading}
              className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
            />
            {file && (
              <p className="text-xs text-muted-foreground mt-2">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>
          
          {/* Progress */}
          {uploading && (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">{status}</span>
                <span className="text-primary font-mono">{progress}%</span>
              </div>
              <div className="w-full bg-border rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={uploading}
              className="flex-1 px-4 py-2 border border-border text-sm hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Processing..." : "Upload & Process"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
