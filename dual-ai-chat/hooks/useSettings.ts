import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MODELS,
  AiModel,
  DEFAULT_COGNITO_MODEL_API_NAME,
  DEFAULT_MUSE_MODEL_API_NAME,
  DEFAULT_GEMINI_API_BASE_URL,
  DEFAULT_OPENAI_TRANSPORT,
  DEFAULT_OPENAI_CHAT_COMPLETIONS_API_BASE_URL,
  COGNITO_SYSTEM_PROMPT_HEADER,
  MUSE_SYSTEM_PROMPT_HEADER,
  DEFAULT_MANUAL_FIXED_TURNS,
  COGNITO_ROLE_CONFIG_STORAGE_KEY,
  MUSE_ROLE_CONFIG_STORAGE_KEY,
  CUSTOM_API_ENDPOINT_STORAGE_KEY,
  CUSTOM_API_KEY_STORAGE_KEY,
  USE_CUSTOM_API_CONFIG_STORAGE_KEY,
  USE_OPENAI_API_CONFIG_STORAGE_KEY,
  OPENAI_API_BASE_URL_STORAGE_KEY,
  OPENAI_API_KEY_STORAGE_KEY,
  OPENAI_COGNITO_MODEL_ID_STORAGE_KEY,
  OPENAI_MUSE_MODEL_ID_STORAGE_KEY,
  DEFAULT_OPENAI_API_BASE_URL,
  DEFAULT_OPENAI_COGNITO_MODEL_ID,
  DEFAULT_OPENAI_MUSE_MODEL_ID,
  DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
  THINKING_BUDGET_STORAGE_KEY,
  THINKING_LEVEL_STORAGE_KEY,
  COGNITO_THINKING_BUDGET_STORAGE_KEY,
  COGNITO_THINKING_LEVEL_STORAGE_KEY,
  MUSE_THINKING_BUDGET_STORAGE_KEY,
  MUSE_THINKING_LEVEL_STORAGE_KEY,
  DEFAULT_THINKING_BUDGET,
  DEFAULT_THINKING_LEVEL,
} from '../constants';
import {
  AiProvider,
  AiRoleConfig,
  DiscussionMode,
  OpenAiReasoningEffort,
  OpenAiTransport,
} from '../types';

const FONT_SIZE_STORAGE_KEY = 'dualAiChatFontSizeScale';
const DEFAULT_FONT_SIZE_SCALE = 0.875;

type RoleKey = 'cognito' | 'muse';

const getInjectedEnvValue = (...candidates: Array<string | undefined>) =>
  candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || '';

const getOpenAiEnvKeyForBaseUrl = (baseUrl: string) => {
  try {
    const { hostname } = new URL(baseUrl);
    if (hostname === 'codex-api.packycode.com') {
      return getInjectedEnvValue(process.env.OPENAI_API_KEY);
    }
    if (hostname === 'api.ai-wave.org') {
      return getInjectedEnvValue(process.env.OPENAI_COMPAT_API_KEY);
    }
  } catch (error) {
    return '';
  }

  return '';
};

const getInjectedApiKey = (config: AiRoleConfig) =>
  config.provider === 'gemini'
    ? getInjectedEnvValue(process.env.GEMINI_API_KEY, process.env.API_KEY)
    : getOpenAiEnvKeyForBaseUrl(config.baseUrl.trim());

const resolveInjectedApiKey = (config: AiRoleConfig): AiRoleConfig => {
  if (config.apiKey.trim()) return config;

  const injectedApiKey = getInjectedApiKey(config);
  return injectedApiKey ? { ...config, apiKey: injectedApiKey } : config;
};

const DEFAULT_ROLE_CONFIGS: Record<RoleKey, AiRoleConfig> = {
  cognito: {
    provider: 'gemini',
    apiKey: '',
    baseUrl: DEFAULT_GEMINI_API_BASE_URL,
    modelId: DEFAULT_COGNITO_MODEL_API_NAME,
    openaiTransport: DEFAULT_OPENAI_TRANSPORT,
    openaiReasoningEffort: DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
  },
  muse: {
    provider: 'gemini',
    apiKey: '',
    baseUrl: DEFAULT_GEMINI_API_BASE_URL,
    modelId: DEFAULT_MUSE_MODEL_API_NAME,
    openaiTransport: DEFAULT_OPENAI_TRANSPORT,
    openaiReasoningEffort: DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
  },
};

const isAiProvider = (value: unknown): value is AiProvider =>
  value === 'gemini' || value === 'openai-compatible';

const isOpenAiTransport = (value: unknown): value is OpenAiTransport =>
  value === 'responses' || value === 'chat-completions';

const isOpenAiReasoningEffort = (value: unknown): value is OpenAiReasoningEffort =>
  value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh';

const getDefaultRoleConfig = (role: RoleKey): AiRoleConfig => ({
  ...DEFAULT_ROLE_CONFIGS[role],
});

const getDefaultOpenAiBaseUrl = (transport: OpenAiTransport) =>
  transport === 'chat-completions'
    ? DEFAULT_OPENAI_CHAT_COMPLETIONS_API_BASE_URL
    : DEFAULT_OPENAI_API_BASE_URL;

const getDefaultBaseUrl = (provider: AiProvider, transport: OpenAiTransport) =>
  provider === 'gemini' ? DEFAULT_GEMINI_API_BASE_URL : getDefaultOpenAiBaseUrl(transport);

const getDefaultModelId = (role: RoleKey, provider: AiProvider) => {
  if (provider === 'gemini') {
    return role === 'cognito' ? DEFAULT_COGNITO_MODEL_API_NAME : DEFAULT_MUSE_MODEL_API_NAME;
  }
  return role === 'cognito' ? DEFAULT_OPENAI_COGNITO_MODEL_ID : DEFAULT_OPENAI_MUSE_MODEL_ID;
};

const normalizeRoleConfig = (role: RoleKey, config: Partial<AiRoleConfig>): AiRoleConfig => {
  const provider = isAiProvider(config.provider) ? config.provider : getDefaultRoleConfig(role).provider;
  const openaiTransport = isOpenAiTransport(config.openaiTransport)
    ? config.openaiTransport
    : getDefaultRoleConfig(role).openaiTransport;
  const openaiReasoningEffort = isOpenAiReasoningEffort(config.openaiReasoningEffort)
    ? config.openaiReasoningEffort
    : getDefaultRoleConfig(role).openaiReasoningEffort;
  return {
    provider,
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    baseUrl: typeof config.baseUrl === 'string' && config.baseUrl.trim()
      ? config.baseUrl
      : getDefaultBaseUrl(provider, openaiTransport),
    modelId: typeof config.modelId === 'string' ? config.modelId : getDefaultModelId(role, provider),
    openaiTransport,
    openaiReasoningEffort,
  };
};

const parseStoredRoleConfig = (role: RoleKey, storageKey: string): AiRoleConfig | null => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    return normalizeRoleConfig(role, JSON.parse(raw));
  } catch (error) {
    console.error(`Failed to parse stored ${role} config`, error);
    return null;
  }
};

const getMigratedLegacyRoleConfig = (role: RoleKey): AiRoleConfig => {
  const legacyOpenAiEnabled = localStorage.getItem(USE_OPENAI_API_CONFIG_STORAGE_KEY) === 'true';
  const legacyGeminiEnabled = localStorage.getItem(USE_CUSTOM_API_CONFIG_STORAGE_KEY) === 'true';

  if (legacyOpenAiEnabled) {
    return {
      provider: 'openai-compatible',
      apiKey: localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) || '',
      baseUrl: localStorage.getItem(OPENAI_API_BASE_URL_STORAGE_KEY) || DEFAULT_OPENAI_API_BASE_URL,
      modelId: role === 'cognito'
        ? localStorage.getItem(OPENAI_COGNITO_MODEL_ID_STORAGE_KEY) || DEFAULT_OPENAI_COGNITO_MODEL_ID
        : localStorage.getItem(OPENAI_MUSE_MODEL_ID_STORAGE_KEY) || DEFAULT_OPENAI_MUSE_MODEL_ID,
      openaiTransport: DEFAULT_OPENAI_TRANSPORT,
      openaiReasoningEffort: DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
    };
  }

  if (legacyGeminiEnabled) {
    return {
      provider: 'gemini',
      apiKey: localStorage.getItem(CUSTOM_API_KEY_STORAGE_KEY) || '',
      baseUrl: localStorage.getItem(CUSTOM_API_ENDPOINT_STORAGE_KEY) || DEFAULT_GEMINI_API_BASE_URL,
      modelId: getDefaultModelId(role, 'gemini'),
      openaiTransport: DEFAULT_OPENAI_TRANSPORT,
      openaiReasoningEffort: DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
    };
  }

  return getDefaultRoleConfig(role);
};

const getInitialRoleConfig = (role: RoleKey, storageKey: string): AiRoleConfig =>
  parseStoredRoleConfig(role, storageKey) || getMigratedLegacyRoleConfig(role);

const buildRoleModelDetails = (role: RoleKey, config: AiRoleConfig): AiModel => {
  const modelId = config.modelId.trim();
  const providerLabel = config.provider === 'gemini'
    ? 'Gemini'
    : `OpenAI 兼容 / ${config.openaiTransport === 'responses' ? 'Responses' : 'Chat Completions'}`;
  const normalizedModelId = modelId.toLowerCase();
  const knownModel = config.provider === 'gemini'
    ? MODELS.find((model) => model.apiName === modelId)
    : undefined;
  const supportsGeminiThinking = config.provider === 'gemini'
    && (knownModel?.supportsThinkingConfig
      || normalizedModelId.startsWith('gemini-2.5')
      || normalizedModelId.startsWith('gemini-3'));
  const roleLabel = role === 'cognito' ? 'Cognito' : 'Muse';

  return {
    id: `${role}-${config.provider}`,
    name: `${roleLabel} / ${providerLabel} / ${modelId || '未指定'}`,
    apiName: modelId,
    supportsThinkingConfig: supportsGeminiThinking,
    supportsSystemInstruction: true,
  };
};

