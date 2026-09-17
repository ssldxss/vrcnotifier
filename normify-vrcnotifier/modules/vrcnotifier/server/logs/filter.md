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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.284Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
