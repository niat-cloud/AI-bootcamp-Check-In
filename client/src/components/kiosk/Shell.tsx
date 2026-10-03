import logo from '../../assets/niat-logo.png';

const monthYear = (date?: string) =>
  date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase() : '';

export function KioskHeader({ date, onHome }: { date?: string; onHome?: () => void }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 pb-2 pt-3 sm:px-8 sm:py-5">
      <button onClick={onHome} className="rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50" aria-label="Back to start">
        <img src={logo} alt="NIAT — NxtWave of Innovation in Advanced Technologies" className="h-8 w-auto sm:h-11" />
      </button>
      <div className="text-right leading-tight">
        <div className="text-xs font-extrabold tracking-[0.2em] sm:text-base text-niat-maroon ">AI BOOTCAMP</div>
        {date && <div className="text-xs font-semibold tracking-[0.18em] text-niat-muted">{monthYear(date)}</div>}
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
export function KioskShell({ children, date, onHome }: { children: React.ReactNode; date?: string; onHome?: () => void }) {
  return (
    <div className="niat-backdrop min-h-dvh-screen relative flex flex-col overflow-hidden">
      <KioskHeader date={date} onHome={onHome} />
      <main className="relative z-10 flex flex-1 flex-col px-4 pb-6 sm:px-8">{children}</main>
      <KioskFooter />
    </div>
  );
}
