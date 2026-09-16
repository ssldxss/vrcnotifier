---
uid: 0a8765c0
id: vrcnotifier.web.app.monitor-toolbar
parent: vrcnotifier.web.app
name: {zh: "工具栏动作与聚光", en: "Toolbar Actions & Spotlight"}
description:
  zh: >
      名册周边的细小交互：刷新按钮调用手动对账端点并如实反馈结果，而不是假装成功；工具栏提示按定时淡出。聚光效果跟随指针，柔和地高亮指针所在的好友行，使密集列表更易读，而无需增加边框或悬停框。
      
  en: >
      The small interactions around the roster: the refresh button calls the manual snapshot endpoint and reports what actually happened rather than pretending success, and toolbar messages fade on a timer. The spotlight follows the pointer to gently highlight whichever friend row is under it, which makes a dense list easier to read without adding borders or hover boxes.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1366
    end_line: 1431
apis:
  - protocol: rpc
    path: "triggerSnapshot()"
    description:
      zh: >
          触发手动对账并反馈结果。
          
      en: >
          Trigger a manual reconciliation and report the outcome.
          
  - protocol: rpc
    path: "opMsgFlash(text)"
    description:
      zh: >
          短暂闪现一条工具栏提示。
          
      en: >
          Flash a transient toolbar message.
          
  - protocol: rpc
    path: "tickSpotlight()"
    description:
      zh: >
          跟随指针，为所在行做柔和聚光。
          
      en: >
          Follow the pointer to softly spotlight the row under it.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "触发对账", en: "Trigger a snapshot"}
  - kind: call
    to: vrcnotifier.web.app.presence-motion
    label: {zh: "带动效刷新", en: "Refresh with motion"}
---
