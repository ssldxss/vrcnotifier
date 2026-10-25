# 维护约定

应用保持 CommonJS 后端与原生浏览器脚本，不需要前端构建步骤。浏览器测试依赖 Playwright，仅用于开发。

## 规则与接口

- `public/contracts.js` 是好友配置、设置、稳定事件代码和 SSE 名称的共同来源；后端通过 require，浏览器通过 script 使用。
- `src/api-contract.js` 负责请求边界的严格校验与兼容别名。仓储保持内部接口，HTTP 配置修改先完整验证再写入。
- `src/client-dto.js` 明确挑选对外字段。HTTP 好友快照和 SSE 状态更新使用同一序列化函数；新增数据库列不会自动出现在 API 中。
- `public/sdk.js` 是请求和事件订阅的统一实现。面板入口只保留视图跳转相关的错误处理。具体协议见 [API.md](API.md)。
- `public/locationmodel.js` 只拆分和拼合 location；`src/location.js` 验证有效世界并解析标志，`public/instance.js` 提供展示文案。各层职责保留，基础字符串拆分共用。

## 当前状态和历史

`monitor` 写完当前好友状态后发出 `friend-state`，服务端投影为完整 DTO。它包含已确认 state、pending_state、展示状态、社交状态、签名、位置与资料；删除时携带 null。前端用完整 DTO 替换好友对象。

`friend-event` 仅用于历史动态，分类表只存该事件需要的数据，不承担当前好友状态同步。通知是否开启与是否记录历史是不同规则。HTTP 快照加载期间收到的实时更新会缓冲合并，防止较旧的 HTTP 响应覆盖新数据。

## 前端面板

`public/dashboard.js` 装配共享状态和控制器，控制器通过明确的依赖和回调协作：

| 文件 | 职责 |
| --- | --- |
| `dashboard/overview.js` | 顶部状态、本人资料、健康状态、消息速率图 |
| `dashboard/friends.js` | 好友分组、虚拟滚动、资料更新和通知配置 |
| `dashboard/feed.js` | 动态筛选、分页、列表渲染和阅读位置 |
| `dashboard/logs.js` | 后端日志筛选、游标、实时日志与补拉合并 |
| `dashboard/settings.js` | 设置表单与设置视图 |
| `dashboard/session.js` | 门禁、登录、2FA、登录进度与连接检查 |
| `dashboard/events.js` | SSE 路由、首次连接补拉与重连对账 |

纯模型文件保留可供 Node 测试的 UMD 接口。已删除没有运行调用方的旧状态派生、未读统计、图表入列及配置补丁辅助函数；相关行为通过实际使用的状态机、契约和面板测试覆盖。

## 数据库迁移

`src/migrations.js` 通过 SQLite `PRAGMA user_version` 记录迁移版本。现有无版本数据库从 0 升级，核心旧结构与历史表升级在同一事务内完成；失败时数据和版本整体回滚。高于当前程序支持的数据库版本会被拒绝打开。

历史数据扫描、类型转换和旧列迁移只执行一次。每次打开仍以 `CREATE TABLE IF NOT EXISTS` 恢复缺失的空表，不重复搬运历史数据。以后新增结构变化时在迁移列表末尾追加版本，补充旧库升级、重复打开和回滚测试，避免在仓储构造函数里追加隐式迁移。

## 验证

```sh
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:browser
```

已有 Chromium 时可使用 `CHROMIUM_PATH=/绝对路径/chrome npm run test:browser`。浏览器回归启动本地 HTTP/SSE 服务，并有独立用例直接启动 `src/index.js`、通过本地模拟 VRChat API/WebSocket 登录，验证状态更新、持久化和重启。所有测试使用内存或临时数据库，不需要真实 VRChat/QQ 账号。
