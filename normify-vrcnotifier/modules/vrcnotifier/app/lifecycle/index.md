---
uid: "84744e73"
id: vrcnotifier.app.lifecycle
parent: vrcnotifier.app
name: {zh: "进程生命周期", en: "Process Lifecycle"}
description:
  zh: >
      程序的开始与结束：开机自检、启动各项服务，以及收到退出信号时收拾干净。
      
  en: >
      The program's beginning and end: start-up checks, launching the services, and tidying up when asked to quit.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:20:59.988Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
deps:
  - kind: call
    to: vrcnotifier.app.config
    label: {zh: "读配置", en: "Reads the config"}
  - kind: call
    to: vrcnotifier.app.wiring
    label: {zh: "组装各部件", en: "Builds the parts"}
---
