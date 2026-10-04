import { useState } from 'react';
import { getAdminToken } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';

export default function Export() {
  const { event } = useAdmin();
  const [downloading, setDownloading] = useState<'xlsx' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!event) return <NoEvent />;

  const token = getAdminToken();

  const handleDownload = async (format: 'xlsx' | 'csv') => {
    setDownloading(format);
    setError(null);
    try {
      const url = `/api/events/${event.id}/export?format=${format}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `Download failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `${event.name.replace(/[^\w-]+/g, '_')}-${event.date}.${format}`;
      if (disposition) {
        const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
        if (match?.[1]) filename = match[1];
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to download file. Please verify you are logged in.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <PageHeader title="Export" subtitle={`Download all participants of “${event.name}” with their seat allocations.`} />
      
      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          ⚠️ {error}
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-niat-maroon/10 text-niat-maroon">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-niat-text">Attendance & Seating Roster</h3>
            <p className="text-xs text-niat-muted">Export clean spreadsheet with complete attendee check-in records</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-niat-muted">
          Includes <strong>Name</strong>, <strong>Phone</strong>, <strong>Parent Phone</strong>, <strong>School/College</strong>, <strong>Class</strong>, <strong>Coming From</strong>, <strong>Registration Type</strong>, <strong>Status</strong>, <strong>Room</strong>, <strong>Team</strong>, <strong>Seat</strong>, and <strong>Check-in Time</strong>.
          Participants who have not yet checked in are included with their pre-assigned room or pending status.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleDownload('xlsx')}
            disabled={downloading !== null}
            className="btn-primary inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {downloading === 'xlsx' ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Generating Excel…</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download Excel (.xlsx)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleDownload('csv')}
            disabled={downloading !== null}
            className="btn-secondary inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {downloading === 'csv' ? (
              <>
                <svg className="h-4 w-4 animate-spin text-niat-maroon" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Generating CSV…</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download CSV</span>
              </>
            )}
          </button>
        </div>

        {/* Fallback direct download link for convenience */}
        {token && (
          <p className="mt-4 text-xs text-niat-muted/70">
            Tip: You can also right-click and save directly via{' '}
            <a
              href={`/api/events/${event.id}/export?format=xlsx&token=${encodeURIComponent(token)}`}
              className="underline hover:text-niat-maroon"
              download
            >
              Excel direct link
            </a>{' '}
            or{' '}
            <a
              href={`/api/events/${event.id}/export?format=csv&token=${encodeURIComponent(token)}`}
              className="underline hover:text-niat-maroon"
              download
            >
              CSV direct link
            </a>.
          </p>
        )}
      </div>
    </div>
  );
}
