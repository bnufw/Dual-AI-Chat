const getEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const normalizeEndpoint = (baseUrl) => {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (!normalized) return '';
  return normalized.endsWith('/responses') ? normalized : `${normalized}/responses`;
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      return {};
    }
  }
  return body;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const body = parseBody(req.body);
  const resolvedBaseUrl = getEnvValue('OPENAI_COMPAT_URL', 'OpanAI_URL') || String(body.baseUrl || '').trim();
  const resolvedApiKey = getEnvValue('OPENAI_COMPAT_KEY', 'KEY') || String(body.apiKey || '').trim();
  const endpoint = normalizeEndpoint(resolvedBaseUrl);

  if (!endpoint) {
    res.status(500).json({
      error: {
        message: 'OpenAI proxy 缺少 URL。请在 Vercel 环境变量中配置 OPENAI_COMPAT_URL 或 OpanAI_URL。',
      },
    });
    return;
  }

  if (!resolvedApiKey) {
    res.status(500).json({
      error: {
        message: 'OpenAI proxy 缺少 KEY。请在 Vercel 环境变量中配置 OPENAI_COMPAT_KEY 或 KEY。',
      },
    });
    return;
  }

  const upstreamPayload = { ...body };
  delete upstreamPayload.baseUrl;
  delete upstreamPayload.apiKey;

  try {
    const upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedApiKey}`,
      },
      body: JSON.stringify(upstreamPayload),
    });

    const responseText = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8';

    res.status(upstreamResponse.status);
    res.setHeader('Content-Type', contentType);
    res.send(responseText);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    res.status(502).json({
      error: {
        message: `OpenAI proxy 转发失败: ${message}`,
      },
    });
  }
}
