import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { classLabel, GRADE_LABEL, LUNCH_LABEL, STREAM_LABEL, type Grade, type Lunch, type Stream } from '../../lib/answers';
import { api, formatTime, type ApiError } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';
import { Avatar, formatPhone, Icons } from './kit';

interface ParticipantRow {
  id: number;
  name: string;
  phone: string;
  parentPhone: string | null;
  parentName: string | null;
  schoolCollege: string;
  className: string | null;
  location: string | null;
  source: string | null;
  registrationType: 'existing' | 'walk_in';
  status: 'registered' | 'waiting' | 'checked_in';
  room: string | null;
  teamNumber: number | null;
  seatLabel: string | null;
  checkInTime: string | null;
  grade: Grade | null;
  stream: Stream | null;
  studyDetail: string | null;
  lunch: Lunch | null;
}

/** Only people who haven't arrived can be removed; anyone checked in or waiting keeps their place. */
const removable = (r: ParticipantRow) => !r.checkInTime && r.status === 'registered';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'checked_in', label: 'Checked in' },
  { key: 'pending', label: 'Not arrived' },
  { key: 'waiting', label: 'Waiting for a seat' },
  { key: 'walk_in', label: 'Walk-ins' },
  { key: 'veg', label: '🥗 Veg' },
  { key: 'non_veg', label: '🍗 Non-veg' },
];

export default function Participants() {
  const { event } = useAdmin();
  // The dashboard links here with ?filter=checked_in and the like.
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  // The dashboard's class breakdown links here with ?grade=class_12 or ?stream=maths.
  const grade = params.get('grade') as Grade | null;
  const stream = params.get('stream') as Stream | null;
  const answerFilter = grade && GRADE_LABEL[grade] ? `&grade=${grade}` : stream && STREAM_LABEL[stream] ? `&stream=${stream}` : '';
  const [filter, setFilter] = useState(() => {
    const initial = params.get('filter');
    return FILTERS.some((f) => f.key === initial) ? initial! : 'all';
  });
  const [data, setData] = useState<{ total: number; rows: ParticipantRow[] } | null>(null);
  // Keep the search and the filter in the address, so Back, refresh and a shared link show the same list.
  useEffect(() => {
    const t = setTimeout(() => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (q.trim()) next.set('q', q.trim()); else next.delete('q');
        if (filter !== 'all') next.set('filter', filter); else next.delete('filter');
        return next;
      }, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q, filter, setParams]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!event) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(`/events/${event.id}/participants?q=${encodeURIComponent(q.trim())}&filter=${filter}${answerFilter}`, { signal: controller.signal })
        .then(setData).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [event, q, filter, answerFilter, reloadKey]);

  /** A volunteer fixes a lunch choice: tapping the chip switches Veg and Non-veg. */
  const toggleLunch = async (r: ParticipantRow) => {
    if (!event) return;
    const lunch: Lunch = r.lunch === 'veg' ? 'non_veg' : 'veg';
    try {
      await api(`/events/${event.id}/participants/${r.id}/lunch`, { method: 'PATCH', body: { lunch } });
      setData((d) => d && { ...d, rows: d.rows.map((x) => (x.id === r.id ? { ...x, lunch } : x)) });
    } catch (err) {
      setToast({ tone: 'error', text: (err as ApiError).message });
    }
  };

  // A new search or filter starts a new selection.
  useEffect(() => setSelected(new Set()), [q, filter]);

  const remove = useCallback(async (body: object) => {
    if (!event) return;
    try {
      const r = await api<{ removed: number; kept: number; freedSeats: number }>(`/events/${event.id}/participants/remove`, { body });
      setToast({
        tone: 'ok',
        text: `Removed ${r.removed} ${r.removed === 1 ? 'registration' : 'registrations'} from this event.`
          + (r.freedSeats ? ` ${r.freedSeats} ${r.freedSeats === 1 ? 'seat' : 'seats'} freed.` : '')
          + (r.kept ? ` Kept ${r.kept} who already arrived.` : ''),
      });
      setSelected(new Set());
      setReloadKey((k) => k + 1);
    } catch (err) {
      setToast({ tone: 'error', text: (err as ApiError).message });
    }
  }, [event]);

  if (!event) return <NoEvent />;

  const shownRemovable = data?.rows ?? [];
  const selectedArrived = (data?.rows ?? []).filter((r) => selected.has(r.id) && !removable(r)).length;
  const allShownSelected = shownRemovable.length > 0 && shownRemovable.every((r) => selected.has(r.id));
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const searching = Boolean(q.trim()) || filter !== 'all';
  const canEdit = event.status !== 'completed';
  const rows = data?.rows ?? [];
  // Columns that say the same thing on every row (one city, no sources) only cost width: hide them.
  const showArea = new Set(rows.map((r) => (r.location ?? '').trim().toLowerCase())).size > 1;
  const showSource = rows.some((r) => r.source);
  const columns = 7 + (canEdit ? 1 : 0) + (showArea ? 1 : 0) + (showSource ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Participants"
        badge={data && <span className="rounded-full bg-stone-200/70 px-2 py-0.5 text-xs font-semibold text-niat-muted tabular-nums">{data.total.toLocaleString('en-IN')}</span>}
        subtitle="Everyone registered for this event. Search by name, phone, school, team (“17”) or seat (“17B”)."
        actions={<Link to="/admin/export" className="btn-secondary h-9 px-3 text-sm">Export</Link>}
      />

      {/* Toolbar: stays in view while scrolling a long list. */}
      <div className="sticky top-0 z-20 -mx-1 mb-3 flex flex-wrap items-center gap-2 bg-[#F7F6F3]/95 px-1 py-2 backdrop-blur">
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Search participants</span>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niat-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input className="input h-9 py-0 pl-9 text-sm" type="search" name="participant-search" autoComplete="off" spellCheck={false}
            placeholder="Name, phone, school, 17, 17B…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </label>
        <div role="group" aria-label="Show" className="flex h-9 items-center rounded-lg border border-niat-line bg-white p-0.5">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={`h-full cursor-pointer whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors ${
                filter === f.key ? 'bg-niat-maroon text-white' : 'text-niat-muted hover:bg-stone-100 hover:text-niat-text'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {answerFilter && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-niat-cream pl-3 pr-1 text-[13px] font-semibold text-niat-maroon ring-1 ring-niat-gold/40">
            {grade && GRADE_LABEL[grade] ? GRADE_LABEL[grade] : STREAM_LABEL[stream!]}
            <button type="button" aria-label="Clear class filter" className="grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-white"
              onClick={() => { params.delete('grade'); params.delete('stream'); setParams(params, { replace: true }); }}>×</button>
          </span>
        )}
        <span className="ml-auto text-[13px] text-niat-muted tabular-nums">
          {data ? <>{rows.length === data.total ? `${data.total.toLocaleString('en-IN')} shown` : `${rows.length} of ${data.total.toLocaleString('en-IN')} shown`}</> : 'Loading…'}
        </span>
        {/* Removing a wrong import is rare, so it only appears while searching or after ticking someone. */}
        {canEdit && searching && selected.size === 0 && data && data.total > 0 && (
          <ConfirmButton className="cursor-pointer text-[13px] font-semibold text-niat-maroon hover:underline"
            confirmText={`Remove everyone matching this search who hasn’t arrived (up to ${data.total}) from this event? People who arrived are kept.`}
            onConfirm={() => remove({ matching: { q: q.trim(), filter } })}>
            Remove matching…
          </ConfirmButton>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-niat-maroon/20 bg-niat-pink/60 px-4 py-2 text-[13px]">
          <span className="font-semibold text-niat-maroon">{selected.size} selected</span>
          <button type="button" className="cursor-pointer text-niat-muted hover:text-niat-text hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
          <span className="text-niat-muted">
            {selectedArrived ? `${selectedArrived} already arrived: removing frees their seat.` : 'Removes them from this event only.'}
          </span>
          <span className="ml-auto">
            <ConfirmButton className="btn-danger h-8 px-3 py-0 text-[13px]"
              confirmText={`Remove ${selected.size} ${selected.size === 1 ? 'person' : 'people'} from this event?`
                + (selectedArrived ? ` ${selectedArrived} already arrived: their seats will be freed.` : '')}
              onConfirm={() => remove({ ids: [...selected], includeArrived: selectedArrived > 0 })}>
              Remove from event
            </ConfirmButton>
          </span>
        </div>
      )}

      {toast && (
        <div role="status" className={`mb-3 flex justify-between gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium ${toast.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-niat-pink text-niat-maroon-dark'}`}>
          <span>{toast.tone === 'ok' ? '✓ ' : '⚠ '}{toast.text}</span>
          <button type="button" className="cursor-pointer" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-niat-line bg-white shadow-[var(--shadow-card)] lg:overflow-visible">
        <table className="w-full text-left text-[13px]">
          {/* The header sticks under the toolbar while the list scrolls. */}
          <thead className="sticky top-[52px] z-10 text-xs font-semibold text-niat-muted">
            <tr className="[&>th]:border-b [&>th]:border-niat-line [&>th]:bg-niat-warm-white [&>th]:py-2.5 [&>th:first-child]:rounded-tl-2xl [&>th:last-child]:rounded-tr-2xl">
              {canEdit && (
                <th className="w-10 pl-4">
                  <input type="checkbox" aria-label="Select everyone shown" className="h-4 w-4 cursor-pointer align-middle accent-niat-maroon"
                    checked={allShownSelected} disabled={!shownRemovable.length}
                    onChange={() => setSelected(allShownSelected ? new Set() : new Set(shownRemovable.map((r) => r.id)))} />
                </th>
              )}
              <th className="px-3">Name</th>
              <th className="px-3">Phone</th>
              <th className="px-3">School / college</th>
              <th className="px-3">Class</th>
              <th className="px-3">Lunch</th>
              {showArea && <th className="px-3">Area</th>}
              {showSource && <th className="px-3">Source</th>}
              <th className="px-3">Seat</th>
              <th className="px-3 pr-4 text-right">Checked in</th>
            </tr>
          </thead>
          {/* Rows scrolled to by the keyboard stop below the sticky toolbar and header. */}
          <tbody className="divide-y divide-niat-line/60 [&_button]:scroll-mt-28 [&_input]:scroll-mt-28">
            {rows.map((r) => (
              <tr key={r.id} className={`h-10 transition-colors ${selected.has(r.id) ? 'bg-niat-pink/50' : 'hover:bg-stone-50'}`}>
                {canEdit && (
                  <td className="pl-4">
                    <input type="checkbox" className="h-4 w-4 cursor-pointer align-middle accent-niat-maroon" aria-label={`Select ${r.name}`}
                      checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                      title={removable(r) ? undefined : 'Already arrived: removing frees their seat'} />
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-1.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={r.name} size="sm" />
                    <span className="font-semibold text-niat-text">{r.name}</span>
                    {r.registrationType === 'walk_in' && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-px text-[11px] font-semibold text-amber-800">Walk-in</span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 tabular-nums text-niat-muted">{formatPhone(r.phone)}</td>
                <td className="max-w-[16rem] truncate px-3" title={r.schoolCollege}>{r.schoolCollege}</td>
                <td className="whitespace-nowrap px-3 text-niat-muted">
                  {r.grade ? classLabel(r as { grade: Grade; stream: Stream | null; studyDetail: string | null })
                    : r.className ?? <span className="text-niat-muted/40">—</span>}
                </td>
                <td className="px-3">
                  {r.lunch ? (
                    <button type="button" disabled={!canEdit} onClick={() => toggleLunch(r)} title={canEdit ? 'Click to switch Veg / Non-veg' : undefined}
                      aria-label={canEdit ? `Lunch for ${r.name}: ${LUNCH_LABEL[r.lunch]}. Switch to ${r.lunch === 'veg' ? 'Non-veg' : 'Veg'}` : `Lunch: ${LUNCH_LABEL[r.lunch]}`}
                      className={`cursor-pointer whitespace-nowrap rounded-full px-2 py-px text-xs font-semibold transition-colors disabled:cursor-default ${
                        r.lunch === 'veg' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100' : 'bg-niat-pink text-niat-maroon ring-1 ring-niat-maroon/20 hover:bg-rose-100'}`}>
                      {LUNCH_LABEL[r.lunch]}
                    </button>
                  ) : <span className="text-niat-muted/40">—</span>}
                </td>
                {showArea && <td className="max-w-[10rem] truncate px-3 text-niat-muted" title={r.location ?? undefined}>{r.location ?? '—'}</td>}
                {showSource && <td className="max-w-[10rem] truncate px-3 text-niat-muted">{r.source ?? '—'}</td>}
                <td className="whitespace-nowrap px-3">
                  {r.teamNumber
                    ? <span className="inline-flex items-center gap-1.5">
                        <span className="rounded-md bg-niat-text px-1.5 py-px text-xs font-bold tabular-nums text-white">{r.teamNumber}{r.seatLabel}</span>
                        <span className="text-niat-muted">{r.room}</span>
                      </span>
                    : <span className="text-niat-muted/40">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 pr-4 text-right tabular-nums">
                  {r.checkInTime
                    ? <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />{formatTime(r.checkInTime)}</span>
                    : r.status === 'waiting'
                      ? <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />Waiting for a seat</span>
                      : <span className="inline-flex items-center gap-1.5 text-niat-muted/80"><span className="h-1.5 w-1.5 rounded-full bg-stone-300" aria-hidden="true" />Not arrived</span>}
                </td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr><td colSpan={columns} className="px-4 py-14 text-center">
                <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-niat-pink text-niat-maroon">{Icons.users}</span>
                <span className="block font-semibold text-niat-text">{searching ? 'No one matches this search' : 'No participants yet'}</span>
                <span className="mt-0.5 block text-niat-muted">{searching ? 'Try a shorter name, the last digits of the phone, or a seat like 17B.' : 'Import a list, or students register at the venue.'}</span>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && rows.length < data.total && (
        <p className="mt-2 text-[13px] text-niat-muted">Showing the first {rows.length}. Search or filter to find someone specific.</p>
      )}
    </div>
  );
}
