---
uid: b1efba8a
id: vrcnotifier.infra.avatar.store
parent: vrcnotifier.infra.avatar
name: {zh: "下载与原子落盘", en: "Download & Atomic Store"}
description:
  zh: >
      下载头像，并安全地写进磁盘。
      
  en: >
      Downloads an avatar and writes it to disk safely.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.870Z"
fingerprint: 9c82f0c327f3c92532f71d77be46f8fd3d1af9de54ad3726e629b785579a9c08
source:
  - path: "src/avatar.js"
    line: 89
    end_line: 147
apis:
  - protocol: rpc
    path: "createAvatarCache(opts)"
    description:
      zh: >
          在指定目录上创建头像缓存。
          
      en: >
          Create the avatar cache over a directory.
          
  - protocol: rpc
    path: "ensure(key)"
    description:
      zh: >
          确保本地有该图，同一 key 最多下载一次。
          
      en: >
          Ensure the image is cached locally, downloading at most once per key.
          
  - protocol: rpc
    path: "cached(key)"
    description:
      zh: >
          可读时返回缓存路径，否则 null。
          
      en: >
          Return the cached path when readable, else null.
          
  - protocol: rpc
    path: "touchPath(fullPath)"
    description:
      zh: >
          刷新缓存文件的修改时间以续期。
          
      en: >
          Refresh a cache file's modification time to extend its TTL.
          
  - protocol: file
    path: "data/avatars/{key}"
    description:
      zh: >
          按缓存 key 命名的单个头像图片。
          
      en: >
          One cached avatar image, named by cache key.
          
deps:
  - kind: call
    to: vrcnotifier.infra.avatar.naming
    label: {zh: "推导下载地址", en: "Derive download URL"}
---
