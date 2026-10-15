import logo from '../../assets/niat-logo.png';
import { Shield } from '../checkin/CheckinUI';

const monthYear = (date?: string) =>
  date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase() : '';

export function KioskHeader({ date, place, onHome, minimal }: { date?: string; place?: string; onHome?: () => void; minimal?: boolean }) {
  // Student's own phone: just the shield, so nothing competes with the seat.
  if (minimal) {
    return (
      <header className="relative z-10 flex justify-center px-4 pb-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <Shield size={44} />
      </header>
    );
  }
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 pb-2 pt-3 sm:px-8 sm:py-5">
      <button onClick={onHome} className="rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50" aria-label="Back to start">
        <img src={logo} alt="NIAT — NxtWave of Innovation in Advanced Technologies" className="h-8 w-auto sm:h-11" />
      </button>
      <div className="text-right leading-tight">
        <div className="text-xs font-extrabold tracking-[0.2em] sm:text-base text-niat-maroon ">AI BOOTCAMP</div>
        {(date || place) && (
          <div className="text-xs font-semibold tracking-[0.18em] text-niat-muted">
            {[place?.toUpperCase(), monthYear(date)].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </header>
  );
}

export function KioskFooter() {
  return (
    <footer className="relative z-10 py-5 text-center text-xs font-medium tracking-wide text-niat-muted/80">
      Powered by <span className="font-bold text-niat-maroon">NIAT</span>
    </footer>
  );
}

/** Full-page branded frame for every participant screen. */
export function KioskShell({ children, date, place, onHome, minimal }: {
  children: React.ReactNode;
  date?: string;
  place?: string;
  onHome?: () => void;
  /** Shield-only header (student's phone). */
  minimal?: boolean;
}) {
  return (
    <div className="niat-backdrop min-h-dvh-screen relative flex flex-col overflow-hidden">
      <KioskHeader date={date} place={place} onHome={onHome} minimal={minimal} />
      <main className="relative z-10 flex flex-1 flex-col px-4 pb-6 sm:px-8">{children}</main>
      <KioskFooter />
    </div>
  );
}

/** Calm full-card message for states where there is nothing to do yet (closed, waiting, not found). */
export function CalmCard({ icon, title, message, action }: { icon: string; title: string; message: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 w-full max-w-xl animate-scale-in rounded-[var(--radius-card)] border border-niat-line bg-white/90 p-8 text-center shadow-[var(--shadow-card)] backdrop-blur sm:mt-20 sm:p-10">
      <div className="text-5xl" aria-hidden>{icon}</div>
      <div className="eyebrow mt-5">AI Bootcamp</div>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{title}</h1>
      <div className="mx-auto mt-3 max-w-md text-lg text-niat-muted">{message}</div>
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
