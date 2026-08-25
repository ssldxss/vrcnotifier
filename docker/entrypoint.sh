#!/bin/sh
# vrcnotifier 容器入口(root 运行, PID 1):
# 1) 保证数据目录存在且归 node 用户(覆盖宿主机目录绑定挂载的属主问题)
# 2) 降权到 node 用户后交棒 bootstrap(拉源码 → 装依赖 → 启动后端+前端)
set -e
mkdir -p /app/data/logs /app/data/avatars
chown -R node:node /app 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups /usr/local/bin/vrcn-bootstrap
