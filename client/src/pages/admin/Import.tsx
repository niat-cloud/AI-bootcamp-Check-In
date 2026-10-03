import { useEffect, useMemo, useState } from 'react';
import { api, type EventInfo } from '../../lib/api';
import { downloadCsv, FIELDS, guessMapping, normalizePhone, parseFile, type FieldKey, type ParsedSheet } from '../../lib/parseSheet';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';

interface ImportSummary {
  totalRows: number;
  valid: number;
  imported: number;
  alreadyRegistered: number;
  newPeople: number;
  returningPeople: number;
  rejected: { rowNumber: number; name: string; phone: string; reason: string }[];
}

type Issue = 'Empty row' | 'Missing name' | 'Missing phone number' | 'Invalid phone number' | 'Duplicate phone in file';

export default function Import() {
  const { event } = useAdmin();
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [participantCount, setParticipantCount] = useState<number | null>(null);

  const loadCount = () => {
    if (event) api<{ total: number }>(`/events/${event.id}/participants?q=`).then((r) => setParticipantCount(r.total));
  };
  useEffect(loadCount, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (f: File | undefined) => {
    setError(null);
    setSummary(null);
    setSheet(null);
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setError('Please choose an .xlsx or .csv file.');
      return;
    }
    try {
      const parsed = await parseFile(f);
      if (!parsed.headers.length) throw new Error('The file appears to be empty.');
      setFile(f);
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
    } catch (err) {
      setError(`Could not read the file: ${(err as Error).message}`);
    }
  };

  const analysed = useMemo(() => {
    if (!sheet || !mapping) return null;
    const seen = new Map<string, number>();
    return sheet.rows.map((r) => {
      const get = (k: FieldKey) => (mapping[k] >= 0 ? r.cells[mapping[k]] : '');
      const values = { name: get('name'), phone: get('phone'), schoolCollege: get('schoolCollege'), className: get('className'), parentPhone: get('parentPhone') };
      let issue: Issue | null = null;
      const phone = normalizePhone(values.phone);
      if (r.cells.every((c) => !c)) issue = 'Empty row';
      else if (!values.name) issue = 'Missing name';
      else if (!values.phone) issue = 'Missing phone number';
      else if (!phone) issue = 'Invalid phone number';
      else if (seen.has(phone)) issue = 'Duplicate phone in file';
      if (phone && !seen.has(phone) && !issue) seen.set(phone, r.rowNumber);
      return { rowNumber: r.rowNumber, ...values, issue };
    });
  }, [sheet, mapping]);

  const valid = analysed?.filter((r) => !r.issue) ?? [];
  const problems = analysed?.filter((r) => r.issue) ?? [];
  const missingRequired = mapping ? FIELDS.filter((f) => f.required && mapping[f.key] < 0) : [];

  const doImport = async () => {
    if (!event || !analysed) return;
    setBusy(true);
    setError(null);
    try {
      // Send every row (including problem rows) so the server's summary accounts for all of them.
      const result = await api<ImportSummary>(`/events/${event.id}/import`, {
        body: { rows: analysed.map(({ issue: _issue, ...r }) => r) },
      });
      setSummary(result);
      setSheet(null);
      loadCount();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!event) return <NoEvent />;
  if (event.status === 'completed') {
    return <div><PageHeader title="Import Participants" /><div className="card text-niat-muted">This event is completed. Create a new event to import participants.</div></div>;
  }

  return (
    <div>
      <PageHeader
        title="Import Participants"
        subtitle={`${event.name} · ${participantCount ?? '…'} participants registered`}
      />

      <div className="card">
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-niat-line p-10 text-center hover:border-niat-maroon/50 hover:bg-niat-cream/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
        >
          <span className="text-4xl">📄</span>
          <span className="mt-2 text-lg font-semibold">Drop an Excel or CSV file here, or click to choose</span>
          <span className="mt-1 text-sm text-niat-muted">Needs columns for Name, Phone and School/College (any order). Class and Parent Phone are optional.</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
      </div>

      {sheet && mapping && analysed && (
        <div className="card mt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{file?.name}</h2>
              <p className="mt-1 text-3xl font-bold">{valid.length} students detected</p>
              {problems.length > 0 && <p className="mt-1 text-amber-700">{problems.length} row{problems.length > 1 ? 's' : ''} need attention (listed below — they will not be imported)</p>}
            </div>
            <button className="btn-primary px-6 py-3 text-lg" disabled={busy || valid.length === 0 || missingRequired.length > 0} onClick={doImport}>
              {busy ? 'Importing…' : `Import ${valid.length} Students`}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="label">{mapping[f.key] >= 0 ? '✓' : f.required ? '✗' : '○'} {f.label}{f.required ? '' : ' (optional)'}</span>
                <select
                  className={`input ${f.required && mapping[f.key] < 0 ? 'border-rose-400' : ''}`}
                  value={mapping[f.key]}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}
                >
                  <option value={-1}>— not in file —</option>
                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <p className="mt-3 text-sm text-rose-600">Choose a column for: {missingRequired.map((f) => f.label).join(', ')}</p>
          )}

          <h3 className="mt-6 font-semibold">Preview (first 8 rows)</h3>
          <PreviewTable rows={valid.slice(0, 8)} />

          {problems.length > 0 && (
            <>
              <div className="mt-6 flex items-center justify-between">
                <h3 className="font-semibold text-amber-800">Rows that need attention ({problems.length})</h3>
                <button className="btn-secondary text-sm" onClick={() => downloadCsv('rows-to-fix.csv', problems.map((p) => ({
                  Row: p.rowNumber, Issue: p.issue, Name: p.name, Phone: p.phone, 'School/College': p.schoolCollege, Class: p.className,
                })))}>Download list</button>
              </div>
              <PreviewTable rows={problems.slice(0, 50)} showIssue />
              {problems.length > 50 && <p className="mt-2 text-sm text-niat-muted">…and {problems.length - 50} more (download the list to see all).</p>}
            </>
          )}
        </div>
      )}

      {summary && <SummaryCard summary={summary} />}
      {!sheet && <CopyFromPrevious event={event} onDone={loadCount} />}
    </div>
  );
}

