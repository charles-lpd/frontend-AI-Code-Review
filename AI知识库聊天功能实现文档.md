# AI 知识库聊天功能实现文档

## 一、整体架构

这个项目采用 **分层架构** 实现 AI 知识库聊天功能：

```
┌─────────────────────────────────────────────────────────┐
│  UI 层 (Pages/Components)                                │
│  - ChatDetail.tsx (聊天页面)                             │
│  - Home.tsx (会话列表)                                   │
│  - ChatPanel/MessageItem (聊天组件)                      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  状态管理层 (Zustand Store)                              │
│  - useChatStore.ts                                       │
│  - 会话管理、消息管理、知识库文件管理                      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  服务层 (Services)                                       │
│  - sendChatMessage.ts (消息发送)                         │
│  - knowledgeAgentStream.ts (流式解析)                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  API 层 (API)                                            │
│  - sessions.ts (会话 API)                                │
│  - index.ts (HTTP 请求封装)                              │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  后端 API                                                │
│  - PostgreSQL 数据库                                     │
│  - SSE 流式响应                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 二、核心功能实现

### 1. 多会话对话系统

#### 1.1 数据结构设计

**会话结构 (`ChatSession`)**
```typescript
interface ChatSession {
  id: string;                    // 会话唯一标识
  title: string;                 // 会话标题
  messages: ChatMessage[];       // 消息列表
  draft: string;                 // 输入框草稿
  updatedAt: number;             // 更新时间
  summary?: string;              // 会话摘要
  
  // 分页加载相关
  detailsLoaded?: boolean;       // 是否已加载详情
  hasMore?: boolean;             // 是否有更多历史消息
  lastCursor?: string;           // 分页游标（最旧消息ID）
  isLoadingMore?: boolean;       // 是否正在加载更多
  
  // 知识库配置
  manageConfig?: SessionManageConfig;
}
```

**消息结构 (`ChatMessage`)**
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  status?: 'pending' | 'sending' | 'error' | 'success';
  
  // 知识库 Agent 元数据
  metadata?: {
    citations?: string[];        // 知识库引用
    thought?: string;            // 思维链
    knowledgeAgent?: KnowledgeAgentStreamState;  // Agent 执行状态
  };
  
  createdAt?: number;
}
```

#### 1.2 状态管理 (Zustand)

**核心状态**
```typescript
interface ChatStore {
  sessions: ChatSession[];           // 所有会话
  activeSessionId: string | null;    // 当前激活的会话ID
  isLoading: boolean;
  error: string | null;
  
  // 公共会话缓存
  publicSessionHistory: PublicSessionHistoryItem[];
  publicSessionCache: Record<string, PublicSessionCacheItem>;
}
```

**关键方法**

1. **会话列表加载** (`fetchSessions`)
```typescript
// 首次加载：从后端获取会话列表
// 后续加载：后台同步，合并本地状态和远程数据
fetchSessions: async (force = false) => {
  if (!force && sessions.length > 0) {
    // 后台同步，不阻塞UI
    void (async () => {
      const rawSessions = await sessionApi.list();
      // 合并本地消息和远程配置
      mergedSessions = localSessions.map(local => {
        const remote = backendMap.get(local.id);
        return remote ? { ...remote, messages: local.messages } : local;
      });
    })();
    return;
  }
  // 强制刷新
  const sessions = await sessionApi.list();
  set({ sessions });
}
```

2. **会话详情加载** (`fetchSessionDetail`)
```typescript
// 支持懒加载和分页
fetchSessionDetail: async (id: string, limit = 10) => {
  // 如果已加载，则后台同步新消息
  if (session?.detailsLoaded) {
    void (async () => {
      const detail = await sessionApi.get(id, limit);
      // 合并新消息，去重
      mergedMessages = [...existingMessages, ...newMessages]
        .filter(uniqueById)
        .sort(byCreatedAt);
    })();
    return;
  }
  
  // 首次加载
  const detail = await sessionApi.get(id, limit);
  set({
    sessions: sessions.map(s => 
      s.id === id 
        ? { ...s, ...detail, detailsLoaded: true, hasMore: messages.length >= limit }
        : s
    )
  });
}
```

3. **历史消息加载** (`fetchMoreMessages`)
```typescript
// 向上滚动加载更多历史消息
fetchMoreMessages: async (id: string, limit = 10) => {
  const session = get().sessions.find(s => s.id === id);
  if (!session?.hasMore || !session.lastCursor) return;
  
  const detail = await sessionApi.get(id, limit, session.lastCursor);
  const newMessages = detail.messages || [];
  
  set({
    sessions: sessions.map(s => 
      s.id === id
        ? {
            ...s,
            messages: [...newMessages, ...s.messages],  // 前置插入
            hasMore: newMessages.length >= limit,
            lastCursor: newMessages[0]?.id
          }
        : s
    )
  });
}
```

