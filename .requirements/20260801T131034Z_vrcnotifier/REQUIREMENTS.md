# VRCNotifier — REQUIREMENTS

- Date: 2026-08-01T13:10:34Z
- Feature: `vrcnotifier` (从零实现, 不参考已有 VRC-Notifier/vrc-notifier-ws 文件)
- 依据: `D:\vscode\vrc-api-ws-login-guide.md`(指南, 有已知错误需以官方文档+实测纠正) + 官方 https://vrchat.community/websocket + VRCX 架构思想 + `vrc-minimal/api-lab-example.txt` 实测数据

## 1. As Is

- 工作区存在旧项目 VRC-Notifier(轮询版)与 vrc-notifier-ws(实验版), 本次任务**不参考、不复用**它们。
- 本项目目录 `D:\vscode\vrcnotifier` 为空(新项目)。
- 环境: Node v24.15.0, npm 11.12.1, 自带 `node:sqlite`(DatabaseSync)、`node:test`、`fetch`、`node:crypto`。
- 已知协议事实(经官方文档/实测核实):
  - REST 基地址 `https://api.vrchat.cloud/api/1`; WS `wss://pipeline.vrchat.cloud/?authToken=<token>`。
  - `GET /auth` → `{ok, token:"authcookie_..."}`; token 用于 WS。
  - 登录: `GET /auth/user` 带 Basic(base64(urlencode(u):urlencode(p))); 2FA 验证端点**不带** Basic 头。
  - 好友列表 `/auth/user/friends?n=&offset=` 返回**在线+离线**全部好友(实测), 无 `state` 字段; `status` 是隐私模式非在线状态; `platform` 不可靠; **presence 以 CurrentUser 的 onlineFriends/offlineFriends/activeFriends 数组为准**, 或用 `location` 派生。
  - `location` 哨兵: `""`/`offline`/`traveling`/`private`; `private` = 在线但实例不可见(实测)。
  - WS 事件: friend-online(世界可能为空)/friend-active(字段官方文档为 `userid` 小写, 需兼容)/friend-offline(仅 userId+platform="")/friend-location(worldId 可能为 "private")/friend-update(user 为完整 User)/friend-add/friend-delete。
  - WS **无心跳无保活**; 服务端可能随时发 err 帧后关闭连接; 断线不重放、连接时不推快照。

## 2. To Be

一个可直接运行的单用户 VRChat 好友监控通知服务(本项目名 vrcnotifier):
- 登录(VRChat 账号密码 + 2FA)+ "记住我"(加密 cookie 持久化, 自动恢复会话)。
- 好友列表展示 + 每好友监控开关(在线/下线/状态变化/世界变化 四类通知细分开关); 仅状态模式(status_only_mode): 不限好友数且禁用世界变化通知; 标准模式默认最多 5 个被监控好友。
- **实时监控**: WS(pipeline)事件驱动为主, **REST 快照对账兜底**(连接/重连后基线 + 周期对账 + 无心跳 watchdog), 保证断线/漏消息场景数据正确。
- 通知渠道: 邮件(SMTP, 支持自定义 HTML/标题模板)、Gotify、NTFY、Webhook(POST/自定义 headers/body 模板), 均支持测试按钮。
- 通知类型: 上线/下线/web端上线/下线至web端/状态变化(游戏四态间)/世界切换/自定义状态; 降级转移(在线→下线/网页)带可配置延迟确认防闪烁(默认 30s), 升级即时。
- 通知去重(DB dedupe key, 覆盖 WS 与对账重叠, 防重复)。
- API 限流(每用户每类型滑窗: userProfile 1/min, friendStatus 2/min, worldInfo 6/min, auth 2/min)+ 全局保护(连续触发暂停→停止并通知, 1h 自动恢复)。
- Web UI(单页): 登录/2FA、好友列表与监控配置、通知设置、状态面板(WS 连接/上次快照/限流)。
- SSE 事件推送(会话失效、限流、WS 断线告警、通知已发)。
- 访问密钥(可选): 前端登录页门禁(与旧版一致, 不保护 API 本身, 文档说明)。
- 全部数据本地 SQLite 存储; SMTP 密码/Gotify token/cookie 用 AES-256-CBC 加密存储(密钥来自环境变量, 缺失时生成随机并在日志警告)。

## 3. Requirements

1. R1 登录与会话: 账号密码+2FA(emailOtp/totp/otp)登录; 临时会话仅存 cookie 不存密码; 记住我加密保存 cookie+用户名; 自动登录恢复。
2. R2 好友与监控配置: 拉取并缓存好友列表; 按好友配置 monitor_enabled/notify_online/notify_offline/notify_status_change/notify_world_change; 标准模式监控上限 5 人, 仅状态模式不限且禁世界变化通知。
3. R3 实时状态机: 基于 WS 事件更新好友状态; 按 R4 规则分类变化并触发通知; 状态变化带 pending-offline 防闪烁; 通知有去重键。
4. R4 通知渠道与模板: email/gotify/ntfy/webhook 四渠道; 每渠道可启用/配置/测试; 模板变量 {friendName}/{oldStatus}/{newStatus}/{oldWorld}/{newWorld}/{changeType}/{timestamp}/{oldStatusDescription}/{newStatusDescription}/{oldPlatform}/{newPlatform}。
5. R5 WS 管线: 连接(w/ UA + authToken)、断线指数退避重连(5s→60s+jitter)、重连前重取 token、帧去重、per-user 串行队列、watchdog(10min 无消息强制重连+快照)、连续失败>5min 通知用户一次。
6. R6 对账: WS 连接/重连后全量快照(CurrentUser + friends 在线/离线)重建基线并 diff; 周期 10min 对账; 状态派生以 CurrentUser 数组优先, location 兜底; 断线窗口漏报由对账补齐(通知去重防重复)。
7. R7 限流与保护: 每用户每类型滑窗限流 + 全局保护(3 次触发停止, 1h 自动复位); 429/网络错误指数退避。
8. R8 API 与 UI: 登录/登出/会话/好友/监控配置/设置/测试/状态/SSE 路由; 单页 UI 可完成全部配置; 服务可直接 `npm start` 运行。
9. R9 安全: 敏感字段加密; 错误信息脱敏; 访问密钥(可选)门禁前端。

