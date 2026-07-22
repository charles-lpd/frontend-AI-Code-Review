import { memo } from 'react';
import { Bot, Copy, RefreshCcw } from 'lucide-react';
import type { AgentHeaderProps } from '../../types/agent';

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

function intentLabel(intent?: string | null) {
  switch (intent) {
    case 'code_review':
      return '代码审查';
    case 'doc_rewrite':
      return '文档重写';
    case 'readme_generation':
      return 'README 生成';
    case 'code_fix':
      return '代码修复';
    case 'mixed_task':
      return '混合任务';
    case 'need_clarification':
      return '需要追问';
    default:
      return intent || '未识别';
  }
}

function routeLabel(route?: string | null) {
  switch (route) {
    case 'code_review':
      return '代码审查流';
    case 'doc_rewrite':
      return '文档重写流';
    case 'mixed_task':
      return '混合任务流';
    case 'need_clarification':
      return '追问流';
    default:
      return route || '未路由';
  }
}

function AgentHeaderBase({
  runId,
  status,
  intent,
  route,
  currentStep,
  summary,
  onCopyRunId,
  onReset,
}: AgentHeaderProps) {
  return (
    <>
      <div className="agent-page__hero">
        <div>
          <div className="agent-page__eyebrow">
            <Bot size={14} />
            <span>Agent 工作台</span>
          </div>
          <h1 className="agent-page__title">自然语言任务执行页</h1>
          <p className="agent-page__subtitle">{summary || '等待开始'}</p>
        </div>
        <div className="agent-page__hero-actions">
          <button
            type="button"
            className="agent-page__ghost-button"
            onClick={onCopyRunId}
            disabled={!runId}
          >
            <Copy size={16} />
            复制 runId
          </button>
          <button type="button" className="agent-page__ghost-button" onClick={onReset}>
            <RefreshCcw size={16} />
            新任务
          </button>
        </div>
      </div>

      <div className="agent-page__meta-row">
        <div className={`agent-page__status-pill agent-page__status--${status || 'idle'}`}>
          {statusLabel(status)}
        </div>
        <div className="agent-page__meta-chip">Intent: {intentLabel(intent)}</div>
        <div className="agent-page__meta-chip">Route: {routeLabel(route)}</div>
        <div className="agent-page__meta-chip">Step: {currentStep || '未开始'}</div>
        <div className="agent-page__meta-chip">RunId: {runId || '未创建'}</div>
      </div>
    </>
  );
}

export const AgentHeader = memo(AgentHeaderBase);
