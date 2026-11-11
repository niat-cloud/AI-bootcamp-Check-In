import { Link } from 'react-router-dom';
import { GRADE_OPTIONS, STREAM_OPTIONS } from '../../../lib/answers';
import { pct, plural, type AnswerCounts, type DashboardData } from './data';
import { Card, Empty, PageLink } from './ui';

/** Lunch for the kitchen: veg and non-veg among everyone who has arrived, live. */
export function LunchCard({ data, className = '' }: { data: DashboardData; className?: string }) {
  const { counts, notAnswered } = data.answers.lunch;
  const veg = counts.veg ?? 0;
  const nonVeg = counts.non_veg ?? 0;
  const total = veg + nonVeg;
  return (
    <Card title="Lunch" className={className}
      subtitle={total ? `${plural(total, 'meal')} so far, from everyone who checked in` : 'Students choose Veg or Non-veg when they check in'}
      actions={total > 0 && <PageLink to="/admin/participants?filter=veg">Who chose what</PageLink>}>
      {total === 0 && notAnswered === 0 ? <Empty>No one has checked in yet.</Empty> : (
        <div>
          <dl className="grid grid-cols-2 gap-3">
            <Meal label="Veg" icon="🥗" n={veg} share={pct(veg, total)} tone="text-emerald-700" />
            <Meal label="Non-veg" icon="🍗" n={nonVeg} share={pct(nonVeg, total)} tone="text-niat-maroon" />
          </dl>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
            <span className="h-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct(veg, total)}%` }} />
            <span className="h-full bg-niat-maroon transition-[width] duration-500" style={{ width: `${pct(nonVeg, total)}%` }} />
          </div>
          {notAnswered > 0 && (
            <p className="mt-3 text-sm text-niat-muted">
              {plural(notAnswered, 'checked-in student hasn’t', 'checked-in students haven’t')} chosen yet (seated at the gate). Plan a few extra.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Meal({ label, icon, n, share, tone }: { label: string; icon: string; n: number; share: number; tone: string }) {
  return (
    <div className="rounded-xl bg-niat-warm-white px-4 py-3">
      <dt className="flex items-center gap-1.5 text-sm font-semibold text-niat-muted"><span aria-hidden="true">{icon}</span>{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${tone}`}>{n.toLocaleString('en-IN')}</span>
        <span className="text-sm text-niat-muted tabular-nums">{share}%</span>
      </dd>
    </div>
  );
}

/** Who is in the room: class, and subjects for school students. */
export function ClassCard({ data }: { data: DashboardData }) {
  const { grade, stream } = data.answers;
  const answered = Object.values(grade.counts).reduce((a, b) => a + b, 0);
  return (
    <Card title="Class and subjects" subtitle={answered ? `From ${plural(answered, 'student')} who checked in` : 'Students choose their class and subjects when they check in'}>
      {answered === 0 ? <Empty>No answers yet.</Empty> : (
        <div className="grid gap-6 sm:grid-cols-2">
          <Bars title="Class" counts={grade} options={GRADE_OPTIONS} param="grade" />
          <Bars title="Subjects (school students)" counts={stream} options={STREAM_OPTIONS} param="stream" />
        </div>
      )}
    </Card>
  );
}

function Bars({ title, counts, options, param }: {
  title: string; counts: AnswerCounts; options: { value: string; label: string }[]; param: string;
}) {
  const max = Math.max(1, ...Object.values(counts.counts));
  const total = Object.values(counts.counts).reduce((a, b) => a + b, 0);
  return (
    <div>
      <h3 className="text-sm font-semibold text-niat-text">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {options.map((o) => {
          const n = counts.counts[o.value] ?? 0;
          return (
            <li key={o.value}>
              <Link to={`/admin/participants?${param}=${o.value}`} className="group block">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-niat-text group-hover:text-niat-maroon">{o.label}</span>
                  <span className="text-niat-muted tabular-nums"><strong className="font-semibold text-niat-text">{n}</strong> · {pct(n, total)}%</span>
                </span>
                <span className="mt-1 block h-2 rounded-r bg-niat-maroon/10" aria-hidden="true">
                  <span className="block h-full rounded-r bg-niat-maroon transition-[width] duration-500" style={{ width: `${(n / max) * 100}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
