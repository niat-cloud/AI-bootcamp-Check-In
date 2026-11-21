import type { ReactNode } from 'react';

/**
 * Small building blocks shared by the admin pages, so people, dates and empty states look the same
 * everywhere. Colours come from the NIAT tokens only.
 */

const AVATAR_TONES = [
  'bg-niat-pink text-niat-maroon',
  'bg-niat-cream text-[#7A4B00]',
  'bg-stone-100 text-stone-700',
  'bg-emerald-50 text-emerald-800',
  'bg-sky-50 text-sky-800',
];

export function initials(text: string): string {
  return text.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

/** A person's initials in a soft circle. The tone is stable per name, so a person keeps their colour. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  const dims = size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs';
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold ${dims} ${tone}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A tear-off calendar leaf for an event's YYYY-MM-DD date. */
export function DateTile({ date, tone = 'default' }: { date: string; tone?: 'default' | 'live' | 'muted' }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const head = tone === 'live' ? 'bg-emerald-700' : tone === 'muted' ? 'bg-stone-400' : 'bg-niat-maroon';
  return (
    <div className="w-14 shrink-0 overflow-hidden rounded-xl border border-niat-line bg-white text-center shadow-sm" aria-hidden="true">
      <div className={`py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white ${head}`}>{MONTHS[d.getMonth()]}</div>
      <div className="pt-1 text-[22px] font-extrabold leading-none tabular-nums text-niat-text">{d.getDate()}</div>
      <div className="pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-niat-muted">{DAYS[d.getDay()]}</div>
    </div>
  );
}

/** A friendly empty state: icon, one line of what this is, and the next step. */
export function EmptyState({ icon, title, children, action }: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-niat-line bg-white/60 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-niat-pink text-niat-maroon">{icon}</span>
      <h3 className="mt-3 text-base font-bold text-niat-text">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-niat-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A thin progress meter with an accessible label. */
export function Meter({ value, max, label, tone = 'maroon' }: { value: number; max: number; label: string; tone?: 'maroon' | 'green' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100" role="meter" aria-label={label}
      aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={`h-full rounded-full transition-[width] duration-700 ${tone === 'green' ? 'bg-emerald-600' : 'bg-niat-maroon'}`}
        style={{ width: `${pct}%` }} />
    </div>
  );
}

/** "98765 43210": Indian mobile numbers read easier in two groups of five. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Line icons in the same 24px style as the sidebar. */
export const Icons = {
  calendar: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>,
  pin: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 12 2.5a7 7 0 0 1 7 7C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  shield: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>,
  upload: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M16 8l-4-4-4 4M12 4v12" /></svg>,
  download: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1M8 12l4 4 4-4M12 4v12" /></svg>,
  sheet: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></svg>,
  file: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  users: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>,
  check: <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  link: <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke} aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>,
  plus: <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  arrow: <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke} aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
};
