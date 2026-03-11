import {
  DEFAULT_OPENAI_RESPONSES_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
} from '../constants';
import { AiResponsePayload, OpenAiReasoningEffort, OpenAiTransport } from '../types';

const OPENAI_PROXY_PATH = '/api/openai-compatible';
const MAX_RETRY_AFTER_MS = 30_000;

const buildOpenAiResponsesInput = (
  prompt: string,
  imagePart?: { mimeType: string; data: string }
) => {
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: prompt },
  ];

  if (imagePart) {
    content.push({
      type: 'input_image',
      image_url: {
        url: `data:${imagePart.mimeType};base64,${imagePart.data}`,
      },
    });
  }

  return [
    {
      role: 'user',
      content,
    },
  ];
};

const buildOpenAiChatMessages = (
  prompt: string,
  systemInstruction?: string,
  imagePart?: { mimeType: string; data: string }
) => {
  const messages: Array<Record<string, unknown>> = [];

  if (systemInstruction?.trim()) {
    messages.push({
      role: 'system',
      content: systemInstruction,
    });
  }

  const userContent = imagePart
    ? [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imagePart.mimeType};base64,${imagePart.data}`,
          },
        },
      ]
    : prompt;

  messages.push({
    role: 'user',
    content: userContent,
  });

  return messages;
};

const extractResponseText = (data: any) => {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  if (!Array.isArray(data?.output)) return '';

  return data.output
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((content: any) => content?.type === 'output_text' && typeof content.text === 'string')
    .map((content: any) => content.text)
    .join('');
};

const extractChatCompletionsText = (data: any) => {
  const messageContent = data?.choices?.[0]?.message?.content;

  if (typeof messageContent === 'string' && messageContent.trim()) {
    return messageContent;
  }

  if (!Array.isArray(messageContent)) return '';

  return messageContent
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .join('');
};

const getStreamingEventType = (payload: any, fallbackEventType?: string) =>
  payload?.type || payload?.event || fallbackEventType || '';

const getStreamingTextDelta = (payload: any) => {
  if (typeof payload?.delta === 'string') return payload.delta;
  if (typeof payload?.message?.content?.delta === 'string') return payload.message.content.delta;
  return '';
};

const getStreamingDoneText = (payload: any) => {
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.message?.content?.text === 'string') return payload.message.content.text;
  return '';
};

const parseJsonSafely = (rawText: string): any | null => {
  if (!rawText.trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch (error) {
    return null;
  }
};

const summarizeRawBody = (rawText: string, maxLength = 240) => {
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

const getEndpointDetails = (endpoint: string) => {
  try {
    const resolved = typeof window !== 'undefined'
      ? new URL(endpoint, window.location.href)
      : new URL(endpoint);
    return {
      hostname: resolved.hostname,
      path: `${resolved.pathname}${resolved.search}${resolved.hash}`,
    };
  } catch (error) {
    return {
      hostname: '',
      path: endpoint,
    };
  }
};

const normalizeReasoningEffort = (effort: OpenAiReasoningEffort) =>
  effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh'
    ? effort
    : DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT;

const canProxyResolveApiKey = (endpoint: string) => {
  try {
    const { hostname } = typeof window !== 'undefined'
      ? new URL(endpoint, window.location.href)
      : new URL(endpoint);
    return hostname === 'codex-api.packycode.com' || hostname === 'api.ai-wave.org';
  } catch (error) {
    return false;
  }
};

const clampRetryAfterMs = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.max(value, 0), MAX_RETRY_AFTER_MS)
    : undefined;

const parseRetryAfterMs = (rawValue: string | null) => {
  if (!rawValue) return undefined;

  const seconds = Number(rawValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return clampRetryAfterMs(seconds * 1000);
  }

  const dateMs = Date.parse(rawValue);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }

  return clampRetryAfterMs(dateMs - Date.now());
};

const isRetryableStatus = (status: number, retryAfterMs?: number) =>
  status === 502
  || status === 503
  || status === 504
  || status === 524
  || (status === 429 && typeof retryAfterMs === 'number');

const isFetchLikeError = (error: Error) => {
  const normalizedErrorMessage = error.message.trim().toLowerCase();
  const isUnknownNetworkError = error.name === 'TypeError' && normalizedErrorMessage === 'unknown';
  return error.message.includes('Failed to fetch') || error.message.includes('Load failed') || isUnknownNetworkError;
};

const postOpenAiProxyRequest = async (
  endpoint: string,
  requestBody: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
) =>
  fetch(OPENAI_PROXY_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      endpoint,
      apiKey,
      requestBody,
    }),
    signal,
  });

const readOpenAiStreamingResponse = async (response: Response) => {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finalText = '';

  const processEventBlock = (block: string) => {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    let explicitEventType = '';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        explicitEventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const rawData = dataLines.join('\n');
    if (!rawData || rawData === '[DONE]') return;

    const payload = parseJsonSafely(rawData);
    if (!payload) return;

    const eventType = getStreamingEventType(payload, explicitEventType);
    if (eventType === 'response.output_text.delta') {
      text += getStreamingTextDelta(payload);
      return;
    }
    if (eventType === 'response.output_text.done') {
      finalText = getStreamingDoneText(payload) || finalText;
      return;
    }
    if (eventType === 'response.done') {
      finalText = extractResponseText(payload?.response) || finalText;
    }
  };

  const getNextEventBlock = () => {
    const normalizedBuffer = buffer.replace(/\r\n/g, '\n');
    const separatorIndex = normalizedBuffer.indexOf('\n\n');
    if (separatorIndex === -1) return null;

    const consumedLength = normalizedBuffer.slice(0, separatorIndex + 2).length;
    const eventBlock = normalizedBuffer.slice(0, separatorIndex);
    buffer = normalizedBuffer.slice(consumedLength);
    return eventBlock;
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let eventBlock = getNextEventBlock();
    while (eventBlock !== null) {
      processEventBlock(eventBlock);
      eventBlock = getNextEventBlock();
    }

    if (done) {
      if (buffer.trim()) {
        processEventBlock(buffer);
      }
      break;
    }
  }

  return text || finalText;
};

const getOpenAiEndpoint = (baseUrl: string, transport: OpenAiTransport) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const endpointSuffix = transport === 'responses' ? '/responses' : '/chat/completions';
  return normalizedBaseUrl.endsWith(endpointSuffix)
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}${endpointSuffix}`;
};

