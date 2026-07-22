import { memo } from 'react';
import { FileText } from 'lucide-react';
import { useAgentStreamPanel } from '../../hooks/useAgentStreamPanel';
import type { AgentStreamPanelProps } from '../../types/agent';

function AgentStreamPanelBase({ items, isStreaming }: AgentStreamPanelProps) {
  const { headerSummary, countLabel, sections, hasItems, subtitleSuffix } = useAgentStreamPanel({
    items,
    isStreaming,
  });

  return (
    <section className="agent-page__feed">
      <div className="agent-page__feed-head">
        <div>
          <h2>流式事件</h2>
          <p>
            {headerSummary}
            {subtitleSuffix}
          </p>
        </div>
        <span className="agent-page__feed-count">{countLabel}</span>
      </div>

      <div className="agent-page__feed-list">
        {hasItems ? (
          sections.map((section) => (
            <div key={section.key} className="agent-page__feed-section">
              <div className="agent-page__feed-section-head">
                <h3>{section.title}</h3>
                <span>{section.count} 条</span>
              </div>
              <div className="agent-page__feed-section-body">
                {section.items.map((item) => (
                  <article
                    key={item.id}
                    className={`agent-page__feed-item agent-page__feed-item--${item.type}`}
                  >
                    <div className="agent-page__feed-item-title">
                      <span>{item.type}</span>
                      {item.stepLabel && <strong>{item.stepLabel}</strong>}
                    </div>
                    {item.text && <div className="agent-page__feed-text">{item.text}</div>}
                    {item.summary && <div className="agent-page__feed-text">{item.summary}</div>}
                    {item.questions?.length ? (
                      <div className="agent-page__feed-questions">
                        {item.questions.map((question) => (
                          <div key={question} className="agent-page__question-item">
                            {question}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="agent-page__empty-state">
            <FileText size={36} />
            <h3>等待任务开始</h3>
            <p>输入一句自然语言目标，Agent 会按步骤执行并实时输出。</p>
          </div>
        )}
      </div>
    </section>
  );
}

export const AgentStreamPanel = memo(AgentStreamPanelBase);
