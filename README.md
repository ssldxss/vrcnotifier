# 施工中

## 项目的qq机器人为主要测试/开发的通知方法,其他方法不保证无问题  
qqbot真的很好用啊

&nbsp;

项目初步可用,还在打磨,有很多奇奇怪怪的问题  
启动&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;后端&nbsp;&nbsp;&nbsp;npm start&nbsp;&nbsp;&nbsp;前端&nbsp;&nbsp;npm run frontend  
默认监听&nbsp;&nbsp;&nbsp;后端&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3000&nbsp;&nbsp;&nbsp;&nbsp;前端&nbsp;&nbsp;&nbsp;8080&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
访问令牌: 首次启动自动生成并打印一次, 只保存于数据库 settings 表(唯一来源, 无其他读取路径)  
配置完后后端可完全独立运行(在绑定qqbot后,包括debug推送,查看在线好友列表)

## 前端
- 前端(public/, 单文件): `npm run frontend` → http://localhost:8080  


## 运行环境
Node.js ≥22.13.0(推荐 24.x, 依赖 node:sqlite 与 node:test)

## Docker 部署(最终上线方式)
单容器: 镜像**只带运行时环境**(Node 22 + git), **不含任何应用源码** —— 每次启动从 GitHub 拉取最新代码 → 安装依赖 → 同容器启动**后端 API(3000)** 与 **前端页面(8080)** 两个端口。

```bash
docker compose up -d --build   # 构建并启动
docker compose logs -f         # 每次启动打印拉取的代码版本; 首次启动还打印一次访问令牌(仅存数据库)
curl -s http://localhost:3000/api/version   # 当前运行的 git commit(分支/哈希/时间)
```

- 打开 `http://localhost:8080`: 门禁页填后端地址 `http://服务器IP:3000` 与访问令牌; 左上角显示代码版本徽章(git commit)
- **版本判断**: 容器记录启动时拉取的代码 `git commit` 哈希 —— ① 启动日志 ② `GET /api/version` ③ 前端版本徽章 ④ 容器内 `/app/.vrcn-version`。重启容器即自动更新为该分支最新提交(想固定版本可临时改 `VRCN_BRANCH` 指向 tag/分支)
- **加密/凭据**: 容器自包含 — 主密钥首次启动自动生成并随数据卷持久化, 访问令牌只存数据库(在数据卷内), **无需宿主机任何文件**(主密钥可选 Docker Secrets 覆盖, 见「密钥与加密」); git 拉取走 HTTPS, token 仅经 askpass 传递(不落盘不进日志)
- 数据: named volume `vrcnotifier-data`(数据库 `vrcnotifier.db` / 头像缓存 `avatars/` / 日志 `logs/vrcnotifier.log`); 想用宿主机目录备份就改用 `./data:/app/data`(entrypoint 会自动修属主)
- 容器以非 root(node)运行, 内置健康检查(`/api/config`), `restart: unless-stopped`
- 日志文件单文件 10MB 覆盖轮转, 每次启动以运行标识分隔

## WSL2 测试(Docker Desktop)
1. 启动 Docker Desktop, 确认启用 WSL 集成(`wsl -l -v` 查看发行版)
2. 进入 WSL: `wsl`
3. 进入仓库(Windows 盘路径跨文件系统构建较慢, 建议先 `cp -r` 到 WSL 家目录):
   ```bash
   cp -r /mnt/d/vscode/vrcnotifier ~/vrcnotifier && cd ~/vrcnotifier
   ```
4. 构建并启动: `docker compose up -d --build`
5. 看启动日志与访问令牌: `docker compose logs -f`
6. 浏览器打开 `http://localhost:8080`(前端页面, 门禁页填后端地址 `http://localhost:3000`; Docker Desktop 自动转发 WSL 端口)
7. 收尾: `docker compose down`(保留数据); 连数据一起删: `docker compose down -v`

## 密钥与加密(容器自包含, 无需宿主机文件)

