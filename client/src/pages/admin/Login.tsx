import { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../assets/niat-logo.png';
import { loginAdmin } from '../../lib/api';

export default function AdminLogin({ onLoginSuccess }: { onLoginSuccess?: (email: string) => void }) {
  const [email, setEmail] = useState('admin@niat.edu');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await loginAdmin(email.trim(), password);
      setBusy(false);
      if (onLoginSuccess) {
        onLoginSuccess(res.email);
      }
    } catch (err) {
      setBusy(false);
      setError((err as Error).message || 'Invalid administrator credentials.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-4 py-12">
      <div className="w-full max-w-md animate-scale-in">
        {/* Brand header */}
        <div className="text-center">
          <Link to="/" className="inline-block transition-transform hover:scale-102">
            <img src={logo} alt="NIAT" className="mx-auto h-12 w-auto object-contain" />
          </Link>
          <div className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-niat-maroon">
            NIAT AI BOOTCAMP
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-niat-text sm:text-3xl">
            Command Center Login
          </h1>
          <p className="mt-1 text-xs text-niat-muted">
            Enter your single administrator credentials to manage live event operations.
          </p>
        </div>

        {/* Card */}
        <div className="mt-7 rounded-2xl border border-niat-line bg-white p-7 shadow-xs">
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-niat-maroon/20 bg-niat-pink/80 p-3 text-xs font-semibold text-niat-maroon-dark animate-fade-in"
            >
              <span className="mt-0.5 text-sm" aria-hidden="true">
                ⚠
              </span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="mb-1 block text-xs font-bold uppercase tracking-wider text-niat-muted">
                Admin Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@niat.edu"
                className="w-full rounded-xl border border-niat-line bg-white px-3.5 py-2.5 text-sm font-medium text-niat-text outline-none transition-all placeholder:text-stone-400 focus:border-niat-maroon focus:ring-4 focus:ring-niat-maroon/10"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-bold uppercase tracking-wider text-niat-muted"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] font-semibold text-niat-muted hover:text-niat-maroon cursor-pointer"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-niat-line bg-white px-3.5 py-2.5 text-sm font-medium text-niat-text outline-none transition-all placeholder:text-stone-400 focus:border-niat-maroon focus:ring-4 focus:ring-niat-maroon/10"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-niat-maroon py-3 text-sm font-bold text-white shadow-xs transition-all hover:bg-niat-maroon-dark hover:shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-maroon/30 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>Verifying credentials…</span>
                </>
              ) : (
                <>
                  <span>Sign In to Command Center</span>
                  <span aria-hidden="true">&rarr;</span>
                </>
              )}
            </button>
          </form>

          {/* Single admin note */}
          <div className="mt-5 rounded-xl border border-niat-line/70 bg-niat-warm-white p-3 text-center text-[11px] text-niat-muted">
            <span className="font-bold text-niat-text">🔒 Single Administrator Account</span>
            <div className="mt-0.5">Configured via environment variables for AI Bootcamp event coordination.</div>
          </div>
        </div>

        {/* Return to kiosk */}
        <div className="mt-5 text-center">
          <Link
            to="/"
            className="text-xs font-semibold text-niat-muted transition-colors hover:text-niat-maroon"
          >
            &larr; Back to Attendee Check-In Kiosk
          </Link>
        </div>
      </div>
    </div>
  );
}
