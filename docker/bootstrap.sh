#!/bin/sh
# vrcnotifier 启动引导(node 用户运行, 实际 PID 1)。
# 每次启动固定流程:
#   1) [可选] 配置 git 凭据(VRCN_TOKEN 只经 askpass 传给 git, 不进 argv / remote URL / 日志)
#   2) 清空旧代码, 从 GitHub 拉取最新源码(HTTPS)
#   3) 记录版本(git commit 哈希 → 环境变量 + /app/.vrcn-version + 启动日志)
#   4) npm ci 安装依赖
#   5) 同容器启动后端 API(默认 3000) 与前端页面(默认 8080)
#   6) 任一进程退出或被信号终止 → 收掉另一个, 交由 restart 策略接管
set -eu

REPO="${VRCN_REPO:-https://github.com/ssldxss/vrcnotifier.git}"
BRANCH="${VRCN_BRANCH:-main}"
APPDIR="${VRCN_APPDIR:-/app/vrcnotifier}"
API_PORT="${PORT:-3000}"
UI_PORT="${FRONTEND_PORT:-8080}"
VERSION_FILE="${VRCN_VERSION_FILE:-/app/.vrcn-version}"
log() { printf '[vrcn-bootstrap] %s\n' "$*"; }

# ---------- 1) 可选 git 凭据: Docker Secret 优先, 环境变量兜底; token 只经 askpass 传给 git, 不进 argv / remote URL / 日志 ----------
GIT_TOKEN_FILE="${VRCN_GIT_TOKEN_FILE:-/run/secrets/vrcnotifier_git_token}"
cleanup_askpass() { rm -f /tmp/.vrcn-askpass 2>/dev/null || true; }
if [ -r "$GIT_TOKEN_FILE" ] && [ -s "$GIT_TOKEN_FILE" ]; then
  VRCN_TOKEN="$(tr -d '[:space:]' < "$GIT_TOKEN_FILE")"
  export VRCN_TOKEN
  log "GitHub 认证: 使用 Docker Secret ($GIT_TOKEN_FILE)"
elif [ -n "${VRCN_TOKEN:-}" ]; then
  log "GitHub 认证: 使用 VRCN_TOKEN 环境变量"
fi
if [ -n "${VRCN_TOKEN:-}" ]; then
  cat > /tmp/.vrcn-askpass <<'EOF'
#!/bin/sh
case "$1" in
  *Username*) printf 'x-access-token' ;;
  *Password*) printf '%s' "$VRCN_TOKEN" ;;
esac
EOF
  chmod 700 /tmp/.vrcn-askpass
  export GIT_ASKPASS=/tmp/.vrcn-askpass SSH_ASKPASS=/tmp/.vrcn-askpass
fi
export GIT_TERMINAL_PROMPT=0   # 凭据缺失/错误时立即失败, 不挂起等交互输入
trap cleanup_askpass EXIT

# ---------- 2) 每次启动全新拉取(镜像不带源码, 旧代码先清空, 保证与仓库一致) ----------
rm -rf "$APPDIR"
log "拉取源码: $REPO @ $BRANCH"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$APPDIR"
[ -f "$APPDIR/package.json" ] || { log "错误: 拉取结果缺少 package.json, 请检查 VRCN_REPO / VRCN_BRANCH"; exit 1; }

# ---------- 3) 版本信息: git commit 哈希(判断容器当前运行的是哪个提交) ----------
COMMIT=$(git -C "$APPDIR" rev-parse HEAD)
COMMIT_SHORT=$(git -C "$APPDIR" rev-parse --short=12 HEAD)
COMMIT_DATE=$(git -C "$APPDIR" log -1 --format=%ci)
COMMIT_SUBJECT=$(git -C "$APPDIR" log -1 --format=%s)
export VRCN_REPO="$REPO" VRCN_BRANCH="$BRANCH" \
       VRCN_COMMIT="$COMMIT" VRCN_COMMIT_SHORT="$COMMIT_SHORT" \
       VRCN_COMMIT_DATE="$COMMIT_DATE" VRCN_COMMIT_SUBJECT="$COMMIT_SUBJECT"
VRCN_VERSION_FILE="$VERSION_FILE" node -e '
const fs = require("node:fs");
const v = {
  repo: process.env.VRCN_REPO,
  branch: process.env.VRCN_BRANCH,
  commit: process.env.VRCN_COMMIT,
  commitShort: process.env.VRCN_COMMIT_SHORT,
  commitDate: process.env.VRCN_COMMIT_DATE,
  commitSubject: process.env.VRCN_COMMIT_SUBJECT,
  node: process.version,
  fetchedAt: new Date().toISOString()
};
fs.writeFileSync(process.env.VRCN_VERSION_FILE || "/app/.vrcn-version", JSON.stringify(v, null, 2) + "\n");
'
log "代码版本: $BRANCH @ $COMMIT_SHORT — $COMMIT_SUBJECT ($COMMIT_DATE)"
log "版本信息: $VERSION_FILE (后端亦提供 GET /api/version)"

# ---------- 4) 安装依赖 ----------
cd "$APPDIR"
log "安装依赖: npm ci --omit=dev"
npm ci --omit=dev --no-audit --no-fund

# ---------- 5) 同容器启动后端 + 前端 ----------
BACKEND_PID=""
FRONTEND_PID=""
shutdown_children() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap 'shutdown_children; exit 143' INT TERM

log "启动后端 API: http://0.0.0.0:$API_PORT"
PORT="$API_PORT" node src/index.js &
BACKEND_PID=$!
log "启动前端页面: http://0.0.0.0:$UI_PORT"
FRONTEND_PORT="$UI_PORT" node serve.js &
FRONTEND_PID=$!

# ---------- 6) 任一子进程退出 → 收掉另一个, 以其退出码结束 ----------
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1 &
  wait "$!" 2>/dev/null || true
done
log "检测到子进程退出, 正在停止..."
shutdown_children
wait "$BACKEND_PID" 2>/dev/null; BRC=$?
wait "$FRONTEND_PID" 2>/dev/null; FRC=$?
# 退出码: 后端(核心进程)异常优先上报, 否则取前端的
[ "$BRC" -ne 0 ] && exit "$BRC"
exit "$FRC"
