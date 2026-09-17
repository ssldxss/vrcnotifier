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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.289Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
