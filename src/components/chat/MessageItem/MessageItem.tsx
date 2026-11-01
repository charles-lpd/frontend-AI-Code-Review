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
  EMBEDDING_UNAVAILABLE: '知识库服务暂不可用',
  EMBEDDING_INVALID_RESPONSE: '知识库服务返回异常',
  EMBEDDING_DIMENSION_MISMATCH: '向量配置不一致',
};

/** 记忆保存被拒绝时的提示（memory_rejected） */
const MEMORY_REJECT_TEXT: Partial<Record<string, string>> = {
  MEMORY_TOO_LONG: '记忆超过 500 字，未能保存，请精简后再说',
  MEMORY_LIMIT_REACHED: '本会话的记忆已达 100 条，未能保存，请到记忆列表删除部分记忆',
};

/** 只允许 http(s) 链接；校验通过后原样返回，不做二次编码或规范化 */
function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

interface MessageItemProps {
  role: ChatRole;
  content: string;
  metadata?: ChatMessage['metadata'];
  streamKey?: string;
  streaming?: boolean;
}

/** 工具步骤的链接只使用后端给出的 url（后端按实际 ref 生成），前端不假设分支 */
function githubDetailUrl(url?: string): string | null {
  return url ? safeHttpUrl(url) : null;
}

/** 工具步骤的进度展示 */
const KnowledgeAgentStepLabel = memo(function KnowledgeAgentStepLabel({
  step,
}: {
  step: KnowledgeAgentStep;
}) {
  const url = githubDetailUrl(step.url);
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
  const memories = agent?.memories ?? [];

  if (!agent || (steps.length === 0 && memories.length === 0)) return null;

  const statusLabel =
    agent.status === 'failed'
      ? '执行失败'
      : agent.status === 'aborted'
        ? '已停止'
      : agent.status === 'completed'
        ? '处理完成'
        : '正在处理';
  const modeLabel = 'Agent';

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
          {memories.map((notice) => (
            <div
              className={`knowledge-agent__memory knowledge-agent__memory--${notice.kind}`}
              key={notice.key}
            >
              {notice.kind === 'saved'
                ? `已记住：${notice.text}`
                : MEMORY_REJECT_TEXT[notice.code ?? ''] || notice.message || '记忆未能保存'}
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
