# vrcnotifier

VRChat 好友监控与通知器(v0.1.0):WebSocket 实时好友**上线 / 下线 / 切换世界 / 状态变化**+ 站内通知(好友请求、邀请、私信),经 **QQ 官方机器人**推送到手机(机器人还可回复 2FA 验证码、查在线好友列表);自动恢复(cookie 失效自动重登、会话挂起自动 2FA、WS 自动重连);Web 面板、REST 对账、日志监控。敏感数据(VRChat 用户名/密码/cookie、QQ AppSecret)AES-256-GCM 加密落库。

## 快速开始(Docker)

docker-compose.yml

```yaml
name: vrcnotifier

services:
  # 一次性主密钥生成器，密钥写入命名卷 vrcn-key
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
      - vrcn-key:/run/secrets    # 主密钥
      - vrcn-data:/app/data      # 数据文件
    ports:
      - "${API_PORT:-3000}:3000" # API 端口
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
      - "${FRONTEND_PORT:-8080}:80"  # 前端端口
    networks: [vrcnet]

volumes:
  vrcn-key:
  vrcn-data:

networks:
  vrcnet:
```

```bash
docker compose up -d
docker compose logs vrcnotifier-backend | grep 访问令牌   # 访问令牌: 首启自动生成, 只打印一次
```

打开 `http://<主机>:8080`:填访问令牌 → 登录 VRChat(2FA 需邮箱验证码)→ 设置填 QQ AppID/AppSecret、QQ 里给机器人发任意一条消息完成绑定 → 好友列表开监控开关,完成。

> 停服用 `docker compose down`;**勿用 `down -v`**(删密钥+数据卷,旧数据不可恢复)。备份/迁移/镜像重建见 [DOCKER.md](./DOCKER.md)。

## 本地运行

Node.js ≥ 22.13.0(推荐 24.x,依赖node:sqlite): \
`npm install` \
`npm start`(后端 :3000) \
`npm run frontend`(前端 :8080)

## 加密与密钥

密钥优先级:Docker Secret(首启自动生成,存 `vrcn-key` 卷)→ 环境变量 `MASTER_KEY`(64 位 hex)→ 不加密启动(有提示)。密钥丢失/不匹配时已加密数据被清空(访问令牌保留);明文旧数据直通。

## 环境变量

`PORT` `ACCESS_TOKEN` `MASTER_KEY` `VRC_API_URL` `VRC_WS_URL` `QQ_API_BASE` `QQ_WS_URL` `VRC_STATUS_URL` `USER_AGENT` `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` `SERVE_STATIC`

## 文档

- [DOCKER.md](./DOCKER.md) — Docker 详解:密钥自举、卷备份、数据迁移、镜像重建
- `docker-compose.test.yml` — 自带密钥文件的联调 compose(前端 8090 / 后端 127.0.0.1:3001)

灵感来自
 [shanyaojinjn/VRC-Notifier](https://github.com/shanyaojinjn/VRC-Notifier):改用 WebSocket 实时事件 + 数据加密 + QQ 机器人集成。

鉴定为玩vrc玩的

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />

也就只能写写readme了
