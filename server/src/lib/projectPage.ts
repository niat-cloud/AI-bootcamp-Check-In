import { AppError } from './errors.js';

/**
 * Checking and reading the project links students submit (mostly published Lovable apps).
 * Lovable apps render in the browser, so a plain fetch only sees an empty shell: the evaluator reads
 * the rendered page through Browserless when BROWSERLESS_TOKEN is set.
 */

const BROWSERLESS_URL = (process.env.BROWSERLESS_URL || 'https://production-sfo.browserless.io').replace(/\/+$/, '');
const USER_AGENT = 'Mozilla/5.0 (compatible; NIAT-AI-Bootcamp/1.0; +project-review)';
/** Page text sent to the evaluator. Student apps are far shorter; this only guards against huge pages. */
const MAX_TEXT_CHARS = 30_000;

export const browserCaptureEnabled = () => Boolean(process.env.BROWSERLESS_TOKEN);

const linkError = (message: string) => new AppError(400, 'INVALID_PROJECT_LINK', message);

/** Turns what a student typed into a checked https URL, with a specific message for the usual mistakes. */
export function normalizeProjectUrl(raw: string): string {
  let value = raw.trim().replace(/\s+/g, '');
  if (!value) throw linkError('Paste your project link.');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw linkError('That doesn’t look like a link. Copy it from your browser’s address bar and paste it here.');
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':')) {
    throw linkError('That doesn’t look like a public website link.');
  }
  if ((host === 'lovable.dev' || host.endsWith('.lovable.dev')) && url.pathname.startsWith('/projects')) {
    throw linkError('This is your Lovable editor link, which only you can open. In Lovable, click Publish and paste the link that ends in .lovable.app.');
  }
  if (host.endsWith('.lovable.app') && host.includes('preview--')) {
    throw linkError('This is a preview link, which only you can open. In Lovable, click Publish and paste the published link that ends in .lovable.app.');
  }
  url.hash = '';
  return url.toString();
}

/** Makes sure the published page opens, so a broken link is fixed while the team is still in the room. */
export async function assertReachable(url: string): Promise<void> {
  let status: number;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    await res.body?.cancel().catch(() => {});
  } catch {
    throw linkError('We couldn’t open this link. Check that it’s complete and that the project is published, then try again.');
  }
  if (status >= 400) {
    throw linkError(`We couldn’t open this link (error ${status}). Make sure the project is published and the link is complete.`);
  }
}

export interface CapturedPage {
  title: string;
  text: string;
  screenshot: Buffer | null;
  /** true when the page was rendered in a real browser; false for the plain-HTML fallback. */
  rendered: boolean;
}

const htmlText = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim();

const BQL_BASE = `
  goto(url: $url, waitUntil: networkIdle, timeout: 25000) { status }
  title { title }
  text { text }`;
const BQL_WITH_SCREENSHOT = `mutation Capture($url: String!) {
  viewport(width: 1366, height: 900) { width }${BQL_BASE}
  screenshot(type: jpeg, quality: 60) { base64 }
}`;
const BQL_TEXT_ONLY = `mutation Capture($url: String!) {${BQL_BASE}
}`;

async function runBql(query: string, url: string) {
  const endpoint = `${BROWSERLESS_URL}/chrome/bql?token=${encodeURIComponent(process.env.BROWSERLESS_TOKEN!)}&blockConsentModals=true`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { url }, operationName: 'Capture' }),
    signal: AbortSignal.timeout(35_000),
  });
  const body = await res.json().catch(() => null) as { data?: any; errors?: { message: string }[] } | null;
  if (!res.ok || !body?.data || body.errors?.length) {
    throw new Error(`Browserless: ${body?.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  }
  return body.data;
}

async function captureWithBrowser(url: string): Promise<CapturedPage> {
  // The screenshot shows the evaluator the design. If the screenshot step fails, read the text alone.
  let data: any;
  try {
    data = await runBql(BQL_WITH_SCREENSHOT, url);
  } catch {
    data = await runBql(BQL_TEXT_ONLY, url);
  }
  const status = Number(data.goto?.status);
  if (status >= 400) throw new Error(`The page answered with error ${status}.`);
  const b64 = data.screenshot?.base64 as string | undefined;
  return {
    title: String(data.title?.title ?? '').trim(),
    text: String(data.text?.text ?? '').replace(/\s+\n/g, '\n').trim().slice(0, MAX_TEXT_CHARS),
    screenshot: b64 ? Buffer.from(b64, 'base64') : null,
    rendered: true,
  };
}

async function captureWithFetch(url: string): Promise<CapturedPage> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status >= 400) throw new Error(`The page answered with error ${res.status}.`);
  const html = (await res.text()).slice(0, 2_000_000);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const description = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? '';
  const text = [description, htmlText(html)].filter(Boolean).join('\n').slice(0, MAX_TEXT_CHARS);
  return { title, text, screenshot: null, rendered: false };
}

export function capturePage(url: string): Promise<CapturedPage> {
  return browserCaptureEnabled() ? captureWithBrowser(url) : captureWithFetch(url);
}
