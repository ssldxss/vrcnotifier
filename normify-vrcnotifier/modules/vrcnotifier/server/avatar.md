---
uid: e3791a4f
id: vrcnotifier.server.avatar
parent: vrcnotifier.server
name: {zh: "头像缓存服务", en: "Avatar Serving"}
description:
  zh: >
      把好友头像下载下来存在本地再发给面板，免得每次都去 VRChat 取。
      
  en: >
      Downloads friend avatars once, keeps them locally, and serves them to the panel instead of fetching every time.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.283Z"
fingerprint: 0b01f6faa64e00266c421863adc31d67ecfabe46ed5db86e0fd44a724e285305
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
    label: {zh: "按需下载并续期", en: "Ensure and touch cached files"}
  - kind: call
    to: vrcnotifier.infra.avatar.naming
    label: {zh: "推断图片类型", en: "Detect the image type"}
---
