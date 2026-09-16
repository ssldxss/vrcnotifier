---
uid: 82213d5c
id: vrcnotifier.infra.avatar.naming
parent: vrcnotifier.infra.avatar
name: {zh: "缩略图 URL 与 key 规则", en: "Thumbnail URL & Key Rules"}
description:
  zh: >
      让缓存 key、下载地址与磁盘文件名三者保持一致的命名规则。VRChat 返回的头像有原图与缩略图两种形态、尺寸也随它；本模块把两种形态都改写成统一尺寸的规范缩略图 URL，使同一头像不会以不同名字被缓存两次。缓存文件没有扩展名，因此发送时按魔数还原图片类型。
      
  en: >
      The naming rules that keep cache key, download URL and disk filename in agreement. VRChat returns avatars as either a full file or a thumbnail and at whatever size it likes; both shapes are rewritten into one canonical thumbnail URL at a fixed size, so the same avatar is never cached twice under different names. Cached files carry no extension, so the image type is recovered from magic bytes when serving.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
