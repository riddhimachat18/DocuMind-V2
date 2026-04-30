import { getFunctions, httpsCallable, HttpsCallableOptions } from "firebase/functions";
import app from "./firebase";

const functions = getFunctions(app);

// Default options for most functions
const defaultOptions: HttpsCallableOptions = {
  timeout: 120000, // 2 minutes
};

// Extended timeout for file processing (9 minutes to match backend)
const fileProcessingOptions: HttpsCallableOptions = {
  timeout: 540000, // 9 minutes (matches backend timeout)
};

export const classifySnippetFn = httpsCallable(functions, "classifySnippet", defaultOptions);
export const generateBrdFn = httpsCallable(functions, "generateBrd", { timeout: 300000 }); // 5 minutes
export const detectConflictsFn = httpsCallable(functions, "detectConflicts", { timeout: 300000 }); // 5 minutes
export const onChatMessageFn = httpsCallable(functions, "onChatMessage", defaultOptions);
export const onFileUploadedFn = httpsCallable(functions, "onFileUploaded", fileProcessingOptions);
