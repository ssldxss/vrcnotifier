---
uid: afebcc8d
id: vrcnotifier.web.app.favorite-flip
parent: vrcnotifier.web.app
name: {zh: "特别关注 FLIP 动画", en: "Favorite Toggle FLIP Animation"}
description:
  zh: >
      切换特别关注时的 FLIP 动画。它不是重渲染后让行瞬移到另一个分组，而是先捕获旧矩形、更新 DOM，再把每个移动过的行从旧位置动画到新位置——分组标题与组体也在内，因此整块一起滑动。这正是“标为特别关注”让人感觉行真的移了过去，而不是页面跳了一下。
      
  en: >
      A FLIP animation for toggling favorite. Rather than re-rendering and letting the row teleport between groups, the old rectangles are captured, the DOM is updated, and every row that moved is animated from its previous position to its new one — including the group header and the group body, so the whole block slides together. This is what makes marking a favorite feel like the row physically moves rather than the page jumping.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
