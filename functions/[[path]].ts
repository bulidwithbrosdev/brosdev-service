import worker, { type Env } from '../src/worker.ts';

interface PagesContext {
  request: Request;
  env: Env;
  params: { path: string[] };
  waitUntil: (promise: Promise<any>) => void;
  next: () => Promise<Response>;
  data: Record<string, any>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  const isApiRoute =
    pathname.startsWith('/api') ||
    pathname.startsWith('/submit') ||
    pathname.startsWith('/embed') ||
    pathname.startsWith('/r/') ||
    pathname === '/embed.js';

  // If not an API route, pass through to Cloudflare Pages static asset handler
  if (!isApiRoute) {
    return context.next();
  }

  // Handle via Worker API handler
  return worker.fetch(context.request, context.env, {
    waitUntil: (p: Promise<any>) => context.waitUntil(p),
  });
}
