import { useState } from 'react';
import { api, type SeatAssignment } from '../../lib/api';
import { atLeast } from '../../lib/device';
import { CtaButton } from '../../components/kiosk/CtaButton';
import { FloatingInput, Notice } from '../../components/kiosk/Form';
import { ProgressPopup } from '../../components/kiosk/ProgressPopup';

const PHONE = /^(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}$/;
const STEPS = ['Saving your details', 'Finding your team', 'Reserving your seat'];

export default function WalkInForm({
  initialName,
  initialPhone,
  onCancel,
  onAssigned,
  onError,
}: {
  initialName: string;
  initialPhone: string;
  onCancel: () => void;
  onAssigned: (a: SeatAssignment) => void;
  onError: (err: unknown) => void;
}) {
  const [form, setForm] = useState({
    name: initialName,
    phone: initialPhone,
    parentPhone: '',
    schoolCollege: '',
    className: '',
    location: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: '' });
  };

  const ok = {
    name: form.name.trim().length >= 2,
    phone: PHONE.test(form.phone.trim()),
    parentPhone: PHONE.test(form.parentPhone.trim()),
    location: form.location.trim().length >= 2,
    schoolCollege: form.schoolCollege.trim().length >= 2,
  };
  const filled = Object.values(ok).filter(Boolean).length;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!ok.name) e.name = 'Please enter your full name';
    if (!ok.phone) e.phone = 'Enter a valid 10-digit mobile number';
    if (!ok.parentPhone) e.parentPhone = 'Enter a valid 10-digit mobile number';
    if (!ok.location) e.location = "Please enter the location you're coming from";
    if (!ok.schoolCollege) e.schoolCollege = 'Please enter your school or college';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setServerError(null);
    try {
      onAssigned(await atLeast(api<SeatAssignment>('/checkin/walk-in', { body: form }), 900));
    } catch (err) {
      setBusy(false);
      try {
        onError(err);
      } catch {
        setServerError((err as Error).message);
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl pb-28 pt-1 text-center sm:pb-0 sm:pt-6">
      {busy && <ProgressPopup title="Creating your pass" steps={STEPS} />}

      <div className="eyebrow animate-fade-up">Welcome to the community</div>
      <h1 className="mt-2 animate-fade-up text-3xl font-extrabold tracking-tight sm:text-5xl">New to the list?</h1>
      <p className="mt-2 animate-fade-up text-base text-niat-muted sm:text-lg">No worries. Let's get you checked in.</p>

      <form
        id="walkin-form"
        onSubmit={submit}
        noValidate
        className="mt-6 animate-scale-in rounded-[var(--radius-card)] border border-niat-line bg-white/90 p-5 text-left shadow-[var(--shadow-card)] backdrop-blur sm:mt-7 sm:p-8"
      >
        {/* Progress: fills as each required field becomes valid (5 fields) */}
        <div className="mb-5 flex items-center gap-3" aria-label={`${filled} of 5 details complete`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-niat-line/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-niat-maroon to-niat-gold transition-[width] duration-500 ease-[var(--ease-out-soft)]"
              style={{ width: `${(filled / 5) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums text-niat-muted">{filled}/5</span>
        </div>

        <div className="space-y-4">
          {[
            <FloatingInput
              key="n"
              label="Full Name"
              value={form.name}
              onChange={set('name')}
              error={errors.name}
              valid={ok.name}
              autoFocus
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
            />,
            <div key="p" className="grid gap-4 sm:grid-cols-2">
              <FloatingInput
                label="Phone Number"
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                error={errors.phone}
                valid={ok.phone}
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
                enterKeyHint="next"
              />
              <FloatingInput
                label="Parent Phone Number"
                type="tel"
                value={form.parentPhone}
                onChange={set('parentPhone')}
                error={errors.parentPhone}
                valid={ok.parentPhone}
                inputMode="tel"
                autoComplete="off"
                maxLength={16}
                enterKeyHint="next"
              />
            </div>,
            <FloatingInput
              key="loc"
              label="The location you're coming from"
              value={form.location}
              onChange={set('location')}
              error={errors.location}
              valid={ok.location}
              autoComplete="address-level2"
              autoCapitalize="words"
              hint="e.g. Madhapur, Gachibowli, Secunderabad, Warangal"
              enterKeyHint="next"
            />,
            <FloatingInput
              key="s"
              label="School / College"
              value={form.schoolCollege}
              onChange={set('schoolCollege')}
              error={errors.schoolCollege}
              valid={ok.schoolCollege}
              autoComplete="organization"
              autoCapitalize="words"
              enterKeyHint="next"
            />,
            <FloatingInput
              key="c"
              label="Class (optional)"
              value={form.className}
              onChange={set('className')}
              autoComplete="off"
              enterKeyHint="done"
            />,
          ].map((field, i) => (
            <div key={i} className="stagger animate-fade-up" style={{ '--i': i + 2 } as React.CSSProperties}>
              {field}
            </div>
          ))}
        </div>

        {serverError && (
          <div className="mt-5">
            <Notice>{serverError}</Notice>
          </div>
        )}

        <div className="mt-7 hidden sm:block">
          <CtaButton type="submit" loading={busy} loadingLabel="Saving your spot" className="w-full">
            Register &amp; Get My Seat
          </CtaButton>
        </div>
      </form>

      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="mt-4 cursor-pointer rounded-lg px-3 py-2 font-semibold text-niat-muted transition-colors hover:text-niat-maroon focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 disabled:opacity-40"
      >
        ← Back to search
      </button>

      {/* Phone: the main action sits in the thumb zone. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-niat-line bg-white/85 px-5 pt-3 backdrop-blur-md sm:hidden">
        <CtaButton type="submit" form="walkin-form" loading={busy} loadingLabel="Saving your spot" className="w-full">
          Register &amp; Get My Seat
        </CtaButton>
      </div>
    </div>
  );
}
