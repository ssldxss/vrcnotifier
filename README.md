⚠️ **【重要】VRChat 官方 API 近期调整，好友资料不再返回头像缩略图字段，导致旧版本的好友头像无法加载（自己的头像正常）。其他受影响范围正在评估中。请及时更新到最新镜像修复：`docker compose pull && docker compose up -d`。**

# vrcnotifier

VRChat 好友监控与通知器(v0.1.0):WebSocket 实时好友**上线 / 下线 / 切换世界 / 状态变化**+ 站内通知(仅推送邀请、戳一戳、群组公告,可在设置页分别开关,公告自动解析群组名),经 **QQ bot**推送到手机(机器人还可回复 2FA 验证码、查在线好友列表);自动恢复(cookie 失效自动重登、会话挂起自动 2FA、WS 自动重连);Web 面板、REST 对账、日志监控。敏感数据(VRChat 用户名/密码/cookie、QQ AppSecret)AES-256-GCM 加密落库。

## 快速开始(Docker)

**单容器**:面板与 API 由同一个镜像、同一个端口提供(同源),不需要单独的前端容器。  
~~不知道为什么当时要分成两个容器,可能是为了ngxin的压缩吧,感觉纯闲的没事~~

将以下内容保存为 `docker-compose.yml`:

> 完整文件见仓库根目录 [`docker-compose.yml`](./docker-compose.yml)(含逐项注释)。

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

  # 面板 + API(同一进程、同一端口)
  vrcnotifier-backend:
    image: sihenglu/vrcnotifier-backend:latest
    restart: unless-stopped
    depends_on:
      vrcn-keygen:
        condition: service_completed_successfully
    environment:
      PORT: "3000"
      SERVE_STATIC: "1"        # 托管 public/ 静态页, 与 /api 同源
      TZ: Asia/Shanghai
    volumes:
      - vrcn-key:/run/secrets  # 主密钥
      - vrcn-data:/app/data    # 数据文件
    ports:
      - "${API_PORT:-3000}:3000"  # 面板 + API 端口
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s

volumes:
  vrcn-key:
  vrcn-data:
```

```bash
docker compose up -d
docker compose logs vrcnotifier-backend | grep 访问令牌   # 访问令牌: 首启自动生成, 只打印一次
```

打开 `http://<主机>:3000`:填访问令牌 → 登录 VRChat(2FA 需邮箱验证码)→ 设置填 QQ AppID/AppSecret、QQ 里给机器人发任意一条消息完成绑定 → 好友列表开监控开关,完成。

门禁页的「后端地址」会自动预填为当前页面地址(同源),正常只需填令牌即可。

### 更新到新版本

```bash
docker compose pull        # 拉取最新镜像
docker compose up -d       # 用新镜像重建容器
docker compose ps          # 确认 healthy
docker compose logs -f     # 需要时看启动日志
```

> 更新只替换镜像,`vrcn-key`(密钥)与 `vrcn-data`(数据)两个命名卷**原样保留**,数据不会丢。
> 只有当 `docker-compose.yml` 本身有变更时才需要替换该文件;单纯升级镜像不用改 yaml。

### 停止

```bash
docker compose down        # 停止(保留卷)
```

> **勿用 `docker compose down -v`**(会删密钥+数据卷,旧数据不可恢复)。备份/迁移/镜像重建见 [DOCKER.md](./DOCKER.md)。

> 门禁页仍支持手填后端地址与端口,因此「前端与后端分开部署」的旧用法依然可用;但推荐的部署方式是上面的单容器方案——面板与 API 永远同版本。

## 本地运行

Node.js ≥ 22.13.0(推荐 24.x,依赖 node:sqlite):

```bash
npm install
SERVE_STATIC=1 npm start     # 面板 + API 同源 :3000(与容器行为一致)
```

前后端分开跑(开发用,可选):

```bash
npm start                    # 仅 API :3000(不设 SERVE_STATIC 时只提供 API)
npm run frontend             # 纯静态托管 public/ :8080,门禁里手填 http://127.0.0.1:3000
```

## 加密与密钥

密钥优先级:Docker Secret(首启自动生成,存 `vrcn-key` 卷)→ 环境变量 `MASTER_KEY`(64 位 hex)→ 不加密启动(有提示)。密钥丢失/不匹配时已加密数据被清空(访问令牌保留);明文旧数据直通。

## 数据与安全

本项目将存储 VRChat 的用户名/密码和 cookies 信息;存储的密码可在 IP 变化等场景下重新登录,实现免 2FA、无需人工干预的自动重登

本项目与 VRChat 官方无关

## 环境变量

`PORT` `ACCESS_TOKEN` `MASTER_KEY` `VRC_API_URL` `VRC_WS_URL` `QQ_API_BASE` `QQ_WS_URL` `VRC_STATUS_URL` `USER_AGENT` `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` `SERVE_STATIC` `LOG_SEGMENT_MB` `LOG_MAX_FILES`

## 日志文件

后端日志写入 `data/logs/`:分段存储,一段一个文件,以创建时间命名(`vrcnotifier-20260909-120000-123.log`)。每次启动开新段;单段写满 `LOG_SEGMENT_MB`(默认 2MB)后开新段;总段数达到 `LOG_MAX_FILES`(默认 6)时删除最老的段,即「覆盖最老日志」。历史可跨重启在 Web 面板日志页翻阅(面板最多驻留 5000 行,更早的随滚动加载)。终端(`docker compose logs`)始终保留全量明文输出。

## 文档

- [DOCKER.md](./DOCKER.md) — Docker 详解:密钥自举、卷备份、数据迁移、镜像更新与重建
- `docker-compose.test.yml` — 自带密钥文件的联调 compose(面板 8090 / 本机调试 127.0.0.1:3001)

灵感来自 [shanyaojinjn/VRC-Notifier](https://github.com/shanyaojinjn/VRC-Notifier):改用 WebSocket 实时事件 + 数据加密 + QQ 机器人集成。

鉴定为玩vrc玩的

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />

也就只能写写readme了
