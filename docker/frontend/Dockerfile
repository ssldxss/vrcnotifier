# syntax=docker/dockerfile:1
# vrcnotifier 前端镜像: nginx 托管 public/ 静态页面 + 反向代理 /api 到后端(同源, 免 CORS)。
# 后端地址通过 BACKEND_HOST / BACKEND_PORT 注入, 由官方 nginx 镜像的
# /docker-entrypoint.d/20-envsubst-on-templates.sh 自动渲染 /etc/nginx/templates/*.template。
# 构建(上下文为仓库根目录): docker build -f docker/frontend/Dockerfile -t vrcnotifier-frontend .
FROM nginx:1.27-alpine

# 静态资源(单页应用: index.html + sdk.js)。Google 字体由浏览器直连, 无需在此托管。
COPY public/ /usr/share/nginx/html/

# 站点配置模板 → 渲染为 /etc/nginx/conf.d/default.conf
COPY docker/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

# 后端地址(可被 compose 覆盖), 默认匹配一键 compose 的服务名 vrcnotifier-backend
ENV BACKEND_HOST=vrcnotifier-backend \
    BACKEND_PORT=3000

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:80/"]
