---
uid: e3791a4f
id: vrcnotifier.server.avatar
parent: vrcnotifier.server
name: {zh: "头像缓存服务", en: "Avatar Serving"}
description:
  zh: >
      挂载在 /api/avatar 的头像服务链：未配置缓存时直接 404；否则依次是登录守卫（401）、按需 ensure(key)（编码非法 400、下载失败 502）、覆盖缓存目录的 express.static（365 天 immutable、忽略点文件使原子写临时文件不外泄、按魔数补 Content-Type、访问即刷新 mtime 续期）与兜底 404。目录穿越防护交给静态根目录。
      
  en: >
      Avatar serving chain mounted at /api/avatar: with no cache configured it 404s outright; otherwise a login guard (401), an on-demand ensure(key) step (400 on bad encoding, 502 on download failure), an express.static over the cache directory (365-day immutable, dotfiles ignored so atomic temp files never leak, Content-Type from magic bytes, mtime touched to extend TTL) and a final 404. Path traversal defence is delegated to the static root.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 855
    end_line: 894
apis:
  - protocol: http
    method: GET
    path: "/api/avatar/{key}"
    description:
      zh: >
          按需下载并返回缓存头像；未登录 401，未知 key 404。
          
      en: >
          Serve a cached avatar, downloading on demand; 401 when logged out, 404 when unknown.
          
deps:
  - kind: call
    to: vrcnotifier.infra.avatar.store
    from_api: "GET /api/avatar/{key}"
    to_api: "rpc:ensure(key)"
    label: {zh: "按需下载并续期", en: "Ensure and touch cached files"}
  - kind: call
    to: vrcnotifier.infra.avatar.naming
    from_api: "GET /api/avatar/{key}"
    to_api: "rpc:detectImageType(filePath)"
    label: {zh: "推断图片类型", en: "Detect the image type"}
---
