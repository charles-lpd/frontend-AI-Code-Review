# debug-mobile-sidebar-profiling.md

[OPEN]

## 问题
打开移动端侧边栏时出现：
- [Violation] 'click' handler took 208ms

## 已知条件
- 点击按钮只执行 `setMobileNavOpen(true)`
- `handleMobileOpen` 已使用 `useCallback`
- `Home` 会因为 `mobileNavOpen` 变化而重新渲染
- `ChatSessionNav` 会收到 `mobileOpen=true`
- 侧边栏通过 `transform: translateX()` 做滑入动画
- 会渲染 `SessionList` 和多个 `NavLink`

## 假设
1. React render 链路是主耗时来源。
2. CSS 导致额外 style/layout/paint 成本。
3. SessionList / NavLink 在每次打开时存在线性重算。
4. 浏览器扩展或第三方脚本抢占主线程。
5. 真实瓶颈在浏览器渲染流水线而非 click 业务逻辑。

## 计划
- 采集 React 组件级 render duration
- 采集点击打开前后的高精度时间点
- 结合浏览器 Performance Timeline 判定 render/style/layout/paint 占比
- 汇总 top 耗时组件 / 函数 / 阶段

## 当前证据
- `performance.mark('sidebar-open-click-start')` 与 `sidebar-close-click-start` 已成功记录，说明点击路径已进入回调。
- `window.__SIDEBAR_PROFILE__` 为空，说明第一版 React Profiler 结果没有成功输出到全局桶，当前不能直接作为结论依据。
- 已补充同步埋点桶 `window.__SIDEBAR_SYNC_PROFILE__`，直接记录 Home / ChatSessionNav / SessionList 的 render-start 证据。
