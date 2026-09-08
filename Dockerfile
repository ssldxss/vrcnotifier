# syntax=docker/dockerfile:1
# vrcnotifier 生产镜像: 后端 API + 前端静态同源托管(SERVE_STATIC=1), 单容器开箱即用。
# 构建: docker build -t vrcnotifier .

# ---------- 依赖构建阶段 ----------
# 依赖为纯 JS(express/ws, 无原生模块), 直接复用本地已安装的 node_modules,
# 避免构建容器内 `npm ci` 依赖外网/代理。若需从零安装: 移除 `COPY node_modules` 行并改回 `RUN npm ci --omit=dev`。
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY node_modules ./node_modules

# ---------- 运行阶段 ----------
# alpine 基础镜像(依赖为纯 JS, 无原生模块): 比 bookworm-slim 小约 26%
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_STATIC=1 \
    TZ=Asia/Shanghai
WORKDIR /app
# tzdata: 让 TZ 生效, 日志/通知时间使用本地时区
# setpriv: entrypoint 降权到 node 用户运行主进程(alpine 需单独安装, debian 内置)
RUN apk add --no-cache tzdata setpriv
# COPY 带 --chown 直接落到 node 属主, 避免 chown -R 触发整层复制
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node package.json serve.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/vrcnotifier-entrypoint.sh
RUN mkdir -p /app/data \
 && chown node:node /app/data
# 数据目录: vrcnotifier.db / avatars/ / logs/vrcnotifier.log
VOLUME ["/app/data"]
EXPOSE 3000
# 存活探针: /api/config 在 token 白名单内, 无需鉴权
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/vrcnotifier-entrypoint.sh"]
CMD ["node", "src/index.js"]
