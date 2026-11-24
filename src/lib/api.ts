import { exportSubmissionsCsvFromFirestore, handleFirestoreApi } from './firestoreApi';

export const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || ''
).replace(/\/+$/, '');

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed && trimmed !== '[object Object]') {
      // Unwrap structured FirestoreErrorInfo JSON if present
      if (trimmed.startsWith('{') && trimmed.includes('"operationType"')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed?.error === 'string' && parsed.error.trim()) {
            return parsed.error.trim();
          }
        } catch {
          // Keep original string
        }
      }
      return trimmed;
    }
    return fallback;
  }

  if (payload instanceof Error) {
    return extractErrorMessage(payload.message, fallback);
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

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  try {
    return await handleFirestoreApi<T>(path, options.method || 'GET', options.body);
  } catch (err: unknown) {
    throw new ApiError(extractErrorMessage(err, 'Request failed. Please try again.'), 400);
  }
}

export async function apiDownloadCsv(path: string, filename: string): Promise<void> {
  const queryStr = path.includes('?') ? path.split('?')[1] : '';
  const csv = await exportSubmissionsCsvFromFirestore(queryStr);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
