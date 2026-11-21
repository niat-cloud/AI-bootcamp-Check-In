import { useEffect, useState } from 'react';
import { api, downloadFile, getAdminToken, type EventInfo } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';
import { StatTile } from './dashboard/ui';
import { Icons } from './kit';

type Format = 'xlsx' | 'csv';

const FORMATS: { id: Format; title: string; ext: string; text: string; icon: React.ReactNode }[] = [
  { id: 'xlsx', title: 'Excel workbook', ext: '.xlsx', text: 'Best for sharing, sorting and filtering in Excel.', icon: Icons.sheet },
  { id: 'csv', title: 'CSV file', ext: '.csv', text: 'Plain text for Google Sheets or any other tool.', icon: Icons.file },
];

const COLUMNS: { group: string; items: string[] }[] = [
  { group: 'Student', items: ['Name', 'Phone', 'School/College', 'Class', 'Stream', 'Lunch', 'Coming From'] },
  { group: 'Parent', items: ['Parent Name', 'Parent Phone'] },
  { group: 'Seating', items: ['Status', 'Room', 'Team', 'Seat', 'Check-in Time'] },
  { group: 'Registration', items: ['Source', 'Registration Type'] },
];

export default function Export() {
  const { event } = useAdmin();
  const [downloading, setDownloading] = useState<Format | null>(null);
  const [done, setDone] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ registered: number; seated: number } | null>(null);

  // The selected event carries no counts, so read them from the events list.
  useEffect(() => {
    if (!event) return;
    let live = true;
    api<EventInfo[]>('/events').then((list) => {
      const e = list.find((x) => x.id === event.id);
      if (live && e) setCounts({ registered: e.participantCount ?? 0, seated: e.checkedInCount ?? 0 });
    }).catch(() => {});
    return () => { live = false; };
  }, [event]);

  if (!event) return <NoEvent />;

  const token = getAdminToken();
  const baseName = `${event.name.replace(/[^\w-]+/g, '_')}-${event.date}`;

  const handleDownload = async (format: Format) => {
    setDownloading(format);
    setDone(null);
    setError(null);
    try {
      await downloadFile(`/events/${event.id}/export?format=${format}`, `${baseName}.${format}`);
      setDone(format);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to download file. Please verify you are logged in.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <PageHeader title="Export" subtitle={`The full attendance and seating roster of “${event.name}”, one row per student.`} />

      <dl className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Students" value={counts ? counts.registered : '…'} hint="Everyone registered for this event" />
        <StatTile label="Checked in" value={counts ? counts.seated : '…'} hint="With room, team and seat" tone={counts?.seated ? 'good' : undefined} />
        <StatTile label="Not arrived" value={counts ? Math.max(0, counts.registered - counts.seated) : '…'} hint="Included with status “not arrived”" />
      </dl>

      {error && (
        <div className="mb-5 rounded-xl border border-niat-maroon/20 bg-niat-pink px-4 py-3 text-sm font-medium text-niat-maroon" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {FORMATS.map((f) => {
          const busy = downloading === f.id;
          return (
            <button key={f.id} type="button" onClick={() => handleDownload(f.id)} disabled={downloading !== null}
              className="group flex w-full min-w-0 cursor-pointer items-start gap-4 rounded-2xl border border-niat-line bg-white p-4 text-left sm:p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 enabled:hover:-translate-y-0.5 enabled:hover:border-niat-maroon/30 enabled:hover:shadow-[var(--shadow-soft)] disabled:cursor-wait disabled:opacity-70">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${f.id === 'xlsx' ? 'bg-niat-maroon text-white' : 'bg-niat-pink text-niat-maroon'}`}>{f.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-base font-bold text-niat-text">{f.title}</span>
                  <span className="rounded-md bg-stone-100 px-1.5 py-px font-mono text-[11px] text-niat-muted">{f.ext}</span>
                </span>
                <span className="mt-0.5 block text-sm text-niat-muted">{f.text}</span>
                <span className="mt-2 block truncate font-mono text-[11.5px] text-niat-muted/80">{baseName}{f.ext}</span>
              </span>
              <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-niat-line text-niat-maroon transition-colors group-enabled:group-hover:bg-niat-maroon group-enabled:group-hover:text-white" aria-hidden="true">
                {busy
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-niat-maroon/25 border-t-niat-maroon" />
                  : done === f.id ? Icons.check : Icons.download}
              </span>
              <span className="sr-only" aria-live="polite">{busy ? `Preparing ${f.title}…` : done === f.id ? `${f.title} downloaded` : ''}</span>
            </button>
          );
        })}
      </div>

      <section className="card mt-6">
        <h2 className="text-base font-bold text-niat-text">What's in the file</h2>
        <p className="mt-0.5 text-sm text-niat-muted">
          Students who haven't checked in are included too, with their status, so the file always matches the registration list.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((c) => (
            <div key={c.group}>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-niat-maroon">{c.group}</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {c.items.map((i) => (
                  <li key={i} className="rounded-lg border border-niat-line bg-niat-warm-white px-2 py-1 text-[12.5px] font-medium text-niat-text">{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Direct links for a browser that blocks the download button */}
        {token && (
          <p className="mt-5 border-t border-niat-line pt-3 text-xs text-niat-muted">
            Download blocked?{' '}
            <a href={`/api/events/${event.id}/export?format=xlsx&token=${encodeURIComponent(token)}`} className="font-semibold underline hover:text-niat-maroon" download>
              Excel direct link
            </a>{' · '}
            <a href={`/api/events/${event.id}/export?format=csv&token=${encodeURIComponent(token)}`} className="font-semibold underline hover:text-niat-maroon" download>
              CSV direct link
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
