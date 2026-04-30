import { initializeApp } from "firebase/app";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const app = initializeApp({ projectId: "documind-6c687" });
const functions = getFunctions(app);

// Connect to local emulator
connectFunctionsEmulator(functions, "localhost", 5001);

const classifySnippet = httpsCallable(functions, "classifySnippet");

const result = await classifySnippet({
  text: "The system must support SSO login",
  source: "gmail"
});

console.log(result.data);