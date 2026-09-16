---
uid: 55aea68a
id: vrcnotifier.infra.avatar
parent: vrcnotifier.infra
name: {zh: "头像缓存", en: "Avatar Cache"}
description:
  zh: >
      头像缓存，其核心想法是“文件系统即索引”：文件存在即命中，其修改时间即最后访问时间，无需建表。它只回答本地有没有、要不要去上游取；发字节是 HTTP 层的事。
      
  en: >
      The avatar cache, whose guiding idea is that the filesystem is the index: a file existing means a cache hit, its modification time is the last access time, and no table is needed. It answers only whether an image is local and whether to fetch it; sending bytes is the HTTP layer's job.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
