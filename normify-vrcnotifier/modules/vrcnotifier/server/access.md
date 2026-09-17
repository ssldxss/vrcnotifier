---
uid: bdbed052
id: vrcnotifier.server.access
parent: vrcnotifier.server
name: {zh: "引导配置与访问验证", en: "Bootstrap Config & Access Verification"}
description:
  zh: >
      两个不用令牌就能访问的接口：读基础配置、检查令牌对不对。
      
  en: >
      Two endpoints reachable without a token: read the basic config, and check whether a token is correct.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.280Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
source:
  - path: "src/server.js"
    line: 659
    end_line: 679
apis:
  - protocol: http
    method: GET
    path: "/api/config"
    description:
      zh: >
          前端引导配置，无需令牌。
          
      en: >
          Bootstrap configuration for the UI; no token required.
          
  - protocol: http
    method: POST
    path: "/api/access/verify"
    description:
      zh: >
          检查前端提交的访问令牌，这个接口本身不需要令牌。
          
      en: >
          Verify a submitted access key; no token required.
          
---
