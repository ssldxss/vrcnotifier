---
uid: 4ef4505e
id: vrcnotifier.infra.logging.file-segments
parent: vrcnotifier.infra.logging
name: {zh: "分段文件日志", en: "Segmented File Log"}
description:
  zh: >
      分段文件日志，其序号是文件名与段内行偏移的纯函数。行的身份因此跨重启稳定、对段淘汰免疫，且文件里不需要嵌入任何编号，文本保持干净。启动必定新开一段，段满按字节或行数滚动，段数超过上限时删掉最老的段——因此滚动过程从不改写或重命名文件。
      
  en: >
      Segmented file logging where the sequence number is a pure function of the filename and the line offset inside it. Line identity therefore survives restarts, is immune to segment eviction, and needs nothing embedded in the file, so the text stays clean. Startup always opens a new segment, a segment rolls on size or line count, and the oldest segment is deleted past the cap, so rotation never rewrites or renames a file.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
fingerprint: 332fa6faeab819a79e7c3ed0c5e6120783ceeee315e1eeca6fc75daf3bc1eaf8
source:
  - path: "src/filelog.js"
    line: 1
    end_line: 280
apis:
  - protocol: rpc
    path: "createFileLog(opts)"
    description:
      zh: >
          打开日志目录并开启新段。
      en: >
          Open the log directory and start a fresh segment.
  - protocol: rpc
    path: "append(text)"
    description:
      zh: >
          追加一行并返回推导出的序号。
      en: >
          Append a line and return its derived sequence number.
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
  - protocol: rpc
    path: "lastSeq()"
    description:
      zh: >
          已写入的最大序号。
      en: >
          The highest sequence number written so far.
  - protocol: file
    path: "data/logs/vrcnotifier-<utc>.log"
    description:
      zh: >
          以 UTC 创建时间命名的单个日志段文件。
      en: >
          One segment file named by its UTC creation time.
---
