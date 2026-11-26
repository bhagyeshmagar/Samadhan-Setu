import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const ALLOWED_PUBLIC_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

function readEnvFirebaseConfig() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
  };
  return cfg.apiKey && cfg.authDomain && cfg.projectId ? cfg : null;
}

function readLocalFallbackConfig() {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'firebase-applet-config.json'),
    path.resolve(cwd, '..', 'firebase-applet-config.json'),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      const sanitized = {};
      for (const key of ALLOWED_PUBLIC_KEYS) {
        if (typeof raw?.[key] === 'string' && raw[key].trim()) {
          sanitized[key] = raw[key].trim();
        }
      }
      if (sanitized.apiKey && sanitized.authDomain && sanitized.projectId) {
        return sanitized;
      }
    } catch {
      // Ignore unreadable/missing local fallback config
    }
  }
  return null;
}

export async function GET() {
  const envConfig = readEnvFirebaseConfig();
  if (envConfig) {
    return NextResponse.json(
      { configured: true, source: 'env', config: envConfig },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const localConfig = readLocalFallbackConfig();
  if (localConfig) {
    return NextResponse.json(
      { configured: true, source: 'local', config: localConfig },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { configured: false, source: 'none', config: null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
