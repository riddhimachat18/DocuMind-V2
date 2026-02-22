# Fix Google OAuth "Error 400: invalid_request"

## Problem
Getting "Access blocked: Authorization Error" when trying to sign in with Google.

## Root Cause
The OAuth redirect URIs are not properly configured in Google Cloud Console.

## Solution

### Step 1: Firebase Console
1. Go to: https://console.firebase.google.com/project/documind-6c687/authentication/providers
2. Click on "Google" provider
3. Make sure it's enabled
4. Check "Authorized domains" includes:
   - `localhost`
   - `documind-6c687.firebaseapp.com`

### Step 2: Google Cloud Console (CRITICAL)
1. Go to: https://console.cloud.google.com/apis/credentials?project=documind-6c687
2. Find your OAuth 2.0 Client ID (should be named "Web client (auto created by Google Service)")
3. Click on it to edit
4. Under "Authorized JavaScript origins", add:
   ```
   http://localhost
   http://localhost:8081
   https://documind-6c687.firebaseapp.com
   ```

5. Under "Authorized redirect URIs", add:
   ```
   https://documind-6c687.firebaseapp.com/__/auth/handler
   http://localhost
   http://localhost:8081
   ```

6. Click "SAVE"

### Step 3: Wait & Test
- Changes can take 5-10 minutes to propagate
- Clear your browser cache
- Try Google sign-in again

## Alternative: Use Popup Instead of Redirect

If you want to avoid redirect issues entirely, we can switch to popup-based OAuth:

In `src/services/authService.ts`, change:
```typescript
// FROM:
export const signInWithGoogle = async (): Promise<void> => {
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
};

// TO:
import { signInWithPopup } from "firebase/auth";

export const signInWithGoogle = async (): Promise<UserCredential> => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await createOrUpdateUserDocument(result.user);
  return result;
};
```

Popup method is simpler and doesn't require redirect URI configuration, but some users have popups blocked.

## Current Status
Your app is running on: `http://localhost:8081`
Your Firebase auth domain: `documind-6c687.firebaseapp.com`

Make sure BOTH are configured in Google Cloud Console OAuth settings.
