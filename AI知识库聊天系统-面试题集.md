# AI 知识库聊天系统 - 面试题集

> 基于 React 19 + TypeScript + Zustand + SSE 的 AI 知识库聊天系统

---

## 一、架构设计类

### Q1: 请介绍一下这个 AI 知识库聊天系统的整体架构设计？

**答案：**

我们的系统采用经典的**分层架构**，从上到下分为五层：

**1. UI 层（Presentation Layer）**
- 使用 React 19 + TypeScript 构建
- 主要页面包括会话列表页（Home.tsx）、聊天详情页（ChatDetail.tsx）、公共会话页
- 组件化设计，可复用的聊天组件如 ChatPanel、MessageItem、InputBar

**2. 状态管理层（State Management Layer）**
- 使用 Zustand 进行全局状态管理
- 核心 Store 是 useChatStore，管理所有会话、消息、知识库文件状态
- 配合 Zustand 的 persist 中间件实现 localStorage 持久化
- 支持乐观更新和后台同步策略

**3. 服务层（Service Layer）**
- sendChatMessage.ts：负责消息发送和流式响应处理
- knowledgeAgentStream.ts：负责 SSE 流的解析和 Agent 状态管理
- 处理业务逻辑，如流式输出、中断控制、错误处理

**4. API 层（API Layer）**
- sessions.ts：封装所有会话相关的 HTTP 请求
- index.ts：axios 封装，统一处理请求拦截、响应拦截、错误处理
- 数据规范化，将后端返回的数据转换为前端统一的数据结构

**5. 后端 API**
- RESTful API + SSE（Server-Sent Events）
- PostgreSQL 数据库存储会话和消息
- 向量数据库存储知识库索引（用于 RAG 检索）

**架构优势：**
- **分层清晰**：职责分离，易于维护和测试
- **状态集中**：Zustand 统一管理，避免 props drilling
- **流式体验**：SSE 实现实时响应，用户体验流畅
- **离线友好**：localStorage 持久化，刷新页面不丢失数据

---

### Q2: 为什么选择 Zustand 而不是 Redux 或 Context API？

**答案：**

选择 Zustand 的原因主要有以下几点：

**1. 简洁的 API 设计**
```typescript
// Zustand - 简单直观
const useChatStore = create((set) => ({
  sessions: [],
  addMessage: (sessionId, message) => 
    set((state) => ({
      sessions: state.sessions.map(s => 
        s.id === sessionId 
          ? { ...s, messages: [...s.messages, message] }
          : s
      )
    }))
}));

// Redux - 需要 actions、reducers、dispatch
// 代码量是 Zustand 的 3-4 倍
```

**2. 无需 Provider 包裹**
- Redux 和 Context 需要在根组件包裹 Provider
- Zustand 可以直接在任何组件中使用 `useChatStore()`
- 减少组件树的嵌套层级

**3. 性能优化**
```typescript
// 精确订阅，只在 sessions 变化时重渲染
const sessions = useChatStore((state) => state.sessions);

// 不会因为 isLoading 变化而重渲染
const isLoading = useChatStore((state) => state.isLoading);
```
- Zustand 基于 selector 的订阅机制，避免不必要的重渲染
- Context API 的问题：Provider 的 value 变化会导致所有消费者重渲染

**4. 内置持久化支持**
```typescript
persist(
  (set, get) => ({ /* store logic */ }),
  {
    name: 'everpay-chat-storage',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ sessions: state.sessions }) // 选择性持久化
  }
)
```
- Redux 需要额外引入 redux-persist
- Context API 需要手动实现

**5. TypeScript 支持友好**
- 类型推断自动化，不需要手动定义大量类型
- Redux Toolkit 虽然改进了 DX，但仍然比 Zustand 复杂

**6. 包体积小**
- Zustand：~1KB（gzipped）
- Redux Toolkit：~10KB（gzipped）
- 对于注重性能的应用非常重要

**什么时候用 Redux？**
- 团队已有 Redux 生态积累
- 需要强大的中间件生态（saga、thunk 等）
- 需要严格的 Flux 架构约束（大型团队协作）

---

### Q3: 如何设计聊天系统的数据结构，才能支持多会话、分页加载和知识库功能？

**答案：**

我们的数据结构设计遵循**可扩展、可分页、可缓存**的原则：

**1. 会话结构（ChatSession）**
```typescript
interface ChatSession {
  // 基础信息
  id: string;                    // 会话唯一标识（UUID）
  title: string;                 // 会话标题（可编辑）
  updatedAt: number;             // 最后更新时间（用于排序）
  summary?: string;              // 会话摘要（长对话用）
  
  // 消息相关
  messages: ChatMessage[];       // 消息列表
  draft: string;                 // 输入框草稿（持久化）
  
  // 分页加载状态
  detailsLoaded?: boolean;       // 是否已加载过详情（首屏优化）
  hasMore?: boolean;             // 是否还有更多历史消息
  lastCursor?: string;           // 分页游标（最旧消息的 ID）
  isLoadingMore?: boolean;       // 是否正在加载更多
  
  // 知识库配置
  manageConfig?: {
    isPublic?: boolean;          // 是否公开会话
    systemPrompt?: string;       // 系统提示词
    knowledgeFiles?: SessionKnowledgeFile[];  // 知识库文件列表
  };
}
```

**设计要点：**
- `detailsLoaded` 标记位：避免重复加载详情
- `hasMore` + `lastCursor`：实现基于游标的分页
- `draft` 持久化：用户刷新页面不丢失输入内容
- `manageConfig` 嵌套：便于扩展会话配置项

**2. 消息结构（ChatMessage）**
```typescript
interface ChatMessage {
  id: string;                    // 消息唯一标识
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;               // 消息内容
  status?: 'pending' | 'sending' | 'error' | 'success';
  createdAt?: number;            // 创建时间（用于排序）
  
  // 扩展元数据
  metadata?: {
    citations?: string[];        // 知识库引用来源
    thought?: string;            // 思维链
    knowledgeAgent?: {           // Agent 执行状态
      answer: string;
      steps: Record<string, KnowledgeAgentStep>;
      status: 'idle' | 'running' | 'completed' | 'failed';
    };
  };
}
```

**设计要点：**
- `metadata` 扩展字段：支持未来新增功能（如联网搜索、代码执行）
- `knowledgeAgent`：记录 RAG 检索过程，便于调试和展示
- `status` 字段：支持乐观更新和错误处理

**3. 知识库文件结构**
```typescript
interface SessionKnowledgeFile {
  id: string;
  name: string;
  size: number;
  type: string;                  // MIME type
  uploadedAt: number;
  indexStatus?: 'pending' | 'ready' | 'failed';  // 索引状态
  indexError?: string | null;    // 索引错误信息
}
```

**设计要点：**
- `indexStatus`：区分"上传成功"和"索引完成"
- `indexError`：记录失败原因，便于排查问题

**4. 全局状态结构（ChatStore）**
```typescript
interface ChatStore {
  sessions: ChatSession[];           // 所有会话
  activeSessionId: string | null;    // 当前激活的会话 ID
  isLoading: boolean;
  error: string | null;
  
  // 公共会话缓存（支持匿名访问）
  publicSessionHistory: PublicSessionHistoryItem[];
  publicSessionCache: Record<string, PublicSessionCacheItem>;
}
```

**为什么这样设计？**
- **扁平化存储**：所有会话存储在 `sessions` 数组，通过 `activeSessionId` 关联
- **游标分页**：避免传统的 page/pageSize 方式在插入新消息时的页码错乱问题
- **状态标记**：通过 `detailsLoaded`、`hasMore` 等标记位控制加载逻辑
- **元数据扩展**：`metadata` 字段为未来功能预留空间

---

## 二、功能实现类

### Q4: 如何实现多会话的懒加载和分页？请详细说明实现思路。

**答案：**

我们的懒加载策略是**三级加载**：会话列表 → 会话详情 → 历史消息。

**第一级：会话列表加载**

```typescript
// 首次进入应用
fetchSessions: async (force = false) => {
  // 如果本地已有数据，不阻塞 UI，后台同步
  if (!force && sessions.length > 0) {
    void (async () => {
      const rawSessions = await sessionApi.list();
      // 合并远程和本地数据
      const mergedSessions = localSessions.map(local => {
        const remote = remoteMap.get(local.id);
        return remote 
          ? { ...remote, messages: local.messages, draft: local.draft }
          : local;
      });
      set({ sessions: mergedSessions });
    })();
    return;  // 立即返回，不阻塞 UI
  }
  
  // 强制刷新或首次加载
  const sessions = await sessionApi.list();
  set({ sessions: sessions.map(s => ({ ...s, detailsLoaded: false })) });
}
```

**优化点：**
- 本地有数据时，立即渲染，后台同步
- 合并策略：保留本地的 `messages` 和 `draft`，更新远程的配置
- 标记 `detailsLoaded: false`，延迟加载消息

**第二级：会话详情加载**

```typescript
fetchSessionDetail: async (id: string, limit = 10) => {
  const session = sessions.find(s => s.id === id);
  
  // 如果已经加载过，后台同步新消息
  if (session?.detailsLoaded) {
    void (async () => {
      const detail = await sessionApi.get(id, limit);
      const newMessages = detail.messages || [];
      
      // 去重合并（后端可能有新消息）
      const existingIds = new Set(session.messages.map(m => m.id));
      const mergedMessages = [
        ...session.messages,
        ...newMessages.filter(m => !existingIds.has(m.id))
      ].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      
      set({
        sessions: sessions.map(s => 
          s.id === id ? { ...s, messages: mergedMessages } : s
        )
      });
    })();
    return;
  }
  
  // 首次加载详情
  const detail = await sessionApi.get(id, limit);
  const messages = detail.messages || [];
  
  set({
    sessions: sessions.map(s => 
      s.id === id 
        ? { 
            ...s, 
            ...detail, 
            messages,
            detailsLoaded: true,
            hasMore: messages.length >= limit,  // 如果返回满 10 条，可能还有更多
            lastCursor: messages[0]?.id         // 记录最旧消息 ID
          }
        : s
    )
  });
}
```

**优化点：**
- 首次进入会话页才加载消息，避免首屏加载所有会话的消息
- 已加载过的会话，后台同步新消息（其他设备发送的消息）
- 使用 `lastCursor`（最旧消息 ID）作为分页游标

**第三级：历史消息加载**

```typescript
fetchMoreMessages: async (id: string, limit = 10) => {
  const session = sessions.find(s => s.id === id);
  
  // 防止重复加载
  if (!session?.hasMore || session.isLoadingMore || !session.lastCursor) {
    return;
  }
  
  // 设置加载中状态
  set({
    sessions: sessions.map(s => 
      s.id === id ? { ...s, isLoadingMore: true } : s
    )
  });
  
  try {
    // 基于游标获取更早的消息
    const detail = await sessionApi.get(id, limit, session.lastCursor);
    const newMessages = detail.messages || [];
    
    set({
      sessions: sessions.map(s => 
        s.id === id 
          ? {
              ...s,
              messages: [...newMessages, ...s.messages],  // 前置插入
              hasMore: newMessages.length >= limit,
              lastCursor: newMessages[0]?.id || s.lastCursor,
              isLoadingMore: false
            }
          : s
      )
    });
  } catch (err) {
    set({
      sessions: sessions.map(s => 
        s.id === id ? { ...s, isLoadingMore: false } : s
      ),
      error: '加载历史消息失败'
    });
  }
}
```

**触发时机：**
```typescript
// 在 ChatDetail 组件中监听滚动
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop } = e.currentTarget;
  
  // 滚动到顶部附近，且还有更多消息
  if (scrollTop < 100 && session.hasMore && !session.isLoadingMore) {
    chatStore.fetchMoreMessages(sessionId);
  }
};

<div className="messages-container" onScroll={handleScroll}>
  {session.isLoadingMore && <Spin />}
  {messages.map(msg => <MessageItem key={msg.id} message={msg} />)}
</div>
```

**为什么用游标分页而不是 page/pageSize？**

传统分页的问题：
```
初始状态：page=1, pageSize=10
第 1 页：消息 1-10

用户发送新消息后，服务器插入消息 11
现在第 1 页变成：消息 2-11（错位了！）
```

游标分页的优势：
```
初始请求：limit=10, cursor=null
返回：消息 1-10，lastCursor=msg-1

加载更多：limit=10, cursor=msg-1
返回：消息 -9 到 0（不会因为新消息而错位）
```

**完整的加载流程：**
```
1. 用户打开应用
   → fetchSessions() 加载会话列表（只有 id, title, updatedAt）

2. 用户点击某个会话
   → switchSession(id) 切换激活会话
   → fetchSessionDetail(id, 10) 加载最近 10 条消息

3. 用户向上滚动
   → handleScroll 触发
   → fetchMoreMessages(id, 10) 加载更早的 10 条消息

4. 用户发送新消息
   → addMessage() 立即添加到本地（乐观更新）
   → sendChatMessage() 异步发送到后端
```

---

### Q5: 文件上传到知识库索引完成，整个流程是如何实现的？如何处理索引状态？

**答案：**

知识库文件的完整生命周期包括：**上传 → 存储 → 索引 → 可检索**。关键点在于**上传成功 ≠ 索引完成**。

**完整流程图：**
```
用户选择文件
    ↓
前端上传到后端
    ↓
后端保存文件到 S3/本地
    ↓
后端返回文件信息 { id, name, indexStatus: 'pending' }
    ↓
前端更新 UI（显示"索引中"）
    ↓
后台异步处理：解析文档 → 分块 → 向量化 → 存储到向量数据库
    ↓
前端定时轮询文件状态
    ↓
indexStatus 变为 'ready' 后停止轮询
    ↓
用户可以在聊天中检索该文件
```

**前端实现：**

**1. 文件上传**
```typescript
// Store 中的方法
addSessionKnowledgeFiles: async (sessionId, files) => {
  try {
    // 调用上传 API
    const knowledgeFiles = await sessionApi.uploadKnowledge(sessionId, files);
    
    // 更新本地状态（此时 indexStatus 通常是 'pending'）
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              manageConfig: {
                ...s.manageConfig,
                knowledgeFiles  // 包含 indexStatus: 'pending'
              }
            }
          : s
      )
    }));
  } catch (err) {
    message.error('上传失败：' + err.message);
  }
}

// UI 组件
const handleUpload = async (fileList: File[]) => {
  setUploading(true);
  try {
    await chatStore.addSessionKnowledgeFiles(sessionId, fileList);
    message.success('上传成功，正在索引...');
  } finally {
    setUploading(false);
  }
};
```

**2. 索引状态轮询**
```typescript
// 在 ChatDetail 组件中
useEffect(() => {
  const session = chatStore.sessions.find(s => s.id === sessionId);
  const files = session?.manageConfig?.knowledgeFiles || [];
  
  // 检查是否有文件正在索引
  const hasPending = files.some(f => f.indexStatus === 'pending');
  
  if (!hasPending) {
    return;  // 所有文件都已完成，不需要轮询
  }
  
  // 启动轮询
  const interval = setInterval(async () => {
    try {
      // 获取最新的文件状态
      const latestFiles = await sessionApi.listKnowledgeFiles(sessionId);
      
      // 同步到 Store
      chatStore.syncSessionKnowledgeFiles(sessionId, latestFiles);
      
      // 检查是否全部完成
      const allReady = latestFiles.every(f => 
        f.indexStatus === 'ready' || f.indexStatus === 'failed'
      );
      
      if (allReady) {
        clearInterval(interval);
        message.success('所有文件索引完成！');
      }
    } catch (err) {
      console.error('刷新文件状态失败:', err);
    }
  }, 3000);  // 每 3 秒轮询一次
  
  return () => clearInterval(interval);
}, [sessionId, chatStore.sessions]);
```

**3. UI 状态展示**
```tsx
const KnowledgeFileList: React.FC = ({ sessionId }) => {
  const session = useChatStore(s => s.sessions.find(s => s.id === sessionId));
  const files = session?.manageConfig?.knowledgeFiles || [];
  
  return (
    <div className="file-list">
      {files.map(file => (
        <div key={file.id} className="file-item">
          <FileIcon type={file.type} />
          <span>{file.name}</span>
          
          {/* 索引状态徽章 */}
          {file.indexStatus === 'pending' && (
            <Badge status="processing" text="索引中..." />
          )}
          {file.indexStatus === 'ready' && (
            <Badge status="success" text="就绪" />
          )}
          {file.indexStatus === 'failed' && (
            <Tooltip title={file.indexError}>
              <Badge status="error" text="失败" />
            </Tooltip>
          )}
          
          <Button 
            icon={<DeleteOutlined />} 
            onClick={() => handleDelete(file.id)}
            disabled={file.indexStatus === 'pending'}  // 索引中不允许删除
          />
        </div>
      ))}
    </div>
  );
};
```

**后端处理流程（概念）：**

```typescript
// POST /sessions/:id/knowledge
async uploadKnowledge(req, res) {
  const { sessionId } = req.params;
  const files = req.files;
  
  // 1. 保存文件到存储（S3 或本地）
  const savedFiles = await storage.saveFiles(files);
  
  // 2. 创建数据库记录
  const knowledgeFiles = await db.knowledgeFiles.createMany(
    savedFiles.map(file => ({
      sessionId,
      name: file.originalName,
      size: file.size,
      type: file.mimeType,
      storagePath: file.path,
      indexStatus: 'pending'  // 初始状态
    }))
  );
  
  // 3. 投递异步索引任务到队列
  for (const file of knowledgeFiles) {
    await queue.add('index-knowledge-file', {
      fileId: file.id,
      sessionId,
      storagePath: file.storagePath
    });
  }
  
  // 4. 立即返回（不等待索引完成）
  res.json({ knowledgeFiles });
}

// 后台 Worker 处理索引任务
async function indexKnowledgeFile(job) {
  const { fileId, storagePath } = job.data;
  
  try {
    // 1. 读取文件内容
    const content = await storage.readFile(storagePath);
    
    // 2. 解析文档（PDF、DOCX、TXT 等）
    const text = await parseDocument(content);
    
    // 3. 文本分块（Chunking）
    const chunks = splitTextIntoChunks(text, { maxTokens: 500, overlap: 50 });
    
    // 4. 向量化（Embedding）
    const embeddings = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks
    });
    
    // 5. 存储到向量数据库
    await vectorDB.insert({
      fileId,
      chunks,
      embeddings: embeddings.data.map(e => e.embedding)
    });
    
    // 6. 更新状态为 'ready'
    await db.knowledgeFiles.update({
      where: { id: fileId },
      data: { indexStatus: 'ready' }
    });
    
  } catch (err) {
    // 7. 失败时记录错误
    await db.knowledgeFiles.update({
      where: { id: fileId },
      data: { 
        indexStatus: 'failed',
        indexError: err.message 
      }
    });
  }
}
```

**关键设计点：**

1. **异步处理**
   - 上传接口立即返回，不阻塞用户
   - 后台 Worker 异步处理索引任务（可能耗时几秒到几分钟）

2. **状态轮询**
   - 前端每 3 秒轮询一次文件状态
   - 所有文件索引完成后停止轮询
   - 避免使用 WebSocket（减少服务器连接压力）

3. **错误处理**
   - 索引失败时记录 `indexError`，前端可以展示给用户
   - 允许用户删除失败的文件，重新上传

4. **用户体验**
   - 上传成功后立即显示文件列表（即使索引未完成）
   - 清晰的状态提示："索引中..."、"就绪"、"失败"
   - 索引中的文件不允许删除（避免后台任务出错）

**优化建议：**

1. **长轮询 → WebSocket**
   - 如果文件很大，索引时间超过 1 分钟，考虑用 WebSocket 推送状态
   
2. **批量上传优化**
   - 支持多文件并发上传
   - 显示上传进度条

3. **增量索引**
   - 文件内容更新时，只重新索引变化的部分

---

### Q6: SSE 流式输出是如何实现的？如何解析后端的 SSE 事件流？

**答案：**

SSE（Server-Sent Events）是一种基于 HTTP 的服务器推送技术，相比 WebSocket 更轻量，单向通信即可满足 AI 流式输出的需求。

**SSE vs WebSocket：**

| 特性 | SSE | WebSocket |
|------|-----|-----------|
| 通信方向 | 单向（服务器 → 客户端） | 双向 |
| 协议 | HTTP | WebSocket 协议 |
| 重连机制 | 浏览器自动重连 | 需手动实现 |
| 跨域支持 | CORS | 需特殊处理 |
| 适用场景 | 实时推送、AI 流式输出 | 聊天室、游戏 |

**后端 SSE 响应格式：**

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"text","text":"根据"}

data: {"type":"text","text":"你的"}

data: {"type":"text","text":"问题"}

data: {"type":"agent_status","event":"tool_started","stepKey":"retrieve","stepLabel":"检索知识库","stepStatus":"running"}

data: {"type":"text","text":"，我"}

data: {"type":"agent_status","event":"tool_finished","stepKey":"retrieve","stepLabel":"检索知识库","stepStatus":"completed","durationMs":1200}

data: {"type":"text","text":"找到了"}

data: [DONE]

```

**SSE 协议规范：**
- 每个事件以 `data:` 开头
- 事件之间用 `\n\n`（两个换行符）分隔
- `[DONE]` 表示流结束

**前端解析实现：**

```typescript
export async function consumeKnowledgeChatStream(
  response: Response,
  options: StreamKnowledgeChatOptions
): Promise<KnowledgeAgentStreamState> {
  if (!response.body) throw new Error('响应正文为空');
  
  // 1. 获取 ReadableStream 读取器
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  
  // 2. 初始化状态
  let buffer = '';  // 缓冲区，存储不完整的帧
  let state = {
    answer: '',
    steps: {},
    status: 'idle'
  };
  
  // 3. 持续读取流
  while (true) {
    // 检查是否被中断
    if (options.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    
    // 读取数据块
    const { value, done } = await reader.read();
    
    // 解码字节流为字符串
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    
    // 4. 按 \n\n 分割帧
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);  // 提取一帧
      buffer = buffer.slice(boundary + 2);      // 移除已处理的帧
      
      // 5. 处理单个 SSE 帧
      const result = processFrame(frame, state, options);
      if (result.done) {
        return result.state;  // 遇到 [DONE]，结束流
      }
      state = result.state;
      
      boundary = buffer.indexOf('\n\n');
    }
    
    // 6. 流结束
    if (done) {
      if (buffer.trim()) {
        processFrame(buffer, state, options);  // 处理剩余数据
      }
      break;
    }
  }
  
  // 7. 标记为完成
  if (state.status !== 'failed') {
    state = { ...state, status: 'completed' };
    options.onState(state);
  }
  
  return state;
}

