const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

type OpenAiProxyRequestPayload = {
  endpoint?: unknown;
  apiKey?: unknown;
  requestBody?: unknown;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });

const getKnownEndpointEnvApiKey = (endpoint: URL) => {
  if (endpoint.hostname === 'codex-api.packycode.com') {
    return process.env.OPENAI_API_KEY?.trim() || process.env.KEY?.trim() || '';
  }
  if (endpoint.hostname === 'api.ai-wave.org') {
    return process.env.OPENAI_COMPAT_API_KEY?.trim() || process.env.KEY2?.trim() || '';
  }
  return '';
};

const getResolvedApiKey = (endpoint: URL, apiKey: unknown) => {
  if (typeof apiKey === 'string' && apiKey.trim()) {
    return apiKey.trim();
  }
  return getKnownEndpointEnvApiKey(endpoint);
};

const buildForwardHeaders = (apiKey: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json, text/event-stream',
});

const getForwardResponseHeaders = (upstream: Response) => {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'content-encoding' || lowerKey === 'content-length') {
      return;
    }
    headers.set(key, value);
  });
  return headers;
};

export const handleOpenAiCompatibleProxyRequest = async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      error: {
        type: 'method_not_allowed',
        message: 'Method Not Allowed',
        retryable: false,
      },
    });
  }

  let payload: OpenAiProxyRequestPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse(400, {
      error: {
        type: 'invalid_json',
        message: 'Invalid JSON request body.',
        retryable: false,
      },
    });
  }

  if (!isPlainObject(payload)) {
    return jsonResponse(400, {
      error: {
        type: 'invalid_payload',
        message: 'Request body must be a JSON object.',
        retryable: false,
      },
    });
  }

  if (typeof payload.endpoint !== 'string' || !payload.endpoint.trim()) {
    return jsonResponse(400, {
      error: {
        type: 'missing_endpoint',
        message: 'Endpoint is required.',
        retryable: false,
      },
    });
  }

  if (!isPlainObject(payload.requestBody)) {
    return jsonResponse(400, {
      error: {
        type: 'invalid_request_body',
        message: 'requestBody must be a JSON object.',
        retryable: false,
      },
    });
  }

  let endpoint: URL;
  try {
    endpoint = new URL(payload.endpoint);
  } catch (error) {
    return jsonResponse(400, {
      error: {
        type: 'invalid_endpoint',
        message: 'Endpoint must be an absolute URL.',
        retryable: false,
      },
    });
  }

  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    return jsonResponse(400, {
      error: {
        type: 'invalid_endpoint_protocol',
        message: 'Endpoint protocol must be http or https.',
        retryable: false,
      },
    });
  }

  const apiKey = getResolvedApiKey(endpoint, payload.apiKey);
  if (!apiKey) {
    return jsonResponse(400, {
      error: {
        type: 'missing_api_key',
        message: 'API key not configured for this endpoint.',
        retryable: false,
      },
    });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: buildForwardHeaders(apiKey),
      body: JSON.stringify(payload.requestBody),
      signal: request.signal,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: getForwardResponseHeaders(upstream),
    });
  } catch (error) {
    return jsonResponse(502, {
      error: {
        type: 'proxy_error',
        message: error instanceof Error ? error.message : 'Proxy request failed.',
        retryable: true,
      },
    });
  }
};
