import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiConfigured, evaluateProject } from '../src/lib/evaluator.js';

describe('Evaluator AI Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('reports configured when GEMINI_API_KEY is present', () => {
    expect(aiConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    expect(aiConfigured()).toBe(true);
  });

  it('reports configured when ANTHROPIC_API_KEY is present', () => {
    expect(aiConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    expect(aiConfigured()).toBe(true);
  });

  it('evaluates project with Gemini and parses structured response', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const mockGeminiOutput = {
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              {
                text: JSON.stringify({
                  verdict: 'scored',
                  criteria: [
                    { key: 'problem', score: 8, reason: 'Clearly defined student problem.' },
                    { key: 'solution', score: 7, reason: 'Features match the stated issue.' },
                    { key: 'experience', score: 8, reason: 'Interactive UI with clean sections.' },
                    { key: 'creativity', score: 6, reason: 'Good design touch.' },
                    { key: 'impact', score: 9, reason: 'Very relevant to bootcamp students.' },
                  ],
                  summary: 'A clean student helper tool built with modern UI components.',
                  strengths: 'Clear UI and responsive layout.',
                  improvements: 'Add user authentication and notes export.',
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockGeminiOutput), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await evaluateProject(
      {
        projectName: 'SmartNotes',
        theme: 'Student Life Problem Solver',
        problemStatement: 'Students struggle to organize exam notes.',
        url: 'https://smartnotes.lovable.app',
      },
      {
        title: 'SmartNotes App',
        text: 'Organize notes efficiently with study groups.',
        screenshot: Buffer.from('fake-screenshot'),
        rendered: true,
      }
    );

    expect(result.verdict).toBe('scored');
    expect(result.total).toBe(38); // 8 + 7 + 8 + 6 + 9
    expect(result.criteria).toHaveLength(5);
    expect(result.criteria[0]).toEqual({
      key: 'problem',
      label: 'Problem Clarity',
      score: 8,
      max: 10,
      reason: 'Clearly defined student problem.',
    });
    expect(result.summary).toContain('clean student helper');
    expect(result.model).toContain('gemini/');
  });

  it('clamps scores when verdict is not_evaluable', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const mockGeminiOutput = {
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              {
                text: JSON.stringify({
                  verdict: 'not_evaluable',
                  criteria: [
                    { key: 'problem', score: 5, reason: 'Blank page.' },
                    { key: 'solution', score: 0, reason: 'No features.' },
                    { key: 'experience', score: 0, reason: 'No features.' },
                    { key: 'creativity', score: 0, reason: 'No features.' },
                    { key: 'impact', score: 0, reason: 'No features.' },
                  ],
                  summary: 'The page failed to load and displayed a blank white screen.',
                  strengths: 'None visible.',
                  improvements: 'Ensure the project is published properly.',
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockGeminiOutput), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const result = await evaluateProject(
      {
        projectName: 'Blank',
        theme: 'Student Life Problem Solver',
        problemStatement: 'Problem statement text here.',
        url: 'https://blank.lovable.app',
      },
      {
        title: 'Blank',
        text: '',
        screenshot: null,
        rendered: false,
      }
    );

    expect(result.verdict).toBe('not_evaluable');
    expect(result.total).toBe(0);
    for (const c of result.criteria) {
      expect(c.score).toBe(0);
    }
  });
});

