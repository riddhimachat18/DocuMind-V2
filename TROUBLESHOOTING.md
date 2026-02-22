# Troubleshooting Firebase Authentication Errors

## ❌ Error: `auth/configuration-not-found`

**Full Error Message:**
```
FirebaseError: Firebase: Error (auth/configuration-not-found)
CONFIGURATION_NOT_FOUND
```

**What This Means:**
Google Sign-In is not properly configured in your Firebase project.

### ✅ Solution Steps:

#### Step 1: Enable Google Sign-In in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **documind-6c687**
3. Click **Authentication** in the left sidebar
4. Click **Sign-in method** tab
5. Find **Google** in the providers list
6. Click on **Google**
7. **Toggle the Enable switch to ON**
8. **Select a support email** from the dropdown (required)
9. Click **Save**

#### Step 2: Verify Your Domain is Authorized

1. Still in Firebase Console → Authentication
2. Go to **Settings** tab (gear icon at top)
3. Scroll to **Authorized domains**
4. Make sure `localhost` is in the list (it should be by default)
5. If deploying, add your production domain here

#### Step 3: Check Your Firebase Configuration

Make sure your `.env` file has the correct values:

```env
VITE_FIREBASE_API_KEY=your_actual_api_key
VITE_FIREBASE_AUTH_DOMAIN=documind-6c687.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=documind-6c687
VITE_FIREBASE_STORAGE_BUCKET=documind-6c687.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1051747171351
VITE_FIREBASE_APP_ID=1:1051747171351:web:19f630958b182b878cb052
```

**Important:** The `authDomain` should be `documind-6c687.firebaseapp.com`

#### Step 4: Restart Your Dev Server

After making changes:
```bash
# Stop the server (Ctrl+C)
# Start it again
npm run dev
```

### 🔍 How to Get Your Firebase Config Values

1. Go to Firebase Console
2. Click the gear icon → **Project settings**
3. Scroll down to **Your apps**
4. Find your web app or click **Add app** if none exists
5. Copy the config values from the code snippet

Example:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "documind-6c687.firebaseapp.com",
  projectId: "documind-6c687",
  storageBucket: "documind-6c687.appspot.com",
  messagingSenderId: "1051747171351",
  appId: "1:1051747171351:web:19f630958b182b878cb052"
};
```

---

## ⚠️ React Router Warnings

**Warning Messages:**
```
React Router Future Flag Warning: v7_startTransition
React Router Future Flag Warning: v7_relativeSplatPath
```

**What This Means:**
These are just warnings about upcoming React Router v7 changes. They don't affect functionality.

### ✅ Solution (Optional):

Update `src/App.tsx` to add future flags:

```typescript
<BrowserRouter
  future={{
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  }}
>
  <AppRoutes />
</BrowserRouter>
```

---

## 🔧 Other Common Errors

### Error: `auth/invalid-api-key`

**Solution:**
- Check `.env` file exists in project root
- Verify `VITE_FIREBASE_API_KEY` is correct
- Restart dev server

### Error: `auth/unauthorized-domain`

**Solution:**
1. Go to Firebase Console → Authentication → Settings
2. Add your domain to **Authorized domains**
3. For local dev, ensure `localhost` is listed

### Error: `auth/popup-blocked`

**Solution:**
- Allow popups in browser settings
- Try a different browser
- Use incognito/private mode

### Error: `auth/popup-closed-by-user`

**Solution:**
- This is normal - user closed the popup
- No action needed, just inform the user

### Error: `auth/email-already-in-use`

**Solution:**
- This is expected behavior
- Show user-friendly message: "Email already registered. Please login."

### Error: `auth/weak-password`

**Solution:**
- Firebase requires minimum 6 characters
- Your UI enforces 8 characters
- Check password validation logic

### Error: `auth/wrong-password`

**Solution:**
- User entered incorrect password
- Show user-friendly error message
- Consider adding "Forgot password?" link

### Error: `Missing or insufficient permissions`

**Solution:**
1. Deploy Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Verify user is authenticated before accessing Firestore
3. Check security rules in `firestore.rules`

---

## 🐛 Debugging Tips

### Check Firebase Connection

Add this to your browser console:
```javascript
console.log(import.meta.env.VITE_FIREBASE_API_KEY);
console.log(import.meta.env.VITE_FIREBASE_PROJECT_ID);
```

If these are `undefined`, your `.env` file isn't being read.

### Check Authentication State

Add this to your component:
```typescript
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    console.log('Auth state changed:', user);
  });
  return unsubscribe;
}, []);
```

### Check Firestore Connection

```typescript
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const testFirestore = async () => {
  try {
    const docRef = doc(db, 'users', 'test');
    const docSnap = await getDoc(docRef);
    console.log('Firestore connected:', docSnap.exists());
  } catch (error) {
    console.error('Firestore error:', error);
  }
};
```

---

## 📋 Quick Checklist

Before asking for help, verify:

- [ ] `.env` file exists in project root
- [ ] All environment variables are set correctly
- [ ] Dev server was restarted after creating/modifying `.env`
- [ ] Google Sign-In is enabled in Firebase Console
- [ ] Support email is selected for Google provider
- [ ] `localhost` is in authorized domains
- [ ] Firestore security rules are deployed
- [ ] No typos in environment variable names (must start with `VITE_`)
- [ ] Browser console shows no CORS errors
- [ ] Firebase project ID matches in all places

---

## 🆘 Still Having Issues?

### Check Firebase Status
Visit: https://status.firebase.google.com/

### Enable Debug Mode
Add to your `.env`:
```env
VITE_FIREBASE_DEBUG=true
```

Then in `src/lib/firebase.ts`, add:
```typescript
if (import.meta.env.VITE_FIREBASE_DEBUG === 'true') {
  console.log('Firebase Config:', {
    apiKey: firebaseConfig.apiKey ? '✓ Set' : '✗ Missing',
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
  });
}
```

### Test with Firebase CLI
```bash
firebase auth:export users.json --project documind-6c687
```

This will verify your Firebase CLI is connected to the right project.

---

## 📚 Resources

- [Firebase Auth Errors](https://firebase.google.com/docs/reference/js/auth#autherrorcodes)
- [Firebase Console](https://console.firebase.google.com/)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [React Router Future Flags](https://reactrouter.com/v6/upgrading/future)
