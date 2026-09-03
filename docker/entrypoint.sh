#!/bin/sh
# 数据目录可写性: 绑定挂载(./data)时修复属主, 再降权到 node 用户运行
set -e
mkdir -p /app/data/logs /app/data/avatars
chown -R node:node /app/data 2>/dev/null || true
# Docker Secret 主密钥: 应用以 node 用户运行, 无权读取 600(root:root) 的 secret 文件。
# 由 root(entrypoint) 读取并注入 MASTER_KEY 环境变量, node 进程经 resolveMasterKey 的 env 分支使用(与直接读文件等价)。
if [ -f /run/secrets/vrcnotifier_master_key ] && [ -z "${MASTER_KEY:-}" ]; then
    _mk="$(tr -d '[:space:]' < /run/secrets/vrcnotifier_master_key 2>/dev/null)" || _mk=""
    [ -n "$_mk" ] && export MASTER_KEY="$_mk"
    unset _mk
fi
exec setpriv --reuid=node --regid=node --init-groups "$@"
