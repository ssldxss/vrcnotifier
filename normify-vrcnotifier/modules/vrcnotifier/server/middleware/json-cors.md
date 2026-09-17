---
uid: e67eb961
id: vrcnotifier.server.middleware.json-cors
parent: vrcnotifier.server.middleware
name: {zh: "请求体解析与 CORS", en: "Body Parsing & CORS"}
description:
  zh: >
      解析请求内容，并允许面板从别的网址调用后端。
      
  en: >
      Parses request bodies and allows the panel to be served from another address.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.793Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
source:
  - path: "src/server.js"
    line: 631
    end_line: 640
apis:
  - protocol: rpc
    path: "jsonBody({limit})"
    description:
      zh: >
          解析最大 1MB 的 JSON 请求体。
          
      en: >
          Parse JSON bodies up to 1MB.
          
  - protocol: rpc
    path: "cors(req, res, next)"
    description:
      zh: >
          写入 CORS 头，预检直接回 204。
          
      en: >
          Set CORS headers and answer preflight with 204.
          
---
