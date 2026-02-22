# Firebase Authentication Flow Diagram

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Application                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │  Login.tsx   │      │  Signup.tsx  │      │ Dashboard.tsx│  │
│  │              │      │              │      │              │  │
│  │ - Email/Pass │      │ - Email/Pass │      │ - Protected  │  │
│  │ - Google     │      │ - Google     │      │ - User Data  │  │
│  └──────┬───────┘      └──────┬───────┘      └──────────────┘  │
│         │                     │                                  │
│         └─────────┬───────────┘                                  │
│                   │                                              │
│         ┌─────────▼──────────┐                                  │
│         │  authService.ts    │                                  │
│         │                    │                                  │
│         │ - signUpWithEmail  │                                  │
│         │ - signInWithEmail  │                                  │
│         │ - signInWithGoogle │                                  │
│         │ - logOut           │                                  │
│         │ - getUserData      │                                  │
│         └─────────┬──────────┘                                  │
│                   │                                              │
│         ┌─────────▼──────────┐                                  │
│         │    firebase.ts     │                                  │
│         │                    │                                  │
│         │ - auth instance    │                                  │
│         │ - db instance      │                                  │
│         │ - config from .env │                                  │
│         └─────────┬──────────┘                                  │
│                   │                                              │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    │
        ┌───────────▼───────────┐
        │   Firebase Services   │
        ├───────────────────────┤
        │                       │
        │  ┌─────────────────┐ │
        │  │ Authentication  │ │
        │  │                 │ │
        │  │ - Email/Pass    │ │
        │  │ - Google OAuth  │ │
        │  │ - User Sessions │ │
        │  └─────────────────┘ │
        │                       │
        │  ┌─────────────────┐ │
        │  │   Firestore     │ │
        │  │                 │ │
        │  │ users/{uid}     │ │
        │  │ - uid           │ │
        │  │ - name          │ │
        │  │ - email         │ │
        │  │ - createdAt     │ │
        │  │ - lastLogin     │ │
        │  └─────────────────┘ │
        │                       │
        └───────────────────────┘
```

## 🔄 Email/Password Sign Up Flow

```
User                    UI                  authService           Firebase Auth        Firestore
  │                     │                       │                      │                   │
  │  Fill form          │                       │                      │                   │
  │  Click "Sign up"    │                       │                      │                   │
  ├────────────────────>│                       │                      │                   │
  │                     │                       │                      │                   │
  │                     │  signUpWithEmail()    │                      │                   │
  │                     ├──────────────────────>│                      │                   │
  │                     │                       │                      │                   │
  │                     │                       │  createUser()        │                   │
  │                     │                       ├─────────────────────>│                   │
  │                     │                       │                      │                   │
  │                     │                       │  UserCredential      │                   │
  │                     │                       │<─────────────────────┤                   │
  │                     │                       │                      │                   │
  │                     │                       │  createUserDocument()                    │
  │                     │                       ├─────────────────────────────────────────>│
  │                     │                       │                      │                   │
  │                     │                       │  Check if exists     │                   │
  │                     │                       │  (No - new user)     │                   │
  │                     │                       │                      │                   │
  │                     │                       │  Create document:    │                   │
  │                     │                       │  - uid               │                   │
  │                     │                       │  - name              │                   │
  │                     │                       │  - email             │                   │
  │                     │                       │  - createdAt         │                   │
  │                     │                       │  - lastLogin         │                   │
  │                     │                       │<─────────────────────────────────────────┤
  │                     │                       │                      │                   │
  │                     │  UserCredential       │                      │                   │
  │                     │<──────────────────────┤                      │                   │
  │                     │                       │                      │                   │
  │  Success toast      │                       │                      │                   │
  │  Navigate to        │                       │                      │                   │
  │  /dashboard         │                       │                      │                   │
  │<────────────────────┤                       │                      │                   │
  │                     │                       │                      │                   │
```

## 🔄 Email/Password Login Flow

```
User                    UI                  authService           Firebase Auth        Firestore
  │                     │                       │                      │                   │
  │  Enter credentials  │                       │                      │                   │
  │  Click "Sign in"    │                       │                      │                   │
  ├────────────────────>│                       │                      │                   │
  │                     │                       │                      │                   │
  │                     │  signInWithEmail()    │                      │                   │
  │                     ├──────────────────────>│                      │                   │
  │                     │                       │                      │                   │
  │                     │                       │  signIn()            │                   │
  │                     │                       ├─────────────────────>│                   │
  │                     │                       │                      │                   │
  │                     │                       │  UserCredential      │                   │
  │                     │                       │<─────────────────────┤                   │
  │                     │                       │                      │                   │
  │                     │                       │  updateUserDocument()                    │
  │                     │                       ├─────────────────────────────────────────>│
  │                     │                       │                      │                   │
  │                     │                       │  Check if exists     │                   │
  │                     │                       │  (Yes - existing)    │                   │
  │                     │                       │                      │                   │
  │                     │                       │  Update ONLY:        │                   │
  │                     │                       │  - lastLogin         │                   │
  │                     │                       │  (merge: true)       │                   │
  │                     │                       │<─────────────────────────────────────────┤
  │                     │                       │                      │                   │
  │                     │  UserCredential       │                      │                   │
  │                     │<──────────────────────┤                      │                   │
  │                     │                       │                      │                   │
  │  Success toast      │                       │                      │                   │
  │  Navigate to        │                       │                      │                   │
  │  /dashboard         │                       │                      │                   │
  │<────────────────────┤                       │                      │                   │
  │                     │                       │                      │                   │
