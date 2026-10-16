import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/badge';
import { Label } from '@/ui/label';
import { Checkbox } from '@/ui/checkbox';
import { type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAgentRuntime } from '../hooks/useAgentRuntime';
import { useAgentPageView } from '../hooks/useAgentPageView';
import ConnectGithub from '../components/ConnectGithub';
import { AgentArtifactPanel } from '../components/agent/AgentArtifactPanel';
import { AgentClarificationCard } from '../components/agent/AgentClarificationCard';
import { AgentConfirmCard } from '../components/agent/AgentConfirmCard';
import { AgentErrorCard } from '../components/agent/AgentErrorCard';
import { AgentHeader } from '../components/agent/AgentHeader';
import { AgentInputBar } from '../components/agent/AgentInputBar';
import { AgentRunMetaPanel } from '../components/agent/AgentRunMetaPanel';
import { AgentStreamPanel } from '../components/agent/AgentStreamPanel';
import { AgentTimeline } from '../components/agent/AgentTimeline';
import type { AgentPageProps } from '../types/agent';
import './Agent.css';

function ExpandablePanel({
  title,
  subtitle,
  open,
  onToggle,
  badge,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`agent-page__panel ${className}`.trim()}>
      <Button variant="ghost"
        type="button"
        className="agent-page__panel-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div>
          <div className="agent-page__panel-title-row">
            <h2 className="agent-page__panel-title">{title}</h2>
            {badge}
          </div>
          {subtitle && <p className="agent-page__panel-subtitle">{subtitle}</p>}
        </div>
        <span className={`agent-page__collapse-icon${open ? ' agent-page__collapse-icon--open' : ''}`}>⌄</span>
      </Button>
      <div
        className={`agent-page__collapse-shell${
          open ? ' agent-page__collapse-shell--open' : ''
        }`}
      >
        <div className="agent-page__collapse-body">{children}</div>
      </div>
    </Card>
  );
}

export default function AgentPage(props: AgentPageProps = {}) {
  const { isAuthenticated } = useAuth();
  const agent = useAgentRuntime(props);
  const view = useAgentPageView({
    status: agent.state.status,
    intent: agent.state.intent,
    route: agent.state.route,
  });

  const isNeedInput = agent.state.isNeedInput;
  const isWaitingConfirm = agent.state.isWaitingConfirm;
  const isResuming = agent.state.isResuming;

  const isOverviewOpen = view.isPanelOpen('overview');
  const isStateOpen = view.isPanelOpen('state');
  const isAdvancedOpen = view.isPanelOpen('advanced');
  const toggleAdvanced = view.toggleAdvanced;
  const togglePanel = view.togglePanel;

  const currentTaskMeta = (
    <div className="agent-page__stack">
      <div className="agent-page__info-row">
        <span>目标类型</span>
        <strong>{view.routeLabel}</strong>
      </div>
      <div className="agent-page__info-row">
        <span>摘要</span>
        <strong>{agent.state.summary || '等待后端生成'}</strong>
      </div>
      <div className="agent-page__info-row">
        <span>摘要上下文</span>
        <strong>{agent.state.summaryContext || '未返回'}</strong>
      </div>
      <div className="agent-page__info-row">
        <span>计划草案</span>
        <strong>{agent.state.reviewPlan ? '已生成' : '等待后端生成'}</strong>
      </div>
      <div className="agent-page__info-row">
        <span>上下文</span>
        <strong>{agent.state.contextJson ? '已携带' : '未提供'}</strong>
      </div>
      <div className="agent-page__info-row">
        <span>目标信息</span>
        <strong>{agent.state.currentTarget ? '已识别' : '未提供'}</strong>
      </div>
      <div className="agent-page__info-row">
        <span>补充回答</span>
        <strong>
          {Object.keys(agent.state.answers).length ? `${Object.keys(agent.state.answers).length} 项` : '未填写'}
        </strong>
      </div>
    </div>
  );

  if (!isAuthenticated) {
    return <ConnectGithub />;
  }

  return (
    <div className="agent-page">
      <AgentHeader
        runId={agent.state.runId}
        status={agent.state.status}
        intent={agent.state.intent}
        route={agent.state.route}
        currentStep={agent.state.currentStep}
        summary={view.topStatusText}
        onCopyRunId={agent.actions.copyRunId}
        onReset={agent.actions.resetToFresh}
      />

      <div className="agent-page__layout">
        <aside className="agent-page__column">
          <ExpandablePanel
            title="任务概览"
            subtitle="Agent 会自动理解意图并生成步骤。"
            open={isOverviewOpen}
            onToggle={() => togglePanel('overview')}
            badge={<Badge className="agent-page__panel-badge">{view.intentLabel}</Badge>}
          >
            {currentTaskMeta}
          </ExpandablePanel>

          <AgentTimeline
            steps={agent.state.steps}
            currentStep={agent.state.displayedStepKey}
            onStepClick={agent.actions.handleStepClick}
          />

          <ExpandablePanel
            title="高级设置"
            subtitle="控制写回、PR 和自动评论。"
            open={isAdvancedOpen}
            onToggle={toggleAdvanced}
            badge={<Badge className="agent-page__panel-badge">偏好</Badge>}
          >
            <div className="agent-page__advanced">
              <Label className="agent-page__switch">
                <Checkbox
                  type="checkbox"
                  checked={agent.state.confirmPreferences.allowWriteBack}
                  onChange={(e) => agent.actions.handleConfirmToggleWriteBack(e.target.checked)}
                />
                <span>允许写回仓库</span>
              </Label>
              <Label className="agent-page__switch">
                <Checkbox
                  type="checkbox"
                  checked={agent.state.confirmPreferences.allowCreatePR}
                  onChange={(e) => agent.actions.handleConfirmToggleCreatePR(e.target.checked)}
                />
                <span>允许创建 PR</span>
              </Label>
              <Label className="agent-page__switch">
                <Checkbox
                  type="checkbox"
                  checked={agent.state.confirmPreferences.allowAutoComment}
                  onChange={(e) => agent.actions.handleConfirmToggleAutoComment(e.target.checked)}
                />
                <span>允许自动评论</span>
              </Label>
            </div>
          </ExpandablePanel>
        </aside>

        <main className="agent-page__column agent-page__column--main">
          <ExpandablePanel
            title="执行状态"
            subtitle="展示当前 Agent 运行与待处理信息。"
            open={isStateOpen}
            onToggle={() => togglePanel('state')}
            badge={<Badge className="agent-page__panel-badge">{view.statusBadgeLabel}</Badge>}
          >
            {agent.state.status === 'idle' ? (
              <div className="agent-page__state-card">
                <div className="agent-page__state-card-title">
                  <span>开始一个 Agent 任务</span>
                </div>
                <p className="agent-page__state-card-text">
                  用一句自然语言描述目标，Agent 会自动识别意图、规划步骤并在需要时追问你。
                </p>
              </div>
            ) : isNeedInput ? (
              <AgentClarificationCard
                questions={agent.state.questions}
                answer={agent.state.inputValue}
                onAnswerChange={agent.actions.handleClarificationChange}
                onSubmit={agent.actions.handleSubmit}
              />
            ) : isWaitingConfirm ? (
              <AgentConfirmCard
                title="等待确认继续"
                description="当前阶段已经生成草稿或完成分析，确认后将继续进入后半段执行。"
                summary={agent.state.finalSummary || agent.state.summary || undefined}
                allowWriteBack={agent.state.confirmPreferences.allowWriteBack}
                allowCreatePR={agent.state.confirmPreferences.allowCreatePR}
                allowAutoComment={agent.state.confirmPreferences.allowAutoComment}
                onConfirm={agent.actions.handleSubmit}
                onCancel={agent.actions.resetToFresh}
                onToggleWriteBack={agent.actions.handleConfirmToggleWriteBack}
                onToggleCreatePR={agent.actions.handleConfirmToggleCreatePR}
                onToggleAutoComment={agent.actions.handleConfirmToggleAutoComment}
              />
            ) : agent.state.status === 'completed' ? (
              <div className="agent-page__state-card agent-page__state-card--success">
                <div className="agent-page__state-card-title">
                  <span>任务已完成</span>
                </div>
                <p className="agent-page__state-card-text">
                  {agent.state.finalSummary || agent.state.summary || 'Agent 运行已完成，可以查看右侧产物和底部结果。'}
                </p>
              </div>
            ) : agent.state.status === 'failed' ? (
              <AgentErrorCard
                message={agent.state.errorMessage || 'Agent 运行失败，请检查后重试。'}
                detail={agent.state.latestCheckpointId ? { latestCheckpointId: agent.state.latestCheckpointId } : undefined}
                onRetry={agent.actions.resetToFresh}
                onRecover={agent.state.runId ? agent.actions.handleRecover : undefined}
              />
            ) : (
              <div className="agent-page__state-card">
                <div className="agent-page__state-card-title">
                  <span>执行中</span>
                </div>
                <p className="agent-page__state-card-text">{view.topStatusText}</p>
                {agent.state.currentStep && (
                  <div className="agent-page__state-meta">
                    <span>当前步骤: {agent.state.currentStep}</span>
                    {agent.state.intent && <span>意图: {view.intentLabel}</span>}
                    {agent.state.route && <span>路由: {view.routeLabel}</span>}
                  </div>
                )}
              </div>
            )}
          </ExpandablePanel>

          <AgentStreamPanel items={agent.state.streamItems} isStreaming={agent.state.isStreaming || isResuming} />
        </main>

        <aside className="agent-page__column">
          <AgentArtifactPanel
            artifacts={agent.state.artifacts}
            summary={agent.state.summary}
            finalSummary={agent.state.finalSummary}
            branchName={agent.state.branchName}
            commitMessage={agent.state.commitMessage}
            pullRequestUrl={agent.state.pullRequestUrl}
            generatedDocument={agent.state.generatedDocument}
            generatedFix={agent.state.generatedFix}
          />

          <AgentRunMetaPanel
            runId={agent.state.runId}
            status={agent.state.status}
            intent={agent.state.intent}
            route={agent.state.route}
            target={agent.state.currentTarget}
            latestCheckpointId={agent.state.latestCheckpointId}
          />
        </aside>
      </div>

      <AgentInputBar
        status={agent.state.status}
        mode={agent.state.activeMode}
        value={agent.state.inputValue}
        onChange={agent.actions.handleInputChange}
        onSubmit={agent.actions.handleSubmit}
        onConfirm={isWaitingConfirm ? agent.actions.handleSubmit : undefined}
        onCancel={agent.actions.resetToFresh}
        disabled={agent.state.isStreaming || isResuming}
        placeholder={agent.state.inputPlaceholder}
      />

      {agent.state.errorMessage && (
        <div className="agent-page__error-bar">
          <span>{agent.state.errorMessage}</span>
        </div>
      )}
    </div>
  );
}
