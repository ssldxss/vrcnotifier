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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.906Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
