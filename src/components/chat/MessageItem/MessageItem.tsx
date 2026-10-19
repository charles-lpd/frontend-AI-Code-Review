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
import type { ChatMessage, ChatRole } from '../../../types/chat';
import './MessageItem.css';

interface MessageItemProps {
  role: ChatRole;
  content: string;
  metadata?: ChatMessage['metadata'];
  streamKey?: string;
  streaming?: boolean;
}

const KnowledgeAgentView = memo(function KnowledgeAgentView({
  agent,
}: {
  agent: NonNullable<ChatMessage['metadata']>['knowledgeAgent'];
}) {
  const [open, setOpen] = useState(true);
  const steps = useMemo(
    () =>
      Object.values(agent?.steps ?? {}).sort(
        (left, right) => (left.stepIndex ?? left.seq ?? 0) - (right.stepIndex ?? right.seq ?? 0),
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
              key={step.stepKey}
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
              <span className="knowledge-agent__step-label">{step.stepLabel}</span>
              {step.stepStatus === 'completed' &&
                typeof step.durationMs === 'number' && (
                <span className="knowledge-agent__duration">
                  {step.durationMs < 1000
                    ? `${step.durationMs}ms`
                    : `${(step.durationMs / 1000).toFixed(1)}s`}
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