## 4. Acceptance Criteria

- AC1 登录: 无 2FA 直接成功; 需 2FA 时返回 requires2fa 与 tempSessionId, 提交 code 后成功; 2FA 端点请求不带 Authorization; 记住我后重启进程可 auto-login 恢复。
- AC2 监控配置: 配置读写正确; 标准模式 >5 个 monitor_enabled 时只监控前 5(按配置顺序); 仅状态模式无限制且世界变化通知不发送。
- AC3 状态机: 给定 WS 事件序列, DB 状态与通知事件符合状态机表(见测试计划); pending-offline 在延迟窗口内取消则不发通知; 升级即时。
- AC4 通知: 每渠道 payload 结构正确(webhook 默认 JSON 含 event/friend/change; gotify 含 title/message/priority; ntfy 含 Title/Priority headers; email 为 HTML); 自定义模板变量替换正确; 去重键在 30s 内同变化不重复通知。
- AC5 WS: 与 mock pipeline 服务器: 能连接并解析双重编码帧; 相同帧去重; 断线后按退避重连并重新取 token; watchdog 到期触发重连; 连续失败通知一次。
- AC6 对账: 断线期间 2 个好友变化, 重连快照后补齐状态且每个变化恰好一次通知; 状态派生规则(CurrentUser 数组/location)单元测试覆盖。
- AC7 限流: 单位时间内超过配额时请求排队/延迟, 不报错; 全局保护触发后暂停并最终停止+通知; 1h 后复位(用可配置短窗口测试)。
- AC8 集成: `npm start` 后 http://localhost:PORT 可访问 UI; 用 mock VRChat API + mock pipeline 跑通: 登录→刷新好友→配置监控→推 WS 事件→收到 webhook 通知 的端到端流程。
- AC9 安全: 数据库无明文 smtp 密码/token/cookie; API 错误不泄露堆栈; 访问密钥开启时前端需输入密钥。

## 5. Testing Plan

- 单元测试(node:test):
  - location: 解析 `wrld_x:123~hidden(usr_a)~region(us)~nonce(n)`、哨兵 private/offline/traveling/""。
  - cookiejar: Set-Cookie 解析、域匹配、序列化/反序列化往返。
  - crypto: 加密→解密往返、错误密文返回 null。
  - ratelimit: 短窗口配额、排队等待、全局保护状态机。
  - state: 全部转移分类表、pending-offline 延迟/取消、状态派生函数。
  - templates: 默认与自定义模板渲染、RFC2047 标题编码。
  - db: schema 迁移、users/friends/monitor_config/settings/dedupe CRUD。
- 集成测试(本地 mock):
  - vrcapi: mock HTTP 服务器(登录/2FA/me/friends/worlds/auth), 断言请求头(Basic 编码、2FA 无 Authorization、UA)、cookie 保存。
  - notify: mock HTTP 收 gotify/ntfy/webhook; SMTP 用注入的假 transport 断言 mail 内容。
  - pipeline: ws.Server 作为 mock pipeline, 断言连接 URL/authToken/UA、双重解码分发、去重、断线重连、watchdog。
  - monitor: mock vrcapi+pipeline, 推事件断言 DB 状态+通知(webhook 捕获)与去重。
  - server: 用 mock 依赖启动 express, 断言路由行为。
- 端到端 smoke: 启动完整应用(全部 mock 外部依赖), 走 login→refresh→monitor→ws event→webhook 通知 全流程。

## 6. Implementation Plan (小步 TDD)

1. 脚手架: package.json(npm start/test/dev)、.gitignore、安装 express/ws/nodemailer; `npm test` 空跑通过。 测试: 无。
2. `src/util.js`(logger/time)。 测试: time 格式。
3. `src/location.js`。 测试: location.test.js。
4. `src/cookiejar.js`。 测试: cookiejar.test.js。
5. `src/crypto.js`。 测试: crypto.test.js。
6. `src/ratelimit.js`(含全局保护)。 测试: ratelimit.test.js(注入时钟缩短窗口)。
7. `src/templates.js`。 测试: templates.test.js。
8. `src/state.js`(状态机+派生)。 测试: state.test.js。
9. `src/db.js`(node:sqlite)。 测试: db.test.js(内存库)。
10. `src/vrcapi.js`。 测试: vrcapi.test.js(mock http)。
11. `src/notify.js`。 测试: notify.test.js(mock http + 假 transport)。
12. `src/pipeline.js`。 测试: pipeline.test.js(mock ws server)。
13. `src/monitor.js`(编排: 事件+对账+通知+去重)。 测试: monitor.test.js。
14. `src/server.js`(路由+SSE+静态)。 测试: server.test.js。
15. `src/index.js`(装配+启动)。 测试: smoke.test.js(端到端)。
16. `public/` UI(登录/好友/设置/状态)。 测试: smoke 断言静态页面可访问与 API 交互。
17. 全量 `npm test` + `npm start` 冒烟, 修复至绿。
