import handler from '../api/index.js';

export interface Env {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  APP_URL?: string;
  RESEND_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_DATABASE_ID?: string;
  FIREBASE_WEB_API_KEY?: string;
  ENCRYPTION_KEY?: string;
  UNSUBSCRIBE_SIGNING_SECRET?: string;
  ALLOWED_FRONTEND_ORIGINS?: string;
  [key: string]: any;
}

function syncEnv(env: Env) {
  if (env && typeof env === 'object') {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string') {
        process.env[k] = v;
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Synchronize Cloudflare Worker environment variables and secrets to process.env
    syncEnv(env);

    const isApiRoute =
      pathname.startsWith('/api') ||
      pathname.startsWith('/submit') ||
      pathname.startsWith('/embed') ||
      pathname.startsWith('/r/') ||
      pathname === '/embed.js';

    // If not an API route and static assets are available, let Cloudflare serve the asset
    if (!isApiRoute && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Handle CORS preflight OPTIONS requests directly
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin') || '*';
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Authorization, Content-Type, Accept, Idempotency-Key, x-api-key, svix-id, svix-timestamp, svix-signature',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }

    // Convert Web Request to Node-compatible req
    const headers: Record<string, string> = {};
    for (const [k, v] of request.headers.entries()) {
      headers[k.toLowerCase()] = v;
    }

    let bodyBuffer: Buffer | null = null;
    let rawBody = '';
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const arrayBuf = await request.arrayBuffer();
        bodyBuffer = Buffer.from(arrayBuf);
        rawBody = bodyBuffer.toString('utf8');
      } catch {
        // empty body
      }
    }

    let parsedBody: any = undefined;
    const contentType = headers['content-type'] || '';
    if (rawBody && contentType.includes('application/json')) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // preserve unparsed buffer/rawBody
      }
    }

    const req: any = {
      method: request.method,
      url: url.pathname + url.search,
      headers,
      body: parsedBody !== undefined ? parsedBody : bodyBuffer,
      rawBody,
      query: Object.fromEntries(url.searchParams.entries()),
      socket: {
        remoteAddress:
          headers['cf-connecting-ip'] ||
          headers['x-forwarded-for']?.split(',')[0]?.trim() ||
          '127.0.0.1',
      },
    };

    let statusCode = 200;
    const responseHeaders = new Headers();
    let responseBody: any = null;
    let headersSent = false;

    await new Promise<void>((resolve) => {
      const res: any = {
        get statusCode() {
          return statusCode;
        },
        set statusCode(code: number) {
          statusCode = code;
        },
        get headersSent() {
          return headersSent;
        },
        setHeader(name: string, value: string) {
          responseHeaders.set(name, value);
        },
        getHeader(name: string) {
          return responseHeaders.get(name);
        },
        end(chunk?: any) {
          headersSent = true;
          if (chunk !== undefined && chunk !== null) {
            responseBody = chunk;
          }
          resolve();
        },
      };

      Promise.resolve(handler(req, res))
        .then(() => {
          if (!headersSent) {
            res.end();
          }
        })
        .catch((err) => {
          statusCode = 500;
          responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
          responseBody = JSON.stringify({
            ok: false,
            error: typeof err?.message === 'string' ? err.message : 'Internal Server Error',
          });
          resolve();
        });
    });

    // Ensure fallback content-type if JSON body was returned without Content-Type
    if (
      typeof responseBody === 'string' &&
      responseBody.startsWith('{') &&
      !responseHeaders.has('Content-Type')
    ) {
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
    }

    return new Response(responseBody, {
      status: statusCode,
      headers: responseHeaders,
    });
  },

  async scheduled(event: any, env: Env, ctx: any) {
    syncEnv(env);
    const fakeReq: any = {
      method: 'GET',
      url: '/api/cron/campaigns',
      headers: {},
      query: {},
    };
    const fakeRes: any = {
      statusCode: 200,
      headersSent: false,
      setHeader() {},
      end() {},
    };
    await handler(fakeReq, fakeRes);
  },
};
