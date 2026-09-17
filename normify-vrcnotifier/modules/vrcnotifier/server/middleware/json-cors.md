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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.286Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