// 处理单个 SSE 帧
function processFrame(
  frame: string, 
  state: KnowledgeAgentStreamState,
  options: StreamKnowledgeChatOptions
): { done: boolean; state: KnowledgeAgentStreamState } {
  const trimmed = frame.trim();
  
  // 跳过空行和注释
  if (!trimmed || trimmed.startsWith(':')) {
    return { done: false, state };
  }
  
  // 提取 data: 后面的内容
  const lines = trimmed.split('\n').filter(line => line.startsWith('data:'));
  const raw = lines.map(line => line.slice('data:'.length).trim()).join('\n');
  
  if (!raw) {
    return { done: false, state };
  }
  
  // 检查是否是结束标记
  if (raw === '[DONE]') {
    state = { ...state, status: 'completed' };
    options.onState(state);
    return { done: true, state };
  }
  
  // 解析 JSON 事件
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    console.error('解析 SSE 数据失败:', raw);
    return { done: false, state };
  }
  
  // 根据事件类型更新状态
  if (event.type === 'text') {
    // 文本增量
    state = { ...state, answer: state.answer + event.text };
    options.onState(state);
  } else if (event.type === 'agent_status') {
    // Agent 步骤状态
    state = reduceStatusEvent(state, event);
    options.onState(state);
  } else if (event.error) {
    // 错误事件
    state = { ...state, status: 'failed', error: event.error.message };
    options.onState(state);
    throw new Error(event.error.message);
  }
  
  return { done: false, state };
}
```

**Agent 状态事件处理：**

```typescript
function reduceStatusEvent(
  state: KnowledgeAgentStreamState,
  event: KnowledgeAgentStatusEvent
): KnowledgeAgentStreamState {
  const { stepKey, stepLabel, stepStatus, stepIndex, stepTotal, durationMs } = event;
  
  // 更新步骤状态
  const step: KnowledgeAgentStep = {
    ...state.steps[stepKey],
    stepKey,
    stepLabel,
    stepStatus,
    stepIndex,
    stepTotal,
    durationMs
  };
  
  return {
    ...state,
    steps: {
      ...state.steps,
      [stepKey]: step  // 按 stepKey 索引，便于更新
    },
    status: 
      stepStatus === 'failed' ? 'failed' :
      event.event === 'agent_finished' ? 'completed' :
      'running'
  };
}
```

**UI 层使用：**

```typescript
const ChatDetail: React.FC = () => {
  const [streamingState, setStreamingState] = useState<StreamingAssistantState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const handleSend = async (content: string) => {
    // 创建中断控制器
    abortControllerRef.current = new AbortController();
    
    try {
      await sendChatMessage(
        sessionId,
        content,
        (state) => {
          // 实时更新 UI
          setStreamingState(state);
        },
        abortControllerRef.current.signal
      );
    } finally {
      setStreamingState(null);
    }
  };
  
  const handleStop = () => {
    // 用户点击停止按钮
    abortControllerRef.current?.abort();
  };
  
  return (
    <div>
      {/* 历史消息 */}
      {messages.map(msg => <MessageItem key={msg.id} message={msg} />)}
      
      {/* 流式输出中的消息 */}
      {streamingState && (
        <div className="streaming-message">
          <Avatar icon={<RobotOutlined />} />
          
          {/* Agent 步骤展示 */}
          {streamingState.metadata?.knowledgeAgent && (
            <AgentSteps steps={streamingState.metadata.knowledgeAgent.steps} />
          )}
          
          {/* 实时文本 */}
          <ReactMarkdown>{streamingState.content}</ReactMarkdown>
          
          {/* 停止按钮 */}
          <Button icon={<StopOutlined />} onClick={handleStop}>
            停止生成
          </Button>
        </div>
      )}
      
      <InputBar onSend={handleSend} />
    </div>
  );
};
```

**中断处理：**

```typescript
// 在 sendChatMessage 中
try {
  await consumeKnowledgeChatStream(response, { signal });
} catch (err) {
  if (err instanceof Error && err.name === 'AbortError') {
    // 用户主动停止
    const latestState = latestStateRef.current;
    if (latestState) {
      chatActions.addMessage(sessionId, {
        role: 'assistant',
        content: latestState.answer + ' [已停止生成]',
        metadata: { knowledgeAgent: latestState },
        status: 'success'
      });
    }
    return;  // 正常退出，不抛出错误
  }
  throw err;  // 其他错误继续抛出
}
```

**关键点总结：**

1. **流式解析**
   - 使用 `ReadableStream` API 读取响应体
   - 逐字节解码，按 `\n\n` 分割 SSE 帧
   - 缓冲区处理不完整的帧

2. **状态管理**
   - 维护一个累积的 `state` 对象
   - 每次收到事件后更新 `state` 并回调 UI

3. **中断控制**
   - 使用 `AbortController` 优雅停止流
   - 区分"用户中断"和"网络错误"

4. **错误处理**
   - 解析失败时不中断流，继续处理后续事件
   - 遇到 `error` 事件时抛出异常

---

### Q7: 如何实现聊天消息的乐观更新？网络失败如何回滚？

**答案：**

乐观更新（Optimistic Update）是指在**不等待服务器响应的情况下，立即更新 UI**，给用户即时反馈。如果请求失败，再进行回滚。

**为什么需要乐观更新？**

传统方式：
```
用户点击发送 → 等待后端响应（可能 1-2 秒） → 更新 UI
```
问题：用户需要等待，体验不佳

乐观更新：
```
用户点击发送 → 立即显示消息（乐观更新） → 后台发送请求 → 成功/失败时更新状态
```
优势：即时反馈，流畅体验

**实现方案：**

**1. 消息状态设计**
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'pending' | 'sending' | 'error' | 'success';  // 关键字段
  createdAt?: number;
}
```

状态流转：
```
pending  → 本地创建，未发送
sending  → 正在发送中
success  → 发送成功
error    → 发送失败
```

**2. 发送流程实现**
```typescript
export async function sendChatMessage(
  sessionId: string,
  content: string,
  onStreaming: (state: StreamingAssistantState | null) => void,
  signal?: AbortSignal
): Promise<void> {
  const text = content.trim();
  if (!text) return;
  
  // ========== 步骤 1：乐观更新 ==========
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    status: 'success',  // 直接标记为成功（乐观）
    createdAt: Date.now()
  };
  
  // 立即添加到本地 Store
  chatActions.addMessage(sessionId, userMessage);
  
  // 清空输入框
  chatActions.updateDraft(sessionId, '');
  
  // ========== 步骤 2：发送请求 ==========
  try {
    const response = await sendChatStream(sessionId, [userMessage], signal);
    if (!response.body) throw new Error('响应正文为空');
    
    // ========== 步骤 3：消费流式响应 ==========
    const finalState = await consumeKnowledgeChatStream(response, {
      signal,
      onState: (state) => {
        onStreaming({
          content: state.answer,
          metadata: { knowledgeAgent: state }
        });
      }
    });
    
    // ========== 步骤 4：添加 Assistant 消息 ==========
    const assistantMsgId = crypto.randomUUID();
    chatActions.addMessage(sessionId, {
      id: assistantMsgId,
      role: 'assistant',
      content: finalState.answer,
      metadata: { knowledgeAgent: finalState },
      status: 'success',
      createdAt: Date.now()
    });
    
    onStreaming(null);
    
  } catch (err) {
    // ========== 步骤 5：错误处理 ==========
    if (err instanceof Error && err.name === 'AbortError') {
      // 用户主动中断，不算错误
      // ... 处理中断逻辑
      return;
    }
    
    // ========== 步骤 6：回滚乐观更新 ==========
    chatActions.updateMessage(sessionId, userMessage.id, {
      status: 'error'  // 标记为失败
    });
    
    throw err;
  }
}
```

**3. UI 层状态展示**
```tsx
const MessageItem: React.FC<{ message: ChatMessage }> = ({ message }) => {
  return (
    <div className={`message message-${message.role}`}>
      <Avatar />
      
      <div className="message-content">
        <ReactMarkdown>{message.content}</ReactMarkdown>
        
        {/* 根据状态显示不同的图标 */}
        {message.status === 'sending' && (
          <LoadingOutlined className="status-icon" />
        )}
        {message.status === 'success' && (
          <CheckOutlined className="status-icon success" />
        )}
        {message.status === 'error' && (
          <Tooltip title="发送失败，点击重试">
            <ExclamationCircleOutlined 
              className="status-icon error" 
              onClick={() => handleRetry(message)}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};
```

**4. 重试机制**
```typescript
const handleRetry = async (failedMessage: ChatMessage) => {
  // 1. 移除失败的消息
  chatActions.removeMessage(sessionId, failedMessage.id);
  
  // 2. 重新发送（会走乐观更新流程）
  await sendChatMessage(
    sessionId,
    failedMessage.content,
    setStreamingState,
    abortControllerRef.current?.signal
  );
};
```

**5. 网络恢复后的同步**
```typescript
// 在 ChatDetail 组件挂载时
useEffect(() => {
  // 检查是否有失败的消息
  const failedMessages = session.messages.filter(m => m.status === 'error');
  
  if (failedMessages.length > 0) {
    Modal.confirm({
      title: '发现未发送成功的消息',
      content: `有 ${failedMessages.length} 条消息发送失败，是否重新发送？`,
      onOk: async () => {
        for (const msg of failedMessages) {
          await handleRetry(msg);
        }
      },
      onCancel: () => {
        // 用户选择不重试，清除失败状态
        failedMessages.forEach(msg => {
          chatActions.removeMessage(sessionId, msg.id);
        });
      }
    });
  }
}, []);
```

**高级优化：离线队列**

对于网络不稳定的场景，可以实现消息队列：

```typescript
interface MessageQueue {
  pending: ChatMessage[];  // 待发送队列
  sending: ChatMessage[];  // 发送中队列
  failed: ChatMessage[];   // 失败队列
}

const useMessageQueue = (sessionId: string) => {
  const [queue, setQueue] = useState<MessageQueue>({
    pending: [],
    sending: [],
    failed: []
  });
  
  // 添加到队列
  const enqueue = (message: ChatMessage) => {
    setQueue(q => ({ ...q, pending: [...q.pending, message] }));
    processQueue();
  };
  
  // 处理队列
  const processQueue = async () => {
    if (queue.pending.length === 0 || queue.sending.length > 0) {
      return;  // 队列为空或正在发送中
    }
    
    const message = queue.pending[0];
    
    // 移动到发送中队列
    setQueue(q => ({
      ...q,
      pending: q.pending.slice(1),
      sending: [message]
    }));
    
    try {
      await sendChatMessage(sessionId, message.content, ...);
      
      // 发送成功，移除
      setQueue(q => ({ ...q, sending: [] }));
      
      // 继续处理下一条
      processQueue();
      
    } catch (err) {
      // 发送失败，移动到失败队列
      setQueue(q => ({
        ...q,
        sending: [],
        failed: [...q.failed, message]
      }));
    }
  };
  
  return { enqueue, queue };
};
```

**乐观更新的适用场景：**

✅ **适合：**
- 用户发送消息
- 点赞/收藏
- 简单的状态切换

❌ **不适合：**
- 支付操作（需要等待确认）
- 删除重要数据（需要二次确认）
- 复杂的业务逻辑（回滚困难）

**关键点总结：**

1. **立即反馈**：用户操作后立即更新 UI
2. **状态标记**：使用 `status` 字段跟踪消息状态
3. **错误回滚**：请求失败时标记为 `error`，不删除消息
4. **重试机制**：允许用户手动重试失败的消息
5. **离线队列**：在网络不稳定时缓存消息，恢复后自动发送

---

## 三、性能优化类

### Q8: 如何优化聊天列表的渲染性能？当消息数量达到 10000+ 时如何处理？

**答案：**

聊天应用的性能瓶颈主要在**大量 DOM 节点渲染**和**频繁的状态更新**。针对 10000+ 消息的场景，需要多层优化。

**性能问题分析：**

```
假设每条消息渲染 50 个 DOM 节点
10000 条消息 = 500,000 个 DOM 节点
→ 浏览器渲染卡顿
→ 滚动性能差
→ 内存占用高
```

**优化方案：**

**1. 虚拟滚动（Virtual Scrolling）**

只渲染可视区域的消息，其他消息用空白占位。

```tsx
import { FixedSizeList } from 'react-window';

const ChatMessageList: React.FC = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList>(null);
  
  // 计算容器高度
  const [containerHeight, setContainerHeight] = useState(600);
  
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);
  
  // 渲染单条消息
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = messages[index];
    return (
      <div style={style}>
        <MessageItem message={message} />
      </div>
    );
  };
  
  return (
    <div ref={containerRef} className="message-list-container">
      <FixedSizeList
        ref={listRef}
        height={containerHeight}
        itemCount={messages.length}
        itemSize={120}  // 每条消息的高度（需要固定）
        width="100%"
      >
        {Row}
      </FixedSizeList>
    </div>
  );
};
```

**优点：**
- 只渲染可见的 10-20 条消息
- 滚动性能显著提升
- 内存占用大幅降低

**缺点：**
- 每条消息高度需要固定（或使用 `VariableSizeList` 动态计算）
- 需要处理滚动定位问题

**2. React.memo + useMemo 优化组件渲染**

```tsx
// 使用 React.memo 避免不必要的重渲染
const MessageItem = React.memo<{ message: ChatMessage }>(
  ({ message }) => {
    // 使用 useMemo 缓存复杂计算
    const formattedTime = useMemo(() => 
      new Date(message.createdAt || 0).toLocaleTimeString(),
      [message.createdAt]
    );
    
    return (
      <div className="message-item">
        <Avatar />
        <div className="message-content">
          <ReactMarkdown>{message.content}</ReactMarkdown>
          <span className="message-time">{formattedTime}</span>
        </div>
      </div>
    );
  },
  // 自定义比较函数
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.status === nextProps.message.status
    );
  }
);
```

**3. 分页加载（Pagination）**

不一次性加载所有消息，采用"向上滚动加载更多"的策略。

```typescript
// Store 中实现
fetchSessionDetail: async (id: string, limit = 50) => {
  const detail = await sessionApi.get(id, limit);  // 只加载最近 50 条
  const messages = detail.messages || [];
  
  set({
    sessions: sessions.map(s => 
      s.id === id 
        ? { 
            ...s, 
            messages,
            hasMore: messages.length >= limit,
            lastCursor: messages[0]?.id
          }
        : s
    )
  });
}

fetchMoreMessages: async (id: string, limit = 50) => {
  const session = sessions.find(s => s.id === id);
  if (!session?.hasMore) return;
  
  const detail = await sessionApi.get(id, limit, session.lastCursor);
  const newMessages = detail.messages || [];
  
  set({
    sessions: sessions.map(s => 
      s.id === id 
        ? {
            ...s,
            messages: [...newMessages, ...s.messages],  // 前置插入
            hasMore: newMessages.length >= limit
          }
        : s
    )
  });
}
```

