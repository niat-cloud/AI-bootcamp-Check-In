import { forwardRef } from 'react';

export function LoadingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      {label}
      <span className="inline-flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="loading-dot inline-block h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
    </span>
  );
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  loadingLabel?: string;
  arrow?: boolean;
  size?: 'lg' | 'md';
};

/** Brand call-to-action: lifts on hover, arrow nudges right, shows animated dots while loading. */
export const CtaButton = forwardRef<HTMLButtonElement, Props>(function CtaButton(
  { variant = 'primary', loading, loadingLabel = 'One moment', arrow = true, size = 'lg', className = '', children, disabled, ...rest },
  ref,
) {
  const base = 'group inline-flex items-center justify-center gap-3 font-bold transition-all duration-200 ease-[var(--ease-out-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/60 disabled:cursor-not-allowed cursor-pointer';
  const sizes = size === 'lg' ? 'rounded-2xl px-8 py-4 text-lg sm:text-xl min-h-[60px]' : 'rounded-xl px-5 py-3 text-base min-h-[48px]';
  const variants = variant === 'primary'
    ? 'bg-niat-maroon text-white shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:bg-niat-maroon-dark hover:shadow-[var(--shadow-lift)] active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0'
    : 'bg-white/70 text-niat-maroon ring-1 ring-niat-line backdrop-blur hover:bg-white hover:ring-niat-maroon/30 disabled:opacity-50';

  return (
    <button ref={ref} disabled={disabled || loading} className={`${base} ${sizes} ${variants} ${className}`} {...rest}>
      {loading ? <LoadingDots label={loadingLabel} /> : (
        <>
          <span>{children}</span>
          {arrow && <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>}
        </>
      )}
    </button>
  );
});
