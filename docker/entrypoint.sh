#!/bin/sh
# 数据目录可写性: 绑定挂载(./data)时修复属主, 再降权到 node 用户运行
set -e
mkdir -p /app/data/logs /app/data/avatars
chown -R node:node /app/data 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups "$@"
