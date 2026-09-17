---
uid: 30031ebc
id: vrcnotifier.web.app.shell.tabs
parent: vrcnotifier.web.app.shell
name: {zh: "页签导航", en: "Tab Navigation"}
description:
  zh: >
      「好友监控」与「设置」两个页签的切换。
      
  en: >
      Switching between the friends tab and the settings tab.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.306Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 2007
    end_line: 2078
apis:
  - protocol: rpc
    path: "switchTab(name, opts)"
    description:
      zh: >
          切换页签，带卡片级联入场与滑动指示块。
          
      en: >
          Switch tabs with staggered card entrance and a sliding indicator.
          
  - protocol: rpc
    path: "moveTabIndicator()"
    description:
      zh: >
          定位页签指示块，仅在可见时测量。
          
      en: >
          Position the tab indicator, measuring only when visible.
          
  - protocol: rpc
    path: "saveLastTab(name)"
    description:
      zh: >
          持久化当前页签，使刷新后回到原处。
          
      en: >
          Persist the active tab so a reload returns to it.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.groups
    label: {zh: "展示好友页", en: "Show the roster page"}
---
