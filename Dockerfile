# syntax=docker/dockerfile:1
# vrcnotifier 运行时容器: 镜像只带运行环境(Node 22 + git), 不含任何应用源码。
# 每次启动: 从 GitHub 拉取最新代码 → 安装依赖 → 同时启动后端 API(3000) 与前端页面(8080)。
# 构建: docker build -t vrcnotifier .
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=3000 \
    FRONTEND_PORT=8080 \
    VRCN_REPO=https://github.com/ssldxss/vrcnotifier.git \
    VRCN_BRANCH=main \
    VRCN_APPDIR=/app/vrcnotifier
# git: 启动时拉取源码(HTTPS); ca-certificates: HTTPS 证书校验(git clone / npm / 运行时 fetch 都需要); tzdata: 让 TZ 生效
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
# 只注入两个启动引导脚本(非应用源码): entrypoint(root→降权) + bootstrap(拉码→装依赖→起双进程)
COPY docker/entrypoint.sh /usr/local/bin/vrcn-entrypoint
COPY docker/bootstrap.sh /usr/local/bin/vrcn-bootstrap
RUN chmod +x /usr/local/bin/vrcn-entrypoint /usr/local/bin/vrcn-bootstrap \
 && mkdir -p /app/data/logs /app/data/avatars \
 && chown -R node:node /app
# 数据目录: vrcnotifier.db / avatars/ / logs/vrcnotifier.log
# 源码位于 /app/vrcnotifier, 每次启动清空重建, 不需要卷
VOLUME ["/app/data"]
EXPOSE 3000 8080
# 健康检查: /api/config 在 token 白名单内, 无需鉴权; start-period 覆盖首次 clone + npm ci
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/vrcn-entrypoint"]
