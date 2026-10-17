import { Link } from 'react-router-dom';
import { duration, minutesSince, plural, type DashboardData } from './data';

type Level = 'critical' | 'warning' | 'info';

interface AttentionItem {
  level: Level;
  title: string;
  detail: string;
  action?: { label: string; to: string } | { label: string; onClick: () => void };
}

/** Minutes without a single arrival, while people are still expected, before the dashboard says so. */
const QUIET_MINUTES = 20;

/** Things an organizer should act on now, worked out from the live numbers. Most urgent first. */
function attentionItems(d: DashboardData, now: number, showCallList: () => void): AttentionItem[] {
  const s = d.stats;
  const live = d.event.status === 'active';
  const items: AttentionItem[] = [];
  const rooms = { label: 'Rooms & Teams', to: '/admin/teams' };

  if (s.capacity === 0 && d.event.status !== 'completed') {
    items.push({
      level: 'critical',
      title: 'No seats are set up',
      detail: 'Add a room (or open a closed one) so check-in can give people seats.',
      action: { label: 'Event Setup', to: '/admin/setup' },
    });
  }
  if (s.waiting > 0) {
    const oldest = d.waiting[0]?.arrivedAt;
    items.push({
      level: 'critical',
      title: `${plural(s.waiting, 'person is', 'people are')} waiting for a seat`,
      detail: `${oldest ? `Longest wait: ${duration(minutesSince(oldest, now))}. ` : ''}Add seats to a room or open another room.`,
      action: rooms,
    });
  }
  if (live && s.capacity > 0 && s.seatsLeft === 0 && s.waiting === 0 && s.notArrived > 0) {
    items.push({
      level: 'warning',
      title: 'Every seat is taken',
      detail: `${plural(s.notArrived, 'registered person hasn’t', 'registered people haven’t')} arrived yet. New arrivals will go on the waiting list.`,
      action: rooms,
    });
  } else if (live && s.seatsLeft > 0 && s.notArrived > s.seatsLeft && s.seatsLeft <= Math.max(5, Math.ceil(s.capacity * 0.1))) {
    items.push({
      level: 'warning',
      title: `Only ${plural(s.seatsLeft, 'seat')} left`,
      detail: `${plural(s.notArrived, 'registered person hasn’t', 'registered people haven’t')} arrived yet.`,
      action: rooms,
    });
  }
  if (d.event.status === 'draft' && s.total > 0) {
    items.push({
      level: 'info',
      title: 'Check-in isn’t open yet',
      detail: 'Activate the event in Event Setup when the doors open.',
      action: { label: 'Event Setup', to: '/admin/setup' },
    });
  }
  if (live && s.notArrived > 0 && s.lastArrivalAt && minutesSince(s.lastArrivalAt, now) >= QUIET_MINUTES) {
    items.push({
      level: 'info',
      title: `No arrivals in the last ${duration(minutesSince(s.lastArrivalAt, now))}`,
      detail: `${plural(s.notArrived, 'registered person hasn’t', 'registered people haven’t')} arrived. The call list has their numbers.`,
      action: { label: 'Open call list', onClick: showCallList },
    });
  }
  return items;
}

const STYLE: Record<Level, { box: string; icon: string; symbol: string; name: string }> = {
  critical: { box: 'border-rose-200 bg-rose-50/60', icon: 'bg-rose-600 text-white', symbol: '!', name: 'Urgent' },
  warning: { box: 'border-amber-200 bg-amber-50/60', icon: 'bg-amber-500 text-white', symbol: '!', name: 'Warning' },
  info: { box: 'border-niat-line bg-niat-warm-white', icon: 'bg-stone-500 text-white', symbol: 'i', name: 'Note' },
};

export function Attention({ data, now, showCallList }: { data: DashboardData; now: number; showCallList: () => void }) {
  const items = attentionItems(data, now, showCallList);

  if (items.length === 0) {
    return (
      <p role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white" aria-hidden="true">✓</span>
        Nothing needs attention right now.
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Needs attention">
      {items.map((item) => {
        const style = STYLE[item.level];
        return (
          <li key={item.title} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 ${style.box}`}>
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${style.icon}`} aria-hidden="true">
              {style.symbol}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-niat-text"><span className="sr-only">{style.name}: </span>{item.title}</p>
              <p className="text-sm text-niat-muted">{item.detail}</p>
            </div>
            {item.action && ('to' in item.action ? (
              <Link to={item.action.to} className="btn-secondary px-3 py-1.5 text-sm">{item.action.label}</Link>
            ) : (
              <button type="button" onClick={item.action.onClick} className="btn-secondary px-3 py-1.5 text-sm">{item.action.label}</button>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
