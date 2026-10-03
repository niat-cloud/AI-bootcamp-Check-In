import { useEffect, useState } from 'react';

/** Pop-up shown while a seat is being reserved: steps tick off one by one while the request runs. */
export function ProgressPopup({ title, steps }: { title: string; steps: string[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    // Advance through all but the last step; the last one spins until the request finishes.
    const timer = setInterval(() => setCurrent((c) => Math.min(c + 1, steps.length - 1)), 320);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-niat-text/25 p-4 backdrop-blur-sm sm:items-center"
      style={{ animation: 'fade-in 200ms ease-out both' }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-up pb-safe w-full max-w-sm rounded-[28px] bg-white px-7 pt-7 shadow-[var(--shadow-lift)]">
        <div className="flex items-center gap-3">
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-niat-maroon text-white">
            <svg viewBox="0 0 24 24" className="spin h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          </span>
          <div className="text-left">
            <div className="eyebrow">AI Bootcamp</div>
            <div className="text-xl font-extrabold">{title}</div>
          </div>
        </div>
        <ul className="mt-6 space-y-3 pb-3 text-left">
          {steps.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={step} className={`flex items-center gap-3 text-base transition-opacity duration-200 ${i > current ? 'opacity-35' : 'opacity-100'}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  done ? 'check-pop bg-emerald-600 text-white' : active ? 'bg-niat-cream text-niat-maroon ring-2 ring-niat-gold' : 'bg-stone-100 text-niat-muted'}`}>
                  {done ? '✓' : active ? <span className="loading-dot h-2 w-2 rounded-full bg-niat-maroon" /> : i + 1}
                </span>
                <span className={active ? 'font-bold text-niat-text' : 'font-medium text-niat-muted'}>{step}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
