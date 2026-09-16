---
uid: cd6a83fe
id: vrcnotifier.web.app.log-viewer
parent: vrcnotifier.web.app
name: {zh: "后端日志面板", en: "Backend Log Panel"}
description:
  zh: >
      后端日志面板。日志行被解析为时间、级别、分类与正文，以便级别着色、分类打徽章；两个多选下拉驱动服务端筛选，因此连客户端从未缓存过的历史也能翻出来。滚到顶部时向后翻页，裁剪策略在保持 DOM 有界的同时保留用户真正在读的内容。
      
  en: >
      The backend log panel. Lines are parsed into time, level, category and body so levels can be coloured and categories badged, and a pair of multi-select dropdowns drives a server-side filter that keeps working even for history the client has never cached. Scrolling to the top pages backwards through the file, and the trimming policy keeps the DOM bounded while preserving what the user is reading.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 138
    end_line: 326
apis:
  - protocol: rpc
    path: "parseLogLine(line)"
    description:
      zh: >
          把原始日志行解析为级别、分类与正文。
          
      en: >
          Parse a raw log line into level, category and body.
          
  - protocol: rpc
    path: "renderLogRow(div, line)"
    description:
      zh: >
          构建带级别着色与分类徽章的 DOM 行。
          
      en: >
          Build a DOM row with level colouring and a category badge.
          
  - protocol: rpc
    path: "loadBackendLogs(opts)"
    description:
      zh: >
          按服务端筛选加载尾部/更新/更旧的分页。
          
      en: >
          Load tail, newer or older pages with the server-side filter.
          
  - protocol: rpc
    path: "replaceLogLine(seq, line)"
    description:
      zh: >
          按序号就地更新被重写的行。
          
      en: >
          Update a row in place by sequence number after a masking rewrite.
          
deps:
  - kind: call
    to: vrcnotifier.web.logview
    label: {zh: "裁剪日志窗口", en: "Trim the log window"}
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "拉取日志分页", en: "Fetch log pages"}
  - kind: call
    to: vrcnotifier.web.app.dropdown
    label: {zh: "筛选下拉", en: "Filter dropdowns"}
---
