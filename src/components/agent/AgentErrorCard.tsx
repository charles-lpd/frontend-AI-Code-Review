import { Button } from '@/ui/button';
import { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import type { AgentErrorCardProps } from '../../types/agent';

function AgentErrorCardBase({
  title = '运行失败',
  message,
  detail,
  onRetry,
  onRecover,
}: AgentErrorCardProps) {
  return (
    <div className="agent-page__state-card agent-page__state-card--error">
      <div className="agent-page__state-card-title">
        <AlertCircle size={18} />
        <span>{title}</span>
      </div>
      <p className="agent-page__state-card-text">{message}</p>
      {detail != null && (
        <pre className="agent-page__artifact-text agent-page__error-detail">
          {typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)}
        </pre>
      )}
      <div className="agent-page__input-actions">
        {onRetry && (
          <Button type="button" className="agent-page__primary-button" onClick={onRetry}>
            重试
          </Button>
        )}
        {onRecover && (
          <Button variant="outline" type="button" className="agent-page__secondary-button" onClick={onRecover}>
            恢复
          </Button>
        )}
      </div>
    </div>
  );
}

export const AgentErrorCard = memo(AgentErrorCardBase);