4. **本地持久化**
```typescript
persist(
  (set, get) => ({ /* store logic */ }),
  {
    name: 'everpay-chat-storage',
    storage: createJSONStorage(() => localStorage),
    // 只持久化必要字段
    partialize: (state) => ({
      sessions: state.sessions.map(s => ({
        id: s.id,
        title: s.title,
        messages: s.messages,
        draft: s.draft,
        detailsLoaded: s.detailsLoaded,
        hasMore: s.hasMore,
        lastCursor: s.lastCursor,
        manageConfig: s.manageConfig
      })),
      activeSessionId: state.activeSessionId,
      publicSessionCache: state.publicSessionCache
    })
  }
)
```

---

### 2. 文件上传与索引管理

#### 2.1 知识库文件结构

```typescript
interface SessionKnowledgeFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  indexStatus?: 'pending' | 'ready' | 'failed';  // 索引状态
  indexError?: string | null;
}

interface SessionManageConfig {
  title?: string;
  isPublic?: boolean;
  systemPrompt?: string;
  knowledgeFiles?: SessionKnowledgeFile[];
}
```

#### 2.2 文件上传流程

```typescript
// 1. 上传文件到后端
addSessionKnowledgeFiles: async (sessionId, files) => {
  const knowledgeFiles = await sessionApi.uploadKnowledge(sessionId, files);
  
  // 2. 更新本地状态
  set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            manageConfig: {
              ...s.manageConfig,
              knowledgeFiles  // 后端返回的文件列表（包含 indexStatus）
            }
          }
        : s
    )
  }));
}
```

#### 2.3 索引状态轮询

关键点：**上传成功 ≠ 索引完成**

```typescript
// 在 ChatDetail 页面中定时刷新知识库文件状态
useEffect(() => {
  const interval = setInterval(async () => {
    const files = await sessionApi.listKnowledgeFiles(sessionId);
    
    // 同步最新的索引状态
    chatStore.syncSessionKnowledgeFiles(sessionId, files);
    
    // 如果所有文件都索引完成，停止轮询
    const allReady = files.every(f => f.indexStatus === 'ready');
    if (allReady) {
      clearInterval(interval);
    }
  }, 3000);  // 每 3 秒刷新一次
  
  return () => clearInterval(interval);
}, [sessionId]);
```

#### 2.4 知识库管理 API

```typescript
export const sessionApi = {
  // 上传知识库文件
  async uploadKnowledge(id: string, files: File[]): Promise<SessionKnowledgeFile[]> {
    const result = await uploadSessionKnowledge(id, files);
    return result.knowledgeFiles ?? [];
  },
  
  // 列出知识库文件
  async listKnowledgeFiles(id: string): Promise<SessionKnowledgeFile[]> {
    const result = await listSessionKnowledge(id);
    return result.map(normalizeKnowledgeFile);
  },
  
  // 删除知识库文件
  async deleteKnowledge(id: string, fileId: string): Promise<{ success: boolean }> {
    return deleteSessionKnowledge(id, fileId);
  },
  
  // 重建索引
  async rebuildKnowledge(id: string): Promise<{ success: boolean }> {
    return rebuildSessionKnowledge(id);
  },
  
  // 一致性检查
  async checkKnowledgeConsistency(id: string): Promise<{ ok: boolean; issues?: string[] }> {
    return checkSessionKnowledgeConsistency(id);
  },
  
  // 获取文件内容预览
  async getKnowledgeContent(id: string, fileId: string) {
    return getKnowledgeContent(id, fileId);
  }
}
```

---

### 3. 知识库检索（流式对话）

#### 3.1 消息发送流程

```typescript
export async function sendChatMessage(
  sessionId: string,
  content: string,
  onStreaming: (state: StreamingAssistantState | null) => void,
  signal?: AbortSignal
): Promise<void> {
  // 1. 创建用户消息
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    status: 'success',
    createdAt: Date.now()
  };
  chatActions.addMessage(sessionId, userMessage);
  
  // 2. 发送流式请求
  const response = await sendChatStream(sessionId, [userMessage], signal);
  
  // 3. 消费 SSE 流
  const finalState = await consumeKnowledgeChatStream(response, {
    signal,
    onState: (state) => {
      // 实时更新 UI（流式输出）
      onStreaming({
        content: state.answer,
        metadata: { knowledgeAgent: state }
      });
    }
  });
  
  // 4. 保存完整的 Assistant 消息
  chatActions.addMessage(sessionId, {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: finalState.answer,
    metadata: { knowledgeAgent: finalState },
    status: 'success',
    createdAt: Date.now()
  });
}
```

#### 3.2 Knowledge Agent 状态结构

```typescript
interface KnowledgeAgentStreamState {
  answer: string;                    // 当前累积的回答内容
  steps: Record<string, KnowledgeAgentStep>;  // Agent 执行步骤
  status: 'idle' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface KnowledgeAgentStep {
  stepKey: string;                   // 步骤唯一标识
  stepLabel: string;                 // 步骤显示名称
  stepStatus: 'running' | 'completed' | 'failed';
  stepIndex: number;                 // 当前步骤索引
  stepTotal: number;                 // 总步骤数
  seq: number;                       // 序列号
  timestamp: string;
  durationMs?: number;               // 执行耗时
  message?: string;
}
```

#### 3.3 SSE 流式解析

```typescript
export async function consumeKnowledgeChatStream(
  response: Response,
  options: StreamKnowledgeChatOptions
): Promise<KnowledgeAgentStreamState> {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let state = createKnowledgeAgentState();
  
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    
    // 按 \n\n 分割 SSE 帧
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      
      // 处理 SSE 事件
      const lines = frame.split('\n').filter(line => line.startsWith('data:'));
      const raw = lines.map(line => line.slice('data:'.length).trim()).join('\n');
      
      if (raw === '[DONE]') {
        state = { ...state, status: 'completed' };
        return state;
      }
      
      const event = JSON.parse(raw);
      
      // 处理不同类型的事件
      if (event.type === 'agent_status') {
        // 更新 Agent 步骤状态
        state = reduceStatusEvent(state, event);
      } else if (event.type === 'text') {
        // 累积文本内容
        state = { ...state, answer: state.answer + event.text };
      }
      
      // 实时回调
      options.onState(state);
      
      boundary = buffer.indexOf('\n\n');
    }
    
    if (done) break;
  }
  
  return state;
}
```

#### 3.4 后端 SSE 事件格式

```typescript
// 文本流事件
{
  type: 'text',
  text: '这是生成的内容片段'
}

// Agent 状态事件
{
  type: 'agent_status',
  event: 'tool_started' | 'tool_finished' | 'model_started' | 'model_finished',
  stepKey: 'retrieve_knowledge',
  stepLabel: '检索知识库',
  stepStatus: 'running' | 'completed' | 'failed',
  stepIndex: 1,
  stepTotal: 3,
  seq: 1,
  timestamp: '2024-01-01T00:00:00Z',
  durationMs: 150,
  message: '正在检索相关文档...'
}

// 错误事件
{
  error: { message: '知识库检索失败' }
}

// 结束标记
data: [DONE]
```

---

## 三、关键技术细节

### 1. 懒加载与分页策略

**设计思路**：
- 会话列表只加载基本信息（id, title, updatedAt）
- 进入会话详情页才加载消息（首次加载 10 条）
- 向上滚动触发加载更多历史消息

**实现要点**：
```typescript
// 标记位控制
detailsLoaded: false  // 未加载过详情
hasMore: true         // 还有更多历史消息
lastCursor: 'msg-123' // 最旧消息的 ID
isLoadingMore: false  // 正在加载中

// UI 层滚动监听
const handleScroll = (e) => {
  if (e.target.scrollTop < 100 && session.hasMore && !session.isLoadingMore) {
    chatStore.fetchMoreMessages(sessionId);
  }
}
```

### 2. 乐观更新 + 后台同步

**场景**：用户发送消息后立即显示，不等后端响应

```typescript
// 1. 立即添加到本地
chatActions.addMessage(sessionId, userMessage);

// 2. 异步发送到后端
try {
  await sendChatStream(sessionId, [userMessage]);
} catch (err) {
  // 失败后标记错误状态
  chatActions.updateMessage(sessionId, userMessage.id, { status: 'error' });
}
```

### 3. 流式输出的中断处理

```typescript
try {
  const finalState = await consumeKnowledgeChatStream(response, { signal });
} catch (err) {
  if (err instanceof Error && err.name === 'AbortError') {
    // 用户主动停止生成
    const latestState = latestStateRef.current;
    chatActions.addMessage(sessionId, {
      role: 'assistant',
      content: latestState.answer + ' [已停止生成]',
      metadata: { knowledgeAgent: latestState }
    });
    return;
  }
  throw err;  // 其他错误继续抛出
}
```

### 4. 公共会话缓存机制

**目标**：公开会话可以被匿名用户访问，需要本地缓存

