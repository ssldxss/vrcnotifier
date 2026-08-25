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
- **加密/凭据**: 主密钥 3 种方式 — Docker Secret(生产, 首次启动自动生成存入 `./secrets/master_key` 后自动复用) / 环境变量 `MASTER_KEY`(手动启动) / 研发模式不加密(手动 `--no-encrypt`, 或 Windows 等非容器测试环境自动不加密启动, 见「密钥与加密」); 访问令牌只存数据库; git 拉取走 HTTPS, token 仅经 askpass 传递(不落盘不进日志)
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

## 密钥与加密

**访问令牌**: 只存数据库(首次启动自动生成, 日志打印一次, 无其他来源)。

**加密主密钥 3 种方式**:
1. **Docker Secrets(生产)**: 首次启动无密钥时容器**自动生成, 保存到 Docker secrets 目录 `./secrets/master_key`**(compose 已挂载 `./secrets:/secrets`, 文件落宿主机; 之后 compose 把它作为真正的 Docker Secret 挂载, 每次启动自动复用)。手动预置 `secrets/master_key` 则直接使用该密钥, 不再生成;
2. **环境变量 `MASTER_KEY`**(64 位 hex): 手动启动时用(本地开发 `node src/index.js`), 提供时跳过自动生成;
3. **研发模式不加密**: 手动 `node src/index.js --no-encrypt` 强制明文; **非容器环境(Windows 测试/本地)无密钥时也自动以不加密方式启动**(记录 `[warn]`, 前端标题栏显示未加密提示, 敏感数据明文保存)。

- 容器内未挂载 `./secrets` 的纯 `docker run`: 首次生成的密钥兜底存数据卷 `/app/data/master_key`(0600, 下次启动自动复用)。
- 敏感数据(**VRChat 用户名 / 密码 / 会话 cookie / QQ AppSecret**)以 **AES-256-GCM** 加密落库(密文前缀 `v1:`); 每次启动日志会声明当前加密方式与密钥位置。
- **密钥不符(换环境换了密钥)/密钥损坏**: 启动时探测到密文解不开 → **静默清空数据(仅保留访问令牌)并自动重启**, 日志仅一行 `[warn] [启动] 主密钥解密失败, 已清空数据(保留访问令牌)并重启`。
- 主密钥只存在于 `./secrets/`(在 `.gitignore`, 永不进镜像/仓库)或数据卷: **密钥丢失 = 敏感数据永久无法恢复**(备份数据卷会带走密钥, 但 `./secrets/` 需另行保管)。
- git token 只经 `GIT_ASKPASS` 传递给 clone 进程, 不写入 argv、remote URL 或日志; 无 token 时匿名 clone(公有仓库可用, 有匿名限流风险)。
- 手动预置密钥(可选, 不预置则首次启动自动生成):
  ```bash
  mkdir -p secrets
  openssl rand -hex 32 > secrets/master_key && chmod 600 secrets/master_key
  printf '%s' 'ghp_你的PAT' > secrets/git_token && chmod 600 secrets/git_token  # git token(可选)
  ```

## 环境变量
`PORT` `VRC_API_URL` `VRC_WS_URL` `USER_AGENT` `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` `QQ_WS_URL` `QQ_API_BASE` `VRC_STATUS_URL` `SERVE_STATIC`(本地同源托管前端, 容器部署不使用) `MASTER_KEY`
容器引导: `VRCN_REPO` `VRCN_BRANCH` `VRCN_TOKEN`(git 认证, 可选) `FRONTEND_PORT`(默认 8080)

灵感来自shanyaojinjn/VRC-Notifier  
使用websocket代替api轮询&nbsp;&nbsp;&nbsp;解析notifier-v2消息&nbsp;&nbsp;&nbsp;没任何数据加密&nbsp;&nbsp;&nbsp;其他没什么区别(功能上)  
本来想直接改shanyaojinjn/VRC-Notifier,改不动已经废了(ssldxss/VRC-Notifier的websocket分支)  

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />