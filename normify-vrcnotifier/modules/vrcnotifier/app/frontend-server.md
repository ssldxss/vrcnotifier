---
uid: 3e182cf1
id: vrcnotifier.app.frontend-server
parent: vrcnotifier.app
name: {zh: "前端静态服务器", en: "Frontend Static Server"}
description:
  zh: >
      一个只负责发网页文件的小服务，用来把面板单独部署到别的地方。
      
  en: >
      A tiny server that only serves the web page files, so the panel can be hosted somewhere else.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.856Z"
fingerprint: 97c5daf044998b542d836057ca5ee6bc159147b7285f2cc3adeb78ade24ea129
source:
  - path: "serve.js"
    line: 25
    end_line: 60
apis:
  - protocol: rpc
    path: "createFrontendServer({root, logger})"
    description:
      zh: >
          创建托管 public/ 的静态服务器。
          
      en: >
          Create the static server hosting public/.
          
  - protocol: http
    method: GET
    path: "/"
    description:
      zh: >
          返回前端首页 index.html。
          
      en: >
          Serve the index.html entry page.
          
  - protocol: http
    method: GET
    path: "/{file}"
    description:
      zh: >
          按扩展名返回静态资源，越界路径返回 403。
          
      en: >
          Serve a static asset by extension; out-of-root paths get 403.
          
deps:
  - kind: dataflow
    to: vrcnotifier.web.shell
    label: {zh: "托管面板静态资源", en: "Serves the panel assets"}
---
