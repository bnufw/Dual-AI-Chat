import React from 'react';
import SettingsModal from './SettingsModal';
import { useSettings } from '../hooks/useSettings';
import {
  MIN_MANUAL_FIXED_TURNS,
  MAX_MANUAL_FIXED_TURNS,
  DEFAULT_MANUAL_FIXED_TURNS,
  COGNITO_SYSTEM_PROMPT_HEADER,
  MUSE_SYSTEM_PROMPT_HEADER,
} from '../constants';

type SettingsType = ReturnType<typeof useSettings>;

interface AppSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  settings: SettingsType;
}

const AppSettingsDialog: React.FC<AppSettingsDialogProps> = ({
  isOpen,
  onClose,
  isLoading,
  settings,
}) => {
  const handleManualFixedTurnsChange = (rawValue: number | string) => {
    const parsed = typeof rawValue === 'number' ? rawValue : parseInt(rawValue, 10);
    const value = Number.isNaN(parsed) ? DEFAULT_MANUAL_FIXED_TURNS : parsed;
    settings.setManualFixedTurns(Math.min(MAX_MANUAL_FIXED_TURNS, Math.max(MIN_MANUAL_FIXED_TURNS, value)));
  };

  return (
    <SettingsModal
      isOpen={isOpen}
      onClose={onClose}
      isLoading={isLoading}
      discussionMode={settings.discussionMode}
      onDiscussionModeChange={settings.setDiscussionMode}
      manualFixedTurns={settings.manualFixedTurns}
      onManualFixedTurnsChange={handleManualFixedTurnsChange}
      minManualFixedTurns={MIN_MANUAL_FIXED_TURNS}
      maxManualFixedTurns={MAX_MANUAL_FIXED_TURNS}
      cognitoConfig={settings.cognitoConfig}
      onCognitoConfigChange={settings.updateCognitoConfig}
      museConfig={settings.museConfig}
      onMuseConfigChange={settings.updateMuseConfig}
      cognitoThinkingBudget={settings.cognitoThinkingBudget}
      setCognitoThinkingBudget={settings.setCognitoThinkingBudget}
      cognitoThinkingLevel={settings.cognitoThinkingLevel}
      setCognitoThinkingLevel={settings.setCognitoThinkingLevel}
      museThinkingBudget={settings.museThinkingBudget}
      setMuseThinkingBudget={settings.setMuseThinkingBudget}
      museThinkingLevel={settings.museThinkingLevel}
      setMuseThinkingLevel={settings.setMuseThinkingLevel}
      openAiReasoningEffort={settings.openAiReasoningEffort}
      setOpenAiReasoningEffort={settings.setOpenAiReasoningEffort}
      cognitoSystemPrompt={settings.cognitoSystemPrompt}
      onCognitoPromptChange={(e) => settings.setCognitoSystemPrompt(e.target.value)}
      onResetCognitoPrompt={() => settings.setCognitoSystemPrompt(COGNITO_SYSTEM_PROMPT_HEADER)}
      museSystemPrompt={settings.museSystemPrompt}
      onMusePromptChange={(e) => settings.setMuseSystemPrompt(e.target.value)}
      onResetMusePrompt={() => settings.setMuseSystemPrompt(MUSE_SYSTEM_PROMPT_HEADER)}
      supportsSystemInstruction={true}
      fontSizeScale={settings.fontSizeScale}
      onFontSizeScaleChange={settings.setFontSizeScale}
    />
  );
};

export default AppSettingsDialog;
