import { Button } from '@/ui/button';
import { memo } from 'react';
import type { AgentStepItemProps } from '../../types/agent';

function stepStatusText(status: AgentStepItemProps['step']['stepStatus']) {
  switch (status) {
    case 'running':
      return '执行中';
    case 'completed':
      return '已完成';
    case 'waiting':
      return '等待你确认';
    case 'failed':
      return '失败';
    case 'skipped':
      return '已跳过';
    default:
      return '未开始';
  }
}

function AgentStepItemBase({
  step,
  isActive,
  isExpanded,
  onClick,
}: AgentStepItemProps) {
  return (
    <Button variant="outline"
      type="button"
      className={`agent-page__step-item${
        isActive ? ' agent-page__step-item--active' : ''
      }`}
      onClick={onClick}
    >
      <div className="agent-page__step-main">
        <div className="agent-page__step-row">
          <span className="agent-page__step-index">
            {String(step.stepIndex + 1).padStart(2, '0')}
          </span>
          <span className="agent-page__step-label">{step.stepLabel}</span>
        </div>
        <div className="agent-page__step-subtext">{stepStatusText(step.stepStatus)}</div>

        {isExpanded && (
          <div className="agent-page__step-extra">
            <div className="agent-page__step-extra-item">
              <span>Key</span>
              <strong>{step.stepKey}</strong>
            </div>
            <div className="agent-page__step-extra-item">
              <span>开始</span>
              <strong>{step.startedAt || '未开始'}</strong>
            </div>
            <div className="agent-page__step-extra-item">
              <span>结束</span>
              <strong>{step.finishedAt || '未结束'}</strong>
            </div>
            <div className="agent-page__step-extra-item">
              <span>耗时</span>
              <strong>
                {typeof step.durationMs === 'number'
                  ? `${step.durationMs}ms`
                  : '未知'}
              </strong>
            </div>
          </div>
        )}
      </div>

      <span className={`agent-page__step-status agent-page__step-status--${step.stepStatus}`}>
        {stepStatusText(step.stepStatus)}
      </span>
    </Button>
  );
}

export const AgentStepItem = memo(AgentStepItemBase);
