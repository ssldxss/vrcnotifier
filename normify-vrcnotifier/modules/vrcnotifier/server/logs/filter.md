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
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:19.394Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
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
