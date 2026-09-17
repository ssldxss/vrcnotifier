---
uid: f032edb2
id: vrcnotifier.server.static
parent: vrcnotifier.server
name: {zh: "前端静态托管", en: "Static UI Hosting"}
description:
  zh: >
      顺带把网页文件也发出去，这样前后端可以只跑在一台机器上。
      
  en: >
      Also serves the web page files, so front end and back end can share one machine.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.802Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
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
