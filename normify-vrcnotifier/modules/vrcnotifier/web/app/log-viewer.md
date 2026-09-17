---
uid: cd6a83fe
id: vrcnotifier.web.app.log-viewer
parent: vrcnotifier.web.app
name: {zh: "后端日志面板", en: "Backend Log Panel"}
description:
  zh: >
      日志面板：着色、筛选、往回翻历史。
      
  en: >
      The log panel: colouring, filtering, and scrolling back through history.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.923Z"
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
