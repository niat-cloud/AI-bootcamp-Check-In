import { Link } from 'react-router-dom';
import logo from '../../assets/niat-logo.png';

/** Shared frame for the account screens (request access, set a new password). */
export function AuthFrame({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-4 py-12">
      <div className="w-full max-w-md animate-scale-in">
        <div className="text-center">
          <Link to="/" className="inline-block">
            <img src={logo} alt="NIAT" className="mx-auto h-12 w-auto object-contain" />
          </Link>
          <div className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-niat-maroon">NIAT AI BOOTCAMP</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-niat-text sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-niat-muted">{subtitle}</p>
        </div>
        <div className="mt-7 rounded-2xl border border-niat-line bg-white p-6 shadow-xs sm:p-7">{children}</div>
        {footer && <div className="mt-5 text-center text-xs font-semibold text-niat-muted">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-niat-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-niat-muted">{hint}</span>}
    </label>
  );
}

export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border p-3 text-sm font-semibold ${tone === 'error'
        ? 'border-niat-maroon/20 bg-niat-pink/80 text-niat-maroon-dark'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      {children}
    </div>
  );
}

/** Letters and numbers, at least 8 characters — the same rule the server enforces. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  return null;
}
