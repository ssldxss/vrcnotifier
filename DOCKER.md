# vrcnotifier · Docker 一键部署(单 yaml 自举)

本项目是 **一个常驻容器 + 一个一次性密钥生成器**,全部由 **一个 `docker-compose.yml`** 驱动,**无需任何额外密钥文件或命令**:

| 角色 | 镜像 | 作用 |
|---|---|---|
| 应用 | `sihenglu/vrcnotifier-backend:latest` | Node:Web 面板(`public/` 静态页) + REST/SSE API **同源同端口**;业务数据 AES-256-GCM 加密 |
| 密钥生成 | `sihenglu/vrcnotifier-backend:latest`(复用) | 一次性容器 `vrcn-keygen`:首启随机生成 32 字节主密钥写入命名卷,之后每次启动复用 |

镜像已发布到 Docker Hub:`sihenglu/vrcnotifier-backend`,标签 `latest` 与 `v0.1.0`。密钥生成复用主镜像,**不额外拉取任何镜像**。

> **已下架**:`sihenglu/vrcnotifier-frontend`(nginx 静态 + `/api` 反代)不再构建/发布。Docker Hub 上的历史镜像仍可拉取,供旧的双容器 compose 过渡使用;新部署请用下面的单容器方案。

---

## 一键启动

```bash
docker compose up -d                 # 默认: 面板 + API 同源 3000
# 或指定端口:
API_PORT=8080 docker compose up -d
```

- 首次启动:`vrcn-keygen` 自动生成主密钥 → 应用带加密启动(healthy)。
- 访问:浏览器开 `http://<主机>:3000`(`API_PORT` 可覆盖)。面板与 API 同源,门禁页的「后端地址」会自动预填,**正常只需填访问令牌**。
- 停止:`docker compose down`(**保留** 密钥卷与数据卷)。
- 日志:`docker compose logs -f`。
- 查看访问令牌(首启只打印一次):`docker compose logs vrcnotifier-backend | grep 访问令牌`。

**不需要**再手动放置密钥文件——密钥在首启时由 `vrcn-keygen` 随机生成并保存在命名卷 `vrcn-key` 里。

---

## 更新到新版本

```bash
docker compose pull            # 1) 拉取最新镜像
docker compose up -d           # 2) 用新镜像重建容器
docker compose ps              # 3) 确认状态 healthy
docker compose logs -f         # 4) 需要时观察启动日志
```

要点:

- **数据与密钥不受影响**:`vrcn-key` 与 `vrcn-data` 是命名卷,`pull`/`up` 不会动它们;`down`(不带 `-v`)也不会。
- **只在 yaml 变更时才需要替换 `docker-compose.yml`**;单纯升级镜像不用改文件。
- 想确认当前跑的是哪个版本:`docker inspect --format '{{.Config.Image}}' $(docker compose ps -q vrcnotifier-backend)`,或看面板设置页的版本信息。
- 固定版本(不用 `latest`):把 compose 里的 `image:` 改成 `sihenglu/vrcnotifier-backend:v0.1.0` 之类的具体 tag 再 `up -d`。
- ⚠️ 任何情况下都**不要**加 `-v`:那会删掉密钥卷与数据卷。

### 从旧的双容器方案迁移过来

旧版 compose 是「`vrcnotifier-frontend`(nginx) + `vrcnotifier-backend`」两个服务。迁移只需换成单容器 compose:

1. 用仓库根目录的新 [`docker-compose.yml`](./docker-compose.yml) 替换旧文件。
2. `docker compose up -d --remove-orphans`(`--remove-orphans` 顺手清掉已下线的 frontend 容器)。
3. 端口从 `8080` 变为 `3000`(`API_PORT` 可覆盖),浏览器换到新端口即可。
4. `vrcn-key` / `vrcn-data` 卷名不变,**数据与密钥原样沿用**,不需要重新登录或重新配置。

---

## 主密钥如何自举(单文件方案)

1. **首启**:一次性容器 `vrcn-keygen`(复用主镜像,自带 `node crypto`)在命名卷 `vrcn-key` 内生成 32 字节随机密钥,写入 `vrcnotifier_master_key`(`600` 权限),然后退出。
2. **应用**:compose 把 `vrcn-key` 卷挂载到 `/run/secrets`,密钥落在 `/run/secrets/vrcnotifier_master_key`。应用以 `node` 用户(非 root)运行、无权读 `600 root:root` 文件,故 `docker/entrypoint.sh` 以 root 读取后注入 `MASTER_KEY` 环境变量交给进程。启动日志打印 `数据加密方式: 环境变量 MASTER_KEY` 即表示密钥已生效。
3. **之后每次启动**:`vrcn-keygen` 检测到卷内已有密钥 → **保持不变**(不重生成),应用用同一把密钥解密历史数据。

