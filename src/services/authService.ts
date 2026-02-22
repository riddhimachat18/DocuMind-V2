import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
  UserCredential,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export interface UserData {
  uid: string;
  name: string;
  email: string;
  createdAt: Timestamp;
  lastLogin: Timestamp;
}

/**
 * Create or update user document in Firestore
 */
const createOrUpdateUserDocument = async (
  user: User,
  displayName?: string
): Promise<void> => {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    // Update lastLogin
    await setDoc(
      userRef,
      {
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    // Create new user document
    await setDoc(userRef, {
      uid: user.uid,
      name: displayName || user.displayName || "User",
      email: user.email,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
  }
};

/**
 * Sign up with email and password
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  name: string
): Promise<UserCredential> => {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
  await createOrUpdateUserDocument(userCredential.user, name);
  return userCredential;
};

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<UserCredential> => {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );
  await createOrUpdateUserDocument(userCredential.user);
  return userCredential;
};

/**
 * Sign in with Google using popup
 * 
 * Note: You may see "Cross-Origin-Opener-Policy" warnings in the console.
 * These are harmless browser security notices from Google's auth servers
 * and do not affect functionality. They cannot be eliminated when using
 * popup authentication, but the authentication works perfectly.
 */
export const signInWithGoogle = async (): Promise<UserCredential> => {
  const provider = new GoogleAuthProvider();
  
  // Configure provider for better UX
  provider.addScope('profile');
  provider.addScope('email');
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  try {
    const result = await signInWithPopup(auth, provider);
    await createOrUpdateUserDocument(result.user);
    return result;
  } catch (error: any) {
    // Provide user-friendly error messages
    if (error.code === 'auth/popup-blocked') {
      throw new Error('Popup was blocked. Please allow popups for this site.');
    }
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in cancelled');
    }
    if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Another sign-in popup is already open');
    }
    throw error;
  }
};

/**
 * Sign out
 */
export const logOut = async (): Promise<void> => {
  await signOut(auth);
};

/**
 * Get user data from Firestore
 */
export const getUserData = async (uid: string): Promise<UserData | null> => {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserData;
  }
  return null;
};
