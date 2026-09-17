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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.857Z"
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
