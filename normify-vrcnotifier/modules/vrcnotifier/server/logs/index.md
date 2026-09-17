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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.285Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
