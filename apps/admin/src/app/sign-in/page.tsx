'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

import { getClientAuth } from '@/features/auth/client/firebase-client';

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

    try {
      const auth = getClientAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);

      if (!userCredential.user.emailVerified) {
        await signOut(auth);
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
        throw new Error(data.error || 'Access denied. Staff verification privileges required.');
      }

      // Explicitly sign out of client JS SDK immediately to ensure zero client-side credentials remain
      await signOut(auth);

      router.push(redirectUrl);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed. Please check credentials.';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#121418', border: '1px solid #23272F', borderRadius: '16px', padding: '40px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#C89D46', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#090A0C' }}>
          <ShieldCheck size={22} />
        </div>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>MMG Operations</h1>
          <p style={{ fontSize: '12px', color: '#8E95A3', margin: 0 }}>Staff Verification & Management Desk</p>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#EF4444', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#A0A6B2', marginBottom: '8px' }}>
            Staff Email
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Mail size={18} style={{ position: 'absolute', left: '14px', color: '#636A78' }} />
            <input
              id="staff-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@mmgconcierge.com"
              style={{ width: '100%', padding: '12px 14px 12px 42px', backgroundColor: '#181B20', border: '1px solid #2C323D', borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '26px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#A0A6B2', marginBottom: '8px' }}>
            Password
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Lock size={18} style={{ position: 'absolute', left: '14px', color: '#636A78' }} />
            <input
              id="staff-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ width: '100%', padding: '12px 14px 12px 42px', backgroundColor: '#181B20', border: '1px solid #2C323D', borderRadius: '8px', color: '#FFFFFF', fontSize: '14px', outline: 'none' }}
            />
          </div>
        </div>

        <button
          id="staff-sign-in-button"
          type="submit"
          disabled={loading}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#C89D46', color: '#090A0C', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1 }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Authenticating Staff...</span>
            </>
          ) : (
            <>
              <span>Sign in to Operations Desk</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '11px', color: '#565C6A' }}>
        Restricted access. All actions are audited with cryptographically hashed evidence.
      </div>
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
