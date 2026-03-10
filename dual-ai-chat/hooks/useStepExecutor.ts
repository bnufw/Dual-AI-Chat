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
  | 'openAiReasoningEffort'
> {
  state: ReturnType<typeof useChatState>;
}

const getRoleConfigForSender = (
  sender: MessageSender,
  cognitoConfig: UseStepExecutorProps['cognitoConfig'],
  museConfig: UseStepExecutorProps['museConfig']
) => sender === MessageSender.Cognito ? cognitoConfig : museConfig;

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
  openAiReasoningEffort,
}: UseStepExecutorProps) => {
  const getOpenAiRole = (sender: MessageSender): 'cognito' | 'muse' =>
    sender === MessageSender.Cognito ? 'cognito' : 'muse';

  const getMissingConfigMessage = (sender: MessageSender, provider: UseStepExecutorProps['cognitoConfig']['provider']) =>
    provider === 'openai-compatible'
      ? `${sender} 的 OpenAI 兼容服务端配置未完成。`
      : `${sender} 的 ${getProviderLabel(provider)} API Key 未配置。`;

  const getInvalidConfigMessage = (sender: MessageSender, provider: UseStepExecutorProps['cognitoConfig']['provider']) =>
    provider === 'openai-compatible'
      ? `${sender} 的 OpenAI 兼容服务端密钥无效或权限不足。`
      : `${sender} 的 ${getProviderLabel(provider)} API Key 无效或权限不足。`;

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
            getOpenAiRole(senderForStep),
            roleConfig.modelId,
            openAiReasoningEffort,
            prompt,
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
              message: getMissingConfigMessage(senderForStep, roleConfig.provider),
            });
            throw new Error(result.text);
          }

          if (result.error === 'API key invalid or permission denied') {
            setGlobalApiKeyStatus({
              isInvalid: true,
              message: getInvalidConfigMessage(senderForStep, roleConfig.provider),
            });
            throw new Error(result.text);
          }

          throw new Error(result.text || 'AI 响应错误');
        }

        setGlobalApiKeyStatus({ isMissing: false, isInvalid: false, message: undefined });
        parsedResponse = parseAIResponse(result.text);
        addMessage(parsedResponse.spokenText, senderForStep, purposeForStep, result.durationMs, undefined, result.thoughts);
        stepSuccess = true;
      } catch (error) {
        const currentError = error as Error;

        if (state.cancelRequestRef.current || currentError.name === 'AbortError' || currentError.message === '用户取消操作') {
          throw new Error('用户取消操作');
        }

        if (currentError.message.includes('API密钥') || currentError.message.toLowerCase().includes('api key')) {
          throw currentError;
        }

        if (autoRetryCount < MAX_AUTO_RETRIES) {
          addMessage(
            `[${senderForStep} - ${stepIdentifier}] 调用失败，重试 (${autoRetryCount + 1}/${MAX_AUTO_RETRIES})... ${currentError.message}`,
            MessageSender.System,
            MessagePurpose.SystemNotification
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_BASE_MS * (autoRetryCount + 1)));
        } else {
          const errorMsgId = addMessage(
            `[${senderForStep} - ${stepIdentifier}] 在 ${MAX_AUTO_RETRIES + 1} 次尝试后失败: ${currentError.message} 可手动重试。`,
            MessageSender.System,
            MessagePurpose.SystemNotification
          );

          state.setFailedStepInfo({
            stepIdentifier,
            prompt,
            modelName: roleConfig.provider === 'openai-compatible' ? roleConfig.modelId : modelDetailsForStep.apiName,
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
    openAiReasoningEffort,
    getThinkingConfigForGeminiModel,
  ]);

  return { executeStep, getThinkingConfigForGeminiModel };
};
