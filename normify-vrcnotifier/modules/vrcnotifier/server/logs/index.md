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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.900Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
