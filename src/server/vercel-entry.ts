import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from './app.ts';

let cachedApp: ReturnType<typeof createApiApp> | null = null;
let initError: Error | null = null;

function getApp() {
  if (cachedApp) return cachedApp;
  if (initError) throw initError;
  try {
    cachedApp = createApiApp();
    return cachedApp;
  } catch (err: any) {
    initError = err instanceof Error ? err : new Error(String(err));
    throw initError;
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = getApp();
    return (app as any)(req, res);
  } catch (err: any) {
    console.error('Vercel API handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: err?.message || 'API server failed to initialize.',
        })
      );
    }
  }
}
