---
uid: dd4b874c
id: vrcnotifier.web.vrclinks
parent: vrcnotifier.web
name: {zh: "VRChat 外链构造", en: "VRChat Deep Links"}
description:
  zh: >
      为头像、昵称与世界名构造 VRChat 深链。标识来自服务端，因此写入属性前一律经严格白名单校验；不合法者退化为已转义的纯文本，而不是生成一个坏链。链接刻意用 span 加委托点击而非 a 元素：a 会获取焦点，而获得焦点的好友行会因 focus-within 样式一直保持高亮。
      
  en: >
      Builds the VRChat deep links for avatars, nicknames and world names. Identifiers arrive from the server, so each is validated against a strict whitelist before being placed in an attribute; anything that fails falls back to plain escaped text rather than emitting a broken link. Links are spans with a delegated click handler rather than anchors, deliberately: an anchor takes focus, and a focused friend row would stay highlighted through the focus-within style.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