**最终交付物就是容器**: `docker pull` + `docker run` 即可运行, 宿主机上不需要准备任何密钥文件 —— **访问令牌只存数据库**(首次启动自动生成, 无其他来源); 主密钥与 git token 可用 Docker Secrets / 环境变量可选覆盖(优先级更高, 用于密钥与数据分离的场景)。

| 密钥 | 来源(默认) | 可选覆盖(按优先级) |
|---|---|---|
| 数据加密主密钥(AES-256-GCM) | **首次启动自动生成**(64 位 hex), 保存到数据卷 `/app/data/master_key`(0600), 之后每次启动自动复用 | Docker Secret `vrcnotifier_master_key` → 环境变量 `MASTER_KEY` |
| API 访问令牌 | **首次启动自动生成**(日志打印一次并存库), **只存数据库, 无其他来源** | —(不提供任何覆盖) |
| GitHub Token(启动拉码) | 匿名 clone(公有仓库可用, 有匿名限流风险) | Docker Secret `vrcnotifier_git_token` → 环境变量 `VRCN_TOKEN` |

- 密钥与数据同在数据卷: **备份卷 = 密钥+数据一起带走**; 卷丢失 = 敏感数据永久无法恢复。
- 敏感数据(**VRChat 用户名 / 密码 / 会话 cookie / QQ AppSecret**)以 **AES-256-GCM** 加密落库(密文前缀 `v1:`); 每次启动日志会声明当前加密方式。
- git token 只经 `GIT_ASKPASS` 传递给 clone 进程, 不写入 argv、remote URL 或日志。
- **可选 Docker Secrets**(想要密钥与数据分离时用): 文件放 `./secrets/`(已在 `.gitignore`), compose 已声明两个 secret(`required: false`, 缺失不阻塞启动), 挂载到容器 `/run/secrets/<名称>`:
  ```bash
  mkdir -p secrets
  openssl rand -hex 32 > secrets/master_key && chmod 600 secrets/master_key
  printf '%s' 'ghp_你的PAT' > secrets/git_token && chmod 600 secrets/git_token
  ```
- **开发模式**: 手动强制明文: `node src/index.js --no-encrypt`

- 敏感数据(**VRChat 用户名 / 密码 / 会话 cookie / QQ AppSecret**)以 **AES-256-GCM** 加密落库(密文前缀 `v1:`); 每次启动日志会声明当前加密方式。
- git token 只经 `GIT_ASKPASS` 传递给 clone 进程, 不写入 argv、remote URL 或日志。
- **开发模式**: 无 Secret 文件也无 `MASTER_KEY` 时默认不加密启动(敏感数据明文保存); 也可手动强制明文: `node src/index.js --no-encrypt`
- **密钥永不备份、不进 git**(`secrets/` 已在 `.gitignore`)。丢失密钥 = 敏感数据永久无法恢复。
- **换环境(密钥不同)/密钥损坏**: 启动时探测到密文解不开 → **静默清空数据(仅保留访问令牌)并自动重启**, 日志仅记录一行 `[warn] [startup] 主密钥解密失败, 已清空数据(保留访问令牌)并重启`。
- 极端情况(数据目录不可写且无 Secret/env): 退化为不加密模式启动并记录 `[warn]` 日志, 前端标题栏显示未加密提示; 不会因密钥问题无法启动。

## 环境变量
`PORT` `VRC_API_URL` `VRC_WS_URL` `USER_AGENT` `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` `QQ_WS_URL` `QQ_API_BASE` `VRC_STATUS_URL` `SERVE_STATIC`(本地同源托管前端, 容器部署不使用) `MASTER_KEY`
容器引导: `VRCN_REPO` `VRCN_BRANCH` `VRCN_TOKEN`(git 认证, 可选) `FRONTEND_PORT`(默认 8080)

灵感来自shanyaojinjn/VRC-Notifier  
使用websocket代替api轮询&nbsp;&nbsp;&nbsp;解析notifier-v2消息&nbsp;&nbsp;&nbsp;没任何数据加密&nbsp;&nbsp;&nbsp;其他没什么区别(功能上)  
本来想直接改shanyaojinjn/VRC-Notifier,改不动已经废了(ssldxss/VRC-Notifier的websocket分支)  

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />