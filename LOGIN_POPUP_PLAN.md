# 登录改为弹窗：完整改动计划

## 1. 目标

点击"连接 GitHub"后弹出登录对话框；在对话框中打开 GitHub 授权窗口，授权成功后授权窗口自动关闭，对话框自动消失，主页面直接进入已登录状态。

## 2. 整体流程

1. 用户点击导航栏的"连接 GitHub"，或首页的"连接 GitHub，开始使用"，弹出登录对话框。
2. 用户点"使用 GitHub 登录"，前端用 `window.open` 打开 `${BACKEND}/github/auth/login`（弹出窗口，名称 `github-oauth-login`）。
3. 后端写入 `github_oauth_state` cookie，跳转 GitHub 授权页。
4. GitHub 回调后端，后端校验 state，换取 token，重定向到 `${FRONTEND_URL}/login-callback?token=<JWT>`。
5. 弹窗中的前端在渲染应用之前拦截该路径：写入 token（zustand persist 同步写入 localStorage）、通过 `postMessage` 通知主页面、调用 `window.close()` 关闭自己。
6. 主页面收到消息（或 localStorage 的 `storage` 事件兜底）后调用 `setToken`，`isAuthenticated` 变为 true，对话框自动关闭。

## 3. 前端改动（已完成）

| 文件 | 类型 | 内容 |
| --- | --- | --- |
| `src/store/useLoginDialogStore.ts` | 新增 | 登录对话框的全局开关（zustand）。 |
| `src/components/LoginDialog.tsx` | 新增 | 对话框 UI；打开授权弹窗；监听 `postMessage` 与 `storage` 事件；检测弹窗被关闭（未登录则提示"未完成登录"）；弹窗被拦截时给出提示。 |
| `src/components/LoginDialog.css` | 新增 | 对话框样式。 |
| `src/lib/loginPopup.ts` | 新增 | `handleLoginCallback()`：处理 `/login-callback` 回调；普通标签页命中则保存 token 后回首页；弹窗命中则保存、通知、关闭。常量 `AUTH_MESSAGE_TYPE`、`LOGIN_POPUP_NAME`、`LOGIN_CALLBACK_PATH`。 |
| `src/main.tsx` | 修改 | 渲染前调用 `handleLoginCallback()`，命中时只渲染"登录成功，可以关闭此窗口"，不渲染应用。 |
| `src/hooks/useAuth.ts` | 修改 | `login()` 改为打开对话框（不再整页跳转）；去掉原来的弹窗回调逻辑。 |
| `src/App.tsx` | 修改 | 挂载 `<LoginDialog />`。 |

已知的前端兼容处理：`useAuth` 中仍保留对根路径 `?token=` 的处理，用于后端尚未切换到 `/login-callback` 时的过渡。后端切换完成后可以删除这段逻辑。

## 4. 后端改动（待完成）

1. GitHub 回调成功后的重定向地址由 `${FRONTEND_URL}?token=<JWT>` 改为 `${FRONTEND_URL}/login-callback?token=<JWT>`。
2. 对接文档 `frontend-api.md` 第 4.1 节第 4 步同步修改。
3. 确认 `FRONTEND_URL` 配置正确，且生产环境域名可以访问 `/login-callback`。

## 5. 部署改动（待确认）

- 生产环境（4everland / aqiong.xyz）需要 SPA 回退，所有未知路径返回 `index.html`，否则 `/login-callback` 会 404。`/chat/...` 等路由已经依赖这一配置，通常已经具备。

## 6. 测试清单

- [ ] 点击导航栏"连接 GitHub"，弹出对话框；点击"使用 GitHub 登录"，打开授权弹窗。
- [ ] 在授权弹窗中完成 GitHub 授权后，弹窗自动关闭，对话框消失，主页面显示用户头像和名称，首页切换到已登录界面。
- [ ] 授权弹窗回到前端后不停留在首页，显示"登录成功，可以关闭此窗口"或直接关闭。
- [ ] 授权弹窗被浏览器拦截时，对话框提示允许弹窗后重试。
- [ ] 中途关闭授权弹窗（未登录）时，对话框提示"未完成登录"，可以重新打开授权窗口。
- [ ] 刷新页面后仍保持登录（token 已持久化）。
- [ ] 401 后 token 被清除，回到未登录状态。
- [ ] 直接在普通标签页打开 `/login-callback?token=...`，登录后回到首页。
- [ ] 后端切换前，旧的根路径回调仍能正常登录（过渡期）。

## 7. 风险与限制

- 授权弹窗依赖 `window.name` 或 `window.opener` 判断身份。如果浏览器对跨站 `window.close()` 有限制，弹窗会留下"登录成功，可以关闭此窗口"的提示，不影响登录结果。
- 主页面的成功判断有两条路径（`postMessage` 为主，`storage` 事件为兜底）。两者都失败时，对话框不会关闭，需要用户手动关闭对话框，刷新后即为已登录。
- 尚未在真实的 GitHub 授权流程中验证，需要本机测试。

## 8. 收尾

- 后端切换完成并验证通过后，删除 `useAuth.ts` 中对根路径 `?token=` 的过渡处理。
- 对接文档中"4.2 回调失败"的 `OAUTH_STATE_INVALID` 问题仍然存在：回调失败时后端返回 JSON 页面，弹窗中会看到 JSON。如需提示，后端可以改为重定向到 `${FRONTEND_URL}/login-callback?error=...`，前端再显示错误。这一项不在本次范围内，可单独排期。
