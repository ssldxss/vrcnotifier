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
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:20:59.991Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
