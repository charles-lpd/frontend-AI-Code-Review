import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/ui/button';
import { ConfirmAction } from '@/components/confirm-action';
import { clearMemories, deleteMemory, listMemories, type MemoryItem } from '@/api/memories';
import './SessionMemories.css';

const PAGE_SIZE = 20;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** 会话设置页的"长期记忆"一节。仅会话拥有者可用，记忆按会话隔离。 */
export default function SessionMemories({ sessionId, disabled = false }: { sessionId: string; disabled?: boolean }) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [maxItems, setMaxItems] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 每次请求递增；切换会话或重新加载时，丢弃过期的响应
  const requestRef = useRef(0);

  const loadPage = useCallback(async (offset: number, replace: boolean) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listMemories(sessionId, { limit: PAGE_SIZE, offset });
      if (requestId !== requestRef.current) return;
      setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
      setNextOffset(page.nextOffset);
      setMaxItems(page.maxItems);
    } catch (err) {
      if (requestId === requestRef.current) setError(errorText(err, '加载记忆失败'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setItems([]);
    setNextOffset(null);
    void loadPage(0, true);
  }, [loadPage]);

  const handleDelete = async (memoryId: string) => {
    await deleteMemory(sessionId, memoryId);
    setItems((prev) => prev.filter((item) => item.id !== memoryId));
    toast.success('已删除这条记忆');
  };

  const handleClear = async () => {
    const result = await clearMemories(sessionId);
    toast.success(`已清空 ${result.deleted} 条记忆`);
    await loadPage(0, true);
  };

  return (
    <section className="session-memories" aria-labelledby="session-memories-title">
      <div className="session-memories__header">
        <div>
          <h2 id="session-memories-title" className="session-memories__title">长期记忆</h2>
          <p className="session-memories__hint">
            智能体从对话中记住的事实或偏好（"记住……"或自动提取），仅用于本会话。最多 {maxItems} 条。
          </p>
        </div>
        {items.length > 0 && (
          <ConfirmAction
            title="清空全部记忆？"
            description="将删除本会话的所有长期记忆，此操作无法撤销。对话内容和知识库不受影响。"
            onConfirm={handleClear}
          >
            <Button variant="outline" type="button" disabled={disabled || loading}>清空记忆</Button>
          </ConfirmAction>
        )}
      </div>

      {error && <div className="session-memories__error" role="alert">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="session-memories__empty">暂无记忆。可以在对话中发送"记住……"来保存。</div>
      )}

      <ul className="session-memories__list">
        {items.map((item) => (
          <li key={item.id} className="session-memories__item">
            <div className="session-memories__text">{item.text}</div>
            <div className="session-memories__meta">
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <ConfirmAction
                title="删除这条记忆？"
                description="删除后智能体将不再记得这条内容。"
                onConfirm={() => handleDelete(item.id)}
              >
                <Button variant="ghost" type="button" size="icon" aria-label="删除这条记忆" disabled={disabled}>
                  <Trash2 size={15} />
                </Button>
              </ConfirmAction>
            </div>
          </li>
        ))}
      </ul>

      {nextOffset !== null && (
        <Button
          variant="outline"
          type="button"
          className="session-memories__more"
          disabled={loading || disabled}
          onClick={() => void loadPage(nextOffset, false)}
        >
          {loading ? '加载中...' : '加载更多'}
        </Button>
      )}
    </section>
  );
}