function PreviewTable({ rows, showIssue }: { rows: { rowNumber: number; name: string; phone: string; schoolCollege: string; className: string; issue: string | null }[]; showIssue?: boolean }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-niat-line text-niat-muted">
          <tr><th className="py-2 pr-3">Row</th>{showIssue && <th className="pr-3">Issue</th>}<th className="pr-3">Name</th><th className="pr-3">Phone</th><th className="pr-3">School/College</th><th>Class</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rowNumber} className="border-b border-niat-line/60">
              <td className="py-1.5 pr-3 font-mono text-niat-muted/70">{r.rowNumber}</td>
              {showIssue && <td className="pr-3 font-medium text-amber-700">{r.issue}</td>}
              <td className="pr-3">{r.name}</td>
              <td className="pr-3 font-mono">{r.phone}</td>
              <td className="pr-3">{r.schoolCollege}</td>
              <td>{r.className}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({ summary }: { summary: ImportSummary }) {
  return (
    <div className="card mt-6 border-emerald-200 bg-emerald-50/50">
      <h2 className="text-lg font-semibold text-emerald-800">Import complete</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Rows in file" value={summary.totalRows} />
        <Stat label="Added to this event" value={summary.imported} />
        <Stat label="Already registered" value={summary.alreadyRegistered} />
        <Stat label="Not imported" value={summary.rejected.length} warn={summary.rejected.length > 0} />
      </dl>
      <p className="mt-3 text-sm text-niat-muted">
        {summary.newPeople} new people, {summary.returningPeople} returning from earlier events (their details were updated from this file).
      </p>
      {summary.rejected.length > 0 && (
        <div className="mt-4">
          <button className="btn-secondary text-sm" onClick={() => downloadCsv('not-imported.csv', summary.rejected.map((r) => ({ Row: r.rowNumber, Reason: r.reason, Name: r.name, Phone: r.phone })))}>
            Download {summary.rejected.length} rows that were not imported
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-niat-muted">{label}</dt>
      <dd className={`text-2xl font-bold ${warn ? 'text-amber-700' : ''}`}>{value}</dd>
    </div>
  );
}

function CopyFromPrevious({ event, onDone }: { event: EventInfo; onDone: () => void }) {
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [source, setSource] = useState('');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    api<EventInfo[]>('/events').then((all) => setEvents(all.filter((e) => e.id !== event.id && (e.participantCount ?? 0) > 0)));
  }, [event.id]);

  if (events.length === 0) return null;

  const copy = async () => {
    try {
      const r = await api<{ imported: number }>(`/events/${event.id}/copy-from/${source}`, { method: 'POST' });
      setResult(`${r.imported} participants added. People already registered were skipped.`);
      onDone();
    } catch (err) {
      setResult((err as Error).message);
    }
  };

  return (
    <div className="card mt-6">
      <h2 className="text-lg font-semibold">Reuse participants from a previous event</h2>
      <p className="mt-1 text-sm text-niat-muted">Copies the participant list only. Seats and attendance always start fresh.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <select className="input max-w-sm" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Choose an event…</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.date} ({e.participantCount} participants)</option>)}
        </select>
        <button className="btn-secondary" disabled={!source} onClick={copy}>Copy participants</button>
      </div>
      {result && <p className="mt-3 text-sm text-niat-text">{result}</p>}
    </div>
  );
}
