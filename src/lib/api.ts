import { auth } from './firebase';

let inMemorySessionToken: string | null = null;

export function setInMemoryAuthToken(token: string | null) {
  inMemorySessionToken = token;
}

export function getInMemoryAuthToken(): string | null {
  return inMemorySessionToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
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

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data.error || `Request failed (${res.status})`,
      res.status,
      data.code,
      data.details
    );
  }
  return data as T;
}

export async function apiDownloadCsv(path: string, filename: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await fetch(path, { headers: authHeaders });
  if (!res.ok) {
    throw new Error('Failed to export CSV');
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