```

## 🔄 Google Sign-In Flow

```
User                    UI                  authService           Firebase Auth        Firestore
  │                     │                       │                      │                   │
  │  Click "Continue    │                       │                      │                   │
  │  with Google"       │                       │                      │                   │
  ├────────────────────>│                       │                      │                   │
  │                     │                       │                      │                   │
  │                     │  signInWithGoogle()   │                      │                   │
  │                     ├──────────────────────>│                      │                   │
  │                     │                       │                      │                   │
  │                     │                       │  signInWithPopup()   │                   │
  │                     │                       ├─────────────────────>│                   │
  │                     │                       │                      │                   │
  │  Google popup       │                       │  Google OAuth        │                   │
  │  appears            │                       │  flow                │                   │
  │<────────────────────┤                       │                      │                   │
  │                     │                       │                      │                   │
  │  Select account     │                       │                      │                   │
  │  Authorize          │                       │                      │                   │
  ├────────────────────>│                       │                      │                   │
  │                     │                       │                      │                   │
  │                     │                       │  UserCredential      │                   │
  │                     │                       │<─────────────────────┤                   │
  │                     │                       │                      │                   │
  │                     │                       │  createOrUpdateUser()                    │
  │                     │                       ├─────────────────────────────────────────>│
  │                     │                       │                      │                   │
  │                     │                       │  Check if exists     │                   │
  │                     │                       │                      │                   │
  │                     │                       │  If NEW:             │                   │
  │                     │                       │  - Create full doc   │                   │
  │                     │                       │                      │                   │
  │                     │                       │  If EXISTS:          │                   │
  │                     │                       │  - Update lastLogin  │                   │
  │                     │                       │<─────────────────────────────────────────┤
  │                     │                       │                      │                   │
  │                     │  UserCredential       │                      │                   │
  │                     │<──────────────────────┤                      │                   │
  │                     │                       │                      │                   │
  │  Success toast      │                       │                      │                   │
  │  Navigate to        │                       │                      │                   │
  │  /dashboard         │                       │                      │                   │
  │<────────────────────┤                       │                      │                   │
  │                     │                       │                      │                   │
```

## 🔒 Security Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Security Layers                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Layer 1: Environment Variables                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ .env file (gitignored)                                     │ │
│  │ - VITE_FIREBASE_API_KEY                                    │ │
│  │ - VITE_FIREBASE_AUTH_DOMAIN                                │ │
│  │ - etc.                                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Layer 2: Firebase Authentication                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - User must be authenticated                               │ │
│  │ - Valid email/password or OAuth token                      │ │
│  │ - Session management                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Layer 3: Firestore Security Rules                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ match /users/{userId} {                                    │ │
│  │   allow read, write: if request.auth.uid == userId;        │ │
│  │ }                                                           │ │
│  │                                                             │ │
│  │ - Users can only access their own data                     │ │
│  │ - All operations require authentication                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Layer 4: Application Logic                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ - Input validation                                         │ │
│  │ - Error handling                                           │ │
│  │ - Loading states                                           │ │
│  │ - Protected routes                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 Data Flow

```
┌──────────────┐
│   User       │
│   Action     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   UI Layer   │
│  (Login/     │
│   Signup)    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Auth        │
│  Service     │
└──────┬───────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│  Firebase    │  │  Firestore   │
│  Auth        │  │  Database    │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                │
                ▼
         ┌──────────────┐
         │   Success    │
         │   Response   │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │   Update     │
         │   App State  │
         └──────┬───────┘
                │
                ▼
         ┌──────────────┐
         │   Navigate   │
         │   Dashboard  │
         └──────────────┘
```

## 🎯 Key Points

1. **Separation of Concerns**: UI → Service → Firebase
2. **Security First**: Environment variables, auth checks, Firestore rules
3. **User Experience**: Loading states, error handling, toast notifications
4. **Data Integrity**: Automatic document management, timestamp handling
5. **Type Safety**: Full TypeScript support throughout

## 📝 File Responsibilities

| File | Responsibility |
|------|----------------|
| `firebase.ts` | Initialize Firebase, export auth & db instances |
| `authService.ts` | Authentication logic, Firestore user management |
| `Login.tsx` | Login UI, call auth service, handle responses |
| `Signup.tsx` | Signup UI, call auth service, handle responses |
| `useFirebaseAuth.ts` | Listen to auth state changes, sync with app |
| `firestore.rules` | Security rules, access control |
| `.env` | Configuration, API keys (gitignored) |

## 🔄 State Management

```
Firebase Auth State
        │
        ▼
useFirebaseAuth Hook
        │
        ├─── user (Firebase User object)
        ├─── userData (Firestore user document)
        └─── loading (boolean)
        │
        ▼
AppContext
        │
        ├─── isAuthenticated
        ├─── user { name, email, org }
        └─── login/logout functions
        │
        ▼
Protected Routes
        │
        └─── Dashboard, Projects, etc.
```
