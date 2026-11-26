'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from 'firebase/auth';

// Least-privilege Gmail scope for sending grievance notifications on the user's behalf
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

function getEnvFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '';
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
  if (!apiKey || !authDomain || !projectId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
}

let authInstance = null;
let authInitPromise = null;

const provider = new GoogleAuthProvider();
GMAIL_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

// Strict in-memory token cache (never stored in localStorage or sessionStorage)
let cachedAccessToken = null;
let isSigningIn = false;

async function resolveFirebaseAuth() {
  if (authInstance) return authInstance;
  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    let config = getEnvFirebaseConfig();
    if (!config && typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/config/firebase', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.configured && data?.config?.apiKey) {
            config = data.config;
          }
        }
      } catch {
        // Fallback failed silently; handled below
      }
    }

    if (!config?.apiKey || !config?.authDomain || !config?.projectId) {
      return null;
    }

    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    authInstance = getAuth(app);
    return authInstance;
  })();

  const resolved = await authInitPromise;
  if (!resolved) {
    authInitPromise = null;
  }
  return resolved;
}

export function getCachedGmailToken() {
  return cachedAccessToken;
}

export async function connectGmailWithPopup() {
  const auth = await resolveFirebaseAuth();
  if (!auth) {
    throw new Error(
      'Google Sign-In is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID in environment variables.'
    );
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Gmail send access from Google Sign-In.');
    }
    cachedAccessToken = credential.accessToken;
    return {
      user: {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      },
      accessToken: cachedAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function disconnectGmailSession() {
  cachedAccessToken = null;
  try {
    const auth = authInstance || (await resolveFirebaseAuth());
    if (auth) {
      await auth.signOut();
    }
  } catch {
    // Ignore sign-out errors if no active Firebase session
  }
}

const GmailAuthContext = createContext({
  googleUser: null,
  isConnected: false,
  needsAuth: true,
  isConnecting: false,
  isConfigured: true,
  authError: '',
  connectGmail: async () => null,
  disconnectGmail: async () => {},
  getAccessToken: () => null,
  markTokenExpired: () => {},
});

export function GmailAuthProvider({ children }) {
  const [googleUser, setGoogleUser] = useState(null);
  const [hasToken, setHasToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    resolveFirebaseAuth().then((auth) => {
      if (!active) return;
      if (!auth) {
        setIsConfigured(false);
        return;
      }
      setIsConfigured(true);
      unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        if (!active) return;
        if (fbUser && cachedAccessToken) {
          setGoogleUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
          });
          setHasToken(true);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          setHasToken(false);
          if (fbUser) {
            setGoogleUser({
              uid: fbUser.uid,
              email: fbUser.email,
              displayName: fbUser.displayName,
              photoURL: fbUser.photoURL,
            });
          } else {
            setGoogleUser(null);
          }
        }
      });
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const connectGmail = useCallback(async () => {
    setIsConnecting(true);
    setAuthError('');
    try {
      const res = await connectGmailWithPopup();
      setGoogleUser(res.user);
      setHasToken(true);
      setIsConfigured(true);
      return res;
    } catch (err) {
      const msg =
        err?.code === 'auth/popup-closed-by-user'
          ? 'Google sign-in popup was closed before completion.'
          : err?.code === 'auth/popup-blocked'
            ? 'Popup blocked by browser. Please allow popups for this site and try again.'
            : err?.message || 'Unable to connect Google account.';
      setAuthError(msg);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectGmail = useCallback(async () => {
    setAuthError('');
    await disconnectGmailSession();
    setGoogleUser(null);
    setHasToken(false);
  }, []);

  const markTokenExpired = useCallback(() => {
    cachedAccessToken = null;
    setHasToken(false);
    setAuthError('Your Google session expired. Sign in with Google again to send Gmail alerts.');
  }, []);

  const getAccessToken = useCallback(() => cachedAccessToken, []);

  return (
    <GmailAuthContext.Provider
      value={{
        googleUser,
        isConnected: Boolean(googleUser && hasToken),
        needsAuth: !hasToken,
        isConnecting,
        isConfigured,
        authError,
        connectGmail,
        disconnectGmail,
        getAccessToken,
        markTokenExpired,
      }}
    >
      {children}
    </GmailAuthContext.Provider>
  );
}

export function useGmailAuth() {
  return useContext(GmailAuthContext);
}
