---
uid: "4e394416"
id: vrcnotifier.vrc.api
parent: vrcnotifier.vrc
name: {zh: "VRChat REST 客户端", en: "VRChat REST Client"}
description:
  zh: >
      调 VRChat 官方接口的客户端。
      
  en: >
      The client that calls VRChat's official API.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.290Z"
fingerprint: 41550317630bd0c2e6ca7b19edbe553bad6fd8b8e48ed4f731379e1a8333b2ec
source:
  - path: "src/vrcapi.js"
deps:
  - kind: call
    to: vrcnotifier.vrc.cookiejar
    label: {zh: "读登录凭据", en: "Reads login credentials"}
---
