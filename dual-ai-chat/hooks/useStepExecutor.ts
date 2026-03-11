import { useCallback } from 'react';
import { ChatLogicCommonDependencies, MessageSender, MessagePurpose } from '../types';
import { generateResponse as generateGeminiResponse } from '../services/geminiService';
import { generateOpenAiResponse } from '../services/openaiService';
import { AiModel, MAX_AUTO_RETRIES, RETRY_DELAY_BASE_MS } from '../constants';
import { parseAIResponse, ParsedAIResponse, getProviderLabel } from '../utils/appUtils';
import { useChatState } from './useChatState';
interface UseStepExecutorProps extends Pick<
  ChatLogicCommonDependencies,
  | 'addMessage'
  | 'setGlobalApiKeyStatus'
  | 'cognitoSystemPrompt'
  | 'museSystemPrompt'
  | 'cognitoConfig'
  | 'museConfig'
  | 'cognitoThinkingBudget'
  | 'cognitoThinkingLevel'
  | 'museThinkingBudget'
  | 'museThinkingLevel'
> {
  state: ReturnType<typeof useChatState>;
}

const getRoleConfigForSender = (
  sender: MessageSender,
  cognitoConfig: UseStepExecutorProps['cognitoConfig'],
  museConfig: UseStepExecutorProps['museConfig']
) => sender === MessageSender.Cognito ? cognitoConfig : museConfig;

const getAutoRetryDelayMs = (attemptIndex: number, retryAfterMs?: number) => {
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return retryAfterMs;
  }

  const exponentialDelay = RETRY_DELAY_BASE_MS * (2 ** attemptIndex);
  const jitterMs = Math.floor(Math.random() * 250);
  return exponentialDelay + jitterMs;
};

