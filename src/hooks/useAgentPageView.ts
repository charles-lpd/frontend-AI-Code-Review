import { useCallback, useState } from 'react';
import type { AgentIntent, AgentRoute, AgentRunStatus } from '../types/agent';

export type AgentPagePanelKey = 'overview' | 'state' | 'advanced';

export interface AgentPageViewState {
  isPanelOpen: (key: AgentPagePanelKey) => boolean;
  togglePanel: (key: AgentPagePanelKey) => void;
  isAdvancedOpen: boolean;
  toggleAdvanced: () => void;
  statusBadgeLabel: string;
  topStatusText: string;
  intentLabel: string;
  routeLabel: string;
}

function getStatusLabel(status?: AgentRunStatus | 'idle') {
  switch (status) {
    case 'running':
      return '运行中';
    case 'waiting_input':
      return '等待补充';
    case 'waiting_confirmation':
      return '等待确认';
    case 'resuming':
      return '恢复中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return '待开始';
  }
}

function getTopStatusText(status?: AgentRunStatus | 'idle') {
  switch (status) {
    case 'running':
      return '正在分析并执行任务';
    case 'waiting_input':
      return '需要补充信息后继续';
    case 'waiting_confirmation':
      return '已生成草稿，等待确认继续';
    case 'resuming':
      return '正在恢复并继续执行';
    case 'completed':
      return '任务已完成';
    case 'failed':
      return '运行失败';
    default:
      return '等待你输入自然语言任务';
  }
}

function getIntentLabel(intent?: AgentIntent | string | null) {
  switch (intent) {
    case 'code_review':
      return '代码审查';
    case 'doc_rewrite':
      return '文档重写';
    case 'readme_generation':
      return 'README 生成';
    case 'code_fix':
      return '代码修复';
    case 'mixed_task':
      return '混合任务';
    case 'need_clarification':
      return '需要追问';
    default:
      return intent || '未识别';
  }
}

function getRouteLabel(route?: AgentRoute | string | null) {
  switch (route) {
    case 'code_review':
      return '代码审查流';
    case 'doc_rewrite':
      return '文档重写流';
    case 'mixed_task':
      return '混合任务流';
    case 'need_clarification':
      return '追问流';
    default:
      return route || '未路由';
  }
}

export function useAgentPageView({
  status,
  intent,
  route,
}: {
  status?: AgentRunStatus | 'idle';
  intent?: AgentIntent | null;
  route?: AgentRoute | null;
}): AgentPageViewState {
  const [openPanels, setOpenPanels] = useState<Record<AgentPagePanelKey, boolean>>({
    overview: true,
    state: true,
    advanced: false,
  });
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const togglePanel = useCallback((key: AgentPagePanelKey) => {
    setOpenPanels((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const isPanelOpen = useCallback(
    (key: AgentPagePanelKey) => Boolean(openPanels[key]),
    [openPanels],
  );

  const toggleAdvanced = useCallback(() => {
    setIsAdvancedOpen((prev) => !prev);
  }, []);

  return {
    isPanelOpen,
    togglePanel,
    isAdvancedOpen,
    toggleAdvanced,
    statusBadgeLabel: getStatusLabel(status),
    topStatusText: getTopStatusText(status),
    intentLabel: getIntentLabel(intent),
    routeLabel: getRouteLabel(route),
  };
}
