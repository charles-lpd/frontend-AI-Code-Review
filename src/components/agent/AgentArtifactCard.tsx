import { Button } from '@/ui/button';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { memo, useState } from 'react';
import type { AgentArtifactCardProps } from '../../types/agent';

function getDisplayText(value: unknown) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function AgentArtifactCardBase({
  title,
  content,
  data,
  url,
  filePath,
  onCopy,
  onOpen,
}: AgentArtifactCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const preview = content || getDisplayText(data);

  return (
    <div className="agent-page__artifact-card">
      <div className="agent-page__artifact-head">
        <Button variant="ghost"
          type="button"
          className="agent-page__artifact-toggle"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          <div>
            <div className="agent-page__artifact-title-row">
              <span className="agent-page__artifact-title">{title}</span>
            </div>
            <div className="agent-page__artifact-meta">
              {filePath || title}
            </div>
          </div>
          <ChevronDown
            size={16}
            className={`agent-page__collapse-icon agent-page__collapse-icon--small${
              isExpanded ? ' agent-page__collapse-icon--open' : ''
            }`}
          />
        </Button>

        <div className="agent-page__artifact-actions">
          {url && (
            <a
              className="agent-page__artifact-link"
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={() => onOpen?.()}
            >
              打开
              <ExternalLink size={12} />
            </a>
          )}
          {onCopy && (
            <Button variant="ghost"
              type="button"
              className="agent-page__artifact-copy"
              onClick={onCopy}
            >
              复制
            </Button>
          )}
        </div>
      </div>

      <div
        className={`agent-page__collapse-shell agent-page__collapse-shell--inner${
          isExpanded ? ' agent-page__collapse-shell--open' : ''
        }`}
      >
        <div className="agent-page__collapse-body">
          <pre className="agent-page__artifact-text">{preview}</pre>
        </div>
      </div>
    </div>
  );
}

export const AgentArtifactCard = memo(AgentArtifactCardBase);
