import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeatAssignment } from '../../lib/api';
import { vibrate } from '../../lib/device';
import { CtaButton } from './CtaButton';
import { initials } from './Search';

const AUTO_RETURN_SECONDS = 20;
const ROLL_MS = 650;
const pad = (n: number | null) => (n === null ? '—' : String(n).padStart(2, '0'));

/**
 * The hero moment. `kiosk` mode (gate laptop): Next Student + auto-return.
 * `personal` mode (student's own phone): the pass stays on screen, no timer.
 */
export function SeatReveal({ assignment, mode, onDone }: {
  assignment: SeatAssignment;
  mode: 'kiosk' | 'personal';
  onDone: () => void;
}) {
  const returning = assignment.alreadyAssigned;
  const firstName = assignment.participant.name.split(/\s+/)[0];
  const rolling = useSeatRoll(assignment, !returning);
  const revealed = !rolling;
  const doneRef = useRef<HTMLButtonElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (mode !== 'kiosk') return;
    doneRef.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => onDoneRef.current(), AUTO_RETURN_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (revealed && !returning) vibrate([40, 60, 40]);
  }, [revealed, returning]);

  return (
    <div className={`relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center text-center ${mode === 'personal' ? 'pb-32' : 'pb-4'} pt-1 sm:py-6`}>
      {!returning && <div className="aurora" aria-hidden />}
      {!returning && revealed && <Confetti />}

      <div className="relative z-10 w-full">
        {returning ? (
          <>
            <div className="eyebrow animate-fade-up">Your seat is safe</div>
            <h1 className="mt-2 animate-fade-up text-3xl font-extrabold tracking-tight sm:text-5xl">Welcome back, {firstName} 👋</h1>
            <p className="mx-auto mt-2 max-w-lg animate-fade-up text-base text-niat-muted sm:text-lg">Your seat has already been assigned for today's AI Bootcamp.</p>
          </>
        ) : (
          <>
            <div className="eyebrow animate-fade-up">{revealed ? "You're all set" : 'Picking your team'}</div>
            <h1 className="mt-1 animate-fade-up text-3xl font-extrabold tracking-tight sm:mt-2 sm:text-6xl">
              {revealed ? "🎉 You're In!" : 'Here it comes…'}
            </h1>
            <p className="mt-1 animate-fade-up text-base font-bold uppercase tracking-wide text-niat-muted sm:mt-2 sm:text-xl">{assignment.participant.name}</p>
          </>
        )}
      </div>

      {/* Seat pass */}
      <div className="relative z-10 mt-4 w-full max-w-md animate-scale-in overflow-hidden rounded-[32px] border border-niat-line bg-white shadow-[var(--shadow-lift)] sm:mt-8">
        <div aria-hidden className="h-2 bg-gradient-to-r from-niat-maroon via-niat-maroon to-niat-gold" />
        <div className="flex items-center justify-between gap-2 px-5 pt-4 text-left sm:px-6 sm:pt-5">
          <span className="whitespace-nowrap text-[10px] font-extrabold tracking-[0.18em] text-niat-maroon sm:text-xs sm:tracking-[0.2em]">AI BOOTCAMP · PASS</span>
          <span className="whitespace-nowrap rounded-full bg-niat-pink px-2.5 py-1 text-[10px] font-extrabold tracking-[0.16em] text-niat-maroon sm:px-3 sm:text-xs">
            TEAM {rolling ? '··' : pad(assignment.teamNumber)}
          </span>
        </div>

        <div className="relative px-6 pb-1 pt-3 sm:pb-2 sm:pt-4">
          {revealed && !returning && (
            <>
              <div className="seat-rays" aria-hidden />
              <Sparkles />
            </>
          )}
          <div key={rolling ? 'rolling' : 'final'}
            className={`relative text-[96px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[160px] ${
              rolling ? 'text-niat-maroon/35 blur-[1px]' : 'animate-seat-pop text-niat-maroon'}`}
            aria-live="polite">
            {rolling ? <RollingCode assignment={assignment} /> : assignment.seatCode ?? '—'}
          </div>
          <div className="relative mt-1 text-xs font-extrabold uppercase tracking-[0.3em] text-niat-muted sm:mt-2 sm:text-sm">Your Seat</div>
        </div>

        {/* Ticket perforation */}
        <div className="relative my-3 flex items-center sm:my-4" aria-hidden>
          <span className="-ml-3 h-6 w-6 rounded-full bg-niat-warm-white ring-1 ring-niat-line" />
          <span className="mx-2 flex-1 border-t-2 border-dashed border-niat-line" />
          <span className="-mr-3 h-6 w-6 rounded-full bg-niat-warm-white ring-1 ring-niat-line" />
        </div>

        <div className={`flex items-center justify-between gap-3 px-5 pb-5 sm:px-6 sm:pb-6 ${revealed ? 'animate-fade-up' : 'opacity-0'}`}>
          <div className="text-left">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-niat-muted sm:text-xs">Your table</div>
            <div className="mt-0.5 whitespace-nowrap text-sm font-bold text-niat-text sm:text-base">{assignment.teamName}</div>
          </div>
          <RoomBadge room={assignment.room} />
        </div>
      </div>

      {assignment.members.length > 0 && (
        <div className={`relative z-10 mt-5 w-full max-w-md ${revealed ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: '200ms' }}>
          <TeamMemberList members={assignment.members} />
        </div>
      )}

      {revealed && (
        <p className="relative z-10 mt-4 animate-fade-in text-base font-semibold text-niat-maroon sm:text-lg" style={{ animationDelay: '350ms' }}>
          {mode === 'personal' ? '📸 Take a screenshot of your pass — see you inside ✨' : 'See you inside ✨'}
        </p>
      )}

      {mode === 'kiosk' ? (
        <div className="relative z-10 mt-6 w-full max-w-md">
          <CtaButton ref={doneRef} onClick={onDone} className="w-full">
            {returning ? 'Continue' : 'Next Student'}
          </CtaButton>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-niat-line/60" aria-hidden>
            <div className="h-full origin-left rounded-full bg-niat-maroon/40" style={{ animation: `countdown ${AUTO_RETURN_SECONDS}s linear forwards` }} />
          </div>
          <p className="mt-2 text-xs text-niat-muted/80">Returns to search automatically</p>
        </div>
      ) : (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-niat-line bg-white/85 px-5 pt-3 backdrop-blur-md">
          <button onClick={onDone}
            className="w-full cursor-pointer rounded-2xl py-3 text-base font-bold text-niat-maroon ring-1 ring-niat-line transition-colors active:bg-niat-cream">
            Check in someone else
          </button>
        </div>
      )}
    </div>
  );
}

/** Short slot-machine shuffle before the real seat lands. */
function useSeatRoll(assignment: SeatAssignment, enabled: boolean) {
  const [rolling, setRolling] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => setRolling(false), ROLL_MS);
    return () => clearTimeout(t);
  }, [enabled, assignment.eventParticipantId]);
  return rolling;
}

function RollingCode({ assignment }: { assignment: SeatAssignment }) {
  const labels = assignment.members.map((m) => m.label);
  const [code, setCode] = useState('··');
  useEffect(() => {
    const timer = setInterval(() => {
      const team = Math.max(1, (assignment.teamNumber ?? 9) + Math.round(Math.random() * 10 - 5));
      setCode(`${team}${labels[Math.floor(Math.random() * labels.length)] ?? 'A'}`);
    }, 70);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{code}</>;
}

function Sparkles() {
  const spots = [
    { left: '12%', top: '18%', delay: '0ms', scale: 1 },
    { left: '84%', top: '12%', delay: '600ms', scale: 0.8 },
    { left: '88%', top: '62%', delay: '1200ms', scale: 1.1 },
    { left: '8%', top: '68%', delay: '1800ms', scale: 0.7 },
    { left: '50%', top: '0%', delay: '900ms', scale: 0.6 },
  ];
  return (
    <>
      {spots.map((s, i) => (
        <span key={i} aria-hidden className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay, scale: String(s.scale) }} />
      ))}
    </>
  );
}

export function RoomBadge({ room }: { room: string | null }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-niat-maroon px-3.5 py-2 text-base font-extrabold uppercase tracking-[0.08em] sm:gap-2 sm:rounded-2xl sm:px-5 sm:py-2.5 text-white shadow-[var(--shadow-soft)] sm:text-xl">
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-niat-gold-light sm:h-5 sm:w-5"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>
      {room ?? '—'}
    </span>
  );
}

export function TeamMemberList({ members }: { members: SeatAssignment['members'] }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-niat-line bg-white/90 p-4 text-left shadow-[var(--shadow-card)] backdrop-blur sm:p-5">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-niat-muted">Your Team</div>
      <ul className="mt-3 space-y-1.5">
        {members.map((m, i) => (
          <li key={m.label} style={{ '--i': i } as React.CSSProperties}
            className={`stagger flex animate-fade-up items-center gap-3 rounded-xl px-3 py-2.5 ${m.isSelf ? 'bg-niat-cream ring-1 ring-niat-gold/50' : ''}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-extrabold ${
              m.isSelf ? 'bg-niat-maroon text-white' : m.name ? 'bg-niat-pink text-niat-maroon' : 'border-2 border-dashed border-niat-line text-niat-muted'}`}>
              {m.label}
            </span>
            {m.name ? (
              <span className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
                <span className="hidden h-7 w-7 shrink-0 place-items-center rounded-full bg-niat-text/5 text-xs font-bold text-niat-muted sm:grid">{initials(m.name)}</span>
                <span className={`truncate ${m.isSelf ? 'font-extrabold text-niat-maroon' : 'font-semibold text-niat-text'}`}>{m.name}</span>
                {m.isSelf && <span className="shrink-0 text-sm font-bold text-niat-muted">· You</span>}
              </span>
            ) : (
              <span className="text-sm italic text-niat-muted sm:text-base">Waiting for teammate ✨</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONFETTI_COLORS = ['#A7191E', '#FFB719', '#FFD65A', '#861317', '#FFF8D6'];

/** ~32 tasteful pieces, about a second, then gone. */
export function Confetti() {
  const [alive, setAlive] = useState(true);
  const pieces = useMemo(() => Array.from({ length: 32 }, (_, i) => {
    const angle = Math.PI + Math.PI * (i / 31);
    const distance = 140 + Math.random() * 200;
    return {
      dx: `${Math.cos(angle) * distance}px`,
      dy: `${Math.sin(angle) * distance * 0.7 + 240 + Math.random() * 140}px`,
      rot: `${Math.round(Math.random() * 720 - 360)}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${Math.round(Math.random() * 120)}ms`,
      dur: `${850 + Math.round(Math.random() * 300)}ms`,
      round: i % 4 === 0,
    };
  }), []);

  useEffect(() => {
    const t = setTimeout(() => setAlive(false), 1500);
    return () => clearTimeout(t);
  }, []);
  if (!alive) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-56 z-20 h-0 w-0 sm:top-72">
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece"
          style={{
            background: p.color,
            borderRadius: p.round ? '999px' : undefined,
            width: p.round ? 8 : undefined,
            height: p.round ? 8 : undefined,
            opacity: 0,
            '--dx': p.dx, '--dy': p.dy, '--rot': p.rot, '--delay': p.delay, '--dur': p.dur,
          } as React.CSSProperties} />
      ))}
    </div>
  );
}
