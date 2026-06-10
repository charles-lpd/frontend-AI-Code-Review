/** 消息发送方 */
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

/** 消息状态 */
export type MessageStatus = 'pending' | 'sending' | 'error' | 'success';

/** 工具调用定义 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** 单条聊天记录 */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** 状态标识，用于 UI 显示等待、错误等 */
  status?: MessageStatus;
  /** 工具调用（Assistant 发出） */
  tool_calls?: ToolCall[];
  /** 工具响应 ID（Tool 角色必须提供） */
  tool_call_id?: string;
  /** 扩展元数据，例如知识库引用、搜索结果等 */
  metadata?: {
    citations?: string[];
    thought?: string; // 思维链
    [key: string]: any;
  };
  createdAt?: number;
}

/** 单个聊天会话 */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  draft: string;
  updatedAt: number;
  /** 会话摘要，用于展示长对话背景 */
  summary?: string;
  /** 是否已加载详情（至少加载了第一页） */
  detailsLoaded?: boolean;
  /** 是否还有更多历史记录 */
  hasMore?: boolean;
  /** 用于分页的游标（最旧的一条消息 ID） */
  lastCursor?: string;
  /** 是否正在加载更多消息 */
  isLoadingMore?: boolean;
  /** 会话配置，如模型名称、温度等 */
  config?: {
    model?: string;
    temperature?: number;
    useKnowledgeBase?: boolean;
  };
}
