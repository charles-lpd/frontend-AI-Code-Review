/** 消息发送方 */
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';
export type ChatMode = 'auto' | 'direct' | 'knowledge' | 'assistant';
export type KnowledgeFileStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type KnowledgeReadiness = 'empty' | 'indexing' | 'ready' | 'mixed' | 'failed';
export type ApiErrorCode =
  | 'INVALID_REQUEST' | 'SESSION_NOT_FOUND' | 'SESSION_ACCESS_DENIED'
  | 'PUBLIC_SESSION_NOT_FOUND' | 'KNOWLEDGE_NOT_READY' | 'KNOWLEDGE_INDEX_FAILED'
  | 'EMBEDDING_UNAVAILABLE' | 'EMBEDDING_DIMENSION_MISMATCH' | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT' | 'TOOL_FAILED' | 'RATE_LIMITED' | 'INTERNAL_ERROR'
  | 'CHAT_IN_PROGRESS' | 'IDEMPOTENCY_CONFLICT' | 'CHAT_RETRY_CONFLICT';

export interface Citation {
  citationId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  chunkStart: number;
  chunkEnd: number;
  score: number;
}

/** 消息状态 */
export type MessageStatus = 'pending' | 'sending' | 'error' | 'success'
  | 'generating' | 'completed' | 'failed' | 'aborted';

export interface SessionKnowledgeFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  indexStatus: KnowledgeFileStatus;
  errorMessage: string | null;
  /** @deprecated backend used this name in older responses */
  indexError?: string | null;
}

export interface SessionManageConfig {
  title?: string;
  isPublic: boolean;
  systemPrompt: string;
  chatMode: ChatMode;
  knowledgeReadiness: KnowledgeReadiness;
  knowledgeFiles: SessionKnowledgeFile[];
}

export interface PublicSessionInfo {
  id: string;
  title: string;
  isPublic: boolean;
  chatMode: ChatMode;
  createdAt: number;
  warning: string | null;
  manageConfig: SessionManageConfig;
  cachedAt?: number;
}

export interface PublicSessionHistoryItem {
  sessionId: string;
  title: string;
  lastActiveAt: number;
  sessionInfo?: PublicSessionInfo;
}

export interface PublicSessionCacheItem {
  sessionInfo?: PublicSessionInfo;
  messages: PublicChatMessage[];
  lastActiveAt: number;
}

export interface PublicChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
  status?: 'streaming' | 'done' | 'error';
  warning?: string;
  metadata?: ChatMessage['metadata'];
}

export type KnowledgeAgentStepStatus =
  | 'running'
  | 'completed'
  | 'failed';

export interface KnowledgeAgentStep {
  stepKey: string;
  stepLabel: string;
  stepStatus: KnowledgeAgentStepStatus;
  stepIndex: number;
  stepTotal: number;
  seq?: number;
  timestamp?: string;
  durationMs?: number;
  message?: string;
}

export interface KnowledgeAgentStreamState {
  answer: string;
  steps: Record<string, KnowledgeAgentStep>;
  status: 'idle' | 'connecting' | 'retrieving' | 'generating' | 'completed' | 'failed' | 'aborted';
  executionMode?: ChatMode;
  requestId?: string;
  citations: Citation[];
  errorCode?: ApiErrorCode;
  error?: string;
}

/** 工具调用定义 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ReviewDimensionSection {
  name: string;
  content: string;
  loading?: boolean;
  ok?: boolean;
  duration?: number;
}

export interface ReviewStreamMetadata {
  kind: 'code_review';
  statusText: string;
  dimensions: ReviewDimensionSection[];
  summaryText: string;
  finalText: string;
}

export interface ReviewStreamChunk {
  text: string;
  type:
    | 'status'
    | 'dimension_start'
    | 'dimension_header'
    | 'dimension_chunk'
    | 'dimension_done'
    | 'summary_header'
    | 'summary_chunk'
    | 'summary_done'
    | 'comment_status'
    | 'final';
  phase: 'fetch' | 'review' | 'summary' | 'comment' | 'final';
  dimension?: string;
  duration?: number;
  ok?: boolean;
}

export interface StreamingAssistantState {
  content: string;
  metadata?: ChatMessage['metadata'];
}

/** 单条聊天记录 */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** 状态标识，用于 UI 显示等待、错误等 */
  status?: MessageStatus;
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
  /** 工具调用（Assistant 发出） */
  tool_calls?: ToolCall[];
  /** 工具响应 ID（Tool 角色必须提供） */
  tool_call_id?: string;
  /** 扩展元数据，例如知识库引用、搜索结果等 */
  metadata?: {
    citations?: Citation[];
    thought?: string; // 思维链
    reviewStream?: ReviewStreamMetadata;
    knowledgeAgent?: KnowledgeAgentStreamState;
    [key: string]: any;
  };
  createdAt?: number;
}

/** 单个聊天会话 */
export interface ChatSession {
  id: string;
  title: string;
  chatMode?: ChatMode;
  userId?: string;
  isPublic?: boolean;
  systemPrompt?: string | null;
  createdAt?: string | number;
  messages: ChatMessage[];
  draft: string;
  updatedAt: number;
  /** 会话摘要，用于展示长对话背景 */
  summary?: string | null;
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
  manageConfig?: SessionManageConfig;
}
