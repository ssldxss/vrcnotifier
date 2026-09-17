---
uid: 541a68bb
id: vrcnotifier.server.logs.query
parent: vrcnotifier.server.logs
name: {zh: "日志查询端点", en: "Log Query Endpoint"}
description:
  zh: >
      按三种方式取日志：最新的、某条之后的、某条之前的历史。
      
  en: >
      Fetches logs in three ways: the newest lines, everything after a given line, or older history.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.679Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 1005
    end_line: 1042
apis:
  - protocol: http
    method: GET
    path: "/api/logs"
    description:
      zh: >
          按 tail、after=seq（SSE 补缺口）或 before=seq（向前翻页）查询日志，服务端筛选并加星号。
          
      en: >
          Query logs by tail, by seq after (SSE gap fill) or by seq before, with server-side filtering and token masking.
          
deps:
  - kind: call
    to: vrcnotifier.server.logs.filter
    label: {zh: "匹配日志行", en: "Match log lines"}
  - kind: call
    to: vrcnotifier.infra.logging.file-segments.read
    label: {zh: "从段文件读历史", en: "Read history from segments"}
  - kind: call
    to: vrcnotifier.infra.logging.memory-stream
    label: {zh: "回退内存环", en: "Fall back to the ring buffer"}
  - kind: call
    to: vrcnotifier.server.serialization
    label: {zh: "发出的令牌加星号", en: "Mask tokens on egress"}
---
