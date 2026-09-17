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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.902Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
