'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

import { getClientAuth } from '@/features/auth/client/firebase-client';
import { safeAuthError } from './safe-auth-error';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only same-origin relative paths: an attacker-crafted
  // /sign-in?redirect=https://evil.example must never steer staff off-site
  // after a successful login. Reject protocol-relative (//host) and
  // backslash variants, which browsers can reinterpret as absolute URLs.
  const requestedRedirect = searchParams.get('redirect');
  const redirectUrl =
    requestedRedirect !== null &&
    requestedRedirect.startsWith('/') &&
    !requestedRedirect.startsWith('//') &&
    !requestedRedirect.includes('\\')
      ? requestedRedirect
      : '/owners';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both your work email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    let authForCleanup: ReturnType<typeof getClientAuth> | null = null;
    let sessionEstablished = false;

    try {
      const auth = getClientAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      // Only retain this auth instance after Firebase confirms the login. An
      // unrelated existing client session must never be signed out.
      authForCleanup = auth;

      if (!userCredential.user.emailVerified) {
        throw new Error('Access denied. Staff email must be verified.');
      }

      const idToken = await userCredential.user.getIdToken(true);

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        void data;
        throw new Error('Access denied. Staff verification privileges required.');
      }

      // The server cookie is established before cleanup. Navigation waits
      // until finally has attempted to remove the client-side credential.
      sessionEstablished = true;
    } catch (err: unknown) {
      setError(safeAuthError(err));
    } finally {
      if (authForCleanup) {
        // Cleanup must not replace the primary authentication/session error.
        // It is deliberately scoped to the auth instance used by this login.
        try {
          await signOut(authForCleanup);
        } catch {
          // The server session remains the authoritative credential boundary.
        }
      }
      setLoading(false);
    }

    if (sessionEstablished) {
      router.push(redirectUrl);
      router.refresh();
    }
  };

  return (
    <div className="admin-auth-panel" style={{ width: '100%', maxWidth: '440px', backgroundColor: '#121418', border: '1px solid #23272F', borderRadius: '12px', padding: '32px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Staff sign in</h1>
      <p style={{ fontSize: '13px', color: '#8E95A3', margin: '0 0 28px', lineHeight: 1.5 }}>Use your verified staff account to open operations desks.</p>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#EF4444', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '18px' }}>
          <label htmlFor="staff-email-input" style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#A0A6B2', marginBottom: '8px' }}>
            Email
          </label>
          <input
              id="staff-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@mmgconcierge.com"
              style={{ width: '100%', minHeight: '44px', padding: '12px 14px', backgroundColor: '#181B20', border: '1px solid #2C323D', borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', outline: 'none' }}
          />
        </div>

        <div style={{ marginBottom: '26px' }}>
          <label htmlFor="staff-password-input" style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#A0A6B2', marginBottom: '8px' }}>
            Password
          </label>
          <input
              id="staff-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ width: '100%', minHeight: '44px', padding: '12px 14px', backgroundColor: '#181B20', border: '1px solid #2C323D', borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', outline: 'none' }}
          />
        </div>

        <button
          id="staff-sign-in-button"
          type="submit"
          disabled={loading}
          style={{ width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#C89D46', color: '#090A0C', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1 }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Authenticating Staff...</span>
            </>
          ) : (
            <>
              <span>Sign in</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

    </div>
  );
}

export default function SignInPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090A0C', color: '#FFFFFF', padding: '24px' }}>
      <Suspense fallback={<div style={{ color: '#8E95A3' }}>Loading...</div>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
