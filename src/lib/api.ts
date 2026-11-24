import { auth } from './firebase';

let inMemorySessionToken: string | null = null;

export const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || ''
).replace(/\/+$/, '');

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function setInMemoryAuthToken(token: string | null) {
  inMemorySessionToken = token;
}

export function getInMemoryAuthToken(): string | null {
  return inMemorySessionToken;
}

export function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed && trimmed !== '[object Object]') return trimmed;
    return fallback;
  }

  if (payload instanceof Error) {
    const msg = payload.message?.trim();
    if (msg && msg !== '[object Object]') return msg;
    return fallback;
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;

    if (typeof obj.error === 'string' && obj.error.trim() && obj.error.trim() !== '[object Object]') {
      return obj.error.trim();
    }

    if (obj.error && typeof obj.error === 'object') {
      const nested = extractErrorMessage(obj.error, '');
      if (nested) return nested;
    }

    if (typeof obj.message === 'string' && obj.message.trim() && obj.message.trim() !== '[object Object]') {
      return obj.message.trim();
    }

    if (typeof obj.detail === 'string' && obj.detail.trim() && obj.detail.trim() !== '[object Object]') {
      return obj.detail.trim();
    }

    if (typeof obj.error_description === 'string' && obj.error_description.trim()) {
      return obj.error_description.trim();
    }

    if (typeof obj.code === 'string' && obj.code.trim()) {
      return `${fallback} (${obj.code.trim()})`;
    }
  }

  return fallback;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(extractErrorMessage(message, `Request failed (${status})`));
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function parseApiResponse<T = any>(
  res: Response,
  fallbackError?: string
): Promise<T> {
  const defaultFallback = fallbackError || `Request failed (${res.status})`;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text().catch(() => '');

  const looksLikeHtml =
    contentType.includes('text/html') ||
    rawText.trimStart().startsWith('<!doctype') ||
    rawText.trimStart().startsWith('<html');

  if (looksLikeHtml) {
    const titleMatch = rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
    const htmlTitle = titleMatch ? titleMatch[1].trim() : '';
    const statusInfo = res.status ? `HTTP ${res.status}${htmlTitle ? ` - ${htmlTitle}` : ''}` : 'HTML response';
    const hint =
      res.status >= 500
        ? 'The backend API server returned a server error. Check your hosting server logs and Environment Variables (DATABASE_URL).'
        : 'Ensure the Node.js Express server handles /api/* routes or set VITE_API_BASE_URL to your backend URL.';
    throw new ApiError(
      `API request failed (${statusInfo}). ${hint}`,
      res.status || 502,
      'API_HTML_RESPONSE'
    );
  }

  let parsed: any = {};
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      if (!res.ok) {
        const snippet = rawText.trim().slice(0, 180);
        throw new ApiError(snippet || defaultFallback, res.status);
      }
      throw new ApiError('Server returned an unexpected non-JSON response.', res.status);
    }
  }

  if (!res.ok) {
    const message = extractErrorMessage(parsed, defaultFallback);
    const code =
      typeof parsed?.code === 'string'
        ? parsed.code
        : typeof parsed?.error?.code === 'string'
          ? parsed.error.code
          : undefined;
    throw new ApiError(message, res.status, code, parsed?.details);
  }

  return parsed as T;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  if (inMemorySessionToken) {
    return { Authorization: `Bearer ${inMemorySessionToken}` };
  }
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const authHeaders = await getAuthHeader();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...authHeaders,
    ...options.headers,
  };

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(buildApiUrl(path), {
    method: options.method || 'GET',
    headers,
    body,
  });

  return parseApiResponse<T>(res, `Request failed (${res.status})`);
}

export async function apiDownloadCsv(path: string, filename: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await fetch(buildApiUrl(path), { headers: authHeaders });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(extractErrorMessage(errText, 'Failed to export CSV'));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
