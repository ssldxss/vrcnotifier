---
uid: 8f94e7e4
id: vrcnotifier.app.wiring.foundation
parent: vrcnotifier.app.wiring
name: {zh: "基础服务组装", en: "Foundation Service Assembly"}
description:
  zh: >
      准备底层设施：打开数据库、接管日志、建立头像缓存。
      
  en: >
      Sets up the basics: opens the database, takes over logging, and creates the avatar cache.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:23:01.491Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 74
    end_line: 102
apis:
  - protocol: rpc
    path: "createDb(dbPath, {crypto})"
    description:
      zh: >
          打开仓储并启用可选加密。
          
      en: >
          Open the repository with optional encryption.
          
  - protocol: rpc
    path: "openLogStream({capacity})"
    description:
      zh: >
          建立内存环形日志流并接管全局。
          
      en: >
          Create and globally install the in-memory ring log stream.
          
  - protocol: rpc
    path: "createAvatarCache({dir})"
    description:
      zh: >
          建立头像磁盘缓存。
          
      en: >
          Create the on-disk avatar cache.
          
deps:
  - kind: call
    to: vrcnotifier.data.schema
    label: {zh: "打开仓储", en: "Open the repository"}
  - kind: call
    to: vrcnotifier.infra.logging.memory-stream
    label: {zh: "接管日志流", en: "Install the log stream"}
  - kind: call
    to: vrcnotifier.infra.logging.file-segments.opening
    label: {zh: "开启文件日志", en: "Open file logging"}
  - kind: call
    to: vrcnotifier.infra.avatar.store
    label: {zh: "建立头像缓存", en: "Create the avatar cache"}
---
