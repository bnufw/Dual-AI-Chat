import path from 'path';
import { Readable } from 'stream';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
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
          server.middlewares.use('/__openai_responses_proxy', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method Not Allowed');
              return;
            }

            const target = req.headers['x-openai-target-endpoint'];
            if (typeof target !== 'string' || !target.startsWith('http')) {
              res.statusCode = 400;
              res.end('Missing x-openai-target-endpoint');
              return;
            }

            const body = await new Promise<string>((resolve, reject) => {
              let raw = '';
              req.on('data', (chunk) => {
                raw += chunk.toString();
              });
              req.on('end', () => resolve(raw));
              req.on('error', reject);
            });

            try {
              const upstream = await fetch(target, {
                method: 'POST',
                headers: {
                  'Content-Type': (req.headers['content-type'] as string) || 'application/json',
                  Authorization: (req.headers.authorization as string) || '',
                  Accept: (req.headers.accept as string) || 'application/json, text/event-stream',
                },
                body,
              });

              res.statusCode = upstream.status;
              for (const [headerName, headerValue] of upstream.headers.entries()) {
                if (headerName.toLowerCase() === 'content-encoding') {
                  continue;
                }
                res.setHeader(headerName, headerValue);
              }

              if (!upstream.body) {
                res.end();
                return;
              }

              Readable.fromWeb(upstream.body as any).pipe(res);
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: {
                  type: 'proxy_error',
                  message: error instanceof Error ? error.message : 'Proxy request failed',
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
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY || ''),
      'process.env.OPENAI_COMPAT_API_KEY': JSON.stringify(env.OPENAI_COMPAT_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
