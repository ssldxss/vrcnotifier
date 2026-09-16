---
uid: "09570252"
id: vrcnotifier.web.app.bootstrap
parent: vrcnotifier.web.app
name: {zh: "启动引导与地址发现", en: "Bootstrap & Address Discovery"}
description:
  zh: >
      启动与地址发现。加载时先从 sessionStorage 同步恢复上次视图与页签，使首帧就是正确的屏幕；随后探测后端：一体化部署时同源优先，其次是已存地址，最后是本地默认值。此步失败并不致命——会显示连接门禁让用户手填地址。
      
  en: >
      Startup and address discovery. On load it synchronously restores the last view and tab from session storage so the first frame is already the right screen, then probes for a backend: same origin wins for the single-process deployment, otherwise the stored address, otherwise the local default. A failure here is not fatal — the connection gate is shown so the user can type an address instead.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
