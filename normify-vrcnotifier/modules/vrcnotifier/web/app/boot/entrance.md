---
uid: 09b03ca6
id: vrcnotifier.web.app.boot.entrance
parent: vrcnotifier.web.app.boot
name: {zh: "首屏等待与入场", en: "First Screen & Entrance"}
description:
  zh: >
      等首屏头像加载完，然后让主界面重新「入场」一次。
      
  en: >
      Waits for the first screen's avatars, then replays the main screen's entrance once.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.918Z"
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
          
---
