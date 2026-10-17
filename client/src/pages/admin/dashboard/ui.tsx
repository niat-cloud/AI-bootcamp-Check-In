import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** One dashboard section. Every card shares the same padding, title size and spacing. */
export function Card({ title, subtitle, actions, children, className = '' }: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex min-w-0 flex-col ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-niat-text">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-niat-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-niat-warm-white px-4 py-8 text-center text-sm text-niat-muted">{children}</p>;
}

/** A small text link to another admin page. */
export function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-semibold text-niat-maroon hover:underline">
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

/** Mutually exclusive options (tabs inside a card, list filters). */
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-stone-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === o.value ? 'bg-white text-niat-text shadow-xs' : 'text-niat-muted hover:text-niat-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: ReactNode; swatch: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-niat-muted">
      {items.map((item, i) => (
        <li key={i} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${item.swatch}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** The two-series bar used by the funnels: the light bar is everyone registered, the dark part who arrived. */
export const REGISTERED_SWATCH = 'bg-niat-maroon/20';
export const ARRIVED_SWATCH = 'bg-niat-maroon';

export function RegisteredArrivedBar({ registered, arrived, max }: { registered: number; arrived: number; max: number }) {
  return (
    <div className="h-2.5 w-full" aria-hidden="true">
      <div className={`relative h-full rounded-r ${REGISTERED_SWATCH} transition-[width] duration-500`}
        style={{ width: `${max > 0 ? (registered / max) * 100 : 0}%` }}>
        <div className={`absolute inset-y-0 left-0 rounded-r ${ARRIVED_SWATCH} transition-[width] duration-500`}
          style={{ width: `${registered > 0 ? (arrived / registered) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
