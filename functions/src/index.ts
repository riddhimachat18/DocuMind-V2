// Export all callable functions with CORS enabled
export { generateBrd } from "./generateBrd";
export { detectConflicts } from "./detectConflicts";
export { onChatMessage } from "./onChatMessage";
export { classifySnippet } from "./classifySnippet";
export { onFileUploaded } from "./onFileUploaded";

// Export Firestore triggers
export { onConflictResolved } from "./scoreQuality";
