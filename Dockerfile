# syntax=docker/dockerfile:1
# vrcnotifier 生产镜像: 后端 API + 前端静态同源托管(SERVE_STATIC=1), 单容器开箱即用。
# 构建: docker build -t vrcnotifier .

# ---------- 依赖构建阶段 ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- 运行阶段 ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    SERVE_STATIC=1 \
    TZ=Asia/Shanghai
WORKDIR /app
# tzdata: 让 TZ 生效, 日志/通知时间使用本地时区
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY package.json serve.js ./
COPY src ./src
COPY public ./public
COPY docker/entrypoint.sh /usr/local/bin/vrcnotifier-entrypoint.sh
RUN chmod +x /usr/local/bin/vrcnotifier-entrypoint.sh \
 && mkdir -p /app/data \
 && chown -R node:node /app
# 数据目录: vrcnotifier.db / avatars/ / logs/vrcnotifier.log
VOLUME ["/app/data"]
EXPOSE 3000
# 存活探针: /api/config 在 token 白名单内, 无需鉴权
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/vrcnotifier-entrypoint.sh"]
CMD ["node", "src/index.js"]
