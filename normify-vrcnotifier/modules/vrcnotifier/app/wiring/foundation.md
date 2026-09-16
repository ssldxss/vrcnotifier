---
uid: 8f94e7e4
id: vrcnotifier.app.wiring.foundation
parent: vrcnotifier.app.wiring
name: {zh: "基础服务装配", en: "Foundation Service Wiring"}
description:
  zh: >
      创建存储与横切基础设施并注入给后续模块：SQLite 仓储（带可选加密）、内存日志流并接管全局、多段文件日志（可选）、头像缓存目录与定时清理、事件总线 EventEmitter、会话表与运行参数对象。
      
  en: >
      Creates storage and cross-cutting infrastructure for later modules: the SQLite repository (with optional encryption), the in-memory log stream installed globally, the optional segmented file log, the avatar cache directory with its sweep timer, the event bus, the session map and the runtime parameter object.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
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
    from_api: "rpc:createDb(dbPath, {crypto})"
    to_api: "rpc:createDb(location, opts)"
    label: {zh: "打开仓储", en: "Open the repository"}
  - kind: call
    to: vrcnotifier.infra.logging.memory-stream
    from_api: "rpc:openLogStream({capacity})"
    to_api: "rpc:createLogStream({capacity})"
    label: {zh: "接管日志流", en: "Install the log stream"}
  - kind: call
    to: vrcnotifier.infra.logging.file-segments
    from_api: "rpc:openLogStream({capacity})"
    to_api: "rpc:createFileLog(opts)"
    label: {zh: "开启文件日志", en: "Open file logging"}
  - kind: call
    to: vrcnotifier.infra.avatar.store
    from_api: "rpc:createAvatarCache({dir})"
    to_api: "rpc:createAvatarCache(opts)"
    label: {zh: "建立头像缓存", en: "Create the avatar cache"}
---
