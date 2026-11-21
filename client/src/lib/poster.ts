import logoUrl from '../assets/niat-logo.png';

/**
 * The "FIND YOUR SEAT" entrance poster, drawn in the browser from the event's own link so no one has to
 * rebuild it in Canva. Laid out on a 1000 × 1414 grid (A4 proportions) and rendered at 300 dpi for print.
 * The QR library loads on demand, like the QR card itself.
 */

const W = 1000;
const H = 1414; // A4: 210 × 297 mm
const FONT = '"Plus Jakarta Sans Variable", "Segoe UI", sans-serif';
const INK = '#111111';

/** A4 at 300 dpi. */
export const PRINT_WIDTH = 2480;

export interface PosterInput {
  url: string;
  /** Second line under NIAT AI BOOTCAMP, e.g. "Hyderabad | 8th Edition". */
  subtitle: string;
  /** e.g. "Sat, 14 Nov 2026 · 10:00 AM", so a poster left up from an old edition is obvious. */
  date?: string;
}

/** "Hyderabad | 8th Edition" from the event's location and name, without repeating the city. */
export function posterSubtitle(locationName: string | null, eventName: string): string {
  const name = eventName.trim();
  if (!locationName || name.toLowerCase().includes(locationName.toLowerCase())) return name;
  return `${locationName} | ${name}`;
}

// Icon outlines on a 24-unit grid.
const ICONS = {
  scan: [
    'M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2',
    'M9.5 8.5h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
  ],
  phone: ['M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2'],
  ticket: ['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z'],
  chevron: ['m9 18 6-6-6-6'],
  headset: ['M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3'],
};

function icon(ctx: CanvasRenderingContext2D, paths: string[], cx: number, cy: number, size: number, stroke = 2) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = INK;
  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of paths) ctx.stroke(new Path2D(d));
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the NIAT logo.'));
    img.src = src;
  });
}

/** The shield from the NIAT logo, recoloured from maroon to black like the printed poster. */
async function blackShield(): Promise<HTMLCanvasElement> {
  const img = await loadImage(logoUrl);
  const full = document.createElement('canvas');
  full.width = img.naturalWidth;
  full.height = img.naturalHeight;
  const fctx = full.getContext('2d')!;
  fctx.drawImage(img, 0, 0);
  const data = fctx.getImageData(0, 0, full.width, full.height);
  // The shield ends at the first fully transparent column past its middle.
  let shieldW = Math.round(full.height * 0.8);
  for (let x = Math.round(full.height * 0.5); x < full.width; x++) {
    let empty = true;
    for (let y = 0; y < full.height && empty; y++) if (data.data[(y * full.width + x) * 4 + 3] > 8) empty = false;
    if (empty) { shieldW = x; break; }
  }
  const out = document.createElement('canvas');
  out.width = shieldW;
  out.height = full.height;
  const octx = out.getContext('2d')!;
  const crop = fctx.getImageData(0, 0, shieldW, full.height);
  const p = crop.data;
  for (let i = 0; i < p.length; i += 4) {
    const light = (p[i] + p[i + 1] + p[i + 2]) / 3 > 200;
    const v = light ? 255 : 17;
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  octx.putImageData(crop, 0, 0);
  return out;
}

/** The QR as one pixel per module, to be scaled up without smoothing so every edge stays sharp. */
async function qrModules(url: string): Promise<HTMLCanvasElement> {
  const QR = await import('qrcode');
  const { modules } = QR.create(url, { errorCorrectionLevel: 'M' });
  const c = document.createElement('canvas');
  c.width = c.height = modules.size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, modules.size, modules.size);
  ctx.fillStyle = INK;
  for (let r = 0; r < modules.size; r++)
    for (let col = 0; col < modules.size; col++)
      if (modules.get(r, col)) ctx.fillRect(col, r, 1, 1);
  return c;
}

