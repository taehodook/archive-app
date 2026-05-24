import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, push, remove, onValue } from 'firebase/database';

/* ============================================================
   본인 Firebase 프로젝트 키를 환경변수로 넣거나,
   아래 값을 직접 교체하세요.
   ============================================================ */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "0000000",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:0000:web:0000"
};

let app, db;
let isConfigured = false;

if (typeof window !== 'undefined') {
  isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";
  if (isConfigured) {
    try {
      app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
      db = getDatabase(app);
    } catch (e) {
      console.warn('Firebase init failed', e);
      isConfigured = false;
    }
  }
}

export { db, isConfigured, ref, set, push, remove, onValue };
