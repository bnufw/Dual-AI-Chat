import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MODELS,
  AiModel,
  DEFAULT_COGNITO_MODEL_API_NAME,
  DEFAULT_MUSE_MODEL_API_NAME,
  DEFAULT_GEMINI_API_BASE_URL,
  DEFAULT_OPENAI_COGNITO_MODEL_ID,
  DEFAULT_OPENAI_MUSE_MODEL_ID,
  OPENAI_SERVICE_MANAGED_LABEL,
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
  OPENAI_REASONING_EFFORT_STORAGE_KEY,
  THINKING_BUDGET_STORAGE_KEY,
  THINKING_LEVEL_STORAGE_KEY,
  COGNITO_THINKING_BUDGET_STORAGE_KEY,
  COGNITO_THINKING_LEVEL_STORAGE_KEY,
  MUSE_THINKING_BUDGET_STORAGE_KEY,
  MUSE_THINKING_LEVEL_STORAGE_KEY,
  DEFAULT_THINKING_BUDGET,
  DEFAULT_THINKING_LEVEL,
  DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
} from '../constants';
import { AiProvider, AiRoleConfig, DiscussionMode, OpenAiReasoningEffort } from '../types';

const FONT_SIZE_STORAGE_KEY = 'dualAiChatFontSizeScale';
const DEFAULT_FONT_SIZE_SCALE = 0.875;

type RoleKey = 'cognito' | 'muse';

const DEFAULT_ROLE_CONFIGS: Record<RoleKey, AiRoleConfig> = {
  cognito: {
    provider: 'gemini',
    apiKey: '',
    baseUrl: DEFAULT_GEMINI_API_BASE_URL,
    modelId: DEFAULT_COGNITO_MODEL_API_NAME,
  },
  muse: {
    provider: 'gemini',
    apiKey: '',
    baseUrl: DEFAULT_GEMINI_API_BASE_URL,
    modelId: DEFAULT_MUSE_MODEL_API_NAME,
  },
};

const isAiProvider = (value: unknown): value is AiProvider =>
  value === 'gemini' || value === 'openai-compatible';

const getServerManagedOpenAiConfig = (role: RoleKey, modelId?: string): AiRoleConfig => ({
  provider: 'openai-compatible',
  apiKey: '',
  baseUrl: '',
  modelId: typeof modelId === 'string' ? modelId : getDefaultModelId(role, 'openai-compatible'),
});

const getDefaultRoleConfig = (role: RoleKey): AiRoleConfig => ({
  ...DEFAULT_ROLE_CONFIGS[role],
});

const getDefaultBaseUrl = (provider: AiProvider) =>
  provider === 'gemini' ? DEFAULT_GEMINI_API_BASE_URL : '';

const getDefaultModelId = (role: RoleKey, provider: AiProvider) => {
  if (provider === 'gemini') {
    return role === 'cognito' ? DEFAULT_COGNITO_MODEL_API_NAME : DEFAULT_MUSE_MODEL_API_NAME;
  }
  return role === 'cognito' ? DEFAULT_OPENAI_COGNITO_MODEL_ID : DEFAULT_OPENAI_MUSE_MODEL_ID;
};

const normalizeRoleConfig = (role: RoleKey, config: Partial<AiRoleConfig>): AiRoleConfig => {
  const provider = isAiProvider(config.provider) ? config.provider : getDefaultRoleConfig(role).provider;
  if (provider === 'openai-compatible') {
    return getServerManagedOpenAiConfig(
      role,
      typeof config.modelId === 'string' && config.modelId.trim()
        ? config.modelId
        : getDefaultModelId(role, provider)
    );
  }
  return {
    provider,
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    baseUrl: typeof config.baseUrl === 'string' && config.baseUrl.trim()
      ? config.baseUrl
      : getDefaultBaseUrl(provider),
    modelId: typeof config.modelId === 'string' ? config.modelId : getDefaultModelId(role, provider),
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
    return getServerManagedOpenAiConfig(
      role,
      role === 'cognito'
        ? localStorage.getItem(OPENAI_COGNITO_MODEL_ID_STORAGE_KEY) || DEFAULT_OPENAI_COGNITO_MODEL_ID
        : localStorage.getItem(OPENAI_MUSE_MODEL_ID_STORAGE_KEY) || DEFAULT_OPENAI_MUSE_MODEL_ID
    );
  }

  if (legacyGeminiEnabled) {
    return {
      provider: 'gemini',
      apiKey: localStorage.getItem(CUSTOM_API_KEY_STORAGE_KEY) || '',
      baseUrl: localStorage.getItem(CUSTOM_API_ENDPOINT_STORAGE_KEY) || DEFAULT_GEMINI_API_BASE_URL,
      modelId: getDefaultModelId(role, 'gemini'),
    };
  }

  return getDefaultRoleConfig(role);
};

const getInitialRoleConfig = (role: RoleKey, storageKey: string): AiRoleConfig =>
  parseStoredRoleConfig(role, storageKey) || getMigratedLegacyRoleConfig(role);

const buildRoleModelDetails = (role: RoleKey, config: AiRoleConfig): AiModel => {
  const modelId = config.modelId.trim();
  const providerLabel = config.provider === 'gemini' ? 'Gemini' : 'OpenAI 兼容';
  const roleLabel = role === 'cognito' ? 'Cognito' : 'Muse';

  if (config.provider === 'openai-compatible') {
    return {
      id: `${role}-openai-compatible`,
      name: `${roleLabel} / ${providerLabel} / ${modelId || OPENAI_SERVICE_MANAGED_LABEL}`,
      apiName: modelId,
      supportsSystemInstruction: true,
    };
  }

  const normalizedModelId = modelId.toLowerCase();
  const knownModel = config.provider === 'gemini'
    ? MODELS.find((model) => model.apiName === modelId)
    : undefined;
  const supportsGeminiThinking = config.provider === 'gemini'
    && (knownModel?.supportsThinkingConfig
      || normalizedModelId.startsWith('gemini-2.5')
      || normalizedModelId.startsWith('gemini-3'));

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
  const [openAiReasoningEffort, setOpenAiReasoningEffort] = useState<OpenAiReasoningEffort>(() => {
    const stored = localStorage.getItem(OPENAI_REASONING_EFFORT_STORAGE_KEY);
    if (stored === 'low' || stored === 'medium' || stored === 'high' || stored === 'xhigh') return stored;
    return DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT;
  });

  useEffect(() => {
    localStorage.setItem(COGNITO_ROLE_CONFIG_STORAGE_KEY, JSON.stringify(cognitoConfig));
  }, [cognitoConfig]);

  useEffect(() => {
    localStorage.setItem(MUSE_ROLE_CONFIG_STORAGE_KEY, JSON.stringify(museConfig));
  }, [museConfig]);

  useEffect(() => {
    localStorage.removeItem(USE_OPENAI_API_CONFIG_STORAGE_KEY);
    localStorage.removeItem(OPENAI_API_BASE_URL_STORAGE_KEY);
    localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
    localStorage.removeItem(OPENAI_COGNITO_MODEL_ID_STORAGE_KEY);
    localStorage.removeItem(OPENAI_MUSE_MODEL_ID_STORAGE_KEY);
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSizeScale * 100}%`;
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSizeScale.toString());
  }, [fontSizeScale]);

  useEffect(() => { localStorage.setItem(COGNITO_THINKING_BUDGET_STORAGE_KEY, cognitoThinkingBudget.toString()); }, [cognitoThinkingBudget]);
  useEffect(() => { localStorage.setItem(COGNITO_THINKING_LEVEL_STORAGE_KEY, cognitoThinkingLevel); }, [cognitoThinkingLevel]);
  useEffect(() => { localStorage.setItem(MUSE_THINKING_BUDGET_STORAGE_KEY, museThinkingBudget.toString()); }, [museThinkingBudget]);
  useEffect(() => { localStorage.setItem(MUSE_THINKING_LEVEL_STORAGE_KEY, museThinkingLevel); }, [museThinkingLevel]);
  useEffect(() => { localStorage.setItem(OPENAI_REASONING_EFFORT_STORAGE_KEY, openAiReasoningEffort); }, [openAiReasoningEffort]);

  const updateRoleConfig = useCallback((role: RoleKey, patch: Partial<AiRoleConfig>) => {
    const setter = role === 'cognito' ? setCognitoConfig : setMuseConfig;
    setter((current) => {
      const nextProvider = isAiProvider(patch.provider) ? patch.provider : current.provider;
      if (nextProvider === 'openai-compatible') {
        const nextModelId = typeof patch.modelId === 'string'
          ? patch.modelId
          : current.provider === 'openai-compatible' && current.modelId.trim()
            ? current.modelId
            : getDefaultModelId(role, nextProvider);
        return getServerManagedOpenAiConfig(role, nextModelId);
      }
      const providerChanged = nextProvider !== current.provider;
      const nextBaseUrl = typeof patch.baseUrl === 'string'
        ? patch.baseUrl
        : providerChanged && (!current.baseUrl.trim() || current.baseUrl === getDefaultBaseUrl(current.provider))
          ? getDefaultBaseUrl(nextProvider)
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

  return {
    cognitoConfig,
    museConfig,
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
    openAiReasoningEffort, setOpenAiReasoningEffort,

    fontSizeScale, setFontSizeScale,

    actualCognitoModelDetails,
    actualMuseModelDetails,
  };
};