**UI 层触发加载：**
```tsx
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop } = e.currentTarget;
  
  // 节流处理
  if (scrollTop < 100 && !isLoadingMore) {
    chatStore.fetchMoreMessages(sessionId);
  }
};
```

**4. Zustand 精确订阅**

避免整个组件在无关状态变化时重渲染。

```tsx
// ❌ 不好的做法：订阅整个 Store
const ChatDetail: React.FC = () => {
  const store = useChatStore();  // 任何状态变化都会重渲染
  // ...
}

// ✅ 好的做法：精确订阅
const ChatDetail: React.FC = () => {
  const session = useChatStore(s => 
    s.sessions.find(s => s.id === sessionId)
  );  // 只在当前会话变化时重渲染
  
  const isLoading = useChatStore(s => s.isLoading);  // 独立订阅
}
```

**5. 防抖与节流**

```typescript
import { debounce, throttle } from 'lodash';

// 输入框草稿保存 - 防抖
const handleInputChange = debounce((value: string) => {
  chatStore.updateDraft(sessionId, value);
}, 300);

// 滚动加载 - 节流
const handleScroll = throttle((e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop } = e.currentTarget;
  if (scrollTop < 100) {
    chatStore.fetchMoreMessages(sessionId);
  }
}, 500);
```

**6. 懒加载图片和附件**

```tsx
<img 
  src={imageUrl} 
  loading="lazy"  // 浏览器原生懒加载
  alt="attachment" 
/>

// 或使用 Intersection Observer
const LazyImage: React.FC<{ src: string }> = ({ src }) => {
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }  // 提前 100px 开始加载
    );
    
    if (imgRef.current) {
      observer.observe(imgRef.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <img 
      ref={imgRef}
      src={isVisible ? src : placeholder} 
      alt="attachment" 
    />
  );
};
```

**7. Web Worker 处理大数据**

对于复杂的数据处理（如搜索、过滤），使用 Web Worker 避免阻塞主线程。

```typescript
// worker.ts
self.onmessage = (e) => {
  const { messages, keyword } = e.data;
  
  // 在 Worker 中执行搜索
  const results = messages.filter(msg => 
    msg.content.toLowerCase().includes(keyword.toLowerCase())
  );
  
  self.postMessage(results);
};

// 主线程
const searchMessages = async (keyword: string) => {
  const worker = new Worker('worker.ts');
  
  return new Promise<ChatMessage[]>((resolve) => {
    worker.onmessage = (e) => {
      resolve(e.data);
      worker.terminate();
    };
    
    worker.postMessage({ messages, keyword });
  });
};
```

**8. 消息去重和合并**

```typescript
// 防止重复渲染相同消息
const uniqueMessages = useMemo(() => {
  const seen = new Set<string>();
  return messages.filter(msg => {
    if (seen.has(msg.id)) {
      return false;
    }
    seen.add(msg.id);
    return true;
  });
}, [messages]);
```

**9. Code Splitting**

```tsx
// 懒加载大型组件
const ReactMarkdown = lazy(() => import('react-markdown'));
const SyntaxHighlighter = lazy(() => import('react-syntax-highlighter'));

<Suspense fallback={<Spin />}>
  <ReactMarkdown>{content}</ReactMarkdown>
</Suspense>
```

**性能监控：**

```tsx
useEffect(() => {
  const start = performance.now();
  
  return () => {
    const duration = performance.now() - start;
    if (duration > 16) {  // 超过 60fps 阈值
      console.warn(`ChatDetail 渲染耗时: ${duration}ms`);
    }
  };
}, [messages]);
```

**综合方案：**

| 消息数量 | 优化策略 |
|---------|---------|
| < 100 | 无需优化 |
| 100-1000 | React.memo + useMemo |
| 1000-10000 | 分页加载 + 精确订阅 |
| > 10000 | 虚拟滚动 + 分页 + Web Worker |

**关键指标：**
- **首屏渲染时间** < 1s
- **滚动帧率** > 60fps
- **内存占用** < 100MB（10000 条消息）

---

### Q9: localStorage 持久化有哪些坑？如何优化存储策略？

**答案：**

localStorage 是常用的客户端存储方案，但在聊天应用中会遇到一些问题。

**常见问题：**

**1. 存储容量限制（5-10MB）**

```typescript
// 问题：存储大量消息时超出限制
interface ChatStore {
  sessions: ChatSession[];  // 可能有 100+ 个会话
  // 每个会话有 1000+ 条消息
  // 估算：100 会话 × 1000 消息 × 500 字节 ≈ 50MB
}

// 解决方案 1：只持久化必要字段
persist(
  (set, get) => ({ /* store logic */ }),
  {
    name: 'everpay-chat-storage',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      sessions: state.sessions.map(s => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        draft: s.draft,
        // 只保留最近 50 条消息
        messages: s.messages.slice(-50),
        manageConfig: s.manageConfig
      })),
      activeSessionId: state.activeSessionId
    })
  }
)

// 解决方案 2：使用 IndexedDB（无容量限制）
import { createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

const idbStorage = {
  getItem: async (name: string) => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string) => {
    await set(name, value);
  },
  removeItem: async (name: string) => {
    await del(name);
  }
};

persist(
  (set, get) => ({ /* store logic */ }),
  {
    name: 'everpay-chat-storage',
    storage: createJSONStorage(() => idbStorage)
  }
)
```

**2. JSON 序列化性能问题**

```typescript
// 问题：大对象序列化耗时长
const bigState = {
  sessions: [...1000个会话],
  messages: [...10000条消息]
};
localStorage.setItem('state', JSON.stringify(bigState));  // 可能耗时 100-500ms

// 解决方案 1：按会话分片存储
const saveSession = (session: ChatSession) => {
  localStorage.setItem(`session_${session.id}`, JSON.stringify(session));
};

const loadSession = (id: string): ChatSession | null => {
  const data = localStorage.getItem(`session_${id}`);
  return data ? JSON.parse(data) : null;
};

// 解决方案 2：使用 Web Worker 序列化
// worker.ts
self.onmessage = (e) => {
  const serialized = JSON.stringify(e.data);
  self.postMessage(serialized);
};

// 主线程
const saveToLocalStorage = async (key: string, data: any) => {
  const worker = new Worker('worker.ts');
  
  const serialized = await new Promise<string>((resolve) => {
    worker.onmessage = (e) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.postMessage(data);
  });
  
  localStorage.setItem(key, serialized);
};
```

**3. 跨标签页同步问题**

```typescript
// 问题：用户在多个标签页打开应用，数据不一致

// 解决方案：监听 storage 事件
useEffect(() => {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'everpay-chat-storage' && e.newValue) {
      const newState = JSON.parse(e.newValue);
      
      // 合并远程和本地状态
      set((state) => ({
        sessions: mergeStateSessions(state.sessions, newState.sessions)
      }));
    }
  };
  
  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);

// 合并策略：以时间戳较新的为准
function mergeStateSessions(
  local: ChatSession[], 
  remote: ChatSession[]
): ChatSession[] {
  const remoteMap = new Map(remote.map(s => [s.id, s]));
  
  return local.map(localSession => {
    const remoteSession = remoteMap.get(localSession.id);
    if (!remoteSession) return localSession;
    
    // 比较时间戳，取较新的
    return localSession.updatedAt > remoteSession.updatedAt
      ? localSession
      : remoteSession;
  });
}
```

**4. 敏感数据泄露**

```typescript
// 问题：localStorage 明文存储，容易被 XSS 攻击

// 解决方案 1：不存储敏感信息
partialize: (state) => ({
  sessions: state.sessions.map(s => ({
    ...s,
    messages: s.messages.map(m => ({
      ...m,
      // 移除敏感字段
      metadata: undefined
    }))
  }))
})

// 解决方案 2：加密存储
import CryptoJS from 'crypto-js';

const SECRET_KEY = 'your-secret-key';  // 应该从环境变量获取

const encryptedStorage = {
  getItem: (name: string) => {
    const encrypted = localStorage.getItem(name);
    if (!encrypted) return null;
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
    return decrypted.toString(CryptoJS.enc.Utf8);
  },
  setItem: (name: string, value: string) => {
    const encrypted = CryptoJS.AES.encrypt(value, SECRET_KEY).toString();
    localStorage.setItem(name, encrypted);
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  }
};

persist(
  (set, get) => ({ /* store logic */ }),
  {
    name: 'everpay-chat-storage',
    storage: createJSONStorage(() => encryptedStorage)
  }
)
```

**5. 数据版本兼容问题**

```typescript
// 问题：修改数据结构后，旧数据无法解析

// 解决方案：版本迁移
interface PersistedState {
  version: number;
  data: ChatStore;
}

const CURRENT_VERSION = 2;

const migrateState = (state: any): ChatStore => {
  const version = state.version || 1;
  
  if (version < 2) {
    // v1 → v2: 添加 manageConfig 字段
    state.data.sessions = state.data.sessions.map((s: any) => ({
      ...s,
      manageConfig: {
        isPublic: s.isPublic || false,
        systemPrompt: s.systemPrompt || '',
        knowledgeFiles: []
      }
    }));
  }
  
  return state.data;
};

persist(
  (set, get) => ({ /* store logic */ }),
  {
    name: 'everpay-chat-storage',
    storage: createJSONStorage(() => localStorage),
    version: CURRENT_VERSION,
    migrate: (persistedState: any, version: number) => {
      if (version < CURRENT_VERSION) {
        return migrateState(persistedState);
      }
      return persistedState;
    }
  }
)
```

**6. 频繁写入性能问题**

```typescript
// 问题：每次状态变化都写入 localStorage，影响性能

// 解决方案：防抖写入
import { debounce } from 'lodash';

const debouncedSetItem = debounce(
  (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  1000  // 1 秒内的多次变化合并为一次写入
);

const debouncedStorage = {
  getItem: (name: string) => localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    debouncedSetItem(name, value);
  },
  removeItem: (name: string) => localStorage.removeItem(name)
};

persist(
  (set, get) => ({ /* store logic */ }),
  {
    name: 'everpay-chat-storage',
    storage: createJSONStorage(() => debouncedStorage)
  }
)
```

**7. 存储满后的降级方案**

```typescript
const safeSaveToLocalStorage = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('localStorage 已满，清理旧数据...');
      
      // 策略 1：清理最旧的会话
      const sessions = value.sessions.sort(
        (a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt
      );
      const recentSessions = sessions.slice(0, 10);  // 只保留最近 10 个会话
      
      localStorage.setItem(key, JSON.stringify({
        ...value,
        sessions: recentSessions
      }));
      
      message.warning('存储空间不足，已自动清理旧会话');
    } else {
      throw err;
    }
  }
};
```

**最佳实践总结：**

| 场景 | 推荐方案 |
|------|---------|
| 少量数据（< 1MB） | localStorage |
| 大量数据（> 5MB） | IndexedDB |
| 敏感数据 | SessionStorage + 加密 |
| 需要跨域 | Cookie（4KB 限制） |
| 离线应用 | IndexedDB + Service Worker |

**优化 checklist：**
- ✅ 只持久化必要字段（`partialize`）
- ✅ 限制存储的消息数量（如最近 50 条）
- ✅ 防抖写入，避免频繁 I/O
- ✅ 版本迁移机制
- ✅ 跨标签页同步
- ✅ 存储满后的降级方案
- ✅ 不存储敏感信息或加密存储

---

## 五、流式通信与实时消息类

### Q11: 如何优雅地处理 WebSocket 连接的异常和重连？请详细说明网络波动、服务器宕机、长时间无消息等场景。

**答案：**

WebSocket 是双向通信的流式协议，相比 SSE 的优势在于可以实时接收服务器推送。但它的复杂性也在于连接管理、错误恢复和心跳检测。

**核心问题：**

1. **网络中断后如何快速感知？**
2. **重连时如何不丢失消息？**
3. **长连接如何保活？**
4. **如何区分正常断开和异常断开？**

**完整实现方案：**

**1. WebSocket 连接管理**

