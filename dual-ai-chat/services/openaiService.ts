import {
  DEFAULT_OPENAI_RESPONSES_MAX_OUTPUT_TOKENS,
  DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
} from '../constants';
import { AiResponsePayload, OpenAiReasoningEffort, OpenAiTransport } from '../types';

const OPENAI_PROXY_PATH = '/__openai_responses_proxy';

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

const normalizeReasoningEffort = (effort: OpenAiReasoningEffort) =>
  effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh'
    ? effort
    : DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT;

const buildFetchFailureMessage = (endpoint: string, attemptedProxy: boolean, transport: OpenAiTransport) => {
  const reasons = [
    '浏览器没有拿到任何 HTTP 响应，这通常不是模型正文报错。',
    '优先检查该接口是否允许当前页面来源的 CORS/OPTIONS 预检。',
    '确认 Base URL 可被浏览器直接访问，且部署站点与接口之间没有被防火墙、代理或插件拦截。',
  ];

  if (attemptedProxy) {
    reasons.push('已自动尝试本地代理路径，但仍未拿到响应。请确认你是通过 `npm run dev` 启动，并且前端地址来自同一个 Vite 实例。');
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && endpoint.startsWith('http://')) {
    reasons.push('当前页面是 HTTPS，但接口是 HTTP，浏览器会直接拦截混合内容请求。');
  }

  return [
    `与AI通信时出错: Failed to fetch`,
    `请求地址: ${endpoint}`,
    `请求模式: ${transport === 'responses' ? 'Responses' : 'Chat Completions'}`,
    ...reasons,
  ].join('\n');
};

const isCrossOriginEndpoint = (endpoint: string) => {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(endpoint, window.location.href).origin !== window.location.origin;
  } catch (error) {
    return false;
  }
};

const postOpenAiRequest = async (
  endpoint: string,
  requestBody: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
  proxyTarget?: string
) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json, text/event-stream',
  };

  if (proxyTarget) {
    headers['x-openai-target-endpoint'] = proxyTarget;
  }

  return fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal,
  });
};

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
  const resolvedApiKey = apiKey.trim();

  if (!resolvedApiKey) {
    return {
      text: 'API 密钥未在设置中提供。',
      durationMs: performance.now() - startTime,
      error: 'API key not configured',
    };
  }

  const endpoint = getOpenAiEndpoint(baseUrl, transport);
  const shouldTryProxyFirst = isCrossOriginEndpoint(endpoint);
  const requestRoutes = shouldTryProxyFirst
    ? [
        { endpoint: OPENAI_PROXY_PATH, proxyTarget: endpoint },
        { endpoint },
      ]
    : [{ endpoint }];
  let lastFetchError: Error | null = null;
  let usedProxyRoute = false;
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
    for (let routeIndex = 0; routeIndex < requestRoutes.length; routeIndex += 1) {
      const route = requestRoutes[routeIndex];
      if (route.proxyTarget) {
        usedProxyRoute = true;
      }
      try {
        const response = await postOpenAiRequest(
          route.endpoint,
          requestBody,
          resolvedApiKey,
          signal,
          route.proxyTarget
        );

        const canFallbackToDirect =
          !!route.proxyTarget
          && routeIndex < requestRoutes.length - 1
          && (response.status === 404 || response.status === 405 || response.status === 502);
        if (canFallbackToDirect) {
          continue;
        }

        const durationMs = performance.now() - startTime;
        if (!response.ok) {
          const rawBodyText = await response.text();
          const errorBody = parseJsonSafely(rawBodyText);
          const bodySummary = summarizeRawBody(rawBodyText);
          const hasHtmlBody = /<\s*html|<!doctype html/i.test(rawBodyText);

          let errorMessage =
            errorBody?.error?.message
            || errorBody?.message
            || response.statusText
            || `请求失败，状态码: ${response.status}`;

          if (!errorBody && bodySummary) {
            errorMessage = bodySummary;
          }
          if (response.status === 524) {
            errorMessage = '上游网关超时（HTTP 524）。当前保持所选推理强度未降级；可稍后重试，或手动切换更快模型。';
          } else if (hasHtmlBody) {
            errorMessage = `上游网关返回了 HTML 页面（HTTP ${response.status}），请求被网关或代理层拦截。`;
          } else if (errorMessage.trim().toLowerCase() === 'unknown') {
            errorMessage = `上游返回 unknown（HTTP ${response.status}）。请检查 Base URL、模型名或网关日志。`;
          }

          let errorType = 'OpenAI API error';
          if (response.status === 401 || response.status === 403) {
            errorType = 'API key invalid or permission denied';
          } else if (response.status === 429) {
            errorType = 'Quota exceeded';
          }

          console.error(`${apiLabel} Error:`, errorMessage, 'Status:', response.status, 'Body:', errorBody);
          return { text: errorMessage, durationMs, error: errorType };
        }

        const text = await getOpenAiResponseText(transport, response);

        if (!text) {
          console.error(`${apiLabel}: invalid response structure or empty payload`);
          return { text: 'AI响应格式无效。', durationMs, error: 'Invalid response structure' };
        }

        return { text, durationMs };
      } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Aborted'))) {
          return { text: '用户取消操作', durationMs: performance.now() - startTime, error: 'AbortError' };
        }
        if (error instanceof Error) {
          lastFetchError = error;
        } else {
          lastFetchError = new Error('Unknown request error');
        }
        if (routeIndex < requestRoutes.length - 1) {
          continue;
        }
      }
    }

    if (lastFetchError) {
      throw lastFetchError;
    }

    throw new Error('OpenAI request failed');
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Aborted'))) {
      return { text: '用户取消操作', durationMs: performance.now() - startTime, error: 'AbortError' };
    }

    console.error(`调用${apiLabel}时出错:`, error);
    const durationMs = performance.now() - startTime;

    if (error instanceof Error) {
      const normalizedErrorMessage = error.message.trim().toLowerCase();
      const isUnknownNetworkError = error.name === 'TypeError' && normalizedErrorMessage === 'unknown';
      if (error.message.includes('Failed to fetch') || error.message.includes('Load failed') || isUnknownNetworkError) {
        return {
          text: buildFetchFailureMessage(endpoint, usedProxyRoute, transport),
          durationMs,
          error: 'Network request blocked',
        };
      }
      return { text: `与AI通信时出错: ${error.message}`, durationMs, error: error.name };
    }

    return { text: '与AI通信时发生未知错误。', durationMs, error: 'Unknown AI error' };
  }
};
