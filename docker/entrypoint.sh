#!/bin/sh
# vrcnotifier 容器入口(root 运行, PID 1):
# 1) 保证数据目录存在且归 node 用户(覆盖宿主机目录绑定挂载的属主问题)
# 2) 降权到 node 用户后交棒 bootstrap(拉源码 → 装依赖 → 启动后端+前端)
set -e
mkdir -p /app/data/logs /app/data/avatars
chown -R node:node /app 2>/dev/null || true
# Docker secrets 目录(./secrets 绑定挂载): 首次启动时容器会把自动生成的主密钥写回这里 → 落宿主机,
# 之后 compose 的 secrets 声明即可把它作为真正的 Docker Secret 挂载; 未挂载时不存在, 密钥兜底存数据卷
if [ -d /secrets ]; then chown -R node:node /secrets 2>/dev/null || true; fi
# HOME 指向 /app: 降权后 node 用户的 npm 缓存/git 配置落在自己可写的目录(否则落到 root 的 /root)
export HOME=/app
exec setpriv --reuid=node --regid=node --init-groups /usr/local/bin/vrcn-bootstrap
