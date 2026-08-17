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
单容器: 后端 API + 前端页面同源托管(`SERVE_STATIC=1`), 数据存 volume, 开箱即用。

```bash
docker compose up -d --build   # 构建并启动
docker compose logs -f         # 首次启动会打印访问令牌(未固定 ACCESS_TOKEN 时)
```

- 打开 `http://localhost:3000`: 前端自动探测同源后端, 无需填地址; 远程访问时在门禁页把后端地址改成 `http://服务器IP:3000`
- 建议在 `docker-compose.yml` 里固定 `ACCESS_TOKEN`(长随机串), 否则每次重建数据库都会重新生成
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
6. 浏览器打开 `http://localhost:3000`(Docker Desktop 自动转发 WSL 端口)
7. 收尾: `docker compose down`(保留数据); 连数据一起删: `docker compose down -v`

## 数据加密

- 敏感数据(**VRChat 用户名 / 密码 / 会话 cookie / QQ AppSecret**)以 **AES-256-GCM** 加密落库(密文前缀 `v1:`); 每次启动日志会声明当前加密方式。
- **密钥来源优先级**: ① Docker Secret(`/run/secrets/vrcnotifier_master_key`)→ ② 环境变量 `MASTER_KEY`(64 位 hex)→ ③ 开发模式。
- Docker Secret 方式: 首次部署前生成密钥:
  ```bash
  mkdir -p secrets && openssl rand -hex 32 > secrets/master_key
  chmod 700 secrets && chmod 600 secrets/master_key
  ```
- 环境变量方式: compose 里设置 `MASTER_KEY: "64位hex"`(优先级低于 Secret; 不用 Secret 时可删掉 secrets 挂载)。
- **开发模式**(不加密所有数据, 明文存储, 手动启动参数): `docker compose run --rm vrcnotifier node src/index.js --no-encrypt`
- **密钥永不备份、不进 git**(`secrets/` 已在 `.gitignore`)。丢失密钥 = 敏感数据永久无法恢复。
- **换环境(密钥不同)/密钥损坏**: 启动时探测到密文解不开 → **静默清空数据(仅保留访问令牌)并自动重启**, 日志仅记录一行 `[warn] [startup] 主密钥解密失败, 已清空数据(保留访问令牌)并重启`。
- 三种密钥来源都缺失且未加开发参数: 启动报错退出, 不会清库。

## 环境变量
`PORT` `ACCESS_TOKEN` `VRC_API_URL` `VRC_WS_URL` `USER_AGENT` `SNAPSHOT_INTERVAL_MS` `DEDUPE_WINDOW_MS` `WATCHDOG_MS` `WATCHDOG_CHECK_MS` `WS_PING_INTERVAL_MS` `WS_PONG_TIMEOUT_MS` `RECONNECT_MAX_MS` `QQ_WS_URL` `QQ_API_BASE` `VRC_STATUS_URL` `SERVE_STATIC` `MASTER_KEY`

灵感来自shanyaojinjn/VRC-Notifier  
使用websocket代替api轮询&nbsp;&nbsp;&nbsp;解析notifier-v2消息&nbsp;&nbsp;&nbsp;没任何数据加密&nbsp;&nbsp;&nbsp;其他没什么区别(功能上)  
本来想直接改shanyaojinjn/VRC-Notifier,改不动已经废了(ssldxss/VRC-Notifier的websocket分支)  

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />