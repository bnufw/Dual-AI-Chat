import { AiProvider, AiRoleConfig, DiscussionMode } from '../types';

export const getProviderLabel = (provider: AiProvider) =>
  provider === 'gemini' ? 'Gemini' : 'OpenAI 兼容';

export const getRoleModelSummary = (config: AiRoleConfig) =>
  `${getProviderLabel(config.provider)} / ${config.modelId.trim() || '未指定'}`;

export const getWelcomeMessageText = (
  currentDiscussionMode: DiscussionMode,
  currentManualFixedTurns: number,
  cognitoConfig: AiRoleConfig,
  museConfig: AiRoleConfig
): string => {
  const modeInfo = currentDiscussionMode === DiscussionMode.FixedTurns
    ? `固定轮次 (${currentManualFixedTurns}轮)`
    : 'AI 驱动 (自动)';

  return `Dual AI Chat 已就绪\n模式：${modeInfo}\nCognito：${getRoleModelSummary(cognitoConfig)}\nMuse：${getRoleModelSummary(museConfig)}`;
};
