---
uid: afebcc8d
id: vrcnotifier.web.app.favorite-flip
parent: vrcnotifier.web.app
name: {zh: "特别关注动画", en: "Favorite Animation"}
description:
  zh: >
      点特别关注时，那一行会平滑地飞过去，而不是一下子跳过去。
  en: >
      When you mark a favorite, that row glides to its new place instead of jumping.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:37.674Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1143
    end_line: 1256
apis:
  - protocol: rpc
    path: "captureRowRects()"
    description:
      zh: >
          重排前捕获各行矩形。
          
      en: >
          Capture row rectangles before a reorder.
          
  - protocol: rpc
    path: "playRowFlip(oldRects, movedId, rowOpts)"
    description:
      zh: >
          把移动过的行从旧位置动画到新位置。
          
      en: >
          Animate moved rows from their old positions to their new ones.
          
  - protocol: rpc
    path: "expandGroupFor(f)"
    description:
      zh: >
          展开包含该好友的分组以便展示。
          
      en: >
          Expand the group containing a friend so it can be shown.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.groups
    label: {zh: "重排分组", en: "Reorder the groups"}
---
