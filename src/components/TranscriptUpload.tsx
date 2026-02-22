import { useState } from "react";
import { uploadTranscript } from "../services/storageService";
import { toast } from "sonner";
import { Button } from "./ui/button";

interface TranscriptUploadProps {
  projectId: string;
  onUploadComplete?: (url: string, path: string, snippets?: any[]) => void;
}

export const TranscriptUpload = ({ projectId, onUploadComplete }: TranscriptUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    setProgress("Uploading transcript...");
    
    try {
      // This will trigger the full pipeline:
      // 1. Upload to GCS
      // 2. Classify snippets
      // 3. Generate BRD
      // 4. Detect conflicts
      
      setProgress("Processing transcript...");
      const result = await uploadTranscript(file, projectId);
      
      setProgress("Generating BRD...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProgress("Detecting conflicts...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success("Transcript processed successfully! BRD updated.");
      
      if (onUploadComplete) {
        onUploadComplete(result.url, result.path, result.snippets);
      }
      
      setFile(null);
      setProgress("");
      
      // Reset file input
      const fileInput = document.getElementById("transcript-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to process transcript");
      setProgress("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          id="transcript-upload"
          type="file"
          onChange={handleFileChange}
          accept=".txt,.pdf,.doc,.docx,.mp3,.mp4,.wav"
          className="flex-1 text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
          disabled={uploading}
        />
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="whitespace-nowrap"
        >
          {uploading ? "Processing..." : "Upload"}
        </Button>
      </div>
      {file && !uploading && (
        <p className="text-xs text-muted-foreground">
          Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
        </p>
      )}
      {uploading && progress && (
        <p className="text-xs text-primary animate-pulse">
          {progress}
        </p>
      )}
    </div>
  );
};
