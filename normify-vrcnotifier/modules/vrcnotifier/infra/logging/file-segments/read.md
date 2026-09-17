---
uid: df73087e
id: vrcnotifier.infra.logging.file-segments.read
parent: vrcnotifier.infra.logging.file-segments
name: {zh: "日志翻页读取", en: "Paging Through Logs"}
description:
  zh: >
      往前翻或往后翻，只挑出符合筛选条件的行。
      
  en: >
      Pages forwards or backwards, returning only the lines that match the filter.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.263Z"
fingerprint: 332fa6faeab819a79e7c3ed0c5e6120783ceeee315e1eeca6fc75daf3bc1eaf8
source:
  - path: "src/filelog.js"
    line: 237
    end_line: 264
apis:
  - protocol: rpc
    path: "readBackFiltered(beforeSeq, limit, match)"
    description:
      zh: >
          读取某序号之前最近的匹配行。
          
      en: >
          Read the newest matching lines before a sequence number.
          
  - protocol: rpc
    path: "readAfter(afterSeq, limit, match)"
    description:
      zh: >
          读取某序号之后的匹配行。
          
      en: >
          Read matching lines after a sequence number.
          
deps:
  - kind: call
    to: vrcnotifier.infra.logging.file-segments.cursor
    label: {zh: "定位日志位置", en: "Resolve cursor positions"}
---
