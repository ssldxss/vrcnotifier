---
uid: 1500b213
id: vrcnotifier.server.logs
parent: vrcnotifier.server
name: {zh: "后端日志接口", en: "Backend Log API"}
description:
  zh: >
      面板里的日志窗口：能按级别和类别筛选，也能往回翻历史。
      
  en: >
      The log window in the panel: filter by level and category, and scroll back through history.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.801Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
source:
  - path: "src/server.js"
deps:
  - kind: call
    to: vrcnotifier.server.logs.filter
    label: {zh: "筛选谓词", en: "Filter predicates"}
  - kind: call
    to: vrcnotifier.server.logs.query
    label: {zh: "查询端点", en: "Query endpoint"}
---
