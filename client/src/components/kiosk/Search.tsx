import { forwardRef } from 'react';
import type { SearchResult } from '../../lib/api';

type SearchBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClear: () => void;
  busy?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox({ value, onChange, onKeyDown, onClear, busy, onFocus, onBlur }, ref) {
  return (
    <div className="group relative">
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
        className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-niat-muted/70 transition-colors duration-200 group-focus-within:text-niat-maroon sm:left-6">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        enterKeyHint="search"
        placeholder="Search by name or phone number"
        aria-label="Search by name or phone number"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-[var(--radius-input)] border-2 border-niat-line bg-white/95 py-4 pl-14 pr-14 text-lg text-niat-text shadow-[var(--shadow-card)] outline-none transition-all duration-200 placeholder:text-niat-muted/60 focus:border-niat-maroon focus:shadow-[0_0_0_6px_rgb(167_25_30/0.08),var(--shadow-soft)] sm:py-6 sm:pl-16 sm:text-2xl"
      />
      {busy && value && (
        <span className="absolute right-14 top-1/2 h-2 w-2 -translate-y-1/2 animate-pulse rounded-full bg-niat-gold" aria-hidden />
      )}
      {value && (
        <button onClick={onClear} aria-label="Clear search"
          className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-2xl text-niat-muted transition-colors hover:bg-niat-pink hover:text-niat-maroon sm:right-4">
          ×
        </button>
      )}
    </div>
  );
});

export function SearchResultCard({ result, index, active, onSelect, onHover }: {
  result: SearchResult;
  index: number;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{ '--i': index } as React.CSSProperties}
      className={`stagger flex w-full animate-fade-up cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white px-3.5 py-3 text-left transition-all duration-150 sm:gap-4 sm:px-6 sm:py-4 ${
        active ? 'border-niat-maroon shadow-[var(--shadow-soft)]' : 'border-transparent shadow-[var(--shadow-card)] hover:border-niat-line'}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors sm:h-12 sm:w-12 sm:text-lg ${active ? 'bg-niat-maroon text-white' : 'bg-niat-pink text-niat-maroon'}`}>
        {initials(result.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug text-niat-text sm:truncate sm:text-xl">{result.name}</span>
        {/* Phones: school on its own line (wraps instead of being cut off); class + phone underneath. */}
        <span className="mt-0.5 block text-sm leading-snug text-niat-muted sm:truncate sm:text-base">
          {result.schoolCollege || '—'}
          <span className="hidden sm:inline">{result.className ? ` · Class ${result.className}` : ''}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-niat-muted/80 sm:text-sm">
          {result.className && <span className="sm:hidden">Class {result.className}</span>}
          {result.className && <span className="sm:hidden" aria-hidden>·</span>}
          <span className="font-mono tracking-wider">{result.phone}</span>
        </span>
        {result.seatCode && (
          <span className="mt-1.5 inline-block rounded-full bg-niat-cream px-2.5 py-0.5 text-xs font-bold text-niat-maroon ring-1 ring-niat-gold/50 sm:hidden">
            Seat {result.seatCode} ✓
          </span>
        )}
      </span>
      {result.seatCode ? (
        <span className="hidden shrink-0 rounded-full bg-niat-cream px-3 py-1 text-sm font-bold text-niat-maroon ring-1 ring-niat-gold/50 sm:inline-block">
          Seat {result.seatCode} ✓
        </span>
      ) : (
        <span aria-hidden className={`shrink-0 text-xl transition-all sm:text-2xl ${active ? 'translate-x-0.5 text-niat-maroon' : 'text-niat-line'}`}>→</span>
      )}
    </button>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
