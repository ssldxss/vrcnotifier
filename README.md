# vrcnotifier

VRChat 好友监控与通知器(v0.1.0)——实时监听好友**上线 / 下线 / 网页端活跃 / 切换世界 / 状态变化**,以及好友请求、世界邀请、私信等站内通知,通过 **QQ 官方机器人**推送到你的手机;附带 Web 管理面板、REST 对账兜底、日志与健康监控。

- **实时优先**:WebSocket 事件驱动(notifier-v2),不做 API 轮询;每小时 REST 快照对账 + 看门狗兜底
- **通知渠道**:QQ 官方机器人(C2C 单聊,Markdown);机器人还能**回复 2FA 验证码**、重发验证码、查询在线好友列表
- **自动重登**:cookie 失效(IP 变化等)自动用已存凭据重登;会话挂起自动走 2FA 重新验证
- **数据加密**:VRChat 用户名 / 密码 / 会话 cookie / QQ AppSecret 以 **AES-256-GCM** 加密落库
- **技术栈**:Node.js ≥ 22.13(`node:sqlite`)+ Express 5 + ws;前端为纯静态单页应用,零构建
- **部署**:Docker 一条命令起全栈(官方镜像已发布),密钥首启自动自举,无需手动准备任何文件

## 快速开始(Docker,推荐)

镜像已发布到 Docker Hub:`sihenglu/vrcnotifier-backend` / `sihenglu/vrcnotifier-frontend`(`latest` 与 `v0.1.0`)。
`docker-compose.yml` 完全自举:首启自动生成主密钥 → 起后端(AES-256-GCM 加密)→ 起前端(静态页 + `/api` 同源反代),**无需任何额外文件或命令**。

```bash
# 1. 获取 docker-compose.yml(整仓克隆,或只拷这一个文件)
git clone https://github.com/ssldxss/vrcnotifier.git && cd vrcnotifier

# 2. 一条命令启动
docker compose up -d

# 3. 查看日志(首次启动会打印访问令牌,注意保存)
docker compose logs -f
```

| 入口 | 默认地址 | 覆盖方式 |
|---|---|---|
| Web 页面(前端容器) | `http://<主机>:80` | `FRONTEND_PORT=xxxx` |
| 后端 API(直连/调试) | `http://<主机>:3001` | `API_PORT=xxxx` |

自定义端口:

```bash
FRONTEND_PORT=8080 API_PORT=3002 docker compose up -d
```

**首次使用流程**:

1. 浏览器打开 `http://<主机>:80`(同源反代,门禁"后端地址"留自动预填即可;备用方式:直连后端 `http://<主机>:3001`)。
2. 门禁页填入**访问令牌**——首次启动自动生成并**只在日志里打印一次**(`docker compose logs vrcnotifier-backend` 里找"访问令牌");也可用环境变量 `ACCESS_TOKEN` 预置。
3. 登录 VRChat 账号;开启 2FA 的账号会要求输入邮箱验证码。
4. 在"设置"里配置 QQ 机器人的 **AppID / AppSecret**,启动后在 QQ 里给机器人**发任意一条消息**完成绑定。
5. 在好友列表里打开需要监控的好友开关,完成。

> ⚠️ **停服请勿用 `docker compose down -v`**:`-v` 会连同删除密钥卷 `vrcn-key` 与数据卷 `vrcn-data`。密钥一旦丢失,下次启动会生成新密钥,旧数据无法解密 → 被清空(仅访问令牌保留)。备份、迁移详见 [DOCKER.md](./DOCKER.md)。

## 功能一览

- **实时状态**:上线 / 下线 / 网页端活跃 / 切换世界 / 状态变化,30 秒防抖动确认下线
- **站内通知**:好友请求、世界邀请(解析邀请世界名)、私信、社交互动
- **QQ 推送**:Markdown 消息;同一机器人支持回复 `验证码`、`重发验证码`、任意消息查询在线好友列表
- **自动恢复**:WS 断线指数退避重连;cookie 失效自动重登;会话挂起自动 2FA;5 分钟未恢复才推送故障通知,恢复后补发说明
- **Web 面板**:好友列表(头像/信任等级/收藏分组/搜索)、逐好友通知开关、实时日志(级别/分类筛选、上下翻页)、WS 流量图、健康探测与 VRChat 官方状态
- **世界名**:无 Cookie 公共接口解析,一年缓存,失败指数退避

## 本地运行(不用 Docker)

环境:Node.js **≥ 22.13.0**(推荐 24.x,依赖 `node:sqlite` 与 `node:test`)

```bash
npm install
npm start          # 后端  http://localhost:3000
npm run frontend   # 前端  http://localhost:8080 (serve.js 静态服务)
npm test           # 全量测试(node --test, 24 个文件)
```

默认监听:后端 `3000`,前端 `8080`。
访问令牌:首次启动自动生成并打印一次,保存于数据库 `settings` 表;可用环境变量 `ACCESS_TOKEN` 指定。

## 数据加密

- 敏感数据(**VRChat 用户名 / 密码 / 会话 cookie / QQ AppSecret**)以 **AES-256-GCM** 加密落库(密文前缀 `v1:`,AAD 绑定字段与行);每次启动日志会声明当前加密方式。
- **密钥来源优先级**:① Docker Secret(`/run/secrets/vrcnotifier_master_key`,compose 自举方案默认)→ ② 环境变量 `MASTER_KEY`(64 位 hex 或 32 字节 base64)→ ③ 兜底不加密启动。
- 三种密钥来源都缺失时:默认以不加密模式启动并记录 `[warn]` 日志,前端标题栏显示未加密提示;不会因缺少密钥而无法启动。
- 检测到"已加密但当前密钥无法解密"的数据时,会清空敏感数据(访问令牌保留)后重启;明文旧数据原样直通。

## 环境变量

| 变量 | 说明 |
|---|---|
| `PORT` | 后端监听端口(镜像内固定 3000,经 compose 端口映射对外) |
| `ACCESS_TOKEN` | Web API 访问令牌(缺省自动生成) |
| `MASTER_KEY` | 加密主密钥(64 位 hex;低于 Docker Secret 优先级) |
| `VRC_API_URL` / `VRC_WS_URL` | VRChat REST / WebSocket 端点 |
| `QQ_API_BASE` / `QQ_WS_URL` | QQ 官方机器人 API / 网关 |
| `VRC_STATUS_URL` | VRChat 官方状态接口 |
| `USER_AGENT` | API 请求 UA |
| `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` | 对账/去重/看门狗参数 |
| `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` | WS 保活与重连参数 |
| `SERVE_STATIC` | 后端是否内嵌静态页(compose 中关闭,由前端容器提供) |

## 文档

- [DOCKER.md](./DOCKER.md) — Docker 部署详解:密钥自举原理、卷备份、数据迁移、镜像重建、排查
- `docker-compose.test.yml` — 自带密钥文件的本地联调 compose(前端 8090 / 后端 127.0.0.1:3001)
- `.verify/` — 运维脚本:加密自检、用户/数据状态检查

## 关于

灵感来自 [shanyaojinjn/VRC-Notifier](https://github.com/shanyaojinjn/VRC-Notifier):本项目改用 WebSocket 实时事件代替 API 轮询、解析 notifier-v2 消息,并补齐了数据加密与 QQ 机器人集成，优化了IP变化重新登录机制。

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />
