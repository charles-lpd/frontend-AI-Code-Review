import { Textarea } from '@/ui/textarea';
import { Button } from '@/ui/button';
import { Loader2, Play } from 'lucide-react';
import { memo, useState } from 'react';
import type { AgentInputBarProps } from '../../types/agent';

function modeHint(mode: AgentInputBarProps['mode']) {
  switch (mode) {
    case 'clarify':
      return '请补充追问信息后继续。';
    case 'confirm':
      return '确认后继续执行。';
    case 'resume':
      return '等待恢复执行。';
    case 'disabled':
      return '正在执行中，请等待。';
    default:
      return '输入自然语言，Agent 会自动规划与执行。';
  }
}

function statusText(status: AgentInputBarProps['status']) {
  switch (status) {
    case 'running':
      return '运行中';
    case 'waiting_input':
      return '等待补充';
    case 'waiting_confirmation':
      return '等待确认';
    case 'resuming':
      return '恢复中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return '待开始';
  }
}

function AgentInputBarBase({
  status,
  mode,
  value,
  onChange,
  onSubmit,
  onConfirm,
  onCancel,
  disabled,
  placeholder,
}: AgentInputBarProps) {
  const [isComposing, setIsComposing] = useState(false);

  return (
    <section className="agent-page__input-dock">
      <div className="agent-page__input-head">
        <div>
          <h2>任务输入</h2>
          <p>{modeHint(mode)}</p>
        </div>
        <div className={`agent-page__status-pill agent-page__status--${status || 'idle'}`}>
          {statusText(status)}
        </div>
      </div>

      <div className="agent-page__input-box">
        <Textarea
          className="agent-page__textarea"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder || '输入你的任务'}
          disabled={disabled || mode === 'disabled'}
        />

        <div className="agent-page__input-actions">
          <Button
            type="button"
            className="agent-page__primary-button"
            onClick={onSubmit}
            disabled={disabled || mode === 'disabled' || ((mode === 'new' || mode === 'clarify') && !value.trim())}
          >
            {disabled ? <Loader2 size={16} className="agent-page__spin" /> : <Play size={16} />}
            {mode === 'confirm' ? '继续执行' : mode === 'clarify' ? '提交回答' : '开始执行'}
          </Button>

          <div className="agent-page__input-actions-secondary">
            {onConfirm && (
              <Button variant="outline"
                type="button"
                className="agent-page__secondary-button"
                onClick={onConfirm}
                disabled={disabled || mode !== 'confirm'}
              >
                确认继续
              </Button>
            )}
            {onCancel && (
              <Button variant="outline"
                type="button"
                className="agent-page__secondary-button"
                onClick={onCancel}
              >
                取消
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export const AgentInputBar = memo(AgentInputBarBase);
