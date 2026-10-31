import { useEffect, useMemo, useState } from 'react';
import type { Award, Project, ProjectRoom } from './types';

/** Revealed from third place up, so the room builds up to the winner. */
const ORDER: { award: Award; title: string; medal: string }[] = [
  { award: 'second_runner_up', title: '2nd Runner-up', medal: '🥉' },
  { award: 'runner_up', title: 'Runner-up', medal: '🥈' },
  { award: 'winner', title: 'Winner', medal: '🏆' },
];

const COLORS = ['#A7191E', '#FFB719', '#FFD65A', '#861317', '#F3D3C4', '#10B981'];

function Confetti({ count }: { count: number }) {
  // New positions for every reveal (the parent re-mounts this per step).
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    color: COLORS[i % COLORS.length],
    dx: `${Math.round((Math.random() - 0.5) * 1400)}px`,
    dy: `${Math.round(250 + Math.random() * 650)}px`,
    rot: `${Math.round(Math.random() * 900 - 450)}deg`,
    dur: `${Math.round(1200 + Math.random() * 1300)}ms`,
    delay: `${Math.round(Math.random() * 350)}ms`,
  })), [count]);
  return (
    <div aria-hidden className="pointer-events-none absolute left-0 right-0 top-[18%] z-10">
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece"
          style={{ background: p.color, '--dx': p.dx, '--dy': p.dy, '--rot': p.rot, '--dur': p.dur, '--delay': p.delay } as React.CSSProperties} />
      ))}
    </div>
  );
}

/**
 * Full-screen winner announcement for the classroom projector: a title card, then 2nd runner-up,
 * runner-up and winner, one click (or Space / →) at a time. ← goes back, Esc closes.
 */
export function Announce({ room, prefix, onClose }: { room: ProjectRoom; prefix: string; onClose: () => void }) {
  const reveals = ORDER
    .map((o) => ({ ...o, project: room.projects.find((p) => p.award === o.award) }))
    .filter((r): r is typeof r & { project: Project } => Boolean(r.project));
  const [step, setStep] = useState(0); // 0 = title card, 1..n = reveals

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setStep((s) => Math.min(s + 1, reveals.length)); }
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose, reveals.length]);

  const current = step > 0 ? reveals[step - 1] : null;
  const isWinner = current?.award === 'winner';
  const next = () => setStep((s) => Math.min(s + 1, reveals.length));

  return (
    <div className="niat-backdrop fixed inset-0 z-50 flex cursor-pointer select-none flex-col items-center justify-center overflow-hidden p-6 text-center" onClick={next}>
      {isWinner && <div className="aurora" aria-hidden />}
      <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="btn-secondary absolute right-4 top-4 z-20 py-1.5 text-sm">Close (Esc)</button>

      {!current ? (
        <div key="intro" className="relative animate-fade-up">
          <div className="eyebrow">AI Bootcamp · Project awards</div>
          <h1 className="mt-4 text-[clamp(2.5rem,7vw,6rem)] font-extrabold leading-none tracking-tight">{room.name}</h1>
          <p className="mt-6 text-[clamp(1.1rem,2vw,1.75rem)] font-bold text-niat-muted">
            {reveals.length ? 'And the awards go to…' : 'No winners have been saved for this room yet.'}
          </p>
          {reveals.length > 0 && <p className="mt-10 text-sm text-niat-muted">Click or press Space to reveal</p>}
        </div>
      ) : (
        <div key={step} className="relative z-10 w-full max-w-4xl">
          <Confetti count={isWinner ? 160 : 70} />
          <div className="animate-fade-up text-[clamp(1.25rem,2.4vw,2rem)] font-extrabold uppercase tracking-[0.2em] text-niat-maroon">
            {current.title}
          </div>
          <div className="animate-seat-pop mt-4 text-[clamp(4rem,10vw,8rem)] leading-none" aria-hidden>{current.medal}</div>
          <h1 className="animate-seat-pop mt-4 text-[clamp(2.75rem,7.5vw,6.5rem)] font-extrabold leading-none tracking-tight">
            {prefix} {current.project.teamNumber}
          </h1>
          <p className="animate-fade-up mt-5 text-[clamp(1.5rem,3.2vw,2.75rem)] font-extrabold text-niat-maroon">{current.project.projectName}</p>
          <p className="animate-fade-up mx-auto mt-5 max-w-3xl text-[clamp(1rem,1.8vw,1.5rem)] font-semibold text-niat-text">
            {current.project.members.join(' · ')}
          </p>
          <p className="mt-10 text-sm text-niat-muted">
            {step < reveals.length ? 'Click or press Space for the next award' : 'Congratulations to every team!'}
          </p>
        </div>
      )}

      <div className="absolute bottom-5 flex gap-2" aria-hidden>
        {[0, ...reveals.map((_, i) => i + 1)].map((i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i === step ? 'bg-niat-maroon' : 'bg-niat-line'}`} />
        ))}
      </div>
    </div>
  );
}
