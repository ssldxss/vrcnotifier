---
uid: a5621cae
id: vrcnotifier.server.logs.filter
parent: vrcnotifier.server.logs
name: {zh: "日志筛选谓词", en: "Log Filter Predicates"}
description:
  zh: >
      判断某一行日志是不是你选中的级别和类别。
      
  en: >
      Decides whether a log line matches the levels and categories you selected.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.802Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
source:
  - path: "src/server.js"
    line: 21
    end_line: 32
apis:
  - protocol: rpc
    path: "logLineMatches(line, levelSel, catSel)"
    description:
      zh: >
          按选中的等级与分类集合匹配日志行。
          
      en: >
          Match a log line against the selected levels and categories.
          
  - protocol: rpc
    path: "parseLogSel(q)"
    description:
      zh: >
          解析筛选参数：省略即不过滤，空串即不匹配任何行。
          
      en: >
          Parse a filter query: omitted means no filter, empty means match nothing.
          
---