```typescript
interface WebSocketConfig {
  url: string;
  reconnect: boolean;
  reconnectInterval: number;  // 初始重连间隔
  maxReconnectAttempts: number;
  heartbeatInterval: number;  // 心跳间隔
  heartbeatTimeout: number;   // 心跳超时时间
}

class ManagedWebSocket {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  private messageQueue: Array<{ type: string; data: any }> = [];  // 离线消息队列
  private isIntentionallyClosed = false;  // 标记是否主动关闭
  
  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,  // 30 秒
      heartbeatTimeout: 5000,    // 5 秒内必须收到 pong
      ...config
    };
  }
  
  // 连接
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);
        
        this.ws.onopen = () => {
          console.log('[WebSocket] 连接已建立');
          this.reconnectAttempts = 0;  // 重置重连计数
          this.isIntentionallyClosed = false;
          
          // 连接成功后发送离线消息队列
          this.flushMessageQueue();
          
          // 启动心跳检测
          this.startHeartbeat();
          
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onerror = (event) => {
          console.error('[WebSocket] 连接错误:', event);
          reject(new Error('WebSocket 连接失败'));
        };
        
        this.ws.onclose = (event) => {
          console.log(`[WebSocket] 连接关闭 (code: ${event.code})`);
          
          this.stopHeartbeat();
          
          // 如果不是主动关闭，且配置了自动重连，则进行重连
          if (!this.isIntentionallyClosed && this.config.reconnect) {
            this.reconnect();
          }
        };
        
      } catch (err) {
        reject(err);
      }
    });
  }
  
  // 消息处理
  private handleMessage(rawData: string) {
    try {
      const message = JSON.parse(rawData);
      
      // 心跳响应
      if (message.type === 'pong') {
        this.handlePong();
        return;
      }
      
      // 业务消息
      this.onMessage?.(message);
      
    } catch (err) {
      console.error('[WebSocket] 消息解析失败:', rawData);
    }
  }
  
  // 心跳检测
  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // 发送 ping
        this.send({ type: 'ping' });
        
        // 设置超时检测
        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.warn('[WebSocket] 心跳超时，服务器可能已断开连接');
          this.ws?.close();
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }
  
  private handlePong() {
    // 收到 pong 响应，清除超时计时器
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
  
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
  
  // 重连逻辑
  private reconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[WebSocket] 重连次数过多，放弃重连');
      this.onError?.('连接断开，请刷新页面重试');
      return;
    }
    
    this.reconnectAttempts++;
    
    // 指数退避算法
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000  // 最大延迟 30 秒
    );
    
    console.log(`[WebSocket] 将在 ${delay}ms 后进行第 ${this.reconnectAttempts} 次重连`);
    
    this.reconnectTimer = setTimeout(() => {
      console.log(`[WebSocket] 开始第 ${this.reconnectAttempts} 次重连...`);
      this.connect().catch(err => {
        console.error('[WebSocket] 重连失败:', err);
        this.reconnect();
      });
    }, delay);
  }
  
  // 发送消息
  send(data: any): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    } else {
      // 连接未建立，加入消息队列
      console.warn('[WebSocket] 连接未建立，消息已加入队列');
      this.messageQueue.push(data);
      return false;
    }
  }
  
  // 发送离线消息队列
  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }
  
  // 主动关闭
  close() {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }
  
  // 回调
  onMessage?: (message: any) => void;
  onError?: (error: string) => void;
  
  // 获取连接状态
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

**2. React 中的使用**

```typescript
// Hook
const useWebSocket = (url: string) => {
  const wsRef = useRef<ManagedWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    wsRef.current = new ManagedWebSocket({
      url,
      reconnect: true,
      heartbeatInterval: 30000
    });
    
    wsRef.current.onMessage = (message) => {
      setMessages(prev => [...prev, message]);
      setIsConnected(true);
    };
    
    wsRef.current.onError = (err) => {
      setError(err);
      setIsConnected(false);
    };
    
    wsRef.current.connect().catch(err => {
      setError(err.message);
    });
    
    return () => {
      wsRef.current?.close();
    };
  }, [url]);
  
  return { isConnected, messages, error, send: (data) => wsRef.current?.send(data) };
};
```

**3. 异常场景处理**

```typescript
// 网络波动场景
// 问题：用户切换 WiFi/4G，连接断开
// 解决：心跳超时自动重连

// 服务器宕机场景
// 问题：连接保活但服务器无响应
// 解决：心跳 pong 超时，触发重连

// 长时间无消息场景
// 问题：浏览器可能杀死闲置连接
// 解决：定期发送 ping 保活

// 消息乱序场景
// 问题：离线时多个消息，重连后乱序
// 解决：每条消息带时间戳和序列号
```

**4. WebSocket vs SSE 的选择**

| 特性 | WebSocket | SSE |
|------|-----------|-----|
| 连接方向 | 双向 | 单向（服务器 → 客户端） |
| 复杂度 | 高（需要心跳、重连） | 低（浏览器自动重连） |
| 消息顺序 | 需要手动处理 | 自动保证 |
| 适用场景 | 需要客户端发送消息的场景 | 纯推送场景 |
| 浏览器兼容性 | IE10+ | IE 不支持 |

**最佳实践：**
- ✅ 心跳检测，及时发现连接断开
- ✅ 指数退避重连，避免服务器压力
- ✅ 离线消息队列，确保消息不丢失
- ✅ 心跳超时判定，区分正常断开和异常
- ✅ 清晰的连接状态管理

---

### Q12: 在流式消息场景中，如何处理消息的「断点续传」、「重复消息去重」和「消息乱序」问题？

**答案：**

流式通信最容易遇到的三个问题：

1. **断点续传**：网络中断后，需要知道从哪里继续
2. **重复消息**：网络重试导致消息重复
3. **消息乱序**：异步处理导致接收顺序不对

**完整解决方案：**

**1. 消息序列化设计**

```typescript
interface StreamMessage {
  id: string;              // 全局唯一消息 ID
  seq: number;             // 序列号（单调递增）
  timestamp: number;       // 服务器时间戳
  type: 'text' | 'event' | 'error';
  data: any;
  checksum?: string;       // 消息校验和（用于去重）
}

// 服务器端：生成消息
function generateStreamMessage(data: any, seq: number): StreamMessage {
  const message: StreamMessage = {
    id: crypto.randomUUID(),
    seq,
    timestamp: Date.now(),
    type: 'text',
    data
  };
  
  // 计算校验和（用于去重）
  message.checksum = crypto
    .createHash('md5')
    .update(JSON.stringify({ seq, data }))
    .digest('hex');
  
  return message;
}
```

**2. 断点续传**

```typescript
class StreamMessageCollector {
  private messages: Map<number, StreamMessage> = new Map();
  private lastReceivedSeq = -1;  // 最后接收到的序列号
  private expectedSeq = 0;        // 期望接收的序列号
  
  // 接收消息
  receive(message: StreamMessage) {
    const { seq, checksum } = message;
    
    // 检查是否重复
    if (this.messages.has(seq)) {
      console.warn(`重复消息: seq=${seq}, checksum=${checksum}`);
      return;
    }
    
    // 消息乱序，存储在 map 中
    this.messages.set(seq, message);
    this.lastReceivedSeq = Math.max(this.lastReceivedSeq, seq);
    
    // 尝试顺序输出消息
    this.flushOrderedMessages();
  }
  
  // 顺序输出消息
  private flushOrderedMessages(): StreamMessage[] {
    const flushed: StreamMessage[] = [];
    
    while (this.messages.has(this.expectedSeq)) {
      const message = this.messages.get(this.expectedSeq)!;
      this.messages.delete(this.expectedSeq);
      flushed.push(message);
      this.expectedSeq++;
    }
    
    return flushed;
  }
  
  // 获取缺失的序列号（用于断点续传）
  getMissingSeqs(): number[] {
    const missing: number[] = [];
    
    for (let i = this.expectedSeq; i <= this.lastReceivedSeq; i++) {
      if (!this.messages.has(i)) {
        missing.push(i);
      }
    }
    
    return missing;
  }
  
  // 获取期望的起始序列号
  getExpectedSeq(): number {
    return this.expectedSeq;
  }
}

// 使用示例
const collector = new StreamMessageCollector();

// 模拟接收乱序消息
collector.receive({ seq: 0, data: 'A' } as StreamMessage);
collector.receive({ seq: 2, data: 'C' } as StreamMessage);  // 乱序
collector.receive({ seq: 1, data: 'B' } as StreamMessage);  // 填补空隙

// 输出消息：A, B, C（已排序）

// 网络中断，缺失 seq=3, 4
collector.receive({ seq: 5, data: 'F' } as StreamMessage);
const missing = collector.getMissingSeqs();  // [3, 4]

// 请求服务器重新发送缺失的消息
fetch('/api/stream/messages', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'xxx',
    fromSeq: collector.getExpectedSeq(),
    missing
  })
});
```

**3. 重复消息去重**

```typescript
// 方案 1：基于 checksum（内容哈希）
class DeduplicationByChecksum {
  private seen: Set<string> = new Set();
  
  isDuplicate(message: StreamMessage): boolean {
    if (!message.checksum) return false;
    
    const isDup = this.seen.has(message.checksum);
    this.seen.add(message.checksum);
    
    // 限制 Set 大小，避免内存泄漏
    if (this.seen.size > 10000) {
      const entries = Array.from(this.seen).slice(0, 5000);
      this.seen.clear();
      entries.forEach(e => this.seen.add(e));
    }
    
    return isDup;
  }
}

// 方案 2：基于消息 ID（幂等性）
class DeduplicationById {
  private processedIds: Set<string> = new Set();
  
  isDuplicate(message: StreamMessage): boolean {
    const isDup = this.processedIds.has(message.id);
    this.processedIds.add(message.id);
    
    // 使用 LRU 缓存限制大小
    if (this.processedIds.size > 10000) {
      const entries = Array.from(this.processedIds).slice(0, 5000);
      this.processedIds.clear();
      entries.forEach(e => this.processedIds.add(e));
    }
    
    return isDup;
  }
}

// 使用
const dedup = new DeduplicationById();

// 第一次收到消息
if (!dedup.isDuplicate(msg1)) {
  processMessage(msg1);  // 处理
}

// 网络重试，收到重复消息
if (!dedup.isDuplicate(msg1)) {
  processMessage(msg1);  // 不再处理（已去重）
}
```

**4. 消息乱序处理**

```typescript
// 场景：同时接收多个 SSE 事件，处理时间不同

interface OrderedMessage {
  id: string;
  index: number;  // 顺序索引
  content: string;
}

class MessageOrdering {
  private pendingMessages: Map<number, OrderedMessage> = new Map();
  private nextExpectedIndex = 0;
  private callbacks: Array<(msg: OrderedMessage) => void> = [];
  
  // 接收消息
  receive(message: OrderedMessage) {
    this.pendingMessages.set(message.index, message);
    this.tryProcess();
  }
  
  // 尝试按顺序处理
  private tryProcess() {
    while (this.pendingMessages.has(this.nextExpectedIndex)) {
      const message = this.pendingMessages.get(this.nextExpectedIndex)!;
      this.pendingMessages.delete(this.nextExpectedIndex);
      
      // 按顺序处理消息
      this.callbacks.forEach(cb => cb(message));
      
      this.nextExpectedIndex++;
    }
  }
  
  // 注册处理回调
  on(callback: (msg: OrderedMessage) => void) {
    this.callbacks.push(callback);
  }
}
```

**5. 实际应用：AI 流式对话去重和排序**

```typescript
class StreamChatProcessor {
  private deduplicator = new DeduplicationById();
  private collector = new StreamMessageCollector();
  private currentChatId = '';
  
  async handleStreamMessage(message: StreamMessage) {
    // 1. 检查重复
    if (this.deduplicator.isDuplicate(message)) {
      console.log('跳过重复消息:', message.id);
      return;
    }
    
    // 2. 按序列号排序
    this.collector.receive(message);
    
    // 3. 获取有序消息并处理
    const orderedMessages = this.collector.flushOrderedMessages();
    
    for (const msg of orderedMessages) {
      await this.processMessage(msg);
    }
    
    // 4. 检查是否有缺失消息
    const missing = this.collector.getMissingSeqs();
    if (missing.length > 0) {
      console.warn('检测到缺失消息:', missing);
      await this.requestMissingMessages(missing);
    }
  }
  
  private async processMessage(message: StreamMessage) {
    switch (message.type) {
      case 'text':
        // 更新 UI
        this.updateChatContent(message.data);
        break;
      case 'event':
        // 处理事件（如 Agent 步骤）
        this.handleAgentEvent(message.data);
        break;
      case 'error':
        // 处理错误
        this.handleError(message.data);
        break;
    }
  }
  
