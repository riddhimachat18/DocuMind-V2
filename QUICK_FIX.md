# 🚨 QUICK FIX - Google Sign-In Error

## Your Error:
```
Firebase: Error (auth/configuration-not-found)
```

## Fix in 3 Steps:

### 1️⃣ Enable Google Sign-In
👉 https://console.firebase.google.com/project/documind-6c687/authentication/providers

- Click **Google**
- Toggle **Enable**
- Select **support email**
- Click **Save**

### 2️⃣ Add Your API Key to .env
Open `.env` file and replace `your_api_key_here` with your real API key.

Get it here: https://console.firebase.google.com/project/documind-6c687/settings/general
(Scroll to "Your apps" → Copy apiKey)

### 3️⃣ Restart Dev Server
```bash
Ctrl+C
npm run dev
```

## ✅ Done!
Test: http://localhost:5173/signup → Click "Continue with Google"

---

## Still Not Working?

### Check Your .env File:
```env
VITE_FIREBASE_API_KEY=AIza...your_real_key_here
VITE_FIREBASE_AUTH_DOMAIN=documind-6c687.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=documind-6c687
VITE_FIREBASE_STORAGE_BUCKET=documind-6c687.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1051747171351
VITE_FIREBASE_APP_ID=1:1051747171351:web:19f630958b182b878cb052
```

**Important:**
- ✅ File must be named `.env` (with the dot)
- ✅ File must be in project root (same folder as package.json)
- ✅ Variables must start with `VITE_`
- ✅ No quotes around values
- ✅ No spaces around `=`

### Verify Environment Variables Loaded:
Open browser console and type:
```javascript
console.log(import.meta.env.VITE_FIREBASE_PROJECT_ID)
```

Should show: `documind-6c687`

If it shows `undefined`, your `.env` isn't being read. Make sure:
1. File is named `.env` (not `.env.txt`)
2. File is in root directory
3. You restarted the dev server

---

## 📚 More Help:
- Detailed guide: `FIREBASE_AUTH_SETUP.md`
- Troubleshooting: `TROUBLESHOOTING.md`
- Step-by-step: `verify-firebase-setup.md`