const getOpenAiRequestBody = (
  transport: OpenAiTransport,
  prompt: string,
  modelId: string,
  reasoningEffort: OpenAiReasoningEffort,
  systemInstruction?: string,
  imagePart?: { mimeType: string; data: string },
) => {
  const normalizedReasoningEffort = normalizeReasoningEffort(reasoningEffort);

  if (transport === 'chat-completions') {
    return {
      model: modelId,
      messages: buildOpenAiChatMessages(prompt, systemInstruction, imagePart),
      reasoning_effort: normalizedReasoningEffort,
      stream: false,
    };
  }

  const requestBody: Record<string, unknown> = {
    model: modelId,
    input: buildOpenAiResponsesInput(prompt, imagePart),
    reasoning: { effort: normalizedReasoningEffort },
    max_output_tokens: DEFAULT_OPENAI_RESPONSES_MAX_OUTPUT_TOKENS,
    stream: true,
  };

  if (systemInstruction) {
    requestBody.instructions = systemInstruction;
  }

  return requestBody;
};

const getOpenAiResponseText = async (transport: OpenAiTransport, response: Response) => {
  if (transport === 'chat-completions') {
    return extractChatCompletionsText(await response.json());
  }

  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('text/event-stream')
    ? readOpenAiStreamingResponse(response)
    : extractResponseText(await response.json());
};