/** Sets a font no larger than `size` that keeps `text` within `maxWidth`. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxWidth) ctx.font = `${weight} ${Math.floor((size * maxWidth) / w)}px ${FONT}`;
}

/** Draws the poster at `width` pixels wide (A4 proportions). Black and white only, for office printers. */
export async function renderSeatPoster({ url, subtitle, date }: PosterInput, width = PRINT_WIDTH): Promise<HTMLCanvasElement> {
  await Promise.all([800, 700, 600, 500].map((w) => document.fonts.load(`${w} 40px "Plus Jakarta Sans Variable"`))).catch(() => {});
  const [shield, qr] = await Promise.all([blackShield(), qrModules(url)]);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((width * H) / W);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(width / W, width / W);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const spacing = (px: number) => { ctx.letterSpacing = `${px}px`; };

  // Logo
  const logoH = 128;
  const logoW = (shield.width / shield.height) * logoH;
  ctx.drawImage(shield, (W - logoW) / 2, 48, logoW, logoH);

  // FIND YOUR / SEAT: tight, heavy type
  spacing(-2.5);
  fit(ctx, 'FIND YOUR', 800, 138, 660);
  ctx.fillText('FIND YOUR', W / 2, 284);
  spacing(-4);
  ctx.font = `800 176px ${FONT}`;
  ctx.fillText('SEAT', W / 2, 424);
  const seatHalf = ctx.measureText('SEAT').width / 2;
  spacing(0);
  ctx.lineWidth = 8;
  for (const side of [-1, 1]) {
    const x = W / 2 + side * (seatHalf + 30);
    for (const [y1, dx, y2] of [[-28, 36, -50], [0, 46, 0], [28, 36, 50]]) {
      ctx.beginPath();
      ctx.moveTo(x, 362 + y1);
      ctx.lineTo(x + side * dx, 362 + y2);
      ctx.stroke();
    }
  }

  // QR inside scan corners, echoing the Scan step
  const qrSize = 330;
  const qrX = (W - qrSize) / 2;
  const qrY = 482;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  const pad = 26;
  const arm = 54;
  const r = 18;
  ctx.lineWidth = 9;
  for (const [cx, cy, sx, sy] of [
    [qrX - pad, qrY - pad, 1, 1], [qrX + qrSize + pad, qrY - pad, -1, 1],
    [qrX - pad, qrY + qrSize + pad, 1, -1], [qrX + qrSize + pad, qrY + qrSize + pad, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * arm);
    ctx.lineTo(cx, cy + sy * r);
    ctx.arcTo(cx, cy, cx + sx * r, cy, r);
    ctx.lineTo(cx + sx * arm, cy);
    ctx.stroke();
  }

  // The link, small and quiet, for a phone that cannot scan
  const link = displayLink(url);
  ctx.fillStyle = '#555';
  fit(ctx, link, 500, 17, 600);
  ctx.fillText(link, W / 2, qrY + qrSize + pad + 36);
  ctx.fillStyle = INK;

  // Instruction box
  const boxY = 900;
  ctx.fillStyle = '#EDEDED';
  ctx.beginPath();
  ctx.roundRect(64, boxY, W - 128, 122, 24);
  ctx.fill();
  ctx.fillStyle = INK;
  spacing(-1);
  fit(ctx, 'Enter your registered phone number', 800, 44, W - 190);
  ctx.fillText('Enter your registered phone number', W / 2, boxY + 58);
  spacing(0);
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = '#333';
  ctx.fillText('Use the same mobile number used for registration.', W / 2, boxY + 98);
  ctx.fillStyle = INK;

  // Three steps
  const steps: [keyof typeof ICONS, string][] = [['scan', 'Scan'], ['phone', 'Enter Number'], ['ticket', 'View Seat']];
  const xs = [220, 500, 780];
  const cy = 1112;
  const labelY = 1200;
  steps.forEach(([name, label], i) => {
    const x = xs[i];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, cy, 54, 0, Math.PI * 2);
    ctx.stroke();
    icon(ctx, ICONS[name], x, cy, 56, 2.4);

    spacing(-0.5);
    ctx.font = `800 25px ${FONT}`;
    const labelW = ctx.measureText(label).width;
    const left = x - (34 + 10 + labelW) / 2;
    ctx.beginPath();
    ctx.arc(left + 17, labelY - 9, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(String(i + 1), left + 17, labelY - 2);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = `800 25px ${FONT}`;
    ctx.fillText(label, left + 44, labelY);
    ctx.textAlign = 'center';
    spacing(0);

    if (i < 2) icon(ctx, ICONS.chevron, (x + xs[i + 1]) / 2, cy, 32, 2.6);
  });

  // NIAT AI BOOTCAMP, the event line and its date
  spacing(-0.5);
  fit(ctx, 'NIAT AI BOOTCAMP', 800, 38, 400);
  ctx.fillText('NIAT AI BOOTCAMP', W / 2, 1276);
  const titleHalf = ctx.measureText('NIAT AI BOOTCAMP').width / 2;
  spacing(0);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - titleHalf - 28, 1263);
  ctx.lineTo(W / 2 - titleHalf - 170, 1263);
  ctx.moveTo(W / 2 + titleHalf + 28, 1263);
  ctx.lineTo(W / 2 + titleHalf + 170, 1263);
  ctx.stroke();
  const eventLine = date ? `${subtitle}  ·  ${date}` : subtitle;
  fit(ctx, eventLine, 600, 23, 760);
  ctx.fillText(eventLine, W / 2, 1310);

  // Help line, clear of the edge printers clip
  ctx.font = `500 21px ${FONT}`;
  ctx.fillStyle = '#333';
  const help = 'Need help? Ask the registration desk.';
  const helpW = ctx.measureText(help).width;
  const helpLeft = W / 2 - (helpW + 38) / 2;
  headset(ctx, helpLeft + 13, 1353, 13);
  ctx.textAlign = 'left';
  ctx.fillText(help, helpLeft + 38, 1360);

  return canvas;
}

/** A filled headset: the band plus two solid ear cups. */
function headset(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.28;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.15, r, Math.PI * 1.02, Math.PI * 1.98);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(cx + side * r - (side < 0 ? r * 0.18 : r * 0.42), cy, r * 0.6, r * 0.95, r * 0.22);
    ctx.fill();
  }
  ctx.restore();
}

/** The link without https:// or a trailing slash, as a student would type it. */
function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat, 14 Nov 2026 · 10:00 AM" from the event's YYYY-MM-DD date and HH:MM time. */
export function posterDate(date: string, time?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let out = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const t = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (t) {
    const h = Number(t[1]);
    out += `  ·  ${h % 12 || 12}:${t[2]} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return out;
}

/** A one-page A4 PDF holding the poster as a full-page JPEG. Small enough to print or share as-is. */
export async function posterPdf(canvas: HTMLCanvasElement, title: string): Promise<Blob> {
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the poster.'))), 'image/jpeg', 0.92),
  );
  const img = new Uint8Array(await jpeg.arrayBuffer());
  const enc = new TextEncoder();
  const pageW = 595.28;
  const pageH = 841.89;
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  const safeTitle = title.replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, '');

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (body: string) => { offsets.push(length); push(`${offsets.length} 0 obj\n${body}\nendobj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj('<< /Type /Catalog /Pages 2 0 R >>');
  obj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets.push(length);
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);
  push(img);
  push('\nendstream\nendobj\n');
  obj(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(`<< /Title (${safeTitle}) /Producer (NIAT AI Bootcamp Check-in) >>`);
  const xref = length;
  const count = offsets.length + 1;
  push(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info ${count - 1} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}
