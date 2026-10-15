import { forwardRef, useId, useState } from 'react';
import logo from '../../assets/niat-logo.png';

/** The NIAT shield, cropped from the original logo artwork (the shield is the left part of the file). */
export function Shield({ size = 64, tone = 'maroon', className = '' }: { size?: number; tone?: 'maroon' | 'white'; className?: string }) {
  return (
    <span className={`inline-block shrink-0 overflow-hidden ${className}`} style={{ height: size, width: Math.round(size * 0.78) }}>
      <img src={logo} alt="NIAT" draggable={false}
        className="block h-full w-auto max-w-none select-none"
        style={tone === 'white' ? { filter: 'brightness(0) invert(1)' } : undefined} />
    </span>
  );
}

const MOTES = [
  { left: '18%', top: '9%', s: 14, d: 13, x: 10, y: -22 },
  { left: '86%', top: '16%', s: 9, d: 16, x: -14, y: 18 },
  { left: '8%', top: '62%', s: 7, d: 18, x: 16, y: -16 },
  { left: '88%', top: '84%', s: 16, d: 15, x: -10, y: -24 },
];

/** Ivory room with corner glows, two rose-gold curves and a few slow-drifting points of light. */
function Backdrop() {
  return (
    <div className="checkin-backdrop" aria-hidden>
      <svg className="checkin-curves" viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <linearGradient id="checkin-rose" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E9B9A6" stopOpacity="0" />
            <stop offset="0.45" stopColor="#D9A48F" stopOpacity="0.9" />
            <stop offset="1" stopColor="#E9B9A6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-30 210 C 60 190, 110 120, 150 40 S 210 -40, 260 -60" stroke="url(#checkin-rose)" strokeWidth="1.2" />
        <path d="M-40 760 C 70 700, 150 790, 250 760 S 380 650, 460 700" stroke="url(#checkin-rose)" strokeWidth="1.2" />
        <circle cx="372" cy="70" r="70" stroke="#D9A48F" strokeOpacity="0.35" strokeWidth="1" />
      </svg>
      {MOTES.map((m, i) => (
        <span key={i} className="checkin-mote"
          style={{ left: m.left, top: m.top, '--s': `${m.s}px`, '--d': `${m.d}s`, '--x': `${m.x}px`, '--y': `${m.y}px` } as React.CSSProperties} />
      ))}
    </div>
  );
}

function HelpLink() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="checkin-link mt-2 text-xs" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        Need help?
      </button>
      {open && (
        <p id={id} className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-[var(--checkin-muted)]">
          Find an organizer at the help desk near the entrance and show them this screen.
        </p>
      )}
    </>
  );
}

/**
 * Full-height mobile frame for the event page: backdrop, a single centered column (360–430px), and
 * a quiet footer that changes with the step.
 */
export function CheckinShell({ children, footer = 'entry' }: {
  children: React.ReactNode;
  footer?: 'entry' | 'help' | 'none';
}) {
  return (
    <div className="checkin-app flex flex-col">
      <Backdrop />
      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pt-[max(1.75rem,env(safe-area-inset-top))]">
        {children}
      </main>
      {footer !== 'none' && (
        <footer className="mx-auto w-full max-w-[430px] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-center">
          <div aria-hidden className="mx-auto mb-4 h-px w-24 bg-gradient-to-r from-transparent via-[var(--checkin-rose)] to-transparent opacity-70" />
          {footer === 'entry' ? (
            <>
              <p className="text-xs font-bold text-[var(--checkin-ink)]">Official NIAT Event Experience</p>
              <p className="mt-1 text-xs text-[var(--checkin-muted)]">Your mobile number is used to locate your event registration.</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-[var(--checkin-ink)]">Powered by NIAT</p>
              <HelpLink />
            </>
          )}
        </footer>
      )}
    </div>
  );
}

/** Pin + date row under the hero, as in the brand reference. */
export function EventMeta({ place, date }: { place: string; date: string }) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-white/60 px-4 py-2 text-sm font-bold text-[var(--checkin-ink)] ring-1 ring-[var(--checkin-line)] backdrop-blur">
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-[var(--checkin-maroon)]" fill="currentColor">
          <path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
        </svg>
        {place}
      </span>
      <span aria-hidden className="h-4 w-px bg-[var(--checkin-line)]" />
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-[var(--checkin-maroon)]" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
        {date}
      </span>
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string; arrow?: boolean };

/** Maroon pill. While loading it shows a spinner, keeps its size and ignores further taps. */
export const CheckinButton = forwardRef<HTMLButtonElement, ButtonProps>(function CheckinButton(
  { loading, loadingLabel = 'One moment', arrow = true, children, disabled, className = '', ...rest }, ref,
) {
  return (
    <button ref={ref} className={`checkin-cta ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <span className="inline-flex items-center gap-2.5" role="status">
          <span aria-hidden className="spin h-5 w-5 rounded-full border-2 border-white/35 border-t-white" />
          {loadingLabel}
        </span>
      ) : (
        <>
          <span>{children}</span>
          {arrow && (
            <svg aria-hidden viewBox="0 0 24 24" className="checkin-arrow h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </>
      )}
    </button>
  );
});

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; prefix?: string };

/** Labelled input in the check-in style. The label sits above the field so the layout never jumps. */
export const CheckinField = forwardRef<HTMLInputElement, FieldProps>(function CheckinField({ label, error, hint, prefix, className = '', ...rest }, ref) {
  const id = useId();
  return (
    <div className={`text-left ${className}`}>
      <label htmlFor={id} className="mb-1.5 block pl-1 text-[13px] font-bold text-[var(--checkin-ink)]">{label}</label>
      <div className="checkin-field" data-invalid={Boolean(error) || undefined}>
        {prefix && (
          <span className="flex items-center border-r border-[var(--checkin-line)] pl-4 pr-3 text-[17px] font-bold text-[var(--checkin-ink)]" aria-hidden>{prefix}</span>
        )}
        <input ref={ref} id={id} aria-invalid={Boolean(error) || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined}
          className="h-14 px-4 text-[17px] font-semibold" {...rest} />
      </div>
      {(error || hint) && (
        <p id={`${id}-msg`} className={`mt-1.5 pl-1 text-[13px] ${error ? 'font-semibold text-[var(--checkin-maroon)]' : 'text-[var(--checkin-muted)]'}`}>{error ?? hint}</p>
      )}
    </div>
  );
});

/** Real-status waiting state: the shield inside a turning arc, with what the system is doing right now. */
export function Seeker({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center" role="status" aria-live="polite">
      <div className="checkin-seeker checkin-enter"><Shield size={58} /></div>
      <p className="checkin-enter mt-8 text-xl font-extrabold tracking-tight" style={{ '--i': 1 } as React.CSSProperties}>{message}</p>
    </div>
  );
}

/** Calm full-screen message for states with one clear next step. */
export function StateCard({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center pb-6">
      <div className="checkin-glass checkin-enter px-6 py-8 text-center">
        <Shield size={52} className="mx-auto" />
        <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        <div className="mx-auto mt-3 max-w-[32ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">{children}</div>
        {actions && <div className="mt-7 space-y-3">{actions}</div>}
      </div>
    </div>
  );
}

/** Inline message, e.g. a network error under the form. */
export function CheckinNotice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="checkin-enter mt-4 flex items-start justify-between gap-3 rounded-2xl bg-[var(--checkin-blush)] px-4 py-3 text-left text-sm font-semibold text-[#7A0619] ring-1 ring-[rgb(165_9_37/0.15)]">
      <span>{children}</span>
      {action}
    </div>
  );
}
