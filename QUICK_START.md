# Quick Start - Firebase Authentication

## 🚀 Get Started in 3 Steps

### Step 1: Set Up Environment Variables

```bash
# Create .env file from example
cp .env.example .env
```

Edit `.env` and add your Firebase credentials:
```env
VITE_FIREBASE_API_KEY=AIza...your_key_here
VITE_FIREBASE_AUTH_DOMAIN=documind-6c687.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=documind-6c687
VITE_FIREBASE_STORAGE_BUCKET=documind-6c687.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1051747171351
VITE_FIREBASE_APP_ID=1:1051747171351:web:19f630958b182b878cb052
```

### Step 2: Enable Authentication in Firebase Console

1. Go to https://console.firebase.google.com/
2. Select your project
3. Navigate to Authentication → Sign-in method
4. Enable "Email/Password" and "Google"

### Step 3: Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

## ✅ You're Done!

Run your app:
```bash
npm run dev
```

## 📝 Usage Examples

### Sign Up with Email/Password

```typescript
import { signUpWithEmail } from "@/services/authService";

const handleSignup = async () => {
  try {
    const userCredential = await signUpWithEmail(
      "user@example.com",
      "password123",
      "John Doe"
    );
    console.log("User created:", userCredential.user);
  } catch (error) {
    console.error("Signup failed:", error);
  }
};
```

### Sign In with Email/Password

```typescript
import { signInWithEmail } from "@/services/authService";

const handleLogin = async () => {
  try {
    const userCredential = await signInWithEmail(
      "user@example.com",
      "password123"
    );
    console.log("User logged in:", userCredential.user);
  } catch (error) {
    console.error("Login failed:", error);
  }
};
```

### Sign In with Google

```typescript
import { signInWithGoogle } from "@/services/authService";

const handleGoogleSignIn = async () => {
  try {
    const userCredential = await signInWithGoogle();
    console.log("User logged in:", userCredential.user);
  } catch (error) {
    console.error("Google sign-in failed:", error);
  }
};
```

### Sign Out

```typescript
import { logOut } from "@/services/authService";

const handleLogout = async () => {
  try {
    await logOut();
    console.log("User logged out");
  } catch (error) {
    console.error("Logout failed:", error);
  }
};
```

### Get User Data from Firestore

```typescript
import { getUserData } from "@/services/authService";

const fetchUserData = async (uid: string) => {
  const userData = await getUserData(uid);
  console.log("User data:", userData);
  // { uid, name, email, createdAt, lastLogin }
};
```

### Listen to Auth State Changes

```typescript
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";

const MyComponent = () => {
  const { user, userData, loading } = useFirebaseAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not logged in</div>;

  return (
    <div>
      <p>Welcome, {userData?.name}!</p>
      <p>Email: {user.email}</p>
    </div>
  );
};
```

## 🔒 Security

- ✅ API keys stored in `.env` (gitignored)
- ✅ Firestore rules enforce user-level access control
- ✅ Users can only read/write their own data
- ✅ All operations require authentication

## 📚 What's Included

- **Email/Password Authentication**: Full signup and login flow
- **Google Sign-In**: One-click OAuth authentication
- **Firestore Integration**: Automatic user document creation/updates
- **Security Rules**: Pre-configured access control
- **TypeScript Support**: Fully typed authentication service
- **Error Handling**: User-friendly error messages with toast notifications
- **Loading States**: Prevent duplicate submissions

## 🎯 Firestore Data Structure

User documents are stored at `users/{uid}`:

```typescript
{
  uid: "firebase_user_id",
  name: "John Doe",
  email: "john@example.com",
  createdAt: Timestamp,  // Set once on account creation
  lastLogin: Timestamp   // Updated on every login
}
```

## 🛠️ Files Created

- `src/lib/firebase.ts` - Firebase initialization
- `src/services/authService.ts` - Authentication functions
- `src/hooks/useFirebaseAuth.ts` - Auth state listener hook
- `src/pages/Login.tsx` - Updated with Firebase auth
- `src/pages/Signup.tsx` - Updated with Firebase auth
- `firestore.rules` - Security rules
- `.env.example` - Environment template
- `.gitignore` - Updated to exclude .env

## 🐛 Common Issues

**Problem**: "Firebase: Error (auth/invalid-api-key)"
**Solution**: Check `.env` file exists and restart dev server

**Problem**: "Missing or insufficient permissions"
**Solution**: Deploy Firestore rules with `firebase deploy --only firestore:rules`

**Problem**: Google Sign-In popup blocked
**Solution**: Allow popups in browser settings

## 📖 Full Documentation

See `FIREBASE_AUTH_SETUP.md` for detailed setup instructions and troubleshooting.
