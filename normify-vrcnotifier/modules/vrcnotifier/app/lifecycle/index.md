---
uid: "84744e73"
id: vrcnotifier.app.lifecycle
parent: vrcnotifier.app
name: {zh: "进程生命周期", en: "Process Lifecycle"}
description:
  zh: >
      main() 的启动、运行与退出三段：密钥解析与解密自检（密钥不符就清库重启）、启动 HTTP 监听与 QQ/自动登录恢复，以及 SIGINT/SIGTERM 下的优雅关闭（停监控、停定时器、推停止通知、关库）。
  en: >
      The start, run and stop phases of main(): master-key resolution and decryptability self-check (wipe and restart on key mismatch), starting the HTTP listener plus QQ and auto-login recovery, and graceful shutdown on SIGINT/SIGTERM (stop monitor, stop timers, send shutdown notice, close database).
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:35:00Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
---