export const generateOpenAiResponse = async (
  prompt: string,
  modelId: string,
  apiKey: string,
  baseUrl: string,
  transport: OpenAiTransport,
  reasoningEffort: OpenAiReasoningEffort,
  systemInstruction?: string,
  imagePart?: { mimeType: string; data: string },
  signal?: AbortSignal
): Promise<AiResponsePayload> => {
  const startTime = performance.now();
  const endpoint = getOpenAiEndpoint(baseUrl, transport);
  const resolvedApiKey = apiKey.trim();

  if (!resolvedApiKey && !canProxyResolveApiKey(endpoint)) {
    return {
      text: 'API 密钥未在设置中提供。',
      durationMs: performance.now() - startTime,
      error: 'API key not configured',
      retryable: false,
    };
  }

  const requestBody = getOpenAiRequestBody(
    transport,
    prompt,
    modelId,
    reasoningEffort,
    systemInstruction,
    imagePart
  );
  const apiLabel = transport === 'responses' ? 'OpenAI Responses API' : 'OpenAI Chat Completions API';

  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const response = await postOpenAiProxyRequest(
      endpoint,
      requestBody,
      resolvedApiKey,
      signal,
    );

    const durationMs = performance.now() - startTime;
    if (!response.ok) {
      const rawBodyText = await response.text();
      const errorBody = parseJsonSafely(rawBodyText);
      const bodySummary = summarizeRawBody(rawBodyText);
      const hasHtmlBody = /<\s*html|<!doctype html/i.test(rawBodyText);
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      const proxyErrorType = errorBody?.error?.type;
      const proxyRetryable = errorBody?.error?.retryable === true;

      let errorMessage =
        errorBody?.error?.message
        || errorBody?.message
        || response.statusText
        || `请求失败，状态码: ${response.status}`;

      if (!errorBody && bodySummary) {
        errorMessage = bodySummary;
      }

      const endpointDetails = getEndpointDetails(endpoint);
      if (proxyErrorType === 'missing_api_key') {
        errorMessage = 'API 密钥未在设置中提供。';
      } else if (proxyErrorType === 'proxy_error') {
        errorMessage = '上游连接失败，请稍后重试。';
      } else if (response.status === 429) {
        errorMessage = retryAfterMs ? '请求过于频繁，稍后重试。' : '请求过于频繁，请稍后再试。';
      } else if (response.status === 524) {
        errorMessage = '上游超时，请稍后重试。';
      } else if (response.status === 502 || response.status === 503 || response.status === 504) {
        errorMessage = '上游服务暂时不可用，请稍后重试。';
      } else if (hasHtmlBody) {
        errorMessage = '上游网关返回了拦截页。';
      } else if (
        endpointDetails.hostname === 'api.ai-wave.org'
        && errorMessage.includes('Invalid URL')
      ) {
        errorMessage = `请求配置无效（${endpointDetails.path}）。请检查 Base URL 或 API Key。`;
      } else if (errorMessage.trim().toLowerCase() === 'unknown') {
        errorMessage = '上游返回 unknown，请检查接口配置。';
      }

      let errorType = 'OpenAI API error';
      if (proxyErrorType === 'missing_api_key') {
        errorType = 'API key not configured';
      } else if (response.status === 401 || response.status === 403) {
        errorType = 'API key invalid or permission denied';
      } else if (response.status === 429) {
        errorType = retryAfterMs ? 'Rate limited' : 'Quota exceeded';
      }

      const retryable = !hasHtmlBody && (proxyRetryable || isRetryableStatus(response.status, retryAfterMs));
      console.error(`${apiLabel} Error:`, errorMessage, 'Status:', response.status, 'Body:', errorBody);
      return {
        text: errorMessage,
        durationMs,
        error: errorType,
        retryable,
        retryAfterMs,
      };
    }

    const text = await getOpenAiResponseText(transport, response);

    if (!text) {
      console.error(`${apiLabel}: invalid response structure or empty payload`);
      return { text: 'AI响应格式无效。', durationMs, error: 'Invalid response structure', retryable: false };
    }

    return { text, durationMs };
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Aborted'))) {
      return { text: '用户取消操作', durationMs: performance.now() - startTime, error: 'AbortError' };
    }

    console.error(`调用${apiLabel}时出错:`, error);
    const durationMs = performance.now() - startTime;

    if (error instanceof Error) {
      if (isFetchLikeError(error)) {
        return {
          text: '网络请求失败，请稍后重试。',
          durationMs,
          error: 'Proxy request failed',
          retryable: false,
        };
      }
      return { text: `与AI通信时出错: ${error.message}`, durationMs, error: error.name, retryable: false };
    }

    return { text: '与AI通信时发生未知错误。', durationMs, error: 'Unknown AI error', retryable: false };
  }
};
