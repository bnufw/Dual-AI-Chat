import React from 'react';
import { AiProvider, DiscussionMode, OpenAiReasoningEffort } from '../../types';
import {
  Repeat,
  Zap,
  Layers,
  Database,
  Minus,
  Plus,
} from 'lucide-react';
import { ThinkingControl } from './ThinkingControl';
import {
  DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT,
  OPENAI_REASONING_EFFORT_OPTIONS,
} from '../../constants';

interface DiscussionSettingsProps {
  isLoading: boolean;
  discussionMode: DiscussionMode;
  onDiscussionModeChange: (mode: DiscussionMode) => void;
  manualFixedTurns: number;
  onManualFixedTurnsChange: (value: number | string) => void;
  minManualFixedTurns: number;
  maxManualFixedTurns: number;
  cognitoProvider: AiProvider;
  cognitoModelId: string;
  cognitoThinkingBudget: number;
  setCognitoThinkingBudget: (val: number) => void;
  cognitoThinkingLevel: 'LOW' | 'HIGH';
  setCognitoThinkingLevel: (val: 'LOW' | 'HIGH') => void;
  museProvider: AiProvider;
  museModelId: string;
  museThinkingBudget: number;
  setMuseThinkingBudget: (val: number) => void;
  museThinkingLevel: 'LOW' | 'HIGH';
  setMuseThinkingLevel: (val: 'LOW' | 'HIGH') => void;
  openAiReasoningEffort: OpenAiReasoningEffort;
  setOpenAiReasoningEffort: (val: OpenAiReasoningEffort) => void;
}

