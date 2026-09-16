---
uid: 1500b213
id: vrcnotifier.server.logs
parent: vrcnotifier.server
name: {zh: "后端日志接口", en: "Backend Log API"}
description:
  zh: >
      面板的后端日志访问：服务端等级/分类筛选，以及三种取数形态的分页查询端点。
      
  en: >
      Backend log access for the panel: server-side level/category filtering and the paged query endpoint with its three fetch shapes.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
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
