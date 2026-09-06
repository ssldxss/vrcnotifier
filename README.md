# vrcnotifier

VRChat 好友监控与通知器(v0.1.0):WebSocket 实时监听好友**上线 / 下线 / 切换世界 / 状态变化**及站内通知(好友请求、邀请、私信),通过 **QQ 官方机器人**推送到手机;附 Web 面板、REST 对账、日志与健康监控。

- 实时优先:WebSocket 事件驱动,不做 API 轮询;每小时 REST 快照对账 + 看门狗兜底
- QQ 机器人还能**回复 2FA 验证码**、重发验证码、查询在线好友列表
- 自动恢复:cookie 失效自动重登、会话挂起自动 2FA、WS 断线自动重连
- 敏感数据(VRChat 用户名/密码/cookie、QQ AppSecret)AES-256-GCM 加密落库
- Docker 一条命令起全栈,官方镜像已发布,密钥首启自动自举

## 快速开始(Docker)

镜像:Docker Hub `sihenglu/vrcnotifier-backend` / `sihenglu/vrcnotifier-frontend`(`latest` / `v0.1.0`)。
起来后三个容器:`vrcn-keygen`(一次性,首启生成主密钥即退出)/ `vrcnotifier-backend`(业务与日志)/ `vrcnotifier-frontend`(nginx 反代)。

**第 1 步**:把下面内容保存为 `docker-compose.yml`(单文件,完整可用):

```yaml
name: vrcnotifier

services:
  # 一次性主密钥生成: 仅首启生成, 之后复用; 密钥写入命名卷 vrcn-key
  vrcn-keygen:
    image: sihenglu/vrcnotifier-backend:latest
    entrypoint: []
    command:
      - sh
      - -c
      - |
        K=/data/vrcnotifier_master_key
        if [ ! -s "$$K" ]; then
          node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))' > "$$K"
          chmod 600 "$$K"
          echo "vrcn-keygen: 已生成新的主密钥(32 字节)"
        else
          echo "vrcn-keygen: 检测到已有主密钥, 保持不变"
        fi
    volumes:
      - vrcn-key:/data
    network_mode: "none"
    restart: "no"

  # 后端 API(Node.js)
  vrcnotifier-backend:
    image: sihenglu/vrcnotifier-backend:latest
    restart: unless-stopped
    depends_on:
      vrcn-keygen:
        condition: service_completed_successfully
    environment:
      PORT: "3000"
      SERVE_STATIC: ""
      TZ: Asia/Shanghai
    volumes:
      - vrcn-key:/run/secrets    # 持久化: 主密钥(首启自动生成)
      - vrcn-data:/app/data      # 持久化: 数据文件(SQLite 数据库、头像缓存、日志), 备份/迁移就是这两个卷
    ports:
      - "${API_PORT:-3001}:3000" # 对外 API 端口, 默认 3001; 改端口: API_PORT=3002 docker compose up -d
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks: [vrcnet]

  # 前端(nginx: 静态页 + /api 反代)
  vrcnotifier-frontend:
    image: sihenglu/vrcnotifier-frontend:latest
    restart: unless-stopped
    depends_on:
      vrcnotifier-backend:
        condition: service_healthy
    environment:
      BACKEND_HOST: vrcnotifier-backend
      BACKEND_PORT: "3000"
      TZ: Asia/Shanghai
    ports:
      - "${FRONTEND_PORT:-80}:80"  # 对外页面端口, 默认 80; 改端口: FRONTEND_PORT=8080 docker compose up -d
    networks: [vrcnet]

volumes:
  vrcn-key:
  vrcn-data:

networks:
  vrcnet:
```

**第 2 步**:启动,并从**后端容器**日志取访问令牌(首次启动自动生成,只打印一次):

```bash
docker compose up -d
docker compose logs vrcnotifier-backend | grep 访问令牌
```

**第 3 步**:浏览器打开 `http://<主机>:80`(页面默认端口,可用 `FRONTEND_PORT` 改)→ 门禁页填访问令牌 → 登录 VRChat(开 2FA 的账号需邮箱验证码)→ 设置里填 QQ 机器人 AppID/AppSecret → QQ 里给机器人**发任意一条消息**完成绑定 → 好友列表打开要监控的开关,完成。

> ⚠️ 停服用 `docker compose down`(保留卷);**勿用 `down -v`**——会删除密钥卷与数据卷,旧数据将被清空(仅访问令牌保留)。备份、迁移详见 [DOCKER.md](./DOCKER.md)。

## 功能

- 实时状态:上线 / 下线 / 网页端活跃 / 切换世界 / 状态变化(下线 30 秒防抖动)
- 站内通知:好友请求、世界邀请(解析世界名)、私信、社交互动
- QQ 推送:Markdown;机器人可回复 `验证码` / `重发验证码` / 任意消息查在线好友列表
- 自动恢复:WS 断线指数退避重连、cookie 失效自动重登、会话挂起自动 2FA、5 分钟未恢复才推故障通知
- Web 面板:好友列表(头像/信任等级/收藏/搜索)、逐好友通知开关、实时日志、WS 流量图、VRChat 健康状态
- 世界名:无 Cookie 公共接口解析,一年缓存

## 本地运行(不用 Docker)

Node.js **≥ 22.13.0**(推荐 24.x,依赖 `node:sqlite`):

```bash
npm install
npm start          # 后端  http://localhost:3000
npm run frontend   # 前端  http://localhost:8080
npm test           # 全量测试
```

## 数据与安全

- 敏感数据(VRChat 用户名/密码/cookie、QQ AppSecret)以 **AES-256-GCM** 加密落库(密文前缀 `v1:`)。
- 密钥来源优先级:Docker Secret(compose 自举默认)→ 环境变量 `MASTER_KEY`(64 位 hex)→ 不加密启动(日志与前端提示)。
- 密钥丢失/不匹配时,已加密数据解不开会被清空(访问令牌保留);明文旧数据原样直通。
- 为什么要存储用户名和密码：在ip发生变化等情况可无需f2a重新登录，减少人工干预（使用过期的cookies加用户加名密码可无需f2a重新登录）


## 环境变量

`PORT` `ACCESS_TOKEN` `MASTER_KEY` `VRC_API_URL` `VRC_WS_URL` `QQ_API_BASE` `QQ_WS_URL` `VRC_STATUS_URL` `USER_AGENT` `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` `SERVE_STATIC`

## 文档

- [DOCKER.md](./DOCKER.md) — Docker 详解:密钥自举、卷备份、数据迁移、镜像重建
- `docker-compose.test.yml` — 自带密钥文件的联调 compose(前端 8090 / 后端 127.0.0.1:3001)

灵感来自 [shanyaojinjn/VRC-Notifier](https://github.com/shanyaojinjn/VRC-Notifier):改用 WebSocket 实时事件 + 数据加密 + QQ 机器人集成。

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />
