---
uid: dd4b874c
id: vrcnotifier.web.vrclinks
parent: vrcnotifier.web
name: {zh: "VRChat 跳转链接", en: "VRChat Links"}
description:
  zh: >
      点头像或世界名，就能跳到 VRChat 对应的页面。
      
  en: >
      Clicking an avatar or world name opens the matching VRChat page.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.312Z"
fingerprint: a50676b3f8998f22f106c1546f8905fd885241ea1be36f87ef3bcee0f90a696d
source:
  - path: "public/vrclinks.js"
    line: 1
    end_line: 71
apis:
  - protocol: rpc
    path: "userUrl(id)"
    description:
      zh: >
          构造用户主页 URL，id 不合法则 null。
          
      en: >
          Build a user profile URL, or null for an invalid id.
          
  - protocol: rpc
    path: "worldUrl(id)"
    description:
      zh: >
          构造世界页 URL，哨兵或不合法 id 则 null。
          
      en: >
          Build a world page URL, or null for a sentinel or invalid id.
          
  - protocol: rpc
    path: "linkHtml(kind, id, text)"
    description:
      zh: >
          为用户或世界渲染转义后的可点文本。
          
      en: >
          Render escaped, clickable text for a user or world.
          
  - protocol: rpc
    path: "wrapHtml(kind, id, innerHtml)"
    description:
      zh: >
          把已安全的 HTML 包一层可点区域。
          
      en: >
          Wrap already-safe HTML in a clickable region.
          
---
