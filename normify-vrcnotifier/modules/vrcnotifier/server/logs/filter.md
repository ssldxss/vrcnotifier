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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.899Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
