---
uid: 2d707324
id: vrcnotifier.web.app.boot.state-machine
parent: vrcnotifier.web.app.boot
name: {zh: "等待页节奏", en: "Waiting Screen Timing"}
description:
  zh: >
      等待页的节奏：哪一行什么时候亮，什么时候收起来。
      
  en: >
      The waiting screen's timing: when each line lights up, and when the screen goes away.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.687Z"
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
          接收 SSE 传来的进度阶段。
          
      en: >
          Consume a semantic progress stage from the SSE stream.
          
  - protocol: rpc
    path: "bootDone()"
    description:
      zh: >
          等待数据与首屏头像，然后收尾并重放入场。
          
      en: >
          Wait for data plus first-screen avatars, then finish and replay the entrance.
          
  - protocol: rpc
    path: "bootHide(immediate)"
    description:
      zh: >
          立即收起等待页，任何接口或登录错误都会调它。
          
      en: >
          Dismiss the overlay immediately, used on any API or login error.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.boot.percent-odometer
    label: {zh: "驱动百分比", en: "Drive the percentage"}
  - kind: call
    to: vrcnotifier.web.app.boot.halo
    label: {zh: "收尾光环", en: "Settle the halo"}
  - kind: call
    to: vrcnotifier.web.app.boot.entrance
    label: {zh: "等待并重放入场", en: "Wait and replay entrance"}
---