  private async requestMissingMessages(seqs: number[]) {
    const response = await fetch('/api/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        chatId: this.currentChatId,
        seqs
      })
    });
    
    const messages = await response.json();
    for (const msg of messages) {
      await this.handleStreamMessage(msg);
    }
  }
  
  private updateChatContent(data: any) { /* ... */ }
  private handleAgentEvent(data: any) { /* ... */ }
  private handleError(data: any) { /* ... */ }
}
```

**关键点总结：**

1. **序列号（seq）**：确保消息顺序
2. **消息 ID**：用于去重和幂等性
3. **时间戳**：用于排序和调试
4. **校验和**：快速检测重复
5. **缺失检测**：知道哪些消息丢失了
6. **LRU 缓存**：限制去重 Set 的大小

---

### Q13: 如何处理 Markdown、代码高亮、数学公式等富文本在聊天中的渲染和安全问题？

**答案：**

聊天应用中常见的富文本渲染问题：

1. **XSS 安全风险**：用户输入可能包含恶意脚本
2. **性能问题**：大量代码块渲染卡顿
3. **功能完整性**：Markdown 支持不全，代码高亮失效
4. **用户体验**：代码复制不便，公式显示不正确

**完整解决方案：**

**1. 安全的 Markdown 渲染**

```typescript
import ReactMarkdown from 'react-markdown';
import { visit } from 'unist-util-visit';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { low } from 'lowlight';
import js from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';

low.registerLanguage('js', js);
low.registerLanguage('python', python);

// 配置安全的 HTML 标签白名单
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className']  // 允许 class 属性（用于高亮）
    ],
    span: [['className'], ['style']]  // 允许 span 和 style（用于公式）
  }
};

// 自定义渲染器
const SafeMarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[
        remarkGfm,           // GitHub Flavored Markdown
        [remarkMath, { singleDollarTextMath: false }]  // 数学公式
      ]}
      rehypePlugins={[
        rehypeKatex,         // 渲染 LaTeX
        [rehypeSanitize, sanitizeSchema]  // 清理恶意 HTML
      ]}
      components={{
        // 自定义代码块渲染
        code: ({ inline, className, children, ...props }) => {
          if (inline) {
            return <code className="inline-code">{children}</code>;
          }
          
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          
          return (
            <CodeBlock
              language={language}
              code={String(children).replace(/\n$/, '')}
              {...props}
            />
          );
        },
        
        // 自定义链接渲染（防止 javascript: 伪协议）
        a: ({ href, children, ...props }) => {
          // 验证 URL
          if (href?.startsWith('javascript:') || href?.startsWith('data:')) {
            return <span>{children}</span>;  // 移除危险链接
          }
          
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          );
        },
        
        // 图片沙箱（防止隐私泄露）
        img: ({ src, alt, ...props }) => {
          if (!src) return null;
          
          return (
            <img
              src={src}
              alt={alt}
              loading="lazy"
              onError={(e) => {
                console.error('图片加载失败:', src);
              }}
              {...props}
            />
          );
        },
        
        // 视频处理
        video: () => {
          return <p>暂不支持视频嵌入</p>;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
```

**2. 代码高亮和复制**

```typescript
import { Highlight, themes } from 'prism-react-renderer';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { Button, Space, message } from 'antd';

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      message.success('已复制到剪贴板');
      
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      message.error('复制失败');
    }
  };
  
  return (
    <Highlight theme={themes.nightOwl} code={code} language={language || 'javascript'}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <div className="code-block">
          {/* 代码块头部 */}
          <div className="code-header">
            <span className="code-language">{language || 'code'}</span>
            <Button
              type="text"
              size="small"
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopy}
            >
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
          
          {/* 代码内容 */}
          <pre className={className} style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line, key: i })}>
                <span className="code-line-number">{i + 1}</span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token, key })} />
                ))}
              </div>
            ))}
          </pre>
        </div>
      )}
    </Highlight>
  );
};
```

**3. 数学公式渲染**

```typescript
// 使用 KaTeX 渲染数学公式
import KaTeX from 'katex';
import 'katex/dist/katex.min.css';

// 配置 remark-math 和 rehype-katex
const markdownConfig = {
  remarkPlugins: [
    [
      remarkMath,
      {
        singleDollarTextMath: true  // 支持 $...$ 单美元符
      }
    ]
  ],
  rehypePlugins: [
    [
      rehypeKatex,
      {
        output: 'mathml',  // 使用 MathML，更安全
        throwOnError: false  // 公式错误时不中断渲染
      }
    ]
  ]
};

// 自定义公式渲染器
const MathRenderer = ({ children, display }: { children: string; display: boolean }) => {
  try {
    const html = KaTeX.renderToString(children, {
      displayMode: display,
      throwOnError: false
    });
    
    return (
      <div
        className={`math ${display ? 'display-math' : 'inline-math'}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch (err) {
    console.error('公式渲染失败:', err);
    return <span className="math-error">[公式错误]</span>;
  }
};
```

**4. 富文本 HTML 白名单验证**

```typescript
import DOMPurify from 'dompurify';

// 配置 DOMPurify 白名单
const purifyConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote',
    'a', 'img', 'table', 'tr', 'td', 'th',
    'span', 'div'
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'class', 'id', 'style',
    'target', 'rel'
  ],
  KEEP_CONTENT: true
};

// 清理用户输入的 HTML
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, purifyConfig);
};

// 使用
const userInput = '<img src="x" onerror="alert(123)" /><p>Hello</p>';
const safe = sanitizeHtml(userInput);  // <p>Hello</p>（移除了恶意代码）
```

**5. 长内容虚拟化渲染**

```typescript
// 问题：大量 Markdown 内容（如 10000+ 行代码）渲染卡顿
// 解决：分块渲染和虚拟滚动

const LargeMarkdownRenderer = ({ content }: { content: string }) => {
  const [visibleChunks, setVisibleChunks] = useState<number[]>([0, 1, 2]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 分块
  const chunks = useMemo(() => {
    const lines = content.split('\n');
    const chunkSize = 100;  // 每 100 行为一块
    const result = [];
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      result.push(lines.slice(i, i + chunkSize).join('\n'));
    }
    
    return result;
  }, [content]);
  
  // 监听滚动
  const handleScroll = throttle((e: Event) => {
    if (!containerRef.current) return;
    
    const { scrollTop, clientHeight } = containerRef.current;
    const chunkHeight = containerRef.current.scrollHeight / chunks.length;
    
    const firstVisibleChunk = Math.floor(scrollTop / chunkHeight);
    const lastVisibleChunk = Math.ceil((scrollTop + clientHeight) / chunkHeight);
    
    // 渲染可见块和前后各一块（缓冲）
    const newVisible = [];
    for (let i = Math.max(0, firstVisibleChunk - 1); i <= Math.min(chunks.length - 1, lastVisibleChunk + 1); i++) {
      newVisible.push(i);
    }
    
    setVisibleChunks(newVisible);
  }, 200);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [chunks]);
  
  return (
    <div ref={containerRef} className="large-content-container">
      {chunks.map((chunk, i) => (
        <div key={i}>
          {visibleChunks.includes(i) ? (
            <SafeMarkdownRenderer content={chunk} />
          ) : (
            <div style={{ height: '200px', background: '#f5f5f5' }} />
          )}
        </div>
      ))}
    </div>
  );
};
```

**6. 关键安全检查清单**

```typescript
// 安全渲染检查
const securityChecklist = {
  // ✅ 移除 JavaScript 伪协议
  'javascript:': false,
  'data:text/html': false,
  'vbscript:': false,
  
  // ✅ 移除危险属性
  'onerror': false,
  'onload': false,
  'onclick': false,
  'onmouseover': false,
  
  // ✅ 限制外部资源
  'iframe': false,
  'script': false,
  'style': 'sandboxed',  // 允许但沙箱化
  
  // ✅ 图片白名单
  'img.src': ['https://...', 'data:image/png;base64,...']
};

// 验证函数
function validateContent(html: string): boolean {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 检查危险标签
  const scripts = doc.querySelectorAll('script');
  if (scripts.length > 0) {
    console.error('检测到 script 标签');
    return false;
  }
  
  // 检查事件处理器
  const elementsWithHandlers = doc.querySelectorAll('[onclick], [onerror], [onload]');
  if (elementsWithHandlers.length > 0) {
    console.error('检测到事件处理器');
    return false;
  }
  
  return true;
}
```

**性能优化总结：**

| 问题 | 解决方案 |
|------|---------|
| XSS 攻击 | DOMPurify + 白名单 |
| 渲染卡顿 | 分块渲染 + 虚拟滚动 |
| 代码复制 | navigator.clipboard API |
| 公式渲染 | KaTeX + MathML |
| 大文件 | 懒加载 + 流式解析 |

---

## 四、工程实践类

### Q10: 如何设计 API 层，实现请求拦截、错误处理和数据规范化？

**答案：**

API 层是前端与后端的桥梁，需要统一处理鉴权、错误、重试、数据转换等逻辑。

**整体架构：**

```
UI 层
  ↓
API 封装层（sessions.ts, github.ts）
  ↓
HTTP 客户端层（axios 封装）
  ↓
拦截器层（请求拦截、响应拦截）
  ↓
后端 API
```

**实现细节：**

**1. Axios 基础配置**

```typescript
// api/index.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { message } from 'antd';
import { getAuthToken, clearAuthToken } from '../store/useAuthStore';

// 根据环境自动切换 API 地址
const BASE_URL = 
  import.meta.env.MODE === 'production'
    ? 'https://www.adongdong.xyz/api'
    : 'http://localhost:3000/api';

// 创建 axios 实例
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,  // 30 秒超时
  headers: {
    'Content-Type': 'application/json'
  }
});
```

**2. 请求拦截器（添加 Token）**

```typescript
apiClient.interceptors.request.use(
  (config) => {
    // 自动添加 Authorization 头
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // 添加请求 ID（用于追踪）
    config.headers['X-Request-ID'] = crypto.randomUUID();
    
    // 添加时间戳（防止缓存）
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now()
      };
    }
    
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config);
    
    return config;
  },
  (error) => {
    console.error('[API] 请求拦截器错误:', error);
    return Promise.reject(error);
  }
);
```

**3. 响应拦截器（统一错误处理）**

```typescript
apiClient.interceptors.response.use(
  (response) => {
    // 成功响应，直接返回 data
    return response.data;
  },
  async (error: AxiosError<{ message?: string; code?: string }>) => {
    const { response, config } = error;
    
    // 网络错误（无响应）
    if (!response) {
      message.error('网络连接失败，请检查网络');
      return Promise.reject(new Error('网络连接失败'));
    }
    
    const { status, data } = response;
    
    // 根据状态码处理
    switch (status) {
      case 401: {
        // 未授权，清除 Token 并跳转登录
        message.error('登录已过期，请重新登录');
        clearAuthToken();
        window.location.href = '/login';
        break;
      }
      
      case 403: {
        message.error('没有权限访问该资源');
        break;
      }
      
      case 404: {
        message.error('请求的资源不存在');
        break;
      }
      
      case 429: {
        // 限流
        const retryAfter = response.headers['retry-after'];
        message.error(`请求过于频繁，请 ${retryAfter || 60} 秒后重试`);
        break;
      }
      
      case 500:
      case 502:
      case 503: {
        // 服务器错误，支持重试
        const retryCount = (config as any).__retryCount || 0;
        
        if (retryCount < 3) {
          // 重试逻辑
          (config as any).__retryCount = retryCount + 1;
          
          // 指数退避：1s, 2s, 4s
          await new Promise(resolve => 
            setTimeout(resolve, Math.pow(2, retryCount) * 1000)
          );
          
          console.log(`[API] 重试第 ${retryCount + 1} 次:`, config.url);
          return apiClient.request(config);
        }
        
        message.error('服务器错误，请稍后再试');
        break;
      }
      
      default: {
        const errorMsg = data?.message || '请求失败';
        message.error(errorMsg);
      }
    }
    
    return Promise.reject(error);
  }
);
```

**4. 数据规范化层**

```typescript
// api/sessions.ts
import type { ChatSession, SessionKnowledgeFile } from '../types/chat';

// 规范化知识库文件
function normalizeKnowledgeFile(file: any): SessionKnowledgeFile {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: file.uploadedAt 
      ? new Date(file.uploadedAt).getTime()
      : file.createdAt
        ? new Date(file.createdAt).getTime()
        : Date.now(),
    indexStatus: file.indexStatus ?? 'ready',
    indexError: file.indexError ?? null
  };
}

// 规范化会话
function normalizeSession(session: any): ChatSession {
  return {
    ...session,
    updatedAt: session.updatedAt
      ? new Date(session.updatedAt).getTime()
      : Date.now(),
    messages: (session.messages || []).map((msg: any) => ({
      ...msg,
      createdAt: msg.createdAt 
        ? new Date(msg.createdAt).getTime()
        : Date.now()
    })),
    draft: session.draft || '',
    manageConfig: {
      isPublic: session.manageConfig?.isPublic ?? false,
      systemPrompt: session.manageConfig?.systemPrompt ?? '',
      knowledgeFiles: (session.manageConfig?.knowledgeFiles || []).map(
        normalizeKnowledgeFile
      )
    }
  } as ChatSession;
}

// API 封装
export const sessionApi = {
  // 获取会话列表
  async list(): Promise<ChatSession[]> {
    const sessions = await listSessions();
    return sessions.map(normalizeSession);
  },
  
  // 获取会话详情
  async get(id: string, limit?: number, cursor?: string): Promise<ChatSession> {
    const session = await getSessionDetail(id, limit, cursor);
    return normalizeSession(session);
  },
  
  // 创建会话
  async create(title?: string): Promise<ChatSession> {
    const data = await createSQLSession(title);
    return normalizeSession(data);
  },
  
  // 上传知识库文件
  async uploadKnowledge(id: string, files: File[]): Promise<SessionKnowledgeFile[]> {
    const result = await uploadSessionKnowledge(id, files);
    return (result.knowledgeFiles || []).map(normalizeKnowledgeFile);
  }
};
```

**5. 文件上传封装**

```typescript
// 上传知识库文件
export async function uploadSessionKnowledge(
  sessionId: string,
  files: File[]
): Promise<{ knowledgeFiles: SessionKnowledgeFile[] }> {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });
  
  return apiClient.post(
    `/sessions/${sessionId}/knowledge`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      // 上传进度
      onUploadProgress: (progressEvent) => {
        const percent = Math.round(
          (progressEvent.loaded * 100) / (progressEvent.total || 1)
        );
        console.log(`上传进度: ${percent}%`);
      }
    }
  );
}
```

**6. SSE 请求封装**

```typescript
// 发送聊天消息（SSE 流式响应）
export async function sendChatStream(
  sessionId: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<Response> {
  const token = getAuthToken();
  
  const response = await fetch(`${BASE_URL}/chat/${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ messages }),
    signal  // 支持中断
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '请求失败');
  }
  
  return response;
}
```

**7. 请求取消**

```typescript
// 使用 AbortController 取消请求
const controller = new AbortController();

