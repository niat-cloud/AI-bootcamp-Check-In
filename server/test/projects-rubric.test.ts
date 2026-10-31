import { describe, expect, it } from 'vitest';
import { CRITERIA, MAX_TOTAL, PROJECT_THEMES, RUBRIC_VERSION } from '../src/lib/rubric.js';
import { shortName, submissionInput, reviewInput, awardsInput } from '../src/services/projects.js';

describe('Rubric & Definitions', () => {
  it('defines 5 criteria totaling 50 points', () => {
    expect(CRITERIA.length).toBe(5);
    expect(MAX_TOTAL).toBe(50);
    expect(CRITERIA.map((c) => c.key)).toEqual([
      'problem',
      'solution',
      'experience',
      'creativity',
      'impact',
    ]);
    for (const c of CRITERIA) {
      expect(c.max).toBe(10);
      expect(c.guide).toBeTruthy();
    }
  });

  it('has a valid rubric version and themes', () => {
    expect(RUBRIC_VERSION).toBe('2026-10-v1');
    expect(PROJECT_THEMES).toContain('Student Life Problem Solver');
    expect(PROJECT_THEMES).toContain('Society & Real-Life Problem Solver');
    expect(PROJECT_THEMES).toContain('Community Help & Awareness');
  });
});

describe('shortName helper', () => {
  it('shortens names to first name(s) + last initial', () => {
    expect(shortName('Sai Kumar Reddy')).toBe('Sai Kumar R.');
    expect(shortName('Rahul Sharma')).toBe('Rahul S.');
    expect(shortName('Priya')).toBe('Priya');
    expect(shortName('  Ananya  ')).toBe('Ananya');
    expect(shortName('K. S. Varma')).toBe('K. S. V.');
  });
});

describe('Input Validation Schemas', () => {
  it('validates submission input', () => {
    const valid = {
      memberId: 42,
      phone: '9876543210',
      projectName: 'StudyBud',
      theme: 'Student Life Problem Solver',
      problemStatement: 'Students struggle to find study groups and share notes effectively.',
      projectUrl: 'https://studybud.lovable.app',
    };
    expect(submissionInput.parse(valid)).toMatchObject(valid);

    // Rejects invalid theme
    expect(() => submissionInput.parse({ ...valid, theme: 'Invalid Theme' })).toThrow();

    // Rejects too short problem statement
    expect(() => submissionInput.parse({ ...valid, problemStatement: 'Too short' })).toThrow();

    // Rejects missing project name
    expect(() => submissionInput.parse({ ...valid, projectName: ' ' })).toThrow();

    // Rejects a submission without the member's phone number
    const { phone: _phone, ...withoutPhone } = valid;
    expect(() => submissionInput.parse(withoutPhone)).toThrow();
  });

  it('validates review input', () => {
    expect(reviewInput.parse({ adminScore: 45, adminNote: 'Great UI', disqualified: false })).toEqual({
      adminScore: 45,
      adminNote: 'Great UI',
      disqualified: false,
    });
    // Score cannot exceed MAX_TOTAL (50)
    expect(() => reviewInput.parse({ adminScore: 55 })).toThrow();
    expect(() => reviewInput.parse({ adminScore: -5 })).toThrow();
  });

  it('validates awards input', () => {
    expect(awardsInput.parse({ winner: 1, runner_up: 2, second_runner_up: 3 })).toEqual({
      winner: 1,
      runner_up: 2,
      second_runner_up: 3,
    });
    expect(awardsInput.parse({ winner: 1, runner_up: null, second_runner_up: null })).toEqual({
      winner: 1,
      runner_up: null,
      second_runner_up: null,
    });
  });
});

