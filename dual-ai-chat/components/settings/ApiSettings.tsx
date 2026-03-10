import React from 'react';
import { AiRoleConfig, OpenAiReasoningEffort, OpenAiTransport } from '../../types';
import {
  Cpu,
  Sparkles,
  Globe,
  KeyRound,
  Bot,
  Database,
  Info,
} from 'lucide-react';
import {
  DEFAULT_GEMINI_API_BASE_URL,
  DEFAULT_OPENAI_API_BASE_URL,
  DEFAULT_OPENAI_CHAT_COMPLETIONS_API_BASE_URL,
  DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
  OPENAI_REASONING_EFFORT_OPTIONS,
  OPENAI_TRANSPORT_OPTIONS,
} from '../../constants';

interface ApiSettingsProps {
  isLoading: boolean;
  cognitoConfig: AiRoleConfig;
  onCognitoConfigChange: (patch: Partial<AiRoleConfig>) => void;
  museConfig: AiRoleConfig;
  onMuseConfigChange: (patch: Partial<AiRoleConfig>) => void;
}

type RoleCardProps = {
  title: string;
  subtitle: string;
  config: AiRoleConfig;
  onChange: (patch: Partial<AiRoleConfig>) => void;
  isLoading: boolean;
  accent: {
    border: string;
    bg: string;
    softBg: string;
    text: string;
    iconBg: string;
  };
  icon: React.ElementType;
};

const getOpenAiTransportLabel = (transport: OpenAiTransport) =>
  transport === 'responses' ? 'Responses' : 'Chat Completions';

const getOpenAiReasoningFieldLabel = (transport: OpenAiTransport) =>
  transport === 'responses' ? 'reasoning.effort' : 'reasoning_effort';

const TRANSPORT_OPTIONS: Array<{ value: OpenAiTransport; label: string; description: string }> = OPENAI_TRANSPORT_OPTIONS.map((value) => ({
  value,
  label: getOpenAiTransportLabel(value),
  description: value === 'responses' ? '兼容 /responses，保留当前链路。' : '兼容 /chat/completions，默认 ai-wave /v1。',
}));

const REASONING_OPTIONS: Array<{ value: OpenAiReasoningEffort; label: string }> = OPENAI_REASONING_EFFORT_OPTIONS.map((value) => ({
  value,
  label: value,
}));

const InputField = ({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  helper,
  disabled,
  type = 'text',
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  helper?: string;
  disabled: boolean;
  type?: string;
}) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
    <div className="relative group">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors">
        <Icon size={16} />
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-sm text-slate-800 placeholder-slate-400 disabled:opacity-60"
      />
    </div>
    {helper && (
      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <Info size={10} />
        {helper}
      </p>
    )}
  </div>
);

const ProviderOption = ({
  active,
  label,
  icon: Icon,
  onClick,
  accentClass,
  disabled,
}: {
  active: boolean;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  accentClass: string;
  disabled: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-semibold transition-all ${
      active
        ? `${accentClass} shadow-sm`
        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white'
    } disabled:opacity-60 disabled:cursor-not-allowed`}
  >
    <Icon size={16} />
    <span>{label}</span>
  </button>
);

const OpenAiOptionButton = ({
  active,
  label,
  description,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  description?: string;
  onClick: () => void;
  disabled: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
      active
        ? 'border-sky-300 bg-sky-50 text-sky-900 shadow-sm'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
    } disabled:opacity-60 disabled:cursor-not-allowed`}
  >
    <div className="text-sm font-semibold">{label}</div>
    {description && <div className="mt-1 text-[11px] leading-relaxed opacity-75">{description}</div>}
  </button>
);

