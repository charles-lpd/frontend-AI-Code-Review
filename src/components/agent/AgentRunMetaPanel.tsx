import { memo } from 'react';
import type { AgentRunMetaPanelProps } from '../../types/agent';

function statusLabel(status?: string) {
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

function AgentRunMetaPanelBase({
  runId,
  status,
  intent,
  route,
  target,
  latestCheckpointId,
}: AgentRunMetaPanelProps) {
  return (
    <section className="agent-page__panel">
      <div className="agent-page__panel-toggle" aria-hidden="true">
        <div>
          <div className="agent-page__panel-title-row">
            <h2 className="agent-page__panel-title">运行信息</h2>
            <span className="agent-page__panel-badge">{statusLabel(status)}</span>
          </div>
          <p className="agent-page__panel-subtitle">用于刷新恢复和排查。</p>
        </div>
      </div>

      <div className="agent-page__collapse-shell agent-page__collapse-shell--open">
        <div className="agent-page__collapse-body">
          <div className="agent-page__stack">
            <div className="agent-page__info-row">
              <span>RunId</span>
              <strong>{runId || '未创建'}</strong>
            </div>
            <div className="agent-page__info-row">
              <span>状态</span>
              <strong>{statusLabel(status)}</strong>
            </div>
            <div className="agent-page__info-row">
              <span>意图</span>
              <strong>{intent || '未识别'}</strong>
            </div>
            <div className="agent-page__info-row">
              <span>路由</span>
              <strong>{route || '未路由'}</strong>
            </div>
            <div className="agent-page__info-row">
              <span>目标</span>
              <strong>
                {target.owner || target.repo || target.branch || target.filePath || target.pullNumber || target.sha
                  ? JSON.stringify(target)
                  : '未提供'}
              </strong>
            </div>
            <div className="agent-page__info-row">
              <span>Checkpoint</span>
              <strong>{latestCheckpointId || '无'}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const AgentRunMetaPanel = memo(AgentRunMetaPanelBase);