const OpenAiReasoningNote = ({
  accent,
}: {
  accent: 'teal' | 'fuchsia';
}) => (
  <div className={`p-4 rounded-xl border ${accent === 'teal' ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800'}`}>
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-lg ${accent === 'teal' ? 'bg-teal-100 text-teal-600' : 'bg-fuchsia-100 text-fuchsia-600'} shrink-0`}>
        <Database size={16} />
      </div>
      <div className="space-y-1 flex-1">
        <h5 className="text-sm font-bold">Responses 思考模式</h5>
        <p className="text-xs leading-relaxed">
          当前角色会使用全局共享的 <code>reasoning.effort</code>。默认值是 <code>{DEFAULT_OPENAI_RESPONSES_REASONING_EFFORT}</code>。
        </p>
      </div>
    </div>
  </div>
);

const OpenAiReasoningControl = ({
  value,
  onChange,
}: {
  value: OpenAiReasoningEffort;
  onChange: (value: OpenAiReasoningEffort) => void;
}) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <Database size={16} className="text-slate-500" />
      <h5 className="text-sm font-bold text-slate-800">OpenAI 全局思考强度</h5>
    </div>
    <p className="text-xs leading-relaxed text-slate-500">
      只要任一角色选择 OpenAI 兼容，这个共享值就会随请求一起发给 Python 接口。可选项为 <code>low</code>、<code>medium</code>、<code>high</code>、<code>xhigh</code>。
    </p>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {OPENAI_REASONING_EFFORT_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              active
                ? 'border-slate-800 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  </div>
);

const DiscussionSettings: React.FC<DiscussionSettingsProps> = ({
  isLoading,
  discussionMode,
  onDiscussionModeChange,
  manualFixedTurns,
  onManualFixedTurnsChange,
  minManualFixedTurns,
  maxManualFixedTurns,
  cognitoProvider,
  cognitoModelId,
  cognitoThinkingBudget,
  setCognitoThinkingBudget,
  cognitoThinkingLevel,
  setCognitoThinkingLevel,
  museProvider,
  museModelId,
  museThinkingBudget,
  setMuseThinkingBudget,
  museThinkingLevel,
  setMuseThinkingLevel,
  openAiReasoningEffort,
  setOpenAiReasoningEffort,
}) => {
  const hasOpenAiRole = cognitoProvider === 'openai-compatible' || museProvider === 'openai-compatible';

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers size={18} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">流程控制</h4>
        </div>

        <div className="bg-slate-100 p-1 rounded-xl flex relative select-none">
          <button
            onClick={() => !isLoading && onDiscussionModeChange(DiscussionMode.AiDriven)}
            className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-200 ${
              discussionMode === DiscussionMode.AiDriven
                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <Zap size={16} className={discussionMode === DiscussionMode.AiDriven ? 'fill-amber-400 text-amber-500' : ''} />
              <span className="font-semibold text-sm">AI 驱动</span>
            </div>
            <span className="text-[10px] opacity-60">自动检测结束</span>
          </button>

          <button
            onClick={() => !isLoading && onDiscussionModeChange(DiscussionMode.FixedTurns)}
            className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-200 ${
              discussionMode === DiscussionMode.FixedTurns
                ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <Repeat size={16} className={discussionMode === DiscussionMode.FixedTurns ? 'text-indigo-500' : ''} />
              <span className="font-semibold text-sm">固定轮次</span>
            </div>
            <span className="text-[10px] opacity-60">指定轮次数量</span>
          </button>
        </div>

        {discussionMode === DiscussionMode.FixedTurns && (
          <div className="mt-4 bg-white rounded-xl p-5 border border-slate-200 animate-in slide-in-from-top-1 fade-in duration-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">每位 AI 轮次</span>
              <span className="text-sm font-mono font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100">
                {manualFixedTurns}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onManualFixedTurnsChange(manualFixedTurns - 1)}
                disabled={isLoading || manualFixedTurns <= minManualFixedTurns}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="减少固定轮次"
              >
                <Minus size={16} />
              </button>
              <input
                type="range"
                min={minManualFixedTurns}
                max={maxManualFixedTurns}
                step="1"
                value={manualFixedTurns}
                onChange={(e) => onManualFixedTurnsChange(e.target.value)}
                onInput={(e) => onManualFixedTurnsChange((e.target as HTMLInputElement).value)}
                className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-600"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => onManualFixedTurnsChange(manualFixedTurns + 1)}
                disabled={isLoading || manualFixedTurns >= maxManualFixedTurns}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="增加固定轮次"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="mt-3 flex justify-end">
              <input
                type="number"
                min={minManualFixedTurns}
                max={maxManualFixedTurns}
                step="1"
                value={manualFixedTurns}
                onChange={(e) => onManualFixedTurnsChange(e.target.value)}
                className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center font-mono text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
                aria-label="固定轮次数值"
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-medium">
              <span>{minManualFixedTurns} 最小</span>
              <span>{maxManualFixedTurns} 最大</span>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div>
          <h4 className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-2">Cognito 思考过程</h4>
          {cognitoProvider === 'gemini' ? (
            <ThinkingControl
              modelId={cognitoModelId}
              thinkingBudget={cognitoThinkingBudget}
              setThinkingBudget={setCognitoThinkingBudget}
              thinkingLevel={cognitoThinkingLevel}
              setThinkingLevel={setCognitoThinkingLevel}
              disabled={isLoading}
            />
          ) : (
            <OpenAiReasoningNote
              accent="teal"
            />
          )}
        </div>

        <div>
          <h4 className="text-xs font-bold text-fuchsia-600 uppercase tracking-wider mb-2">Muse 思考过程</h4>
          {museProvider === 'gemini' ? (
            <ThinkingControl
              modelId={museModelId}
              thinkingBudget={museThinkingBudget}
              setThinkingBudget={setMuseThinkingBudget}
              thinkingLevel={museThinkingLevel}
              setThinkingLevel={setMuseThinkingLevel}
              disabled={isLoading}
            />
          ) : (
            <OpenAiReasoningNote
              accent="fuchsia"
            />
          )}
        </div>

        {hasOpenAiRole && (
          <OpenAiReasoningControl value={openAiReasoningEffort} onChange={setOpenAiReasoningEffort} />
        )}
      </section>
    </div>
  );
};

export default DiscussionSettings;
