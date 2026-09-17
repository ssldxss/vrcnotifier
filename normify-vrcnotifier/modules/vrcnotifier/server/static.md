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
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:19.394Z"
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
