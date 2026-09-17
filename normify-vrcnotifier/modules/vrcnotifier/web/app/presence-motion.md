---
uid: 0684af05
id: vrcnotifier.web.app.presence-motion
parent: vrcnotifier.web.app
name: {zh: "上下线动画", en: "Online/Offline Animation"}
description:
  zh: >
      有人上下线时，只让变化的那几行动起来。
      
  en: >
      When someone comes online or goes offline, only the rows that changed animate.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.304Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1258
    end_line: 1331
apis:
  - protocol: rpc
    path: "captureRowsState()"
    description:
      zh: >
          刷新前捕获名册的视觉状态。
          
      en: >
          Capture the roster's visual state before a refresh.
          
  - protocol: rpc
    path: "rollStateText(row, newHtml, newTxt, oldHtml, oldTxt)"
    description:
      zh: >
          把状态单元格从旧文本滚到新文本。
          
      en: >
          Roll a status cell from old text to new text.
          
  - protocol: rpc
    path: "refreshFriendsWithMotion()"
    description:
      zh: >
          把新数据与 DOM 对比，仅为变化项做动画。
          
      en: >
          Diff the fresh data against the DOM and animate only what changed.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.groups
    label: {zh: "读取已渲染行", en: "Read the rendered rows"}
---
