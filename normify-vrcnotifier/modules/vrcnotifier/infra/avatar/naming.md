---
uid: 82213d5c
id: vrcnotifier.infra.avatar.naming
parent: vrcnotifier.infra.avatar
name: {zh: "头像文件命名", en: "File Naming"}
description:
  zh: >
      从头像地址推出本地文件名，反过来也能推回去。
      
  en: >
      Turns an avatar address into a local filename, and back again.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.259Z"
fingerprint: 9c82f0c327f3c92532f71d77be46f8fd3d1af9de54ad3726e629b785579a9c08
source:
  - path: "src/avatar.js"
    line: 22
    end_line: 87
apis:
  - protocol: rpc
    path: "toThumbUrl(url, size)"
    description:
      zh: >
          把任意 VRChat 头像 URL 归一为指定尺寸的缩略图 URL。
          
      en: >
          Normalize any VRChat avatar URL to a thumbnail URL at the requested size.
          
  - protocol: rpc
    path: "thumbKeyFromUrl(url, size)"
    description:
      zh: >
          由缩略图 URL 推导缓存 key。
          
      en: >
          Derive the cache key from a thumbnail URL.
          
  - protocol: rpc
    path: "urlFromKey(key)"
    description:
      zh: >
          由缓存 key 反推上游下载地址，形状不对则返回 null。
          
      en: >
          Rebuild the upstream download URL from a cache key, or null if malformed.
          
  - protocol: rpc
    path: "detectImageType(filePath)"
    description:
      zh: >
          按魔数推断图片类型。
          
      en: >
          Detect the image type from magic bytes.
          
---
