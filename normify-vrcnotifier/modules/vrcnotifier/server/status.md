---
uid: ee71a574
id: vrcnotifier.server.status
parent: vrcnotifier.server
name: {zh: "状态与遥测路由", en: "Status & Telemetry Routes"}
description:
  zh: >
      面板顶上那排状态：在线情况、连接好不好、延迟多少，以及 VRChat 官方是否正常。
      
  en: >
      The status strip at the top of the panel: who is online, connection health, latency, and whether VRChat itself is up.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.678Z"
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
          统一的状态数据，不检查登录。
          
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
    label: {zh: "列出活跃账号", en: "List active accounts"}
  - kind: call
    to: vrcnotifier.vrc.pipeline.control
    label: {zh: "读取 WS 状态", en: "Read WS status"}
  - kind: call
    to: vrcnotifier.qq.bot.registry
    label: {zh: "读取 QQ 状态", en: "Read QQ status"}
  - kind: call
    to: vrcnotifier.vrc.health
    label: {zh: "读取健康采样", en: "Read health sample"}
  - kind: call
    to: vrcnotifier.vrc.status
    label: {zh: "读取服务状态", en: "Read service status"}
---
