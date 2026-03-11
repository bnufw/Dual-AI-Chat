import path from 'path';
import { Readable } from 'stream';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleOpenAiCompatibleProxyRequest } from './api/_openaiCompatibleProxy';

const OPENAI_PROXY_PATH = '/api/openai-compatible';

const readNodeRequestBody = (req: any) => new Promise<string>((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk: Buffer | string) => {
    raw += chunk.toString();
  });
  req.on('end', () => resolve(raw));
  req.on('error', reject);
});

const buildWebHeaders = (rawHeaders: Record<string, string | string[] | undefined>) => {
  const headers = new Headers();
  Object.entries(rawHeaders).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
      return;
    }
    if (typeof value === 'string') {
      headers.set(key, value);
    }
  });
  return headers;
};

const writeWebResponse = async (response: Response, res: any) => {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body as any).pipe(res);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  process.env.GEMINI_API_KEY ||= env.GEMINI_API_KEY || '';
  process.env.OPENAI_API_KEY ||= env.OPENAI_API_KEY || env.KEY || '';
  process.env.OPENAI_COMPAT_API_KEY ||= env.OPENAI_COMPAT_API_KEY || env.KEY2 || '';
  process.env.KEY ||= env.KEY || '';
  process.env.KEY2 ||= env.KEY2 || '';
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'openai-responses-proxy',
        configureServer(server) {
          server.middlewares.use(OPENAI_PROXY_PATH, async (req, res) => {
            try {
              const abortController = new AbortController();
              req.on('close', () => {
                if (!res.writableEnded) {
                  abortController.abort();
                }
              });

              const body = await readNodeRequestBody(req);
              const request = new Request(`http://vite.local${OPENAI_PROXY_PATH}`, {
                method: req.method || 'GET',
                headers: buildWebHeaders(req.headers),
                body: body || undefined,
                signal: abortController.signal,
              });
              const response = await handleOpenAiCompatibleProxyRequest(request);
              await writeWebResponse(response, res);
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: {
                  type: 'vite_proxy_error',
                  message: error instanceof Error ? error.message : 'Vite proxy request failed.',
                  retryable: false,
                },
              }));
            }
          });
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY || env.KEY || ''),
      'process.env.OPENAI_COMPAT_API_KEY': JSON.stringify(env.OPENAI_COMPAT_API_KEY || env.KEY2 || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
