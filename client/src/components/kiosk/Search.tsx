import { forwardRef } from 'react';
import type { SearchResult } from '../../lib/api';

type SearchBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmitSearch?: () => void;
  onClear: () => void;
  busy?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
};

export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { value, onChange, onKeyDown, onSubmitSearch, onClear, busy, onFocus, onBlur },
  ref,
) {
  return (
    <div className="w-full text-left">
      <label htmlFor="student-search-input" className="mb-2 block text-base font-bold text-niat-text sm:text-lg">
        Find your registration
      </label>

      <div className="group relative w-full">
        {/* Large search icon */}
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-niat-muted/70 transition-colors duration-200 group-focus-within:text-niat-maroon sm:left-5">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 sm:h-7 sm:w-7"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </div>

        <input
          id="student-search-input"
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          enterKeyHint="search"
          placeholder="Enter your name or mobile number"
          aria-label="Find your registration by entering your name or mobile number"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-[var(--radius-input)] border-2 border-niat-line bg-white/95 py-4 pl-13 pr-24 text-base text-niat-text shadow-[var(--shadow-card)] outline-none transition-all duration-200 placeholder:text-niat-muted/60 focus:border-niat-maroon focus:ring-4 focus:ring-niat-maroon/10 sm:py-5 sm:pl-16 sm:pr-28 sm:text-xl"
        />

        {/* Right side controls: Loading spinner, Clear button, Desktop search button */}
        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 sm:right-3">
          {busy && (
            <span
              className="mr-1 inline-block h-5 w-5 animate-spin rounded-full border-2 border-niat-maroon/30 border-t-niat-maroon"
              aria-label="Searching..."
            />
          )}

          {value && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search text"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-xl text-niat-muted transition-colors hover:bg-niat-pink hover:text-niat-maroon sm:h-9 sm:w-9"
            >
              &times;
            </button>
          )}

          <button
            type="button"
            onClick={onSubmitSearch}
            aria-label="Submit search"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-niat-maroon text-white shadow-xs transition-all hover:bg-niat-maroon-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-maroon/30 active:scale-95 sm:h-11 sm:w-11"
          >
            <span aria-hidden="true" className="text-lg font-bold leading-none sm:text-xl">
              &rarr;
            </span>
          </button>
        </div>
      </div>

      {/* Helper tip badge */}
      <div className="mt-2.5 flex items-center justify-center sm:justify-start">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-niat-line bg-white/80 px-3 py-1 text-xs font-medium text-niat-muted shadow-2xs">
          <span aria-hidden="true" className="text-niat-gold">
            &#9889;
          </span>
          <span>Mobile number gives the fastest result</span>
        </div>
      </div>
    </div>
  );
});