const RoleConfigCard: React.FC<RoleCardProps> = ({
  title,
  subtitle,
  config,
  onChange,
  isLoading,
  accent,
  icon: Icon,
}) => {
  const isGemini = config.provider === 'gemini';
  const openAiBaseUrlPlaceholder = config.openaiTransport === 'chat-completions'
    ? DEFAULT_OPENAI_CHAT_COMPLETIONS_API_BASE_URL
    : DEFAULT_OPENAI_API_BASE_URL;
  const openAiTransportLabel = getOpenAiTransportLabel(config.openaiTransport);
  const openAiReasoningFieldLabel = getOpenAiReasoningFieldLabel(config.openaiTransport);

  return (
    <section className={`rounded-2xl border ${accent.border} ${accent.bg} p-5 sm:p-6 shadow-sm`}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${accent.iconBg} ${accent.text} shrink-0`}>
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <h4 className="text-lg font-bold text-slate-900">{title}</h4>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">协议</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProviderOption
              active={isGemini}
              label="Gemini"
              icon={Bot}
              onClick={() => onChange({ provider: 'gemini' })}
              accentClass={`${accent.softBg} ${accent.text} ${accent.border}`}
              disabled={isLoading}
            />
            <ProviderOption
              active={!isGemini}
              label="OpenAI 兼容"
              icon={Database}
              onClick={() => onChange({ provider: 'openai-compatible' })}
              accentClass={`${accent.softBg} ${accent.text} ${accent.border}`}
              disabled={isLoading}
            />
          </div>
        </div>

        {!isGemini && (
          <div className="space-y-5 rounded-xl border border-slate-200 bg-white/70 p-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Transport</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TRANSPORT_OPTIONS.map((option) => (
                  <OpenAiOptionButton
                    key={option.value}
                    active={config.openaiTransport === option.value}
                    label={option.label}
                    description={option.description}
                    onClick={() => onChange({ openaiTransport: option.value })}
                    disabled={isLoading}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Reasoning Effort</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {REASONING_OPTIONS.map((option) => (
                  <OpenAiOptionButton
                    key={option.value}
                    active={config.openaiReasoningEffort === option.value}
                    label={option.label}
                    onClick={() => onChange({ openaiReasoningEffort: option.value })}
                    disabled={isLoading}
                  />
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                当前会在 <code>{openAiTransportLabel}</code> 请求里发送 <code>{`${openAiReasoningFieldLabel} = ${config.openaiReasoningEffort || DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT}`}</code>。
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <InputField
            label="API Key"
            icon={KeyRound}
            value={config.apiKey}
            onChange={(value) => onChange({ apiKey: value })}
            placeholder={isGemini ? 'AIzaSy...' : 'sk-...'}
            disabled={isLoading}
            type="password"
            helper={isGemini ? '留空时可回退到构建时注入的 GEMINI_API_KEY' : '留空时可回退到构建时注入的 key：PackyCode 用 OPENAI_API_KEY 或 KEY，ai-wave 用 OPENAI_COMPAT_API_KEY 或 KEY2'}
          />
          <InputField
            label="Base URL"
            icon={Globe}
            value={config.baseUrl}
            onChange={(value) => onChange({ baseUrl: value })}
            placeholder={isGemini ? DEFAULT_GEMINI_API_BASE_URL : openAiBaseUrlPlaceholder}
            disabled={isLoading}
            helper={isGemini ? 'Gemini Developer API 或自定义代理地址' : config.openaiTransport === 'responses' ? '需直接指向支持 /responses 的兼容端点' : '需直接指向支持 /chat/completions 的兼容端点；ai-wave 默认 https://api.ai-wave.org/v1'}
          />
          <InputField
            label="Model ID"
            icon={isGemini ? Bot : Database}
            value={config.modelId}
            onChange={(value) => onChange({ modelId: value })}
            placeholder={isGemini ? 'gemini-2.5-pro' : 'gpt-5.4'}
            disabled={isLoading}
            helper={isGemini ? 'Gemini 继续使用当前 thinking level 参数' : `${openAiTransportLabel} mode，${openAiReasoningFieldLabel} = ${config.openaiReasoningEffort}`}
          />
        </div>
      </div>
    </section>
  );
};

const ApiSettings: React.FC<ApiSettingsProps> = ({
  isLoading,
  cognitoConfig,
  onCognitoConfigChange,
  museConfig,
  onMuseConfigChange,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Bot size={18} className="text-slate-400" />
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">角色配置</h4>
      </div>

      <div className="space-y-4">
        <RoleConfigCard
          title="Cognito"
          subtitle="逻辑与综合角色。协议、Key、Base URL、Model ID 在同一块配置。"
          config={cognitoConfig}
          onChange={onCognitoConfigChange}
          isLoading={isLoading}
          accent={{
            border: 'border-teal-200',
            bg: 'bg-teal-50/60',
            softBg: 'bg-teal-100',
            text: 'text-teal-700',
            iconBg: 'bg-teal-100',
          }}
          icon={Cpu}
        />
        <RoleConfigCard
          title="Muse"
          subtitle="创意与挑战角色。协议、Key、Base URL、Model ID 在同一块配置。"
          config={museConfig}
          onChange={onMuseConfigChange}
          isLoading={isLoading}
          accent={{
            border: 'border-fuchsia-200',
            bg: 'bg-fuchsia-50/60',
            softBg: 'bg-fuchsia-100',
            text: 'text-fuchsia-700',
            iconBg: 'bg-fuchsia-100',
          }}
          icon={Sparkles}
        />
      </div>
    </div>
  );
};

export default ApiSettings;
