import { memo } from 'react';
import { Sparkles } from 'lucide-react';
import type { AgentConfirmCardProps } from '../../types/agent';

function AgentConfirmCardBase({
  title,
  description,
  summary,
  allowWriteBack,
  allowCreatePR,
  allowAutoComment,
  onConfirm,
  onCancel,
  onToggleWriteBack,
  onToggleCreatePR,
  onToggleAutoComment,
}: AgentConfirmCardProps) {
  return (
    <div className="agent-page__state-card agent-page__state-card--confirm">
      <div className="agent-page__state-card-title">
        <Sparkles size={18} />
        <span>{title}</span>
      </div>
      {description && <p className="agent-page__state-card-text">{description}</p>}
      {summary && <p className="agent-page__state-card-text">{summary}</p>}

      <div className="agent-page__confirm-grid">
        <label className="agent-page__switch">
          <input
            type="checkbox"
            checked={allowWriteBack}
            onChange={(event) => onToggleWriteBack?.(event.target.checked)}
            disabled={!onToggleWriteBack}
          />
          <span>允许写回</span>
        </label>
        <label className="agent-page__switch">
          <input
            type="checkbox"
            checked={allowCreatePR}
            onChange={(event) => onToggleCreatePR?.(event.target.checked)}
            disabled={!onToggleCreatePR}
          />
          <span>允许创建 PR</span>
        </label>
        <label className="agent-page__switch">
          <input
            type="checkbox"
            checked={allowAutoComment}
            onChange={(event) => onToggleAutoComment?.(event.target.checked)}
            disabled={!onToggleAutoComment}
          />
          <span>允许自动评论</span>
        </label>
      </div>

      <div className="agent-page__input-actions">
        <button type="button" className="agent-page__primary-button" onClick={onConfirm}>
          确认继续
        </button>
        <button type="button" className="agent-page__secondary-button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

export const AgentConfirmCard = memo(AgentConfirmCardBase);
