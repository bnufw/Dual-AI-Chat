import { DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT } from '../constants';
import { AiResponsePayload } from '../types';

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

const buildFetchFailureMessage = (endpoint: string) => {
  const reasons = [
    '浏览器没有拿到任何 HTTP 响应，这通常不是模型正文报错。',
    '优先检查该接口是否允许当前页面来源的 CORS/OPTIONS 预检。',
    '确认 Base URL 可被浏览器直接访问，且部署站点与接口之间没有被防火墙、代理或插件拦截。',
  ];

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && endpoint.startsWith('http://')) {
    reasons.push('当前页面是 HTTPS，但接口是 HTTP，浏览器会直接拦截混合内容请求。');
  }

  return [`与AI通信时出错: Failed to fetch`, `请求地址: ${endpoint}`, ...reasons].join('\n');
};

export const generateOpenAiResponse = async (
  prompt: string,
  modelId: string,
  apiKey: string,
  baseUrl: string,
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

  const requestBody: Record<string, unknown> = {
    model: modelId,
    input: buildOpenAiResponsesInput(prompt, imagePart),
    reasoning: {
      effort: DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
    },
  };

  if (systemInstruction) {
    requestBody.instructions = systemInstruction;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const directEndpoint = normalizedBaseUrl.endsWith('/responses')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/responses`;
  const endpoint = directEndpoint;

  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    const durationMs = performance.now() - startTime;

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch (error) {
        errorBody = null;
      }

      const errorMessage =
        errorBody?.error?.message
        || response.statusText
        || `请求失败，状态码: ${response.status}`;

      let errorType = 'OpenAI API error';
      if (response.status === 401 || response.status === 403) {
        errorType = 'API key invalid or permission denied';
      } else if (response.status === 429) {
        errorType = 'Quota exceeded';
      }

      console.error('OpenAI Responses API Error:', errorMessage, 'Status:', response.status, 'Body:', errorBody);
      return { text: errorMessage, durationMs, error: errorType };
    }

    const data = await response.json();
    const text = extractResponseText(data);

    if (!text) {
      console.error('OpenAI Responses API: invalid response structure', data);
      return { text: 'AI响应格式无效。', durationMs, error: 'Invalid response structure' };
    }

    return { text, durationMs };
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Aborted'))) {
      return { text: '用户取消操作', durationMs: performance.now() - startTime, error: 'AbortError' };
    }

    console.error('调用OpenAI Responses API时出错:', error);
    const durationMs = performance.now() - startTime;

    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('Load failed')) {
        return {
          text: buildFetchFailureMessage(endpoint),
          durationMs,
          error: 'Network request blocked',
        };
      }
      return { text: `与AI通信时出错: ${error.message}`, durationMs, error: error.name };
    }

    return { text: '与AI通信时发生未知错误。', durationMs, error: 'Unknown AI error' };
  }
};
