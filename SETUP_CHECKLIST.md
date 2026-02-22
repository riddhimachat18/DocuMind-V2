# Firebase Authentication Setup Checklist

Use this checklist to ensure everything is configured correctly.

## ✅ Pre-Setup

- [ ] Firebase project exists (documind-6c687)
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] Logged into Firebase CLI (`firebase login`)

## ✅ Environment Configuration

- [ ] `.env` file created in project root
- [ ] `VITE_FIREBASE_API_KEY` added to `.env`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN` added to `.env`
- [ ] `VITE_FIREBASE_PROJECT_ID` added to `.env`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET` added to `.env`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID` added to `.env`
- [ ] `VITE_FIREBASE_APP_ID` added to `.env`
- [ ] `.env` is in `.gitignore` (verified ✓)

## ✅ Firebase Console Configuration

### Authentication Setup:
- [ ] Go to Firebase Console → Authentication
- [ ] Click "Get Started" (if first time)
- [ ] Go to "Sign-in method" tab
- [ ] Enable "Email/Password" provider
- [ ] Enable "Google" provider
- [ ] Add support email for Google provider

### Firestore Setup:
- [ ] Go to Firebase Console → Firestore Database
- [ ] Database created (if not already)
- [ ] Deploy security rules: `firebase deploy --only firestore:rules`

## ✅ Code Verification

- [ ] `src/lib/firebase.ts` exists
- [ ] `src/services/authService.ts` exists
- [ ] `src/hooks/useFirebaseAuth.ts` exists
- [ ] `src/pages/Login.tsx` updated with Firebase auth
- [ ] `src/pages/Signup.tsx` updated with Firebase auth
- [ ] `firestore.rules` updated with security rules
- [ ] No TypeScript errors (`npm run build` succeeds)

## ✅ Testing

### Email/Password Sign Up:
- [ ] Navigate to `/signup`
- [ ] Fill in all fields (name, org, email, password)
- [ ] Click "Create account"
- [ ] Redirected to `/dashboard`
- [ ] Success toast appears
- [ ] Check Firebase Console → Authentication → Users (new user appears)
- [ ] Check Firestore → users collection (document created with uid, name, email, createdAt, lastLogin)

### Email/Password Login:
- [ ] Navigate to `/login`
- [ ] Enter email and password
- [ ] Click "Sign in"
- [ ] Redirected to `/dashboard`
- [ ] Success toast appears
- [ ] Check Firestore → users/{uid} (lastLogin timestamp updated)

### Google Sign-In (Signup):
- [ ] Navigate to `/signup`
- [ ] Click "Continue with Google"
- [ ] Google popup appears
- [ ] Select Google account
- [ ] Redirected to `/dashboard`
- [ ] Success toast appears
- [ ] Check Firebase Console → Authentication → Users (new user appears)
- [ ] Check Firestore → users collection (document created)

### Google Sign-In (Login):
- [ ] Navigate to `/login`
- [ ] Click "Continue with Google"
- [ ] Select same Google account as before
- [ ] Redirected to `/dashboard`
- [ ] Success toast appears
- [ ] Check Firestore → users/{uid} (lastLogin updated, createdAt unchanged)

### Error Handling:
- [ ] Try login with wrong password (error toast appears)
- [ ] Try signup with existing email (error toast appears)
- [ ] Try signup with password < 8 chars (error toast appears)
- [ ] Loading states work (buttons disabled during auth)

### Security:
- [ ] Try accessing Firestore from browser console without auth (should fail)
- [ ] Try reading another user's document (should fail)
- [ ] Verify `.env` not committed to git (`git status` doesn't show it)

## ✅ Production Readiness

- [ ] All API keys in environment variables
- [ ] `.env` in `.gitignore`
- [ ] Firestore security rules deployed
- [ ] Error handling implemented
- [ ] Loading states implemented
- [ ] TypeScript types defined
- [ ] No console errors in browser
- [ ] Toast notifications working

## 🎯 Quick Test Commands

```bash
# Check if .env is gitignored
git status

# Build project (checks for TypeScript errors)
npm run build

# Start dev server
npm run dev

# Deploy Firestore rules
firebase deploy --only firestore:rules
```

## 📝 Common Issues & Solutions

### Issue: "Firebase: Error (auth/invalid-api-key)"
**Solution**: 
- Verify `.env` file exists in project root
- Check all environment variables are set correctly
- Restart dev server: `Ctrl+C` then `npm run dev`

### Issue: "Missing or insufficient permissions"
**Solution**:
- Deploy Firestore rules: `firebase deploy --only firestore:rules`
- Check user is authenticated before accessing Firestore

### Issue: Google Sign-In popup blocked
**Solution**:
- Allow popups in browser settings
- Try different browser
- Check `authDomain` is correct in Firebase Console

### Issue: "Firebase: Password should be at least 6 characters"
**Solution**:
- UI enforces 8 characters minimum
- Check password input has correct validation

## ✨ Success Criteria

You've successfully set up Firebase Authentication when:

1. ✅ Users can sign up with email/password
2. ✅ Users can log in with email/password
3. ✅ Users can sign in with Google
4. ✅ User documents are created in Firestore
5. ✅ `lastLogin` updates on each login
6. ✅ `createdAt` stays unchanged after first login
7. ✅ No API keys visible in source code
8. ✅ Security rules prevent unauthorized access
9. ✅ Error messages are user-friendly
10. ✅ Loading states prevent duplicate submissions

## 📚 Next Steps

Once all items are checked:
1. Test thoroughly in development
2. Set up staging environment
3. Configure production Firebase project
4. Update environment variables for production
5. Deploy to production

## 🆘 Need Help?

- **Quick Start**: See `QUICK_START.md`
- **Detailed Guide**: See `FIREBASE_AUTH_SETUP.md`
- **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md`
- **Firebase Docs**: https://firebase.google.com/docs/auth
