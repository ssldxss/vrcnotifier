# 重构验证记录

分支：`refactor/contracts-state-modules`。起点：`b8dd2f6`（原 main）。

已按 API 契约与客户端、当前状态和历史分离、共用规则、版本化迁移、前端控制器拆分分别提交。前端入口从 2400 余行缩到约 270 行；删除无运行调用方的旧辅助实现，保留现有日志分类表与缓存职责。

## 最终验证

| 验证 | 结果 |
| --- | --- |
| `npm ci` | 从锁文件安装成功 |
| `npm test` | 666 项通过，0 失败 |
| `npm run test:browser`（指定本机 Chromium） | 13 项通过，0 失败 |
| `npm audit` | 0 个已知漏洞 |
| `git diff --check` | 通过 |

运行环境：Node.js v24.19.0，Playwright 1.64.1，Chromium。测试命令与 Chromium 安装方法见 [ARCHITECTURE.md](ARCHITECTURE.md)。原基线为 665 项；重构中删除了仅覆盖废弃函数的测试，并新增契约、DTO、迁移和浏览器行为回归。

浏览器覆盖完整状态同步与历史独立、HTTP 快照覆盖实时数据的竞态、收藏筛选、保留条数科学计数法、日志补拉期间的实时消息与替换、动态列表中段及底部阅读位置、实时突发时的 DOM 上限、手机布局、登录错误、2FA 取消、筛选切换时的旧游标隔离和首次 SSE 补拉。

实际启动用例直接启动 `src/index.js` 子进程，验证静态页面、HTTP 登录、真实 WebSocket 管线到 SSE 的更新、SIGTERM 退出、磁盘数据库持久化、重启后的自动登录与历史保留。上游使用本地模拟 VRChat HTTP/WebSocket；未使用真实 VRChat 或 QQ 账号，也未读取项目运行数据库。

## 接口变化

配置修改保留 camelCase 别名兼容，统一使用 snake_case 返回；非法类型、未知字段和冲突别名返回 400。好友通知配置仅存在于嵌套 `config`。历史分页总数保持完整筛选语义，游标模式明确标记。具体约定见 [API.md](API.md)。

开发依赖新增 Playwright；锁文件同时更新现有依赖范围内的 body-parser、content-type、proxy-addr 与 qs，消除了安装时发现的依赖审计问题。生产依赖清单仍为 Express 与 ws。
