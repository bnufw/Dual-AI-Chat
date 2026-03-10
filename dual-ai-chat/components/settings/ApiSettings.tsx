import React from 'react';
import { AiRoleConfig } from '../../types';
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
  DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
  OPENAI_SERVICE_MANAGED_LABEL,
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

        {isGemini ? (
          <div className="grid grid-cols-1 gap-4">
            <InputField
              label="API Key"
              icon={KeyRound}
              value={config.apiKey}
              onChange={(value) => onChange({ apiKey: value })}
              placeholder="AIzaSy..."
              helper="留空时自动回退到部署时注入的 GEMINI_API_KEY"
              disabled={isLoading}
              type="password"
            />
            <InputField
              label="Base URL"
              icon={Globe}
              value={config.baseUrl}
              onChange={(value) => onChange({ baseUrl: value })}
              placeholder={DEFAULT_GEMINI_API_BASE_URL}
              disabled={isLoading}
              helper="Gemini Developer API、自定义代理，或留空回退到部署时注入的 Gemini URL"
            />
            <InputField
              label="Model ID"
              icon={Bot}
              value={config.modelId}
              onChange={(value) => onChange({ modelId: value })}
              placeholder="gemini-2.5-pro"
              disabled={isLoading}
              helper="Gemini 继续使用当前 thinking level 参数"
            />
          </div>
        ) : (
          <div className={`rounded-xl border ${accent.border} bg-white/80 p-4 space-y-2 text-sm text-slate-600`}>
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Database size={16} className={accent.text} />
              <span>{OPENAI_SERVICE_MANAGED_LABEL}</span>
            </div>
            <InputField
              label="Model ID"
              icon={Database}
              value={config.modelId}
              onChange={(value) => onChange({ modelId: value })}
              placeholder="gpt-5.4"
              disabled={isLoading}
              helper="该角色实际调用的模型名。Base URL 和 Token 由服务端环境变量统一提供。"
            />
            <p>浏览器只会调用同源 Python 接口，不再保存 OpenAI 兼容的 API Key 或 Base URL。</p>
            <p>Responses mode 默认 reasoning.effort 为 {DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT}，可在下方思考设置里切换为 low / medium / high / xhigh。</p>
          </div>
        )}
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
          subtitle="逻辑与综合角色。Gemini 继续前端配置，OpenAI 兼容改为服务端托管。"
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
          subtitle="创意与挑战角色。Gemini 继续前端配置，OpenAI 兼容改为服务端托管。"
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
