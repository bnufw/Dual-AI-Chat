import {
  GoogleGenAI,
  GenerateContentResponse,
  Part,
  ThinkingLevel,
  type GenerateContentConfig,
} from '@google/genai';
import { AiResponsePayload } from '../types';

const toGeminiThinkingLevel = (level: 'LOW' | 'HIGH'): ThinkingLevel =>
  level === 'LOW' ? ThinkingLevel.LOW : ThinkingLevel.HIGH;

const createGoogleAIClient = (apiKey: string, baseUrl?: string, signal?: AbortSignal): GoogleGenAI => {
  const clientOptions: any = { apiKey };

  if ((baseUrl && baseUrl.trim()) || signal) {
    clientOptions.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      const fetchInit = { ...init, signal: signal || init?.signal };

      try {
        const sdkUrl = new URL(url.toString());
        const sdkPathAndQuery = sdkUrl.pathname + sdkUrl.search + sdkUrl.hash;
        let resolvedBaseUrl = baseUrl?.trim();

        if (resolvedBaseUrl) {
          if (resolvedBaseUrl.endsWith('/')) {
            resolvedBaseUrl = resolvedBaseUrl.slice(0, -1);
          }

          const versionMatch = sdkUrl.pathname.match(/^\/(v1beta|v1)\b/);
          if (versionMatch && resolvedBaseUrl.endsWith(`/${versionMatch[1]}`)) {
            resolvedBaseUrl = resolvedBaseUrl.slice(0, -(`/${versionMatch[1]}`).length);
          }

          return fetch(resolvedBaseUrl + sdkPathAndQuery, fetchInit);
        }

        return fetch(url, fetchInit);
      } catch (error) {
        console.error('Error constructing Gemini request URL. Falling back to SDK URL.', error);
        return fetch(url, fetchInit);
      }
    };
  }

  return new GoogleGenAI(clientOptions);
};

export const generateResponse = async (
  prompt: string,
  modelName: string,
  apiKey: string,
  baseUrl?: string,
  systemInstruction?: string,
  imagePart?: { inlineData: { mimeType: string; data: string } },
  thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: 'LOW' | 'HIGH' },
  signal?: AbortSignal
): Promise<AiResponsePayload> => {
  const startTime = performance.now();

  try {
    const resolvedApiKey = apiKey.trim();
    if (!resolvedApiKey) {
      return {
        text: 'API 密钥未在设置中提供。',
        durationMs: performance.now() - startTime,
        error: 'API key not configured',
      };
    }

    const genAI = createGoogleAIClient(resolvedApiKey, baseUrl, signal);
    const configForApi: GenerateContentConfig = {};

    if (systemInstruction) {
      configForApi.systemInstruction = systemInstruction;
    }
    if (thinkingConfig) {
      configForApi.thinkingConfig = {
        thinkingBudget: thinkingConfig.thinkingBudget,
        thinkingLevel: thinkingConfig.thinkingLevel
          ? toGeminiThinkingLevel(thinkingConfig.thinkingLevel)
          : undefined,
      };
    }

    const textPart: Part = { text: prompt };
    const requestContents = imagePart ? { parts: [imagePart, textPart] } : prompt;

    const generatePromise = genAI.models.generateContent({
      model: modelName,
      contents: requestContents,
      config: Object.keys(configForApi).length > 0 ? configForApi : undefined,
    });

    const response: GenerateContentResponse = await new Promise<GenerateContentResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));

      if (signal) signal.addEventListener('abort', onAbort);

      generatePromise.then(
        (result) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(result);
        },
        (error) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });

    let text = '';
    let thoughts = '';

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if ((part as any).thought) {
          thoughts += part.text || '';
        } else {
          text += part.text || '';
        }
      }
    }

    if (!text && !thoughts && response.text) {
      text = response.text;
    }

    return {
      text,
      thoughts: thoughts || undefined,
      durationMs: performance.now() - startTime,
    };
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Aborted'))) {
      return { text: '用户取消操作', durationMs: performance.now() - startTime, error: 'AbortError' };
    }

    console.error('调用Gemini API时出错:', error);
    const durationMs = performance.now() - startTime;

    if (error instanceof Error) {
      if (
        error.message.includes('API key not valid')
        || error.message.includes('API_KEY_INVALID')
        || error.message.includes('permission-denied')
        || (error.message.includes('forbidden') && error.message.toLowerCase().includes('api key'))
      ) {
        return { text: 'API 密钥无效或权限不足。', durationMs, error: 'API key invalid or permission denied' };
      }

      if (error.message.includes('Quota exceeded')) {
        return { text: 'API 配额已超出。', durationMs, error: 'Quota exceeded' };
      }

      return { text: `与AI通信时出错: ${error.message}`, durationMs, error: error.name };
    }

    return { text: '与AI通信时发生未知错误。', durationMs, error: 'Unknown AI error' };
  }
};
