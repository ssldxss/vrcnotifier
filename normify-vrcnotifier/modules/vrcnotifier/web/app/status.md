---
uid: d93370e3
id: vrcnotifier.web.app.status
parent: vrcnotifier.web.app
name: {zh: "状态徽章", en: "Status Badges"}
description:
  zh: >
      面板顶部那排状态徽章。
      
  en: >
      The status badges along the top of the panel.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.928Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1517
    end_line: 1608
apis:
  - protocol: rpc
    path: "renderStatus(d)"
    description:
      zh: >
          把聚合状态渲染到概览条。
          
      en: >
          Render the aggregate status payload into the overview.
          
  - protocol: rpc
    path: "renderQqStatus(info)"
    description:
      zh: >
          由机器人状态渲染 QQ 徽章。
          
      en: >
          Render the QQ bot badge from its status.
          
  - protocol: rpc
    path: "applyVrcStatus(badge, d)"
    description:
      zh: >
          把 VRChat 服务状态应用到徽章，含降级详情。
          
      en: >
          Apply a VRChat service status to a badge, including degraded detail.
          
  - protocol: rpc
    path: "latencyClass(ms)"
    description:
      zh: >
          按快慢给延迟值着色。
          
      en: >
          Colour a latency value by threshold.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "拉取探针结果", en: "Fetch probe results"}
---