```typescript
interface PublicSessionCacheItem {
  sessionInfo?: PublicSessionInfo;
  messages: PublicChatMessage[];
  lastActiveAt: number;
}

// 访问公共会话时
const cachedSession = chatStore.publicSessionCache[sessionId];
if (cachedSession && Date.now() - cachedSession.lastActiveAt < 5 * 60 * 1000) {
  // 5 分钟内的缓存直接使用
  return cachedSession;
}

// 超时或不存在则重新获取
const freshSession = await sessionApi.getPublicDetail(sessionId);
chatStore.setPublicSessionCache(sessionId, {
  sessionInfo: freshSession,
  messages: freshSession.messages,
  lastActiveAt: Date.now()
});
```

---

## 四、API 接口约定

### 后端接口清单

| 接口 | 方法 | 说明 |
|------|------|------|
| `/sessions` | GET | 获取会话列表 |
| `/sessions` | POST | 创建新会话 |
| `/sessions/:id` | GET | 获取会话详情（支持分页：limit, cursor） |
| `/sessions/:id` | DELETE | 删除会话 |
| `/sessions/:id/messages` | DELETE | 清空会话消息 |
| `/sessions/:id/manage` | PUT | 更新会话配置（标题、公开性、系统提示词） |
| `/sessions/:id/knowledge` | POST | 上传知识库文件 |
| `/sessions/:id/knowledge` | GET | 列出知识库文件 |
| `/sessions/:id/knowledge/:fileId` | DELETE | 删除知识库文件 |
| `/sessions/:id/knowledge/:fileId/content` | GET | 获取文件内容预览 |
| `/sessions/:id/knowledge/rebuild` | POST | 重建索引 |
| `/sessions/:id/knowledge/check` | GET | 一致性检查 |
| `/chat/:sessionId` | POST | 发送聊天消息（SSE 流式响应） |
| `/public/sessions/:id` | GET | 获取公共会话详情 |

### SSE 响应格式

```
data: {"type":"agent_status","event":"agent_started","stepKey":"init","stepLabel":"初始化","stepStatus":"running","stepIndex":0,"stepTotal":3,"seq":0,"timestamp":"2024-01-01T00:00:00Z"}

data: {"type":"text","text":"根据"}

data: {"type":"text","text":"知识库"}

data: {"type":"agent_status","event":"tool_started","stepKey":"retrieve","stepLabel":"检索知识库","stepStatus":"running","stepIndex":1,"stepTotal":3,"seq":1,"timestamp":"2024-01-01T00:00:01Z"}

data: {"type":"agent_status","event":"tool_finished","stepKey":"retrieve","stepLabel":"检索知识库","stepStatus":"completed","stepIndex":1,"stepTotal":3,"seq":2,"timestamp":"2024-01-01T00:00:02Z","durationMs":1000}

data: {"type":"text","text":"检索结果"}

data: [DONE]
```

---

## 五、UI 组件关系

```
Home.tsx (会话列表页)
  └── ChatSessionNav (侧边栏导航)
       └── 会话列表项

ChatDetail.tsx (聊天详情页)
  ├── Header (标题栏)
  ├── KnowledgePanel (知识库管理面板)
  │    ├── 文件上传
  │    ├── 文件列表（显示 indexStatus）
  │    └── 索引管理按钮（重建、一致性检查）
  ├── ChatPanel (聊天面板)
  │    └── MessageItem (消息项)
  │         ├── 用户消息
  │         ├── Agent 步骤展示
  │         └── Assistant 回复（支持 Markdown）
  └── InputBar (输入框)
       ├── 草稿自动保存
       └── 发送按钮（支持中断）
```

---

## 六、性能优化要点

### 1. 虚拟滚动（可选）
当消息数量超过 1000 条时，可以引入 `react-window` 进行虚拟化渲染。

### 2. 防抖与节流
- 草稿保存：300ms 防抖
- 滚动加载：500ms 节流
- 索引状态轮询：3s 间隔

### 3. 消息去重
```typescript
const uniqueMessages = messages.filter((msg, index, self) => 
  index === self.findIndex(m => m.id === msg.id)
);
```

### 4. 懒加载图片
```tsx
<img src={url} loading="lazy" />
```

---

## 七、总结

这个 AI 知识库聊天系统的核心特点：

✅ **多会话管理** - Zustand + localStorage 持久化  
✅ **懒加载分页** - 优化首屏加载性能  
✅ **文件上传与索引** - 异步索引 + 状态轮询  
✅ **SSE 流式输出** - 实时展示 Agent 执行过程  
✅ **乐观更新** - 立即响应用户操作  
✅ **公共会话缓存** - 支持匿名访问  
✅ **中断控制** - AbortController 优雅停止生成  

技术栈：**React 19 + TypeScript + Zustand + SSE + PostgreSQL**