export const useStepExecutor = ({
  state,
  addMessage,
  setGlobalApiKeyStatus,
  cognitoSystemPrompt,
  museSystemPrompt,
  cognitoConfig,
  museConfig,
  cognitoThinkingBudget,
  cognitoThinkingLevel,
  museThinkingBudget,
  museThinkingLevel,
}: UseStepExecutorProps) => {
  const getThinkingConfigForGeminiModel = useCallback((
    modelDetails: AiModel,
    budget: number,
    level: 'LOW' | 'HIGH',
    provider: UseStepExecutorProps['cognitoConfig']['provider']
  ): { thinkingBudget?: number; thinkingLevel?: 'LOW' | 'HIGH' } | undefined => {
    const normalizedModelId = modelDetails.apiName.trim().toLowerCase();
    const isGemini3 = normalizedModelId.startsWith('gemini-3');

    if (provider !== 'gemini' || !modelDetails.supportsThinkingConfig) {
      return undefined;
    }

    if (budget === 0) {
      return undefined;
    }

    if (budget === -1) {
      return isGemini3 ? { thinkingLevel: level } : { thinkingBudget: 1024 };
    }

    return { thinkingBudget: budget };
  }, []);

  const executeStep = useCallback(async (
    stepIdentifier: string,
    prompt: string,
    modelDetailsForStep: AiModel,
    senderForStep: MessageSender,
    purposeForStep: MessagePurpose,
    imageApiPartForStep?: { inlineData: { mimeType: string; data: string } },
    userInputForFlowContext?: string,
    imageApiPartForFlowContext?: { inlineData: { mimeType: string; data: string } },
    discussionLogBeforeFailureContext?: string[],
    currentTurnIndexForResumeContext?: number,
    previousAISignaledStopForResumeContext?: boolean
  ): Promise<ParsedAIResponse> => {
    let stepSuccess = false;
    let parsedResponse: ParsedAIResponse | null = null;
    let autoRetryCount = 0;

    const roleConfig = getRoleConfigForSender(senderForStep, cognitoConfig, museConfig);
    const systemInstructionToUse = senderForStep === MessageSender.Cognito ? cognitoSystemPrompt : museSystemPrompt;
    const specificThinkingBudget = senderForStep === MessageSender.Cognito ? cognitoThinkingBudget : museThinkingBudget;
    const specificThinkingLevel = senderForStep === MessageSender.Cognito ? cognitoThinkingLevel : museThinkingLevel;
    const thinkingConfigToUseForGemini = getThinkingConfigForGeminiModel(
      modelDetailsForStep,
      specificThinkingBudget,
      specificThinkingLevel,
      roleConfig.provider
    );

    while (autoRetryCount <= MAX_AUTO_RETRIES && !stepSuccess) {
      if (state.cancelRequestRef.current) throw new Error('用户取消操作');

      try {
        const imagePayload = imageApiPartForStep
          ? { mimeType: imageApiPartForStep.inlineData.mimeType, data: imageApiPartForStep.inlineData.data }
          : undefined;

        const result = roleConfig.provider === 'openai-compatible'
          ? await generateOpenAiResponse(
            prompt,
            modelDetailsForStep.apiName,
            roleConfig.apiKey,
            roleConfig.baseUrl,
            roleConfig.openaiTransport,
            roleConfig.openaiReasoningEffort,
            modelDetailsForStep.supportsSystemInstruction ? systemInstructionToUse : undefined,
            imagePayload,
            state.abortControllerRef.current?.signal
          )
          : await generateGeminiResponse(
            prompt,
            modelDetailsForStep.apiName,
            roleConfig.apiKey,
            roleConfig.baseUrl,
            modelDetailsForStep.supportsSystemInstruction ? systemInstructionToUse : undefined,
            imageApiPartForStep,
            thinkingConfigToUseForGemini,
            state.abortControllerRef.current?.signal
          );

        if (state.cancelRequestRef.current) throw new Error('用户取消操作');

        if (result.error) {
          if (result.error === 'AbortError' || result.text === '用户取消操作') {
            throw new Error('用户取消操作');
          }

          if (result.error === 'API key not configured' || result.error.toLowerCase().includes('api key not provided')) {
            setGlobalApiKeyStatus({
              isMissing: true,
              message: `${senderForStep} 的 ${getProviderLabel(roleConfig.provider)} API Key 未配置。`,
            });
            const missingKeyError = new Error(result.text) as Error & { isApiKeyError?: boolean; retryable?: boolean };
            missingKeyError.isApiKeyError = true;
            missingKeyError.retryable = false;
            throw missingKeyError;
          }

          if (result.error === 'API key invalid or permission denied') {
            setGlobalApiKeyStatus({
              isInvalid: true,
              message: `${senderForStep} 的 ${getProviderLabel(roleConfig.provider)} API Key 无效或权限不足。`,
            });
            const invalidKeyError = new Error(result.text) as Error & { isApiKeyError?: boolean; retryable?: boolean };
            invalidKeyError.isApiKeyError = true;
            invalidKeyError.retryable = false;
            throw invalidKeyError;
          }

          const requestError = new Error(result.text || 'AI 响应错误') as Error & {
            retryable?: boolean;
            retryAfterMs?: number;
          };
          requestError.retryable = result.retryable === true;
          requestError.retryAfterMs = result.retryAfterMs;
          throw requestError;
        }

        setGlobalApiKeyStatus({ isMissing: false, isInvalid: false, message: undefined });
        parsedResponse = parseAIResponse(result.text);
        addMessage(parsedResponse.spokenText, senderForStep, purposeForStep, result.durationMs, undefined, result.thoughts);
        stepSuccess = true;
      } catch (error) {
        const currentError = error as Error & {
          isApiKeyError?: boolean;
          retryable?: boolean;
          retryAfterMs?: number;
        };

        if (state.cancelRequestRef.current || currentError.name === 'AbortError' || currentError.message === '用户取消操作') {
          throw new Error('用户取消操作');
        }

        if (currentError.isApiKeyError || currentError.message.includes('API密钥') || currentError.message.toLowerCase().includes('api key')) {
          throw currentError;
        }

        const shouldAutoRetry = currentError.retryable === true && autoRetryCount < MAX_AUTO_RETRIES;

        if (shouldAutoRetry) {
          await new Promise((resolve) => setTimeout(resolve, getAutoRetryDelayMs(autoRetryCount, currentError.retryAfterMs)));
        } else {
          const errorMsgId = addMessage(
            currentError.retryable
              ? `[${senderForStep} - ${stepIdentifier}] 调用失败，已自动重试 ${autoRetryCount} 次：${currentError.message}`
              : `[${senderForStep} - ${stepIdentifier}] 调用失败：${currentError.message}`,
            MessageSender.System,
            MessagePurpose.SystemNotification
          );

          state.setFailedStepInfo({
            stepIdentifier,
            prompt,
            modelName: modelDetailsForStep.apiName,
            systemInstruction: modelDetailsForStep.supportsSystemInstruction ? systemInstructionToUse : undefined,
            imageApiPart: imageApiPartForStep,
            sender: senderForStep,
            purpose: purposeForStep,
            originalSystemErrorMsgId: errorMsgId,
            thinkingConfig: roleConfig.provider === 'gemini' ? thinkingConfigToUseForGemini : undefined,
            userInputForFlow: userInputForFlowContext || '',
            imageApiPartForFlow: imageApiPartForFlowContext,
            discussionLogBeforeFailure: discussionLogBeforeFailureContext || [],
            currentTurnIndexForResume: currentTurnIndexForResumeContext,
            previousAISignaledStopForResume: previousAISignaledStopForResumeContext,
          });
          state.setIsInternalDiscussionActive(false);
          (currentError as any).isHandled = true;
          throw currentError;
        }
      }

      autoRetryCount++;
    }

    if (!parsedResponse) {
      state.setIsInternalDiscussionActive(false);
      throw new Error('AI响应处理失败');
    }

    return parsedResponse;
  }, [
    state,
    addMessage,
    setGlobalApiKeyStatus,
    cognitoSystemPrompt,
    museSystemPrompt,
    cognitoConfig,
    museConfig,
    cognitoThinkingBudget,
    cognitoThinkingLevel,
    museThinkingBudget,
    museThinkingLevel,
    getThinkingConfigForGeminiModel,
  ]);

  return { executeStep, getThinkingConfigForGeminiModel };
};