try {
  const data = await apiClient.get('/sessions', {
    signal: controller.signal
  });
} catch (err) {
  if (axios.isCancel(err)) {
    console.log('请求被取消');
  }
}

// 取消请求
controller.abort();
```

**8. 类型安全**

```typescript
// 定义请求/响应类型
interface ListSessionsResponse {
  sessions: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
  total: number;
}

// 使用泛型确保类型安全
async function listSessions(): Promise<ListSessionsResponse> {
  return apiClient.get<ListSessionsResponse>('/sessions');
}
```

**9. 环境变量管理**

```typescript
// .env.development
VITE_API_BASE_URL=http://localhost:3000/api

// .env.production
VITE_API_BASE_URL=https://www.adongdong.xyz/api

// 使用
const BASE_URL = import.meta.env.VITE_API_BASE_URL;
```

**10. Mock 数据（开发环境）**

```typescript
if (import.meta.env.MODE === 'development') {
  // 使用 MSW (Mock Service Worker)
  import('../mocks/browser').then(({ worker }) => {
    worker.start();
  });
}

// mocks/handlers.ts
import { rest } from 'msw';

export const handlers = [
  rest.get('/api/sessions', (req, res, ctx) => {
    return res(
      ctx.json({
        sessions: [
          { id: '1', title: 'Mock 会话', updatedAt: new Date().toISOString() }
        ]
      })
    );
  })
];
```

**最佳实践总结：**

✅ **统一错误处理**：响应拦截器捕获所有错误  
✅ **自动重试**：5xx 错误自动重试 3 次（指数退避）  
✅ **数据规范化**：后端数据转换为前端统一格式  
✅ **类型安全**：TypeScript + 泛型  
✅ **请求追踪**：添加 Request ID  
✅ **环境隔离**：开发/生产环境自动切换  
✅ **Token 管理**：自动添加 Authorization 头  
✅ **请求取消**：支持 AbortController  

---

## 五、流式通信与实时消息类

### Q11: 如何优雅地处理 WebSocket 连接的异常和重连？请详细说明网络波动、服务器宕机、长时间无消息等场景。

**答案：**

WebSocket 是双向通信的流式协议，相比 SSE 的优势在于可以实时接收服务器推送。但它的复杂性也在于连接管理、错误恢复和心跳检测。

**核心问题：**

1. **网络中断后如何快速感知？**
2. **重连时如何不丢失消息？**
3. **长连接如何保活？**
4. **如何区分正常断开和异常断开？**

**完整实现方案：**

**1. WebSocket 连接管理**

```typescript
interface WebSocketConfig {
  url: string;
  reconnect: boolean;
  reconnectInterval: number;  // 初始重连间隔
  maxReconnectAttempts: number;
  heartbeatInterval: number;  // 心跳间隔
  heartbeatTimeout: number;   // 心跳超时时间
}

class ManagedWebSocket {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  private messageQueue: Array<{ type: string; data: any }> = [];  // 离线消息队列
  private isIntentionallyClosed = false;  // 标记是否主动关闭
  
  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,  // 30 秒
      heartbeatTimeout: 5000,    // 5 秒内必须收到 pong
      ...config
    };
  }
  
  // 连接
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);
        
        this.ws.onopen = () => {
          console.log('[WebSocket] 连接已建立');
          this.reconnectAttempts = 0;  // 重置重连计数
          this.isIntentionallyClosed = false;
          
          // 连接成功后发送离线消息队列
          this.flushMessageQueue();
          
          // 启动心跳检测
          this.startHeartbeat();
          
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onerror = (event) => {
          console.error('[WebSocket] 连接错误:', event);
          reject(new Error('WebSocket 连接失败'));
        };
        
        this.ws.onclose = (event) => {
          console.log(`[WebSocket] 连接关闭 (code: ${event.code})`);
          
          this.stopHeartbeat();
          
          // 如果不是主动关闭，且配置了自动重连，则进行重连
          if (!this.isIntentionallyClosed && this.config.reconnect) {
            this.reconnect();
          }
        };
        
      } catch (err) {
        reject(err);
      }
    });
  }
  
  // 消息处理
  private handleMessage(rawData: string) {
    try {
      const message = JSON.parse(rawData);
      
      // 心跳响应
      if (message.type === 'pong') {
        this.handlePong();
        return;
      }
      
      // 业务消息
      this.onMessage?.(message);
      
    } catch (err) {
      console.error('[WebSocket] 消息解析失败:', rawData);
    }
  }
  
  // 心跳检测
  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // 发送 ping
        this.send({ type: 'ping' });
        
        // 设置超时检测
        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.warn('[WebSocket] 心跳超时，服务器可能已断开连接');
          this.ws?.close();
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }
  
  private handlePong() {
    // 收到 pong 响应，清除超时计时器
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
  
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
  
  // 重连逻辑
  private reconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[WebSocket] 重连次数过多，放弃重连');
      this.onError?.('连接断开，请刷新页面重试');
      return;
    }
    
    this.reconnectAttempts++;
    
    // 指数退避算法
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000  // 最大延迟 30 秒
    );
    
    console.log(`[WebSocket] 将在 ${delay}ms 后进行第 ${this.reconnectAttempts} 次重连`);
    
    this.reconnectTimer = setTimeout(() => {
      console.log(`[WebSocket] 开始第 ${this.reconnectAttempts} 次重连...`);
      this.connect().catch(err => {
        console.error('[WebSocket] 重连失败:', err);
        this.reconnect();
      });
    }, delay);
  }
  
  // 发送消息
  send(data: any): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    } else {
      // 连接未建立，加入消息队列
      console.warn('[WebSocket] 连接未建立，消息已加入队列');
      this.messageQueue.push(data);
      return false;
    }
  }
  
  // 发送离线消息队列
  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }
  
  // 主动关闭
  close() {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }
  
  // 回调
  onMessage?: (message: any) => void;
  onError?: (error: string) => void;
  
  // 获取连接状态
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

**关键场景处理：**

| 场景 | 表现 | 解决方案 |
|------|------|---------|
| 网络波动 | 连接不稳定 | 心跳 ping/pong 快速感知 |
| 服务器宕机 | pong 超时 | 触发重连，指数退避 |
| 长时间无消息 | 浏览器杀死连接 | 定期发送心跳保活 |
| 客户端离线 | 无网络 | 消息队列缓存，恢复后重发 |

**2. React 中的使用**

```typescript
const useWebSocket = (url: string) => {
  const wsRef = useRef<ManagedWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    wsRef.current = new ManagedWebSocket({
      url,
      reconnect: true,
      heartbeatInterval: 30000
    });
    
    wsRef.current.onMessage = (message) => {
      setMessages(prev => [...prev, message]);
      setIsConnected(true);
    };
    
    wsRef.current.onError = (err) => {
      setError(err);
      setIsConnected(false);
    };
    
    wsRef.current.connect().catch(err => {
      setError(err.message);
    });
    
    return () => {
      wsRef.current?.close();
    };
  }, [url]);
  
  return { isConnected, messages, error, send: (data) => wsRef.current?.send(data) };
};
```

---

### Q12: 在流式消息场景中，如何处理消息的「断点续传」、「重复消息去重」和「消息乱序」问题？

**答案：**

流式通信最容易遇到的三个问题：

1. **断点续传**：网络中断后，需要知道从哪里继续
2. **重复消息**：网络重试导致消息重复
3. **消息乱序**：异步处理导致接收顺序不对

**完整解决方案：**

**1. 消息序列化设计**

```typescript
interface StreamMessage {
  id: string;              // 全局唯一消息 ID
  seq: number;             // 序列号（单调递增）
  timestamp: number;       // 服务器时间戳
  type: 'text' | 'event' | 'error';
  data: any;
  checksum?: string;       // 消息校验和（用于去重）
}

// 服务器端：生成消息
function generateStreamMessage(data: any, seq: number): StreamMessage {
  const message: StreamMessage = {
    id: crypto.randomUUID(),
    seq,
    timestamp: Date.now(),
    type: 'text',
    data
  };
  
  // 计算校验和（用于去重）
  message.checksum = crypto
    .createHash('md5')
    .update(JSON.stringify({ seq, data }))
    .digest('hex');
  
  return message;
}
```

**2. 断点续传**

```typescript
class StreamMessageCollector {
  private messages: Map<number, StreamMessage> = new Map();
  private lastReceivedSeq = -1;  // 最后接收到的序列号
  private expectedSeq = 0;        // 期望接收的序列号
  
  // 接收消息
  receive(message: StreamMessage) {
    const { seq, checksum } = message;
    
    // 检查是否重复
    if (this.messages.has(seq)) {
      console.warn(`重复消息: seq=${seq}, checksum=${checksum}`);
      return;
    }
    
    // 消息乱序，存储在 map 中
    this.messages.set(seq, message);
    this.lastReceivedSeq = Math.max(this.lastReceivedSeq, seq);
    
    // 尝试顺序输出消息
    this.flushOrderedMessages();
  }
  
  // 顺序输出消息
  private flushOrderedMessages(): StreamMessage[] {
    const flushed: StreamMessage[] = [];
    
    while (this.messages.has(this.expectedSeq)) {
      const message = this.messages.get(this.expectedSeq)!;
      this.messages.delete(this.expectedSeq);
      flushed.push(message);
      this.expectedSeq++;
    }
    
    return flushed;
  }
  
  // 获取缺失的序列号（用于断点续传）
  getMissingSeqs(): number[] {
    const missing: number[] = [];
    
    for (let i = this.expectedSeq; i <= this.lastReceivedSeq; i++) {
      if (!this.messages.has(i)) {
        missing.push(i);
      }
    }
    
    return missing;
  }
  
  // 获取期望的起始序列号
  getExpectedSeq(): number {
    return this.expectedSeq;
  }
}

// 使用示例
const collector = new StreamMessageCollector();

// 模拟接收乱序消息
collector.receive({ seq: 0, data: 'A' } as StreamMessage);
collector.receive({ seq: 2, data: 'C' } as StreamMessage);  // 乱序
collector.receive({ seq: 1, data: 'B' } as StreamMessage);  // 填补空隙

// 输出消息：A, B, C（已排序）

// 网络中断，缺失 seq=3, 4
collector.receive({ seq: 5, data: 'F' } as StreamMessage);
const missing = collector.getMissingSeqs();  // [3, 4]

// 请求服务器重新发送缺失的消息
fetch('/api/stream/messages', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'xxx',
    fromSeq: collector.getExpectedSeq(),
    missing
  })
});
```

