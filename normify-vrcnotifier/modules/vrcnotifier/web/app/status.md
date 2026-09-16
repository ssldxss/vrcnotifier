---
uid: d93370e3
id: vrcnotifier.web.app.status
parent: vrcnotifier.web.app
name: {zh: "状态徽章", en: "Status Badges"}
description:
  zh: >
      常驻概览条及其中的徽章。状态经事件流到达而非轮询，因此后端一看到变化，面板就跟着变。服务状态渲染为徽章，悬停可看到受影响组件列表；延迟按阈值着色，使 API 在恶化为故障之前就能被看出来。
      
  en: >
      The always-visible overview strip and the badges inside it. Status arrives over the event stream rather than by polling, so the panel reflects a change as soon as the backend sees it. Service status is rendered as a badge with the affected component list available on hover, and latency is coloured by threshold so a degrading API is visible before it becomes an outage.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
          按阈值给延迟值着色。
          
      en: >
          Colour a latency value by threshold.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "拉取探针结果", en: "Fetch probe results"}
---
