---
uid: "09570252"
id: vrcnotifier.web.app.bootstrap
parent: vrcnotifier.web.app
name: {zh: "启动引导与地址发现", en: "Bootstrap & Address Discovery"}
description:
  zh: >
      打开页面时先恢复上次的画面，并找到后端地址。
      
  en: >
      On opening the page it restores the screen you were on last, and finds the backend address.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.920Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1
    end_line: 71
  - path: "public/app.js"
    line: 2350
    end_line: 2367
apis:
  - protocol: rpc
    path: "discoverBase()"
    description:
      zh: >
          发现后端地址，同源优先。
          
      en: >
          Discover the backend base URL, same-origin first.
          
  - protocol: rpc
    path: "splitBase(base)"
    description:
      zh: >
          把已存地址拆成协议/主机/端口三段。
          
      en: >
          Split a stored base URL into scheme, host and port fields.
          
  - protocol: rpc
    path: "saveConnection()"
    description:
      zh: >
          持久化当前连接设置。
          
      en: >
          Persist the current connection settings.
          
  - protocol: rpc
    path: "restoreLastView()"
    description:
      zh: >
          首帧前同步恢复上次视图与页签。
          
      en: >
          Synchronously restore the last view and tab before first paint.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    label: {zh: "探测后端", en: "Probe the backend"}
---
