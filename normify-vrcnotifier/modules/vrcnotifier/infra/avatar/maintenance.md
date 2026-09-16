---
uid: 26166ece
id: vrcnotifier.infra.avatar.maintenance
parent: vrcnotifier.infra.avatar
name: {zh: "缓存清理与淘汰", en: "Cache Sweeping & Eviction"}
description:
  zh: >
      让缓存不会无限增长，用修改时间同时充当 TTL 时钟与访问新鲜度。文件数上限只在下载之后检查，且先做一次目录列举即短路，因此昂贵的逐项 stat 排序只在真正超限时才发生。清空时保留目录本身而不是删除它，避免在途下载因目录短暂不存在而无法创建临时文件。
      
  en: >
      Keeping the cache from growing without bound, using modification time as both the TTL clock and the access recency. The count cap is checked only after a download and short-circuits on a plain directory listing, so the expensive stat-and-sort path runs only when the cap is exceeded. Clearing keeps the directory itself in place rather than removing it, avoiding a window where in-flight downloads could not create temporary files.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
