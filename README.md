# AI Code Review Frontend

基于 **React + TypeScript + Vite** 的 AI 代码审查系统前端。

## 功能

### 对话系统

- 支持多会话聊天，集成 AI 代码审查工作流。
- 实时流式响应（SSE），展示代码审查进度。
- 自动关联 GitHub 仓库，支持一键发起审查。

### GitHub 集成

- GitHub OAuth 授权登录。
- 个人详情页展示 GitHub 用户信息及仓库列表。
- 支持私有库审查引导。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。

## 构建

```bash
npm run build
npm run preview
```

## 项目结构

```
src/
  api/          # API 请求封装 (Axios & SSE)
  components/   # 通用 UI 组件 (聊天、仓库选择等)
  hooks/        # 自定义 Hooks (Auth、路由同步等)
  pages/        # 页面组件 (首页、个人中心等)
  services/     # 业务逻辑服务
  store/        # 状态管理 (Zustand)
  types/        # 类型定义
```

## 技术栈

- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Lucide React](https://lucide.dev/)
- [React Markdown](https://github.com/remarkjs/react-markdown)
- [Vite](https://vitejs.dev/)
