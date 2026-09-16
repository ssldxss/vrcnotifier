---
uid: f032edb2
id: vrcnotifier.server.static
parent: vrcnotifier.server
name: {zh: "前端静态托管", en: "Static UI Hosting"}
description:
  zh: >
      可选的一体化部署模式：提供 publicDir 时后端同时托管面板静态资源。它注册在未知 API 404 之后，因此永远不会遮蔽 API 路由。
      
  en: >
      Optional single-process deployment mode: when publicDir is provided the backend also serves the panel's static assets. It is registered after the unknown-API 404 so it can never shadow an API route.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 1065
    end_line: 1067
apis:
  - protocol: http
    method: GET
    path: "/{path}"
    description:
      zh: >
          在配置了 publicDir 时托管前端静态资源。
          
      en: >
          Serve the built frontend from publicDir when configured.
          
deps:
  - kind: dataflow
    to: vrcnotifier.web.shell
    label: {zh: "托管面板", en: "Serve the panel"}
---