export const useSettings = () => {
  const [cognitoConfig, setCognitoConfig] = useState<AiRoleConfig>(() =>
    getInitialRoleConfig('cognito', COGNITO_ROLE_CONFIG_STORAGE_KEY)
  );
  const [museConfig, setMuseConfig] = useState<AiRoleConfig>(() =>
    getInitialRoleConfig('muse', MUSE_ROLE_CONFIG_STORAGE_KEY)
  );

  const [discussionMode, setDiscussionMode] = useState<DiscussionMode>(DiscussionMode.AiDriven);
  const [manualFixedTurns, setManualFixedTurns] = useState<number>(DEFAULT_MANUAL_FIXED_TURNS);
  const [cognitoSystemPrompt, setCognitoSystemPrompt] = useState<string>(COGNITO_SYSTEM_PROMPT_HEADER);
  const [museSystemPrompt, setMuseSystemPrompt] = useState<string>(MUSE_SYSTEM_PROMPT_HEADER);
  const [fontSizeScale, setFontSizeScale] = useState<number>(() => {
    const storedScale = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return storedScale ? parseFloat(storedScale) : DEFAULT_FONT_SIZE_SCALE;
  });

  const [cognitoThinkingBudget, setCognitoThinkingBudget] = useState<number>(() => {
    const stored = localStorage.getItem(COGNITO_THINKING_BUDGET_STORAGE_KEY);
    if (stored) return parseInt(stored, 10);
    const legacy = localStorage.getItem(THINKING_BUDGET_STORAGE_KEY);
    return legacy ? parseInt(legacy, 10) : DEFAULT_THINKING_BUDGET;
  });

  const [cognitoThinkingLevel, setCognitoThinkingLevel] = useState<'LOW' | 'HIGH'>(() => {
    const stored = localStorage.getItem(COGNITO_THINKING_LEVEL_STORAGE_KEY);
    if (stored === 'LOW' || stored === 'HIGH') return stored;
    const legacy = localStorage.getItem(THINKING_LEVEL_STORAGE_KEY);
    return legacy === 'LOW' || legacy === 'HIGH' ? legacy : DEFAULT_THINKING_LEVEL;
  });

  const [museThinkingBudget, setMuseThinkingBudget] = useState<number>(() => {
    const stored = localStorage.getItem(MUSE_THINKING_BUDGET_STORAGE_KEY);
    if (stored) return parseInt(stored, 10);
    const legacy = localStorage.getItem(THINKING_BUDGET_STORAGE_KEY);
    return legacy ? parseInt(legacy, 10) : DEFAULT_THINKING_BUDGET;
  });

  const [museThinkingLevel, setMuseThinkingLevel] = useState<'LOW' | 'HIGH'>(() => {
    const stored = localStorage.getItem(MUSE_THINKING_LEVEL_STORAGE_KEY);
    if (stored === 'LOW' || stored === 'HIGH') return stored;
    const legacy = localStorage.getItem(THINKING_LEVEL_STORAGE_KEY);
    return legacy === 'LOW' || legacy === 'HIGH' ? legacy : DEFAULT_THINKING_LEVEL;
  });

  useEffect(() => {
    localStorage.setItem(COGNITO_ROLE_CONFIG_STORAGE_KEY, JSON.stringify(cognitoConfig));
  }, [cognitoConfig]);

  useEffect(() => {
    localStorage.setItem(MUSE_ROLE_CONFIG_STORAGE_KEY, JSON.stringify(museConfig));
  }, [museConfig]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeScale * 100}%`;
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSizeScale.toString());
  }, [fontSizeScale]);

  useEffect(() => { localStorage.setItem(COGNITO_THINKING_BUDGET_STORAGE_KEY, cognitoThinkingBudget.toString()); }, [cognitoThinkingBudget]);
  useEffect(() => { localStorage.setItem(COGNITO_THINKING_LEVEL_STORAGE_KEY, cognitoThinkingLevel); }, [cognitoThinkingLevel]);
  useEffect(() => { localStorage.setItem(MUSE_THINKING_BUDGET_STORAGE_KEY, museThinkingBudget.toString()); }, [museThinkingBudget]);
  useEffect(() => { localStorage.setItem(MUSE_THINKING_LEVEL_STORAGE_KEY, museThinkingLevel); }, [museThinkingLevel]);

  const updateRoleConfig = useCallback((role: RoleKey, patch: Partial<AiRoleConfig>) => {
    const setter = role === 'cognito' ? setCognitoConfig : setMuseConfig;
    setter((current) => {
      const nextProvider = isAiProvider(patch.provider) ? patch.provider : current.provider;
      const nextOpenAiTransport = isOpenAiTransport(patch.openaiTransport)
        ? patch.openaiTransport
        : current.openaiTransport;
      const nextOpenAiReasoningEffort = isOpenAiReasoningEffort(patch.openaiReasoningEffort)
        ? patch.openaiReasoningEffort
        : current.openaiReasoningEffort;
      const providerChanged = nextProvider !== current.provider;
      const transportChanged = nextOpenAiTransport !== current.openaiTransport;
      const currentBaseUrlDefault = getDefaultBaseUrl(current.provider, current.openaiTransport);
      const nextBaseUrl = typeof patch.baseUrl === 'string'
        ? patch.baseUrl
        : (
          (
            providerChanged
            || (nextProvider === 'openai-compatible' && transportChanged)
          )
          && (!current.baseUrl.trim() || current.baseUrl === currentBaseUrlDefault)
        )
          ? getDefaultBaseUrl(nextProvider, nextOpenAiTransport)
          : current.baseUrl;
      const nextModelId = typeof patch.modelId === 'string'
        ? patch.modelId
        : providerChanged && (!current.modelId.trim() || current.modelId === getDefaultModelId(role, current.provider))
          ? getDefaultModelId(role, nextProvider)
          : current.modelId;

      return {
        provider: nextProvider,
        apiKey: typeof patch.apiKey === 'string' ? patch.apiKey : current.apiKey,
        baseUrl: nextBaseUrl,
        modelId: nextModelId,
        openaiTransport: nextOpenAiTransport,
        openaiReasoningEffort: nextOpenAiReasoningEffort,
      };
    });
  }, []);

  const actualCognitoModelDetails = useMemo(
    () => buildRoleModelDetails('cognito', cognitoConfig),
    [cognitoConfig]
  );

  const actualMuseModelDetails = useMemo(
    () => buildRoleModelDetails('muse', museConfig),
    [museConfig]
  );

  const resolvedCognitoConfig = useMemo(
    () => resolveInjectedApiKey(cognitoConfig),
    [cognitoConfig]
  );

  const resolvedMuseConfig = useMemo(
    () => resolveInjectedApiKey(museConfig),
    [museConfig]
  );

  return {
    cognitoConfig,
    museConfig,
    resolvedCognitoConfig,
    resolvedMuseConfig,
    updateCognitoConfig: (patch: Partial<AiRoleConfig>) => updateRoleConfig('cognito', patch),
    updateMuseConfig: (patch: Partial<AiRoleConfig>) => updateRoleConfig('muse', patch),

    discussionMode, setDiscussionMode,
    manualFixedTurns, setManualFixedTurns,
    cognitoSystemPrompt, setCognitoSystemPrompt,
    museSystemPrompt, setMuseSystemPrompt,

    cognitoThinkingBudget, setCognitoThinkingBudget,
    cognitoThinkingLevel, setCognitoThinkingLevel,
    museThinkingBudget, setMuseThinkingBudget,
    museThinkingLevel, setMuseThinkingLevel,

    fontSizeScale, setFontSizeScale,

    actualCognitoModelDetails,
    actualMuseModelDetails,
  };
};
