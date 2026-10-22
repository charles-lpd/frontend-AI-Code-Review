import { Button } from '@/ui/button';
import { MarkdownRenderer as MarkdownContent } from '@/components/markdown/MarkdownRenderer';
import { useStreamDraft } from '@/hooks/useStreamDraft';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Info,
  LoaderCircle,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import type { ChatMessage, ChatRole, ApiErrorCode, KnowledgeAgentStep } from '../../../types/chat';
import './MessageItem.css';

/** 工具步骤失败且后端只给了错误码时的兜底文案 */
const STEP_FAIL_CODE_TEXT: Partial<Record<ApiErrorCode, string>> = {
  GITHUB_REPO_NOT_ACCESSIBLE: '当前账号没有该仓库的权限',
  GITHUB_FORBIDDEN: 'GitHub 拒绝访问该仓库',
  GITHUB_NOT_FOUND: '仓库或文件不存在',
  GITHUB_RATE_LIMITED: 'GitHub 接口限流',
  GITHUB_UNAVAILABLE: 'GitHub 连接超时',
};

interface MessageItemProps {
  role: ChatRole;
  content: string;
  metadata?: ChatMessage['metadata'];
  streamKey?: string;
  streaming?: boolean;
}

/** 文档 4.5：这些工具的 detail 形如 repo:path，可拼成 GitHub 链接 */
const GITHUB_PATH_TOOL_KEYS = new Set([
  'tool:github_list_files',
  'tool:github_read_file',
  'tool:github_search_code',
  'tool:github_get_commits',
]);

/** 把 repo:path 形式的 detail 转成 GitHub 链接；无法可靠解析时返回 null（detail 可能被截断成 "…"） */
function githubDetailUrl(stepKey: string, detail?: string): string | null {
  if (!detail || !GITHUB_PATH_TOOL_KEYS.has(stepKey) || detail.endsWith('…')) return null;
  const separator = detail.indexOf(':');
  if (separator <= 0 || separator === detail.length - 1) return null;
  const repo = detail.slice(0, separator);
  const path = detail.slice(separator + 1);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return `https://github.com/${repo}/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** 工具步骤的进度展示 */
const KnowledgeAgentStepLabel = memo(function KnowledgeAgentStepLabel({
  step,
}: {
  step: KnowledgeAgentStep;
}) {
  const url = githubDetailUrl(step.stepKey, step.detail);
  if (step.stepStatus === 'running') {
    return (
      <span className="knowledge-agent__step-label">
        正在{step.detail ? `${step.stepLabel} ${step.detail}` : step.stepLabel}
      </span>
    );
  }
  if (!step.detail) {
    return <span className="knowledge-agent__step-label">{step.stepLabel}</span>;
  }
  return (
    <span className="knowledge-agent__step-label">
      {step.stepLabel}：
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="knowledge-agent__step-link">
          {step.detail}
        </a>
      ) : (
        step.detail
      )}
    </span>
  );
});

const KnowledgeAgentView = memo(function KnowledgeAgentView({
  agent,
}: {
  agent: NonNullable<ChatMessage['metadata']>['knowledgeAgent'];
}) {
  const [open, setOpen] = useState(true);
  const steps = useMemo(
    () =>
      Object.values(agent?.steps ?? {}).sort(
        (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
      ),
    [agent?.steps],
  );

  if (!agent || steps.length === 0) return null;

  const statusLabel =
    agent.status === 'failed'
      ? '执行失败'
      : agent.status === 'aborted'
        ? '已停止'
      : agent.status === 'completed'
        ? '处理完成'
        : '正在处理';
  const modeLabel = agent.executionMode
    ? { auto: '自动', direct: '普通问答', knowledge: '知识库', assistant: '高级助手' }[agent.executionMode]
    : 'Agent';

  return (
    <div className={`knowledge-agent knowledge-agent--${agent.status}`}>
      <Button variant="ghost"
        type="button"
        className="knowledge-agent__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="knowledge-agent__heading">
          {agent.status === 'connecting' || agent.status === 'retrieving' || agent.status === 'generating' ? (
            <LoaderCircle size={15} className="knowledge-agent__spinner" />
          ) : agent.status === 'failed' ? (
            <XCircle size={15} />
          ) : (
            <CheckCircle2 size={15} />
          )}
          {modeLabel} · {statusLabel}
        </span>
        <ChevronDown
          size={16}
          className={`knowledge-agent__chevron ${open ? 'is-open' : ''}`}
        />
      </Button>
      <div className={`knowledge-agent__body ${open ? 'is-open' : ''}`}>
        <div className="knowledge-agent__body-inner">
          {steps.map((step) => (
            <div
              className={`knowledge-agent__step knowledge-agent__step--${step.stepStatus}`}
              key={step.id}
            >
              <span className="knowledge-agent__step-icon">
                {step.stepStatus === 'running' ? (
                  <LoaderCircle size={14} className="knowledge-agent__spinner" />
                ) : step.stepStatus === 'completed' ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <XCircle size={14} />
                )}
              </span>
              <KnowledgeAgentStepLabel step={step} />
              {step.stepStatus === 'completed' &&
                typeof step.durationMs === 'number' && (
                <span className="knowledge-agent__duration">
                  {step.durationMs < 1000
                    ? `${step.durationMs}ms`
                    : `${(step.durationMs / 1000).toFixed(1)}s`}
                </span>
                )}
              {step.stepStatus === 'failed' && (step.message || step.code) && (
                <span className="knowledge-agent__step-fail-reason">
                  {step.message || (step.code ? STEP_FAIL_CODE_TEXT[step.code] : undefined)}
                </span>
              )}
            </div>
          ))}
          {agent.error && (
            <div className="knowledge-agent__error">{agent.error}</div>
          )}
        </div>
      </div>
    </div>
  );
});

const MessageItem = memo(function MessageItem({
  role,
  content: savedContent,
  metadata: savedMetadata,
  streamKey,
  streaming = false,
}: MessageItemProps) {
  const live = useStreamDraft(streamKey);
  const content = live?.content ?? savedContent;
  const metadata = live?.metadata ?? savedMetadata;
  const processedContent = content;
  const knowledgeAgent = metadata?.knowledgeAgent;
  // 请求已发出但还没有任何内容或步骤（连接中）：显示等待提示，而不是一个空气泡
  const awaitingFirstReply =
    role === 'assistant' &&
    !processedContent &&
    !knowledgeAgent?.error &&
    Object.keys(knowledgeAgent?.steps ?? {}).length === 0 &&
    (live?.streaming ?? streaming ?? (knowledgeAgent?.status === 'connecting'));
  const citations = knowledgeAgent?.citations?.length ? knowledgeAgent.citations : metadata?.citations ?? [];
  const icon = useMemo(() => {
    switch (role) {
      case 'user':
        return <User size={18} />;
      case 'assistant':
        return <Bot size={18} />;
      case 'tool':
        return <Wrench size={18} />;
      case 'system':
        return <Info size={18} />;
      default:
        return <Bot size={18} />;
    }
  }, [role]);

  return (
    <div className={`message-item message-item--${role}`}>
      <div className="message-item__avatar">{icon}</div>
      <div className="message-item__content">
        {role === 'assistant' && (
          <KnowledgeAgentView agent={knowledgeAgent} />
        )}
        {role === 'tool' ? (
          <div className="message-item__tool-output">
            <div className="message-item__tool-label">工具调用结果</div>
            <pre>{content}</pre>
          </div>
        ) : awaitingFirstReply ? (
          <div className="message-item__pending">
            <LoaderCircle size={15} className="knowledge-agent__spinner" />
            <span>正在连接…</span>
          </div>
        ) : (
          <MarkdownContent content={processedContent} streaming={live?.streaming ?? streaming} />
        )}
        {role === 'assistant' && citations.length ? (
          <div className="message-item__citations">
            <strong>参考资料</strong>
            <ol>
              {citations.map((citation) => (
                <li key={citation.citationId}>
                  {citation.fileName} · 片段 {citation.chunkStart + 1}
                  {citation.chunkEnd !== citation.chunkStart ? `–${citation.chunkEnd + 1}` : ''}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {role === 'assistant' && (knowledgeAgent?.status === 'truncated' || metadata?.truncated) ? (
          <div className="message-item__notice">回答因长度限制被截断</div>
        ) : null}
      </div>
    </div>
  );
});

export default MessageItem;
