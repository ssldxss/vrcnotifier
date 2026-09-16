---
uid: 541a68bb
id: vrcnotifier.server.logs.query
parent: vrcnotifier.server.logs
name: {zh: "日志查询端点", en: "Log Query Endpoint"}
description:
  zh: >
      GET /api/logs 有三种形态：before=seq&limit 从分段日志文件向前翻历史，并继续扫描直到凑满一页匹配行；after=seq 补 SSE 断线缺口，优先读文件而非内存环形缓冲；tail=N 返回最新若干行，游标取文件水位，使重启后内存流为空时也能正确作答。所有出站行均打码。
      
  en: >
      GET /api/logs has three shapes: before=seq&limit reads older history from the segmented log file and keeps scanning until a full page of matching lines is collected; after=seq fills the gap left by an SSE reconnect, preferring the file over the in-memory ring; and tail=N returns the newest lines using the file watermark as cursor so a restarted process with an empty memory stream still answers correctly. Every outbound line is token-masked.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
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
          按 tail、after=seq（SSE 补缺口）或 before=seq（向前翻页）查询日志，服务端筛选并打码。
          
      en: >
          Query logs by tail, by seq after (SSE gap fill) or by seq before, with server-side filtering and token masking.
          
deps:
  - kind: call
    to: vrcnotifier.server.logs.filter
    from_api: "GET /api/logs"
    to_api: "rpc:logLineMatches(line, levelSel, catSel)"
    label: {zh: "匹配日志行", en: "Match log lines"}
  - kind: call
    to: vrcnotifier.infra.logging.file-segments
    from_api: "GET /api/logs"
    to_api: "rpc:readBackFiltered(beforeSeq, limit, match)"
    label: {zh: "从段文件读历史", en: "Read history from segments"}
  - kind: call
    to: vrcnotifier.infra.logging.memory-stream
    from_api: "GET /api/logs"
    to_api: "rpc:after(afterSeq, limit)"
    label: {zh: "回退内存环", en: "Fall back to the ring buffer"}
  - kind: call
    to: vrcnotifier.server.serialization
    from_api: "GET /api/logs"
    to_api: "rpc:maskOut(line)"
    label: {zh: "出站令牌打码", en: "Mask tokens on egress"}
---
