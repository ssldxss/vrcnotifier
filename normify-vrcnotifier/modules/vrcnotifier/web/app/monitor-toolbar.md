---
uid: 0a8765c0
id: vrcnotifier.web.app.monitor-toolbar
parent: vrcnotifier.web.app
name: {zh: "工具栏动作与聚光", en: "Toolbar Actions & Spotlight"}
description:
  zh: >
      刷新按钮和搜索框，以及鼠标划过时高亮所在的那一行。
      
  en: >
      The refresh button and search box, plus a soft highlight on the row your pointer is over.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.923Z"
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
          手动触发核对并反馈结果。
          
      en: >
          Trigger a manual check and report the outcome.
          
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
    label: {zh: "触发核对", en: "Trigger a snapshot"}
  - kind: call
    to: vrcnotifier.web.app.presence-motion
    label: {zh: "带动效刷新", en: "Refresh with motion"}
---