/** Single registration found card matching Section 4 specification */
export function SingleRegistrationFoundCard({
  result,
  eventName = 'AI Bootcamp 2026',
  eventDate,
  onViewRegistration,
  onSearchAgain,
}: {
  result: SearchResult;
  eventName?: string;
  eventDate?: string;
  onViewRegistration: () => void;
  onSearchAgain?: () => void;
}) {
  const batchInfo = eventDate
    ? `Hyderabad · ${new Date(`${eventDate}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
    : 'Hyderabad · Oct 2026';

  return (
    <div className="w-full animate-fade-up rounded-[var(--radius-card)] border-2 border-emerald-500/40 bg-white p-5 text-left shadow-[var(--shadow-card)] ring-4 ring-emerald-500/5 sm:p-7">
      {/* Header status badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-niat-line/70 pb-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-600/30">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-600 text-[10px] text-white" aria-hidden="true">
            &#10003;
          </span>
          <span>Registration found</span>
        </div>

        {result.seatCode && (
          <span className="inline-flex items-center gap-1 rounded-full bg-niat-cream px-3 py-1 text-xs font-bold text-niat-maroon ring-1 ring-niat-gold/60">
            <span>Seat Code:</span>
            <span className="font-mono font-extrabold">{result.seatCode}</span>
            <span aria-hidden="true">&#10003;</span>
          </span>
        )}
      </div>

      {/* Student Details */}
      <div className="mt-4 flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-niat-pink text-base font-extrabold text-niat-maroon sm:h-14 sm:w-14 sm:text-xl">
          {initials(result.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-niat-text sm:text-2xl">{result.name}</h2>
          <div className="mt-1 flex items-center gap-2 font-mono text-sm tracking-wider text-niat-muted">
            <span aria-hidden="true">&#128222;</span>
            <span>{result.phone}</span>
          </div>
        </div>
      </div>

      {/* Event and institution info */}
      <div className="mt-5 grid gap-2.5 rounded-xl border border-niat-line/80 bg-niat-warm-white p-3.5 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-niat-muted">Event</div>
          <div className="mt-0.5 text-sm font-semibold text-niat-text">{eventName}</div>
          <div className="text-xs text-niat-muted">{batchInfo}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-niat-muted">Institution / Batch</div>
          <div className="mt-0.5 text-sm font-semibold text-niat-text truncate">{result.schoolCollege || 'NIAT Student'}</div>
          {result.className && <div className="text-xs text-niat-muted">{result.className}</div>}
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onViewRegistration}
          className="group inline-flex flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-niat-maroon px-5 py-3.5 text-base font-bold text-white shadow-[var(--shadow-soft)] transition-all hover:bg-niat-maroon-dark hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-maroon/30"
        >
          <span>{result.seatCode ? 'View my seat pass' : 'View my registration'}</span>
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            &rarr;
          </span>
        </button>

        {onSearchAgain && (
          <button
            type="button"
            onClick={onSearchAgain}
            className="cursor-pointer rounded-xl border border-niat-line bg-white px-4 py-3 text-sm font-semibold text-niat-muted transition-colors hover:bg-niat-cream/50 hover:text-niat-text"
          >
            Not you?
          </button>
        )}
      </div>
    </div>
  );
}

/** Multiple matches card for candidate selection */
export function SearchResultCard({
  result,
  index,
  active,
  onSelect,
  onHover,
}: {
  result: SearchResult;
  index: number;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{ '--i': index } as React.CSSProperties}
      className={`stagger flex w-full animate-fade-up cursor-pointer items-center gap-3.5 rounded-2xl border-2 bg-white px-4 py-3.5 text-left transition-all duration-150 sm:gap-4 sm:px-6 sm:py-4 ${
        active
          ? 'border-niat-maroon shadow-[var(--shadow-soft)] ring-2 ring-niat-maroon/10'
          : 'border-transparent shadow-[var(--shadow-card)] hover:border-niat-line'
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold transition-colors sm:h-12 sm:w-12 sm:text-base ${
          active ? 'bg-niat-maroon text-white' : 'bg-niat-pink text-niat-maroon'
        }`}
      >
        {initials(result.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug text-niat-text sm:text-lg">{result.name}</span>
        <span className="mt-0.5 block truncate text-xs text-niat-muted sm:text-sm">
          {result.schoolCollege || '—'}
          {result.className ? ` · Class ${result.className}` : ''}
        </span>
        <span className="mt-1 flex items-center gap-2 font-mono text-xs text-niat-muted/80">
          <span>{result.phone}</span>
        </span>
      </span>

      {result.seatCode ? (
        <span className="shrink-0 rounded-full bg-niat-cream px-3 py-1 text-xs font-bold text-niat-maroon ring-1 ring-niat-gold/50 sm:text-sm">
          Seat {result.seatCode} &#10003;
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`shrink-0 text-xl font-bold transition-all sm:text-2xl ${
            active ? 'translate-x-1 text-niat-maroon' : 'text-niat-line'
          }`}
        >
          &rarr;
        </span>
      )}
    </button>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
