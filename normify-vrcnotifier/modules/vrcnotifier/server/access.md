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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:59:42.576Z"
fingerprint: e5c1fac4c7d5710c916cfdaa1c8d26838639422ea3a597b32f6790a2b30d8674
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
          前端引导配置，无需令牌。同时报出本构建的版本号（镜像构建时注入的 APP_VERSION，否则用 package.json）。
          
      en: >
          Bootstrap configuration for the UI; no token required. Reports the build version (APP_VERSION injected at image build time, else package.json).
          
  - protocol: http
    method: POST
    path: "/api/access/verify"
    description:
      zh: >
          检查前端提交的访问令牌，这个接口本身不需要令牌。
          
      en: >
          Verify a submitted access key; no token required.
          
deps:
  - kind: call
    to: vrcnotifier.infra.util.version
    from_api: "GET /api/config"
    to_api: "rpc:currentVersion(env)"
    label: {zh: "取版本号", en: "Read the build version"}
---
