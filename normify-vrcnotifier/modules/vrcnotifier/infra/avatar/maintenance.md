---
uid: 26166ece
id: vrcnotifier.infra.avatar.maintenance
parent: vrcnotifier.infra.avatar
name: {zh: "缓存清理与淘汰", en: "Cache Sweeping & Eviction"}
description:
  zh: >
      定期清掉很久没用的头像；太多了就淘汰最旧的。
      
  en: >
      Cleans up avatars that have not been used for a long time, and drops the oldest when there are too many.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.870Z"
fingerprint: 9c82f0c327f3c92532f71d77be46f8fd3d1af9de54ad3726e629b785579a9c08
source:
  - path: "src/avatar.js"
    line: 149
    end_line: 211
apis:
  - protocol: rpc
    path: "sweep()"
    description:
      zh: >
          删除超过 TTL 未访问的缓存项。
          
      en: >
          Delete cache entries older than the TTL.
          
  - protocol: rpc
    path: "clear()"
    description:
      zh: >
          清空缓存目录内容，保留目录本身。
          
      en: >
          Empty the cache directory, keeping the directory itself.
          
  - protocol: rpc
    path: "enforceLimit()"
    description:
      zh: >
          超过文件数上限时按最旧淘汰。
          
      en: >
          Evict the oldest entries past the file count cap.
          
  - protocol: rpc
    path: "startTimers({intervalMs})"
    description:
      zh: >
          启动周期性清理。
          
      en: >
          Start the periodic sweep.
          
deps:
  - kind: call
    to: vrcnotifier.infra.avatar.store
    label: {zh: "操作缓存文件", en: "Operate on cached files"}
---
