# AI 知识库 + 文生图 / 文生视频 前端

基于 **React 19 + TypeScript + Vite** 的前端项目，当前主要覆盖三块能力：

1. AI 知识库聊天
2. 文生图
3. 文生视频

项目整体以“会话 + 知识库 + 生成任务”作为核心信息架构，支持桌面端和移动端使用。

## 能力统计

### 1. AI 知识库

当前前端已支持以下知识库相关能力：

- 多会话聊天
- 会话详情页
- 知识库文件上传
- 文件索引状态展示：`pending / ready / failed`
- 知识库文件列表刷新
- 知识库重建索引
- 一致性检查
- 知识库文件内容预览
- 公共会话访问与缓存
- 清空会话记录

### 2. 文生图

当前前端已支持以下文生图能力：

- 提示词输入
- 运行任务创建
- `GET /runs/:runId` 轮询
- 产品化步骤展示
- 图片产物展示
- 运行记录列表
- 通过 `runId` 直达详情页

### 3. 文生视频

当前前端已支持以下文生视频能力：

- 提示词输入
- 运行任务创建
- `GET /runs/:runId` 轮询
- 产品化步骤展示
- 视频产物展示
- 运行记录列表
- 通过 `runId` 直达详情页

## 页面入口

### 主要路由

- `/` - 会话首页
- `/chat/:sessionId` - 对话页
- `/chat-details/:sessionId` - 会话管理页
- `/public/session/:id` - 公开会话页
- `/profile` - 个人中心
- `/image-generation` - 文生图页面
- `/image-generation/:runId` - 文生图详情页
- `/video-generation` - 文生视频页面
- `/video-generation/:runId` - 文生视频详情页

### 顶部导航

当前导航提供：

- 对话
- 文生图
- 文生视频

登录后会显示 GitHub 用户信息与退出入口。

## 主要功能说明

### AI 知识库聊天

会话系统支持多轮对话，并围绕单个会话维护知识库文件。

当前能力包括：

- 会话创建、删除、清空
- 对话消息增量流式输出
- 会话公开/私有切换
- 会话系统提示词编辑
- 知识库文件上传
- 索引进度与异常状态展示
- 索引完成后再进入可检索状态
- 公开会话内容本地缓存

知识库页面会根据文件状态定时刷新，避免“上传完成但索引还没结束”的误判。

### 文生图

文生图页面以三块内容为主：

- 提示词模块
- 产品化步骤模块
- 图片产物模块

当前交互逻辑：

- 用户输入提示词后发起生成
- 页面通过轮询 `GET /runs/:runId` 获取最新状态
- 只有当任务 `status === 'succeeded'` 后，才会继续请求图片文件并展示
- `runId` 页面支持直达历史任务
- 当已带 `runId` 时，提示词只读，不允许重复提交

### 文生视频

文生视频页面与文生图保持同样的信息架构和交互习惯：

- 提示词模块
- 产品化步骤模块
- 视频产物模块

当前交互逻辑：

- 用户输入提示词后发起生成
- 页面通过轮询 `GET /runs/:runId` 获取最新状态
- 只有当任务 `status === 'succeeded'` 后，才会继续请求视频文件并展示
- `runId` 页面支持直达历史任务
- 当已带 `runId` 时，提示词只读，不允许重复提交

## 接口约定

### 鉴权

- 普通聊天、知识库、生成任务都依赖登录态
- 文生图和文生视频接口都需要携带 `Authorization: Bearer <token>`

### 基础地址

项目会根据当前环境自动切换后端地址。

- 开发环境：`http://localhost:3000/api`
- 生产环境：`https://www.adongdong.xyz/api`

相关常量在 [src/constants/index.ts](/Users/liupeidong/Desktop/myGithub/frontend-AI-Code-Review/src/constants/index.ts)

### 知识库相关

知识库相关接口主要由 `sessions` 模块提供，包含：

- 会话列表
- 会话详情
- 会话清空
- 会话管理配置更新
- 知识库文件上传、删除、列表
- 知识库重建
- 一致性检查
- 文件内容预览

### 生成相关

文生图和文生视频使用同一套生成 API 结构：

- `POST /image/runs`
- `GET /image/runs`
- `GET /image/runs/:runId`
- `GET /image/runs/:runId/artifacts`
- `GET /image/artifacts/:artifactId/file`

- `POST /video/runs`
- `GET /video/runs`
- `GET /video/runs/:runId`
- `GET /video/runs/:runId/artifacts`
- `GET /video/artifacts/:artifactId/file`

## 项目结构

```text
src/
  api/          API 请求封装
  components/   可复用 UI 组件
  constants/    固定配置与路径常量
  hooks/        业务 Hook
  pages/        页面组件
  services/     流式处理和业务服务
  store/        Zustand 状态管理
  types/        TypeScript 类型定义
```

## 技术栈

- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [Zustand](https://github.com/pmndrs/zustand)
- [React Router](https://reactrouter.com/)
- [Ant Design](https://ant.design/)
- [Lucide React](https://lucide.dev/)
- [React Markdown](https://github.com/remarkjs/react-markdown)

## 本地启动

```bash
yarn install
yarn dev
```

然后打开：

```text
http://localhost:5173
```

## 构建

```bash
yarn build
yarn preview
```

## 备注

- 文生图与文生视频页面已经做了统一的产品化步骤展示和产物展示。
- 知识库文件会根据索引状态异步刷新，不会把“上传成功”等同于“可检索成功”。
- `Profile` 页面会聚合仓库、图片生成记录和视频生成记录，方便回看历史任务。
