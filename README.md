# 施工中

## 项目的qq机器人为主要测试/开发的通知方法,其他方法不保证无问题  
qqbot真的很好用啊

&nbsp;

项目初步可用,还在打磨,有很多奇奇怪怪的问题  
启动&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;后端&nbsp;&nbsp;&nbsp;npm start&nbsp;&nbsp;&nbsp;前端&nbsp;&nbsp;npm run frontend  
默认监听&nbsp;&nbsp;&nbsp;后端&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3000&nbsp;&nbsp;&nbsp;&nbsp;前端&nbsp;&nbsp;&nbsp;8080&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
访问令牌: 首次启动自动生成并打印一次, 保存于数据库 settings 表, 可用环境变量 ACCESS_TOKEN 指定  
配置完后后端可完全独立运行(在绑定qqbot后,包括debug推送,查看在线好友列表)

## 前端
- 前端(public/, 单文件): `npm run frontend` → http://localhost:8080  


## 运行环境
Node.js ≥22.13.0(推荐 24.x, 依赖 node:sqlite 与 node:test)

## Docker 部署(最终上线方式)
单容器: 镜像**只带运行时环境**(Node 22 + git), **不含任何应用源码** —— 每次启动从 GitHub 拉取最新代码 → 安装依赖 → 同容器启动**后端 API(3000)** 与 **前端页面(8080)** 两个端口。

```bash
docker compose up -d --build   # 构建并启动
docker compose logs -f         # 每次启动打印拉取的代码版本; 首次还打印访问令牌(未固定 ACCESS_TOKEN 时)
curl -s http://localhost:3000/api/version   # 当前运行的 git commit(分支/哈希/时间)
```

- 打开 `http://localhost:8080`: 门禁页填后端地址 `http://服务器IP:3000` 与访问令牌; 左上角显示代码版本徽章(git commit)
- **版本判断**: 容器记录启动时拉取的代码 `git commit` 哈希 —— ① 启动日志 ② `GET /api/version` ③ 前端版本徽章 ④ 容器内 `/app/.vrcn-version`。重启容器即自动更新为该分支最新提交(想固定版本可临时改 `VRCN_BRANCH` 指向 tag/分支)
- **加密/凭据**: 三把密钥(主密钥/访问令牌/git token)**一律优先 Docker Secrets** 存放(`./secrets/` 文件, 见「密钥与加密」); 环境变量只是兜底; git 拉取走 HTTPS, token 仅经 askpass 传递(不落盘不进日志)
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

## 密钥与加密(Docker Secrets 优先)

三把密钥**一律优先用 Docker Secrets 存放**: 文件放 `./secrets/`(已在 `.gitignore`, 永不进镜像/仓库), compose 挂载到容器 `/run/secrets/<名称>`; 文件缺失时回退环境变量, 再缺失走内置兜底。

| 密钥 | Secret 名称 | 文件 | 兜底环境变量 | 最终兜底 |
|---|---|---|---|---|
| 数据加密主密钥(AES-256-GCM) | `vrcnotifier_master_key` | `secrets/master_key` | `MASTER_KEY`(64 位 hex) | 不加密启动(记录 warn) |
| API 访问令牌 | `vrcnotifier_access_token` | `secrets/access_token` | `ACCESS_TOKEN` | 首次启动自动生成(日志打印并存库) |
| GitHub Token(启动拉码) | `vrcnotifier_git_token` | `secrets/git_token` | `VRCN_TOKEN` | 匿名 clone(仅公有仓库, 有匿名限流风险) |

首次部署前生成(本仓库已备好 `master_key` 与 `access_token`):
```bash
mkdir -p secrets
openssl rand -hex 32 > secrets/master_key     # 数据加密主密钥
openssl rand -hex 32 > secrets/access_token   # 访问令牌(任意长随机串)
printf '%s' 'ghp_你的PAT' > secrets/git_token # GitHub PAT(可选: 私有仓库/避免限流)
chmod 600 secrets/*
```

- 敏感数据(**VRChat 用户名 / 密码 / 会话 cookie / QQ AppSecret**)以 **AES-256-GCM** 加密落库(密文前缀 `v1:`); 每次启动日志会声明当前加密方式与访问令牌来源。
- git token 只经 `GIT_ASKPASS` 传递给 clone 进程, 不写入 argv、remote URL 或日志。
- **开发模式**: 无 Secret 文件也无 `MASTER_KEY` 时默认不加密启动(敏感数据明文保存); 也可手动强制明文: `node src/index.js --no-encrypt`
- **密钥永不备份、不进 git**(`secrets/` 已在 `.gitignore`)。丢失密钥 = 敏感数据永久无法恢复。
- **换环境(密钥不同)/密钥损坏**: 启动时探测到密文解不开 → **静默清空数据(仅保留访问令牌)并自动重启**, 日志仅记录一行 `[warn] [startup] 主密钥解密失败, 已清空数据(保留访问令牌)并重启`。
- 三种密钥来源都缺失时: 默认以不加密模式启动并记录 `[warn]` 日志，前端标题栏也会显示未加密提示；不会因缺少密钥而无法启动。

## 环境变量
`PORT` `ACCESS_TOKEN` `VRC_API_URL` `VRC_WS_URL` `USER_AGENT` `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` `QQ_WS_URL` `QQ_API_BASE` `VRC_STATUS_URL` `SERVE_STATIC`(本地同源托管前端, 容器部署不使用) `MASTER_KEY`
容器引导: `VRCN_REPO` `VRCN_BRANCH` `VRCN_TOKEN`(git 认证, 可选) `FRONTEND_PORT`(默认 8080)

灵感来自shanyaojinjn/VRC-Notifier  
使用websocket代替api轮询&nbsp;&nbsp;&nbsp;解析notifier-v2消息&nbsp;&nbsp;&nbsp;没任何数据加密&nbsp;&nbsp;&nbsp;其他没什么区别(功能上)  
本来想直接改shanyaojinjn/VRC-Notifier,改不动已经废了(ssldxss/VRC-Notifier的websocket分支)  

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />