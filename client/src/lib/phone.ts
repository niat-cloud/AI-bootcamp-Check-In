/**
 * What a phone field keeps while someone types or pastes: digits only, at most 10. A pasted
 * "+91 98765 43210" or "098765 43210" drops its country code or leading 0 first, so the field can never
 * hold more than the 10-digit mobile number.
 */
export function typedPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

/** "7 of 10 digits" while a number is being typed; nothing once it's empty or complete. */
export function digitsHint(value: string): string | undefined {
  const n = value.replace(/\D/g, '').length;
  return n > 0 && n < 10 ? `${n} of 10 digits` : undefined;
}
