/** Normalize an Indian mobile number to 10 digits, or return null if it isn't one. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\.0+$/, '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return '••••••' + phone.slice(-4);
}