**3. 重复消息去重**

```typescript
class DeduplicationById {
  private processedIds: Set<string> = new Set();
  
  isDuplicate(message: StreamMessage): boolean {
    const isDup = this.processedIds.has(message.id);
    this.processedIds.add(message.id);
    
    // 使用 LRU 缓存限制大小
    if (this.processedIds.size > 10000) {
      const entries = Array.from(this.processedIds).slice(0, 5000);
      this.processedIds.clear();
      entries.forEach(e => this.processedIds.add(e));
    }
    
    return isDup;
  }
}

// 使用
const dedup = new DeduplicationById();

if (!dedup.isDuplicate(msg1)) {
  processMessage(msg1);
}
```

---

### Q13: 如何处理 Markdown、代码高亮、数学公式等富文本在聊天中的渲染和安全问题？

**答案：**

聊天应用中常见的富文本渲染问题：

1. **XSS 安全风险**：用户输入可能包含恶意脚本
2. **性能问题**：大量代码块渲染卡顿
3. **功能完整性**：Markdown 支持不全，代码高亮失效

**完整解决方案：**

**1. 安全的 Markdown 渲染**

```typescript
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';

const SafeMarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      rehypePlugins={[
        rehypeHighlight,
        [rehypeSanitize, {
          ...defaultSchema,
          attributes: {
            ...defaultSchema.attributes,
            code: [...(defaultSchema.attributes?.code || []), ['className']]
          }
        }]
      ]}
      components={{
        // 自定义代码块渲染
        code: ({ inline, className, children, ...props }) => {
          if (inline) {
            return <code className="inline-code">{children}</code>;
          }
          
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          
          return (
            <CodeBlock
              language={language}
              code={String(children).replace(/\n$/, '')}
              {...props}
            />
          );
        },
        
        // 自定义链接渲染（防止 javascript: 伪协议）
        a: ({ href, children, ...props }) => {
          if (href?.startsWith('javascript:') || href?.startsWith('data:')) {
            return <span>{children}</span>;
          }
          
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
```

**2. 代码高亮和复制**

```typescript
import { Highlight, themes } from 'prism-react-renderer';
import { CopyOutlined } from '@ant-design/icons';

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败');
    }
  };
  
  return (
    <Highlight theme={themes.nightOwl} code={code} language={language || 'javascript'}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <div className="code-block">
          <div className="code-header">
            <span>{language}</span>
            <button onClick={handleCopy}>
              {copied ? '已复制' : <CopyOutlined />}
            </button>
          </div>
          <pre className={className} style={style}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line, key: i })}>
                <span className="code-line-number">{i + 1}</span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token, key })} />
                ))}
              </div>
            ))}
          </pre>
        </div>
      )}
    </Highlight>
  );
};
```

**3. 数学公式渲染**

```typescript
import KaTeX from 'katex';
import 'katex/dist/katex.min.css';

const MathRenderer = ({ children, display }: { children: string; display: boolean }) => {
  try {
    const html = KaTeX.renderToString(children, {
      displayMode: display,
      throwOnError: false
    });
    
    return (
      <div
        className={`math ${display ? 'display-math' : 'inline-math'}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch (err) {
    return <span className="math-error">[公式错误]</span>;
  }
};
```

**4. HTML 白名单验证**

```typescript
import DOMPurify from 'dompurify';

const purifyConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'code', 'pre',
    'h1', 'h2', 'h3', 'a', 'img', 'ul', 'ol', 'li'
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'target', 'rel']
};

export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, purifyConfig);
};
```

**性能优化：分块渲染**

```typescript
const LargeMarkdownRenderer = ({ content }: { content: string }) => {
  const chunks = useMemo(() => {
    const lines = content.split('\n');
    const chunkSize = 100;
    const result = [];
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      result.push(lines.slice(i, i + chunkSize).join('\n'));
    }
    
    return result;
  }, [content]);
  
  const [visibleChunks, setVisibleChunks] = useState<number[]>([0, 1, 2]);
  
  const handleScroll = throttle((e: Event) => {
    const container = e.target as HTMLDivElement;
    const { scrollTop, clientHeight } = container;
    const chunkHeight = container.scrollHeight / chunks.length;
    
    const firstVisible = Math.floor(scrollTop / chunkHeight);
    const lastVisible = Math.ceil((scrollTop + clientHeight) / chunkHeight);
    
    const newVisible = [];
    for (let i = Math.max(0, firstVisible - 1); i <= Math.min(chunks.length - 1, lastVisible + 1); i++) {
      newVisible.push(i);
    }
    
    setVisibleChunks(newVisible);
  }, 200);
  
  return (
    <div onScroll={handleScroll}>
      {chunks.map((chunk, i) => (
        <div key={i}>
          {visibleChunks.includes(i) ? (
            <SafeMarkdownRenderer content={chunk} />
          ) : (
            <div style={{ height: '200px' }} />
          )}
        </div>
      ))}
    </div>
  );
};
```

---

### Q14: 聊天页面中如何处理消息的「草稿保存」、「撤销重做」和「@提及」等高级功能？

**答案：**

**1. 草稿自动保存**

```typescript
class DraftManager {
  private draft: string = '';
  private sessionId: string;
  private saveTimer: NodeJS.Timeout | null = null;
  
  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.loadDraft();
  }
  
  setDraft(content: string) {
    this.draft = content;
    
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    // 防抖保存：300ms 无输入后保存
    this.saveTimer = setTimeout(() => {
      this.saveDraft();
    }, 300);
  }
  
  private saveDraft() {
    try {
      localStorage.setItem(`draft_${this.sessionId}`, this.draft);
      console.log('[Draft] 已保存');
    } catch (err) {
      console.error('[Draft] 保存失败:', err);
    }
  }
  
  private loadDraft() {
    try {
      const stored = localStorage.getItem(`draft_${this.sessionId}`);
      if (stored) {
        this.draft = stored;
      }
    } catch (err) {
      console.error('[Draft] 加载失败:', err);
    }
  }
  
  getDraft(): string {
    return this.draft;
  }
  
  clearDraft() {
    this.draft = '';
    localStorage.removeItem(`draft_${this.sessionId}`);
  }
}
```

**2. 撤销重做（命令模式）**

```typescript
interface Command {
  execute(): void;
  undo(): void;
  redo(): void;
}

class TextEditCommand implements Command {
  constructor(
    private editor: TextEditor,
    private previousContent: string,
    private newContent: string
  ) {}
  
  execute(): void {
    this.editor.content = this.newContent;
  }
  
  undo(): void {
    this.editor.content = this.previousContent;
  }
  
  redo(): void {
    this.execute();
  }
}

class TextEditor {
  content: string = '';
  private commandHistory: Command[] = [];
  private currentIndex: number = -1;
  
  edit(newContent: string) {
    const previousContent = this.content;
    const command = new TextEditCommand(this, previousContent, newContent);
    
    command.execute();
    
    this.commandHistory = this.commandHistory.slice(0, this.currentIndex + 1);
    this.commandHistory.push(command);
    this.currentIndex++;
  }
  
  undo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.commandHistory[this.currentIndex].undo();
    }
  }
  
  redo() {
    if (this.currentIndex < this.commandHistory.length - 1) {
      this.currentIndex++;
      this.commandHistory[this.currentIndex].redo();
    }
  }
}
```

**3. @提及（前缀树 + 搜索）**

```typescript
class TrieNode {
  private children: Map<string, TrieNode> = new Map();
  private ids: Set<string> = new Set();
  
  insert(word: string, id: string) {
    let node = this;
    
    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
      node.ids.add(id);
    }
  }
  
  search(prefix: string): string[] {
    let node = this;
    
    for (const char of prefix) {
      if (!node.children.has(char)) {
        return [];
      }
      node = node.children.get(char)!;
    }
    
    return Array.from(node.ids);
  }
}

class MentionManager {
  private trie: TrieNode = new TrieNode();
  private mentions: Map<string, any> = new Map();
  
  buildTrie(mentions: any[]) {
    mentions.forEach(mention => {
      this.mentions.set(mention.id, mention);
      this.trie.insert(mention.name.toLowerCase(), mention.id);
    });
  }
  
  search(keyword: string): any[] {
    const ids = this.trie.search(keyword.toLowerCase());
    return ids.map(id => this.mentions.get(id)).filter(Boolean);
  }
}
```

---

### Q15: 聊天应用中如何处理「滚动位置保持」、「加载新消息通知」和「已读状态」等交互细节？

**答案：**

**1. 滚动位置保持**

```typescript
class ScrollManager {
  private containerRef: React.RefObject<HTMLDivElement>;
  private lastScrollHeight: number = 0;
  
  constructor(containerRef: React.RefObject<HTMLDivElement>) {
    this.containerRef = containerRef;
  }
  
  isAtBottom(): boolean {
    if (!this.containerRef.current) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = this.containerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  }
  
  recordScrollHeight() {
    if (this.containerRef.current) {
      this.lastScrollHeight = this.containerRef.current.scrollHeight;
    }
  }
  
  restoreScrollPosition() {
    if (!this.containerRef.current) return;
    
    const { scrollHeight } = this.containerRef.current;
    const heightDiff = scrollHeight - this.lastScrollHeight;
    
    this.containerRef.current.scrollTop += heightDiff;
  }
  
  scrollToBottom() {
    if (!this.containerRef.current) return;
    
    this.containerRef.current.scrollTop = this.containerRef.current.scrollHeight;
  }
}
```

**2. 新消息通知**

```typescript
class NewMessageNotifier {
  private unreadMessages: ChatMessage[] = [];
  private isVisible: boolean = true;
  
  constructor() {
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (this.isVisible) {
        this.clearUnread();
      }
    });
  }
  
  onNewMessage(message: ChatMessage) {
    this.unreadMessages.push(message);
    
    if (!this.isVisible) {
      this.showBrowserNotification(message);
      this.updatePageTitle();
    }
  }
  
  private showBrowserNotification(message: ChatMessage) {
    if (Notification.permission === 'granted') {
      new Notification('新消息', {
        body: message.content.slice(0, 50),
        icon: '/logo.png'
      });
    }
  }
  
  private updatePageTitle() {
    document.title = `(${this.unreadMessages.length}) 聊天`;
  }
  
  clearUnread() {
    this.unreadMessages = [];
    document.title = '聊天';
  }
}
```

**3. 已读状态批量上报**

```typescript
class ReadStatusManager {
  private pendingIds: Set<string> = new Set();
  private flushTimer: NodeJS.Timeout | null = null;
  private sessionId: string;
  
  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }
  
  markAsRead(messageId: string) {
    this.pendingIds.add(messageId);
    this.scheduleFlush();
  }
  
  private scheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 500);
  }
  
  private async flush() {
    if (this.pendingIds.size === 0) return;
    
    const messageIds = Array.from(this.pendingIds);
    this.pendingIds.clear();
    
    try {
      await fetch(`/api/sessions/${this.sessionId}/mark-read`, {
        method: 'POST',
        body: JSON.stringify({ messageIds })
      });
    } catch (err) {
      console.error('[Read] 上报失败:', err);
      messageIds.forEach(id => this.pendingIds.add(id));
      this.scheduleFlush();
    }
  }
  
  forceFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    return this.flush();
  }
}
```

---

## 总结

这份面试题集覆盖了 AI 知识库聊天系统的核心知识点：

**架构设计类**
- 分层架构、状态管理、数据结构

**功能实现类**
- 多会话、文件上传、流式对话、乐观更新

**性能优化类**
- 虚拟滚动、localStorage、内存管理

**流式通信类**
- WebSocket 重连、消息去重排序、断点续传

**富文本渲染类**
- Markdown、代码高亮、公式渲染、XSS 防护

**交互细节类**
- 草稿保存、撤销重做、@提及、滚动保持、消息通知

**工程实践类**
- API 设计、请求拦截、错误处理、数据规范化

这些面试题都源自实际项目开发中遇到的真实问题和最佳实践。准备面试时，建议：

1. 理解每个答案的核心思想，而不是死记硬背代码
2. 准备项目中的具体案例来说明你的理解
3. 思考如何解决变种问题或特殊场景
4. 学会权衡方案的优缺点

祝面试顺利！
