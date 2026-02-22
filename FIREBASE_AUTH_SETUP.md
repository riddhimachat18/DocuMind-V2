# Firebase Authentication Setup Guide

This guide explains how to set up Firebase Authentication with Google Sign-In and Email/Password authentication in your DocuMind project.

## Prerequisites

- Firebase project created at [Firebase Console](https://console.firebase.google.com/)
- Firebase Authentication enabled
- Firestore Database created

## Setup Steps

### 1. Create Environment File

Create a `.env` file in the root directory (it's already in `.gitignore`):

```bash
# Copy the example file
cp .env.example .env
```

### 2. Configure Firebase Environment Variables

Edit `.env` and add your Firebase configuration values:

```env
VITE_FIREBASE_API_KEY=your_actual_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=documind-6c687.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=documind-6c687
VITE_FIREBASE_STORAGE_BUCKET=your_actual_storage_bucket_here
VITE_FIREBASE_MESSAGING_SENDER_ID=1051747171351
VITE_FIREBASE_APP_ID=1:1051747171351:web:19f630958b182b878cb052
```

**Where to find these values:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (documind-6c687)
3. Click the gear icon → Project settings
4. Scroll down to "Your apps" section
5. Copy the values from the Firebase SDK snippet

### 3. Enable Authentication Methods in Firebase

#### Enable Email/Password Authentication:
1. Go to Firebase Console → Authentication → Sign-in method
2. Click "Email/Password"
3. Enable the first toggle (Email/Password)
4. Click "Save"

#### Enable Google Sign-In:
1. In the same "Sign-in method" tab
2. Click "Google"
3. Enable the toggle
4. Select a support email
5. Click "Save"

### 4. Deploy Firestore Security Rules

The security rules are already configured in `firestore.rules`. Deploy them:

```bash
firebase deploy --only firestore:rules
```

**Security Rules Summary:**
- Users can only read/write their own document in `users/{userId}`
- Users can only access projects and snippets they own
- All operations require authentication

### 5. Test the Implementation

Start your development server:

```bash
npm run dev
```

Test the following flows:

#### Email/Password Sign-Up:
1. Navigate to `/signup`
2. Fill in name, organization, email, and password (min 8 characters)
3. Click "Create account"
4. Check Firestore Console → users collection for new document

#### Email/Password Login:
1. Navigate to `/login`
2. Enter email and password
3. Click "Sign in"
4. Verify `lastLogin` timestamp updated in Firestore

#### Google Sign-In:
1. Click "Continue with Google" on login or signup page
2. Select Google account
3. Verify user document created/updated in Firestore

## File Structure

```
src/
├── lib/
│   └── firebase.ts              # Firebase initialization
├── services/
│   └── authService.ts           # Authentication logic
└── pages/
    ├── Login.tsx                # Login page with Firebase integration
    └── Signup.tsx               # Signup page with Firebase integration
```

## Key Features

### Authentication Service (`authService.ts`)

- **signUpWithEmail**: Creates new user with email/password
- **signInWithEmail**: Signs in existing user
- **signInWithGoogle**: Google OAuth sign-in
- **logOut**: Signs out current user
- **getUserData**: Fetches user data from Firestore

### Firestore User Document Structure

```typescript
{
  uid: string;              // Firebase Auth UID
  name: string;             // User's display name
  email: string;            // User's email
  createdAt: Timestamp;     // Account creation time (set once)
  lastLogin: Timestamp;     // Last login time (updated on each login)
}
```

### Automatic User Document Management

- **New User**: Creates document with all fields including `createdAt`
- **Existing User**: Updates only `lastLogin` timestamp
- **Location**: `users/{uid}` in Firestore

## Security Best Practices

✅ API keys stored in `.env` (not committed to git)
✅ `.env` added to `.gitignore`
✅ Firestore rules restrict access to user's own data
✅ All authentication operations use async/await
✅ Error handling with user-friendly toast notifications
✅ Loading states prevent duplicate submissions

## Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
- Check that your `.env` file exists and has correct values
- Restart the dev server after creating/modifying `.env`

### "Missing or insufficient permissions"
- Deploy Firestore security rules: `firebase deploy --only firestore:rules`
- Verify user is authenticated before accessing Firestore

### Google Sign-In popup blocked
- Check browser popup blocker settings
- Ensure `authDomain` is correctly configured in Firebase Console

### "Firebase: Error (auth/weak-password)"
- Password must be at least 6 characters (we enforce 8 in UI)

## Next Steps

- Add password reset functionality
- Implement email verification
- Add user profile editing
- Set up Firebase Admin SDK for backend operations
- Add social auth providers (GitHub, Microsoft, etc.)

## Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Console](https://console.firebase.google.com/)
