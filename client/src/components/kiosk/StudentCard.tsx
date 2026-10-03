import { initials } from './Search';

export function StudentCard({ name, schoolCollege, className, phone, registrationType }: {
  name: string;
  schoolCollege: string;
  className: string | null;
  phone: string;
  registrationType: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-niat-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-9">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-niat-maroon via-niat-maroon to-niat-gold" />
      <div className="flex items-center gap-4 sm:gap-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-niat-maroon text-lg font-extrabold text-white shadow-[var(--shadow-soft)] sm:h-20 sm:w-20 sm:rounded-2xl sm:text-3xl">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-niat-muted sm:text-xs">Participant</div>
          <div className="mt-0.5 text-xl font-extrabold uppercase leading-tight tracking-tight text-niat-text sm:mt-1 sm:text-3xl">{name}</div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:mt-7 sm:gap-5">
        <Detail label="School / College" value={schoolCollege || '—'} wide />
        {className && <Detail label="Class" value={className} />}
        <Detail label="Phone" value={<span className="font-mono tracking-wider">{phone}</span>} />
      </dl>

      <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-niat-cream px-3.5 py-1.5 text-xs font-bold text-niat-maroon ring-1 ring-niat-gold/50 sm:mt-7 sm:px-4 sm:py-2 sm:text-sm">
        <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-niat-maroon text-[11px] text-white">✓</span>
        {registrationType === 'walk_in' ? 'Registered today for AI Bootcamp' : 'Registered for AI Bootcamp'}
      </div>
    </div>
  );
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-niat-muted sm:text-xs">{label}</dt>
      <dd className="mt-0.5 text-base font-medium leading-snug text-niat-text sm:mt-1 sm:text-lg">{value}</dd>
    </div>
  );
}
