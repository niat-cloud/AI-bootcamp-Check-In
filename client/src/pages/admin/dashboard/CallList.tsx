import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../../lib/api';
import { plural, type SourceRow } from './data';
import { Card, Empty } from './ui';

interface Person {
  id: number;
  name: string;
  phone: string;
  className: string | null;
  schoolCollege: string;
  location: string | null;
  source: string | null;
  registrationType: 'existing' | 'walk_in';
}

const prettyPhone = (p: string) => (/^\d{10}$/.test(p) ? `${p.slice(0, 5)} ${p.slice(5)}` : p);

/**
 * Registered people who haven't arrived, to call during the event. Refetches whenever the arrival
 * count changes (`version`), so people drop off the list as they check in.
 */
export function CallList({ eventId, sources, source, onSourceChange, version }: {
  eventId: number;
  sources: SourceRow[];
  source: string;
  onSourceChange: (key: string) => void;
  version: number;
}) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<{ total: number; rows: Person[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const query = `filter=pending&source=${encodeURIComponent(source)}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<{ total: number; rows: Person[] }>(`/events/${eventId}/participants?${query}&q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
        .then((r) => { setList(r); setError(null); })
        .catch((err) => { if ((err as Error).name !== 'AbortError') setError((err as Error).message); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [eventId, query, q, version]);

  const exportList = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadFile(`/events/${eventId}/export?format=csv&${query}`, 'not-arrived.csv');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // Walk-ins always count as arrived, so they never have anyone to call.
  const options = sources.filter((s) => s.kind !== 'walk_in' && s.registered > s.arrived);

  return (
    <Card title="Not arrived yet"
      subtitle={list ? `${plural(list.total, 'registered person hasn’t', 'registered people haven’t')} checked in${source ? ' from this source' : ''}. Call to remind them.` : 'Registered people who haven’t checked in'}
      actions={
        <>
          <select aria-label="Source" value={source} onChange={(e) => onSourceChange(e.target.value)}
            className="rounded-lg border border-niat-line bg-white px-2.5 py-1.5 text-sm text-niat-text">
            <option value="">All sources</option>
            {options.map((s) => <option key={s.key} value={s.key}>{s.source} ({s.registered - s.arrived})</option>)}
            {source && !options.some((s) => s.key === source) && (
              <option value={source}>{sources.find((s) => s.key === source)?.source ?? source}</option>
            )}
          </select>
          <input type="search" aria-label="Search the list" placeholder="Search name, phone, school…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-48 rounded-lg border border-niat-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-niat-maroon focus:ring-4 focus:ring-niat-maroon/10" />
          <button type="button" onClick={exportList} disabled={exporting || !list?.total} className="btn-secondary px-3 py-1.5 text-sm">
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </>
      }>
      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!list ? (
        <p className="py-8 text-center text-sm text-niat-muted">Loading the list…</p>
      ) : list.rows.length === 0 ? (
        <Empty>{q.trim() ? 'No one matches this search.' : 'Everyone registered has arrived.'}</Empty>
      ) : (
        <>
          <div className="-mx-5 max-h-[32rem] overflow-auto border-y border-niat-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-niat-warm-white text-xs font-semibold text-niat-muted">
                <tr>
                  <th className="px-5 py-2.5">Name</th><th className="px-3 py-2.5">Phone</th><th className="px-3 py-2.5 pr-5 sm:pr-3">Source</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell">Area</th><th className="hidden px-5 py-2.5 sm:table-cell">School/College</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niat-line/70">
                {list.rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5">
                      <span className="font-semibold text-niat-text">{p.name}</span>
                      {p.className && <span className="ml-1 text-niat-muted">({p.className})</span>}
                      {/* On phones, area and school sit under the name instead of in their own columns. */}
                      <span className="block text-xs text-niat-muted sm:hidden">{[p.location, p.schoolCollege].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      <a href={`tel:+91${p.phone}`} className="text-niat-maroon hover:underline">{prettyPhone(p.phone)}</a>
                    </td>
                    <td className="px-3 py-2.5 pr-5 text-niat-muted sm:pr-3">{p.source ?? 'Not specified'}</td>
                    <td className="hidden px-3 py-2.5 text-niat-muted sm:table-cell">{p.location ?? '—'}</td>
                    <td className="hidden px-5 py-2.5 text-niat-muted sm:table-cell">{p.schoolCollege || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.rows.length < list.total && (
            <p className="mt-3 text-sm text-niat-muted">
              Showing the first {list.rows.length} of {list.total.toLocaleString('en-IN')}. Export the CSV for the full list.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
