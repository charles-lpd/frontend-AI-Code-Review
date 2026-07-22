import { useMemo, type ReactNode } from 'react';
import type { AgentStreamItem } from '../types/agent';

type AgentStreamSectionKey = 'progress' | 'artifact' | 'result' | 'error';

export interface AgentStreamSection {
  key: AgentStreamSectionKey;
  title: string;
  count: number;
  items: AgentStreamItem[];
}

export interface UseAgentStreamPanelArgs {
  items: AgentStreamItem[];
  isStreaming: boolean;
}

export interface UseAgentStreamPanelResult {
  headerSummary: string;
  countLabel: string;
  sections: AgentStreamSection[];
  hasItems: boolean;
  subtitleSuffix: string;
}

function sectionKeyOf(item: AgentStreamItem): AgentStreamSectionKey {
  switch (item.type) {
    case 'artifact_created':
      return 'artifact';
    case 'finished':
      return 'result';
    case 'error':
      return 'error';
    default:
      return 'progress';
  }
}

function sectionTitle(key: AgentStreamSectionKey): string {
  switch (key) {
    case 'artifact':
      return '产物';
    case 'result':
      return '结果';
    case 'error':
      return '错误';
    default:
      return '运行过程';
  }
}

function itemSummary(item: AgentStreamItem): ReactNode {
  if (item.text) return item.text;
  if (item.summary) return item.summary;
  if (item.questions?.length) return `包含 ${item.questions.length} 个追问`;
  return null;
}

export function useAgentStreamPanel({
  items,
  isStreaming,
}: UseAgentStreamPanelArgs): UseAgentStreamPanelResult {
  const sections = useMemo(() => {
    const orderedKeys: AgentStreamSectionKey[] = ['progress', 'artifact', 'result', 'error'];
    const grouped = new Map<AgentStreamSectionKey, AgentStreamItem[]>();

    items.forEach((item) => {
      const key = sectionKeyOf(item);
      const list = grouped.get(key);
      if (list) {
        list.push(item);
      } else {
        grouped.set(key, [item]);
      }
    });

    return orderedKeys
      .map((key) => {
        const sectionItems = grouped.get(key) ?? [];
        return {
          key,
          title: sectionTitle(key),
          count: sectionItems.length,
          items: sectionItems,
        };
      })
      .filter((section) => section.count > 0);
  }, [items]);

  const hasItems = items.length > 0;
  const countLabel = `${items.length} 条`;
  const latestItem = items[items.length - 1];
  const latestSummary = latestItem ? itemSummary(latestItem) : null;
  const headerSummary = useMemo(() => {
    if (typeof latestSummary === 'string' && latestSummary.trim()) {
      return latestSummary;
    }
    if (latestSummary) {
      return String(latestSummary);
    }
    if (isStreaming) {
      return '正在接收 Agent 的流式事件。';
    }
    return '等待任务开始后，将显示规划、追问、产物与完成结果。';
  }, [isStreaming, latestSummary]);

  const subtitleSuffix = isStreaming ? ' 当前正在接收数据。' : '';

  return {
    headerSummary,
    countLabel,
    sections,
    hasItems,
    subtitleSuffix,
  };
}
