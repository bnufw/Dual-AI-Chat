import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { ChatMessage, MessageSender, MessagePurpose, ApiKeyStatus, AiRoleConfig } from '../types';
import { useAppUI } from './useAppUI';
import { useNotepadLogic } from './useNotepadLogic';
import { useSettings } from './useSettings';
import { useChatLogic } from './useChatLogic';
import { generateUniqueId, getProviderLabel, getWelcomeMessageText } from '../utils/appUtils';
import { CHAT_MESSAGES_STORAGE_KEY } from '../constants';

const DEFAULT_CHAT_PANEL_PERCENT = 60;

const getRoleConfigIssue = (roleLabel: string, config: AiRoleConfig): ApiKeyStatus | null => {
  const missingFields: string[] = [];
  if (!config.apiKey.trim()) missingFields.push('API Key');
  if (!config.baseUrl.trim()) missingFields.push('Base URL');
  if (!config.modelId.trim()) missingFields.push('Model ID');

  if (missingFields.length === 0) return null;

  return {
    isMissing: true,
    message: `${roleLabel} 的 ${getProviderLabel(config.provider)} 配置不完整：缺少 ${missingFields.join('、')}。`,
  };
};

const getConfigurationIssue = (
  cognitoConfig: AiRoleConfig,
  museConfig: AiRoleConfig
): ApiKeyStatus | null =>
  getRoleConfigIssue('Cognito', cognitoConfig) || getRoleConfigIssue('Muse', museConfig);

export const useAppController = (panelsContainerRef: RefObject<HTMLDivElement>) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved).map((message: any) => ({
          ...message,
          timestamp: new Date(message.timestamp),
        }));
      } catch (error) {
        console.error('Failed to parse saved messages', error);
      }
    }
    return [];
  });

  const [runtimeApiKeyStatus, setRuntimeApiKeyStatus] = useState<ApiKeyStatus>({});
  const didSyncConfigRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const ui = useAppUI(DEFAULT_CHAT_PANEL_PERCENT, panelsContainerRef);
  const notepad = useNotepadLogic();
  const settings = useSettings();

  const configIssue = useMemo(
    () => getConfigurationIssue(settings.resolvedCognitoConfig, settings.resolvedMuseConfig),
    [settings.resolvedCognitoConfig, settings.resolvedMuseConfig]
  );
  const apiKeyStatus = configIssue || runtimeApiKeyStatus;

  useEffect(() => {
    if (!didSyncConfigRef.current) {
      didSyncConfigRef.current = true;
      return;
    }
    setRuntimeApiKeyStatus({});
  }, [settings.cognitoConfig, settings.museConfig]);

  const addMessage = useCallback((
    text: string,
    sender: MessageSender,
    purpose: MessagePurpose,
    durationMs?: number,
    image?: ChatMessage['image'],
    thoughts?: string
  ): string => {
    const messageId = generateUniqueId();
    setMessages((previous) => [...previous, {
      id: messageId,
      text,
      sender,
      purpose,
      timestamp: new Date(),
      durationMs,
      image,
      thoughts,
    }]);
    return messageId;
  }, []);

  const chat = useChatLogic({
    addMessage,
    processNotepadUpdateFromAI: notepad.processNotepadUpdateFromAI,
    setGlobalApiKeyStatus: setRuntimeApiKeyStatus,
    cognitoModelDetails: settings.actualCognitoModelDetails,
    museModelDetails: settings.actualMuseModelDetails,
    cognitoConfig: settings.resolvedCognitoConfig,
    museConfig: settings.resolvedMuseConfig,
    discussionMode: settings.discussionMode,
    manualFixedTurns: settings.manualFixedTurns,
    cognitoThinkingBudget: settings.cognitoThinkingBudget,
    cognitoThinkingLevel: settings.cognitoThinkingLevel,
    museThinkingBudget: settings.museThinkingBudget,
    museThinkingLevel: settings.museThinkingLevel,
    cognitoSystemPrompt: settings.cognitoSystemPrompt,
    museSystemPrompt: settings.museSystemPrompt,
    notepadContent: notepad.notepadContent,
    startProcessingTimer: ui.startProcessingTimer,
    stopProcessingTimer: ui.stopProcessingTimer,
    currentQueryStartTimeRef: ui.currentQueryStartTimeRef,
  });

  const initializeChat = useCallback((shouldClear = true) => {
    if (shouldClear) {
      setMessages([]);
      notepad.clearNotepadContent();
    }

    ui.setIsNotepadFullscreen(false);
    setRuntimeApiKeyStatus({});

    if (configIssue) {
      const warningText = `严重警告：${configIssue.message} 在此之前，应用程序功能将受限。`;
      if (shouldClear || messagesRef.current.length === 0) {
        addMessage(warningText, MessageSender.System, MessagePurpose.SystemNotification);
      }
      return;
    }

    const welcomeText = getWelcomeMessageText(
      settings.discussionMode,
      settings.manualFixedTurns,
      settings.cognitoConfig,
      settings.museConfig
    );

    if (shouldClear || messagesRef.current.length === 0) {
      addMessage(welcomeText, MessageSender.System, MessagePurpose.SystemNotification);
    }
  }, [addMessage, configIssue, notepad, settings, ui]);

  useEffect(() => {
    initializeChat(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const welcomeMessage = messages.find(
      (message) => message.sender === MessageSender.System && message.text.startsWith('Dual AI Chat 已就绪')
    );

    if (welcomeMessage && !apiKeyStatus.isMissing && !apiKeyStatus.isInvalid) {
      setMessages((currentMessages) => currentMessages.map((message) =>
        message.id === welcomeMessage.id
          ? {
            ...message,
            text: getWelcomeMessageText(
              settings.discussionMode,
              settings.manualFixedTurns,
              settings.cognitoConfig,
              settings.museConfig
            ),
          }
          : message
      ));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    apiKeyStatus.isInvalid,
    apiKeyStatus.isMissing,
    settings.discussionMode,
    settings.manualFixedTurns,
    settings.cognitoConfig,
    settings.museConfig,
  ]);

  useEffect(() => {
    let intervalId: number | undefined;
    if (chat.isLoading && ui.currentQueryStartTimeRef.current) {
      intervalId = window.setInterval(() => {
        if (ui.currentQueryStartTimeRef.current && !chat.cancelRequestRef.current) {
          ui.updateProcessingTimer();
        }
      }, 100);
    } else {
      if (intervalId) clearInterval(intervalId);
      if (!chat.isLoading && ui.currentQueryStartTimeRef.current !== null) {
        ui.updateProcessingTimer();
      }
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [chat.isLoading, ui.updateProcessingTimer, ui.currentQueryStartTimeRef, chat.cancelRequestRef]);

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ui.isNotepadFullscreen) {
        ui.toggleNotepadFullscreen();
      }
      if (event.key === 'Escape' && ui.isSettingsModalOpen) {
        ui.closeSettingsModal();
      }
    };
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [ui.isNotepadFullscreen, ui.toggleNotepadFullscreen, ui.isSettingsModalOpen, ui.closeSettingsModal]);

  const handleClearChat = useCallback(() => {
    if (chat.isLoading) {
      chat.stopGenerating();
    }
    initializeChat(true);
  }, [chat, initializeChat]);

  const apiKeyBannerMessage = useMemo(() => apiKeyStatus.message || null, [apiKeyStatus.message]);

  return {
    messages,
    apiKeyStatus,
    apiKeyBannerMessage,
    ui,
    notepad,
    settings,
    chat,
    actions: {
      initializeChat,
      handleClearChat,
      addMessage,
    },
  };
};
