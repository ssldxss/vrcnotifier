---
uid: 0f23bb1e
id: vrcnotifier.web.app.dropdown
parent: vrcnotifier.web.app
name: {zh: "自定义下拉与筛选持久化", en: "Custom Dropdown & Filter Persistence"}
description:
  zh: >
      自定义多选下拉：隐藏原生元素但保留其为唯一事实来源，因此周边代码读写仍是普通 select，而用户看到的是带动画的玻璃拟态菜单。它支持键盘导航并在点击外部时关闭；日志筛选选择会持久化，使刷新不会悄悄重置用户对日志的视图。
      
  en: >
      A custom multi-select dropdown that hides the native element but keeps it as the source of truth, so the surrounding code still reads and writes a plain select while the user sees an animated glass menu. It supports keyboard navigation and closes on outside click, and the log filter selection is persisted so a reload does not silently reset the user's view of the logs.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.746Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 2159
    end_line: 2306
apis:
  - protocol: rpc
    path: "makeDropdown(sel, opts)"
    description:
      zh: >
          把原生 select 升级为带键盘导航的玻璃拟态菜单。
      en: >
          Upgrade a native select into a glass menu with keyboard navigation.
  - protocol: rpc
    path: "saveLogFilter()"
    description:
      zh: >
          持久化日志筛选选择。
      en: >
          Persist the log filter selection.
---
