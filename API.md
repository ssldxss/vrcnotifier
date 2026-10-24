# HTTP 与实时接口约定

默认与面板同源部署。除 `GET /api/config`、`POST /api/access/verify` 外，所有 `/api` 请求（包括登录与 2FA）都需要 `Authorization: Bearer <access_token>`。SSE 和头像请求也接受 `?token=`。访问令牌和 VRChat 登录会话是两个独立条件；要求登录的接口在无会话时返回 401。

成功响应保留现有 `{ ok: true, ... }` 形状，错误响应为 `{ error: "说明" }`，使用相应 HTTP 状态码。浏览器面板与 Node 客户端共用 `public/sdk.js`；SDK 非 2xx 抛 `ApiError`（`status`、`data`）。

## 配置补丁

`PUT /api/friends/:friendId/config` 和 `PUT /api/settings` 都采用补丁语义：未传字段保持原值。字段以 snake_case 为标准，兼容 `public/contracts.js` 中列出的 camelCase 别名；响应只使用 snake_case。未知字段、冲突别名、非法类型返回 400，整个补丁不写入。

好友配置：`favorite`、`notify_online`、`notify_web_online`、`notify_offline`、`notify_status_change`、`notify_world_change`。开关接受 JSON `true/false` 或整数 `0/1`，响应为 `0/1`。例如原样提交 GET 返回的开关即可，配置中的只读 `friend_vrchat_id` 不可提交。

全局设置：`qq_enabled`、`notify_group_announcement`、`notify_boop`、`notify_invite` 为开关；`qq_app_id`、`qq_app_secret` 为字符串或 null（空串清空）；`friend_event_limit` 为安全正整数或 null（不限制）。数字字符串与小数均不接受。读取时密钥用 `••••••••` 表示，提交此占位值保留原密钥。

## 好友动态分页

`GET /api/friend-events`：`limit` 默认 50，上限 200；`types` 为逗号分隔的稳定事件代码，省略表示全部，空串表示无类型；`friendId`、`q`、`favorite=1` 为筛选条件；`order=asc|desc`，默认 desc。

- 页码模式：`page` 从 1 开始，缺省为 1。响应 `pagination: "page"`、`page`、`pageSize`。
- 游标模式：传 `before=<上次 nextBefore>`；asc 时查更大 ID，desc 时查更小 ID。响应 `pagination: "cursor"`、`page: null`。`before` 与 `page` 互斥，必须为安全正整数。
- 两种模式的 `total` 都是同一套筛选条件下的总数，不随游标缩小；`hasMore` 表示还有后续数据，`nextBefore` 是下一次游标，没有后续时为 null。实时写入时总数可变，连续加载宜用游标。

`events[].type_code` 为稳定英文代码，`type` 为兼容的中文展示标签。名字与头像通过当前好友资料和缓存关联，不是历史快照。`DELETE /api/friend-events` 清空动态。

## 事件与数据保留

`GET /api/events` 为 SSE，事件名称由 `public/contracts.js` 定义。它不支持历史重放；客户端首次连接和重新连接后需要通过 HTTP 补拉。`friend-event` 只表示历史动态，不能作为当前好友状态的完整来源。

登出或更换 VRChat 账号会清理该账号的好友、好友动态、通知去重和用户信息；QQ 设置与绑定为全局数据，除非选择彻底重置。历史设计文稿不代表当前接口契约。
