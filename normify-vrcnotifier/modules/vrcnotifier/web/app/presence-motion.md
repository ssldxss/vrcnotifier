---
uid: 0684af05
id: vrcnotifier.web.app.presence-motion
parent: vrcnotifier.web.app
name: {zh: "上下线差分动画", en: "Presence Diff Animation"}
description:
  zh: >
      针对实时在线状态更新的纯客户端差分。刷新时把新数据与当前 DOM 对比：更换分组的行飞过去，没换组的行只把状态文案翻动；整个过程压在一个很短的合并窗口内，使一串事件只产生一次动画而不是频闪。绝不整表重渲染，滚动位置与折叠状态因此保持稳定。
      
  en: >
      Purely client-side diffing for realtime presence updates. A refresh compares the incoming data against what is currently in the DOM, flies the rows that changed group and rolls the status text of rows that did not, all inside a short coalescing window so a burst of events produces one animation instead of a strobe. Nothing is re-rendered wholesale, keeping scroll position and collapsed groups stable.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1258
    end_line: 1331
apis:
  - protocol: rpc
    path: "captureRowsState()"
    description:
      zh: >
          刷新前捕获名册的视觉状态。
          
      en: >
          Capture the roster's visual state before a refresh.
          
  - protocol: rpc
    path: "rollStateText(row, newHtml, newTxt, oldHtml, oldTxt)"
    description:
      zh: >
          把状态单元格从旧文本滚到新文本。
          
      en: >
          Roll a status cell from old text to new text.
          
  - protocol: rpc
    path: "refreshFriendsWithMotion()"
    description:
      zh: >
          把新数据与 DOM 对比，仅为变化项做动画。
          
      en: >
          Diff the fresh data against the DOM and animate only what changed.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.groups
    label: {zh: "读取已渲染行", en: "Read the rendered rows"}
---
