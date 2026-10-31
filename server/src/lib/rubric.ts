/**
 * How projects are judged. Change the criteria or their wording here; bump RUBRIC_VERSION so every
 * evaluation records which rubric scored it (earlier scores keep their own version).
 */
export const RUBRIC_VERSION = '2026-10-v1';

/** Students pick one when they submit; the AI checks the project actually fits it. */
export const PROJECT_THEMES = [
  'Student Life Problem Solver',
  'Society & Real-Life Problem Solver',
  'Community Help & Awareness',
] as const;

export interface Criterion {
  key: string;
  label: string;
  max: number;
  /** What the evaluator looks for, and what low / middle / high scores mean. */
  guide: string;
}

export const CRITERIA: Criterion[] = [
  {
    key: 'problem',
    label: 'Problem Clarity',
    max: 10,
    guide: 'Is a real problem for students, society or a community clearly shown, and does it fit the chosen theme? '
      + '0–2: no problem visible. 3–4: vague or generic. 5–6: clear but common. 7–8: specific and relatable. 9–10: sharp, well-framed, obviously worth solving.',
  },
  {
    key: 'solution',
    label: 'Solution Fit',
    max: 10,
    guide: 'Do the app\'s features actually solve the stated problem? '
      + '0–2: unrelated to the problem. 3–4: loosely related. 5–6: addresses it in a basic way. 7–8: features map well to the problem. 9–10: a thoughtful, complete answer to it.',
  },
  {
    key: 'experience',
    label: 'Working App & Experience',
    max: 10,
    guide: 'Does it look like a finished, usable app (navigation, real content, visible features) rather than a placeholder or a single static banner? '
      + '0–2: blank, error or template page. 3–4: one screen with little content. 5–6: usable basics. 7–8: polished, several working sections. 9–10: feels like a real product.',
  },
  {
    key: 'creativity',
    label: 'Creativity & Wow Factor',
    max: 10,
    guide: 'Is the idea or its execution original, with a twist that makes it memorable? '
      + '0–2: copy of a common example. 3–4: familiar idea, nothing new. 5–6: some fresh touches. 7–8: clearly original. 9–10: surprising and memorable.',
  },
  {
    key: 'impact',
    label: 'Impact & Usefulness',
    max: 10,
    guide: 'Would real people use and share it, and would it make a difference for them? '
      + '0–2: no realistic users. 3–4: niche or one-time use. 5–6: useful to some. 7–8: useful to many. 9–10: high impact, people would come back to it.',
  },
];

export const MAX_TOTAL = CRITERIA.reduce((sum, c) => sum + c.max, 0);
