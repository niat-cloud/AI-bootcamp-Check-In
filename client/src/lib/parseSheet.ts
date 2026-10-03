import * as XLSX from 'xlsx';

export type FieldKey = 'name' | 'phone' | 'schoolCollege' | 'className' | 'parentPhone';

export const FIELDS: { key: FieldKey; label: string; required: boolean; patterns: RegExp[] }[] = [
  { key: 'name', label: 'Name', required: true, patterns: [/^(student\s*)?(full\s*)?name$/i, /name/i] },
  { key: 'phone', label: 'Phone', required: true, patterns: [/^(student\s*)?(phone|mobile|contact|whatsapp)(\s*(no|number|num))?\.?$/i, /^(?!.*(parent|father|mother|guardian)).*(phone|mobile|contact|whatsapp)/i] },
  { key: 'schoolCollege', label: 'School/College', required: true, patterns: [/school|college|institut|organi[sz]ation/i] },
  { key: 'className', label: 'Class', required: false, patterns: [/^(class|grade|standard|std|year)\.?$/i, /class|grade/i] },
  { key: 'parentPhone', label: 'Parent Phone', required: false, patterns: [/(parent|father|mother|guardian).*(phone|mobile|contact|no)/i] },
];

export interface ParsedSheet {
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
  sheetName: string;
}

export async function parseFile(file: File): Promise<ParsedSheet> {
  const data = await file.arrayBuffer();
  const book = XLSX.read(data, { type: 'array', raw: file.name.toLowerCase().endsWith('.csv') });
  const sheetName = book.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, raw: false, defval: '', blankrows: true });

  const text = (v: unknown) => String(v ?? '').trim();
  const headerIndex = grid.findIndex((r) => r.some((c) => text(c)));
  if (headerIndex === -1) return { headers: [], rows: [], sheetName };

  const headers = grid[headerIndex].map(text);
  const rows = grid.slice(headerIndex + 1).map((r, i) => ({
    rowNumber: headerIndex + i + 2, // 1-based spreadsheet row number
    cells: headers.map((_, c) => text(r[c])),
  }));
  // Trailing blank rows are just the end of the sheet, not data problems.
  while (rows.length && rows[rows.length - 1].cells.every((c) => !c)) rows.pop();
  return { headers, rows, sheetName };
}

export function guessMapping(headers: string[]): Record<FieldKey, number> {
  const mapping = {} as Record<FieldKey, number>;
  const used = new Set<number>();
  // Most specific fields first so "Parent Phone" isn't taken as the student's phone.
  for (const key of ['parentPhone', 'className', 'schoolCollege', 'phone', 'name'] as FieldKey[]) {
    const field = FIELDS.find((f) => f.key === key)!;
    mapping[key] = -1;
    for (const pattern of field.patterns) {
      const idx = headers.findIndex((h, i) => !used.has(i) && pattern.test(h));
      if (idx !== -1) {
        mapping[key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}

export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\.0+$/, '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const blob = new Blob(['﻿' + XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
