import { AiResponsePayload, OpenAiReasoningEffort } from '../types';

const OPENAI_RESPONSES_API_PATH = '/api/openai-responses';

type OpenAiRole = 'cognito' | 'muse';

const parseJsonSafely = (rawText: string): any | null => {
  if (!rawText.trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
};

const buildFetchFailureMessage = () => [
  '与AI通信时出错: Failed to fetch',
  `请求地址: ${OPENAI_RESPONSES_API_PATH}`,
  '当前浏览器只会请求同源 Python 接口，不再直连上游模型。',
  '如果你在本地运行，请改用 `vercel dev`，或确认部署环境已包含该 Python Function。',
].join('\n');

const buildLocalDevMissingApiMessage = () => [
  '与AI通信时出错: 同源 Python 接口不可用。',
  `请求地址: ${OPENAI_RESPONSES_API_PATH}`,
  '你现在很可能是通过纯 Vite 开发服务器打开页面，本地并没有启动 Vercel Python Function。',
  '如果要联调 OpenAI 兼容链路，请改用 `vercel dev`。',
].join('\n');

export const generateOpenAiResponse = async (
  role: OpenAiRole,
  modelId: string,
  reasoningEffort: OpenAiReasoningEffort,
  prompt: string,
  systemInstruction?: string,
  imagePart?: { mimeType: string; data: string },
  signal?: AbortSignal
): Promise<AiResponsePayload> => {
  const startTime = performance.now();

  try {
    const response = await fetch(OPENAI_RESPONSES_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        role,
        modelId,
        reasoningEffort,
        prompt,
        systemInstruction,
        imagePart,
      }),
      signal,
    });

    const rawBodyText = await response.text();
    const payload = parseJsonSafely(rawBodyText);
    const durationMs = typeof payload?.durationMs === 'number'
      ? payload.durationMs
      : performance.now() - startTime;
    const hasHtmlBody = /<\s*html|<!doctype html/i.test(rawBodyText);

    if (!response.ok) {
      if (hasHtmlBody) {
        return {
          text: buildLocalDevMissingApiMessage(),
          durationMs,
          error: 'Python API unavailable',
        };
      }
      const text = typeof payload?.text === 'string' && payload.text.trim()
        ? payload.text
        : rawBodyText.trim() || `请求失败，状态码: ${response.status}`;
      const error = typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error
        : `HTTP ${response.status}`;
      return { text, durationMs, error };
    }

    if (hasHtmlBody) {
      return {
        text: buildLocalDevMissingApiMessage(),
        durationMs,
        error: 'Python API unavailable',
      };
    }

    if (typeof payload?.text !== 'string' || !payload.text.trim()) {
      return { text: 'AI响应格式无效。', durationMs, error: 'Invalid response structure' };
    }

    return {
      text: payload.text,
      durationMs,
      error: typeof payload?.error === 'string' ? payload.error : undefined,
    };
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Aborted'))) {
      return { text: '用户取消操作', durationMs: performance.now() - startTime, error: 'AbortError' };
    }

    console.error('调用OpenAI Python API时出错:', error);
    const durationMs = performance.now() - startTime;

    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('Load failed')) {
        return {
          text: buildFetchFailureMessage(),
          durationMs,
          error: 'Network request blocked',
        };
      }
      return { text: `与AI通信时出错: ${error.message}`, durationMs, error: error.name };
    }

    return { text: '与AI通信时发生未知错误。', durationMs, error: 'Unknown AI error' };
  }
};
