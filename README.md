# AI 知识库问答前端

基于 **React 19 + TypeScript + Vite** 的单页应用。核心场景是 GitHub 登录后、围绕单个会话的知识库问答：用户上传文档，智能体（ReAct Agent）结合知识库检索、联网搜索、天气查询、GitHub 只读工具生成回答，并支持把会话公开分享给无需登录的访客。

## 技术栈

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 6](https://vitejs.dev/)
- [Zustand 5](https://github.com/pmndrs/zustand) 管理会话与鉴权状态，持久化到 `localStorage`
- [React Router 7](https://reactrouter.com/)
- [Radix UI](https://www.radix-ui.com/) + [Tailwind CSS 4](https://tailwindcss.com/)：`src/ui` 下是一套 shadcn/ui（new-york 风格）基础组件
- [Lucide React](https://lucide.dev/) 图标，[Sonner](https://sonner.emilkowal.ski/) 消息提示
- [react-markdown](https://github.com/remarkjs/react-markdown) + `remark-gfm` + `react-syntax-highlighter`（Prism）用于回答的 Markdown 渲染与代码高亮
- `axios` 处理普通请求，原生 `fetch` + `ReadableStream` 处理 SSE 流式问答

## 核心能力

- 多会话聊天，消息历史分页加载，草稿按会话独立保存
- SSE 流式问答，实时展示 Agent 执行步骤（知识库检索、联网搜索、天气查询、GitHub 只读操作等工具调用）的进行中/完成/失败状态
- 会话知识库：上传 PDF / DOCX / Markdown / TXT 文件，轮询索引状态，支持重建索引、一致性检查、文件内容预览
- 会话设置：标题、系统提示词、公开 / 私有切换
- 公开会话分享：无需登录即可访问的只读问答页面，公开会话不使用记忆，也不会调用 GitHub / 联网工具
- 会话记忆（长期记忆）查看与删除
- GitHub OAuth 登录（弹窗式），token 滑动续期
- 个人中心：GitHub 用户信息、可访问仓库列表

## 路由

| 路径 | 说明 |
| --- | --- |
| `/`、`/chat/:sessionId` | 会话首页 + 对话区，移动端侧边栏可收起 |
| `/chat-details/:sessionId` | 会话设置与知识库管理 |
| `/public/session/:id` | 公开分享会话（匿名访问） |
| `/profile` | 个人中心 |

## 项目结构

```text
src/
  api/          HTTP 封装：axios 实例、SSE 请求发起、sessions / github / memories 接口
  components/   业务组件：chat（面板、消息、会话导航）、markdown（渲染与代码高亮）、
                workspace（聊天与设置页共享的布局组件）、session（记忆面板）、
                登录弹窗、GitHub 接入引导
  hooks/        业务 Hook：鉴权、路由与会话同步、发送消息、滚动跟随、侧边栏状态、流式草稿订阅
  lib/          工具函数：className 合并、登录弹窗跨窗口通信
  pages/        页面：Home、ChatDetail、Profile、PublicSession
  services/     流式核心：SSE 帧解析（streamTransport）、Agent 事件归并（knowledgeAgentStream）、
                逐字渐显渲染（textStreamRuntime）、发送消息服务（sendChatMessage）
  store/        Zustand：会话状态（useChatStore，持久化）、鉴权状态（useAuthStore，持久化）、
                登录弹窗状态（useLoginDialogStore）
  types/        TypeScript 类型定义（chat.ts）
  ui/           shadcn/ui 风格基础组件（基于 Radix UI + Tailwind）
```

## 聊天流式协议（简述）

- 发送消息：私有会话 `POST /api/chat`，公开会话 `POST /api/public/chat`；响应 `Content-Type` 为 `text/event-stream`。
- 事件类型：`message_meta`（流开始）、`text`（文本增量）、`citation`（知识库引用）、`agent_status`（`agent_started` / `tool_started` / `tool_finished` / `memory_saved` / `memory_rejected` / `agent_finished` / `error`），以 `data: [DONE]` 结束。
- 同一个工具调用的开始 / 结束事件按 `callId`（没有时用 `stepKey`）配对，前端归并成步骤列表，实时展示“正在……”到“已完成 / 失败”的状态变化；记忆事件（`memory_saved` / `memory_rejected`）不是工具步骤，单独展示。
- 完整的事件字段、错误码和边界情况以后端提供的对接文档为准，不在前端仓库内维护。

## 鉴权

- GitHub OAuth 走整页跳转登录，回调页 `/login-callback` 接收 token 后通知主窗口并关闭弹窗。
- 需要鉴权的请求统一携带 `Authorization: Bearer <token>`；响应头出现 `X-Refreshed-Token` 时自动替换本地 token（滑动续期，默认 14 天，绝对有效期 30 天）。
- 返回 401 且不是 GitHub 授权失效时，清除本地登录态并跳转首页；GitHub 授权单独失效（`GITHUB_AUTH_EXPIRED` / `GITHUB_AUTH_FAILED`）不影响站内登录态，由调用方提示重新授权。

## 基础地址

开发环境默认 `http://localhost:3000/api`，生产环境默认 `https://www.adongdong.xyz/api`；可通过环境变量 `VITE_API_BASE_URL` 覆盖，见 [src/constants/index.ts](src/constants/index.ts)。

## 本地开发

```bash
yarn install
yarn dev        # http://localhost:5173
```

## 构建

```bash
yarn build      # tsc -b && vite build
yarn preview
```

## 测试

```bash
yarn test:chat    # tests/chat-consistency.test.mjs，验证发送/重试逻辑
yarn test:stream  # tests/stream-runtime.test.mjs，验证流式渐显与 checkpoint 逻辑
```
