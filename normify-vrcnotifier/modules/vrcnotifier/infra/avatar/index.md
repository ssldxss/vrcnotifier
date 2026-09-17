---
uid: 55aea68a
id: vrcnotifier.infra.avatar
parent: vrcnotifier.infra
name: {zh: "头像缓存", en: "Avatar Cache"}
description:
  zh: >
      好友头像下载一次就存在本地，下次直接给。
      
  en: >
      Downloads a friend's avatar once, keeps it locally, and serves it from there.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:21:00.007Z"
fingerprint: 9c82f0c327f3c92532f71d77be46f8fd3d1af9de54ad3726e629b785579a9c08
source:
  - path: "src/avatar.js"
deps:
  - kind: call
    to: vrcnotifier.infra.avatar.naming
    label: {zh: "URL 与 key 规则", en: "URL and key rules"}
  - kind: call
    to: vrcnotifier.infra.avatar.store
    label: {zh: "下载与落盘", en: "Download and store"}
  - kind: call
    to: vrcnotifier.infra.avatar.maintenance
    label: {zh: "清理与淘汰", en: "Sweep and evict"}
---
