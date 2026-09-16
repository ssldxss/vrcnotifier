---
uid: 09b03ca6
id: vrcnotifier.web.app.boot.entrance
parent: vrcnotifier.web.app.boot
name: {zh: "头像预热与入场", en: "Avatar Prewarm & Entrance"}
description:
  zh: >
      面板出现前的最后一步，存在的意义就是让过渡不显得断裂。它会等待真正会出现在首屏的图片，只统计视口内且不处于折叠分组中的行，并有固定预算，使一个慢头像拖不住整个启动；随后浮层淡出的同时主界面在下方重放入场动画。
      
  en: >
      The last step before the panel appears, which exists purely so the transition never looks broken. It waits for the images that will actually be visible in the first screen, counting only rows in the viewport that are not inside a collapsed group, with a fixed budget so one slow avatar cannot hold the whole boot; the overlay then fades while the main view replays its entrance underneath.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 636
    end_line: 654
  - path: "public/app.js"
    line: 908
    end_line: 956
apis:
  - protocol: rpc
    path: "waitImages(imgs, ms, onTick)"
    description:
      zh: >
          在预算内等待首屏头像，并上报进度。
          
      en: >
          Wait for the first-screen avatars within a budget, reporting progress.
          
  - protocol: rpc
    path: "replayPageEntrance()"
    description:
      zh: >
          浮层淡出后重放主界面入场动画。
          
      en: >
          Replay the main view entrance animation after the overlay fades.
          
  - protocol: rpc
    path: "rollSwap(el, text, force)"
    description:
      zh: >
          把文本元素从旧内容滚到新内容。
          
      en: >
          Roll a text element from old to new content.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.roster
    label: {zh: "找首屏头像", en: "Find first-screen avatars"}
---
