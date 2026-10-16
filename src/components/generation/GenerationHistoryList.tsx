import { Card } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { memo, useMemo } from 'react';
import { Copy, RefreshCcw, Trash2 } from 'lucide-react';
import type { GenerationHistoryItem } from '../../types/generation';

interface GenerationHistoryListProps {
  history: GenerationHistoryItem[];
  currentRunId: string | null;
  onSelect: (runId: string) => void;
  onRetry: (runId: string) => void;
  onDelete: (runId: string) => void;
  onCopyRunId: (runId: string) => void;
}

function statusText(status: GenerationHistoryItem['status']) {
  switch (status) {
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'rejected':
      return '被拦截';
    case 'running':
      return '运行中';
    case 'queued':
      return '排队中';
    default:
      return '待开始';
  }
}

function GenerationHistoryListBase({
  history,
  currentRunId,
  onSelect,
  onRetry,
  onDelete,
  onCopyRunId,
}: GenerationHistoryListProps) {
  const orderedHistory = useMemo(() => history, [history]);

  return (
    <Card className="generation-page__card generation-page__history">
      <div className="generation-page__card-head">
        <div>
          <h2 className="generation-page__card-title">历史任务</h2>
          <p className="generation-page__card-subtitle">点击可恢复单条任务详情。</p>
        </div>
        <Badge className="generation-page__badge">{orderedHistory.length} 条</Badge>
      </div>

      <div className="generation-page__history-list">
        {orderedHistory.length > 0 ? (
          orderedHistory.map((item) => (
            <article
              key={item.runId}
              className={`generation-page__history-item${item.runId === currentRunId ? ' generation-page__history-item--active' : ''}`}
            >
              <Button variant="outline"
                type="button"
                className="generation-page__history-main"
                onClick={() => onSelect(item.runId)}
              >
                <div className="generation-page__history-title-row">
                  <span className="generation-page__history-title">
                    {item.title || item.promptSummary || item.runId}
                  </span>
                  <Badge className={`generation-page__status-badge generation-page__status-badge--${item.status}`}>
                    {statusText(item.status)}
                  </Badge>
                </div>
                <div className="generation-page__history-meta">
                  <span>{new Date(item.updatedAt).toLocaleString()}</span>
                  <span>{item.artifactCount} 个产物</span>
                  <span>{item.runId}</span>
                  {typeof item.progress === 'number' && <span>{item.progress}%</span>}
                  {item.provider && <span>{item.provider}</span>}
                  {item.model && <span>{item.model}</span>}
                </div>
                <div className="generation-page__history-summary">{item.promptSummary}</div>
              </Button>
              <div className="generation-page__history-actions">
                <Button variant="outline" type="button" className="generation-page__ghost-button generation-page__ghost-button--small" onClick={() => onCopyRunId(item.runId)}>
                  <Copy size={13} />
                  复制
                </Button>
                <Button variant="outline" type="button" className="generation-page__ghost-button generation-page__ghost-button--small" onClick={() => onRetry(item.runId)}>
                  <RefreshCcw size={13} />
                  重试
                </Button>
                <Button variant="outline" type="button" className="generation-page__ghost-button generation-page__ghost-button--small generation-page__ghost-button--danger" onClick={() => onDelete(item.runId)}>
                  <Trash2 size={13} />
                  删除
                </Button>
              </div>
            </article>
          ))
        ) : (
          <div className="generation-page__empty-note">这里还没有任务，先创建一个新的生成任务吧。</div>
        )}
      </div>
    </Card>
  );
}

export const GenerationHistoryList = memo(GenerationHistoryListBase);
