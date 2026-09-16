---
uid: ee71a574
id: vrcnotifier.server.status
parent: vrcnotifier.server
name: {zh: "状态与遥测路由", en: "Status & Telemetry Routes"}
description:
  zh: >
      状态与遥测路由：statusPayload 汇总登录态、打码后的当前用户、活跃账号、WS 连接与最后消息时间、QQ 状态、上次快照时间、待验证 2FA 数与延迟配置，并复用为 SSE status 事件；/api/health、/api/ws-stats、/api/vrc-status 暴露三个探针，未启用时回 503。
      
  en: >
      Status and telemetry routes: statusPayload aggregates login state, masked current user, active accounts, WS connection and last message time, QQ status, last snapshot time, pending-2FA count and the timing configuration, and is reused as the SSE status event; /api/health, /api/ws-stats and /api/vrc-status expose the three probes and answer 503 when the probe is not wired.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 561
    end_line: 585
  - path: "src/server.js"
    line: 956
    end_line: 986
apis:
  - protocol: rpc
    path: "statusPayload()"
    description:
      zh: >
          /api/status 与 SSE status 事件共用的聚合状态。
          
      en: >
          Aggregate status payload shared by /api/status and the SSE status event.
          
  - protocol: http
    method: GET
    path: "/api/status"
    description:
      zh: >
          统一状态负载，不校验登录。
          
      en: >
          Unified status payload; no login check.
          
  - protocol: http
    method: GET
    path: "/api/health"
    description:
      zh: >
          最近一轮 VRChat API 健康探测结果。
          
      en: >
          Latest VRChat API health probe result.
          
  - protocol: http
    method: GET
    path: "/api/ws-stats"
    description:
      zh: >
          最近 60 秒每秒 WS 消息数。
          
      en: >
          Per-second WS message counts for the last 60 seconds.
          
  - protocol: http
    method: GET
    path: "/api/vrc-status"
    description:
      zh: >
          来自 status.vrchat.com 的 VRChat 服务状态。
          
      en: >
          VRChat service status from status.vrchat.com.
          
deps:
  - kind: call
    to: vrcnotifier.monitor.session
    from_api: "rpc:statusPayload()"
    to_api: "rpc:activeUsers()"
    label: {zh: "列出活跃账号", en: "List active accounts"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.control
    from_api: "rpc:statusPayload()"
    to_api: "rpc:status(userId)"
    label: {zh: "读取 WS 状态", en: "Read WS status"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    from_api: "rpc:statusPayload()"
    to_api: "rpc:status(dbId)"
    label: {zh: "读取 QQ 状态", en: "Read QQ status"}
  - kind: call
    to: vrcnotifier.vrc.health
    from_api: "GET /api/health"
    to_api: "rpc:sample()"
    label: {zh: "读取健康采样", en: "Read health sample"}
  - kind: call
    to: vrcnotifier.vrc.status
    from_api: "GET /api/vrc-status"
    to_api: "rpc:status()"
    label: {zh: "读取服务状态", en: "Read service status"}
---
