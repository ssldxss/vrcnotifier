---
uid: 3e182cf1
id: vrcnotifier.app.frontend-server
parent: vrcnotifier.app
name: {zh: "前端静态服务器", en: "Frontend Static Server"}
description:
  zh: >
      独立前端进程（node serve.js）：用原生 http 托管 public/ 目录，内含 MIME 表、目录穿越防护（normalize 后必须落在根目录内）与 no-cache 策略，便于把前端与后端分开部署。
      
  en: >
      Standalone frontend process (node serve.js): serves public/ over plain http with a MIME table, directory-traversal protection (the normalized path must stay inside the root) and no-cache headers, so the UI can be deployed separately from the backend.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:19.896Z"
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
