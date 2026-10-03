import { forwardRef, useId } from 'react';

type FloatingInputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; valid?: boolean };

/** Premium input card with a label that floats above the value; a check pops in once the value is valid. */
export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(function FloatingInput({ label, error, hint, valid, className = '', ...rest }, ref) {
  const id = useId();
  return (
    <div className={className}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          placeholder=" "
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={`peer w-full rounded-[var(--radius-input)] border-2 bg-white py-2.5 pl-4 pr-12 pt-6 text-base sm:py-3 sm:pl-5 sm:pt-7 sm:text-lg text-niat-text outline-none transition-all duration-200 focus:shadow-[0_0_0_5px_rgb(167_25_30/0.08)] ${
            error ? 'border-niat-maroon/70' : valid ? 'border-emerald-500/60 focus:border-emerald-600' : 'border-niat-line focus:border-niat-maroon'}`}
          {...rest}
        />
        {valid && !error && (
          <span aria-hidden className="check-pop absolute right-4 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
        )}
        <label htmlFor={id}
          className="pointer-events-none absolute left-4 top-2 text-[11px] sm:left-5 sm:top-2.5 sm:text-xs font-bold uppercase tracking-[0.14em] text-niat-muted transition-all duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-[0.14em] peer-focus:text-niat-maroon">
          {label}
        </label>
      </div>
      {(error || hint) && (
        <p id={`${id}-msg`} className={`mt-1.5 pl-1 text-sm ${error ? 'font-semibold text-niat-maroon' : 'text-niat-muted'}`}>
          {error ? `⚠ ${error}` : hint}
        </p>
      )}
    </div>
  );
});

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={`animate-fade-up rounded-2xl px-5 py-4 text-left font-medium ${
        tone === 'error' ? 'bg-niat-pink text-niat-maroon-dark ring-1 ring-niat-maroon/20' : 'bg-niat-cream text-niat-text ring-1 ring-niat-gold/40'}`}>
      {children}
    </div>
  );
}

export function EmptyState({ query, onRegister }: { query: string; onRegister: () => void }) {
  return (
    <div className="animate-fade-up rounded-[var(--radius-card)] border-2 border-dashed border-niat-line bg-white/80 px-6 py-9 text-center backdrop-blur">
      <div className="text-4xl" aria-hidden>🔎</div>
      <h2 className="mt-3 text-2xl font-extrabold">Can't find yourself?</h2>
      <p className="mx-auto mt-2 max-w-sm text-niat-muted">
        No one matches “{query}” yet. Don't worry — you can register right here.
      </p>
      {/* The parent handles the click; a ref is not needed here. */}
      <RegisterButton onClick={onRegister} />
    </div>
  );
}

function RegisterButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="group mt-6 inline-flex cursor-pointer items-center gap-3 rounded-2xl bg-niat-maroon px-7 py-4 text-lg font-bold text-white shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-niat-maroon-dark hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/60">
      Register as a New Student
      <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
    </button>
  );
}
