import { Link } from 'react-router-dom';
import logo from '../../assets/niat-logo.png';

const POINTS = [
  { title: 'Live check-in', text: 'Every arrival, seat and waiting student as it happens.' },
  { title: 'Rooms & teams', text: 'Tables fill in order, so rooms stay balanced.' },
  { title: 'Project scoring', text: 'AI scores every submission; you pick the winners.' },
];

/**
 * The account screens' layout: a maroon brand panel beside the form on wide screens, the form alone on
 * phones. Shared by sign-in, request access and set a new password.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F7F6F3]">
      <aside className="relative hidden w-[44%] max-w-[560px] flex-col justify-between overflow-hidden bg-niat-maroon p-10 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-niat-gold/10 blur-3xl" aria-hidden="true" />
        <Link to="/" className="relative flex w-fit items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white p-1.5 shadow-lg">
            <span className="block h-full w-[30px] overflow-hidden"><img src={logo} alt="NIAT" className="block h-full w-auto max-w-none" /></span>
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-extrabold">AI Bootcamp</span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-niat-gold-light">Admin console</span>
          </span>
        </Link>
        <div className="relative">
          <h2 className="max-w-sm text-[34px] font-extrabold leading-[1.1] tracking-tight">Run the whole bootcamp day from one place.</h2>
          <ul className="mt-8 space-y-5">
            {POINTS.map((pt, i) => (
              <li key={pt.title} className="flex gap-3.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold ring-1 ring-white/25">{i + 1}</span>
                <span>
                  <span className="block font-bold">{pt.title}</span>
                  <span className="block text-sm text-white/75">{pt.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">NIAT · NxtWave of Innovation in Advanced Technologies</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-12">{children}</main>
    </div>
  );
}

/** Shared frame for the account screens (request access, set a new password). */
export function AuthFrame({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <AuthShell>
      <div className="w-full max-w-md animate-scale-in">
        <AuthHeading title={title} subtitle={subtitle} />
        <div className="mt-7 rounded-2xl border border-niat-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-7">{children}</div>
        {footer && <div className="mt-5 text-center text-xs font-semibold text-niat-muted">{footer}</div>}
      </div>
    </AuthShell>
  );
}

/** Logo (phones only: the brand panel carries it on wide screens), eyebrow, title and one line. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center lg:text-left">
      <Link to="/" className="inline-block lg:hidden">
        <img src={logo} alt="NIAT" className="mx-auto h-11 w-auto object-contain" />
      </Link>
      <div className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-niat-maroon lg:mt-0">NIAT AI Bootcamp</div>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-niat-text sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-niat-muted">{subtitle}</p>
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
