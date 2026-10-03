import { NoEvent, PageHeader, useAdmin } from './AdminLayout';

export default function Export() {
  const { event } = useAdmin();
  if (!event) return <NoEvent />;

  return (
    <div>
      <PageHeader title="Export" subtitle={`Download all participants of “${event.name}” with their seats.`} />
      <div className="card">
        <p className="text-niat-muted">
          Includes Name, Phone, Parent Phone, School/College, Class, Registration Type, Status, Room, Team, Seat and Check-in Time.
          Participants who did not arrive are included with an empty seat.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="btn-primary" href={`/api/events/${event.id}/export?format=xlsx`}>Download Excel (.xlsx)</a>
          <a className="btn-secondary" href={`/api/events/${event.id}/export?format=csv`}>Download CSV</a>
        </div>
      </div>
    </div>
  );
}
