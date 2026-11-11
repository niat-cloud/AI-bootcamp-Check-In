/** The quick questions asked at check-in: class, subjects (stream) and lunch. Codes match the server. */

export type Grade = 'class_11' | 'class_12' | 'passed_12' | 'college' | 'other';
export type Stream = 'maths' | 'pcmb' | 'pcm_cs' | 'pcm_e' | 'pcm_s' | 'commerce' | 'arts' | 'biology' | 'other';
export type Lunch = 'veg' | 'non_veg';

export interface Answers {
  grade: Grade;
  stream: Stream | null;
  /** "Other" in the student's words, or a college student's course. */
  studyDetail: string | null;
  lunch: Lunch;
}

/** Worded exactly as on the registration form, so check-in answers line up with registrations. */
export const GRADE_OPTIONS: { value: Grade; label: string; sub: string }[] = [
  { value: 'class_12', label: '12th', sub: 'Intermediate 2nd year' },
  { value: 'class_11', label: '11th', sub: 'Intermediate 1st year' },
];

export const STREAM_OPTIONS: { value: Stream; label: string; sub: string }[] = [
  { value: 'maths', label: 'PCM / MPC (Maths)', sub: '' },
  { value: 'pcmb', label: 'PCMB (Maths + Biology)', sub: '' },
  { value: 'pcm_cs', label: 'PCM + CS (Maths + Computer Science)', sub: '' },
  { value: 'pcm_e', label: 'PCM + E (Maths + Electronics)', sub: '' },
  { value: 'pcm_s', label: 'PCM + S (Maths + Statistics)', sub: '' },
  { value: 'commerce', label: 'Commerce', sub: '' },
  { value: 'arts', label: 'Arts', sub: '' },
];

export const LUNCH_OPTIONS: { value: Lunch; label: string; sub: string; icon: string }[] = [
  { value: 'veg', label: 'Veg', sub: 'Vegetarian', icon: '🥗' },
  { value: 'non_veg', label: 'Non-veg', sub: 'Chicken, egg', icon: '🍗' },
];

export const GRADE_LABEL: Record<Grade, string> = {
  class_11: 'Class 11', class_12: 'Class 12', passed_12: 'Finished Class 12', college: 'College / Diploma', other: 'Other',
};
export const STREAM_LABEL: Record<Stream, string> = {
  maths: 'PCM / MPC', pcmb: 'PCMB', pcm_cs: 'PCM + CS', pcm_e: 'PCM + E', pcm_s: 'PCM + S',
  commerce: 'Commerce', arts: 'Arts', biology: 'Biology', other: 'Other',
};
export const LUNCH_LABEL: Record<Lunch, string> = { veg: 'Veg', non_veg: 'Non-veg' };

/** School classes, where the subjects question is asked. */
export const hasStream = (g: Grade | null | undefined) => g === 'class_11' || g === 'class_12' || g === 'passed_12';

/** "Class 12 · Maths", "College / Diploma · B.Tech CSE", or the student's own words for "Other". */
export function classLabel(a: Pick<Answers, 'grade' | 'stream' | 'studyDetail'>): string {
  if (a.grade === 'other') return a.studyDetail ?? 'Other';
  const stream = a.stream === 'other' ? a.studyDetail : a.stream ? STREAM_LABEL[a.stream] : a.studyDetail;
  return [GRADE_LABEL[a.grade], stream].filter(Boolean).join(' · ');
}
