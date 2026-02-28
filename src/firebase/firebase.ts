import { Analytics, getAnalytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import {
  Auth,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

let _analytics: Analytics | undefined;
let _auth: Auth | undefined;
let _storage: FirebaseStorage | undefined;
let _googleProvider: GoogleAuthProvider | undefined;

try {
  _analytics = getAnalytics(app);
} catch {
  // Analytics requires valid Firebase config — skip in local dev without credentials
}

try {
  _auth = getAuth(app);
  _googleProvider = new GoogleAuthProvider();
} catch {
  // Auth requires valid API key — skip in local dev without credentials
}

try {
  _storage = getStorage(app);
} catch {
  // Storage requires valid Firebase config — skip in local dev without credentials
}

// Cast to non-undefined for consumers that require Firebase (Login, Profile, etc.)
// These will only be used on routes that need auth, which won't work without config anyway.
const analytics = _analytics as Analytics;
const auth = _auth as Auth;
const googleProvider = _googleProvider as GoogleAuthProvider;
const storage = _storage as FirebaseStorage;

export {
  analytics,
  auth,
  googleProvider,
  storage,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
};