> 密钥不落 yaml、不落 host 文件,只存在于 docker 命名卷 `vrcn-key` 中。

## ⚠️ 卷与备份(务必知悉)

- **停服请勿用 `docker compose down -v`**:`-v` 会删除 `vrcn-key`(密钥) 与 `vrcn-data`(数据) 两个命名卷。密钥一旦丢失,下次 `up` 会生成**新**密钥,旧数据解不开 → 被清空(仅访问令牌保留)。
- **备份密钥**(从卷导出到 host):
  ```bash
  docker run --rm --entrypoint sh -v vrcnotifier_vrcn-key:/data sihenglu/vrcnotifier-backend:latest \
    -c 'cat /data/vrcnotifier_master_key' > ~/vrcnotifier_master_key.bak
  chmod 600 ~/vrcnotifier_master_key.bak
  ```
- **备份数据**(导出 `vrcn-data` 卷):
  ```bash
  docker create --name vrcn_tmp -v vrcnotifier_vrcn-data:/d sihenglu/vrcnotifier-backend:latest
  docker cp vrcn_tmp:/d ./vrcnotifier_data_backup && docker rm vrcn_tmp
  ```
- 默认卷名:项目名 `vrcnotifier` → `vrcnotifier_vrcn-key` / `vrcnotifier_vrcn-data`(若用 `COMPOSE_PROJECT_NAME` 改名会随之变化)。

## 数据与迁移(重要)

- 应用检测到"已被加密但当前密钥无法解密"的敏感数据时,会**清空敏感数据(访问令牌保留)**后退出并由 compose 自动重启。明文旧数据(未加密)会原样直通,不受影响。
- **全新部署** → 默认命名卷 `vrcn-data` + 首启自动生成密钥,安全,直接 `docker compose up -d`。
- **迁移"已有且已加密"的数据**(两步,缺一不可):
  1. 把**原密钥**预置进 `vrcn-key` 卷(否则会用新密钥解不开旧数据):
     ```bash
     docker volume create vrcnotifier_vrcn-key
     docker run --rm --entrypoint sh \
       -v /path/to/your/master_key:/src_key:ro \
       -v vrcnotifier_vrcn-key:/data \
       sihenglu/vrcnotifier-backend:latest -c 'tr -d "[:space:]" < /src_key > /data/vrcnotifier_master_key; chmod 600 /data/vrcnotifier_master_key'
     ```
     (`vrcn-keygen` 检测到卷内已有密钥会跳过生成,从而沿用你的原密钥。)
  2. 把数据卷指回你的旧数据目录:在 `docker-compose.yml` 的 `vrcnotifier-backend.volumes` 中把 `vrcn-data:/app/data` 换成 `./<你的数据目录>:/app/data`(文件里已有该注释行)。
  3. `docker compose up -d`。

## 本地联调 / 自带密钥(可选)

`docker-compose.test.yml` 是"自带密钥文件"的联调版(`secrets: file: ./secrets/master_key`,单容器;面板 8090 / 本机调试 127.0.0.1:3001):

```bash
cp <你的主密钥> secrets/master_key
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.test.yml down
```

## 重新构建镜像

```bash
# 单镜像(依赖为纯 JS, 直接 COPY 本地 node_modules; 如需从零 npm install, 见 Dockerfile 注释)
docker build -t sihenglu/vrcnotifier-backend:latest .
# 推送(本机出网需走代理 http://127.0.0.1:7897)
docker login -u sihenglu
docker push sihenglu/vrcnotifier-backend:latest
```

## 安全

- 应用以非 root(`node`)用户运行;数据目录 `/app/data` 由 entrypoint 修正属主。
- 主密钥不落 yaml、不落 host 文件;仅存在于命名卷 `vrcn-key`,经 `/run/secrets/...` 路径 + entrypoint(root 读)注入进程。
- `vrcn-keygen` 为 `network_mode: none`、`restart: no`,一次性生成后即退出。
- 对外只有面板 + API 这一个端口(默认 `3000`,`API_PORT` 可覆盖);API 仍需访问令牌(除 `/api/config`、`/api/access/verify` 白名单外全部校验)。

## 常用排查

```bash
docker compose ps
docker compose logs -f vrcnotifier-backend
curl http://127.0.0.1:3000/api/config          # -> {"ok":true,...} 无需令牌
curl http://127.0.0.1:3000/                    # -> 面板 index.html
docker compose logs vrcnotifier-backend | grep 访问令牌
```
