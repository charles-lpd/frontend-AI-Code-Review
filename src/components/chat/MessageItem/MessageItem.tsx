import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
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
}

const processContent = (text: string) => {
  if (!text) return text;

  let processed = text;
  processed = processed.replace(/\n{3,}/g, '\n\n');
  processed = processed.replace(/^\n+/, '');

  return processed;
};

const MarkdownContent = memo(function MarkdownContent({
  content,
}: {
  content: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <CodeBlock
              language={match[1]}
              value={String(children).replace(/\n$/, '')}
              {...props}
            />
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

const ReviewStreamView = memo(function ReviewStreamView({
  reviewStream,
  fallback,
}: {
  reviewStream: NonNullable<ChatMessage['metadata']>['reviewStream'];
  fallback: string;
}) {
  if (!reviewStream) {
    return <MarkdownContent content={fallback} />;
  }

  const hasStructuredContent =
    reviewStream.statusText ||
    reviewStream.dimensions.length > 0 ||
    reviewStream.summaryText ||
    reviewStream.finalText;

  if (!hasStructuredContent) {
    return <MarkdownContent content={fallback} />;
  }

  return (
    <div className="review-stream">
      {reviewStream.statusText && (
        <section className="review-stream__section">
          <div className="review-stream__label">进度</div>
          <MarkdownContent content={reviewStream.statusText} />
        </section>
      )}

      {reviewStream.dimensions.map((dimension) => (
        <section className="review-stream__section" key={dimension.name}>
          <div className="review-stream__header">
            <div className="review-stream__title">{dimension.name}</div>
            <div className="review-stream__meta">
              {typeof dimension.duration === 'number' && (
                <span className="review-stream__badge">
                  {(dimension.duration / 1000).toFixed(1)}s
                </span>
              )}
              {dimension.loading && (
                <span className="review-stream__badge review-stream__badge--loading">
                  分析中
                </span>
              )}
              {typeof dimension.ok === 'boolean' && (
                <span
                  className={`review-stream__badge ${dimension.ok ? 'review-stream__badge--ok' : 'review-stream__badge--warn'}`}
                >
                  {dimension.ok ? '完成' : '异常'}
                </span>
              )}
            </div>
          </div>
          {dimension.loading && (
            <div className="review-stream__loading">
              <span className="review-stream__loading-dot"></span>
              <span className="review-stream__loading-text">
                正在流式生成...
              </span>
            </div>
          )}
          <MarkdownContent content={dimension.content || '处理中...'} />
        </section>
      ))}

      {reviewStream.summaryText && (
        <section className="review-stream__section">
          <div className="review-stream__label">总结</div>
          <MarkdownContent content={reviewStream.summaryText} />
        </section>
      )}

      {reviewStream.finalText && (
        <section className="review-stream__section review-stream__section--muted">
          <MarkdownContent content={reviewStream.finalText} />
        </section>
      )}
    </div>
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
        (left, right) => left.stepIndex - right.stepIndex,
      ),
    [agent?.steps],
  );

  if (!agent || steps.length === 0) return null;

  const statusLabel =
    agent.status === 'failed'
      ? '执行失败'
      : agent.status === 'completed'
        ? '处理完成'
        : '正在处理';

  return (
    <div className={`knowledge-agent knowledge-agent--${agent.status}`}>
      <button
        type="button"
        className="knowledge-agent__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="knowledge-agent__heading">
          {agent.status === 'running' ? (
            <LoaderCircle size={15} className="knowledge-agent__spinner" />
          ) : agent.status === 'failed' ? (
            <XCircle size={15} />
          ) : (
            <CheckCircle2 size={15} />
          )}
          知识库 Agent · {statusLabel}
        </span>
        <ChevronDown
          size={16}
          className={`knowledge-agent__chevron ${open ? 'is-open' : ''}`}
        />
      </button>
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
  content,
  metadata,
}: MessageItemProps) {
  const processedContent = useMemo(() => processContent(content), [content]);
  const reviewStream = metadata?.reviewStream;
  const knowledgeAgent = metadata?.knowledgeAgent;
  console.log(knowledgeAgent, '123123')
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
        ) : role === 'assistant' && reviewStream?.kind === 'code_review' ? (
          <ReviewStreamView
            reviewStream={reviewStream}
            fallback={processedContent}
          />
        ) : (
          <MarkdownContent content={processedContent} />
        )}
      </div>
    </div>
  );
});

export default MessageItem;

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">{language}</span>
        <button className="code-block__copy" onClick={copyToClipboard}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          maxWidth: '100%',
          overflowX: 'auto',
          width: '100%',
        }}
        showLineNumbers={false}
        wrapLines={true}
        wrapLongLines={true}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}
