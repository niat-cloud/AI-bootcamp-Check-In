import { z } from 'zod';

/** Class choices at check-in, as on the registration form. The other codes are kept for answers already given. */
export const GRADES = {
  class_12: 'Class 12',
  class_11: 'Class 11',
  passed_12: 'Finished Class 12',
  college: 'College / Diploma',
  other: 'Other',
} as const;

/** Streams, worded as on the registration form. Biology and Other are kept for answers already given. */
export const STREAMS = {
  maths: 'PCM / MPC (Maths)',
  pcmb: 'PCMB (Maths + Biology)',
  pcm_cs: 'PCM + CS (Maths + Computer Science)',
  pcm_e: 'PCM + E (Maths + Electronics)',
  pcm_s: 'PCM + S (Maths + Statistics)',
  commerce: 'Commerce',
  arts: 'Arts',
  biology: 'Biology',
  other: 'Other',
} as const;

export const LUNCH = { veg: 'Veg', non_veg: 'Non-veg' } as const;

type Grade = keyof typeof GRADES;
type Stream = keyof typeof STREAMS;
const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/** School classes, where a stream is asked. */
export const hasStream = (grade: Grade) => grade === 'class_11' || grade === 'class_12' || grade === 'passed_12';

/** The quick questions: class, stream (or course) and lunch. */
export const answersInput = z.object({
  grade: z.enum(keys(GRADES)),
  stream: z.enum(keys(STREAMS)).nullish(),
  studyDetail: z.string().trim().max(100).nullish(),
  lunch: z.enum(keys(LUNCH)),
}).superRefine((a, ctx) => {
  if (hasStream(a.grade) && !a.stream) ctx.addIssue({ code: 'custom', path: ['stream'], message: 'Choose your subjects.' });
  const needsDetail = a.grade === 'other' || (hasStream(a.grade) && a.stream === 'other');
  if (needsDetail && (a.studyDetail ?? '').length < 2) {
    ctx.addIssue({ code: 'custom', path: ['studyDetail'], message: 'Tell us your class or subjects.' });
  }
}).transform((a) => ({
  grade: a.grade,
  stream: hasStream(a.grade) ? (a.stream as Stream) : null,
  studyDetail: a.studyDetail?.replace(/\s+/g, ' ') || null,
  lunch: a.lunch,
}));
export type Answers = z.infer<typeof answersInput>;

/** "Class 12 · Maths", "College / Diploma · B.Tech CSE", or the student's own words for "Other". */
export function classLabel(a: { grade: string | null; stream: string | null; studyDetail: string | null }): string | null {
  if (!a.grade) return null;
  if (a.grade === 'other') return a.studyDetail;
  // Short stream names ("PCM / MPC", not "PCM / MPC (Maths)"), as the check-in page shows them.
  const stream = a.stream === 'other' ? a.studyDetail : a.stream ? STREAMS[a.stream as Stream].replace(/ \(.*\)$/, '') : a.studyDetail;
  return [GRADES[a.grade as Grade], stream].filter(Boolean).join(' · ');
}
