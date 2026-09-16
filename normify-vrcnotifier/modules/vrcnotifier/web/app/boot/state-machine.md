---
uid: 2d707324
id: vrcnotifier.web.app.boot.state-machine
parent: vrcnotifier.web.app.boot
name: {zh: "启动状态机", en: "Boot State Machine"}
description:
  zh: >
      浮层由服务端的语义阶段驱动，而不是客户端自己的请求序列，因为密码直登与 2FA 的请求序列不同，绑请求会让显示错位。它刻意不着急：一行只有在完成标记已置、已停留满最短时间、且（对好友拉取行）百分比已追平后才转绿。任何错误都会立即收起浮层。
      
  en: >
      The overlay is driven by semantic stages from the server rather than the client's own request sequence, because the password and 2FA paths issue different requests and binding to them would misalign the display. It is deliberately unhurried: a row turns green only when its mark is set, it has been visible for a minimum dwell time, and for the friend-fetch row the percentage has caught up. Any error dismisses the overlay immediately.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 606
    end_line: 634
  - path: "public/app.js"
    line: 657
    end_line: 802
  - path: "public/app.js"
    line: 862
    end_line: 906
  - path: "public/app.js"
    line: 957
    end_line: 967
apis:
  - protocol: rpc
    path: "bootShow()"
    description:
      zh: >
          显示等待页并重置全部进度状态。
          
      en: >
          Reveal the overlay and reset all progress state.
          
  - protocol: rpc
    path: "bootTick()"
    description:
      zh: >
          推进行：完成标记、最短停留与百分比追平。
          
      en: >
          Advance rows: a completed mark, a minimum dwell time and a matched percentage.
          
  - protocol: rpc
    path: "bootProgress(d)"
    description:
      zh: >
          消费来自 SSE 的语义进度阶段。
          
      en: >
          Consume a semantic progress stage from the SSE stream.
          
  - protocol: rpc
    path: "bootDone()"
    description:
      zh: >
          等待数据与首屏头像，然后收尾并重放入场。
          
      en: >
          Wait for data plus first-screen avatars, then finish and replay the entrance.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.boot.percent-odometer
    from_api: "rpc:bootProgress(d)"
    to_api: "rpc:bootPercent(fetched, total)"
    label: {zh: "驱动百分比", en: "Drive the percentage"}
  - kind: call
    to: vrcnotifier.web.app.boot.halo
    from_api: "rpc:bootDone()"
    to_api: "rpc:bootHalo(i, mode)"
    label: {zh: "收尾光环", en: "Settle the halo"}
  - kind: call
    to: vrcnotifier.web.app.boot.entrance
    from_api: "rpc:bootDone()"
    to_api: "rpc:waitImages(imgs, ms, onTick)"
    label: {zh: "等待并重放入场", en: "Wait and replay entrance"}
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "响应接口失败", en: "React to API failures"}
---
