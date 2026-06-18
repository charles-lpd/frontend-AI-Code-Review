# debug-sidebar-click-lag.md

[OPEN]

## 问题
PC 端和移动端点击展开/收起侧边栏时有明显延迟，控制台报错：
- [Violation] 'click' handler took 203ms
- [Violation] 'click' handler took 196ms
- [Violation] 'click' handler took 195ms

## 假设
1. 点击时触发整个会话列表重渲染。
2. Home / ChatPanel / ChatSessionNav 状态联动更新过多。
3. 响应式断点相关 class 切换触发额外布局计算。
4. click handler 闭包依赖过多，存在同步阻塞。

## 当前计划
- 给侧边栏展开/收起相关点击、渲染和列表映射加埋点
- 复现并收集运行时证据
- 根据证据做最小修复

## 已执行
- 第一轮最小优化：稳定 Home 中的 toggle/open/close 回调
- 第一轮最小优化：对 ChatSessionNav 使用 memo
- 第二轮最小优化：将会话列表渲染拆为独立 memo 组件 SessionList，减少侧边栏切换时整块列表重算
