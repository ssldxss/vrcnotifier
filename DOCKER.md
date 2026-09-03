# vrcnotifier · Docker 两容器部署

将本项目拆分为 **两个容器**：

| 容器 | 镜像 | 作用 |
|---|---|---|
| 前端 | `sihenglu/vrcnotifier-frontend:latest` | nginx：对外提供静态页，并把 `/api/` 同源反代到后端（免 CORS；SSE 关闭缓冲） |
| 后端 | `sihenglu/vrcnotifier-backend:latest` | Node API：业务 + 敏感数据 AES-256-GCM 加密 |

镜像已发布到 Docker Hub：`sihenglu/vrcnotifier-frontend`、`sihenglu/vrcnotifier-backend`，标签 `latest` 与 `v0.1.0`。

---

## 一键启动

```bash
# 1) 放置主密钥文件(64 位十六进制, 或 32 字节 base64; 行尾换行无碍)
cp <你的主密钥> secrets/master_key

# 2) 启动
docker compose up -d

# 3) 访问
#    http://<主机>:80
```

- 端口：默认 80，可用 `FRONTEND_PORT=8080 docker compose up -d` 覆盖。
- 停止：`docker compose down`
- 密钥文件路径：默认 `secrets/master_key`，可用 `MASTER_KEY_FILE=... ` 覆盖。

---

## 主密钥(Docker Secret)说明

- 主密钥以 **Docker Secret** 注入到后端容器的 `/run/secrets/vrcnotifier_master_key`，**不写入镜像、不作为明文环境变量下发**。
- 后端以 `node` 用户(非 root)运行，无权直接读取 `600 root:root` 的 secret 文件，因此 `docker/entrypoint.sh` 以 root 读取该文件后注入 `MASTER_KEY`，交给 node 进程使用（与直接读文件等价）。启动日志会打印 `数据加密方式: 环境变量 MASTER_KEY`，表示密钥已生效。
- 密钥格式：64 位十六进制(32 字节)或 base64(32 字节)；读取时会去除首尾空白。
- **密钥必须与数据加密所用密钥一致**：若旧数据曾以密钥 X 加密，这里必须用 X。

## 数据与迁移(重要)

- 后端检测到"已被加密但当前密钥无法解密"的敏感数据时，会**清空敏感数据(访问令牌保留)**后退出并由 compose 自动重启。明文旧数据(未加密)会原样直通，不受影响。
- 因此：
  - 全新部署 → 默认使用命名卷 `vrcn-data`，安全。
  - 复用已有 `data/` 目录 → 在 `docker-compose.yml` 的 backend.volumes 中把 `vrcn-data:/app/data` 换成 `./data:/app/data`，并确保 `secrets/master_key` 与该数据加密所用密钥一致，否则数据会被清空。

## 本地联调(使用已构建的本地镜像)

```bash
docker compose -f docker-compose.test.yml up -d      # 前端 8090, 后端调试 127.0.0.1:3001
docker compose -f docker-compose.test.yml down
```

## 重新构建镜像

```bash
# 后端(依赖为纯 JS, 直接 COPY 本地 node_modules; 如需从零 npm install, 见 Dockerfile 注释)
docker build -t sihenglu/vrcnotifier-backend:latest .
# 前端(nginx 反代模板)
docker build -f docker/frontend/Dockerfile -t sihenglu/vrcnotifier-frontend:latest .
# 推送
docker login -u sihenglu
docker push sihenglu/vrcnotifier-backend:latest sihenglu/vrcnotifier-frontend:latest
```

> 注意：本机出网需走代理 `http://127.0.0.1:7897`。dockerd 需带该代理环境才能 pull/push；构建容器内 `npm install` 因代理在 host 环回地址(127.0.0.1)而不可达，故后端镜像直接复用 `node_modules`。

## 安全

- 后端以非 root(`node`)用户运行；数据目录 `/app/data` 由 entrypoint 修正属主。
- 主密钥不落盘进镜像、不进 compose 明文；仅经 Docker Secret + entrypoint 注入。
- 前端与后端同 compose 网络，前端是唯一对外端口(80)。

## 常用排查

```bash
docker compose ps
docker logs -f vrcnotifier-backend
docker logs -f vrcnotifier-frontend
curl http://127.0.0.1:80/api/config    # {"ok":true,...,"encryptionEnabled":true,...}
```
