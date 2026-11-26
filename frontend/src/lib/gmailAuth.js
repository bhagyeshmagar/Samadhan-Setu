'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

// Least-privilege Gmail scope for sending grievance notifications on the user's behalf
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
GMAIL_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

// Strict in-memory token cache (never stored in localStorage or sessionStorage)
let cachedAccessToken = null;
let isSigningIn = false;

export function getCachedGmailToken() {
  return cachedAccessToken;
}

export async function connectGmailWithPopup() {
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
    await auth.signOut();
  } catch {
    // Ignore sign-out errors if no active Firebase session
  }
}

const GmailAuthContext = createContext({
  googleUser: null,
  isConnected: false,
  needsAuth: true,
  isConnecting: false,
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
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
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
    return () => unsubscribe();
  }, []);

  const connectGmail = useCallback(async () => {
    setIsConnecting(true);
    setAuthError('');
    try {
      const res = await connectGmailWithPopup();
      setGoogleUser(res.user);
      setHasToken(true);
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
